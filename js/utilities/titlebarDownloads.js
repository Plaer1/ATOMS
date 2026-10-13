const TITLE_CONTROLS = '._3cykd-VfN_xBxf3Qxriccm';
const DOWNLOADS_BAR = '._3vCzSrrXZzZjVJFZNg9SGu';
const MARKER = 'data-atoms-titlebar-downloads';

export default function installTitlebarDownloads({ mac = false } = {}) {
    const key = mac ? '__atomsMacButtonsWatcher' : '__atomsTitlebarDownloadsV1';
    if (window[key]?.sync) {
        window[key].sync();
        return window[key];
    }
    let stopped = false;
    let observer = null;
    const sync = () => {
        if (stopped) return;
        const titleControls = document.querySelector(TITLE_CONTROLS);
        const downloadsBar = document.querySelector(DOWNLOADS_BAR);
        if (!titleControls?.parentNode || !downloadsBar) return;
        // Adopt an earlier ATOMS wrapper instead of nesting another one.
        let wrapper = downloadsBar.closest('.Focusable-downloads');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'Focusable-downloads';
            wrapper.appendChild(downloadsBar);
        }
        if (!wrapper.hasAttribute(MARKER)) wrapper.setAttribute(MARKER, 'true');
        if (mac && !wrapper.hasAttribute('data-atoms-mac-buttons')) {
            wrapper.setAttribute('data-atoms-mac-buttons', 'true');
        }
        if (wrapper.parentNode !== titleControls.parentNode || wrapper.nextSibling !== titleControls) {
            titleControls.parentNode.insertBefore(wrapper, titleControls);
        }
        // Remove only orphaned wrappers made by this installer.
        for (const orphan of document.querySelectorAll(`[${MARKER}]`)) {
            if (orphan !== wrapper && !orphan.querySelector(DOWNLOADS_BAR)) orphan.remove();
        }
    };
    const stop = () => {
        stopped = true;
        observer?.disconnect();
        window.removeEventListener('pagehide', stop);
        delete window[key];
    };
    const api = { sync, stop };
    window[key] = api;
    if (document.documentElement) {
        observer = new MutationObserver(sync);
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    window.addEventListener('pagehide', stop, { once: true });
    sync();
    return api;
}
