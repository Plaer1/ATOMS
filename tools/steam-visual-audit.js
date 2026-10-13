#!/usr/bin/env node

/*
 * Compact visual audit for a local Steam/Millennium session.
 *
 * It auto-attaches to every CDP page/iframe, catalogs visible image/SVG/
 * gradient metadata, and prioritizes outermost unthemed CSS surfaces. It also
 * provides a topmost-element Alt-click picker with optional notes. It never
 * writes document HTML, screenshots, or network bodies.
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { installAnnotationHighlights } = require('./steam-annotation-highlights.js');
const { installAnnotationInputLock, AnnotationInputLockBridge, LOCK_BINDING } = require('./steam-annotation-input-lock.js');
let WebSocket;
try {
    WebSocket = require('ws');
} catch (_) {
    // Resolve Millennium's bundled module from the theme working directory.
    WebSocket = require(require.resolve('ws', { paths: [process.cwd()] }));
}

const CDP_ROOT = process.env.ATOMS_CDP || 'http://127.0.0.1:8080';
const reportRoot = path.join(os.homedir(), 'Library', 'Application Support', 'ATOMS', 'visual-audits');
if (!process.env.ATOMS_VISUAL_AUDIT_DIR) fs.mkdirSync(reportRoot, { recursive: true });
const sessionDir = process.env.ATOMS_VISUAL_AUDIT_DIR || fs.mkdtempSync(path.join(reportRoot, 'capture-'));
fs.mkdirSync(sessionDir, { recursive: true });
// A resumed capture appends to the existing notes. Archive its stop marker so
// companions can distinguish the current session from a previous shutdown.
const priorStopFile = path.join(sessionDir, 'stopped.json');
if (fs.existsSync(priorStopFile)) {
    fs.renameSync(priorStopFile, path.join(sessionDir, `previous-stop-${Date.now()}.json`));
}
const BINDING = '__atomsVisualAuditEmit';
const TARGET_POLL_MS = 500;
const ONLY_TARGET = process.env.ATOMS_VISUAL_AUDIT_ONLY || '';

const files = {
    events: path.join(sessionDir, 'events.jsonl'),
    assets: path.join(sessionDir, 'asset-catalog.jsonl'),
    selections: path.join(sessionDir, 'selected-assets.jsonl'),
    css: path.join(sessionDir, 'css-candidates.jsonl'),
    topLevel: path.join(sessionDir, 'top-level-unthemed.jsonl')
};
const streams = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, fs.createWriteStream(file, { flags: 'a' })]));
const limits = { events: 5000, assets: 9000, selections: 2000, css: 7000, topLevel: 5000 };
const counts = { events: 0, assets: 0, selections: 0, css: 0, topLevel: 0 };
const targets = new Map();
let stopping = false;

const sessionMetadata = {
    started: new Date().toISOString(),
    pid: process.pid,
    cdp: CDP_ROOT,
    design: [
        'auto-attaches to new CDP pages and iframes',
        'catalogs compact visible image, SVG, gradient, and CSS-surface metadata',
        'records outermost visible unthemed surfaces in top-level-unthemed.jsonl',
        'Alt-click records the exact topmost rendered element with an optional note',
        'Alt-click never changes the selected element; it only records the selection and note',
        'holding Alt freezes CSS hover and shields page input while the picker remains usable',
        'drag/drop and menu-trigger interactions are recorded compactly',
        'uses a bounded likely-surface scan, viewport sampling, and bounded added-subtree scans; no mutation-triggered full-page scans',
        'no document HTML, screenshots, or network bodies',
        'CSS candidates are capped and exclude image-backed surfaces'
    ]
};
const sessionFile = path.join(sessionDir, 'session.json');
if (fs.existsSync(sessionFile)) {
    fs.writeFileSync(path.join(sessionDir, `resumed-${Date.now()}.json`), JSON.stringify(sessionMetadata, null, 2) + '\n');
} else {
    fs.writeFileSync(sessionFile, JSON.stringify(sessionMetadata, null, 2) + '\n');
}

function write(kind, payload) {
    if (!streams[kind] || counts[kind] >= limits[kind]) return;
    counts[kind] += 1;
    streams[kind].write(JSON.stringify({ timestamp: new Date().toISOString(), ...payload }) + '\n');
}

function event(type, extra = {}) {
    write('events', { type, ...extra });
}

function getJson(url) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new Error(`HTTP ${response.statusCode}: ${url}`));
                    return;
                }
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(error);
                }
            });
        });
        request.on('error', reject);
        request.setTimeout(3000, () => request.destroy(new Error(`Timeout: ${url}`)));
    });
}

function visualAuditSource() {
    // This monitor deliberately creates one srcdoc iframe for its isolated
    // note field.  Page.addScriptToEvaluateOnNewDocument also runs in child
    // frames, so exit before that document can install another picker of its
    // own and recurse.
    if (/^about:srcdoc(?:[?#]|$)/i.test(String(location.href || ''))) return 'ignored-picker-frame';
    const KEY = '__atomsVisualAuditV5';
    const PREVIOUS_KEYS = ['__atomsVisualAuditV4', '__atomsVisualAuditV3'];
    const EMIT = '__atomsVisualAuditEmit';
    const TOGGLE_API_KEY = '__atomsThemeToggleV1';
    const TOGGLE_HOST_ID = 'atoms-theme-toggle-host';
    const PICKER_HOST_ID = 'atoms-visual-audit-host';
    const MAX_STRING = 700;
    const MAX_INLINE_SVG = 12000;
    const SCAN_BATCH_SIZE = 48;
    const SCAN_BATCH_PAUSE_MS = 24;
    const RECOVERY_SCAN_MS = 4000;
    const MAX_SURFACE_QUEUE = 2200;
    const MAX_ASSET_QUEUE = 900;
    const GRID_COLUMNS = 28;
    const GRID_ROWS = 18;
    const DRAG_EVENT_MIN_MS = 250;
    const MAX_NOTE_LENGTH = 800;
    const THEME_VARIABLES = [
        '--background', '--backgroundLightish', '--backgroundLight', '--backgroundLightest',
        '--backgroundDarkish', '--backgroundDark', '--backgroundDarkest', '--accent',
        '--accentLightish', '--accentLight', '--accentLightest', '--accentDarkish',
        '--accentDark', '--accentDarkest', '--textAccented', '--textLightish', '--textLight',
        '--textLightest', '--textDarkish', '--textDark', '--white'
    ];

    for (const previousKey of PREVIOUS_KEYS) {
        const previous = window[previousKey];
        if (previous && !previous.stopped && typeof previous.stop === 'function') previous.stop();
    }
    if (window[KEY] && !window[KEY].stopped) {
        window.__atomsAnnotationHighlightsV1?.sync();
        window[KEY].schedule('reconnected');
        return 'already-installed';
    }
    if (window[KEY] && window[KEY].stopped) delete window[KEY];

    const state = {
        stopped: false,
        observer: null,
        interval: null,
        timer: null,
        hoverFrame: null,
        scanning: false,
        reasons: new Set(),
        scanQueue: [],
        queued: new Set(),
        emitted: new Set(),
        surfaceSignatures: new WeakMap(),
        selected: new Set(),
        selectionState: new WeakMap(),
        hovered: null,
        pointer: null,
        picker: null,
        pendingNote: null,
        interactionTimes: new Map()
    };

    const trim = (value, limit = MAX_STRING) => {
        const result = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
        return result.length > limit ? `${result.slice(0, limit)}…` : result;
    };

    const hash = (value) => {
        let result = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
            result ^= value.charCodeAt(index);
            result = Math.imul(result, 16777619);
        }
        return (result >>> 0).toString(36);
    };

    const emit = (type, payload) => {
        try {
            if (typeof window[EMIT] === 'function') {
                window[EMIT](JSON.stringify({
                    type,
                    url: location.href,
                    title: document.title,
                    payload
                }));
            }
        } catch (_) {
            // A target can navigate while an audit slice is in progress.
        }
    };

    const cssEscape = (value) => {
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
        return String(value).replace(/[^A-Za-z0-9_-]/g, '\\$&');
    };

    const selectorFor = (element) => {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';
        if (element.id) return `#${cssEscape(element.id)}`;
        const classes = element.classList
            ? Array.from(element.classList).filter((name) => /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(name)).slice(0, 4)
            : [];
        return `${element.tagName.toLowerCase()}${classes.map((name) => `.${name}`).join('')}`;
    };

    const contextFor = (element) => {
        const parts = [];
        let current = element;
        while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
            parts.unshift(selectorFor(current));
            current = current.parentElement;
        }
        return parts.join(' > ');
    };

    const rectFor = (element) => {
        const rect = element.getBoundingClientRect();
        return {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        };
    };

    const visible = (element, style) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 &&
            rect.bottom >= 0 && rect.top <= innerHeight && rect.right >= 0 && rect.left <= innerWidth &&
            style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' &&
            Number(style.opacity || 1) > 0.01;
    };

    const colorsFrom = (value) => {
        const colors = [];
        const text = String(value || '');
        const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/ig;
        let match;
        while ((match = rgb.exec(text))) {
            colors.push([Number(match[1]), Number(match[2]), Number(match[3]), match[4] == null ? 1 : Number(match[4])]);
        }
        const hex = /#([0-9a-f]{3,8})\b/ig;
        while ((match = hex.exec(text))) {
            let raw = match[1];
            if (raw.length === 3 || raw.length === 4) raw = raw.split('').map((part) => part + part).join('');
            colors.push([
                parseInt(raw.slice(0, 2), 16),
                parseInt(raw.slice(2, 4), 16),
                parseInt(raw.slice(4, 6), 16),
                raw.length > 6 ? parseInt(raw.slice(6, 8), 16) / 255 : 1
            ]);
        }
        return colors;
    };

    const palette = () => {
        if (state.palette) return state.palette;
        const root = document.documentElement ? getComputedStyle(document.documentElement) : null;
        state.palette = root ? THEME_VARIABLES
            .map((name) => root.getPropertyValue(name).trim())
            .flatMap((value) => {
                const fromRgb = colorsFrom(`rgb(${value})`);
                return fromRgb.length ? fromRgb : colorsFrom(value);
            }) : [];
        state.palette.push([0, 0, 0, 1], [255, 255, 255, 1]);
        return state.palette;
    };

    const themeLike = (color) => color[3] <= 0.03 || palette().some((sample) =>
        Math.hypot(color[0] - sample[0], color[1] - sample[1], color[2] - sample[2]) <= 26
    );

    const steamBlue = (color) => !themeLike(color) && color[2] - color[0] >= 40 && color[2] - color[1] >= 25;

    const hasGradient = (value) => /(?:repeating-)?(?:linear|radial|conic)-gradient\(/i.test(String(value || ''));
    const hasImage = (value) => /(?:url|image-set)\(/i.test(String(value || ''));

    const svgMetadata = (svg, includeMarkup) => {
        const fills = new Set();
        const strokes = new Set();
        let inspected = 0;
        for (const child of svg.querySelectorAll('*')) {
            if (inspected >= 180) break;
            inspected += 1;
            const fill = child.getAttribute('fill');
            const stroke = child.getAttribute('stroke');
            if (fill && fill !== 'none') fills.add(trim(fill, 80));
            if (stroke && stroke !== 'none') strokes.add(trim(stroke, 80));
        }
        const metadata = {
            viewBox: svg.getAttribute('viewBox') || '',
            width: svg.getAttribute('width') || '',
            height: svg.getAttribute('height') || '',
            pathCount: svg.querySelectorAll('path').length,
            gradientCount: svg.querySelectorAll('linearGradient, radialGradient, conicGradient').length,
            useCount: svg.querySelectorAll('use').length,
            fillValues: Array.from(fills).slice(0, 20),
            strokeValues: Array.from(strokes).slice(0, 20)
        };
        if (includeMarkup) metadata.inlineMarkup = trim(svg.outerHTML, MAX_INLINE_SVG);
        return metadata;
    };

    const sourceFor = (element) => {
        const tag = element.tagName.toLowerCase();
        if (tag === 'img') return element.currentSrc || element.src || element.getAttribute('src') || '';
        if (tag === 'image') return element.href && element.href.baseVal || element.getAttribute('href') || '';
        if (tag === 'video') return element.currentSrc || element.src || element.poster || '';
        if (tag === 'iframe') return element.src || element.getAttribute('src') || '';
        if (tag === 'picture') {
            const image = element.querySelector('img');
            return image ? image.currentSrc || image.src || '' : '';
        }
        return '';
    };

    const assetDescriptor = (element, kind, extra = {}, includeMarkup = false) => {
        const style = getComputedStyle(element);
        const descriptor = {
            id: '',
            kind,
            tag: element.tagName.toLowerCase(),
            selector: selectorFor(element),
            context: contextFor(element),
            classes: trim(element.className && typeof element.className === 'string' ? element.className : '', 240),
            source: trim(sourceFor(element), 900),
            rect: rectFor(element),
            visible: visible(element, style),
            filter: trim(style.filter, 220),
            ...extra
        };
        if (element.tagName.toLowerCase() === 'svg') {
            descriptor.svg = svgMetadata(element, includeMarkup);
        }
        descriptor.id = hash(JSON.stringify([
            descriptor.kind, descriptor.selector, descriptor.context, descriptor.source,
            descriptor.property || '', descriptor.pseudo || ''
        ]));
        return descriptor;
    };

    const surfaceProperties = (style) => ({
        display: trim(style.display, 80),
        position: trim(style.position, 80),
        boxSizing: trim(style.boxSizing, 80),
        backgroundColor: trim(style.backgroundColor, 240),
        backgroundImage: trim(style.backgroundImage, 900),
        backgroundPosition: trim(style.backgroundPosition, 160),
        backgroundSize: trim(style.backgroundSize, 160),
        color: trim(style.color, 160),
        borderColor: trim(style.borderColor, 160),
        opacity: trim(style.opacity, 80),
        zIndex: trim(style.zIndex, 80),
        transform: trim(style.transform, 240)
    });

    const gradientDescriptors = (element, style) => {
        const descriptors = [];
        const inspect = (computed, pseudo) => {
            for (const property of ['backgroundImage', 'maskImage', 'borderImageSource']) {
                const value = computed[property];
                if (!hasGradient(value)) continue;
                descriptors.push(assetDescriptor(element, 'gradient', {
                    property,
                    pseudo,
                    source: trim(value, 1200),
                    gradientColors: colorsFrom(value).map((color) => color.slice(0, 3))
                }));
            }
        };
        inspect(style, '');
        const before = getComputedStyle(element, '::before');
        const after = getComputedStyle(element, '::after');
        if (String(before.content) !== 'none' || hasGradient(before.backgroundImage) || hasGradient(before.maskImage)) inspect(before, 'before');
        if (String(after.content) !== 'none' || hasGradient(after.backgroundImage) || hasGradient(after.maskImage)) inspect(after, 'after');
        return descriptors;
    };

    const emitOnce = (type, descriptor) => {
        const signature = `${type}:${descriptor.id}`;
        if (state.emitted.has(signature)) return;
        state.emitted.add(signature);
        emit(type, descriptor);
    };

    const inspectAsset = (element) => {
        const tag = element.tagName.toLowerCase();
        const kind = tag === 'svg' ? 'svg' : tag === 'image' ? 'svg-image' : tag;
        emitOnce('asset', assetDescriptor(element, kind));
    };

    const hasVisualAsset = (element, style) => {
        const tag = element.tagName.toLowerCase();
        if (['img', 'svg', 'image', 'video', 'canvas', 'picture', 'iframe'].includes(tag)) return true;
        if (element.closest('svg, picture')) return true;
        return hasImage(style.backgroundImage) || hasImage(style.maskImage) || hasImage(style.borderImageSource);
    };

    const unthemedColor = (color) => color[3] > 0.03 && !themeLike(color);
    const unthemedBackgroundColor = (color) => {
        if (unthemedColor(color)) return true;
        const isExtremeNeutral = (color[0] <= 5 && color[1] <= 5 && color[2] <= 5) ||
            (color[0] >= 250 && color[1] >= 250 && color[2] >= 250);
        // Treat opaque pure-black/white surfaces as candidates too. They are
        // not in ATOMS' grey ladder, while ordinary white/black text remains
        // intentionally ignored by the text-color pass below.
        return color[3] >= 0.35 && isExtremeNeutral;
    };

    const unthemedProperties = (style, element = null) => {
        const properties = [];
        const backgroundValues = [
            ['backgroundColor', style.backgroundColor],
            ['backgroundImage', style.backgroundImage]
        ];
        for (const [property, value] of backgroundValues) {
            const colors = colorsFrom(value);
            if (colors.some(unthemedBackgroundColor)) {
                properties.push({
                    property,
                    value: trim(value, 300),
                    kind: colors.some(steamBlue) ? 'steam-blue-background' : 'unthemed-background'
                });
            }
        }
        const visibleBorder = ['Top', 'Right', 'Bottom', 'Left'].some((side) =>
            Number.parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== 'none'
        );
        const visibleOutline = Number.parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== 'none';
        for (const [property, value, enabled] of [
            ['color', style.color, true],
            ['borderColor', style.borderColor, visibleBorder],
            ['outlineColor', style.outlineColor, visibleOutline],
            ['boxShadow', style.boxShadow, style.boxShadow !== 'none'],
            ['textShadow', style.textShadow, style.textShadow !== 'none'],
            ['fill', style.fill, Boolean(element && element.namespaceURI === 'http://www.w3.org/2000/svg')],
            ['stroke', style.stroke, Boolean(element && element.namespaceURI === 'http://www.w3.org/2000/svg')]
        ]) {
            if (!enabled) continue;
            const colors = colorsFrom(value);
            if (colors.some(unthemedColor)) {
                properties.push({
                    property,
                    value: trim(value, 300),
                    kind: colors.some(steamBlue) ? 'steam-blue' : 'unthemed-color'
                });
            }
        }
        if (/hue-rotate/i.test(style.filter || '')) {
            properties.push({ property: 'filter', value: trim(style.filter, 300), kind: 'hue-rotate' });
        }
        return properties;
    };

    const sameVisualValue = (left, right) => trim(left, 320).toLowerCase() === trim(right, 320).toLowerCase();

    const containsRect = (outer, inner) =>
        outer.left <= inner.left + 1 && outer.top <= inner.top + 1 &&
        outer.right >= inner.right - 1 && outer.bottom >= inner.bottom - 1;

    const depthFor = (element) => {
        let depth = 0;
        let current = element;
        while (current && current.parentElement) {
            depth += 1;
            current = current.parentElement;
        }
        return depth;
    };

    const outermostProperties = (element, properties) => {
        let remaining = properties.slice();
        const rect = element.getBoundingClientRect();
        let ancestor = element.parentElement;
        let inspected = 0;

        while (ancestor && inspected < 10 && remaining.length) {
            inspected += 1;
            try {
                const ancestorStyle = getComputedStyle(ancestor);
                const ancestorRect = ancestor.getBoundingClientRect();
                if (!visible(ancestor, ancestorStyle) || hasVisualAsset(ancestor, ancestorStyle) || !containsRect(ancestorRect, rect)) {
                    ancestor = ancestor.parentElement;
                    continue;
                }
                const ancestorProperties = unthemedProperties(ancestorStyle, ancestor);
                remaining = remaining.filter((property) => !ancestorProperties.some((ancestorProperty) =>
                    ancestorProperty.property === property.property && sameVisualValue(ancestorProperty.value, property.value)
                ));
            } catch (_) {
                // A reactive Big Picture panel can detach during this read.
            }
            ancestor = ancestor.parentElement;
        }
        return remaining;
    };

    const cssCandidate = (element, style) => {
        if (!visible(element, style) || hasVisualAsset(element, style)) return;
        const flatCss = ![
            style.backgroundImage,
            style.maskImage,
            style.borderImageSource
        ].some((value) => hasGradient(value) || hasImage(value));
        const properties = unthemedProperties(style, element);
        if (!properties.length) return;
        const topLevelProperties = outermostProperties(element, properties);
        if (!topLevelProperties.length) return;
        const rect = element.getBoundingClientRect();
        const descriptor = assetDescriptor(element, 'css-surface', {
            properties: topLevelProperties,
            // A static generator may safely consume only this explicit subset:
            // no visual asset and no gradient/image-bearing CSS layer.
            flatCss,
            topLevel: true,
            domDepth: depthFor(element),
            viewportCoverage: Math.round((Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0)) * Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0))) / Math.max(1, innerWidth * innerHeight) * 1000) / 1000
        });
        emitOnce('css', descriptor);
        emitOnce('top-level-surface', descriptor);
    };

    const installToggle = () => {
        // Recording must not opt users into a theme feature or recreate its
        // button after they disable the Millennium setting.
        window[TOGGLE_API_KEY]?.sync?.();
    };

    const describePicked = (picked, includeMarkup = false) => {
        if (!picked || !picked.element) return null;
        if (picked.kind === 'gradient') {
            const style = getComputedStyle(picked.element, picked.pseudo ? `::${picked.pseudo}` : null);
            const value = style[picked.property] || style.backgroundImage;
            return assetDescriptor(picked.element, 'gradient', {
                property: picked.property,
                pseudo: picked.pseudo,
                source: trim(value, 1200),
                gradientColors: colorsFrom(value).map((color) => color.slice(0, 3))
            }, includeMarkup);
        }
        if (picked.kind === 'element') {
            return assetDescriptor(picked.element, 'element', {
                computed: surfaceProperties(getComputedStyle(picked.element))
            }, includeMarkup);
        }
        const tag = picked.element.tagName.toLowerCase();
        const kind = tag === 'svg' ? 'svg' : tag === 'image' ? 'svg-image' : tag;
        return assetDescriptor(picked.element, kind, {}, includeMarkup);
    };

    const topmostElementFor = (eventOrTarget) => {
        let element = null;
        if (eventOrTarget && Number.isFinite(eventOrTarget.clientX) && Number.isFinite(eventOrTarget.clientY)) {
            element = document.elementFromPoint(eventOrTarget.clientX, eventOrTarget.clientY);
        }
        if (!element) {
            element = eventOrTarget && eventOrTarget.nodeType === Node.ELEMENT_NODE
                ? eventOrTarget
                : eventOrTarget && eventOrTarget.target && eventOrTarget.target.nodeType === Node.ELEMENT_NODE
                    ? eventOrTarget.target
                    : eventOrTarget && eventOrTarget.parentElement;
        }
        return element && element.nodeType === Node.ELEMENT_NODE ? element : null;
    };

    const findPickedTarget = (eventOrTarget) => {
        const element = topmostElementFor(eventOrTarget);
        if (!element || element.closest(`#${PICKER_HOST_ID}, #${TOGGLE_HOST_ID}`)) return null;
        const tag = element.tagName.toLowerCase();
        if (['img', 'svg', 'image', 'video', 'canvas', 'picture', 'iframe'].includes(tag)) {
            return { element, kind: 'asset' };
        }
        const style = getComputedStyle(element);
        for (const property of ['backgroundImage', 'maskImage', 'borderImageSource']) {
            if (hasGradient(style[property]) || hasImage(style[property])) {
                return { element, kind: 'gradient', property, pseudo: '' };
            }
        }
        // Deliberately do not climb to a prettier ancestor: the exact element
        // rendered on top is what the user chose to annotate.
        return { element, kind: 'element' };
    };

    const installPicker = () => {
        const mount = document.documentElement;
        if (!mount) return;
        // Store frequently replaces its body contents after navigation.  The
        // event listeners remain alive, but the visual host gets detached, so
        // reattach that same host instead of installing a second picker.
        if (state.picker) {
            if (!state.picker.host.isConnected) mount.appendChild(state.picker.host);
            window.__atomsAnnotationHighlightsV1?.sync();
            return;
        }
        const host = document.createElement('div');
        host.id = PICKER_HOST_ID;
        host.style.cssText = 'position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important;display:block!important';
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `
            <style>
                :host { all: initial; }
                #box { position: fixed; display: none; box-sizing: border-box; border: 2px dashed #de7bff; background: rgba(222,123,255,.08); box-shadow: 0 0 0 1px rgba(0,0,0,.68), 0 0 18px rgba(222,123,255,.42); pointer-events: none; }
                #label { position: absolute; left: -2px; top: -24px; max-width: 420px; padding: 4px 6px; border-radius: 4px; color: #fff; background: #4d2458; box-shadow: 0 2px 6px rgba(0,0,0,.5); font: 600 11px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: .02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                #scrim { position: fixed; inset: 0; z-index: 0; display: none; pointer-events: auto; background: transparent; cursor: default; }
                #note { position: fixed; z-index: 1; display: none; box-sizing: border-box; width: min(380px, calc(100vw - 16px)); padding: 10px; border: 1px solid rgba(245,238,247,.34); border-radius: 8px; color: #f5eef7; background: rgba(31,25,34,.98); box-shadow: 0 10px 32px rgba(0,0,0,.55); font: 500 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; pointer-events: auto; }
                #note-title { margin-bottom: 6px; font-weight: 700; color: #f0c9ff; }
                #note-hint { margin-bottom: 8px; color: #d4cbd7; font-size: 11px; }
                #note-input-frame { display: block; box-sizing: border-box; width: 100%; height: 34px; border: 0; border-radius: 5px; background: transparent; pointer-events: auto; }
            </style>
            <div id="box"><div id="label"></div></div>
            <div id="scrim" aria-hidden="true"></div>
            <div id="note" role="dialog" aria-modal="true" aria-label="Add this to the ATOMS fix list">
                <div id="note-title">Add this to the ATOMS fix list</div>
                <div id="note-hint">Optional note — Enter saves, even blank. Esc cancels.</div>
                <iframe id="note-input-frame" title="ATOMS fix note" aria-label="Optional note for this ATOMS fix"></iframe>
            </div>`;
        const box = shadow.getElementById('box');
        const label = shadow.getElementById('label');
        const scrim = shadow.getElementById('scrim');
        const note = shadow.getElementById('note');
        const noteFrame = shadow.getElementById('note-input-frame');
        state.picker = { host, box, label, scrim, note, noteFrame };
        mount.appendChild(host);
        let inertBody = null;
        let priorBodyInert = false;

        // Big Picture registers keyboard shortcuts on the parent document ahead
        // of injected listeners.  A same-origin child frame keeps ordinary
        // text-entry events out of that parent event path, while still letting
        // this picker receive explicit save/cancel messages.
        noteFrame.srcdoc = `<!doctype html>
            <html><head><style>
                html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
                #note-input { box-sizing: border-box; width: 100%; height: 34px; padding: 7px 8px; border: 1px solid rgba(255,255,255,.24); border-radius: 5px; outline: none; color: #fff; background: rgba(0,0,0,.28); font: 500 12px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
                #note-input:focus { border-color: #de7bff; box-shadow: 0 0 0 2px rgba(222,123,255,.23); }
            </style></head><body>
                <input id="note-input" type="text" maxlength="800" autocomplete="off" placeholder="e.g. reset to vanilla size / should be pink" />
                <script>
                    (() => {
                        const input = document.getElementById('note-input');
                        const focus = () => input.focus({ preventScroll: true });
                        addEventListener('load', focus);
                        input.addEventListener('keydown', (event) => {
                            if (event.key !== 'Enter' && event.key !== 'Escape') return;
                            event.preventDefault();
                            event.stopImmediatePropagation();
                            event.stopPropagation();
                            parent.postMessage({ channel: 'atoms-visual-audit-note', key: event.key }, '*');
                        });
                    })();
                <\/script>
            </body></html>`;

        const getNoteInput = () => {
            try {
                return noteFrame.contentDocument && noteFrame.contentDocument.getElementById('note-input');
            } catch (_error) {
                return null;
            }
        };

        const restorePreview = (entry) => {
            if (!entry || !entry.previewApplied || !entry.element || !entry.element.isConnected) return;
            if (entry.value) entry.element.style.setProperty('filter', entry.value, entry.priority);
            else entry.element.style.removeProperty('filter');
        };

        const focusNoteInput = () => {
            if (!state.pendingNote || !noteFrame.isConnected) return;
            const focus = () => {
                if (!state.pendingNote) return;
                const input = getNoteInput();
                if (!input) return;
                try {
                    noteFrame.contentWindow.focus();
                    input.focus({ preventScroll: true });
                } catch (_error) {
                    // The frame is still loading; its load handler will retry.
                }
            };
            focus();
            requestAnimationFrame(focus);
            setTimeout(focus, 48);
        };

        const lockPageFocus = () => {
            const body = document.body;
            if (!body || inertBody === body) return;
            if (inertBody) inertBody.inert = priorBodyInert;
            inertBody = body;
            priorBodyInert = Boolean(body.inert);
            body.inert = true;
        };

        const unlockPageFocus = () => {
            if (!inertBody) return;
            inertBody.inert = priorBodyInert;
            inertBody = null;
        };

        const closeNote = () => {
            unlockPageFocus();
            scrim.style.display = 'none';
            note.style.display = 'none';
            const input = getNoteInput();
            if (input) input.value = '';
        };

        const openNote = (entry) => {
            const rect = entry.element.getBoundingClientRect();
            lockPageFocus();
            scrim.style.display = 'block';
            note.style.display = 'block';
            const width = Math.min(380, Math.max(220, innerWidth - 16));
            const left = Math.min(Math.max(8, Math.round(rect.left)), Math.max(8, innerWidth - width - 8));
            const top = Math.min(Math.max(8, Math.round(rect.bottom + 8)), Math.max(8, innerHeight - 108));
            note.style.left = `${left}px`;
            note.style.top = `${top}px`;
            focusNoteInput();
        };

        const savePendingNote = () => {
            const entry = state.pendingNote;
            if (!entry) return;
            const input = getNoteInput();
            entry.note = trim(input ? input.value : '', MAX_NOTE_LENGTH);
            state.selectionState.set(entry.element, entry);
            state.selected.add(entry.element);
            state.pendingNote = null;
            closeNote();
            emit('selection', {
                selected: true,
                asset: entry.descriptor,
                note: entry.note,
                previewFilter: entry.previewFilter,
                previewApplied: entry.previewApplied
            });
            state.hovered = { element: entry.element, kind: entry.kind };
            queueDraw();
        };

        const cancelPendingNote = () => {
            const entry = state.pendingNote;
            if (!entry) return;
            restorePreview(entry);
            state.pendingNote = null;
            closeNote();
            queueDraw();
        };

        const onNoteMessage = (event) => {
            if (!state.pendingNote || event.source !== noteFrame.contentWindow) return;
            const data = event.data;
            if (!data || data.channel !== 'atoms-visual-audit-note') return;
            if (data.key === 'Enter') savePendingNote();
            else if (data.key === 'Escape') cancelPendingNote();
        };
        const keepFocus = (event) => {
            if (!state.pendingNote) return;
            const path = event.composedPath();
            if (path.includes(noteFrame) || shadow.activeElement === noteFrame) return;
            focusNoteInput();
        };
        const consumeScrimEvent = (event) => {
            if (!state.pendingNote) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            focusNoteInput();
        };
        const containNoteEvent = (event) => {
            if (!state.pendingNote) return;
            event.stopPropagation();
        };
        const modalPointerEvents = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'auxclick', 'contextmenu'];
        noteFrame.addEventListener('load', focusNoteInput);
        window.addEventListener('message', onNoteMessage);
        for (const type of modalPointerEvents) {
            scrim.addEventListener(type, consumeScrimEvent);
            note.addEventListener(type, containNoteEvent);
        }
        document.addEventListener('focusin', keepFocus, true);

        const draw = () => {
            state.hoverFrame = null;
            const picked = state.hovered;
            if (!picked || !picked.element || !picked.element.isConnected) {
                box.style.display = 'none';
                return;
            }
            const rect = picked.element.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
                box.style.display = 'none';
                return;
            }
            box.style.display = 'block';
            box.style.left = `${Math.round(rect.left)}px`;
            box.style.top = `${Math.round(rect.top)}px`;
            box.style.width = `${Math.max(1, Math.round(rect.width))}px`;
            box.style.height = `${Math.max(1, Math.round(rect.height))}px`;
            const descriptor = describePicked(picked);
            const selected = state.selected.has(picked.element);
            const type = descriptor ? descriptor.kind.toUpperCase() : 'ELEMENT';
            const tag = picked.element.tagName.toLowerCase();
            const pending = state.pendingNote && state.pendingNote.element === picked.element;
            label.textContent = `${type} <${tag}> · topmost${pending ? ' · note pending' : selected ? ' · selected · Alt-click to remove' : ' · Alt-click to add a note'}`;
        };

        const queueDraw = () => {
            if (state.hoverFrame) return;
            state.hoverFrame = requestAnimationFrame(draw);
        };

        const onMove = (event) => {
            if (state.pendingNote) return;
            state.hovered = findPickedTarget(event);
            queueDraw();
        };
        const onScroll = () => queueDraw();
        // On macOS, Option/Alt-clicking a linked image can trigger Steam/WebKit's
        // native download behavior before the page's ordinary click handler gets
        // a chance to help.  Swallow the entire gesture in the capture phase;
        // only the final primary click below opens the annotation prompt.
        const blockAltPickerGesture = (event) => {
            if (!event.altKey || state.pendingNote) return null;
            const picked = findPickedTarget(event);
            if (!picked || !picked.element || !picked.element.isConnected) return null;
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            return picked;
        };
        const onPointerGesture = (event) => {
            blockAltPickerGesture(event);
        };

        const recordInteraction = (event, type = event.type) => {
            const picked = findPickedTarget(event);
            if (!picked) return;
            const descriptor = describePicked(picked);
            if (!descriptor) return;
            const key = `${type}:${descriptor.id}`;
            const now = Date.now();
            const transient = type === 'dragover' || type === 'dragenter' || type === 'dragleave';
            if (transient && now - (state.interactionTimes.get(key) || 0) < DRAG_EVENT_MIN_MS) return;
            state.interactionTimes.set(key, now);
            const transfer = event.dataTransfer ? {
                types: Array.from(event.dataTransfer.types || []).slice(0, 12),
                effectAllowed: event.dataTransfer.effectAllowed || '',
                dropEffect: event.dataTransfer.dropEffect || ''
            } : undefined;
            emit('interaction', {
                interaction: type,
                target: descriptor,
                point: { x: Math.round(event.clientX || 0), y: Math.round(event.clientY || 0) },
                dataTransfer: transfer
            });
            schedule(`interaction:${type}`);
        };

        const onDragInteraction = (event) => recordInteraction(event);

        const isMenuTrigger = (element) => {
            if (!element) return false;
            if (element.closest('button, [role="button"], [role="menu"], [aria-haspopup]')) return true;
            const className = typeof element.className === 'string' ? element.className : '';
            return /(?:menu|dropdown|category)/i.test(className);
        };

        const onClick = (event) => {
            const picked = blockAltPickerGesture(event);
            if (!picked) {
                const topmost = topmostElementFor(event);
                if (!event.altKey && isMenuTrigger(topmost)) recordInteraction(event, 'activate');
                return;
            }

            const element = picked.element;
            const prior = state.selectionState.get(element);
            if (prior) {
                restorePreview(prior);
                state.selectionState.delete(element);
                state.selected.delete(element);
                emit('selection', {
                    selected: false,
                    asset: prior.descriptor,
                    note: prior.note || '',
                    previewFilter: prior.previewFilter,
                    previewApplied: prior.previewApplied
                });
            } else {
                const previewApplied = false;
                const previewFilter = '';
                const descriptor = describePicked(picked, element.tagName.toLowerCase() === 'svg');
                const saved = {
                    element,
                    kind: picked.kind,
                    value: element.style.getPropertyValue('filter'),
                    priority: element.style.getPropertyPriority('filter'),
                    descriptor,
                    previewFilter,
                    previewApplied,
                    note: ''
                };
                state.pendingNote = saved;
                openNote(saved);
            }
            state.hovered = picked;
            queueDraw();
        };

        state.picker.listeners = {
            onMove, onScroll, onPointerGesture, onClick, onDragInteraction, onNoteMessage,
            focusNoteInput, keepFocus, consumeScrimEvent, containNoteEvent, modalPointerEvents,
            unlockPageFocus,
            cancelPendingNote
        };
        document.addEventListener('mousemove', onMove, true);
        // Window capture runs before document/body handlers registered by Steam.
        for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'auxclick', 'dragstart', 'contextmenu']) {
            window.addEventListener(type, onPointerGesture, true);
        }
        window.addEventListener('click', onClick, true);
        window.addEventListener('scroll', onScroll, true);
        for (const type of ['dragstart', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend']) {
            document.addEventListener(type, onDragInteraction, true);
        }
        window.__atomsAnnotationHighlightsV1?.sync();
    };

    const isAssetElement = (element) => element && [
        'img', 'svg', 'image', 'video', 'canvas', 'picture', 'iframe'
    ].includes(element.tagName.toLowerCase());

    const inspectElement = (element) => {
        if (!element || !element.isConnected || element.nodeType !== Node.ELEMENT_NODE || isAuditChrome(element)) return;
        try {
            const style = getComputedStyle(element);
            const asset = isAssetElement(element);
            if (asset) inspectAsset(element);
            const signature = [
                style.backgroundColor, style.backgroundImage, style.color, style.borderColor,
                style.outlineColor, style.boxShadow, style.filter, style.opacity
            ].join('\u0001');
            if (!asset && state.surfaceSignatures.get(element) === signature) return;
            state.surfaceSignatures.set(element, signature);
            for (const descriptor of gradientDescriptors(element, style)) emitOnce('asset', descriptor);
            cssCandidate(element, style);
        } catch (_) {
            // Steam can detach a node during a style read.
        }
    };

    const queueElement = (element, reason) => {
        if (!element || element.nodeType !== Node.ELEMENT_NODE || state.stopped || isAuditChrome(element)) return;
        state.reasons.add(reason);
        if (!state.queued.has(element)) {
            state.queued.add(element);
            state.scanQueue.push(element);
        }
    };

    const SURFACE_SELECTOR = [
        'body', 'main', 'header', 'footer', 'nav', 'section', 'aside',
        '[role="main"]', '[role="dialog"]', '[role="menu"]', '[role="tabpanel"]', '[role="button"]',
        '[aria-modal="true"]', 'button',
        '[class*="Panel"]', '[class*="panel"]', '[class*="Background"]', '[class*="background"]',
        '[class*="Container"]', '[class*="container"]', '[class*="Dialog"]', '[class*="dialog"]',
        '[class*="Modal"]', '[class*="modal"]', '[class*="Header"]', '[class*="header"]',
        '[class*="Footer"]', '[class*="footer"]', '[class*="Focusable"]', '[class*="focusable"]',
        '[style*="background"]', '[style*="border"]', '[style*="color"]'
    ].join(', ');
    const ASSET_SELECTOR = 'img, svg, image, video, canvas, picture, iframe';

    const isAuditChrome = (element) => Boolean(element && element.closest && element.closest(`#${PICKER_HOST_ID}, #${TOGGLE_HOST_ID}`));

    const likelySurface = (element) => {
        if (!element || element.nodeType !== Node.ELEMENT_NODE || isAuditChrome(element)) return false;
        if (element.matches(SURFACE_SELECTOR)) return true;
        const className = typeof element.className === 'string' ? element.className : '';
        return /(?:panel|surface|layer|tile|card|row|bar|menu|dialog|modal|header|footer|focusable|button|control)/i.test(className);
    };

    const queueTopLevelSurfaces = (root, reason, includeAssets = true) => {
        if (!root || root.nodeType !== Node.ELEMENT_NODE || state.stopped) return;
        let surfaceCount = 0;
        const seen = new Set();
        const addSurface = (element) => {
            if (!likelySurface(element) || seen.has(element) || surfaceCount >= MAX_SURFACE_QUEUE) return;
            seen.add(element);
            surfaceCount += 1;
            queueElement(element, reason);
        };

        addSurface(root);
        for (const element of root.querySelectorAll(SURFACE_SELECTOR)) addSurface(element);

        if (includeAssets) {
            let assetCount = 0;
            for (const element of root.querySelectorAll(ASSET_SELECTOR)) {
                if (assetCount >= MAX_ASSET_QUEUE) break;
                if (isAuditChrome(element)) continue;
                assetCount += 1;
                queueElement(element, reason);
            }
        }
    };

    const queueViewportSurfaces = (reason, limit = MAX_SURFACE_QUEUE) => {
        if (state.stopped || !document.body) return;
        const seen = new Set();
        let queuedCount = 0;
        const add = (element) => {
            if (!element || !element.isConnected || isAuditChrome(element) || seen.has(element) || queuedCount >= limit) return;
            seen.add(element);
            queuedCount += 1;
            queueElement(element, reason);
        };

        outer: for (let column = 0; column < GRID_COLUMNS; column += 1) {
            const x = Math.min(innerWidth - 1, Math.max(0, Math.round((column + 0.5) * innerWidth / GRID_COLUMNS)));
            for (let row = 0; row < GRID_ROWS; row += 1) {
                const y = Math.min(innerHeight - 1, Math.max(0, Math.round((row + 0.5) * innerHeight / GRID_ROWS)));
                const stack = document.elementsFromPoint(x, y);
                for (const topmost of stack.slice(0, 4)) {
                    let current = topmost;
                    for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) add(current);
                }
                if (queuedCount >= limit) break outer;
            }
        }
    };

    const scan = () => {
        state.timer = null;
        if (state.stopped || state.scanning || !state.scanQueue.length) return;
        installPicker();
        state.scanning = true;
        let inspected = 0;

        const step = () => {
            if (state.stopped) return;
            let processed = 0;
            while (state.scanQueue.length && processed < SCAN_BATCH_SIZE) {
                const element = state.scanQueue.shift();
                state.queued.delete(element);
                inspectElement(element);
                processed += 1;
                inspected += 1;
            }
            if (state.scanQueue.length) {
                setTimeout(step, SCAN_BATCH_PAUSE_MS);
                return;
            }
            state.scanning = false;
            const reasons = Array.from(state.reasons);
            state.reasons.clear();
            emit('scan-complete', { reasons, inspected });
            if (state.scanQueue.length) schedule('queued-during-scan');
        };
        step();
    };

    const schedule = (reason) => {
        if (state.stopped) return;
        state.reasons.add(reason);
        if (state.scanning || state.timer || !state.scanQueue.length) return;
        state.timer = setTimeout(scan, 120);
    };

    const queueRecoverySurfaces = () => {
        if (state.stopped || !document.body) return;
        queueViewportSurfaces('recovery-viewport', 650);
        const selector = '[role="menu"], [role="dialog"], [aria-modal="true"], [class*="Menu"], [class*="menu"], [class*="Dialog"], [class*="dialog"]';
        let count = 0;
        for (const element of document.querySelectorAll(selector)) {
            queueElement(element, 'recovery');
            count += 1;
            if (count >= 420) break;
        }
        schedule('recovery');
    };

    const stop = () => {
        if (state.stopped) return;
        state.stopped = true;
        window.__atomsAnnotationInputLockV1?.stop();
        window.__atomsAnnotationHighlightsV1?.stop();
        if (state.timer) clearTimeout(state.timer);
        if (state.interval) clearInterval(state.interval);
        if (state.observer) state.observer.disconnect();
        if (state.pageShow) window.removeEventListener('pageshow', state.pageShow);
        if (state.hoverFrame) cancelAnimationFrame(state.hoverFrame);
        if (state.picker) {
            state.picker.listeners.unlockPageFocus();
            if (state.pendingNote) {
                const pending = state.pendingNote;
                if (pending.previewApplied && pending.element && pending.element.isConnected) {
                    if (pending.value) pending.element.style.setProperty('filter', pending.value, pending.priority);
                    else pending.element.style.removeProperty('filter');
                }
                state.pendingNote = null;
            }
            document.removeEventListener('mousemove', state.picker.listeners.onMove, true);
            for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'auxclick', 'dragstart', 'contextmenu']) {
                window.removeEventListener(type, state.picker.listeners.onPointerGesture, true);
            }
            window.removeEventListener('click', state.picker.listeners.onClick, true);
            window.removeEventListener('scroll', state.picker.listeners.onScroll, true);
            for (const type of ['dragstart', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend']) {
                document.removeEventListener(type, state.picker.listeners.onDragInteraction, true);
            }
            state.picker.noteFrame.removeEventListener('load', state.picker.listeners.focusNoteInput);
            window.removeEventListener('message', state.picker.listeners.onNoteMessage);
            for (const type of state.picker.listeners.modalPointerEvents) {
                state.picker.scrim.removeEventListener(type, state.picker.listeners.consumeScrimEvent);
                state.picker.note.removeEventListener(type, state.picker.listeners.containNoteEvent);
            }
            document.removeEventListener('focusin', state.picker.listeners.keepFocus, true);
            state.picker.host.remove();
        }
        for (const element of state.selected) {
            const prior = state.selectionState.get(element);
            if (!prior || !element.isConnected) continue;
            if (prior.previewApplied) {
                if (prior.value) element.style.setProperty('filter', prior.value, prior.priority);
                else element.style.removeProperty('filter');
            }
        }
        if (window[KEY]) window[KEY].stopped = true;
        emit('stopped', { selectedAssets: state.selected.size });
    };

    installToggle();
    installPicker();
    state.observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (isAuditChrome(mutation.target)) continue;
            if (mutation.type === 'attributes') {
                queueElement(mutation.target, `attribute:${mutation.attributeName || 'change'}`);
                continue;
            }
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) queueTopLevelSurfaces(node, 'added-subtree');
            }
        }
        schedule('mutation');
    });
    if (document.documentElement) {
        state.observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'src', 'href']
        });
    }
    state.interval = setInterval(queueRecoverySurfaces, RECOVERY_SCAN_MS);
    state.pageShow = () => {
        if (document.body) {
            queueTopLevelSurfaces(document.body, 'pageshow');
            queueViewportSurfaces('pageshow-viewport');
        }
        schedule('pageshow');
    };
    window.addEventListener('pageshow', state.pageShow);
    window[KEY] = { stop, schedule, getSelected: () => state.selected.size, stopped: false,
        input: {
            move: event => state.picker?.listeners.onMove(event),
            click: event => state.picker?.listeners.onClick(event),
            note: event => state.picker?.listeners.onNoteMessage(event)
        }
    };
    if (document.body) {
        queueTopLevelSurfaces(document.body, 'installed');
        queueViewportSurfaces('installed-viewport');
    }
    schedule('installed');
    return 'installed';
}

const source = `(${installAnnotationHighlights.toString()})();(${installAnnotationInputLock.toString()})();(${visualAuditSource.toString()})();`;

class TargetConnection {
    constructor(target) {
        this.target = target;
        this.ws = null;
        this.nextId = 0;
        this.pending = new Map();
        this.closed = false;
        this.preloadScriptId = null;
        this.contexts = new Set();
        this.ready = false;
        this.inputLock = new AnnotationInputLockBridge((method, params) => this.call(method, params));
    }

    call(method, params = {}) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error(`CDP socket is not open: ${method}`));
                return;
            }
            const id = ++this.nextId;
            const timeout = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP timeout: ${method}`));
            }, 6000);
            this.pending.set(id, { resolve, reject, timeout });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    onMessage(raw) {
        let message;
        try { message = JSON.parse(raw); } catch (_) { return; }
        if (message.id && this.pending.has(message.id)) {
            const pending = this.pending.get(message.id);
            this.pending.delete(message.id);
            clearTimeout(pending.timeout);
            if (message.error) pending.reject(message.error);
            else pending.resolve(message.result || {});
            return;
        }
        if (message.method === 'Runtime.bindingCalled' && message.params && message.params.name === BINDING) {
            this.onBinding(message.params.payload);
        }
        if (message.method === 'Runtime.bindingCalled' && message.params && message.params.name === LOCK_BINDING) {
            this.inputLock.handle(message.params);
        }
        if (message.method === 'Runtime.executionContextCreated') {
            const context = message.params && message.params.context;
            if (context && context.auxData && context.auxData.isDefault) {
                this.contexts.add(context.id);
                if (this.ready) this.installContext(context.id).catch(() => {});
            }
        } else if (message.method === 'Runtime.executionContextDestroyed') {
            this.contexts.delete(message.params.executionContextId);
        } else if (message.method === 'Runtime.executionContextsCleared') {
            this.contexts.clear();
        }
    }

    async installContext(contextId) {
        const result = await this.call('Runtime.evaluate', {
            expression: source,
            contextId,
            returnByValue: true,
            userGesture: false
        });
        if (result.exceptionDetails) {
            event('context-install-failed', {
                target: this.target.id,
                contextId,
                error: result.exceptionDetails.exception && result.exceptionDetails.exception.description || result.exceptionDetails.text
            });
        }
    }

    onBinding(payload) {
        let message;
        try { message = JSON.parse(payload); } catch (_) { return; }
        const target = {
            id: this.target.id,
            titleAtAttach: this.target.title,
            urlAtAttach: this.target.url,
            type: this.target.type
        };
        if (message.type === 'asset') write('assets', { target, ...message });
        else if (message.type === 'selection') write('selections', { target, ...message });
        else if (message.type === 'css') write('css', { target, ...message });
        else if (message.type === 'top-level-surface') write('topLevel', { target, ...message });
        else event(message.type || 'page-event', { target, ...message });
    }

    async connect() {
        await new Promise((resolve, reject) => {
            const socket = new WebSocket(this.target.webSocketDebuggerUrl);
            this.ws = socket;
            socket.once('open', resolve);
            socket.once('error', reject);
            socket.on('message', (raw) => this.onMessage(raw));
            socket.on('close', () => {
                this.closed = true;
                for (const pending of this.pending.values()) {
                    clearTimeout(pending.timeout);
                    pending.reject(new Error('CDP socket closed'));
                }
                this.pending.clear();
            });
        });
        await this.call('Runtime.enable');
        await this.call('Page.enable').catch(() => {});
        await this.call('DOM.enable');
        await this.call('CSS.enable');
        await this.call('Runtime.addBinding', { name: BINDING });
        await this.call('Runtime.addBinding', { name: LOCK_BINDING });
        const preload = await this.call('Page.addScriptToEvaluateOnNewDocument', { source }).catch(() => null);
        this.preloadScriptId = preload && preload.identifier || null;
        this.ready = true;
        if (this.contexts.size) await Promise.all(Array.from(this.contexts, (id) => this.installContext(id)));
        else await this.call('Runtime.evaluate', { expression: source, returnByValue: true });
    }

    async stop() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ready = false;
        const expression = '(() => { for (const key of ["__atomsVisualAuditV5", "__atomsVisualAuditV4", "__atomsVisualAuditV3"]) { const audit = window[key]; if (audit && typeof audit.stop === "function") audit.stop(); } return true; })()';
        const contexts = this.contexts.size ? Array.from(this.contexts) : [null];
        await Promise.all(contexts.map((contextId) => this.call('Runtime.evaluate', {
            expression,
            ...(contextId == null ? {} : { contextId }),
            returnByValue: true
        }).catch(() => {})));
        await this.inputLock.stop();
        if (this.preloadScriptId) {
            await this.call('Page.removeScriptToEvaluateOnNewDocument', {
                identifier: this.preloadScriptId
            }).catch(() => {});
            this.preloadScriptId = null;
        }
        this.ws.close();
    }
}

async function attach(target) {
    const connection = new TargetConnection(target);
    targets.set(target.id, connection);
    try {
        await connection.connect();
        event('target-attached', { target: { id: target.id, type: target.type, title: target.title, url: target.url } });
    } catch (error) {
        targets.delete(target.id);
        event('target-attach-failed', { target: { id: target.id, title: target.title, url: target.url }, error: String(error.message || error) });
        if (connection.ws) connection.ws.close();
    }
}

async function pollTargets() {
    if (stopping) return;
    let listed;
    try {
        listed = await getJson(`${CDP_ROOT}/json/list`);
    } catch (error) {
        event('target-poll-failed', { error: String(error.message || error) });
        return;
    }
    const eligible = listed.filter((target) => {
        if (!target.webSocketDebuggerUrl || (target.type !== 'page' && target.type !== 'iframe')) return false;
        // The picker note field is a same-origin srcdoc iframe so Big Picture
        // cannot consume its typing.  Do not recursively instrument our own
        // input document as though it were a Steam surface.
        if (/^about:srcdoc(?:[?#]|$)/i.test(String(target.url || ''))) return false;
        return !ONLY_TARGET || target.id === ONLY_TARGET || target.title.includes(ONLY_TARGET);
    });
    const liveIds = new Set(eligible.map((target) => target.id));
    for (const [id, connection] of targets) {
        if (!liveIds.has(id) || connection.closed) {
            targets.delete(id);
            event('target-detached', { target: id });
            if (!connection.closed) connection.stop().catch(() => {});
        }
    }
    for (const target of eligible) {
        if (!targets.has(target.id)) attach(target);
    }
}

let pollTimer = null;

async function finish(signal) {
    if (stopping) return;
    stopping = true;
    if (pollTimer) clearInterval(pollTimer);
    await Promise.race([
        Promise.all(Array.from(targets.values()).map((connection) => connection.stop())),
        new Promise((resolve) => setTimeout(resolve, 3500))
    ]);
    event('stopped', { signal, counts });
    fs.writeFileSync(path.join(sessionDir, 'stopped.json'), JSON.stringify({
        timestamp: new Date().toISOString(),
        signal,
        counts
    }, null, 2) + '\n');
    await Promise.all(Object.values(streams).map((stream) => new Promise((resolve) => stream.end(resolve))));
    console.log(`[visual-audit] stopped; reports are in ${sessionDir}`);
}

process.on('SIGINT', () => finish('SIGINT'));
process.on('SIGTERM', () => finish('SIGTERM'));

console.log(`[visual-audit] watching Steam targets; compact reports will be written to ${sessionDir}`);
event('started', { sessionDir });
pollTargets();
pollTimer = setInterval(pollTargets, TARGET_POLL_MS);
