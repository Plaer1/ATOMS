import { isProfileLanding } from './pageRoutes.js';

// This one requested own-profile exception is reversible. No account ID,
// authored text, artist background or other profile element is changed.
export function installProfileOwnNotice() {
    const key = '__atomsProfileOwnNoticeV1';
    if (window[key] && !window[key].stopped) { window[key].refresh(); return window[key]; }
    if (!isProfileLanding() || !document.querySelector('body.profile_page')) return null;
    const attribute = 'data-atoms-own-profile-notice', marked = new Map();
    const style = document.createElement('style');
    style.dataset.atomsVisualEffect = 'profile-own-notice';
    style.textContent = `[${attribute}="hidden"] { display: none !important; }`;
    document.head.appendChild(style);
    let stopped = false;
    const ownsProfile = () => isProfileLanding() && document.querySelector('body.profile_page') &&
        [...document.querySelectorAll('.profile_header_actions a[href]')].some(link => {
            try {
                const url = new URL(link.href, location.href);
                return /^(?:www\.)?steamcommunity\.com$/i.test(url.hostname) &&
                    /^\/(?:id|profiles)\/[^/]+\/edit(?:\/info)?\/?$/.test(url.pathname);
            } catch { return false; }
        });
    const restore = element => {
        const previous = marked.get(element);
        if (previous === null) element.removeAttribute(attribute);
        else element.setAttribute(attribute, previous);
        marked.delete(element);
    };
    const refresh = () => {
        if (stopped) return;
        const notices = ownsProfile() ? new Set(document.querySelectorAll('body.profile_page .profile_ban_status')) : new Set();
        for (const element of marked.keys()) if (!notices.has(element)) restore(element);
        for (const element of notices) {
            if (!marked.has(element)) marked.set(element, element.getAttribute(attribute));
            if (element.getAttribute(attribute) !== 'hidden') element.setAttribute(attribute, 'hidden');
        }
    };
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href','class'] });
    window.addEventListener('pageshow', refresh);
    window.addEventListener('popstate', refresh);
    const api = { stopped: false, refresh, stop() {
        stopped = api.stopped = true; observer.disconnect();
        window.removeEventListener('pageshow', refresh); window.removeEventListener('popstate', refresh);
        for (const element of [...marked.keys()]) restore(element);
        style.remove();
    } };
    window[key] = api; refresh(); window.__atomsThemeToggleV1?.sync();
    return api;
}

export default installProfileOwnNotice;
