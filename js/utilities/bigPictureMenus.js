// BrowserViews are created before Big Picture's theme script runs. Steam
// copies SharedJSContext's stylesheets into them, so seed only menu-scoped
// CSS there. No window.open patch, navigation hook, DOM scan or timer.
export function installBigPictureMenuStyles(ownerWindow = window, cssURL = new URL('../../css/bigpictureMenus.css', import.meta.url).href) {
    const shared = ownerWindow.opener?.g_WindowFocusCoordinator ? ownerWindow.opener : ownerWindow;
    if (!shared.document?.head) return null;
    const previous = shared.__atomsBigPictureMenusV1;
    if (previous?.version === 6) {
        previous.setOwner(ownerWindow);
        previous.sync();
        return previous;
    }
    previous?.stop();

    const links = new Map();
    const listeners = new Map();
    let disabled = false;
    let stopped = false;
    let paletteOwner = null;
    const paletteSelector = 'link[href*="/ATOMS/css/lightMode.css"], style#RootColors, style#SystemAccentColorInject, style#GlobalColors';
    // Forward only nodes already produced by Millennium's native loader. The
    // BrowserView copier does not run its conditional loader in SharedJSContext.
    // Never fetch a palette, read settings, or infer the saved mode here.
    const copyPalette = (view) => {
        if (!paletteOwner || view === paletteOwner) return;
        const doc = view.document;
        const sources = Array.from(paletteOwner.document.querySelectorAll(paletteSelector));
        const liveKeys = new Set();
        for (const source of sources) {
            const key = source.tagName === 'LINK' ? 'light-mode' : source.id;
            liveKeys.add(key);
            let copy = doc.querySelector(`[data-atoms-bigpicture-palette="${key}"]`);
            if (!copy) {
                copy = doc.createElement(source.tagName.toLowerCase());
                copy.setAttribute('data-atoms-bigpicture-palette', key);
                if (source.tagName === 'LINK') { copy.rel = 'stylesheet'; copy.href = source.href; }
                doc.head.appendChild(copy);
            }
            if (source.tagName === 'STYLE' && copy.textContent !== source.textContent) copy.textContent = source.textContent;
            const off = disabled || source.disabled || source.hasAttribute('disabled');
            copy.toggleAttribute('disabled', Boolean(off));
            copy.disabled = Boolean(off);
        }
        for (const copy of doc.querySelectorAll('[data-atoms-bigpicture-palette]')) {
            if (!liveKeys.has(copy.getAttribute('data-atoms-bigpicture-palette'))) copy.remove();
        }
    };
    const attach = (view) => {
        if (stopped || !view || view.closed || !view.document?.head) return;
        const doc = view.document;
        let link = doc.querySelector('link[data-atoms-bigpicture-menu-source], link[href*="/ATOMS/css/bigpictureMenus.css"]');
        if (!link) {
            link = doc.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssURL;
            link.dataset.atomsBigpictureMenuSource = '';
            doc.head.appendChild(link);
        }
        // Steam copies attributes, not stylesheet properties, to new views.
        link.toggleAttribute('disabled', disabled);
        link.disabled = disabled;
        links.set(view, link);
        copyPalette(view);
    };
    const sync = () => {
        for (const view of links.keys()) {
            if (view.closed) links.delete(view);
            else attach(view);
        }
        attach(shared);
    };
    const setOwner = (view) => {
        if (!view || view.closed) return;
        for (const old of listeners.keys()) if (old.closed) listeners.delete(old);
        const parentStyle = view.document?.querySelector('link[href*="/ATOMS/css/bigpicture.css"], link[href*="/ATOMS/css/library.css"]');
        if (parentStyle) {
            disabled = parentStyle.disabled;
            paletteOwner = view;
        }
        attach(view);
        sync();
        const existingListener = listeners.get(view);
        if (existingListener && existingListener.document !== view.document) {
            view.removeEventListener('atoms-theme-toggle', existingListener.listener);
            listeners.delete(view);
        }
        if (!listeners.has(view) && view.addEventListener) {
            const onToggle = (event) => {
                disabled = Boolean(event.detail.disabled);
                sync();
            };
            view.addEventListener('atoms-theme-toggle', onToggle);
            listeners.set(view, { document: view.document, listener: onToggle });
        }
    };
    const api = {
        version: 6, sync, setOwner,
        applyTo(view) {
            if (/^(MainMenu|QuickAccess)_/.test(view?.name ?? view?.document?.title ?? '')) attach(view);
        },
        stop() {
            stopped = true;
            for (const [view, entry] of listeners) {
                if (!view.closed) view.removeEventListener('atoms-theme-toggle', entry.listener);
            }
            listeners.clear();
            for (const view of links.keys()) if (!view.closed) {
                for (const copy of view.document.querySelectorAll('[data-atoms-bigpicture-palette]')) copy.remove();
            }
            links.clear();
            if (shared.__atomsBigPictureMenusV1 === api) delete shared.__atomsBigPictureMenusV1;
        }
    };
    shared.__atomsBigPictureMenusV1 = api;
    setOwner(ownerWindow);
    sync();
    return api;
}
