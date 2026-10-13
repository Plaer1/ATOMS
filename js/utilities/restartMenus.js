import getTranslation from './translate.js';

const API_KEY = '__atomsRestartMenusV1';
const MENU_SELECTOR = '._2EstNjFIIZm_WUSKm5Wt7n._3pofGqV0buiKAfMPEs3_82';
const ACTION_MARKER = 'data-atoms-menu-action';
const LEGACY_MARKER = 'data-atoms-account-action';

async function menuLabel(key, fallback) {
    const locale = document.documentElement.lang || 'en';
    for (const candidate of new Set([locale, locale.split('-')[0], 'en'])) {
        const label = await getTranslation(key, candidate);
        if (!label.startsWith('Translation not found')) return label;
    }
    return fallback;
}

function createItem(template, text, action) {
    const item = template.cloneNode(false);
    item.removeAttribute('id');
    item.removeAttribute('aria-disabled');
    item.removeAttribute('data-tooltip-text');
    item.textContent = text;
    item.setAttribute('role', 'menuitem');
    item.setAttribute('aria-label', text);
    item.setAttribute(ACTION_MARKER, action);
    item.tabIndex = 0;
    item.onclick = () => {
        const owner = window.opener;
        if (!owner || typeof owner.eval !== 'function') return;
        owner.eval(action === 'reload' ? 'location.reload()' : 'SteamClient.User.StartRestart(false)');
    };
    item.onkeydown = event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        item.click();
    };
    return item;
}

export default async function installRestartMenuActions() {
    const isMac = /Macintosh|Mac OS X/.test(navigator.userAgent);
    const accountMenu = document.title === 'Account Menu';
    const rootMenu = document.title === 'Steam Root Menu';
    // macOS's application menu is native. Windows/Linux get both CEF menus.
    if (!accountMenu && (!rootMenu || isMac)) return null;
    if (window[API_KEY]) {
        window[API_KEY].sync();
        return window[API_KEY];
    }
    const [reloadLabel, restartLabel] = await Promise.all([
        menuLabel('reloadSteam', 'Reload Steam'),
        menuLabel('restartSteam', 'Restart Steam')
    ]);
    if (window[API_KEY]) return window[API_KEY];

    let observer = null;
    let stopped = false;
    const sync = () => {
        if (stopped) return;
        const menu = document.querySelector(MENU_SELECTOR);
        if (!menu) return;
        // Adopt old Mac-hook entries without duplicating them.
        for (const item of menu.querySelectorAll(`[${LEGACY_MARKER}]`)) {
            if (!item.hasAttribute(ACTION_MARKER)) {
                item.setAttribute(ACTION_MARKER, item.getAttribute(LEGACY_MARKER));
            }
        }
        const nativeItems = [...menu.children].filter(item =>
            !item.hasAttribute(ACTION_MARKER) &&
            (item.getAttribute('role') === 'menuitem' || item.classList.contains('contextMenuItem'))
        );
        const anchor = nativeItems.at(-1);
        if (!anchor) return;
        for (const [action, label] of [['reload', reloadLabel], ['restart', restartLabel]]) {
            if (menu.querySelector(`[${ACTION_MARKER}="${action}"]`)) continue;
            const item = createItem(anchor, label, action);
            if (accountMenu) menu.insertBefore(item, anchor);
            else menu.appendChild(item);
        }
    };
    const stop = () => {
        stopped = true;
        observer?.disconnect();
        window.removeEventListener('pagehide', stop);
        delete window[API_KEY];
    };
    const api = { sync, stop };
    window[API_KEY] = api;
    sync();
    if (document.documentElement) {
        observer = new MutationObserver(sync);
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    window.addEventListener('pagehide', stop, { once: true });
    return api;
}
