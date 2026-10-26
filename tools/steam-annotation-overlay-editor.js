'use strict';

// Steam's full-screen overlay compositor receives mouse events but is not a
// reliable native keyboard destination. Edit in a game-owned Steam popup, the
// same native window path used by Steam's Notes and browser windows.
function installAnnotationOverlayEditor() {
    if (!/^desktopoverlay_uid\d+$/.test(window.name)) return null;
    const key = '__atomsAnnotationOverlayEditorV1';
    if (window[key]?.version >= 4 && !window[key].stopped) { window[key].sync(); return window[key]; }
    window[key]?.stop();
    let stopped = false, popup = null, input = null, opening = false;
    let note = null, frame = null, originalVisibility = '', generation = 0;
    let noteObserver = null;
    let savePending = false, saveError = '';
    const renderSaveState = () => {
        if (!popup || popup.closed) return;
        const doc = popup.document;
        if (input) input.disabled = savePending;
        const save = doc.getElementById('save'), cancel = doc.getElementById('cancel');
        if (save) { save.disabled = savePending; save.textContent = savePending ? 'Saving…' : 'Save'; }
        if (cancel) cancel.disabled = savePending;
        const status = doc.getElementById('save-status');
        if (status) {
            status.textContent = savePending ? 'Saving annotation…' : saveError;
            status.hidden = !savePending && !saveError;
            status.setAttribute?.('data-error', String(Boolean(saveError)));
        }
    };
    let releasePopupPalette = null, paletteAPI = null;
    const applyPalette = () => {
        const api = window.__atomsDebugPaletteV1;
        if (!popup || popup.closed || (api === paletteAPI && releasePopupPalette)) return;
        releasePopupPalette?.(); paletteAPI = api;
        releasePopupPalette = api?.apply(popup.document.documentElement) || null;
    };
    const removers = [];
    const listen = (target, type, handler, options) => {
        target.addEventListener(type, handler, options);
        removers.push(() => target.removeEventListener(type, handler, options));
    };
    const shadow = () => document.getElementById('atoms-visual-audit-host')?.shadowRoot;
    const noteOpen = () => note?.style.display === 'block';
    const originalInput = () => frame?.contentDocument?.getElementById('note-input');
    const readSaveState = () => {
        const state = window.__atomsVisualAuditV5?.getSaveState?.();
        if (state || note?.dataset?.savePending !== undefined) {
            savePending = state ? Boolean(state.pending) : note.dataset.savePending === 'true';
            saveError = state ? String(state.error || '') : note.dataset.saveError || '';
        }
    };
    const copyValue = () => { const original = originalInput(); if (original && input) original.value = input.value; };
    const focus = () => {
        if (!popup || popup.closed || !input || !noteOpen() || savePending) return false;
        try {
            popup.SteamClient.Window.MarkLastFocused();
            popup.SteamClient.Window.SetKeyFocus(true);
            input.focus({ preventScroll: true });
        } catch (_) {}
        return true;
    };
    const dispatch = keyName => {
        if (!noteOpen() || savePending) return;
        copyValue();
        window.__atomsVisualAuditV5?.input?.note({ source: frame.contentWindow,
            data: { channel: 'atoms-visual-audit-note', key: keyName } });
    };
    const closePopup = () => {
        generation++;
        if (noteOpen()) copyValue();
        releasePopupPalette?.(); releasePopupPalette = null; paletteAPI = null;
        const previous = popup;
        popup = null; input = null;
        if (note) note.style.visibility = originalVisibility;
        if (previous && !previous.closed) previous.close();
    };
    const unlockOverlay = () => {
        // A pending note must not disable the overlay's native windows or
        // prevent recovery through Steam's own controls.
        if (document.body) document.body.inert = false;
        shadow()?.getElementById('scrim')?.style.setProperty('pointer-events', 'none', 'important');
        note?.setAttribute('aria-modal', 'false');
    };
    const openPopup = async () => {
        if (opening || stopped || !noteOpen() || (popup && !popup.closed)) return;
        opening = true;
        const request = ++generation;
        try {
            const owner = window.opener;
            const pid = Number(window.name.match(/uid(\d+)$/)[1]);
            const info = (await owner.SteamClient.Overlay.GetOverlayBrowserInfo()).find(x => x.unPID === pid);
            if (!info) throw Error('Steam overlay browser not available');
            if (stopped || request !== generation || !noteOpen()) return;
            const rect = note.getBoundingClientRect();
            // Flags and ownership follow Steam's PopupManager.CreatePopup:
            // Hidden(2) | Resizable(16) | ApplyBrowserScaleToDimensions(4096).
            const result = owner.g_PopupManager.constructor.CreatePopup(`atoms_annotation_uid${pid}`, {
                title: 'ATOMS annotation',
                dimensions: { width: 440, height: 190, left: Math.max(8, Math.min(rect.left, innerWidth - 448)), top: Math.max(8, Math.min(rect.top, innerHeight - 198)) },
                minWidth: 320, minHeight: 170, eCreationFlags: 4114,
                target_browser: { m_unPID: info.unPID, m_nBrowserID: info.nBrowserID, m_eBrowserType: info.eBrowserType }
            });
            if (!result.popup) throw Error('Steam could not open annotation window');
            popup = result.popup;
            const p = popup, d = p.document;
            applyPalette();
            d.head.insertAdjacentHTML('beforeend', `<style>
                #atoms-theme-toggle-host,#atoms-visual-audit-host{display:none!important}
                html,body{margin:0;box-sizing:border-box;background:var(--atoms-debug-surface);color:var(--atoms-debug-text);color-scheme:var(--atoms-debug-scheme);font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
                body{padding:14px}h1{margin:0 0 6px;font-size:14px;color:var(--atoms-debug-heading);-webkit-app-region:drag}p{margin:0 0 10px;color:var(--atoms-debug-muted);font-size:12px}
                input{box-sizing:border-box;width:100%;height:36px;padding:7px 8px;border:1px solid var(--atoms-debug-border);border-radius:5px;outline:none;color:var(--atoms-debug-text);background:var(--atoms-debug-input);font:inherit}
                .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}button{padding:6px 14px;border:1px solid var(--atoms-debug-border);border-radius:5px;background:var(--atoms-debug-raised);color:var(--atoms-debug-text);font:inherit;cursor:pointer}button:hover{background:var(--atoms-debug-hover);color:var(--atoms-debug-heading)}button:focus-visible,input:focus-visible{outline:2px solid var(--atoms-debug-accent);outline-offset:2px}input::placeholder{color:var(--atoms-debug-muted)}button:last-child{background:var(--atoms-debug-accent);color:var(--atoms-debug-on-accent)}button:disabled,input:disabled{color:var(--atoms-debug-muted);cursor:wait}#save-status{margin-top:8px;max-height:70px;overflow:auto;color:var(--atoms-debug-muted);font-size:12px;white-space:pre-wrap}#save-status[data-error=true]{color:var(--atoms-debug-error)}
            </style>`);
            d.body.innerHTML = '<h1>ATOMS annotation</h1><p>Optional note. Enter saves; Esc cancels.</p><input id="atoms-overlay-note" type="text" maxlength="800" autocomplete="off" aria-label="Annotation note" placeholder="Describe this fix…"><div id="save-status" role="status" aria-live="polite" hidden></div><div class="actions"><button type="button" id="cancel">Cancel</button><button type="button" id="save">Save</button></div>';
            // An older running recorder may discover this new native window.
            // Stop its self-capture as soon as it mounts; fresh recorders skip
            // annotation windows before injecting any helpers.
            const captureGuard = new MutationObserver(() => {
                if (p.__atomsVisualAuditV5 && !p.__atomsVisualAuditV5.stopped) {
                    p.__atomsVisualAuditV5.stop(); captureGuard.disconnect();
                }
            });
            captureGuard.observe(d.documentElement, { childList: true, subtree: true });
            p.addEventListener('beforeunload', () => captureGuard.disconnect(), { once: true });
            input = d.getElementById('atoms-overlay-note');
            input.value = originalInput()?.value || '';
            readSaveState(); renderSaveState();
            input.addEventListener('input', copyValue);
            input.addEventListener('keydown', event => {
                if (!['Enter', 'Escape'].includes(event.key)) return;
                event.preventDefault(); event.stopImmediatePropagation();
                dispatch(event.key);
            });
            d.getElementById('save').addEventListener('click', () => dispatch('Enter'));
            d.getElementById('cancel').addEventListener('click', () => dispatch('Escape'));
            p.addEventListener('beforeunload', event => {
                if (popup !== p) return;
                if (savePending) { event.preventDefault(); event.returnValue = ''; return; }
                releasePopupPalette?.(); releasePopupPalette = null; paletteAPI = null;
                copyValue(); popup = null; input = null;
                if (note) note.style.visibility = originalVisibility;
                if (!stopped && noteOpen()) dispatch('Escape');
            });
            originalVisibility = note.style.visibility;
            note.style.visibility = 'hidden';
            p.SteamClient.Window.ShowWindow();
            p.SteamClient.Window.BringToFront();
            focus();
        } catch (error) {
            // Keep the original editor and selection recoverable if Steam
            // refuses the native window; never auto-save or discard feedback.
            if (note) note.style.visibility = originalVisibility;
            console.warn('[ATOMS annotation window]', error.message);
        } finally { opening = false; }
    };
    const sync = () => {
        if (stopped) return;
        const next = shadow()?.getElementById('note');
        if (next !== note) {
            noteObserver?.disconnect(); note = next;
            frame = shadow()?.getElementById('note-input-frame');
            if (frame?.contentWindow) listen(frame.contentWindow, 'focus', () => {
                // Redirect only a legacy picker callback focusing its hidden
                // field; ordinary clicks elsewhere in Steam remain available.
                if (noteOpen()) queueMicrotask(focus);
            });
            if (note) {
                originalVisibility = note.style.visibility;
                noteObserver = new MutationObserver(sync);
                noteObserver.observe(note, { attributes: true, attributeFilter: ['style'] });
            }
        }
        readSaveState();
        if (!noteOpen()) { if (popup || opening) closePopup(); savePending = false; saveError = ''; return; }
        renderSaveState();
        unlockOverlay();
        if (!popup || popup.closed) openPopup();
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { childList: true });
    listen(window, 'atoms-debug-palette', applyPalette);
    listen(window, 'atoms-annotation-save-state', event => {
        const wasPending = savePending;
        savePending = Boolean(event.detail?.pending);
        saveError = typeof event.detail?.error === 'string' ? event.detail.error : '';
        renderSaveState();
        if (wasPending && !savePending && noteOpen()) focus();
    });
    listen(window, 'pagehide', () => { if (!stopped) stop(); });
    const audit = window.__atomsVisualAuditV5, previousStop = audit?.stop;
    let wrappedStop;
    const stop = () => {
        if (stopped) return;
        stopped = true; observer.disconnect(); noteObserver?.disconnect();
        removers.splice(0).forEach(remove => remove());
        closePopup();
        if (audit?.stop === wrappedStop) audit.stop = previousStop;
        window[key].stopped = true;
    };
    if (previousStop) {
        wrappedStop = function(...args) { stop(); return previousStop.apply(this,args); };
        audit.stop = wrappedStop;
    }
    const api = { version: 4, sync, focus, stop, stopped: false };
    window[key] = api; sync(); return api;
}
module.exports = { installAnnotationOverlayEditor };
