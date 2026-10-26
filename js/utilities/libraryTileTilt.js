// Enhance only Steam's existing desktop portrait hover. Steam still owns the
// capsule, perspective, depth, opacity, focus and drag behavior; CSS owns paint.
export default function installLibraryTileTilt(ownerWindow = window) {
    const key = '__atomsLibraryTileTiltV1';
    const existing = ownerWindow[key];
    if (existing && !existing.stopped) {
        if (existing.version === 2) return existing;
        existing.stop();
    }
    const doc = ownerWindow.document;
    const tileSelector = '._1pwP4eeP1zQD7PEgmsep0W._54PuCatl_tYG836TOs4Mv';
    const panelSelector = '.WYgDg9NyCcMIVuMyZ_NBC';
    const shineSelector = '.MyNb5dG3FsBnKdp8j_ntk';
    const excluded = '.LowPerfMode,.BasicUI,.GamepadMode';
    const marker = 'data-atoms-library-tile-tilt';
    const reducedMotion = ownerWindow.matchMedia?.('(prefers-reduced-motion: reduce)');
    let disabled = Boolean(ownerWindow.__atomsThemeToggleV1?.isDisabled());
    let hidden = false, active = null, point = null, frame = null;
    const paused = () => disabled || hidden || doc.visibilityState === 'hidden' || reducedMotion?.matches;
    const eligible = state => state.tile.isConnected && state.panel.isConnected &&
        state.tile.matches(tileSelector) && !state.tile.closest(excluded) &&
        state.panel.matches(panelSelector) && state.panel.closest(tileSelector) === state.tile &&
        !state.panel.classList.contains('_3VOR2AeYATx3qSE0I-Pm-5') &&
        state.panel.querySelector(shineSelector) === state.shine && state.shine.isConnected;
    const restore = () => {
        if (frame !== null) ownerWindow.cancelAnimationFrame(frame);
        frame = null; point = null; observer.disconnect();
        if (!active) return;
        for (const [name, saved] of active.styles) {
            if (active.panel.style.getPropertyValue(name) !== saved.owned ||
                active.panel.style.getPropertyPriority(name) !== '') continue;
            if (saved.value) active.panel.style.setProperty(name, saved.value, saved.priority);
            else active.panel.style.removeProperty(name);
        }
        if (active.panel.getAttribute(marker) === 'pointer') {
            if (active.marker === null) active.panel.removeAttribute(marker);
            else active.panel.setAttribute(marker, active.marker);
        }
        active = null;
    };
    const observer = new ownerWindow.MutationObserver(() => {
        // Observing only while a tile is active releases virtualized/changed
        // owners, including Steam's live performance/accessibility class swap.
        if (active && (!eligible(active) || paused())) restore();
    });
    const write = (name, value) => {
        const style = active.panel.style, saved = active.styles.get(name);
        if (saved && (style.getPropertyValue(name) !== saved.owned || style.getPropertyPriority(name) !== '')) return false;
        if (!saved) active.styles.set(name, {
            value: style.getPropertyValue(name), priority: style.getPropertyPriority(name), owned: value,
        });
        else saved.owned = value;
        if (style.getPropertyValue(name) !== value || style.getPropertyPriority(name)) style.setProperty(name, value);
        return true;
    };
    const intensity = () => {
        // Millennium's slider publishes a percentage. Resolve it on each
        // movement frame so live changes need no reinstall or settings read.
        const raw = ownerWindow.getComputedStyle(doc.documentElement)
            .getPropertyValue('--libraryTileTiltIntensity').trim();
        if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?%$/i.test(raw)) return 1;
        const percent = Number(raw.slice(0, -1));
        return Number.isFinite(percent) ? Math.max(0, Math.min(200, percent)) / 100 : 1;
    };
    const render = () => {
        frame = null;
        if (!active || !point || paused() || !eligible(active) ||
            (active.styles.size && active.panel.getAttribute(marker) !== 'pointer')) { restore(); return; }
        const { width, height, left, top } = active.tile.getBoundingClientRect();
        if (width <= 0 || height <= 0) { restore(); return; }
        const clamp = n => Math.max(-1, Math.min(1, n));
        const x = clamp((point.x - left) / width * 2 - 1);
        const y = clamp((point.y - top) / height * 2 - 1);
        const scale = intensity();
        const values = [
            ['--atoms-library-tilt-base', `${(3 * scale).toFixed(3)}deg`],
            ['--atoms-library-tilt-x', `${(-y * 6 * scale).toFixed(3)}deg`],
            ['--atoms-library-tilt-y', `${(x * 6 * scale).toFixed(3)}deg`],
            ['--atoms-library-shine-x', `${(x * 8 * scale).toFixed(3)}%`],
            ['--atoms-library-shine-y', `${(y * 8 * scale).toFixed(3)}%`],
        ];
        for (const [name, value] of values) if (!write(name, value)) { restore(); return; }
        if (active.panel.getAttribute(marker) !== 'pointer') active.panel.setAttribute(marker, 'pointer');
    };
    const onMove = event => {
        if (api.stopped || paused() || event.buttons || (event.pointerType && event.pointerType !== 'mouse')) { restore(); return; }
        const tile = event.target?.closest?.(tileSelector);
        const panel = tile?.querySelector(panelSelector), shine = panel?.querySelector(shineSelector);
        const next = { tile, panel, shine };
        if (!tile || !panel || !shine || !eligible(next)) { restore(); return; }
        if (active?.panel !== panel) {
            restore();
            active = { ...next, styles: new Map(), marker: panel.getAttribute(marker) };
            observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        }
        point = { x: event.clientX, y: event.clientY };
        if (frame === null) frame = ownerWindow.requestAnimationFrame(render);
    };
    const onOut = event => {
        if (active?.tile.contains(event.target) && !active.tile.contains(event.relatedTarget)) restore();
    };
    const onToggle = event => { disabled = Boolean(event.detail?.disabled); if (disabled) restore(); };
    const onHide = () => { hidden = true; restore(); };
    const onShow = () => { hidden = false; };
    const onVisibility = () => { if (doc.visibilityState === 'hidden') restore(); };
    const onMotion = () => { if (reducedMotion.matches) restore(); };
    const listeners = [
        [doc, 'pointermove', onMove], [doc, 'pointerout', onOut],
        [doc, 'pointerdown', restore], [doc, 'pointercancel', restore],
        [doc, 'dragstart', restore], [doc, 'keydown', restore],
        [doc, 'visibilitychange', onVisibility],
        [ownerWindow, 'blur', restore], [ownerWindow, 'resize', restore],
        [ownerWindow, 'scroll', restore], [ownerWindow, 'pagehide', onHide],
        [ownerWindow, 'pageshow', onShow], [ownerWindow, 'atoms-theme-toggle', onToggle],
    ];
    const api = { version: 2, stopped: false, isActive: () => Boolean(active), stop() {
        if (api.stopped) return;
        api.stopped = true; restore();
        for (const [target, type, callback] of listeners) target.removeEventListener(type, callback, true);
        reducedMotion?.removeEventListener?.('change', onMotion);
        if (ownerWindow[key] === api) delete ownerWindow[key];
    } };
    ownerWindow[key] = api;
    for (const [target, type, callback] of listeners) target.addEventListener(type, callback, { capture: true, passive: true });
    reducedMotion?.addEventListener?.('change', onMotion);
    return api;
}
