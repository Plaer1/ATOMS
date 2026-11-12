import { annotationStore, MAX_NOTE_LENGTH } from './store.js';
import { installPicker, stopPicker } from './picker.js';
import { pinHover, unpinHover } from './hover-pin.js';
import { exportTOON, ANNOTATION_EXPORT_REMINDER } from './grouped-export.js';
import { untether, windowRect, mouseAt, moveSelf, FLOATING } from './untether.js';
import { installDebugPalette } from '../utilities/debugPalette.js';

const API = '__atomsAnnotationMenuV1';
const PICKER = '__atomsAnnotationPickerV1';
const PILL_NAME = /^atoms_annotator_pill_/;
const STATE_PREFIX = 'atoms.annotator.window.v1:';
const CHANNEL_NAME = 'atoms.annotator.window.v1';
const WEB_MESSAGE = 'atoms-annotation-owner-v1';
const POPUP_FLAG = 1 << 16;
const SUPPORTED_BP = /^(?:MainMenu|QuickAccess)_uid\d+$/;
const HOST_ID = 'atoms-annotation-menu-host';
const MAIN_WINDOW = 'SP Desktop_uid0';
const LOGIN_WINDOW = /^SP DesktopLoginWindow(?:_uid\d+)?$/;
const CWP_SEEN_KEY = 'atoms.annotator.cwp.v1';

const clean = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const later = (fn, ms = 400) => setTimeout(fn, ms);
const nativeWindowId = win => String(win?.name || document.title || 'steam-window').slice(0, 512);
const stateKey = name => `${STATE_PREFIX}${encodeURIComponent(name)}`;
const readState = key => {
    try { const state = JSON.parse(localStorage.getItem(key) || '{}'); return state && typeof state === 'object' ? state : {}; }
    catch (_) { return {}; }
};
const writeState = (key, patch) => {
    try { localStorage.setItem(key, JSON.stringify({ ...readState(key), ...patch })); return true; }
    catch (_) { return false; }
};
export const route = (win = window) => {
    try {
        const loc = win.document?.location || win.location;
        if (/^https?:$/.test(loc.protocol) && loc.host !== 'steamloopback.host') return loc.host + loc.pathname;
        const shared = win.opener || win;
        const instance = shared.SteamUIStore?.WindowStore?.GetWindowInstanceFromWindow?.(win);
        const historyPath = instance?.m_history?.location?.pathname;
        if (historyPath && !historyPath.startsWith('/browser')) return historyPath;
        // A popup may expose the main window through its opener/shared context;
        // that alone does not make the popup the main BrowserView owner.
        const mainOwner = win.name === MAIN_WINDOW;
        if (historyPath?.startsWith('/browser') || mainOwner) {
            const href = shared.MainWindowBrowserManager?.m_URL || '';
            try { const parsed = new URL(href); if (/^https?:$/.test(parsed.protocol) && parsed.host !== 'steamloopback.host') return parsed.host + parsed.pathname; } catch (_) {}
        }
        return historyPath || win.document?.title || loc.pathname || loc.href || 'unknown';
    } catch (_) { return win.location?.pathname || 'unknown'; }
};

export function nativeDocumentRoute(win = window) {
    try {
        const loc = win.document?.location || win.location;
        if (/^https?:$/.test(loc.protocol) && loc.host !== 'steamloopback.host') return loc.host + loc.pathname;
        const shared = win.opener || win;
        const path = shared.SteamUIStore?.WindowStore?.GetWindowInstanceFromWindow?.(win)?.m_history?.location?.pathname;
        if (path && !path.startsWith('/browser')) return path;
        return win.document?.title || loc.pathname || loc.href || 'unknown';
    } catch (_) { return win.location?.pathname || 'unknown'; }
}

export function jumpInDocument(record, doc = document, win = window, expectedRoute = route(win)) {
    if (!record || record.route !== expectedRoute) return 'Open the page and window recorded for this note to jump to it.';
    const find = selector => { try { return selector ? [...doc.querySelectorAll(selector)] : []; } catch (_) { return []; } };
    let matches = find(record.selector);
    if (matches.length !== 1 && record.context) matches = find(record.context);
    if (matches.length !== 1 || !matches[0]?.isConnected) return 'No single element matches this note on the current page.';
    const element = matches[0];
    element.scrollIntoView?.({ block: 'center', inline: 'center' });
    const prior = { outline: element.style?.outline || '', outlineOffset: element.style?.outlineOffset || '' };
    if (element.style) { element.style.outline = '2px solid var(--accent, currentColor)'; element.style.outlineOffset = '2px'; }
    setTimeout(() => { if (!element.isConnected || !element.style) return; element.style.outline = prior.outline; element.style.outlineOffset = prior.outlineOffset; }, 1800);
    return '';
}
const palette = (win = window) => {
    try {
        const computed = win.getComputedStyle(win.document.documentElement);
        const vars = {};
        for (let i = 0; i < computed.length; i++) {
            const name = computed[i];
            if (name.startsWith('--')) vars[name] = computed.getPropertyValue(name).trim();
        }
        for (const name of ['--atoms-color-scheme', '--atoms-color-mode']) {
            vars[name] ||= computed.getPropertyValue(name).trim();
        }
        return vars;
    } catch (_) { return { '--atoms-color-scheme': 'dark' }; }
};
const themeLinks = (doc = document) => Array.from(doc.querySelectorAll('link[rel~="stylesheet"]')).filter(link =>
    /(?:millennium\.host\/v1\/)?themes\/ATOMS(?:\/|$)/i.test(String(link.href || link.getAttribute('href') || '')));
const lightLinks = (doc = document) => Array.from(doc.querySelectorAll('link[rel~="stylesheet"]')).filter(link => /\/ATOMS\/css\/lightMode\.css(?:[?#]|$)/i.test(String(link.href || link.getAttribute('href') || '')));
export const currentMode = (win = window) => { try { const mode = win.getComputedStyle(win.document.documentElement).getPropertyValue('--atoms-color-mode').trim(); return mode === 'light' || mode === 'dark' ? mode : null; } catch (_) { return null; } };

export function isLoginWindow(win = window) {
    return LOGIN_WINDOW.test(String(win?.name || ''));
}

export function createColorPreview(doc = document, win = window) {
    let mode = null, ownLink = null;
    const originals = new Map();
    const links = () => lightLinks(doc);
    const restore = () => {
        for (const [link, media] of originals) if (link.isConnected && link.media !== media) link.media = media;
        originals.clear(); ownLink?.remove(); ownLink = null;
    };
    const apply = next => {
        mode = next === 'light' || next === 'dark' ? next : null;
        if (mode === null) { restore(); return currentMode(win); }
        let current = links();
        if (mode === 'light' && !current.length) {
            const source = themeLinks(doc).find(link => /configDefaults\.css(?:[?#]|$)/i.test(String(link.href || '')));
            ownLink = doc.createElement('link'); ownLink.rel = 'stylesheet';
            ownLink.href = source ? String(source.href).replace(/configDefaults\.css(?:[?#].*)?$/i, 'lightMode.css') : 'https://millennium.host/v1/themes/ATOMS/css/lightMode.css';
            ownLink.dataset.atomsDebugColorMode = ''; doc.head?.appendChild(ownLink); current = links();
        }
        for (const link of current) {
            if (!originals.has(link)) originals.set(link, link.media);
            const media = mode === 'light' ? '' : 'not all';
            if (link.media !== media) link.media = media;
        }
        return currentMode(win);
    };
    const observer = typeof MutationObserver === 'function' && doc.head ? new MutationObserver(records => {
        if (mode && records.some(record => [...record.addedNodes || []].some(node => node.tagName === 'LINK' || node.querySelector?.('link')))) apply(mode);
    }) : null;
    observer?.observe(doc.head, { childList: true, subtree: true });
    return { set: apply, get: () => mode, stop() { observer?.disconnect(); mode = null; restore(); } };
}

function setThemeDisabled(disabled, doc = document) {
    const weak = window.__atomsAnnotationThemeSheets ||= new WeakMap();
    for (const link of themeLinks(doc)) {
        if (disabled) {
            if (!weak.has(link)) weak.set(link, link.disabled);
            link.disabled = true;
        } else if (weak.has(link)) {
            link.disabled = weak.get(link);
            weak.delete(link);
        }
    }
}

function isSupportedBrowserViewPopup(href) {
    try { const url = new URL(href); const params = url.searchParams;
        return url.protocol === 'about:' && url.pathname === 'blank' && !url.hash &&
            [...params.keys()].length === 3 && ['browserviewpopup','requestid','parentpopup'].every(k => params.getAll(k).length === 1) &&
            params.get('browserviewpopup') === '1' && /^\d+$/.test(params.get('requestid') || '') && /^\d+$/.test(params.get('parentpopup') || '');
    } catch (_) { return false; }
}


export function fitPillSize({ barWidth = 286, barHeight = 46, panelWidth = 0, panelHeight = 0, composeWidth = 0, composeHeight = 0, maxWidth = 520, maxHeight = 720 } = {}) {
    const floatingWidth = Math.min(maxWidth, Math.max(panelWidth, composeWidth));
    const floatingHeight = Math.min(maxHeight, Math.max(panelHeight, composeHeight));
    return { width: Math.ceil(Math.max(barWidth, floatingWidth)), height: Math.ceil(barHeight + (floatingHeight ? floatingHeight + 6 : 0)) };
}

export function applyPaletteToHost(host, vars) {
    if (!host?.style || !vars || typeof vars !== 'object') return;
    for (const [name, value] of Object.entries(vars)) {
        if (/^--[\w-]+$/.test(name) && typeof value === 'string' && value.length < 512) host.style.setProperty(name, value);
    }
}

const OPPOSITE_BUTTON_ROLES = Object.freeze({
    surface: 'raised', text: 'text', border: 'border', accent: 'accent',
    hover: 'hover', scheme: 'scheme',
});

export function applyOppositePaletteToButton(button, palette) {
    if (!button?.style?.setProperty || !palette || typeof palette !== 'object') return;
    for (const [role, key] of Object.entries(OPPOSITE_BUTTON_ROLES)) {
        const value = palette[key];
        if (typeof value === 'string' && value.length < 512) button.style.setProperty(`--atoms-preview-${role}`, value);
    }
    button.dataset.paletteReady = 'true';
}

export function handleBrowserDocumentHello(message, previewMode, resetPreview, sendState) {
    if (message?.kind !== 'hello') return false;
    if (previewMode === 'light' || previewMode === 'dark') resetPreview?.();
    sendState?.();
    return true;
}

export function cwpStartupVerdict(win = window, storage = win.localStorage) {
    const host = win.opener || win;
    try {
        if (host.__cwpCreateFlags?.[win.name] != null) {
            storage?.setItem(CWP_SEEN_KEY, '1');
            return 'final';
        }
    } catch (_) { /* Continue with the plugin's shared verdict. */ }
    const decision = host.__cwpDecision || win.__cwpDecision;
    if (decision) return decision === 'rebuild' ? 'rebuild' : 'final';
    let seen = false;
    try { seen = storage?.getItem(CWP_SEEN_KEY) === '1'; } catch (_) {}
    const installed = Boolean(host.PLUGIN_LIST?.['steam-change-window-params']);
    if (!seen && !installed) return 'final';
    try { if (installed) storage?.setItem(CWP_SEEN_KEY, '1'); } catch (_) {}
    return 'pending';
}

export async function waitForCwpFinalWindow(win = window, { storage = win.localStorage, delay = ms => new Promise(resolve => setTimeout(resolve, ms)), maxWait = 3000 } = {}) {
    const initial = cwpStartupVerdict(win, storage);
    if (initial !== 'pending') return initial === 'final';
    for (let elapsed = 0; elapsed < maxWait; elapsed += 100) {
        await delay(100);
        const host = win.opener || win;
        if (host.__cwpCreateFlags?.[win.name] != null) return true;
        const decision = host.__cwpDecision || win.__cwpDecision;
        if (decision) return decision !== 'rebuild';
    }
    return true;
}

export function deferCwpInstall(win, onFinalWindow, options = {}) {
    let cancelled = false;
    const onPageHide = () => gate.stop();
    const gate = {
        version: 1, stopped: false, pendingCwp: true,
        stop() {
            if (cancelled) return true;
            cancelled = true; gate.stopped = true;
            win.removeEventListener('pagehide', onPageHide);
            return true;
        },
    };
    win.addEventListener('pagehide', onPageHide, { once: true });
    waitForCwpFinalWindow(win, options).then(allowed => {
        win.removeEventListener('pagehide', onPageHide);
        gate.pendingCwp = false;
        if (!cancelled && allowed) onFinalWindow();
        else if (!cancelled) gate.stopped = true;
    });
    return gate;
}

export function shouldSubmitComposer(event) {
    return event?.key === 'Enter' && !event.shiftKey && !event.altKey && !event.isComposing && event.keyCode !== 229;
}

export async function waitForPickerRelease(win = window, timeoutMs = 5000, delay = ms => new Promise(resolve => setTimeout(resolve, ms))) {
    const picker = win[PICKER];
    if (!picker?.isHeld?.()) return true;
    const interval = 20;
    for (let elapsed = 0; elapsed < timeoutMs; elapsed += interval) {
        await delay(Math.min(interval, timeoutMs - elapsed));
        if (!picker.isHeld?.()) return true;
    }
    return !picker.isHeld?.();
}

export async function focusComposerAfterShow({ win = window, field, fit, bringToFront, blocked = () => false, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    await delay(60);
    if (!field || blocked()) return false;
    fit?.();
    if (blocked()) return false;
    try {
        win.SteamClient?.Window?.ShowWindow?.();
        if (blocked()) return false;
        win.SteamClient?.Window?.BringToFront?.();
        win.SteamClient?.Window?.MarkLastFocused?.();
        await win.SteamClient?.Window?.SetKeyFocus?.(true);
    } catch (_) { /* The DOM field can still accept focus if native focus is unavailable. */ }
    if (blocked()) return false;
    try { await bringToFront?.(); } catch (_) { /* A targeted CDP handoff is best-effort; retain the editor draft. */ }
    await delay(40);
    if (blocked()) return false;
    try { field.focus({ preventScroll: true }); } catch (_) { field.focus?.(); }
    return true;
}

function withinCdp(promise, timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('CDP request timed out')), timeoutMs);
        Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer));
    });
}

export async function bringExactPillToFront(cdp, { name, title, url, marker, isAllowed = () => true } = {}) {
    if (!cdp?.send || !PILL_NAME.test(name || '') || !title || !url || !marker || !isAllowed()) return false;
    let targetInfos = [];
    try { ({ targetInfos = [] } = await withinCdp(cdp.send('Target.getTargets', {}))); }
    catch (_) { return false; }
    if (!isAllowed()) return false;
    // PopupManager exposes the native creation URL in TargetInfo, while the
    // finished popup document reports its steamloopback URL. Verify URL only
    // after attaching and evaluating the exact native window.
    const candidates = targetInfos.filter(target => target.type === 'page' && target.title === title);
    const expression = `JSON.stringify({name:window.name,title:document.title,url:location.href,marker:window.__atomsAnnotationOwner?.focusMarker||''})`;
    for (const target of candidates) {
        let sessionId = null;
        try {
            ({ sessionId } = await withinCdp(cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })));
            if (!sessionId) continue;
            const result = await withinCdp(cdp.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId));
            let identity;
            try { identity = JSON.parse(result?.result?.value || 'null'); } catch (_) { identity = null; }
            if (identity?.name !== name || identity?.title !== title || identity?.url !== url || identity?.marker !== marker || !isAllowed()) continue;
            await withinCdp(cdp.send('Page.bringToFront', {}, sessionId));
            return true;
        } catch (_) {
            // A closed or replacement target is not grounds to focus another page.
        } finally {
            if (sessionId) { try { await withinCdp(cdp.send('Target.detachFromTarget', { sessionId })); } catch (_) {} }
        }
    }
    return false;
}

export function handleAcknowledgedPinRequest(message, { pin, unpin, acknowledge } = {}) {
    if (message?.kind !== 'pin' || !message.requestId) return Promise.resolve(false);
    const release = !message.active;
    let operation;
    try { operation = release ? unpin?.(message.token) : pin?.(message.token, message.url); }
    catch (error) { operation = Promise.reject(error); }
    return Promise.resolve(operation).then(value => {
        acknowledge?.({ kind: 'ack', requestId: message.requestId, ok: true, value: release ? true : Boolean(value) });
        return true;
    }, error => {
        acknowledge?.({ kind: 'ack', requestId: message.requestId, ok: false, error: error?.message || 'Hover pin failed.' });
        return false;
    });
}

export function createAcknowledgedRequests(post, timeoutMs = 10000) {
    const pending = new Map(); let nextId = 0, closed = false;
    return {
        request(kind, detail = {}) {
            if (closed) return Promise.reject(Error('The annotation window is closed.'));
            const requestId = `atoms-rpc-${++nextId}`;
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => { pending.delete(requestId); reject(Error('Steam did not acknowledge the annotation change. Your note is still available in the editor.')); }, timeoutMs);
                pending.set(requestId, { resolve, reject, timer });
                try { post({ kind, requestId, ...detail }); } catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error); }
            });
        },
        receive(message) {
            if (message?.kind !== 'ack') return false;
            const slot = pending.get(message.requestId); if (!slot) return true;
            pending.delete(message.requestId); clearTimeout(slot.timer);
            if (message.ok) slot.resolve(message.value); else slot.reject(Error(message.error || 'The annotation change was not saved.'));
            return true;
        },
        close() {
            closed = true;
            for (const slot of pending.values()) { clearTimeout(slot.timer); slot.reject(Error('The annotation window closed before saving.')); }
            pending.clear();
        },
    };
}

export function resolveMenuOwner(win = window, manager = null) {
    const popupManager = manager || win.g_PopupManager || win.opener?.g_PopupManager || globalThis.g_PopupManager;
    try { const popup = popupManager?.GetPopupForWindow?.(win); const owner = popup?.params?.owner_window; if (owner && owner !== win && owner.name && owner.name !== 'SharedJSContext') return String(owner.name); } catch (_) {}
    const openerName = String(win.opener?.name || '');
    if (openerName && openerName !== win.name && openerName !== 'SharedJSContext') return openerName;
    const nativeMenu = win.document?.documentElement?.classList?.contains('MillenniumWindow_ContextMenu');
    if (nativeMenu && /(?:_uid0$|^(?:MainMenu|QuickAccess)_uid0$)/i.test(win.name || '')) return MAIN_WINDOW;
    if (nativeMenu && /(?:Supernav|Steam Menu|Account Menu|Sign in)/i.test(win.document?.title || '')) return MAIN_WINDOW;
    return '';
}

export function isMenuWindow(win = window, doc = document) {
    const href = String(win.location?.href || '');
    if (SUPPORTED_BP.test(win.name || '') && isSupportedBrowserViewPopup(href)) return false;
    if (doc.documentElement?.classList?.contains('MillenniumWindow_ContextMenu')) return true;
    const nativeBlank = /^about:blank(?:[?#]|$)/i.test(href) || /^steamloopback:/i.test(href);
    if (nativeBlank && /^(?:contextmenu|MainMenu|QuickAccess|notificationtoasts|tooltip|desktopoverlay)/i.test(win.name || '')) return true;
    if (nativeBlank && (Number(/(?:[?&])createflags=(\d+)/i.exec(href)?.[1] || 0) & POPUP_FLAG)) return true;
    return nativeBlank && /(?:Menu|Supernav)$|^Sign in/i.test(doc.title || '');
}

function isMainWebView(win = window) {
    try { return Boolean(win.SteamClient?.BrowserView && /^https?:$/.test(win.location.protocol) && win.location.host !== 'steamloopback.host'); }
    catch (_) { return false; }
}

function installOwner() {
    const win = window, doc = document;
    const id = nativeWindowId(win), key = stateKey(id), shared = win.opener || win;
    const state = readState(key);
    if (!Object.prototype.hasOwnProperty.call(state, 'annotator')) writeState(key, { annotator: true, themeOff: false });
    let values = readState(key);
    let stopped = false, pill = null, webLink = null;
    const preview = createColorPreview(doc, win);
    const debugPalette = installDebugPalette({ window: win });
    const initialDebugPalette = debugPalette?.snapshot?.();
    let oppositePalette = currentMode(win) && initialDebugPalette?.mode === currentMode(win) ? initialDebugPalette.counterpart : null;
    let previewMode = null, lastKnownMode = currentMode(win);
    const mode = () => { const live = currentMode(win); if (live) lastKnownMode = live; return live || lastKnownMode; };
    const ownerChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;
    const closePill = () => { try { pill?.close(); } catch (_) {} pill = null; };
    const setAnnotator = on => {
        if (!on && (win[PICKER]?.hasDirtyDraft?.() || browserDraftOpen || pill?.__atomsAnnotationMenu?.hasDirtyDraft?.())) { pill?.__atomsAnnotationMenu?.setStatus?.('Save or cancel the open note before turning the annotator off.'); return false; }
        values = { ...values, annotator: Boolean(on) }; writeState(key, values);
        sync(); ownerChannel?.postMessage({ kind: 'state', owner: id, ...values, previewMode, palette: palette(win), oppositePalette, notes: annotationStore.list() });
    };
    const setTheme = off => {
        const before = currentMode(win); if (before) lastKnownMode = before;
        values = { ...values, themeOff: Boolean(off) }; writeState(key, values);
        setThemeDisabled(values.themeOff, doc);
        debugPalette?.refresh?.();
        const after = currentMode(win); if (after) lastKnownMode = after;
        webLink?.send();
        ownerChannel?.postMessage({ kind: 'state', owner: id, ...values, previewMode, mode: mode(), palette: palette(win), oppositePalette, notes: annotationStore.list() });
    };
    const setPreview = next => {
        previewMode = next === 'light' || next === 'dark' ? next : null;
        preview.set(previewMode);
        debugPalette?.refresh?.();
        const after = currentMode(win); if (after) lastKnownMode = after;
        later(() => {
            const update = { kind: 'state', owner: id, ...values, previewMode, mode: mode(), palette: palette(win), oppositePalette, notes: annotationStore.list() };
            ownerChannel?.postMessage(update); webLink?.send();
        }, 80);
        return previewMode || mode();
    };
    const togglePreview = () => setPreview((previewMode || mode()) === 'light' ? 'dark' : 'light');
    const receivePick = metadata => {
        if (!metadata || typeof metadata !== 'object' || metadata.selected === false) return false;
        if (metadata.colorMode !== 'dark' && metadata.colorMode !== 'light') throw Error('The picked element has no captured dark or light mode.');
        const input = { ...metadata, windowId: metadata.windowId || id, note: metadata.note || '' };
        const duplicate = annotationStore.list().find(record => (input.saveRequestId && record.saveRequestId === input.saveRequestId) || (input.selectionId && record.selectionId === input.selectionId && record.windowId === input.windowId));
        if (duplicate) {
            if (duplicate.note !== input.note) annotationStore.update(duplicate.id, { note: input.note });
            if (pending.record?.selectionId === metadata.selectionId) { pending.record = null; try { localStorage.removeItem(`atoms.annotator.draft.v1:${encodeURIComponent(id)}`); } catch (_) {} pill?.__atomsAnnotationMenu?.completeCompose?.(metadata.selectionId); }
            return duplicate;
        }
        const saved = annotationStore.add(input);
        if (pending.record?.selectionId === metadata.selectionId) { pending.record = null; try { localStorage.removeItem(`atoms.annotator.draft.v1:${encodeURIComponent(id)}`); } catch (_) {} pill?.__atomsAnnotationMenu?.completeCompose?.(metadata.selectionId); }
        return saved;
    };
    const receiveMessage = event => {
        const message = event.data;
        if (!message || message.owner !== id) return;
        if (message.kind === 'hello') { emit(); return; }
        if (message.kind === 'jump-result') { pill?.__atomsAnnotationMenu?.setStatus?.(message.error || ''); return; }
        if (message.kind === 'pick') {
            if (message.requestId && acceptedPicks.has(message.requestId)) { ownerChannel?.postMessage({ kind: 'pick-ack', owner: id, requestId: message.requestId, ok: true }); return; }
            try {
                if (message.metadata?.saveRequestId) receivePick(message.metadata);
                else openCompose(message.metadata);
                if (message.requestId) { acceptedPicks.add(message.requestId); if (acceptedPicks.size > 128) acceptedPicks.delete(acceptedPicks.values().next().value); ownerChannel?.postMessage({ kind: 'pick-ack', owner: id, requestId: message.requestId, ok: true }); }
            } catch (error) { if (message.requestId) ownerChannel?.postMessage({ kind: 'pick-ack', owner: id, requestId: message.requestId, ok: false, error: error.message }); }
        }
    };
    if (ownerChannel) ownerChannel.addEventListener('message', receiveMessage);

    const pending = { record: null };
    const acceptedPicks = new Set();
    let browserDraftOpen = false, altHeld = false;
    const emit = () => ownerChannel?.postMessage({ kind: 'state', owner: id, ...values, previewMode, mode: mode(), palette: palette(win), oppositePalette, notes: annotationStore.list() });
    const onStorage = event => { if (event.key === key || event.key === null) { values = readState(key); sync(); } };
    const onStore = () => { webLink?.send(); emit(); };
    const unsubscribeDebugPalette = debugPalette?.subscribe?.(snapshot => {
        const knownMode = mode();
        oppositePalette = knownMode && snapshot?.mode === knownMode ? snapshot.counterpart : null;
        webLink?.send(); emit();
    });
    const addPicker = () => {
        if (values.annotator && !win[PICKER]) {
            win[PICKER] = installPicker({
                getColorMode: () => mode(),
                notes: annotationStore,
                pin: (active, token, url) => active ? pinHover(token, url) : unpinHover(token),
                onPicked: onStore,
                onNote: open => { if (open) browserDraftOpen = true; else browserDraftOpen = false; },
            });
        } else if (!values.annotator && win[PICKER]) {
            if (win[PICKER].hasDirtyDraft?.()) { values.annotator = true; writeState(key, { annotator: true }); pill?.__atomsAnnotationMenu?.setStatus?.('Save or cancel the open note before turning the annotator off.'); return false; }
            const stoppedPicker = win[PICKER].stop?.(); if (stoppedPicker === false) { values.annotator = true; writeState(key, { annotator: true }); pill?.__atomsAnnotationMenu?.setStatus?.('Save or cancel the open note before turning the annotator off.'); return false; }
            delete win[PICKER];
        }
    };
    function sync() {
        values = readState(key);
        setThemeDisabled(values.themeOff, doc);
        const liveMode = currentMode(win); if (liveMode) lastKnownMode = liveMode;
        const pickerReady = addPicker();
        if (pickerReady === false) return;
        webLink?.send();
        emit();
    }
    function openCompose(metadata) {
        if (!metadata || typeof metadata !== 'object') throw Error('The menu pick did not contain a valid target.');
        if (metadata.colorMode !== 'dark' && metadata.colorMode !== 'light') throw Error('The picked page has no captured dark or light mode.');
        const savedDraft = (() => { try { return JSON.parse(localStorage.getItem(`atoms.annotator.draft.v1:${encodeURIComponent(id)}`) || 'null'); } catch (_) { return null; } })();
        const currentDraft = pill?.__atomsAnnotationMenu?.pendingRecord?.();
        if (pending.record?.selectionId === metadata.selectionId || currentDraft?.selectionId === metadata.selectionId || savedDraft?.metadata?.selectionId === metadata.selectionId) { pill?.__atomsAnnotationMenu?.compose?.(metadata); return true; }
        if (pending.record || currentDraft || savedDraft?.metadata) throw Error('Save or cancel the current note before choosing another item.');
        pending.record = metadata;
        ownerChannel?.postMessage({ kind: 'compose', owner: id, metadata });
        try { pill?.__atomsAnnotationMenu?.compose(metadata); } catch (_) {}
        return true;
    }
    const sendAlt = alt => { try { webLink?.sendAlt(alt); } catch (_) {} };
    const onAltKey = event => {
        if (event.key !== 'Alt' || event.repeat) return;
        altHeld = event.type === 'keydown';
        sendAlt(altHeld && values.annotator);
        if (!altHeld) pill?.__atomsAnnotationMenu?.focusComposer?.();
    };
    const onBlur = () => sendAlt(false);
    const sheetWatch = new MutationObserver(() => { if (values.themeOff) setThemeDisabled(true, doc); });
    if (doc.head) sheetWatch.observe(doc.head, { childList: true });
    win.addEventListener('storage', onStorage);
    win.addEventListener('keydown', onAltKey, true);
    win.addEventListener('keyup', onAltKey, true);
    win.addEventListener('blur', onBlur);
    const unsubscribe = annotationStore.onChange(onStore);
    sync();

    const cancelCompose = selectionId => {
        if (!pending.record || pending.record.selectionId !== selectionId) return false;
        pending.record = null;
        try { localStorage.removeItem(`atoms.annotator.draft.v1:${encodeURIComponent(id)}`); } catch (_) {}
        pill?.__atomsAnnotationMenu?.completeCompose?.(selectionId);
        return true;
    };
    const hand = {
        owner: id,
        state: () => ({ ...values, previewMode, oppositePalette }),
        pageKey: () => route(win),
        receivePick,
        openCompose,
        cancelCompose,
        setAnnotator,
        setTheme,
        togglePreview,
        mode,
        palette: () => palette(win),
        oppositePalette: () => oppositePalette,
        savePosition: pos => writeState(key, { pillPos: pos }),
        notes: annotationStore,
        rect: async () => ({ ...(await windowRect(win)), hidden: doc.hidden }),
        focus: () => win.SteamClient?.Window?.SetKeyFocus?.(true),
        isAltHeld: () => altHeld,
        start: () => readState(key).pillPos || null,
        isDirty: () => Boolean(browserDraftOpen || pill?.__atomsAnnotationMenu?.hasDirtyDraft?.() || win[PICKER]?.hasDirtyDraft?.()),
        jump: record => {
            const webRoute = webLink?.route?.();
            if (webRoute && record?.route === webRoute) return webLink.jump(record);
            const localRoute = nativeDocumentRoute(win);
            if (record?.route === localRoute) return jumpInDocument(record, doc, win, localRoute);
            if (webRoute && record?.route === webRoute) return webLink.jump(record);
            return 'Open the page and window recorded for this note to jump to it.';
        },
    };
    const openPill = async () => {
        try {
            const rect = await windowRect(win);
            if (!rect || stopped) return;
            const saved = readState(key).pillPos || {};
            const left = Number.isFinite(saved.left) ? saved.left : rect.x + 24;
            const bottom = Number.isFinite(saved.bottom) ? saved.bottom : rect.y + rect.height - 24;
            const pills = shared.__atomsAnnotationPills ||= {};
            try { pills[id]?.close?.(); } catch (_) {}
            const focusMarker = win.crypto?.randomUUID?.() || '';
            const cdp = shared.MILLENNIUM_API?.ChromeDevToolsProtocol || win.MILLENNIUM_API?.ChromeDevToolsProtocol;
            const pillHand = {
                ...hand, start: { left, bottom }, focusMarker,
                bringPillToFront: isAllowed => bringExactPillToFront(cdp, {
                    name: pill?.name, title: pill?.document?.title, url: pill?.location?.href,
                    marker: focusMarker, isAllowed,
                }),
            };
            pill = untether({
                name: `atoms_annotator_pill_${id.replace(/[^\w-]/g, '_')}`,
                title: `ATOMS · ${id.slice(0, 28)}`,
                rect: { left, top: bottom - 46, width: 286, height: 46 },
                module: new URL('./menu.js', import.meta.url).href,
                entry: 'installPill', hand: pillHand, palette: palette(win), flags: FLOATING,
            });
            if (pill) pills[id] = pill;
        } catch (error) { console.error('[ATOMS annotation] Could not open control window', error); }
    };
    openPill();
    if (id === MAIN_WINDOW) webLink = linkBrowserView(win, annotationStore, () => ({ ...values, previewMode, mode: mode(), palette: palette(win) }), openCompose);

    const stop = () => {
        if (stopped) return true;
        if (browserDraftOpen || pill?.__atomsAnnotationMenu?.hasDirtyDraft?.() || win[PICKER]?.hasDirtyDraft?.()) { pill?.__atomsAnnotationMenu?.setStatus?.('Save or cancel the open note before closing annotation controls.'); return false; }
        stopped = true;
        win.removeEventListener('storage', onStorage);
        win.removeEventListener('keydown', onAltKey, true); win.removeEventListener('keyup', onAltKey, true); win.removeEventListener('blur', onBlur);
        sheetWatch.disconnect(); unsubscribe(); unsubscribeDebugPalette?.(); ownerChannel?.removeEventListener('message', receiveMessage); ownerChannel?.close();
        preview.stop(); webLink?.stop(); stopPicker(); setThemeDisabled(false, doc); closePill();
        const pills = shared.__atomsAnnotationPills; if (pills?.[id] === pill) delete pills[id];
        if (win[API]?.stop === stop) { win[API].stopped = true; delete win[API]; }
        return true;
    };
    win.addEventListener('pagehide', stop, { once: true });
    return win[API] = { version: 1, stopped: false, stop, setAnnotator, setTheme, setPreview, sync, owner: id };

    function linkBrowserView(ownerWin, notes, getState, onCompose) {
        const sharedOwner = ownerWin.opener || ownerWin;
        let browser = null;
        const send = () => {
            if (!browser) return;
            try { browser.PostMessage(WEB_MESSAGE, JSON.stringify({ owner: id, kind: 'state', ...getState(), notes: notes.list() })); } catch (_) {}
        };
        const onMessage = (name, args) => {
            if (name !== WEB_MESSAGE) return;
            try {
                const message = JSON.parse(args);
                if (handleBrowserDocumentHello(message, previewMode, () => setPreview(null), send)) return;
                if (message.kind === 'jump-result') pill?.__atomsAnnotationMenu?.setStatus?.(message.error || '');
                else if (message.kind === 'pick') onCompose(message.metadata);
                else if (message.kind === 'draft') browserDraftOpen = Boolean(message.open);
                else if (message.kind === 'jump') browser?.PostMessage(WEB_MESSAGE, JSON.stringify({ owner: id, kind: 'jump', record: message.record }));
                else if (message.kind === 'alt') sendAlt(message.alt);
                else if (['add','remove','update'].includes(message.kind)) {
                    try {
                        let value;
                        if (message.kind === 'add') value = notes.add({ ...message.record, windowId: message.record.windowId || id });
                        else if (message.kind === 'remove') value = notes.remove(message.id);
                        else value = notes.update(message.id, message.patch);
                        if (message.requestId) browser?.PostMessage(WEB_MESSAGE, JSON.stringify({ kind: 'ack', owner: id, requestId: message.requestId, ok: true, value }));
                    } catch (error) { if (message.requestId) browser?.PostMessage(WEB_MESSAGE, JSON.stringify({ kind: 'ack', owner: id, requestId: message.requestId, ok: false, error: error.message })); }
                } else if (message.kind === 'pin') {
                    void handleAcknowledgedPinRequest(message, {
                        pin: (token, url) => pinHover(token, url, ownerWin),
                        unpin: token => unpinHover(token),
                        acknowledge: ack => { if (message.requestId) browser?.PostMessage(WEB_MESSAGE, JSON.stringify({ owner: id, ...ack })); },
                    });
                }
            } catch (error) { console.error('[ATOMS annotation] BrowserView message failed', error); }
        };
        const find = () => {
            const current = sharedOwner.MainWindowBrowserManager?.m_browser || null;
            if (!current?.on || current === browser) return;
            browser?.off?.('message', onMessage); browser = current; browser.on('message', onMessage); send();
        };
        const timer = setInterval(find, 1000); find();
        return { send, route() { try { const url = new URL(sharedOwner.MainWindowBrowserManager?.m_URL || ''); return /^https?:$/.test(url.protocol) && url.host !== 'steamloopback.host' ? url.host + url.pathname : ''; } catch (_) { return ''; } }, jump(record) { try { if (!browser) return 'The Steam web page is unavailable.'; browser.PostMessage(WEB_MESSAGE, JSON.stringify({ owner: id, kind: 'jump', record })); return ''; } catch (_) { return 'The Steam web page is unavailable.'; } }, onOwnerMessage(message) { if (message.kind === 'pick') onCompose(message.metadata); }, sendAlt(alt) { try { browser?.PostMessage(WEB_MESSAGE, JSON.stringify({ owner: id, kind: 'alt', alt })); } catch (_) {} }, stop() { clearInterval(timer); browser?.off?.('message', onMessage); } };
    }
}

function installFollower() {
    const win = window;
    const owner = resolveMenuOwner(win);
    if (!owner || typeof BroadcastChannel !== 'function') return { stop() {} };
    const channel = new BroadcastChannel(CHANNEL_NAME), key = stateKey(owner);
    let values = readState(key);
    const preview = createColorPreview(document, win);
    let previewMode = null, ownerMode = null;
    const sync = () => {
        values = { ...readState(key), mode: ownerMode, previewMode };
        if (values.annotator && !win[PICKER]) {
            win[PICKER] = installPicker({ getColorMode: () => previewMode || ownerMode || currentMode(win), relay: metadata => relayPick(metadata), pin: (active, token, url) => active ? pinHover(token, url) : unpinHover(token) });
        } else if (!values.annotator && win[PICKER]) { if (win[PICKER].hasDirtyDraft?.() || win[PICKER].stop?.() === false) return; delete win[PICKER]; }
        setThemeDisabled(Boolean(values.themeOff));
        preview.set(previewMode);
    };
    const onStorage = event => { if (event.key === key || event.key === null) sync(); };
    const relayPending = new Map(); const operationIds = new Map(); const sessionId = win.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; let relaySeq = 0;
    const relayPick = async metadata => {
        if (!await waitForPickerRelease(win)) throw Error('Release Alt before opening the note editor; the selection remains available to save.');
        return new Promise((resolve, reject) => {
            const operation = metadata.saveRequestId || metadata.selectionId || `${Date.now().toString(36)}-${++relaySeq}`;
            let requestId = operationIds.get(operation);
            if (!requestId) { requestId = `pick:${sessionId}:${encodeURIComponent(operation)}`; operationIds.set(operation, requestId); }
            const timer = setTimeout(() => { relayPending.delete(requestId); reject(Error('The owner window did not accept this pick. Keep the note draft open and try again.')); }, 5000);
            relayPending.set(requestId, { resolve, reject, timer });
            channel.postMessage({ kind: 'pick', owner, requestId, metadata: { ...metadata, windowId: owner } });
        });
    };
    const onMessage = event => { if (event.data?.owner === owner && event.data.kind === 'pick-ack') { const pending = relayPending.get(event.data.requestId); if (pending) { clearTimeout(pending.timer); relayPending.delete(event.data.requestId); if (event.data.ok) pending.resolve(true); else pending.reject(Error(event.data.error || 'The owner could not accept this pick.')); } return; } if (event.data?.owner === owner && event.data.kind === 'state') { values = { ...values, ...event.data }; previewMode = event.data.previewMode ?? null; ownerMode = event.data.mode === 'light' || event.data.mode === 'dark' ? event.data.mode : null; preview.set(previewMode); sync(); } };
    win.addEventListener('storage', onStorage); channel.addEventListener('message', onMessage);
    channel.postMessage({ kind: 'hello', owner });
    sync();
    const stop = () => { if (win[PICKER]?.hasDirtyDraft?.()) return false; win.removeEventListener('storage', onStorage); channel.removeEventListener('message', onMessage); channel.close(); for (const pending of relayPending.values()) { clearTimeout(pending.timer); pending.reject(Error('The menu window closed before the pick was accepted.')); } relayPending.clear(); stopPicker(); setThemeDisabled(false); preview.stop(); if (win[API]?.stop === stop) { win[API].stopped = true; delete win[API]; } return true; };
    win.addEventListener('pagehide', stop, { once: true });
    return win[API] = { version: 1, stopped: false, stop, owner };
}

function linkWebView() {
    const view = window.SteamClient.BrowserView, listeners = new Set();
    let notes = [], values = { annotator: false, themeOff: false }, ready = false;
    const preview = createColorPreview(document, window);
    const post = message => view.PostMessageToParent(WEB_MESSAGE, JSON.stringify({ owner: MAIN_WINDOW, ...message }));
    const rpc = createAcknowledgedRequests(post);
    const request = (kind, detail) => rpc.request(kind, detail);
    const remote = {
        list: () => notes,
        add: record => request('add', { record }),
        remove: id => request('remove', { id }),
        update: (id, patch) => request('update', { id, patch }),
        onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    };
    const nativeRegister = view.RegisterForMessageFromParent, callbacks = new Set();
    view.RegisterForMessageFromParent = fn => { callbacks.add(fn); return { unregister: () => callbacks.delete(fn) }; };
    const registration = nativeRegister.call(view, (name, args) => {
        if (name !== WEB_MESSAGE) { for (const fn of callbacks) fn(name, args); return; }
        const message = JSON.parse(args);
        if (rpc.receive(message)) return;
        if (message.kind === 'state') {
            values = message; notes = message.notes || [];
            for (const fn of listeners) fn(notes);
            setThemeDisabled(Boolean(values.themeOff)); preview.set(values.previewMode || null);
            if (values.annotator && !window[PICKER]) window[PICKER] = installPicker({ notes: remote, getColorMode: () => values.previewMode === 'light' || values.previewMode === 'dark' ? values.previewMode : values.mode === 'light' || values.mode === 'dark' ? values.mode : currentMode(window), onNote: open => post({ kind: 'draft', open }), pin: (active, token, url) => request('pin', { active, token, url }) });
            else if (!values.annotator && window[PICKER]) { if (window[PICKER].hasDirtyDraft?.() || window[PICKER].stop?.() === false) { values.annotator = true; post({ kind: 'draft', open: true, blocked: true }); } else delete window[PICKER]; }
        } else if (message.kind === 'alt') window[PICKER]?.hold?.(message.alt);
        else if (message.kind === 'jump') { const error = jumpInDocument(message.record, document, window, route(window)); if (error) post({ kind: 'jump-result', error }); }
    });
    post({ kind: 'hello' });
    const onBlur = () => post({ kind: 'alt', alt: false });
    window.addEventListener('blur', onBlur);
    const stop = () => { if (window[PICKER]?.hasDirtyDraft?.()) return false; rpc.close(); registration?.unregister?.(); view.RegisterForMessageFromParent = nativeRegister; nativeRegister.call(view, (name, args) => { for (const fn of callbacks) fn(name, args); }); window.removeEventListener('blur', onBlur); stopPicker(); setThemeDisabled(false); preview.stop(); if (window[API]?.stop === stop) { window[API].stopped = true; delete window[API]; } return true; };
    return window[API] = { version: 1, stopped: false, stop };
}

const pillStyle = `
:host{all:initial;color-scheme:var(--atoms-color-scheme,dark);font:12px/1.35 "Segoe UI",sans-serif;color:rgb(var(--textLightest,234,234,234))}
*{box-sizing:border-box}button,input,textarea{font:inherit;color:inherit}button{border:1px solid rgb(var(--backgroundLight,75,75,75));border-radius:6px;background:rgb(var(--background,38,38,38));padding:7px 9px;cursor:pointer}button:hover{background:rgb(var(--backgroundLightish,55,55,55))}button[aria-pressed=true]{border-color:rgb(var(--accent,215,173,255))}button:disabled{opacity:.55;cursor:default}button[data-act=preview][data-palette-ready=true]{color:var(--atoms-preview-text);background:var(--atoms-preview-surface);border-color:var(--atoms-preview-border);color-scheme:var(--atoms-preview-scheme)}button[data-act=preview][data-palette-ready=true]:hover{background:var(--atoms-preview-hover);border-color:var(--atoms-preview-accent)}
#surface{position:fixed;inset:0;background:transparent}.bar{position:absolute;left:0;bottom:0;display:flex;gap:6px;align-items:center;padding:5px;background:rgb(var(--backgroundDarkish,28,28,28));border:1px solid rgb(var(--backgroundLight,75,75,75));border-radius:10px;box-shadow:none}.grip{width:10px;height:26px;cursor:move;opacity:.7;background:radial-gradient(circle,rgb(var(--textLightish,180,180,180)) 1px,transparent 1.5px) 0 0/5px 5px}.bar button{white-space:nowrap}.panel{position:absolute;bottom:52px;right:0;width:min(520px,calc(100vw - 12px));max-height:min(75vh,720px);overflow:auto;padding:12px;border-radius:10px;border:1px solid rgb(var(--backgroundLight,75,75,75));background:rgb(var(--backgroundDarkish,28,28,28));box-shadow:none}.panel[hidden],.compose[hidden]{display:none}.panel-head,.row-actions{display:flex;gap:6px;align-items:center;justify-content:space-between}.reminder{padding:9px 10px;margin:8px 0;border-radius:6px;background:rgb(var(--background,38,38,38));color:rgb(var(--textLight,210,210,210))}.note{padding:10px 0;border-top:1px solid rgb(var(--backgroundLight,75,75,75))}.meta,.context{font-size:11px;opacity:.8;overflow-wrap:anywhere}.mode-field{display:flex;align-items:center;gap:8px;font-size:11px;margin:6px 0}.mode-field select{background:rgb(var(--backgroundDarkest,22,22,22));border:1px solid rgb(var(--backgroundLight,75,75,75));border-radius:5px;padding:5px}.text{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}.edit,textarea{width:100%;min-height:60px;background:rgb(var(--backgroundDarkest,22,22,22));border:1px solid rgb(var(--backgroundLight,75,75,75));border-radius:5px;padding:7px}.compose{position:absolute;bottom:52px;right:0;width:min(340px,calc(100vw - 12px));padding:12px;background:rgb(var(--backgroundDarkish,28,28,28));border:1px solid rgb(var(--backgroundLight,75,75,75));border-radius:10px;box-shadow:none}.status{min-height:1.3em;padding:3px 8px;color:rgb(var(--textLightish,180,180,180))}.count{opacity:.8;font-size:11px}
`;

export function installPill() {
    if (!PILL_NAME.test(window.name) || window.__atomsAnnotationPillV1) return;
    const owner = window.__atomsAnnotationOwner;
    if (!owner?.owner) { window.close?.(); return; }
    const host = document.createElement('div'); host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${pillStyle}</style><div id="surface"><div class="bar"><span class="grip" title="Drag controls" aria-hidden="true"></span><button data-act="theme" aria-pressed="false">ATOMS ON</button><button data-act="preview" title="Preview the other palette for this session">LIGHT MODE</button><button data-act="annotator" aria-pressed="false">ANNOTATOR ON</button><button data-act="more" aria-haspopup="menu" aria-expanded="false" aria-label="Annotation options">☰</button></div><section class="panel" hidden><div class="panel-head"><strong>ATOMS annotations</strong><span class="count"></span></div><p class="reminder">${clean(ANNOTATION_EXPORT_REMINDER)}</p><div class="row-actions"><button data-act="filter" aria-pressed="true">THIS PAGE</button><button data-act="copy">COPY GROUPED NOTES</button><button data-act="import-open">IMPORT LEGACY JSON/JSONL</button><button data-act="clear-done">CLEAR HANDLED</button><button data-act="close">CLOSE</button></div><div class="status" role="status"></div><ol class="notes"></ol><div class="fallback" hidden><textarea readonly aria-label="Grouped annotation export"></textarea><div class="row-actions"><button data-act="fallback-close">CLOSE</button></div></div><div class="legacy-import" hidden><p>Paste a legacy JSON array or JSONL export. Import adds records; the original JSONL is left untouched.</p><textarea aria-label="Legacy JSON or JSONL records"></textarea><div class="row-actions"><button data-act="import-apply">IMPORT RECORDS</button><button data-act="import-cancel">CANCEL</button></div></div><div class="clear-confirm" hidden><p>Delete all handled notes? This cannot be undone.</p><button data-act="clear-yes">DELETE HANDLED</button><button data-act="clear-no">KEEP NOTES</button></div></section><section class="compose" hidden><strong>Add note</strong><div class="meta compose-meta"></div><textarea class="compose-text" maxlength="${MAX_NOTE_LENGTH}" aria-label="Annotation note" aria-keyshortcuts="Enter"></textarea><p class="meta compose-hint">Enter saves · Shift+Enter adds a line</p><div class="row-actions"><button data-act="compose-save">SAVE NOTE</button><button data-act="compose-cancel">CANCEL</button></div></section></div>`;
    document.documentElement.append(host);
    const q = selector => root.querySelector(selector), panel = q('.panel'), notesList = q('.notes');
    const editDraftKey = `atoms.annotator.edit-draft.v1:${encodeURIComponent(owner.owner)}`;
    let onlyPage = true, editing = null, editDraft = null, editColorMode = null, confirming = null, pending = null, currentNotes = [], position = owner.start || { left: 16, bottom: 80 }, currentHeight = 46, fitQueued = false;
    try { const draft = JSON.parse(localStorage.getItem(editDraftKey) || 'null'); if (draft?.id) { editing = draft.id; editDraft = String(draft.note || ''); editColorMode = draft.colorMode || 'unknown'; } } catch (_) {}
    const setStatus = text => { q('.status').textContent = text || ''; };
    let composeFocusToken = 0, localAltHeld = false;
    const composeFocusBlocked = () => localAltHeld || owner.isAltHeld?.() || window[PICKER]?.isHeld?.();
    const focusComposer = () => {
        if (!pending || q('.compose').hidden) return;
        const token = ++composeFocusToken;
        if (composeFocusBlocked()) return;
        void focusComposerAfterShow({
            win: window,
            field: q('.compose-text'),
            fit: fitWindow,
            bringToFront: () => owner.bringPillToFront?.(() => token === composeFocusToken && pending && !q('.compose').hidden && !composeFocusBlocked()),
            blocked: () => token !== composeFocusToken || !pending || q('.compose').hidden || composeFocusBlocked(),
        });
    };
    const onAltKey = event => {
        if (event.key !== 'Alt' || event.repeat) return;
        localAltHeld = event.type === 'keydown';
        if (!localAltHeld) focusComposer();
    };
    window.addEventListener('keydown', onAltKey, true);
    window.addEventListener('keyup', onAltKey, true);
    const applyPalette = vars => applyPaletteToHost(root.host, vars);
    const localChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;
    const channelListener = event => {
        const message = event.data;
        if (!message || message.owner !== owner.owner) return;
        if (message.kind === 'compose') { pending = message.metadata; compose(); }
        if (message.kind === 'state') { currentNotes = message.notes || currentNotes; if (message.palette) applyPalette(message.palette); if (message.oppositePalette) applyOppositePaletteToButton(q('[data-act=preview]'), message.oppositePalette); sync(); render(); }
    };
    localChannel?.addEventListener('message', channelListener);
    const draftKey = `atoms.annotator.draft.v1:${encodeURIComponent(owner.owner)}`;
    const savedDraft = () => { try { return JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch (_) { return null; } };
    const saveDraft = () => { try { if (pending) localStorage.setItem(draftKey, JSON.stringify({ metadata: pending, text: q('.compose-text').value })); } catch (_) {} };
    const clearDraft = () => { try { localStorage.removeItem(draftKey); } catch (_) {} };
    const compose = () => {
        const draft = savedDraft(); if (!pending && draft?.metadata) pending = draft.metadata;
        q('.compose-meta').textContent = pending ? `${pending.route || ''} · ${pending.selector || ''}` : '';
        q('.compose').hidden = !pending;
        if (pending) { panel.hidden = true; if (draft?.metadata) q('.compose-text').value = draft.text || ''; focusComposer(); }
        scheduleFit();
    };
    q('.compose-text').addEventListener('input', saveDraft);
    q('.compose-text').addEventListener('keydown', event => {
        if (!shouldSubmitComposer(event)) return;
        event.preventDefault(); event.stopPropagation(); savePending();
    });
    const render = () => {
        const shown = currentNotes.filter(record => !onlyPage || record.route === owner.pageKey());
        q('.count').textContent = `${shown.length} shown · ${currentNotes.length} total`;
        const liveEdit = notesList.querySelector('.edit');
        const liveMode = notesList.querySelector('.edit-mode');
        const focusedEdit = liveEdit && root.activeElement === liveEdit;
        const focusedMode = liveMode && root.activeElement === liveMode;
        const selection = liveEdit ? [liveEdit.selectionStart, liveEdit.selectionEnd] : null;
        if (editing && liveEdit) editDraft = liveEdit.value;
        if (editing && liveMode) editColorMode = liveMode.value;
        notesList.innerHTML = shown.slice().reverse().map(record => {
            const isEditing = editing === record.id;
            const ask = confirming === record.id;
            const editMode = editColorMode || record.colorMode || 'unknown';
            return `<li class="note" data-id="${clean(record.id)}"><div class="meta">${clean(record.route)} · ${clean(record.window?.title || record.window?.name || record.windowId)} · ${clean(record.colorMode || 'unknown')} · ${new Date(record.ts).toLocaleString()}</div><div class="meta">${clean(record.selector)}</div><div class="context">${clean(record.context)}</div>${isEditing ? `<textarea class="edit" maxlength="${MAX_NOTE_LENGTH}">${clean(editDraft ?? record.note)}</textarea><label class="mode-field">Captured mode <select class="edit-mode"><option value="unknown" ${editMode === 'unknown' ? 'selected' : ''}>Unknown</option><option value="dark" ${editMode === 'dark' ? 'selected' : ''}>Dark</option><option value="light" ${editMode === 'light' ? 'selected' : ''}>Light</option></select></label><div class="row-actions"><button data-act="save">SAVE</button><button data-act="cancel-edit">CANCEL</button></div>` : `<div class="text">${clean(record.note || 'No note text')}</div>`}<div class="row-actions">${ask ? `<span>Delete this handled note?</span><button data-act="delete-yes">DELETE</button><button data-act="delete-no">KEEP</button>` : `<button data-act="jump" ${record.route === owner.pageKey() ? '' : 'disabled title="Open this page to jump to the note"'}>JUMP</button><button data-act="edit">EDIT</button><button data-act="status">${record.status === 'done' ? 'REOPEN' : 'DONE'}</button><button data-act="delete">DELETE</button>`}</div></li>`;
        }).join('') || '<li class="note">No saved notes in this view.</li>';
        if (editing && (focusedEdit || focusedMode)) { const input = focusedMode ? notesList.querySelector('.edit-mode') : notesList.querySelector('.edit'); input?.focus(); if (focusedEdit && selection) input?.setSelectionRange?.(...selection); }
        scheduleFit();
    };
    const sync = () => {
        const values = owner.state?.() || {};
        applyPalette(owner.palette?.());
        applyOppositePaletteToButton(q('[data-act=preview]'), owner.oppositePalette?.() || values.oppositePalette);
        q('[data-act=theme]').textContent = values.themeOff ? 'ATOMS OFF' : 'ATOMS ON';
        q('[data-act=theme]').setAttribute('aria-pressed', String(!values.themeOff));
        q('[data-act=annotator]').textContent = values.annotator ? 'ANNOTATOR ON' : 'ANNOTATOR OFF';
        q('[data-act=annotator]').setAttribute('aria-pressed', String(Boolean(values.annotator)));
        const mode = owner.mode?.(); q('[data-act=preview]').textContent = mode ? `${mode === 'light' ? 'DARK' : 'LIGHT'} MODE` : 'MODE UNKNOWN'; q('[data-act=preview]').disabled = !mode; q('[data-act=preview]').setAttribute('aria-pressed', String(Boolean(values.previewMode)));  
        render();
    };
    const refresh = () => { currentNotes = owner.notes?.list?.() || currentNotes; sync(); };
    const savePending = () => {
        if (!pending) return;
        try {
            const result = owner.receivePick({ ...pending, note: q('.compose-text').value.trim().slice(0, MAX_NOTE_LENGTH), windowId: pending.windowId || owner.owner });
            if (!result) throw Error('The note was not saved.');
            pending = null; clearDraft(); q('.compose').hidden = true; q('.compose-text').value = ''; setStatus('Note saved.'); refresh();
        } catch (error) { setStatus(error.message); }
    };
    notesList.addEventListener('input', event => { if (event.target.matches?.('.edit')) editDraft = event.target.value; if (event.target.matches?.('.edit-mode')) editColorMode = event.target.value; if (editing) { try { localStorage.setItem(editDraftKey, JSON.stringify({ id: editing, note: editDraft, colorMode: editColorMode })); } catch (_) {} } });
    root.addEventListener('click', event => {
        const button = event.target.closest?.('[data-act]'); if (!button) return;
        const act = button.dataset.act, row = button.closest?.('.note'), id = row?.dataset.id;
        if (act === 'theme') owner.setTheme?.(!(owner.state?.().themeOff));
        else if (act === 'annotator') owner.setAnnotator?.(!(owner.state?.().annotator));
        else if (act === 'preview') { if (!owner.mode?.()) setStatus('Theme color mode is unavailable; no preview was applied.'); else owner.togglePreview?.(); }
        else if (act === 'more') { panel.hidden = !panel.hidden; q('[data-act=more]').setAttribute('aria-expanded', String(!panel.hidden)); scheduleFit(); }
        else if (act === 'close') { panel.hidden = true; scheduleFit(); }
        else if (act === 'filter') { onlyPage = !onlyPage; button.textContent = onlyPage ? 'THIS PAGE' : 'ALL PAGES'; button.setAttribute('aria-pressed', String(onlyPage)); render(); }
        else if (act === 'copy') copyNotes();
        else if (act === 'fallback-close') q('.fallback').hidden = true;
        else if (act === 'import-open') { q('.legacy-import').hidden = false; scheduleFit(); }
        else if (act === 'import-cancel') { q('.legacy-import').hidden = true; scheduleFit(); }
        else if (act === 'import-apply') importLegacy();
        else if (act === 'clear-done') { q('.clear-confirm').hidden = false; scheduleFit(); }
        else if (act === 'clear-no') { q('.clear-confirm').hidden = true; scheduleFit(); }
        else if (act === 'clear-yes') clearHandled();
        else if (act === 'compose-save') savePending();
        else if (act === 'compose-cancel') { const selectionId = pending?.selectionId; owner.cancelCompose?.(selectionId); pending = null; clearDraft(); q('.compose-text').value = ''; q('.compose').hidden = true; scheduleFit(); }
        else if (act === 'edit') { const record = currentNotes.find(note => note.id === id); editing = id; editDraft = record?.note || ''; editColorMode = record?.colorMode || 'unknown'; try { localStorage.setItem(editDraftKey, JSON.stringify({ id, note: editDraft, colorMode: editColorMode })); } catch (_) {} render(); }
        else if (act === 'cancel-edit') { editing = null; editDraft = null; editColorMode = null; try { localStorage.removeItem(editDraftKey); } catch (_) {} render(); }
        else if (act === 'save') { try { const selectedMode = row.querySelector('.edit-mode').value; const patch = { note: row.querySelector('.edit').value.trim().slice(0, MAX_NOTE_LENGTH) }; if (selectedMode === 'dark' || selectedMode === 'light') patch.colorMode = selectedMode; owner.notes?.update?.(id, patch); editing = null; editDraft = null; editColorMode = null; try { localStorage.removeItem(editDraftKey); } catch (_) {} refresh(); setStatus('Note updated.'); } catch (error) { editDraft = row.querySelector('.edit')?.value ?? editDraft; setStatus(error.message); } }
        else if (act === 'status') { try { const record = currentNotes.find(note => note.id === id); owner.notes?.update?.(id, { status: record?.status === 'done' ? 'open' : 'done' }); refresh(); } catch (error) { setStatus(error.message); } }
        else if (act === 'delete') { confirming = id; render(); }
        else if (act === 'delete-no') { confirming = null; render(); }
        else if (act === 'delete-yes') { try { owner.notes?.remove?.(id); confirming = null; refresh(); setStatus('Note deleted.'); } catch (error) { setStatus(error.message); } }
        else if (act === 'jump') { const record = currentNotes.find(note => note.id === id); setStatus(owner.jump?.(record) || ''); }
    });
    function importLegacy() {
        try { const raw = q('.legacy-import textarea').value.trim(); let records; try { records = JSON.parse(raw); } catch (_) { records = raw.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); } const before = owner.notes.list().length; owner.notes.importLegacy(records); const added = owner.notes.list().length - before; q('.legacy-import').hidden = true; q('.legacy-import textarea').value = ''; refresh(); setStatus(`Imported ${added} legacy notes. Source records were not changed.`); } catch (error) { setStatus(error.message); }
    }
    function clearHandled() {
        try { for (const record of currentNotes.filter(note => note.status === 'done')) owner.notes.remove(record.id); q('.clear-confirm').hidden = true; refresh(); setStatus('Handled notes deleted.'); } catch (error) { setStatus(error.message); refresh(); }
    }
    async function copyNotes() {
        try {
            if (!currentNotes.some(record => record.status !== 'done')) { setStatus('No open notes to copy.'); return; }
            const text = exportTOON(currentNotes);
            if (!text) { setStatus('No notes to copy.'); return; }
            await navigator.clipboard.writeText(text);
            setStatus(`Copied grouped notes. ${ANNOTATION_EXPORT_REMINDER}`);
        } catch (error) {
            try { q('.fallback textarea').value = exportTOON(currentNotes); q('.fallback').hidden = false; q('.fallback textarea').focus(); q('.fallback textarea').select(); setStatus('Clipboard unavailable. Copy the grouped notes below.'); }
            catch (fallbackError) { setStatus(fallbackError.message || error.message); }
        }
    }
    const onDown = async event => {
        const grip = event.target.closest?.('.grip'); if (!grip || event.button !== 0) return;
        event.preventDefault(); grip.setPointerCapture?.(event.pointerId);
        const at = await mouseAt(window), base = { ...position };
        if (!at) return;
        let busy = false;
        const move = async e => {
            if (busy) return; busy = true;
            const point = await mouseAt(window); busy = false;
            if (point) { position = { left: base.left + point.x - at.x, bottom: base.bottom + point.y - at.y }; moveSelf(position.left, position.bottom - currentHeight); }
        };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); try { owner.savePosition?.(position); } catch (_) {} };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true }); window.addEventListener('pointercancel', up, { once: true });
    };
    root.addEventListener('pointerdown', onDown);
    const fitWindow = () => {
        fitQueued = false;
        const bar = q('.bar');
        if (!bar) return;
        const bound = Math.max(46, Math.floor((screen.availHeight || 800) * 0.72));
        panel.style.maxHeight = `${bound}px`;
        const visible = [panel, q('.compose')].filter(node => !node.hidden);
        const barRect = bar.getBoundingClientRect();
        const size = fitPillSize({ barWidth: barRect.width || 286, barHeight: barRect.height || 46, panelWidth: visible.includes(panel) ? panel.scrollWidth || 0 : 0, panelHeight: visible.includes(panel) ? panel.scrollHeight || panel.getBoundingClientRect().height || 0 : 0, composeWidth: visible.includes(q('.compose')) ? q('.compose').scrollWidth || 0 : 0, composeHeight: visible.includes(q('.compose')) ? q('.compose').scrollHeight || q('.compose').getBoundingClientRect().height || 0 : 0, maxHeight: bound });
        const { width, height } = size;
        if (width === 0 || height === 0) return;
        currentHeight = height;
        try { window.SteamClient.Window.ResizeTo(width, height, true); moveSelf(position.left, position.bottom - height); } catch (_) {}
    };
    const scheduleFit = () => { if (fitQueued) return; fitQueued = true; setTimeout(fitWindow, 0); };
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleFit) : null;
    for (const node of [q('.bar'), panel, q('.compose')]) if (node) resizeObserver?.observe(node);
    const shapeObserver = typeof MutationObserver === 'function' ? new MutationObserver(scheduleFit) : null;
    shapeObserver?.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
    currentNotes = owner.notes?.list?.() || [];
    sync();
    const show = () => { try { fitWindow(); window.SteamClient.Window.ShowWindow(); } catch (_) {} };
    setTimeout(show, 40);
    const timer = setInterval(async () => {
        try { const rect = await owner.rect?.(); if (!rect) { window.close?.(); return; } if (rect.hidden) window.SteamClient.Window.HideWindow(); else window.SteamClient.Window.ShowWindow(); }
        catch (_) { window.close?.(); }
    }, 600);
    const stop = () => { if (pending || editing) return false; clearInterval(timer); ++composeFocusToken; window.removeEventListener('keydown', onAltKey, true); window.removeEventListener('keyup', onAltKey, true); resizeObserver?.disconnect(); shapeObserver?.disconnect(); localChannel?.removeEventListener('message', channelListener); localChannel?.close(); host.remove(); if (window[API]?.stop === stop) { window[API].stopped = true; delete window[API]; } };
    window[API] = { version: 1, stopped: false, stop, compose: metadata => { pending = metadata; saveDraft(); compose(); }, focusComposer, hasDirtyDraft: () => Boolean(pending || editing), pendingRecord: () => pending, setStatus, completeCompose: selectionId => { if (pending?.selectionId !== selectionId) return false; ++composeFocusToken; pending = null; clearDraft(); q('.compose').hidden = true; q('.compose-text').value = ''; scheduleFit(); return true; } };
    window.__atomsAnnotationMenu = { ...window[API], hasDirtyDraft: () => Boolean(pending || editing), pendingRecord: () => pending, setStatus, completeCompose: selectionId => { if (pending?.selectionId !== selectionId) return false; ++composeFocusToken; pending = null; clearDraft(); q('.compose').hidden = true; q('.compose-text').value = ''; scheduleFit(); return true; } };
    const restoredDraft = savedDraft(); if (restoredDraft?.metadata) { pending = restoredDraft.metadata; q('.compose-text').value = restoredDraft.text || ''; compose(); }
}

export function install({ cwpApproved = false } = {}) {
    // Steam's login shell shares the theme entrypoint, but must not acquire
    // annotator DOM, debug-palette frames, or a native companion pill.
    if (isLoginWindow(window)) {
        const active = window[API];
        if (active?.version === 1 && !active.stopped && active.stop?.() === false) return active;
        return { stop() {} };
    }
    if (window[API]?.version === 1 && !window[API].stopped) return window[API];
    const stopped = window[API]?.stop?.();
    if (stopped === false) return window[API];
    if (document.title === 'SharedJSContext' || PILL_NAME.test(window.name || '')) return { stop() {} };
    const legacyControl = window.__atomsAnnotationControlV1;
    const legacyAudit = window.__atomsVisualAuditV5;
    if ((legacyControl && !legacyControl.stopped && legacyControl.available !== false) || (legacyAudit && !legacyAudit.stopped)) return { stop() {} };
    if (window.name === MAIN_WINDOW && !cwpApproved) {
        const verdict = cwpStartupVerdict(window);
        if (verdict === 'rebuild') return { stop() {} };
        if (verdict === 'pending') {
            let gate;
            gate = deferCwpInstall(window, () => {
                if (window[API] !== gate) return;
                delete window[API]; install({ cwpApproved: true });
            });
            window[API] = gate;
            return gate;
        }
    }
    if (isMenuWindow()) return installFollower();
    if (window.self !== window.top) return { stop() {} };
    if (isMainWebView()) return window[API] = linkWebView();
    return installOwner();
}

export function stop() { return window[API]?.stop?.() ?? true; }

export function teardown() { const result = stop(); if (result !== false) document.getElementById(HOST_ID)?.remove(); return result; }
