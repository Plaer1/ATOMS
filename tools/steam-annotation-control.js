'use strict';

// Steam's detached Big Picture panes use a different native blank URL than
// ordinary popup windows. Keep this parser self-contained for serialization.
function isSteamBrowserViewPopup(href, ...identities) {
    if (identities.some(value => /^atoms_annotation(?:_manager)?_uid/.test(value || '') || ['ATOMS annotation', 'ATOMS saved annotations'].includes(value))) return false;
    if (!identities.some(value => /^(?:MainMenu|QuickAccess)_uid\d+$/.test(value || ''))) return false;
    try {
        const url = new URL(href);
        if (url.protocol !== 'about:' || url.pathname !== 'blank' || url.hash) return false;
        const params = url.searchParams, keys = ['browserviewpopup', 'requestid', 'parentpopup'];
        return [...params.keys()].length === 3 && keys.every(key => params.getAll(key).length === 1) &&
            params.get('browserviewpopup') === '1' && /^\d+$/.test(params.get('requestid') || '') && /^\d+$/.test(params.get('parentpopup') || '');
    } catch (_) { return false; }
}

// Serialized into intended Steam documents. Requests go to the controller;
// received state is applied locally without sending a second request.
function installAnnotationControl(state, installPalette, isMenuPopup = isSteamBrowserViewPopup, nativeNames = []) {
    if (/^about:srcdoc/i.test(location.href) || /^atoms_annotation(?:_manager)?_uid/.test(window.name) || ['ATOMS annotation', 'ATOMS saved annotations'].includes(document.title)) return;
    const allowed = /^https?:\/\/(?:steamloopback\.host|store\.steampowered\.com|steamcommunity\.com|help\.steampowered\.com|partner\.steamgames\.com)(?::\d+)?(?:[/?#]|$)/i;
    if (!allowed.test(location.href) && !/^about:blank\?createflags=/i.test(location.href) && !isMenuPopup(location.href, window.name, document.title, ...nativeNames)) return;
    const key = '__atomsAnnotationControlV1';
    if (window[key]?.version >= 3 && !window[key].stopped) { window[key].update(state); return window[key]; }
    window[key]?.stop();
    const pendingNotes = new Map();
    const requestPrefix = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    let requestId = 0;
    const snapshot = () => ({ enabled: api.enabled, pending: api.pending, available: api.available, error: api.error,
        previewMode: api.previewMode, savedMode: api.savedMode, revision: api.revision, notesRevision: api.notesRevision });
    const publish = () => {
        const detail = snapshot();
        window.dispatchEvent(new CustomEvent('atoms-annotator-state', { detail }));
        window.dispatchEvent(new CustomEvent('atoms-debug-state', { detail }));
    };
    const emit = request => {
        if (api.stopped || !api.available || typeof window.__atomsAnnotatorControlEmit !== 'function') return false;
        window.__atomsAnnotatorControlEmit(JSON.stringify(request)); return true;
    };
    const syncMenu = () => {
        if (api.stopped) return;
        installPalette?.();
        window.__atomsAnnotationColorToggleV1?.applyState(snapshot());
    };
    const api = {
        version: 3, stopped: false, enabled: false, pending: false, available: true, error: '',
        previewMode: null, savedMode: null, revision: -1, notesRevision: null,
        update(next) {
            if (api.stopped || !next || (Number.isFinite(next.revision) && next.revision < api.revision)) return;
            for (const name of ['enabled', 'pending', 'available', 'error', 'previewMode', 'savedMode', 'revision', 'notesRevision']) {
                if (Object.prototype.hasOwnProperty.call(next, name)) api[name] = next[name];
            }
            syncMenu(); publish();
        },
        setEnabled(enabled) {
            if (!api.available || api.pending || api.stopped) return false;
            if (!emit({ type: 'annotator', enabled: Boolean(enabled) })) return false;
            api.pending = true; publish(); return true;
        },
        setColorMode(mode) {
            if (mode !== null && mode !== 'light' && mode !== 'dark') throw Error('Expected null, light or dark');
            return emit({ type: 'color-mode', mode });
        },
        requestNotes(action, payload = {}) {
            if (!['list', 'edit', 'delete'].includes(action)) return Promise.reject(Object.assign(Error('Unsupported note action'), { code: 'INVALID_REQUEST' }));
            return new Promise((resolve, reject) => {
                const id = requestPrefix + '-' + (++requestId);
                const timer = setTimeout(() => {
                    pendingNotes.delete(id); reject(Object.assign(Error('Note request timed out'), { code: 'TIMEOUT' }));
                }, 10000);
                pendingNotes.set(id, { resolve, reject, timer });
                if (!emit({ type: 'notes', requestId: id, action, payload })) {
                    clearTimeout(timer); pendingNotes.delete(id); reject(Object.assign(Error('Annotation controller unavailable'), { code: 'UNAVAILABLE' }));
                }
            });
        },
        receiveNotes(reply) {
            const pending = pendingNotes.get(reply?.requestId);
            if (!pending) return;
            pendingNotes.delete(reply.requestId); clearTimeout(pending.timer);
            if (reply.error) pending.reject(Object.assign(Error(reply.error.message || 'Note request failed'), { code: reply.error.code || 'STORAGE_ERROR' }));
            else pending.resolve(reply.result);
        },
        notesChanged(change) {
            if (api.stopped || !change) return;
            api.notesRevision = change.revision;
            window.dispatchEvent(new CustomEvent('atoms-annotation-notes-changed', { detail: change }));
        },
        stop() {
            if (api.stopped) return;
            api.stopped = true; api.available = false; api.pending = false; api.previewMode = null;
            window.removeEventListener('atoms-debug-menu', syncMenu);
            window.removeEventListener('pageshow', onPageShow);
            document.removeEventListener?.('DOMContentLoaded', syncMenu);
            for (const pending of pendingNotes.values()) {
                clearTimeout(pending.timer); pending.reject(Object.assign(Error('Annotation controller stopped'), { code: 'UNAVAILABLE' }));
            }
            pendingNotes.clear();
            window.__atomsAnnotationColorToggleV1?.stop();
            window.__atomsAnnotationNoteManagerV1?.stop(); publish();
            if (window[key] === api) delete window[key];
        }
    };
    const onPageShow = () => { syncMenu(); emit({ type: 'sync' }); };
    window[key] = api;
    window.addEventListener('atoms-debug-menu', syncMenu);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener?.('DOMContentLoaded', syncMenu);
    api.update(state);
    return api;
}
module.exports = { installAnnotationControl, isSteamBrowserViewPopup };
