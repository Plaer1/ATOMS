// The native Dim condition loads this pure installer. It owns only capsule
// opacity, never a tile's transform/layout, text, glyphs or other inline style.
export default function transparentGames(ownerWindow = window) {
    const key = '__atomsTransparentGamesV1';
    const doc = ownerWindow.document;
    const existing = ownerWindow[key];
    if (existing && !existing.stopped) { existing.refresh(); return existing; }
    const tileSelector = '._1pwP4eeP1zQD7PEgmsep0W';
    const uninstalledSelector = '._8YrRmy_c6O0FCxFT8gjqo, .kX-tIJx4a9vKVuUkKJARv';
    const artSelector = 'img._24_AuLm54JVe1Zc0AApCDR';
    const ownedValue = 'var(--transparentGameOpacity)';
    const tiles = new Set(), artByTile = new Map(), previous = new Map();
    const relinquished = new WeakSet();
    let disabled = Boolean(ownerWindow.__atomsThemeToggleV1?.isDisabled());
    let hidden = false, observing = false, eligible = false;
    const isElement = node => node?.nodeType === 1;
    const isGamepad = () => doc.body?.classList.contains('GamepadMode') ||
        doc.documentElement?.classList.contains('GamepadMode') || doc.querySelector('.BasicUI.GamepadMode');
    const stillOwned = art => art.style.getPropertyValue('opacity') === ownedValue &&
        art.style.getPropertyPriority('opacity') === 'important';
    const restoreArt = art => {
        const old = previous.get(art);
        if (old && stillOwned(art)) {
            if (old.value) art.style.setProperty('opacity', old.value, old.priority);
            else art.style.removeProperty('opacity');
        }
        previous.delete(art);
    };
    const releaseTile = tile => {
        const art = artByTile.get(tile);
        if (art) restoreArt(art);
        artByTile.delete(tile);
    };
    const releaseAll = () => {
        for (const art of previous.keys()) restoreArt(art);
        artByTile.clear();
    };
    const artwork = tile => {
        const image = tile.querySelector(artSelector);
        if (image) return image;
        // Some native capsules use an image-backed wrapper. Never fall back
        // to the whole tile, which also contains captions and state controls.
        const wrapper = tile.querySelector('._1R9r2OBCxAmtuUVrgBEUBw');
        return wrapper && ownerWindow.getComputedStyle(wrapper).backgroundImage !== 'none' ? wrapper : null;
    };
    const applyTile = tile => {
        if (!tile.isConnected || !tile.matches(tileSelector)) { releaseTile(tile); tiles.delete(tile); return; }
        const oldArt = artByTile.get(tile);
        if (!tile.querySelector(uninstalledSelector)) {
            if (oldArt) relinquished.delete(oldArt);
            releaseTile(tile); return;
        }
        const art = artwork(tile);
        if (oldArt && oldArt !== art) releaseTile(tile);
        if (!art) return;
        if (previous.has(art) && !stillOwned(art)) {
            // Do not fight a later native/user opacity owner or restore over it.
            previous.delete(art); relinquished.add(art);
        }
        artByTile.set(tile, art);
        if (relinquished.has(art)) return;
        if (!previous.has(art)) previous.set(art, {
            value: art.style.getPropertyValue('opacity'), priority: art.style.getPropertyPriority('opacity')
        });
        if (!stillOwned(art)) art.style.setProperty('opacity', ownedValue, 'important');
    };
    const collect = (node, dirty) => {
        if (!isElement(node)) return;
        const tile = node.closest(tileSelector);
        if (tile) { tiles.add(tile); dirty.add(tile); }
        for (const child of node.querySelectorAll(tileSelector)) { tiles.add(child); dirty.add(child); }
    };
    const reconcile = dirty => {
        const next = !api.stopped && !hidden && !disabled && !isGamepad();
        if (!next) { eligible = false; releaseAll(); return; }
        if (!eligible) dirty = new Set(tiles);
        eligible = true;
        for (const tile of tiles) if (!tile.isConnected || !tile.matches(tileSelector)) { releaseTile(tile); tiles.delete(tile); }
        for (const tile of dirty) applyTile(tile);
    };
    const observer = new ownerWindow.MutationObserver(mutations => {
        const dirty = new Set();
        for (const mutation of mutations) {
            const tile = isElement(mutation.target) && mutation.target.closest(tileSelector);
            if (tile) { tiles.add(tile); dirty.add(tile); }
            if (mutation.type === 'childList') for (const node of mutation.addedNodes) collect(node, dirty);
        }
        reconcile(dirty);
    });
    const refresh = () => {
        if (api.stopped || !doc.documentElement) return api;
        if (!observing && !hidden) {
            observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'src'] });
            observing = true;
        }
        const dirty = new Set();
        collect(doc.documentElement, dirty);
        reconcile(dirty);
        return api;
    };
    const onToggle = event => { disabled = Boolean(event.detail?.disabled); reconcile(new Set(tiles)); };
    const onHide = () => { hidden = true; eligible = false; observer.disconnect(); observing = false; releaseAll(); };
    const onShow = () => { hidden = false; refresh(); };
    const api = { version: 1, stopped: false, refresh, stop() {
        if (api.stopped) return;
        api.stopped = true; observer.disconnect(); observing = false; releaseAll(); tiles.clear();
        doc.removeEventListener('DOMContentLoaded', refresh);
        ownerWindow.removeEventListener('atoms-theme-toggle', onToggle);
        ownerWindow.removeEventListener('pagehide', onHide); ownerWindow.removeEventListener('pageshow', onShow);
        if (ownerWindow[key] === api) delete ownerWindow[key];
    } };
    ownerWindow[key] = api;
    doc.addEventListener('DOMContentLoaded', refresh, { once: true });
    ownerWindow.addEventListener('atoms-theme-toggle', onToggle);
    ownerWindow.addEventListener('pagehide', onHide); ownerWindow.addEventListener('pageshow', onShow);
    return refresh();
}
