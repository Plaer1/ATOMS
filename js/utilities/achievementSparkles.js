// Reuse Steam's native SVG stars/timing for the annotated rare badges. This
// watches added subtrees only; no timer, page-wide rescan or artwork filter.
export default function installAchievementSparkles() {
    if (!/^\/(?:id|profiles)\/[^/]+\/achievements\/\d+(?:\/|$)/.test(location.pathname)) return null;
    const key = '__atomsAchievementSparklesV1';
    if (window[key] && !window[key].stopped) return window[key];
    const sourceSelector = '.baoabtDhz7Y- .lDp-l-8FD9A-';
    const badgeSelector = '.YdwpRPPithE-.tQWKFb1QLD0-';
    const marker = '[data-atoms-achievement-sparkles]';
    let template = null, stopped = false;

    const getTemplate = () => {
        if (template) return true;
        const source = document.querySelector(sourceSelector);
        if (!source) return false;
        template = source.cloneNode(true);
        template.setAttribute('data-atoms-achievement-sparkles', '');
        template.setAttribute('aria-hidden', 'true');
        // Only the theme sheet shows the layer: comparison OFF hides it too.
        template.style.setProperty('display', 'none');
        return true;
    };
    const decorate = badge => {
        if (!badge.isConnected || badge.querySelector(marker) || !getTemplate()) return;
        badge.appendChild(template.cloneNode(true));
    };
    const visit = root => {
        if (stopped || root.nodeType !== 1 || root.closest(marker)) return;
        if (root.matches(badgeSelector)) decorate(root);
        for (const badge of root.querySelectorAll(badgeSelector)) decorate(badge);
    };
    const observer = new MutationObserver(mutations => {
        const hadTemplate = Boolean(template);
        if (!getTemplate()) return;
        if (!hadTemplate) {
            visit(document.body);
            return;
        }
        for (const mutation of mutations) for (const node of mutation.addedNodes) visit(node);
    });
    if (getTemplate()) visit(document.body);
    observer.observe(document.body, { childList: true, subtree: true });

    const stop = () => {
        if (stopped) return;
        stopped = true;
        observer.disconnect();
        window.removeEventListener('pagehide', stop);
        for (const layer of document.querySelectorAll(marker)) layer.remove();
        window[key].stopped = true;
    };
    const api = { stop, stopped: false };
    window[key] = api;
    window.addEventListener('pagehide', stop, { once: true });
    return api;
}
