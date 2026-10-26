'use strict';

// Session preview requests use the controller. This document owns only its
// temporary stylesheet media overrides; Millennium owns default stylesheets.
function installAnnotationColorToggle(lightCssURL) {
    if (/^about:srcdoc(?:[?#]|$)/i.test(location.href) || /^atoms_annotation(?:_manager)?_uid/.test(window.name)) return null;
    const key = '__atomsAnnotationColorToggleV1';
    if (window[key]?.version >= 11 && !window[key].stopped) { window[key].sync(); return window[key]; }
    try { window[key]?.stop(); } catch (_) { /* Retire legacy lifecycle owners. */ }
    const readMode = () => document.documentElement && getComputedStyle(document.documentElement)
        .getPropertyValue('--atoms-color-mode').trim() === 'light' ? 'light' : 'dark';
    let mode = null, ownLink = null, button = null, stopped = false, updateTimer = null, revision = -1, paletteCleanup = null;
    const originalMedia = new Map();
    const stylesheetLoads = new Map();
    const bridge = () => {
        const control = window.__atomsAnnotationControlV1;
        return control && !control.stopped && control.available !== false && typeof control.setColorMode === 'function' ? control : null;
    };
    const lightLinks = () => [...document.querySelectorAll('link[rel~="stylesheet"]')]
        .filter(l => /\/ATOMS\/css\/lightMode\.css(?:[?#]|$)/i.test(l.href));
    const update = () => {
        if (!button) return;
        const current = mode || readMode();
        const target = current === 'light' ? 'dark' : 'light';
        button.textContent = target.toUpperCase() + ' MODE';
        button.disabled = !bridge();
        button.title = !bridge() ? 'Annotation controller unavailable' : `Preview ${target} mode in all Steam views (until the saved theme setting changes)`;
        button.setAttribute('aria-label', button.title);
    };
    const restore = () => {
        // A native navigation/legacy owner can leave a tagged link outside
        // this closure's pointer. The active document owner retires all such
        // preview resources; saved/default links retain their original media.
        if (!window[key] || window[key] === api) {
            for (const [link, media] of originalMedia) if (link.isConnected && link.media !== media) link.media = media;
            for (const link of lightLinks()) if ('atomsDebugColorMode' in link.dataset) link.remove();
            ownLink?.remove();
        }
        originalMedia.clear(); ownLink = null;
    };
    const apply = () => {
        if (stopped) return;
        if (mode === null) { restore(); return; }
        if (!document.head) return;
        if (mode === 'light' && !lightLinks().length) {
            ownLink = document.createElement('link'); ownLink.rel = 'stylesheet';
            ownLink.href = lightCssURL || 'https://millennium.host/v1/themes/ATOMS/css/lightMode.css';
            ownLink.dataset.atomsDebugColorMode = ''; document.head.appendChild(ownLink);
        }
        for (const link of lightLinks()) {
            if (!originalMedia.has(link)) originalMedia.set(link, link.media);
            // Saved/native hooks can arrive already inactive. A forced light
            // preview enables them; reset still restores their exact preimage.
            const media = mode === 'light' ? '' : 'not all';
            // Reassigning an unchanged media value can reactivate the sheet
            // and emit another load event, exposing a frame without its colors.
            if (link.media !== media) link.media = media;
        }
        update();
    };
    const applyMode = next => {
        mode = next;
        if (mode === null) restore();
        else { window.__atomsThemeToggleV1?.setDisabled(false); apply(); }
        update(); clearTimeout(updateTimer);
        if (!stopped) updateTimer = setTimeout(update, 0);
        window.dispatchEvent(new CustomEvent('atoms-debug-color-mode', { detail: { colorMode: mode || readMode(), previewMode: mode } }));
        return mode || readMode();
    };
    const applyState = state => {
        if (stopped || !state || (Number.isFinite(state.revision) && state.revision < revision)) return readMode();
        if (Number.isFinite(state.revision)) revision = state.revision;
        const next = state.previewMode === 'light' || state.previewMode === 'dark' ? state.previewMode : null;
        if (next !== mode) return applyMode(next);
        apply(); update(); return mode || readMode();
    };
    const reset = () => {
        if (stopped) return readMode();
        bridge()?.setColorMode(null); return mode || readMode();
    };
    const setMode = next => {
        if (next !== 'light' && next !== 'dark') throw Error('Expected light or dark');
        if (stopped) return readMode();
        bridge()?.setColorMode(next); return mode || readMode();
    };
    const observed = new Set();
    const sync = () => {
        if (stopped) return;
        for (const target of [document.documentElement, document.head]) if (target && !observed.has(target)) {
            observer.observe(target, { childList: true }); observed.add(target);
        }
        const shadow = document.getElementById('atoms-theme-toggle-host')?.shadowRoot;
        let existing = shadow?.getElementById('atoms-color-mode-toggle');
        if (button && button !== existing) { paletteCleanup?.(); paletteCleanup = null; button = null; }
        // A replaced host can contain a copied/retired button. Recreate it
        // under this owner so label, click handler and counterpart binding agree.
        if (existing && existing !== button) { existing.remove(); existing = null; }
        if (shadow && !existing) {
            button = document.createElement('button'); button.id = 'atoms-color-mode-toggle'; button.type = 'button';
            button.style.marginLeft = '8px';
            button.addEventListener('click', () => setMode((mode || readMode()) === 'light' ? 'dark' : 'light'));
            shadow.appendChild(button);
        }
        if (button && !paletteCleanup && window.__atomsDebugPaletteV1?.apply) paletteCleanup = window.__atomsDebugPaletteV1.apply(button, { counterpart: true });
        for (const link of lightLinks()) if (!stylesheetLoads.has(link)) {
            const onLoad = () => { apply(); update(); };
            link.addEventListener('load', onLoad); stylesheetLoads.set(link, onLoad);
        }
        apply(); update();
    };
    const observer = new MutationObserver(mutations => {
        if (mutations.some(m => [...m.addedNodes].some(n => n.id === 'atoms-theme-toggle-host' || n.tagName === 'LINK' || n.tagName === 'HEAD'))) sync();
    });
    const onPageHide = () => {
        // BFCache/document cleanup restores local resources, never session state.
        restore();
    };
    const onPageShow = () => { const control = bridge(); if (control) applyState(control); sync(); };
    const onState = event => applyState(event.detail);
    const stop = () => {
        if (stopped) return;
        stopped = true; api.stopped = true;
        observer.disconnect();
        for (const [link, handler] of stylesheetLoads) link.removeEventListener('load', handler);
        stylesheetLoads.clear();
        mode = null; restore(); clearTimeout(updateTimer);
        window.removeEventListener('pagehide', onPageHide); window.removeEventListener('pageshow', onPageShow);
        window.removeEventListener('load', sync); window.removeEventListener('atoms-debug-state', onState);
        window.removeEventListener('atoms-debug-palette', sync);
        document.removeEventListener?.('DOMContentLoaded', sync);
        paletteCleanup?.(); paletteCleanup = null; button?.remove();
        window.__atomsThemeToggleV1?.setDisabled(false);
    };
    const api = { version: 11, sync, setMode, reset, applyState, getOverride: () => mode, getMode: () => mode || readMode(), stop, stopped: false };
    window[key] = api;
    window.addEventListener('pagehide', onPageHide); window.addEventListener('pageshow', onPageShow); window.addEventListener('load', sync);
    window.addEventListener('atoms-debug-state', onState); window.addEventListener('atoms-debug-palette', sync);
    document.addEventListener?.('DOMContentLoaded', sync);
    if (bridge()) applyState(bridge());
    sync(); return api;
}
module.exports = { installAnnotationColorToggle };
