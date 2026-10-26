const TOGGLE_API_KEY = '__atomsThemeToggleV1';
const STATE_KEY = '__atomsVanillaGeometryV1';
const TOGGLE_EVENT = 'atoms-theme-toggle';

const SPECS = [
    {
        // Store's main capsule is responsive in vanilla Steam. The legacy shim
        // pins it to fixed pixels, which breaks the primary carousel.
        selector: [
            '#home_maincap_v7 .store_capsule > .capsule.main_capsule',
            '#home_maincap_v7 .store_main_capsule .capsule.main_capsule',
            '.store_main_capsule > .capsule.main_capsule'
        ].join(', '),
        properties: ['width', 'height', 'padding-top', 'margin-right', 'flex-shrink']
    },
    {
        // Keep the discovery-queue button's native placement and dimensions.
        selector: '.btn_next_in_queue',
        properties: [
            'width', 'height',
            'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            'padding-top', 'padding-right', 'padding-bottom', 'padding-left'
        ]
    },
    {
        selector: '.btn_next_in_queue .next_in_queue_content',
        properties: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']
    },
    {
        // The Free Demos capsule is a modern Store carousel, not the legacy
        // main capsule. Snapshot its native card dimensions independently so
        // none of the old carousel sizing leaks into it.
        selector: '.f8yx9l20TjHQcxhdbRlpy > ._1_nZSkaKcUeXxQpXV5ulcm.Panel.Focusable',
        properties: [
            'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
            'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'flex-basis', 'flex-grow', 'flex-shrink', 'aspect-ratio', 'overflow'
        ]
    },
    {
        selector: 'img._8JfsVa2qql_sG4yZvL31M',
        properties: [
            'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
            'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            'object-fit', 'object-position', 'aspect-ratio', 'flex-shrink'
        ]
    }
];

function isAtomsStylesheet(link) {
    if (!link || link.tagName !== 'LINK' || !link.rel.split(/\s+/).includes('stylesheet')) return false;
    return /(?:millennium\.host\/v1\/)?themes\/ATOMS(?:\/|$)/i.test(String(link.href || link.getAttribute('href') || ''));
}

function themeLinks() {
    return Array.from(document.querySelectorAll('link[rel~="stylesheet"]')).filter(isAtomsStylesheet);
}

function themeIsDisabled() {
    const api = window[TOGGLE_API_KEY];
    if (api && typeof api.isDisabled === 'function') return api.isDisabled();
    try {
        return sessionStorage.getItem('atoms-theme-disabled-v1') === '1';
    } catch (_) {
        return false;
    }
}

function restoreInline(entry) {
    for (const [property, prior] of entry.originals) {
        if (prior.value) entry.element.style.setProperty(property, prior.value, prior.priority);
        else entry.element.style.removeProperty(property);
    }
}

function captureEntries() {
    const byElement = new Map();
    for (const spec of SPECS) {
        for (const element of document.querySelectorAll(spec.selector)) {
            if (!byElement.has(element)) byElement.set(element, new Set());
            for (const property of spec.properties) byElement.get(element).add(property);
        }
    }
    return Array.from(byElement, ([element, properties]) => ({ element, properties: Array.from(properties) }));
}

export default function restoreVanillaGeometry() {
    const existing = window[STATE_KEY];
    if (existing && typeof existing.install === 'function') {
        existing.install();
        return existing;
    }

    const state = {
        entries: new Set(),
        timer: null,
        queuedForce: false,
        observer: null,
        maincapHeights: new Map(),
        saleOffsets: new Map(),
        saleObserved: new Set(),
        saleResizeObserver: null,
        installed: false
    };

    const heightProperty = '--atoms-maincap-art-height';
    const restoreHeight = (element, prior) => {
        if (prior.value) element.style.setProperty(heightProperty, prior.value, prior.priority);
        else element.style.removeProperty(heightProperty);
    };
    const measureMaincapArt = () => {
        const current = new Set();
        for (const container of document.querySelectorAll('#home_maincap_v7 .carousel_container')) {
            const items = container.querySelector('.carousel_items');
            const height = items?.getBoundingClientRect().height;
            if (!Number.isFinite(height) || height <= 0) continue;
            current.add(container);
            if (!state.maincapHeights.has(container)) state.maincapHeights.set(container, {
                value: container.style.getPropertyValue(heightProperty),
                priority: container.style.getPropertyPriority(heightProperty)
            });
            // Pagination is a separate sibling. Measure the artwork owner so
            // responsive heights do not depend on a fixed pagination offset.
            container.style.setProperty(heightProperty, `${height}px`);
        }
        for (const [element, prior] of state.maincapHeights) {
            if (!current.has(element)) {
                restoreHeight(element, prior);
                state.maincapHeights.delete(element);
            }
        }
    };

    const saleProperty = '--atoms-sale-badge-bottom';
    const restoreSaleOffset = (card, prior) => {
        if (prior.value) card.style.setProperty(saleProperty, prior.value, prior.priority);
        else card.style.removeProperty(saleProperty);
    };
    const measureSaleBadges = () => {
        const current = new Set(), observed = new Set();
        for (const card of document.querySelectorAll('._1gsW0WuP7ZclL1_ScZlsvo')) {
            const sale = card.querySelector('.znNVIhFP6KdJlUS2p2B7q');
            const flag = card.querySelector(':scope > ._3dtnlw7cvJhAMGafZPipGv._3Rgc5idc13zGnjAaIpVNAR');
            if (!sale || !flag || sale.closest('._1gsW0WuP7ZclL1_ScZlsvo') !== card) continue;
            observed.add(card); observed.add(sale);
            const bounds = card.getBoundingClientRect(), badge = sale.getBoundingClientRect();
            const scale = card.offsetHeight > 0 ? bounds.height / card.offsetHeight : 1;
            const bottom = (badge.bottom - bounds.top) / scale - (card.clientTop || 0);
            if (!Number.isFinite(bottom) || bottom < 0 || badge.width <= 0 || badge.height <= 0) continue;
            current.add(card);
            if (!state.saleOffsets.has(card)) state.saleOffsets.set(card, {
                value: card.style.getPropertyValue(saleProperty),
                priority: card.style.getPropertyPriority(saleProperty)
            });
            const value = `${bottom}px`;
            if (card.style.getPropertyValue(saleProperty) !== value) card.style.setProperty(saleProperty, value);
        }
        for (const [card, prior] of state.saleOffsets) if (!current.has(card)) {
            restoreSaleOffset(card, prior); state.saleOffsets.delete(card);
        }
        if (state.saleResizeObserver) {
            for (const target of state.saleObserved) if (!observed.has(target)) state.saleResizeObserver.unobserve(target);
            for (const target of observed) if (!state.saleObserved.has(target)) state.saleResizeObserver.observe(target);
            state.saleObserved = observed;
        }
    };

    const clear = () => {
        for (const entry of state.entries) restoreInline(entry);
        state.entries.clear();
        for (const [element, prior] of state.maincapHeights) restoreHeight(element, prior);
        state.maincapHeights.clear();
        for (const [card, prior] of state.saleOffsets) restoreSaleOffset(card, prior);
        state.saleOffsets.clear();
        state.saleResizeObserver?.disconnect(); state.saleObserved.clear();
    };

    const refresh = (force = false) => {
        if (themeIsDisabled()) {
            clear();
            return;
        }

        const candidates = captureEntries();
        const known = new Set(Array.from(state.entries, (entry) => entry.element));
        const current = new Set(candidates.map((entry) => entry.element));
        const changed = force || candidates.length !== state.entries.size || candidates.some((entry) => !known.has(entry.element));
        if (!changed) { measureMaincapArt(); measureSaleBadges(); return; }

        // Remove our inline snapshots before reading native values, then toggle
        // only ATOMS links for this synchronous style read. The browser cannot
        // paint in the middle of this JS task, so this does not flash the page.
        clear();
        const links = themeLinks();
        if (!links.length) return;
        const linkStates = links.map((link) => [link, link.disabled]);
        for (const [link] of linkStates) link.disabled = true;

        const nativeValues = candidates.map((entry) => {
            const style = getComputedStyle(entry.element);
            return {
                ...entry,
                values: entry.properties.map((property) => [property, style.getPropertyValue(property)])
            };
        });

        for (const [link, disabled] of linkStates) link.disabled = disabled;

        for (const entry of nativeValues) {
            const originals = new Map(entry.properties.map((property) => [property, {
                value: entry.element.style.getPropertyValue(property),
                priority: entry.element.style.getPropertyPriority(property)
            }]));
            for (const [property, value] of entry.values) entry.element.style.setProperty(property, value, 'important');
            state.entries.add({ element: entry.element, originals });
        }

        // A detached target can disappear while Steam swaps page fragments.
        for (const entry of Array.from(state.entries)) {
            if (!entry.element.isConnected || !current.has(entry.element)) {
                restoreInline(entry);
                state.entries.delete(entry);
            }
        }
        measureMaincapArt();
        measureSaleBadges();
    };

    const schedule = (force = false) => {
        state.queuedForce ||= force;
        if (state.timer) return;
        state.timer = setTimeout(() => {
            const nextForce = state.queuedForce;
            state.timer = null;
            state.queuedForce = false;
            refresh(nextForce);
        }, 120);
    };

    const onToggle = (event) => {
        if (event.detail && event.detail.disabled) clear();
        else schedule(true);
    };

    const install = () => {
        if (state.installed) {
            schedule();
            return;
        }
        state.installed = true;
        window.addEventListener(TOGGLE_EVENT, onToggle);
        window.addEventListener('resize', () => schedule(true));
        state.observer = new MutationObserver(() => schedule());
        if (typeof ResizeObserver === 'function') state.saleResizeObserver = new ResizeObserver(() => schedule());
        if (document.documentElement) state.observer.observe(document.documentElement, { childList: true, subtree: true });
        schedule(true);
    };

    const api = { version: 2, install, refresh: () => refresh(true), clear };
    window[STATE_KEY] = api;
    install();
    return api;
}
