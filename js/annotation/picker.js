import { createHoverPin } from './hover-pin.js';

export const PICKER_KEY = '__atomsAnnotationPickerV1';
export const PICKER_HOST_ID = 'atoms-annotation-picker-host';
export const PICKER_NOTE_CHANNEL = 'atoms-annotation-picker-note';
const WINDOW_ID_KEY = 'atoms-annotation-window-id-v1';
const DRAFT_KEY = 'atoms-annotation-picker-draft-v1';
const MAX_NOTE_LENGTH = 800;
const GESTURES = ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'auxclick', 'dragstart', 'contextmenu', 'wheel'];
const BLOCKED_TITLES = new Set(['ATOMS annotation', 'ATOMS saved annotations']);
const OWNED_HOST_IDS = new Set([PICKER_HOST_ID, 'atoms-visual-audit-host', 'atoms-theme-toggle-host', 'atoms-annotation-note-manager-host', 'atoms-annotation-control-host']);

const ownWindow = win => win?.opener || win;
const nodeElement = node => node && node.nodeType === 1;

function escapeSelector(value, win = globalThis.window) {
    if (win?.CSS?.escape) return win.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, char => `\\${char.codePointAt(0).toString(16)} `);
}

export function selectorFor(element, win = element?.ownerDocument?.defaultView || globalThis.window) {
    if (!nodeElement(element)) return '';
    if (element.id) return `#${escapeSelector(element.id, win)}`;
    const classes = Array.from(element.classList || [])
        .filter(name => /^-?[A-Za-z_][A-Za-z0-9_-]*$/.test(name)).slice(0, 4);
    return `${String(element.tagName || '').toLowerCase()}${classes.map(name => `.${escapeSelector(name, win)}`).join('')}`;
}

export function contextFor(element, win = element?.ownerDocument?.defaultView || globalThis.window) {
    const parts = [];
    for (let node = element; nodeElement(node) && parts.length < 6; node = node.parentElement) {
        const parent = node.parentElement;
        const index = parent ? Array.prototype.indexOf.call(parent.children, node) + 1 : 0;
        parts.unshift(`${selectorFor(node, win)}${index ? `:nth-child(${index})` : ''}`);
    }
    return parts.join(' > ');
}

export function readColorMode(doc = globalThis.document, getStyle = globalThis.getComputedStyle) {
    try {
        const marker = getStyle(doc.documentElement).getPropertyValue('--atoms-color-mode').trim().toLowerCase();
        return marker === 'light' || marker === 'dark' ? marker : null;
    } catch (_) { return null; }
}

export function resolveColorMode(doc, fallback = null, getStyle = globalThis.getComputedStyle) {
    const sampled = readColorMode(doc, getStyle);
    if (sampled) return sampled;
    return fallback === 'light' || fallback === 'dark' ? fallback : null;
}

export function createSaveCoordinator(save) {
    let inFlight = null;
    return record => {
        if (inFlight) return inFlight;
        const request = Promise.resolve().then(() => save(record));
        inFlight = request;
        request.then(() => { if (inFlight === request) inFlight = null; }, () => { if (inFlight === request) inFlight = null; });
        return request;
    };
}

export function canStopWithDraft(dirty, saving = false) { return !dirty && !saving; }

export function relayWithAck(relay, metadata) {
    return Promise.resolve().then(() => relay(metadata));
}

export function setEditorSaving(field, buttons, saving) {
    if (field) field.readOnly = Boolean(saving);
    for (const button of buttons || []) button.disabled = Boolean(saving);
}

export function handleEditorKey(event, { submit, cancel, consume } = {}) {
    if (event?.isComposing || event?.keyCode === 229) return false;
    if (event?.key === 'Enter') { consume?.(event); submit?.(); return true; }
    if (event?.key === 'Escape') { consume?.(event); cancel?.(); return true; }
    return false;
}

export function focusEditorInput(frame, field, { requestFrame = globalThis.requestAnimationFrame, schedule = globalThis.setTimeout, canFocus = () => true } = {}) {
    const attempt = () => {
        if (!canFocus()) return false;
        try {
            frame.focus?.({ preventScroll: true });
            frame.contentWindow?.focus?.();
            field.focus({ preventScroll: true });
            return frame.contentDocument?.activeElement === field || field.ownerDocument?.activeElement === field;
        } catch (_) { return false; }
    };
    const focused = attempt();
    try { requestFrame?.(attempt); } catch (_) {}
    try { schedule?.(attempt, 48); } catch (_) {}
    return focused;
}

export async function activateAfterHoverPin(pinInfos, pin, isCurrent, activate) {
    if (!pinInfos?.length) return false;
    const outcomes = await Promise.all(pinInfos.map(async info => {
        try { return Boolean(await pin(info)); } catch (_) { return false; }
    }));
    if (!outcomes.every(Boolean) || !isCurrent()) return false;
    activate();
    return true;
}

function storePageKey(win, doc) {
    const loc = doc.location || win.location;
    try {
        if (/^https?:$/.test(loc.protocol) && loc.host !== 'steamloopback.host') return loc.host + loc.pathname;
    } catch (_) { /* Continue with Steam's internal route stores. */ }
    try {
        const host = ownWindow(win);
        const instance = host.SteamUIStore?.WindowStore?.GetWindowInstanceFromWindow?.(win);
        const path = instance?.m_history?.location?.pathname;
        if (path?.startsWith('/browser')) {
            const url = new URL(host.MainWindowBrowserManager?.m_URL || loc.href);
            return url.host + url.pathname;
        }
        if (path) return path;
    } catch (_) { /* The native window store may not be ready yet. */ }
    return doc.title || loc.pathname || loc.href || 'unknown';
}

function windowIdentity(win, doc) {
    const nativeName = String(win.name || '').trim();
    if (nativeName) return `name:${nativeName}`;
    try {
        let id = win.sessionStorage.getItem(WINDOW_ID_KEY);
        if (!id) {
            id = `tab:${win.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
            win.sessionStorage.setItem(WINDOW_ID_KEY, id);
        }
        return id;
    } catch (_) {
        const loc = doc.location || win.location;
        return `window:${loc?.origin || loc?.href || 'unknown'}:${doc.title || ''}`;
    }
}

export function describePicked(element, { window: win = globalThis.window, colorMode = readColorMode(element?.ownerDocument || globalThis.document) } = {}) {
    if (!nodeElement(element)) return null;
    const doc = element.ownerDocument || win.document;
    const targetWindow = doc.defaultView || win;
    const loc = doc.location || targetWindow.location;
    const rootWindowId = windowIdentity(win, win.document);
    let href = '';
    try { href = String(loc.href || ''); } catch (_) { /* Unreadable cross-origin URL. */ }
    return {
        id: makeId(win),
        selectionId: makeId(win),
        route: storePageKey(targetWindow, doc),
        windowId: rootWindowId,
        selector: selectorFor(element, targetWindow),
        context: contextFor(element, targetWindow),
        colorMode: colorMode === 'light' || colorMode === 'dark' ? colorMode : null,
        window: {
            id: rootWindowId,
            name: String(win.name || ''),
            title: String(win.document?.title || ''),
            href
        }
    };
}

export function isPickerDocument(href, name = '', title = '') {
    return /^about:srcdoc(?:[?#]|$)/i.test(String(href || '')) ||
        /^atoms_annotation(?:_manager)?_uid/i.test(String(name || '')) || BLOCKED_TITLES.has(String(title || ''));
}

export function readablePickerFrame(frameElement) {
    try {
        const window = frameElement?.contentWindow;
        const document = window?.document;
        if (!document) return null;
        const href = document.location?.href;
        const name = window.name;
        const title = document.title;
        if (isPickerDocument(href, name, title)) return null;
        return { window, document };
    } catch (_) { return null; }
}

export function shouldBlockPageEvent(event, { held = false, pending = false, pickerUi = false } = {}) {
    return !pickerUi && Boolean(held || pending || event?.altKey);
}

const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
const makeId = win => win.crypto?.randomUUID?.() || `pick-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const cssText = `
    :host { all: initial; color:var(--atoms-debug-text,rgb(var(--textLight))); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .box { position:fixed; display:none; box-sizing:border-box; border:2px dashed var(--atoms-debug-accent,rgb(var(--accent))); background:color-mix(in srgb,var(--atoms-debug-accent,rgb(var(--accent))) 8%,transparent); box-shadow:0 0 0 1px var(--atoms-debug-border,rgb(var(--backgroundLight))),0 0 18px color-mix(in srgb,var(--atoms-debug-accent,rgb(var(--accent))) 42%,transparent); pointer-events:none; }
    .label { position:absolute; left:-2px; top:-24px; max-width:min(420px,calc(100vw - 16px)); padding:4px 6px; border-radius:4px; color:var(--atoms-debug-text,rgb(var(--textLight))); background:var(--atoms-debug-raised,rgb(var(--background))); box-shadow:0 2px 6px color-mix(in srgb,var(--atoms-debug-overlay,rgb(var(--backgroundOverlay))) 50%,transparent); font:600 11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; letter-spacing:.02em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .shield { position:fixed; inset:0; z-index:1; display:none; pointer-events:none; background:transparent; }
    .shield.is-on { display:block; pointer-events:auto; cursor:crosshair; }
    .scrim { position:fixed; inset:0; z-index:2; display:none; pointer-events:none; background:transparent; }
    .scrim.is-on { display:block; pointer-events:auto; }
    .note { position:fixed; z-index:3; display:none; box-sizing:border-box; width:min(380px,calc(100vw - 16px)); padding:10px; border:1px solid var(--atoms-debug-border,rgb(var(--backgroundLight))); border-radius:8px; color:var(--atoms-debug-text,rgb(var(--textLight))); background:var(--atoms-debug-surface,rgb(var(--backgroundDarkish))); box-shadow:0 10px 32px color-mix(in srgb,var(--atoms-debug-overlay,rgb(var(--backgroundOverlay))) 55%,transparent); color-scheme:var(--atoms-debug-scheme,dark); font:500 12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; pointer-events:auto; }
    .note.is-open { display:block; }
    .note-title { margin-bottom:6px; font-weight:700; color:var(--atoms-debug-heading,rgb(var(--textLightest))); }
    .note-hint { margin-bottom:8px; color:var(--atoms-debug-muted,rgb(var(--textLightish))); font-size:11px; }
    .note-hint.is-error { color:var(--atoms-debug-error,rgb(var(--textAccented))); }
    .note-frame { display:block; box-sizing:border-box; width:100%; height:36px; border:0; border-radius:4px; background:transparent; pointer-events:auto; }
    .actions { display:flex; justify-content:flex-end; gap:6px; margin-top:8px; }
    .button { min-height:28px; padding:4px 10px; border:1px solid var(--atoms-debug-border,rgb(var(--backgroundLight))); border-radius:4px; color:var(--atoms-debug-text,rgb(var(--textLight))); background:var(--atoms-debug-raised,rgb(var(--background))); font:600 11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; cursor:pointer; pointer-events:auto; }
    .button:hover,.button:focus-visible { border-color:var(--atoms-debug-accent,rgb(var(--accent))); background:var(--atoms-debug-hover,rgb(var(--backgroundLightish))); outline:none; }
    .button.primary { color:var(--atoms-debug-on-accent,rgb(var(--textOnAccent))); border-color:var(--atoms-debug-accent,rgb(var(--accent))); background:var(--atoms-debug-accent,rgb(var(--accent))); }
`;

const NOTE_HINT = 'Optional note — Enter saves, even blank. Esc cancels.';

/**
 * Install the ATOMS in-client annotation picker.
 *
 * `notes` may implement list(), onChange(fn), add(record), and remove(id).
 * `pin(active, token, url)` is optional; createHoverPin(window) is the native
 * Millennium CDP adapter. `relay(metadata)` forwards a transient menu pick
 * without opening an editor. The returned controller exposes stop(), hold(),
 * and openRecord() for the ATOMS menu owner.
 */
export function installPicker({
    notes = null, pin = null, relay = null, onPicked = null, onSelection = null,
    getColorMode = null,
    onNote = null, window: win = globalThis.window, document: doc = globalThis.document,
    maxNoteLength = MAX_NOTE_LENGTH
} = {}) {
    if (!win || !doc || !doc.documentElement || isPickerDocument(win.location?.href, win.name, doc.title)) return null;
    win[PICKER_KEY]?.stop?.();

    const id = PICKER_HOST_ID;
    const host = doc.createElement('div');
    host.id = id;
    host.style.cssText = 'position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important;display:block!important';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${cssText}</style>
        <div class="box"><div class="label"></div></div>
        <div class="shield" aria-hidden="true"></div>
        <div class="scrim" aria-hidden="true"></div>
        <section class="note" role="dialog" aria-modal="true" aria-label="Add this to the ATOMS fix list">
            <div class="note-title">Add this to the ATOMS fix list</div>
            <div class="note-hint">${NOTE_HINT}</div>
            <iframe class="note-frame" title="ATOMS fix note" aria-label="Optional note for this ATOMS fix"></iframe>
            <div class="actions"><button type="button" class="button" data-act="cancel">Cancel</button><button type="button" class="button primary" data-act="save">Save</button></div>
        </section>`;
    const box = shadow.querySelector('.box'), label = shadow.querySelector('.label');
    const shield = shadow.querySelector('.shield'), scrim = shadow.querySelector('.scrim');
    const note = shadow.querySelector('.note'), hint = shadow.querySelector('.note-hint');
    const frame = shadow.querySelector('.note-frame');
    doc.documentElement.appendChild(host);

    let stopped = false, held = false, pending = null, hovered = null, pointer = null, raf = 0;
    let holdPins = [];
    const pinFn = typeof pin === 'function' ? pin : createHoverPin(win);
    let records = [];
    const tapWindows = new Map(), hookedFrames = new Map();
    const localSelections = new Map();
    const draftKey = `${DRAFT_KEY}:${windowIdentity(win, doc)}`;
    const cleanup = [];

    try { records = typeof notes?.list === 'function' ? notes.list() || [] : []; } catch (_) { records = []; }
    const unsubscribe = notes?.onChange?.(list => { records = Array.isArray(list) ? list : []; scheduleDraw(); });
    if (typeof unsubscribe === 'function') cleanup.push(unsubscribe);

    const palette = () => win.__atomsDebugPaletteV1;
    const paletteCleanups = [];
    const applyPalette = () => {
        const activePalette = palette();
        if (!activePalette?.apply) return;
        while (paletteCleanups.length) paletteCleanups.pop()();
        paletteCleanups.push(activePalette.apply(host));
        const frameRoot = frame.contentDocument?.documentElement;
        if (frameRoot) paletteCleanups.push(activePalette.apply(frameRoot));
    };
    const onPalette = () => applyPalette();
    win.addEventListener('atoms-debug-palette', onPalette);
    frame.addEventListener('load', onPalette);
    cleanup.push(() => { win.removeEventListener('atoms-debug-palette', onPalette); frame.removeEventListener('load', onPalette); while (paletteCleanups.length) paletteCleanups.pop()(); });

    const positionOffset = targetDoc => {
        let x = 0, y = 0, current = targetDoc;
        try {
            while (current?.defaultView && current.defaultView !== win) {
                const frameEl = current.defaultView.frameElement;
                if (!frameEl) break;
                const rect = frameEl.getBoundingClientRect();
                x += rect.left + frameEl.clientLeft;
                y += rect.top + frameEl.clientTop;
                current = frameEl.ownerDocument;
            }
        } catch (_) { /* Cross-origin frame offset is unavailable. */ }
        return { x, y };
    };
    const pointOf = event => {
        const eventDoc = event.view?.document || event.target?.ownerDocument || doc;
        const offset = positionOffset(eventDoc);
        return { x: Number(event.clientX || 0) + offset.x, y: Number(event.clientY || 0) + offset.y };
    };
    const rectOf = element => {
        const rect = element.getBoundingClientRect(), offset = positionOffset(element.ownerDocument);
        return { left: rect.left + offset.x, top: rect.top + offset.y, right: rect.right + offset.x, bottom: rect.bottom + offset.y, width: rect.width, height: rect.height };
    };

    const isOwnNode = element => {
        for (let node = element; node;) {
            if (node === host || OWNED_HOST_IDS.has(node.id)) return true;
            if (node.parentElement) node = node.parentElement;
            else {
                try { node = node.getRootNode()?.host || null; } catch (_) { node = null; }
            }
        }
        return false;
    };
    const elementAt = (x, y) => {
        const prior = shield.style.pointerEvents;
        if (shield.classList.contains('is-on')) shield.style.pointerEvents = 'none';
        let element;
        try { element = doc.elementFromPoint(x, y); } catch (_) { element = null; }
        shield.style.pointerEvents = prior;
        for (let depth = 0; element && String(element.tagName).toUpperCase() === 'IFRAME' && depth < 8; depth += 1) {
            let innerDoc;
            try { innerDoc = element.contentDocument; } catch (_) { break; }
            if (!innerDoc) break;
            const frameRect = rectOf(element);
            let inner = null;
            try { inner = innerDoc.elementFromPoint(x - frameRect.left - element.clientLeft, y - frameRect.top - element.clientTop); } catch (_) {}
            if (!inner) break;
            element = inner;
        }
        return nodeElement(element) && !isOwnNode(element) ? element : null;
    };

    const ownerMode = () => { try { const mode = getColorMode?.(); return mode === 'light' || mode === 'dark' ? mode : null; } catch (_) { return null; } };
    const modeFor = targetDoc => {
        const targetWin = targetDoc?.defaultView || win;
        return resolveColorMode(targetDoc, ownerMode(), element => targetWin.getComputedStyle(element));
    };
    const metaFor = (element, mode) => describePicked(element, { window: win, colorMode: mode });
    const noteFor = metadata => records.find(record => record.status !== 'done' &&
        record.route === metadata.route && record.selector === metadata.selector && record.context === metadata.context &&
        (!record.windowId || record.windowId === 'legacy:unknown' || record.windowId === metadata.windowId) &&
        (!record.colorMode || record.colorMode === metadata.colorMode)) || null;

    const scheduleDraw = () => {
        if (raf || stopped) return;
        raf = win.requestAnimationFrame(draw);
    };
    function draw() {
        raf = 0;
        if (pointer && !pending) hovered = elementAt(pointer.x, pointer.y);
        const element = pending ? pending.element : hovered;
        if (!element?.isConnected) { box.style.display = 'none'; return; }
        const rect = rectOf(element);
        if (rect.width <= 0 || rect.height <= 0) { box.style.display = 'none'; return; }
        box.style.display = 'block';
        box.style.left = `${Math.round(rect.left)}px`;
        box.style.top = `${Math.round(rect.top)}px`;
        box.style.width = `${Math.max(1, Math.round(rect.width))}px`;
        box.style.height = `${Math.max(1, Math.round(rect.height))}px`;
        const metadata = pending?.metadata || metaFor(element, modeFor(element.ownerDocument));
        const existing = noteFor(metadata);
        label.textContent = `${String(metadata.colorMode || 'theme unknown').toUpperCase()} · ${String(element.tagName).toLowerCase()} · ${pending ? 'note pending' : existing ? 'selected · Alt-click to remove' : 'Alt-click to add a note'}`;
    }

    const setHint = (text, error = false) => {
        hint.textContent = text;
        hint.classList.toggle('is-error', Boolean(error));
    };
    const input = () => {
        try { return frame.contentDocument?.querySelector('input'); } catch (_) { return null; }
    };
    const draftStorage = () => { try { return ownWindow(win).sessionStorage; } catch (_) { return null; } };
    const persistDraft = () => {
        const storage = draftStorage();
        if (!storage || !pending) return;
        try {
            const value = String(input()?.value || '');
            if (!value && !pending.saving && !pending.dirty) storage.removeItem(draftKey);
            else storage.setItem(draftKey, JSON.stringify({ metadata: pending.metadata, value, retained: pending.dirty, saveRequestId: pending.saveRequestId }));
        } catch (_) { /* The live editor still retains the draft if storage is unavailable. */ }
    };
    const clearDraft = () => { try { draftStorage()?.removeItem(draftKey); } catch (_) {} };
    const focusInput = () => {
        if (held || !pending) return;
        const field = input();
        if (!field) return;
        focusEditorInput(frame, field, {
            requestFrame: callback => win.requestAnimationFrame(callback),
            schedule: (callback, delay) => win.setTimeout(callback, delay),
            canFocus: () => !held && Boolean(pending) && frame.isConnected
        });
    };

    const closeNote = ({ cancelDraft = true } = {}) => {
        if (!pending) return;
        if (pending.saving) return false;
        if (pending.dirty && !cancelDraft) return false;
        try { onNote?.(false); } catch (_) {}
        pending = null;
        shield.classList.remove('is-on');
        scrim.classList.remove('is-on');
        note.classList.remove('is-open');
        setEditorSaving(input(), shadow.querySelectorAll('button'), false);
        const field = input(); if (field) field.value = '';
        clearDraft();
        setHint(NOTE_HINT);
        scheduleDraw();
        return true;
    };
    const openNote = (element, metadata) => {
        setEditorSaving(input(), shadow.querySelectorAll('button'), false);
        pending = { element, metadata, saveRequestId: makeId(win), dirty: false, saving: false };
        setHint(NOTE_HINT);
        const rect = element ? rectOf(element) : null;
        const width = Math.min(380, Math.max(220, win.innerWidth - 16));
        note.style.left = `${rect ? clamp(Math.round(rect.left), 8, Math.max(8, win.innerWidth - width - 8)) : Math.round((win.innerWidth - width) / 2)}px`;
        note.style.top = `${rect ? clamp(Math.round(rect.bottom + 8), 8, Math.max(8, win.innerHeight - 190)) : Math.round(win.innerHeight / 3)}px`;
        scrim.classList.add('is-on');
        note.classList.add('is-open');
        try { onNote?.(true); } catch (_) {}
        // Do not focus either the Steam window or the editor while Alt is held.
        if (!held) focusInput();
        scheduleDraw();
    };

    const submit = async () => {
        if (!pending || pending.saving) return;
        const entry = pending;
        if (entry.metadata.colorMode !== 'light' && entry.metadata.colorMode !== 'dark') {
            setHint('Theme mode is unknown. Wait for ATOMS theme colors to load before saving.', true);
            return;
        }
        const field = input();
        entry.saving = true;
        entry.dirty = true;
        setEditorSaving(field, shadow.querySelectorAll('button'), true);
        persistDraft();
        const record = {
            ...entry.metadata, saveRequestId: entry.saveRequestId, ts: Date.now(),
            note: String(field?.value || '').trim().slice(0, maxNoteLength), status: 'open'
        };
        try {
            let saved = record;
            const storedLocally = typeof notes?.add === 'function';
            if (!entry.saveCoordinator) entry.saveCoordinator = createSaveCoordinator(async payload => {
                if (storedLocally) return await notes.add(payload) || payload;
                if (typeof onPicked === 'function') {
                    const result = await onPicked(payload);
                    return result && typeof result === 'object' ? result : payload;
                }
                if (typeof relay === 'function') {
                    const result = await relay(payload);
                    return result?.record && typeof result.record === 'object' ? result.record : payload;
                }
                throw Error('Annotation store is unavailable.');
            });
            saved = await entry.saveCoordinator(record);
            localSelections.set(selectionKey(record), saved);
            entry.saving = false;
            entry.dirty = false;
            clearDraft();
            closeNote();
            try { records = typeof notes?.list === 'function' ? notes.list() || [] : [...records, saved]; }
            catch (_) { records = [...records, saved]; }
            if (storedLocally) { try { onPicked?.(saved); } catch (_) {} }
            scheduleDraw();
        } catch (error) {
            entry.saving = false;
            setEditorSaving(field, shadow.querySelectorAll('button'), false);
            entry.dirty = Boolean(field?.value);
            persistDraft();
            setHint(error?.message || 'The annotation could not be saved.', true);
            focusInput();
        }
    };

    function selectionKey(record) {
        return JSON.stringify([record.route, record.windowId, record.selector, record.context, record.colorMode]);
    }
    const removeSelected = async record => {
        try {
            const storedLocally = typeof notes?.remove === 'function';
            if (storedLocally) await notes.remove(record.id);
            else if (typeof onPicked === 'function') await onPicked({ ...record, selected: false });
            else return;
            records = typeof notes?.list === 'function' ? notes.list() || [] : records.filter(item => item.id !== record.id);
            localSelections.delete(selectionKey(record));
            if (storedLocally) { try { onPicked?.({ ...record, selected: false }); } catch (_) {} }
            scheduleDraw();
        } catch (error) {
            setHint(error?.message || 'The annotation could not be removed.', true);
        }
    };

    const pickAt = element => {
        if (!nodeElement(element) || !element.isConnected || pending) return;
        const metadata = metaFor(element, modeFor(element.ownerDocument));
        if (!metadata.colorMode) {
            openNote(element, metadata);
            setHint('Theme mode is not available yet. Cancel and select again after ATOMS theme colors load.', true);
            return;
        }
        try { onSelection?.(metadata); } catch (_) { /* Metadata observers cannot interrupt selection. */ }
        if (typeof relay === 'function') {
            relayWithAck(relay, metadata).catch(error => {
                if (stopped || pending) return;
                openNote(element, metadata);
                pending.dirty = true;
                persistDraft();
                setHint(`${error?.message || 'The menu did not acknowledge this selection.'} Add a note and save to retry.`, true);
            });
            return;
        }
        const existing = noteFor(metadata) || localSelections.get(selectionKey(metadata));
        if (existing) { void removeSelected(existing); return; }
        openNote(element, metadata);
    };

    const updatePointer = event => {
        pointer = pointOf(event);
        if (!pending) scheduleDraw();
    };

    const eventPathOwn = event => {
        const path = event.composedPath?.() || [];
        return path.some(node => node === host || node === shield || node === note || node === frame || node === scrim || node?.getRootNode?.() === shadow);
    };
    const eat = event => {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        event.stopPropagation?.();
    };

    const snapshotHover = () => {
        const byDocument = new Map();
        for (const targetDoc of [doc, ...hookedFrames.values()].filter(Boolean)) {
            let elements = [];
            try { elements = Array.from(targetDoc.querySelectorAll(':hover')).filter(el => !isOwnNode(el)).slice(-64); } catch (_) {}
            if (!elements.length) continue;
            for (const element of elements) element.setAttribute('data-atoms-picker-hover', '');
            const targetWin = targetDoc.defaultView || win;
            const token = `atoms-${makeId(win)}`;
            targetDoc.documentElement.dataset.atomsPickerPin = token;
            let drag = null;
            try {
                drag = targetDoc.createElement('style');
                drag.textContent = 'html,html *,html *::before,html *::after{-webkit-app-region:no-drag!important}';
                (targetDoc.head || targetDoc.documentElement).appendChild(drag);
            } catch (_) {}
            byDocument.set(targetDoc, { token, elements, drag, targetWin, url: targetDoc.location?.href || '' });
        }
        return [...byDocument.values()];
    };
    const beginHold = () => {
        if (held || pending || stopped) return;
        held = true;
        holdPins = snapshotHover();
        const pinInfos = holdPins.slice();
        void activateAfterHoverPin(
            pinInfos,
            info => pinFn(true, info.token, info.url, info.targetWin),
            () => held && pinInfos.every(info => holdPins.includes(info)),
            () => shield.classList.add('is-on')
        );
    };
    const endHold = () => {
        if (!held && !holdPins.length) return;
        held = false;
        shield.classList.remove('is-on');
        for (const pinInfo of holdPins.splice(0)) {
            try { pinInfo.drag?.remove(); } catch (_) {}
            for (const element of pinInfo.elements) element.removeAttribute('data-atoms-picker-hover');
            try { delete pinInfo.targetWin.document.documentElement.dataset.atomsPickerPin; } catch (_) {}
            try { Promise.resolve(pinFn(false, pinInfo.token, pinInfo.url, pinInfo.targetWin)).catch(() => {}); } catch (_) {}
        }
        if (pending) focusInput();
    };

    const onMove = event => {
        if (event.altKey && !held && !pending) beginHold();
        updatePointer(event);
        if (held || pending) {
            // Suppress the pointer move before it can reach the page; the overlay
            // remains visually transparent and pointer-hit-tests the page below.
            eat(event);
            if (held && !event.altKey) endHold();
        }
    };
    const onGesture = event => {
        if (event.type === 'pointermove') updatePointer(event);
        const inPicker = eventPathOwn(event);
        if (inPicker) {
            eat(event);
            const path = event.composedPath?.() || [];
            if (event.type === 'click') {
                const action = path.find(node => node?.dataset?.act)?.dataset?.act;
                if (action === 'save') void submit();
                else if (action === 'cancel') closeNote();
                else if (path.includes(scrim)) closeNote();
                else if (held && event.button === 0 && !pending) {
                    const point = pointOf(event);
                    pickAt(elementAt(point.x, point.y));
                }
            }
            return;
        }
        if (held && !event.altKey && event.type !== 'keyup') {
            eat(event); endHold(); return;
        }
        if (event.altKey && !held && !pending) beginHold();
        if (!shouldBlockPageEvent(event, { held, pending: Boolean(pending), pickerUi: false })) return;
        eat(event);
        if (event.type === 'click' && event.button === 0 && !pending) {
            const point = pointOf(event);
            pickAt(elementAt(point.x, point.y));
        }
    };
    const onKeyDown = event => {
        if (event.key === 'Escape' && pending) { eat(event); closeNote(); return; }
        if (event.key === 'Alt') {
            if (!event.repeat) { eat(event); beginHold(); }
            return;
        }
        if (held || pending) eat(event);
    };
    const onKeyUp = event => {
        if (event.key === 'Alt') { eat(event); endHold(); return; }
        if (held || pending) eat(event);
    };
    const onWindowBlur = () => endHold();
    const onVisibility = () => { if (doc.hidden) endHold(); };
    const onViewport = () => scheduleDraw();
    const listenWindow = targetWin => {
        if (!targetWin || tapWindows.has(targetWin)) return;
        const listeners = [];
        const add = (target, type, fn, options = true) => { target.addEventListener(type, fn, options); listeners.push([target, type, fn, options]); };
        add(targetWin, 'keydown', onKeyDown, true); add(targetWin, 'keyup', onKeyUp, true);
        add(targetWin, 'mousemove', onMove, { capture: true, passive: false });
        for (const type of [...GESTURES, 'click']) add(targetWin, type, onGesture, true);
        add(targetWin, 'scroll', onViewport, true);
        tapWindows.set(targetWin, listeners);
    };
    const hookFrames = () => {
        for (const frameEl of doc.querySelectorAll('iframe')) {
            const frame = readablePickerFrame(frameEl);
            if (!frame) continue;
            const { window: frameWin, document: frameDoc } = frame;
            listenWindow(frameWin);
            hookedFrames.set(frameWin, frameDoc);
        }
        for (const [frameWin, frameDoc] of [...hookedFrames]) {
            let sameDoc = false;
            try { sameDoc = frameWin.document === frameDoc && frameWin.frameElement?.isConnected; } catch (_) {}
            if (sameDoc) continue;
            for (const [target, type, fn, options] of tapWindows.get(frameWin) || []) {
                try { target.removeEventListener(type, fn, options); } catch (_) {}
            }
            tapWindows.delete(frameWin); hookedFrames.delete(frameWin);
        }
    };
    listenWindow(win);
    const frameTimer = win.setInterval(hookFrames, 500);
    hookFrames();

    let boundField = null;
    function onFrameLoad() {
        applyPalette();
        const field = input();
        if (field && field !== boundField) {
            boundField = field;
            field.addEventListener('input', () => {
                if (!pending) return;
                pending.dirty = Boolean(field.value);
                persistDraft();
            });
            field.addEventListener('keydown', event => {
                handleEditorKey(event, { submit, cancel: closeNote, consume: eat });
            });
        }
        if (!pending) {
            try {
                const saved = JSON.parse(draftStorage()?.getItem(draftKey) || 'null');
                if (saved?.metadata?.colorMode && typeof saved.value === 'string' && (saved.value || saved.retained)) {
                    openNote(null, saved.metadata);
                    pending.saveRequestId = String(saved.saveRequestId || makeId(win));
                    pending.dirty = true;
                    if (field) field.value = saved.value.slice(0, maxNoteLength);
                    persistDraft();
                }
            } catch (_) { /* Ignore malformed stale session draft. */ }
        }
        if (pending && !held) focusInput();
    }
    // Listen before assigning srcdoc: Chromium can complete an empty srcdoc quickly.
    frame.addEventListener('load', onFrameLoad);
    cleanup.push(() => frame.removeEventListener('load', onFrameLoad));
    frame.srcdoc = `<!doctype html><html><head><style>
        html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}
        input{box-sizing:border-box;width:100%;height:36px;padding:7px 9px;border:1px solid var(--atoms-debug-border,rgb(var(--backgroundLight)));border-radius:4px;outline:none;color:var(--atoms-debug-text,rgb(var(--textLight)));background:var(--atoms-debug-input,rgb(var(--backgroundDarkest)));color-scheme:var(--atoms-debug-scheme,dark);font:500 12px/1.25 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        input:focus{border-color:var(--atoms-debug-accent,rgb(var(--accent)));box-shadow:0 0 0 2px color-mix(in srgb,var(--atoms-debug-accent,rgb(var(--accent))) 23%,transparent)}
    </style></head><body><input type="text" maxlength="${Math.max(1, Math.min(800, maxNoteLength))}" autocomplete="off" placeholder="e.g. reset to vanilla size / should be pink"></body></html>`;
    shield.addEventListener('mousemove', onMove);
    for (const type of GESTURES) shield.addEventListener(type, onGesture, { passive: false });

    const observe = new win.MutationObserver(() => {
        if (!host.isConnected && !stopped) doc.documentElement?.appendChild(host);
    });
    observe.observe(doc.documentElement, { childList: true });
    cleanup.push(() => observe.disconnect());

    const stop = () => {
        if (stopped) return true;
        if (!canStopWithDraft(api.hasDirtyDraft(), Boolean(pending?.saving))) { persistDraft(); return false; }
        stopped = true;
        api.stopped = true;
        endHold();
        if (raf) win.cancelAnimationFrame(raf);
        win.clearInterval(frameTimer);
        observe.disconnect();
        for (const listeners of tapWindows.values()) for (const [target, type, fn, options] of listeners) {
            try { target.removeEventListener(type, fn, options); } catch (_) {}
        }
        tapWindows.clear(); hookedFrames.clear();
        if (pending) closeNote();
        for (const fn of cleanup.splice(0)) { try { fn(); } catch (_) {} }
        host.remove();
        if (win[PICKER_KEY]?.stop === stop) delete win[PICKER_KEY];
        return true;
    };
    const api = {
        version: 1, stopped: false, stop,
        hold: active => active ? beginHold() : endHold(),
        openRecord(record) { if (!pending) openNote(null, { ...record }); },
        isHeld: () => held,
        current: () => pending?.metadata || (hovered ? metaFor(hovered, modeFor(hovered.ownerDocument)) : null),
        hasDirtyDraft: () => Boolean(pending && (pending.dirty || pending.saving || String(input()?.value || '').length > 0)),
    };
    win[PICKER_KEY] = api;
    win.addEventListener('blur', onWindowBlur);
    doc.addEventListener('visibilitychange', onVisibility);
    cleanup.push(() => { win.removeEventListener('blur', onWindowBlur); doc.removeEventListener('visibilitychange', onVisibility); });
    applyPalette();
    return api;
}

export { createHoverPin };

export function stopPicker(win = globalThis.window) {
    return win?.[PICKER_KEY]?.stop?.() ?? true;
}
