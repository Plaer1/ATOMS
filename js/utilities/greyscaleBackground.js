import { isProfileLanding } from './pageRoutes.js';

/* s0fjuu / 8c9hvn: these native layers contain only background artwork.
 * Keeping the image on its own layer preserves responsive sizing, masks and
 * gradients, without filtering the text or rebuilding a full-page backdrop.
 * CSS catches later React mounts; sale artwork sizing below follows its bitmap
 * so a long product list cannot push the fade past the image's lower edge.
 */
const SALE_ART = '.SaleBackground > ._2StYOVdV9beNEHqNB_UQuQ._2wlqOo3XXW1wCAxwfudaL8:empty';

export function renderedBackdropHeight(naturalWidth, naturalHeight, backgroundSize, boxWidth, boxHeight) {
    const size = backgroundSize.split(',')[0].trim();
    if (size === 'cover' || size === 'contain') {
        return naturalHeight * Math[size === 'cover' ? 'max' : 'min'](boxWidth / naturalWidth, boxHeight / naturalHeight);
    }
    const [x = 'auto', y = 'auto'] = size.split(/\s+/);
    const length = (value, basis) => value === 'auto' ? null
        : value.endsWith('%') ? parseFloat(value) * basis / 100 : parseFloat(value);
    const height = length(y, boxHeight), width = length(x, boxWidth);
    if (Number.isFinite(height)) return height;
    return Number.isFinite(width) ? width * naturalHeight / naturalWidth : naturalHeight;
}

function sizeSaleArtworkMasks() {
    const key = '__atomsSaleBackdropSizingV1';
    if (window[key]) { window[key].refresh(); return; }
    const images = new WeakMap();
    let timer;
    const refresh = () => {
        for (const element of document.querySelectorAll(SALE_ART)) {
            const computed = getComputedStyle(element);
            const source = normalizeUrlFn(computed.backgroundImage);
            if (!source) continue;
            let entry = images.get(element);
            const update = () => {
                if (!element.isConnected || images.get(element) !== entry || !entry.image.naturalWidth) return;
                const style = getComputedStyle(element);
                const height = renderedBackdropHeight(entry.image.naturalWidth, entry.image.naturalHeight,
                    style.backgroundSize, element.clientWidth, element.clientHeight);
                const value = `${height}px`;
                if (element.style.getPropertyValue('--atoms-backdrop-image-height') !== value)
                    element.style.setProperty('--atoms-backdrop-image-height', value);
            };
            if (entry?.source === source) { update(); continue; }
            entry = { source, image: new Image() };
            images.set(element, entry);
            entry.image.onload = update;
            entry.image.src = source.slice(5, -2);
        }
    };
    const observer = new MutationObserver(records => {
        if (!records.some(record => record.addedNodes.length)) return;
        clearTimeout(timer);
        timer = setTimeout(refresh, 100);
    });
    // Only sale routes have these full-page decorations. Observe their mounts,
    // not every Store page, and leave native geometry/text/media untouched.
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', refresh);
    window[key] = { refresh };
    refresh();
}

export function installApprovedStoreBackdrops() {
    if (isProfileLanding()) return;
    const style = document.querySelector('style[data-grayscale-bg="approved-store-art"]')
        || document.createElement('style');
    style.dataset.grayscaleBg = 'approved-store-art';
    style.dataset.atomsVisualEffect = 'grayscale-background';
    style.textContent = `
        .personal_calendar_ctn.v2 {
            isolation: isolate;
        }
        .personal_calendar_ctn.v2 > .personal_calendar_background:empty {
            filter: var(--calendarBackdropFilter, grayscale(1) brightness(0) invert(1)) !important;
        }
        a[href*="/personalcalendar/"] .-U8O2frQ6tI- > .-NaokOc2Odw-:empty,
        a[href*="/personalcalendar/"] ._1hrnAqRA57mMuhK3gjPSLu > ._2TQdMr4X39QLH39Z0_airS:empty,
        .SaleBackground > ._2StYOVdV9beNEHqNB_UQuQ._2wlqOo3XXW1wCAxwfudaL8:empty {
            filter: var(--storeBackdropFilter, grayscale(1) brightness(.77)) !important;
            opacity: var(--storeBackdropOpacity, 1);
            background-color: rgb(var(--background)) !important;
        }
        .SaleBackground > ._2StYOVdV9beNEHqNB_UQuQ._2wlqOo3XXW1wCAxwfudaL8:empty {
            mask-image: var(--pageBackdropMask, none);
            mask-size: 100% var(--atoms-backdrop-image-height, 100%);
            mask-position: center top;
            mask-repeat: no-repeat;
        }
    `;
    if (!style.isConnected) document.head.appendChild(style);
    window.__atomsThemeToggleV1?.sync();
    if (location.hostname === 'store.steampowered.com' && location.pathname.startsWith('/sale/')) sizeSaleArtworkMasks();
}

/* ========= Utils ========= */
function decodeHtmlEntities(str) {
    console.log("[grayscale][decodeHtmlEntities] input:", str);
    if (!str) return str;
    const out = str
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
    console.log("[grayscale][decodeHtmlEntities] output:", out);
    return out;
}

function normalizeUrlFn(urlFn) {
    if (!urlFn) return null;
    // Steam can supply `url(...), none`. Capture the image, not the trailing
    // empty/gradient layer, which would otherwise become part of its URL.
    const m = urlFn.match(/^url\(\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^)]*)\s*\)/i);
    if (!m) return null;
    let inside = m[1].trim();
    inside = inside.replace(/^['"]|['"]$/g, "");
    inside = decodeHtmlEntities(inside);
    const normalized = `url("${inside}")`;
    console.log("[grayscale][normalizeUrlFn] normalized:", normalized);
    return normalized;
}

/* ========= BG extraction ========= */
function extractBackgroundImage(el) {
    console.log("[grayscale][extract] start, el:", el);

    // 0) Raw style attribute
    const rawAttr = el.getAttribute?.("style") || "";
    console.log("[grayscale][extract] raw style attr:", rawAttr);
    if (rawAttr) {
        const decodedAttr = decodeHtmlEntities(rawAttr);
        const mDecl = decodedAttr.match(/background-image\s*:\s*([^;]+);?/i);
        console.log("[grayscale][extract] decoded attr match:", mDecl && mDecl[1]);
        if (mDecl && mDecl[1]) {
            const norm = normalizeUrlFn(mDecl[1].trim());
            if (norm) return norm;
        }
    }

    // 1) Inline style property
    console.log("[grayscale][extract] el.style.cssText:", el.style && el.style.cssText);
    let bgInline =
        el.style &&
        (el.style.backgroundImage || el.style.getPropertyValue?.("background-image"));
    console.log("[grayscale][extract] el.style.backgroundImage:", bgInline);
    if (bgInline && bgInline !== "none") {
        bgInline = decodeHtmlEntities(bgInline);
        const norm = normalizeUrlFn(bgInline);
        if (norm) return norm;
    }

    // 2) Computed style background-image
    const cs = getComputedStyle(el);
    let comp = cs.backgroundImage;
    console.log("[grayscale][extract] computed backgroundImage:", comp);
    if (comp && comp !== "none") {
        comp = decodeHtmlEntities(comp);
        const norm = normalizeUrlFn(comp);
        if (norm) return norm;
    }

    // 3) Computed shorthand background
    const shorthand = decodeHtmlEntities(cs.background || "");
    console.log("[grayscale][extract] computed shorthand background:", shorthand);
    const mUrl = shorthand.match(/url\(([^)]+)\)/i);
    if (mUrl && mUrl[0]) {
        const norm = normalizeUrlFn(mUrl[0]);
        if (norm) return norm;
    }

    console.warn("[grayscale][extract] no usable background image");
    return null;
}

/* ========= Appliers ========= */
// Element-scoped applier (used by other routes)
export function applyGrayscaleBackgroundToEl(el, selectorHint = "<el>", opts = {}) {
    const { forceNoRepeat = false, forceCenterX = false, opacityRole = "storeBackdropOpacity",
        filterRole = "storeBackdropFilter", pageArtwork = false } = opts;
    console.log("[grayscale][applyEl] start for:", selectorHint, "el:", el, "opts:", opts);

    if (!el || !el.isConnected) {
        console.warn("[grayscale][applyEl] element missing or stale");
        return false;
    }

    const cs = getComputedStyle(el);
    console.log("[grayscale][applyEl] computed style acquired");

    const previousAnchor = el.getAttribute("data-grayscale-anchor");
    const previousStyle = previousAnchor && [...document.querySelectorAll('style[data-grayscale-bg]')]
        .find(style => style.dataset.grayscaleBg === selectorHint &&
            style.textContent.includes(`[data-grayscale-anchor="${previousAnchor}"]`));
    // A previous run already removed the native image through its stylesheet.
    // Keep its source available for repeated entrypoint loads and hot updates.
    const bgImage = extractBackgroundImage(el) || previousStyle?.dataset.grayscaleSource;
    if (!bgImage) {
        console.warn("[grayscale][applyEl] no valid bg for:", selectorHint);
        return false;
    }
    console.log("[grayscale][applyEl] bgImage:", bgImage);

    if (pageArtwork) {
        // Community hubs use an empty, zero-height art node; the activity feed
        // uses a node as tall as its content. Neither is an artwork-sized box.
        // A body-owned decorative layer keeps the same composition on both,
        // with its fade measured against the bitmap rather than the feed.
        const style = previousStyle || document.createElement('style');
        const anchorId = previousAnchor || `grayscale-${Math.random().toString(36).slice(2, 9)}`;
        el.setAttribute('data-grayscale-anchor', anchorId);
        style.setAttribute('data-grayscale-bg', selectorHint);
        style.setAttribute('data-atoms-visual-effect', 'grayscale-background');
        style.dataset.grayscaleSource = bgImage;
        const render = (ratio = style.dataset.grayscaleRatio || '16 / 9') => {
            style.dataset.grayscaleRatio = ratio;
            style.textContent = `
                html [data-grayscale-anchor="${anchorId}"][data-grayscale-anchor] {
                    background-image: none !important;
                    ${el === document.body ? '' : 'background-color: transparent !important;'}
                }
                body {
                    position: relative;
                    isolation: isolate;
                    background-color: rgb(var(--background)) !important;
                }
                body::before {
                    content: "";
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: auto;
                    aspect-ratio: ${ratio};
                    pointer-events: none;
                    z-index: -1;
                    background-image: ${bgImage} !important;
                    background-position: center top;
                    background-size: 100% auto;
                    background-repeat: no-repeat;
                    filter: var(--${filterRole}, grayscale(1) brightness(.77));
                    opacity: var(--${opacityRole}, 1);
                    mask-image: var(--pageBackdropMask, none);
                }
            `;
            window.__atomsThemeToggleV1?.sync();
        };
        render();
        if (!style.isConnected) document.head.appendChild(style);
        if (!style.dataset.grayscaleLoadedSource || style.dataset.grayscaleLoadedSource !== bgImage) {
            const image = new Image();
            image.onload = () => {
                if (!style.isConnected || style.dataset.grayscaleSource !== bgImage) return;
                if (image.naturalWidth && image.naturalHeight) {
                    style.dataset.grayscaleLoadedSource = bgImage;
                    render(`${image.naturalWidth} / ${image.naturalHeight}`);
                }
            };
            image.src = bgImage.slice(5, -2);
        }
        return true;
    }

    const bgPosRaw = cs.backgroundPosition || "center top";
    let [posX, posY] = bgPosRaw.trim().split(/\s+/);
    if (!posX) posX = "center";
    if (!posY) posY = "top";
    if (forceCenterX) posX = "center";
    const bgPos = `${posX} ${posY}`;
    console.log("[grayscale][applyEl] background-position:", { bgPosRaw, posX, posY, bgPos });

    const bgSize = cs.backgroundSize || "auto";
    const bgRepeat = forceNoRepeat ? "no-repeat" : (cs.backgroundRepeat || "no-repeat");
    console.log("[grayscale][applyEl] size/repeat:", { bgSize, bgRepeat });

    if (cs.position === "static") {
        el.style.position = "relative";
        console.log("[grayscale][applyEl] set el.style.position=relative");
    }

    const style = previousStyle || document.createElement("style");
    const anchorId = previousAnchor || `grayscale-${Math.random().toString(36).slice(2, 9)}`;
    el.setAttribute("data-grayscale-anchor", anchorId);

    style.setAttribute("data-grayscale-bg", selectorHint);
    style.setAttribute("data-atoms-visual-effect", "grayscale-background");
    style.dataset.grayscaleSource = bgImage;
    style.textContent = `
        [data-grayscale-anchor="${anchorId}"] {
            background-image: none !important;
            isolation: isolate;
        }
        [data-grayscale-anchor="${anchorId}"]::before {
            content: "";
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;

            background-image: ${bgImage} !important;
            background-position: ${bgPos};
            background-size: ${bgSize};
            background-repeat: ${bgRepeat};

            filter: var(--storeBackdropFilter, grayscale(1) brightness(.77));
            opacity: var(--${opacityRole}, 1);
            will-change: filter, transform;
        }
        [data-grayscale-anchor="${anchorId}"] > * { position: relative; z-index: 1; }
    `;
    if (!style.isConnected) document.head.appendChild(style);
    window.__atomsThemeToggleV1?.sync();
    console.log("[grayscale][applyEl] style tag appended for anchor:", anchorId);
    return true;
}

/* ========= Routes ========= */
// Native patches and the WebKit entrypoint can both install this module.
// One bounded retry handles late CSS/React artwork without duplicate pollers.
export default function runGrayscaleScript() {
    if (isProfileLanding()) return;
    if (window.__atomsGrayscaleRoutesV2) return;
    const { hostname, pathname } = location;
    const community = hostname === 'steamcommunity.com';
    const store = hostname === 'store.steampowered.com';
    const upcoming = store && pathname.startsWith('/explore/upcoming');
    const cart = store && /^\/cart(?:\/|$)/.test(pathname);
    const seasonal = store && pathname === '/' && document.body.classList.contains('seasonal_sale');
    const deals = store && pathname.startsWith('/sale/special_deals');
    if (!community && !upcoming && !cart && !seasonal && !deals) return;
    window.__atomsGrayscaleRoutesV2 = true;

    const started = performance.now();
    const tryInstall = () => {
        if (isProfileLanding()) return;
        const element = community ? document.querySelector('.apphub_background')
            : upcoming ? document.querySelector('div.game_page_background.game')
            : cart ? document.querySelector('.FaiD8bJRAZ-HoNo0VvLOO')
            : document.body;
        if (element && applyGrayscaleBackgroundToEl(element,
            community ? (element === document.body ? 'community-body' : '.apphub_background')
                : upcoming ? 'div.game_page_background.game' : cart ? 'cart-art' : 'store-body',
            { pageArtwork: true, opacityRole: 'pageBackdropOpacity',
                filterRole: community ? 'communityBackdropFilter' : 'storeBackdropFilter' })) return;
        if (community && applyGrayscaleBackgroundToEl(document.body, 'community-body',
            { pageArtwork: true, opacityRole: 'pageBackdropOpacity', filterRole: 'communityBackdropFilter' })) return;
        // An apphub node can arrive before its CSS source. Retry extraction,
        // and only claim success after an image has actually been installed.
        if (performance.now() - started < 5000) setTimeout(tryInstall, 100);
    };
    tryInstall();
}
