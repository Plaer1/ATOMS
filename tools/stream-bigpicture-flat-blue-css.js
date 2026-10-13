#!/usr/bin/env node
'use strict';

/*
 * Turns live visual-audit rows into ordinary, saved Big Picture CSS.
 *
 * It deliberately accepts only CSS-surface rows that the monitor marked
 * `flatCss: true`: no image, mask, border image, or gradient.  It never
 * touches a source image or SVG asset.  The script owns only the marked block
 * in css/bigpicture.css, so hand-written rules above it remain intact.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
let WebSocket;
try {
    WebSocket = require('ws');
} catch (_) {
    WebSocket = require(require.resolve('ws', { paths: [process.cwd()] }));
}

const auditDir = process.env.ATOMS_VISUAL_AUDIT_DIR;
if (!auditDir) {
    throw new Error('Set ATOMS_VISUAL_AUDIT_DIR to the active visual-audit report directory.');
}

const themeRoot = path.resolve(__dirname, '..');
const reportFile = path.join(auditDir, 'top-level-unthemed.jsonl');
const stateFile = path.join(auditDir, 'bigpicture-flat-blue-state.json');
const cssFile = path.join(themeRoot, 'css', 'bigpicture.css');
const cdpRoot = process.env.ATOMS_CDP || 'http://127.0.0.1:8080';
const pollMs = Math.max(250, Number(process.env.ATOMS_FLAT_BLUE_POLL_MS || 650));
const bridgePollMs = Math.max(1000, Number(process.env.ATOMS_BIGPICTURE_BRIDGE_POLL_MS || 2500));
const START_MARKER = '/* ATOMS_AUTO_FLAT_BLUE_BEGIN */';
const END_MARKER = '/* ATOMS_AUTO_FLAT_BLUE_END */';
const STEAM_BLUE_KINDS = new Set(['steam-blue', 'steam-blue-background']);
const GENERIC_CLASSES = new Set(['Panel', 'Focusable', 'gpfocus', 'gpfocuswithin', 'WideWindow', 'FillArea']);
const MANUAL_SELECTOR_OVERRIDES = new Set([
    // Reviewed from a saved Alt-click note: this is a normal card strip, not
    // an accent surface.  Its hand-written rule follows the generated block.
    'div._3-GyQfKnKaWozIRLOw4BjY'
]);

let offset = 0;
let carry = '';
let initialized = false;
let stopped = false;
let writing = false;
let lastBridgeSweep = 0;
let bridgeInFlight = false;
const rules = new Map();
const bridgedTargetIds = new Set();

const isBigPictureTitle = (title) => title === 'Steam Big Picture Mode' || /^QuickAccess_|^MainMenu_/.test(title);

const isBigPictureTarget = (row) => isBigPictureTitle(String(row && row.target && row.target.titleAtAttach || row && row.title || ''));

const cssEscape = (value) => Array.from(String(value || '')).map((character, index) => {
    if (/[A-Za-z0-9_-]/.test(character) && !(index === 0 && /[0-9]/.test(character))) return character;
    return `\\${character.codePointAt(0).toString(16)} `;
}).join('');

const selectorFor = (payload) => {
    const tag = /^[a-z][a-z0-9-]*$/i.test(String(payload.tag || '')) ? String(payload.tag).toLowerCase() : '';
    const classes = String(payload.classes || '').trim().split(/\s+/).filter(Boolean);
    const hasSpecificClass = classes.some((name) => !GENERIC_CLASSES.has(name) && name.length >= 6);
    if (tag && classes.length && hasSpecificClass) {
        return `${tag}${classes.map((name) => `.${cssEscape(name)}`).join('')}`;
    }

    // Stable element IDs are safe; React's generated «r…» IDs are not.
    const supplied = String(payload.selector || '').trim();
    if (/^#[A-Za-z_][A-Za-z0-9_-]*$/.test(supplied)) return supplied;
    if (/^(?:html|body)$/.test(supplied)) return supplied;
    return '';
};

const alphaFor = (value) => {
    const match = String(value || '').match(/rgba?\([^)]*?(?:[,/]\s*([\d.]+))?\s*\)/i);
    if (!match || match[1] == null) return 1;
    const alpha = Number(match[1]);
    return Number.isFinite(alpha) ? Math.max(0, Math.min(1, Math.round(alpha * 1000) / 1000)) : 1;
};

const themedValue = (variable, alpha) => alpha >= 0.999
    ? `rgb(var(${variable}))`
    : `rgba(var(${variable}), ${alpha})`;

const declarationFor = (property, value) => {
    const alpha = alphaFor(value);
    if (property === 'color') return ['color', themedValue('--textAccented', alpha)];
    if (property === 'borderColor') return ['border-color', themedValue('--accent', alpha)];
    if (property === 'outlineColor') return ['outline-color', themedValue('--accent', alpha)];
    // Flat blue fills are still accent treatments, but use the dark accent
    // tier so full-size buttons/cards keep readable contrast.
    if (property === 'backgroundColor') return ['background-color', themedValue('--accentDarkish', alpha)];
    return null;
};

const rowIsFlatAndSafe = (row) => {
    const payload = row && row.payload;
    if (!payload || payload.kind !== 'css-surface' || payload.flatCss !== true || payload.source) return false;
    return !(payload.properties || []).some((property) =>
        property.property === 'backgroundImage' || /(?:gradient\(|url\(|image-set\()/i.test(String(property.value || ''))
    );
};

const addRow = (row) => {
    if (!isBigPictureTarget(row) || !rowIsFlatAndSafe(row)) return false;
    const payload = row.payload;
    const selector = selectorFor(payload);
    if (!selector || MANUAL_SELECTOR_OVERRIDES.has(selector)) return false;
    let changed = false;

    for (const property of payload.properties || []) {
        if (!STEAM_BLUE_KINDS.has(property.kind)) continue;
        const declaration = declarationFor(property.property, property.value);
        if (!declaration) continue;
        const [cssProperty, cssValue] = declaration;
        let rule = rules.get(selector);
        if (!rule) {
            rule = new Map();
            rules.set(selector, rule);
        }
        let values = rule.get(cssProperty);
        if (!values) {
            values = { declarations: new Set(), originals: new Set() };
            rule.set(cssProperty, values);
        }
        const before = values.declarations.size + values.originals.size;
        values.declarations.add(cssValue);
        values.originals.add(String(property.value || ''));
        if (before !== values.declarations.size + values.originals.size) changed = true;
    }
    return changed;
};

const serializeState = () => ({
    version: 1,
    rules: Array.from(rules, ([selector, declarations]) => ({
        selector,
        declarations: Array.from(declarations, ([property, values]) => ({
            property,
            values: Array.from(values.declarations),
            originals: Array.from(values.originals)
        }))
    }))
});

const loadState = () => {
    if (!fs.existsSync(stateFile)) return;
    try {
        const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        for (const savedRule of saved.rules || []) {
            if (!savedRule || !savedRule.selector || MANUAL_SELECTOR_OVERRIDES.has(savedRule.selector)) continue;
            const declarations = new Map();
            for (const savedValue of savedRule.declarations || []) {
                declarations.set(savedValue.property, {
                    declarations: new Set(savedValue.values || []),
                    originals: new Set(savedValue.originals || [])
                });
            }
            rules.set(savedRule.selector, declarations);
        }
    } catch (error) {
        console.warn(`[flat-blue-css] ignored unreadable state: ${error.message || error}`);
    }
};

const renderBlock = () => {
    const rendered = [];
    let conflicted = 0;
    for (const [selector, declarations] of Array.from(rules).sort(([left], [right]) => left.localeCompare(right))) {
        const lines = [];
        const originals = [];
        for (const [property, values] of Array.from(declarations).sort(([left], [right]) => left.localeCompare(right))) {
            // If one exact selector was observed with incompatible alpha
            // variants, leave that property for manual review instead of
            // guessing which state should win.
            if (values.declarations.size !== 1) {
                conflicted += 1;
                continue;
            }
            lines.push(`\t${property}: ${Array.from(values.declarations)[0]} !important;`);
            originals.push(...Array.from(values.originals));
        }
        if (!lines.length) continue;
        const original = Array.from(new Set(originals)).slice(0, 3).join(' | ');
        rendered.push(`/* flat Steam blue: ${original} */\n${selector} {\n${lines.join('\n')}\n}`);
    }
    const body = rendered.length
        ? `/* Generated from flat, CSS-only Steam-blue audit matches. */\n\n${rendered.join('\n\n')}\n`
        : '/* Waiting for flat, CSS-only Steam-blue matches from the live audit. */\n';
    return { body, rules: rendered.length, conflicted };
};

const readJson = (url) => new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
            if (response.statusCode < 200 || response.statusCode >= 300) {
                reject(new Error(`HTTP ${response.statusCode}: ${url}`));
                return;
            }
            try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
        });
    });
    request.on('error', reject);
    request.setTimeout(2500, () => request.destroy(new Error(`Timeout: ${url}`)));
});

const evaluate = (target, expression) => new Promise((resolve) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    let settled = false;
    const finish = (value) => {
        if (settled) return;
        settled = true;
        try { socket.close(); } catch (_) {}
        resolve(value);
    };
    socket.once('open', () => socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true, userGesture: false }
    })));
    socket.on('message', (raw) => {
        let message;
        try { message = JSON.parse(raw); } catch (_) { return; }
        if (message.id === 1) finish(message.result && message.result.result && message.result.result.value);
    });
    socket.once('error', () => finish(null));
    setTimeout(() => finish(null), 3500);
});

const reloadBigPictureCss = async () => {
    let targets;
    try { targets = await readJson(`${cdpRoot}/json/list`); } catch (_) { return; }
    const pages = targets.filter((target) => isBigPictureTitle(String(target.title || '')) && target.webSocketDebuggerUrl);
    const expression = `(async()=>{const links=[...document.querySelectorAll('link[rel=stylesheet]')].filter((link)=>link.href.includes('/themes/ATOMS/css/bigpicture.css'));const link=links.find((item)=>!item.disabled)||links.at(-1);if(!link)return false;const fresh=link.cloneNode(true);fresh.disabled=false;const base=link.href.replace(/[?&]atomsLive=\\d+/g,'');fresh.href=base+(base.includes('?')?'&':'?')+'atomsLive='+Date.now();return await new Promise((resolve)=>{const finish=(ok)=>{if(ok)links.forEach((item)=>item.remove());else fresh.remove();resolve(ok)};fresh.addEventListener('load',()=>finish(true),{once:true});fresh.addEventListener('error',()=>finish(false),{once:true});link.after(fresh);});})()`;
    await Promise.all(pages.map((target) => evaluate(target, expression)));
};

/* Millennium normally injects Big Picture CSS into the two popup renderers,
 * but it can miss a popup created while the client is busy.  This bridge only
 * appends the same saved stylesheet when it is absent; it never recolors DOM
 * nodes or re-enables a stylesheet the user disabled with the theme toggle. */
const ensureBigPictureCss = async () => {
    if (bridgeInFlight || stopped) return;
    bridgeInFlight = true;
    try {
        const targets = await readJson(`${cdpRoot}/json/list`);
        const pages = targets.filter((target) => isBigPictureTitle(String(target.title || '')) && target.webSocketDebuggerUrl);
        const liveIds = new Set(pages.map((target) => target.id));
        for (const id of bridgedTargetIds) if (!liveIds.has(id)) bridgedTargetIds.delete(id);
        const expression = `(async()=>{const links=[...document.querySelectorAll('link[rel=stylesheet]')].filter((link)=>link.href.includes('/themes/ATOMS/css/bigpicture.css'));if(links.length)return true;if(!document.head)return false;const link=document.createElement('link');link.rel='stylesheet';link.href='https://millennium.host/v1/themes/ATOMS/css/bigpicture.css?atomsLive='+Date.now();return await new Promise((resolve)=>{const finish=(ok)=>resolve(ok);link.addEventListener('load',()=>finish(true),{once:true});link.addEventListener('error',()=>finish(false),{once:true});document.head.appendChild(link);});})()`;
        await Promise.all(pages.filter((target) => !bridgedTargetIds.has(target.id)).map(async (target) => {
            const result = await evaluate(target, expression);
            if (result) bridgedTargetIds.add(target.id);
        }));
    } catch (_) {
        // The next low-rate sweep will retry if Steam is between renderers.
    } finally {
        bridgeInFlight = false;
    }
};

const commit = () => {
    if (writing) return;
    writing = true;
    try {
        const css = fs.readFileSync(cssFile, 'utf8');
        const start = css.indexOf(START_MARKER);
        const end = css.indexOf(END_MARKER);
        if (start < 0 || end < start) throw new Error(`missing ${START_MARKER}/${END_MARKER} in ${cssFile}`);
        const rendered = renderBlock();
        const current = css.slice(start + START_MARKER.length, end).trim();
        if (current !== rendered.body.trim()) {
            const next = `${css.slice(0, start + START_MARKER.length)}\n${rendered.body}${css.slice(end)}`;
            fs.writeFileSync(cssFile, next);
            fs.writeFileSync(stateFile, JSON.stringify(serializeState(), null, 2) + '\n');
            console.log(`[flat-blue-css] saved ${rendered.rules} static Big Picture rule${rendered.rules === 1 ? '' : 's'}${rendered.conflicted ? ` (${rendered.conflicted} ambiguous property${rendered.conflicted === 1 ? '' : 'ies'} skipped)` : ''}`);
            reloadBigPictureCss().catch(() => {});
        }
    } catch (error) {
        console.error(`[flat-blue-css] ${error.message || error}`);
    } finally {
        writing = false;
    }
};

const consume = (chunk) => {
    const lines = (carry + chunk).split(/\r?\n/);
    carry = lines.pop() || '';
    let changed = false;
    for (const line of lines) {
        if (!line.trim()) continue;
        try { changed = addRow(JSON.parse(line)) || changed; } catch (_) {
            // The monitor may be in the middle of writing this JSON line.
        }
    }
    if (changed) commit();
};

const poll = () => {
    if (stopped) return;
    if (Date.now() - lastBridgeSweep >= bridgePollMs) {
        lastBridgeSweep = Date.now();
        ensureBigPictureCss().catch(() => {});
    }
    try {
        const stats = fs.statSync(reportFile);
        if (!initialized) {
            // Start at EOF to avoid rereading the old capture while the user is
            // browsing. New rows are handled incrementally from this point.
            offset = stats.size;
            initialized = true;
            console.log(`[flat-blue-css] watching new flat-blue rows in ${reportFile}`);
            return;
        }
        if (stats.size < offset) {
            offset = 0;
            carry = '';
        }
        if (stats.size === offset) return;
        const length = stats.size - offset;
        const buffer = Buffer.allocUnsafe(length);
        const fd = fs.openSync(reportFile, 'r');
        try { fs.readSync(fd, buffer, 0, length, offset); } finally { fs.closeSync(fd); }
        offset = stats.size;
        consume(buffer.toString('utf8'));
    } catch (error) {
        if (error && error.code !== 'ENOENT') console.error(`[flat-blue-css] ${error.message || error}`);
    }
};

loadState();
if (rules.size) commit();
ensureBigPictureCss().catch(() => {});
poll();
const timer = setInterval(poll, pollMs);
const stop = () => {
    stopped = true;
    clearInterval(timer);
    console.log('[flat-blue-css] stopped; generated rules remain in css/bigpicture.css');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
