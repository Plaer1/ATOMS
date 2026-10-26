'use strict';

// Serialized into an existing Steam document by the controller. All writes go
// through its revision-checked repository; this UI never opens a capture file.
function installAnnotationNoteManager() {
    const key = '__atomsAnnotationNoteManagerV1';
    if (window[key]?.version === 1 && !window[key].stopped) { window[key].sync(); return window[key]; }
    window[key]?.stop?.();
    let stopped = false, host = null, root = null, menu = null, dialog = null;
    let list = null, status = null, confirmation = null, refreshButton = null;
    let returnFocus = null, popup = null, opened = false, opening = false;
    let editing = null, saving = false, requestGeneration = 0;
    let rows = [], revision = null, pendingConfirmation = null;
    const paletteBindings = new Map();
    let menuOutside = null, requestedRevision = null;
    const removers = [];
    const listen = (target, type, fn, options) => {
        target.addEventListener(type, fn, options);
        removers.push(() => target.removeEventListener(type, fn, options));
    };
    const control = () => window.__atomsAnnotationControlV1;
    const request = (action, payload = {}) => {
        const bridge = control();
        if (!bridge?.available || !bridge.requestNotes) return Promise.reject(Error('Start the annotation controller to manage saved notes.'));
        return bridge.requestNotes(action, payload);
    };
    const element = (doc, tag, text, attrs = {}) => {
        const node = doc.createElement(tag);
        if (text !== undefined) node.textContent = String(text);
        for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
        return node;
    };
    const button = (doc, text, fn, attrs = {}) => {
        const node = element(doc, 'button', text, { type: 'button', ...attrs });
        node.addEventListener('click', fn); return node;
    };
    const palette = target => {
        const api = window.__atomsDebugPaletteV1;
        const previous = paletteBindings.get(target);
        if (previous?.api === api && previous?.release) return;
        previous?.release?.();
        paletteBindings.set(target, { api, release: api?.apply(target) || null });
    };
    const releaseDocumentPalette = doc => {
        for (const [target, binding] of paletteBindings) if (target.ownerDocument === doc) { binding.release?.(); paletteBindings.delete(target); }
    };
    const noteOpen = () => {
        const note = document.getElementById('atoms-visual-audit-host')?.shadowRoot?.getElementById('note');
        return note?.style.display === 'block';
    };
    const text = record => String(record?.payload?.note ?? record?.note ?? '');
    const capturedMode = record => record?.payload?.colorMode || record?.colorMode || '';
    const dirty = () => Boolean(editing && (editing.input.value !== editing.note || editing.mode.value !== editing.colorMode));
    const message = (value = '', error = false) => {
        if (!status) return;
        status.textContent = value; status.dataset.error = String(error);
    };
    const closeMenu = () => {
        if (!menu) return;
        if (menu.matches?.(':popover-open')) menu.hidePopover();
        menu.hidden = true;
        returnFocus?.setAttribute('aria-expanded', 'false');
        if (menuOutside) { document.removeEventListener('pointerdown', menuOutside, true); menuOutside = null; }
    };
    const clearConfirmation = () => {
        pendingConfirmation = null;
        if (confirmation) { confirmation.replaceChildren(); confirmation.hidden = true; }
    };
    const ask = (prompt, actionText, action) => {
        const doc = confirmation.ownerDocument;
        clearConfirmation(); pendingConfirmation = action; confirmation.hidden = false;
        confirmation.appendChild(element(doc, 'p', prompt));
        const actions = element(doc, 'div', undefined, { class: 'actions' });
        const cancel = button(doc, 'Keep editing', clearConfirmation);
        const confirm = button(doc, actionText, () => { const fn = pendingConfirmation; clearConfirmation(); fn?.(); });
        actions.appendChild(cancel); actions.appendChild(confirm); confirmation.appendChild(actions);
        cancel.focus({ preventScroll: true });
    };
    const guard = (action, prompt = 'Discard your unsaved changes?') => {
        if (saving) { message('Please wait for the current save.'); return false; }
        if (dirty()) { ask(prompt, 'Discard changes', action); return false; }
        action(); return true;
    };
    const resetView = () => {
        requestGeneration++; editing = null; rows = []; revision = null;
        list?.replaceChildren(); clearConfirmation(); message('');
    };
    const finishClose = () => {
        opened = false; editing = null; closeMenu();
        if (dialog?.open) dialog.close();
        const previous = popup; popup = null;
        if (previous) releaseDocumentPalette(previous.document);
        if (previous && !previous.closed) previous.close();
        resetView();
        returnFocus?.focus?.({ preventScroll: true });
    };
    const close = () => guard(finishClose);
    const styles = `
        :host{all:initial;color:var(--atoms-debug-text);color-scheme:var(--atoms-debug-scheme);font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        *{box-sizing:border-box}button,input,textarea,select{font:inherit;color:var(--atoms-debug-text)}
        button{border:1px solid var(--atoms-debug-border);border-radius:5px;padding:7px 11px;background:var(--atoms-debug-raised);cursor:pointer}
        button:hover{background:var(--atoms-debug-hover);color:var(--atoms-debug-heading)}button:disabled{color:var(--atoms-debug-muted);cursor:wait}
        button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--atoms-debug-accent);outline-offset:2px}
        .primary{background:var(--atoms-debug-accent);color:var(--atoms-debug-on-accent)}
        .primary:hover{background:var(--atoms-debug-accent);color:var(--atoms-debug-on-accent)}
        #notes-menu{position:fixed;inset:auto;margin:0;padding:5px;min-width:160px;z-index:2147483647;border:1px solid var(--atoms-debug-border);border-radius:7px;background:var(--atoms-debug-surface);color:var(--atoms-debug-text)}
        #notes-menu button{width:100%;text-align:left;border:0}#menu-status{max-width:280px;padding:4px 7px;color:var(--atoms-debug-muted)}
        dialog,.manager-popup{width:min(940px,calc(100vw - 32px));height:min(740px,calc(100vh - 32px));margin:auto;padding:0;border:1px solid var(--atoms-debug-border);border-radius:9px;background:var(--atoms-debug-surface);color:var(--atoms-debug-text);color-scheme:var(--atoms-debug-scheme)}
        dialog::backdrop{background:var(--atoms-debug-overlay);opacity:var(--atoms-debug-overlay-opacity)}
        .manager{display:flex;flex-direction:column;min-height:0;height:100%;padding:16px;gap:12px}
        header,.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}header h1{flex:1;margin:0;font-size:18px;color:var(--atoms-debug-heading)}
        .intro,.meta,.missing{color:var(--atoms-debug-muted)}.intro{margin:0}#notes-status{min-height:20px;color:var(--atoms-debug-muted);white-space:pre-wrap}
        #notes-status[data-error=true]{color:var(--atoms-debug-error)}#notes-list{overflow:auto;overscroll-behavior:contain;min-height:0;flex:1;padding:3px}
        article{padding:12px;margin-bottom:10px;border:1px solid var(--atoms-debug-border);border-radius:7px;background:var(--atoms-debug-raised);overflow-wrap:anywhere}
        .note-text{white-space:pre-wrap;margin:0 0 6px;color:var(--atoms-debug-heading)}.meta{margin:3px 0}.actions{margin-top:10px}
        details{margin-top:10px}summary{cursor:pointer;color:var(--atoms-debug-text)}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.5 ui-monospace,monospace;color:var(--atoms-debug-text)}
        label{display:block;margin:8px 0 4px;color:var(--atoms-debug-text)}textarea,select{width:100%;padding:8px;border:1px solid var(--atoms-debug-border);border-radius:5px;background:var(--atoms-debug-input);color:var(--atoms-debug-text)}
        textarea{min-height:100px;resize:vertical;user-select:text}select{width:auto;min-width:130px}#notes-confirm{padding:10px;border:1px solid var(--atoms-debug-accent);border-radius:6px;background:var(--atoms-debug-raised)}
        [hidden]{display:none!important}
    `;
    const createView = (doc, mount, nativePopup = false) => {
        const style = element(doc, 'style', styles + (nativePopup ? '#atoms-theme-toggle-host,#atoms-visual-audit-host,#atoms-annotation-note-manager-host{display:none!important}html,body{margin:0;height:100%;background:var(--atoms-debug-surface);color:var(--atoms-debug-text);font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.manager-popup{width:100%;height:100%;border:0;border-radius:0}header h1{-webkit-app-region:drag}' : ''));
        mount.appendChild(style);
        dialog = element(doc, nativePopup ? 'div' : 'dialog', undefined, nativePopup ? { class: 'manager-popup', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'notes-title' } : { 'aria-labelledby': 'notes-title' });
        const layout = element(doc, 'section', undefined, { class: 'manager' });
        const header = element(doc, 'header'); header.appendChild(element(doc, 'h1', 'Saved annotations', { id: 'notes-title' }));
        refreshButton = button(doc, 'Refresh', () => guard(() => refresh(true)), { id: 'notes-refresh' });
        header.appendChild(refreshButton); header.appendChild(button(doc, 'Close', close, { id: 'notes-close' }));
        layout.appendChild(header);
        layout.appendChild(element(doc, 'p', 'Edit note text and captured mode. Capture details stay read-only.', { class: 'intro' }));
        status = element(doc, 'div', '', { id: 'notes-status', role: 'status', 'aria-live': 'polite' }); layout.appendChild(status);
        confirmation = element(doc, 'section', undefined, { id: 'notes-confirm', role: 'group', 'aria-label': 'Confirm action' }); confirmation.hidden = true; layout.appendChild(confirmation);
        list = element(doc, 'div', undefined, { id: 'notes-list' }); layout.appendChild(list);
        dialog.appendChild(layout); mount.appendChild(dialog); palette(dialog);
        dialog.addEventListener('click', event => {
            if (event.target !== dialog || nativePopup) return;
            const rect = dialog.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
        });
        dialog.addEventListener('cancel', event => { event.preventDefault(); if (pendingConfirmation) clearConfirmation(); else close(); });
        dialog.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (pendingConfirmation) clearConfirmation(); else close(); }
        });
    };
    const render = () => {
        const doc = list.ownerDocument; list.replaceChildren(); editing = null;
        if (!rows.length) { list.appendChild(element(doc, 'p', 'No saved pending annotations.')); return; }
        for (const entry of rows) {
            const record = entry.record || {}, article = element(doc, 'article');
            article.dataset.noteId = entry.id;
            const body = element(doc, 'p', text(record) || '(No note text)', { class: 'note-text' }); article.appendChild(body);
            const mode = capturedMode(record), asset = record.payload?.asset;
            const values = [
                ['Mode', mode || 'unavailable'], ['Page', record.title || record.target?.titleAtAttach || 'unavailable'],
                ['URL', record.url || record.target?.urlAtAttach || 'unavailable'], ['Captured', record.timestamp || 'unavailable'],
                ['Target', record.target?.id || 'unavailable'],
                ['Asset', asset?.selector || asset?.id || asset?.kind || 'unavailable'],
            ];
            for (const [label, value] of values) article.appendChild(element(doc, 'p', `${label}: ${value}`, { class: 'meta' }));
            const actions = element(doc, 'div', undefined, { class: 'actions' });
            const edit = button(doc, 'Edit', () => guard(() => startEdit(entry, article)), { 'aria-label': 'Edit annotation' });
            const remove = button(doc, 'Delete', () => guard(() => ask('Delete this exact saved annotation? This cannot be undone.', 'Delete annotation', () => mutate('delete', entry))), { 'aria-label': 'Delete annotation' });
            actions.appendChild(edit); actions.appendChild(remove); article.appendChild(actions);
            const details = element(doc, 'details'); details.appendChild(element(doc, 'summary', 'All saved metadata'));
            details.appendChild(element(doc, 'pre', JSON.stringify(record, null, 2))); article.appendChild(details);
            list.appendChild(article);
        }
        message(`${rows.length} saved pending annotation${rows.length === 1 ? '' : 's'}.`);
    };
    const startEdit = (entry, article) => {
        if (editing) render();
        // render() replaces the original row; locate it by exact opaque ID.
        article = Array.from(list.children).find(node => node.dataset.noteId === entry.id) || article;
        const doc = list.ownerDocument, form = element(doc, 'section', undefined, { class: 'note-editor' });
        const inputId = 'atoms-manager-note', modeId = 'atoms-manager-mode';
        form.appendChild(element(doc, 'label', 'Note text', { for: inputId }));
        const input = element(doc, 'textarea', undefined, { id: inputId, 'aria-label': 'Note text' }); input.value = text(entry.record); form.appendChild(input);
        form.appendChild(element(doc, 'label', 'Captured mode', { for: modeId }));
        const select = element(doc, 'select', undefined, { id: modeId, 'aria-label': 'Captured mode' });
        if (!['dark', 'light'].includes(capturedMode(entry.record))) select.appendChild(element(doc, 'option', 'Unavailable — choose mode', { value: '' }));
        for (const mode of ['dark', 'light']) select.appendChild(element(doc, 'option', mode === 'dark' ? 'Dark' : 'Light', { value: mode }));
        select.value = capturedMode(entry.record); form.appendChild(select);
        const actions = element(doc, 'div', undefined, { class: 'actions' });
        actions.appendChild(button(doc, 'Save', () => {
            if (!['dark', 'light'].includes(select.value)) { message('Choose the captured light or dark mode before saving.', true); select.focus(); return; }
            mutate('edit', entry, { note: input.value, colorMode: select.value });
        }, { class: 'primary' }));
        actions.appendChild(button(doc, 'Cancel', () => guard(() => { editing = null; render(); }, 'Discard your unsaved note corrections?')));
        form.appendChild(actions); article.appendChild(form);
        editing = { id: entry.id, revision: entry.revision, note: input.value, colorMode: select.value, input, mode: select };
        input.focus({ preventScroll: true });
    };
    const refresh = async (discard = false) => {
        if (!opened || stopped) return;
        if (!discard && dirty()) { message('Saved notes changed elsewhere. Your draft is preserved; Refresh to reload the latest notes.'); return; }
        if (discard && editing) { editing = null; render(); }
        const editorAtRequest = editing;
        requestedRevision = control()?.notesRevision || null;
        const generation = ++requestGeneration;
        message('Loading saved notes…'); refreshButton.disabled = true;
        try {
            const result = await request('list');
            if (stopped || !opened || generation !== requestGeneration) return;
            if (dirty() || editing !== editorAtRequest) {
                message('Saved notes changed while you were editing. Your draft is preserved; Refresh to load current notes.');
                return;
            }
            if (!Array.isArray(result?.notes)) throw Error('The controller returned an invalid note list.');
            rows = result.notes; revision = result.revision; render();
        } catch (error) { if (generation === requestGeneration) message(error.message || 'Saved notes could not be loaded.', true); }
        finally { if (generation === requestGeneration) { requestedRevision = null; if (refreshButton) refreshButton.disabled = false; } }
    };
    const mutate = async (action, entry, patch = {}) => {
        if (saving || stopped) return;
        saving = true;
        const controls = Array.from(dialog.querySelectorAll('button,input,textarea,select'));
        controls.forEach(node => { node.disabled = true; });
        message(action === 'delete' ? 'Deleting annotation…' : 'Saving annotation…');
        try {
            await request(action, { id: entry.id, revision: entry.revision, ...patch });
            editing = null; await refresh(true);
        } catch (error) {
            const conflict = error.code === 'CONFLICT';
            message(conflict ? 'This saved note changed or was removed elsewhere. Your draft is preserved. Refresh to load current notes before trying again.' : error.message || 'The change could not be saved. Your draft is preserved.', true);
        } finally { saving = false; controls.forEach(node => { node.disabled = false; }); }
    };
    const ensureHost = () => {
        if (host?.isConnected) return;
        host = element(document, 'div', undefined, { id: 'atoms-annotation-note-manager-host' });
        host.style.cssText = 'position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important';
        root = host.attachShadow({ mode: 'open' });
        root.appendChild(element(document, 'style', styles + 'dialog,#notes-menu{pointer-events:auto}'));
        menu = element(document, 'div', undefined, { id: 'notes-menu', popover: 'manual', role: 'menu', 'aria-label': 'Annotation options' }); menu.hidden = true;
        menu.appendChild(button(document, 'Manage notes', () => open({ anchor: returnFocus }), { role: 'menuitem' }));
        root.appendChild(menu); palette(host); palette(menu);
        document.documentElement.appendChild(host);
    };
    const openOverlay = async () => {
        const pid = Number(window.name.match(/uid(\d+)$/)[1]);
        const owner = window.opener;
        const info = (await owner.SteamClient.Overlay.GetOverlayBrowserInfo()).find(item => item.unPID === pid);
        if (!info) throw Error('Steam overlay browser is unavailable.');
        if (stopped || !opened) return;
        const result = owner.g_PopupManager.constructor.CreatePopup(`atoms_annotation_manager_uid${pid}`, {
            title: 'ATOMS saved annotations', dimensions: { width: Math.min(940, innerWidth - 32), height: Math.min(740, innerHeight - 32), left: 16, top: 16 },
            minWidth: 320, minHeight: 240, eCreationFlags: 4114,
            target_browser: { m_unPID: info.unPID, m_nBrowserID: info.nBrowserID, m_eBrowserType: info.eBrowserType },
        });
        if (!result.popup) throw Error('Steam could not open the note manager.');
        popup = result.popup;
        const p = popup, doc = p.document; palette(doc.documentElement);
        doc.body.replaceChildren(); createView(doc, doc.body, true);
        p.addEventListener('beforeunload', event => {
            if (dirty()) { event.preventDefault(); event.returnValue = ''; return; }
            if (popup === p) { releaseDocumentPalette(p.document); popup = null; opened = false; resetView(); returnFocus?.focus?.(); }
        });
        p.SteamClient.Window.ShowWindow(); p.SteamClient.Window.BringToFront(); p.SteamClient.Window.SetKeyFocus(true);
    };
    const open = async ({ anchor } = {}) => {
        if (stopped || opening) return false;
        if (opened) { dialog?.querySelector('button')?.focus?.(); return true; }
        if (noteOpen()) {
            ensureHost();
            const warning = element(document, 'p', 'Save or cancel the open annotation before managing saved notes.', { id: 'menu-status', role: 'status' });
            menu.querySelector('#menu-status')?.remove(); menu.appendChild(warning);
            return false;
        }
        returnFocus = anchor || returnFocus || document.getElementById('atoms-theme-toggle-host')?.shadowRoot?.querySelector('#atoms-annotator-menu');
        closeMenu(); opening = true; opened = true;
        try {
            if (/^desktopoverlay_uid\d+$/.test(window.name)) await openOverlay();
            else {
                ensureHost(); if (!dialog?.isConnected) createView(document, root);
                if (typeof dialog.showModal === 'function') dialog.showModal();
                else { dialog.setAttribute('open', ''); dialog.style.pointerEvents = 'auto'; }
                dialog.querySelector('button')?.focus?.();
            }
            if (!stopped && opened) await refresh(true);
            return true;
        } catch (error) { opened = false; ensureHost(); toggleMenu(returnFocus); menu.appendChild(element(document, 'p', error.message, { id: 'menu-status', role: 'status' })); return false; }
        finally { opening = false; }
    };
    const toggleMenu = anchor => {
        if (stopped) return;
        ensureHost();
        if (!menu.hidden) { closeMenu(); returnFocus?.focus?.(); return; }
        returnFocus = anchor || returnFocus;
        const rect = returnFocus?.getBoundingClientRect?.() || { right: innerWidth - 16, top: innerHeight - 48 };
        menu.querySelector('#menu-status')?.remove(); menu.hidden = false;
        menu.style.left = `${Math.max(8, Math.min(rect.right - 180, innerWidth - 196))}px`;
        menu.style.bottom = `${Math.max(8, innerHeight - rect.top + 6)}px`;
        if (typeof menu.showPopover === 'function') menu.showPopover();
        returnFocus?.setAttribute('aria-expanded', 'true'); menu.querySelector('button')?.focus?.();
        menuOutside = event => { if (!event.composedPath().includes(menu) && !event.composedPath().includes(returnFocus)) closeMenu(); };
        document.addEventListener('pointerdown', menuOutside, true);
    };
    const sync = () => {
        const toggle = document.getElementById('atoms-theme-toggle-host')?.shadowRoot?.querySelector('#atoms-annotator-menu');
        if (toggle) { toggle.disabled = !control()?.available || !control()?.requestNotes; toggle.title = toggle.disabled ? 'Start the annotation controller to manage notes' : 'Annotation options'; }
        const nextRevision = control()?.notesRevision;
        if (opened && !saving && nextRevision && nextRevision !== revision && nextRevision !== requestedRevision) refresh();
    };
    listen(window, 'atoms-debug-palette', () => {
        for (const target of paletteBindings.keys()) {
            if (target.isConnected === false) { paletteBindings.get(target)?.release?.(); paletteBindings.delete(target); }
            else palette(target);
        }
    });
    listen(window, 'atoms-debug-menu', sync);
    listen(window, 'atoms-debug-state', sync);
    listen(window, 'atoms-annotation-notes-changed', event => { if (opened && event.detail?.revision !== revision && !saving) refresh(); });
    listen(window, 'atoms-annotation-save-error', event => { if (opened) message(event.detail?.message || 'An annotation could not be saved. The current selection remains available.', true); });
    listen(document, 'keydown', event => {
        if (event.key === 'Escape' && menu && !menu.hidden) { event.preventDefault(); event.stopPropagation(); closeMenu(); returnFocus?.focus?.(); }
    }, true);
    listen(window, 'beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
    const api = {
        version: 1, stopped: false, open, toggleMenu, close, refresh: () => guard(() => refresh(true)), sync,
        isOpen: () => opened, isDirty: dirty,
        stop() {
            if (dirty() || saving) return false; // Do not silently discard a draft.
            stopped = true; api.stopped = true; finishClose();
            removers.splice(0).forEach(remove => remove()); paletteBindings.forEach(binding => binding.release?.()); paletteBindings.clear(); host?.remove(); return true;
        },
    };
    window[key] = api; sync(); return api;
}
module.exports = { installAnnotationNoteManager };
