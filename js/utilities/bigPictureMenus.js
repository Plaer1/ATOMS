// BrowserViews are created before Big Picture's theme script runs. Steam
// copies SharedJSContext's stylesheets into them, so seed only menu-scoped
// CSS there. No window.open patch, navigation hook, DOM scan or timer.
export function installBigPictureMenuStyles(ownerWindow = window, cssURL = new URL('../../css/bigpictureMenus.css', import.meta.url).href) {
    const shared = ownerWindow.opener?.g_WindowFocusCoordinator ? ownerWindow.opener : ownerWindow;
    if (!shared.document?.head) return null;
    const previous = shared.__atomsBigPictureMenusV1;
    if (previous?.version === 4) {
        previous.setOwner(ownerWindow);
        previous.sync();
        return previous;
    }
    previous?.stop();

    const links = new Map();
    const listeners = new Map();
    let disabled = false;
    let stopped = false;
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
        if (parentStyle) disabled = parentStyle.disabled;
        attach(view);
        if (!listeners.has(view) && view.addEventListener) {
            const onToggle = (event) => {
                disabled = Boolean(event.detail.disabled);
                sync();
            };
            view.addEventListener('atoms-theme-toggle', onToggle);
            listeners.set(view, onToggle);
        }
    };
    const api = {
        version: 4, sync, setOwner,
        applyTo(view) {
            if (/^(MainMenu|QuickAccess)_/.test(view?.name ?? view?.document?.title ?? '')) attach(view);
        },
        stop() {
            stopped = true;
            for (const [view, listener] of listeners) {
                if (!view.closed) view.removeEventListener('atoms-theme-toggle', listener);
            }
            listeners.clear();
            links.clear();
            if (shared.__atomsBigPictureMenusV1 === api) delete shared.__atomsBigPictureMenusV1;
        }
    };
    shared.__atomsBigPictureMenusV1 = api;
    setOwner(ownerWindow);
    sync();
    return api;
}
