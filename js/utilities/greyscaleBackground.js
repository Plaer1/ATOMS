import waitForElement from "./waitForElement.js";

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
    const m = urlFn.match(/^url\((.*)\)$/i);
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
function applyViewportBackdrop(bgImage, opts = {}) {
    const { position = "center top", size = "cover", repeat = "no-repeat" } = opts;

    console.log("[grayscale][applyViewport] img:", bgImage, "opts:", opts);

    const style = document.createElement("style");
    style.setAttribute("data-grayscale-bg", "body-viewport");

    style.innerHTML = `
        body::before {
            content: "";
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: 0;

            background-image: ${bgImage} !important;
            background-position: ${position};
            background-size: ${size};
            background-repeat: ${repeat};

            filter: grayscale(100%) brightness(0.77);
            will-change: filter, transform;
        }
        body > * { position: relative; z-index: 1; }
        body { position: static; background: transparent !important; }
        html, body { min-height: 100%; }
    `;
    document.head.appendChild(style);
    console.log("[grayscale][applyViewport] style appended");
    return true;
}

// Element-scoped applier (used by other routes)
function applyGrayscaleBackgroundToEl(el, selectorHint = "<el>", opts = {}) {
    const { forceNoRepeat = false, forceCenterX = false } = opts;
    console.log("[grayscale][applyEl] start for:", selectorHint, "el:", el, "opts:", opts);

    if (!el || !el.isConnected) {
        console.warn("[grayscale][applyEl] element missing or stale");
        return false;
    }

    const cs = getComputedStyle(el);
    console.log("[grayscale][applyEl] computed style acquired");

    const bgImage = extractBackgroundImage(el);
    if (!bgImage) {
        console.warn("[grayscale][applyEl] no valid bg for:", selectorHint);
        return false;
    }
    console.log("[grayscale][applyEl] bgImage:", bgImage);

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

    const prevPos = el.style.position || "";
    if (!prevPos) {
        el.style.position = "relative";
        console.log("[grayscale][applyEl] set el.style.position=relative");
    }

    const style = document.createElement("style");
    const anchorId = `grayscale-${Math.random().toString(36).slice(2, 9)}`;
    el.setAttribute("data-grayscale-anchor", anchorId);

    style.setAttribute("data-grayscale-bg", selectorHint);
    style.innerHTML = `
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

            filter: grayscale(100%) brightness(0.77);
            will-change: filter, transform;
        }
        [data-grayscale-anchor="${anchorId}"] > * { position: relative; z-index: 1; }
    `;
    document.head.appendChild(style);
    console.log("[grayscale][applyEl] style tag appended for anchor:", anchorId);
    return true;
}

/* ========= Cart polling (reads from cart div, paints to body, then clears original) ========= */
function pollCartForBackground({
    selector = ".FaiD8bJRAZ-HoNo0VvLOO",
    intervalMs = 33,
    maxMs = 10000,
} = {}) {
    const t0 = performance.now();
    let attempts = 0;
    let timerId = null;

    // ensure we can nuke the original background robustly
    const ensureCartBackgroundClearedRule = () => {
        if (document.querySelector("style[data-grayscale-clear-cart]")) return;
        const s = document.createElement("style");
        s.setAttribute("data-grayscale-clear-cart", "1");
        s.textContent = `
            ${selector} {
                background: none !important;
                background-image: none !important;
            }
        `;
        document.head.appendChild(s);
        console.log("[grayscale][cart][clear] CSS rule injected to force background none");
    };

    const clearOriginalBackground = (el) => {
        try {
            el.style.setProperty("background-image", "none", "important");
            el.style.setProperty("background", "none", "important");
            console.log("[grayscale][cart][clear] inline background cleared");
        } catch (e) {
            console.warn("[grayscale][cart][clear] inline clear failed:", e);
        }
        ensureCartBackgroundClearedRule();
    };

    const tick = () => {
        attempts += 1;
        const elapsed = Math.round(performance.now() - t0);

        const el = document.querySelector(selector);
        console.log(
            `[grayscale][cart][poll] attempt ${attempts}, elapsed ${elapsed}ms, node:`,
            el,
            "cssText:",
            el?.style?.cssText
        );

        if (!el) {
            if (elapsed >= maxMs) {
                console.warn("[grayscale][cart][poll] giving up; element never appeared");
                return;
            }
            timerId = setTimeout(tick, intervalMs);
            return;
        }

        const img = extractBackgroundImage(el);
        console.log("[grayscale][cart][poll] extracted img:", img);

        if (img) {
            const cs = getComputedStyle(el);
            const pos = cs.backgroundPosition || "center top";
            const size = cs.backgroundSize && cs.backgroundSize !== "auto" ? cs.backgroundSize : "cover";
            const rep = cs.backgroundRepeat || "no-repeat";
            const ok = applyViewportBackdrop(img, { position: pos, size, repeat: rep });
            console.log("[grayscale][cart][poll] applied to viewport:", ok);

            clearOriginalBackground(el);
            console.log("[grayscale][cart][poll] success; stopping");
            return;
        }

        if (elapsed >= maxMs) {
            console.warn("[grayscale][cart][poll] giving up; background not found within cap");
            return;
        }
        timerId = setTimeout(tick, intervalMs);
    };

    console.log("[grayscale][cart][poll] start:", { selector, intervalMs, maxMs });
    tick();
    return () => {
        if (timerId) clearTimeout(timerId);
    };
}

/* ========= Runner (export default) ========= */
export default function runGrayscaleScript() {
    console.log("[grayscale][run] title:", document.title, "url:", location.href);

    if (location.href.startsWith("https://steamcommunity.com")) {
        console.log("[grayscale][route] Steam Community");
        let communityApplied = false;

        waitForElement(
            ".apphub_background",
            function (el) {
                if (communityApplied) return;
                communityApplied = true;
                console.log("[grayscale][route] .apphub_background ready. el:", el);
                applyGrayscaleBackgroundToEl(el, ".apphub_background", {
                    forceNoRepeat: true,
                    forceCenterX: true,
                });
            },
            69,
            2000
        );

        setTimeout(() => {
            if (communityApplied || !document.body) return;
            console.log("[grayscale][route] community fallback to body background");
            const img = extractBackgroundImage(document.body);
            if (img) {
                communityApplied = true;
                applyViewportBackdrop(img);
            }
        }, 2000);
        return;
    }

    if (document.title === "Shopping Cart") {
        console.log("[grayscale][route] Shopping Cart");
        const CART_SEL = ".FaiD8bJRAZ-HoNo0VvLOO";
        console.log("[grayscale][route] cart selector:", CART_SEL);

        waitForElement(CART_SEL, function () {
            console.log("[grayscale][route] cart element observed; begin polling and paint to body, then clear original");
            pollCartForBackground({ selector: CART_SEL, intervalMs: 33, maxMs: 10000 });
        });
        return;
    }

    if (document.title.startsWith("Welcome to Steam") && document.body.classList.contains("seasonal_sale")) {
        console.log("[grayscale][route] Welcome to Steam + seasonal_sale");
        waitForElement("body", function (el) {
            console.log("[grayscale][route] body ready (seasonal). el:", el);
            const img = extractBackgroundImage(el);
            if (img) applyViewportBackdrop(img);
        });
        return;
    }

    if (location.href.startsWith("https://store.steampowered.com/sale/special_deals")) {
        console.log("[grayscale][route] special deals sale page");
        waitForElement("body", function (el) {
            console.log("[grayscale][route] body ready (special deals). el:", el);
            const img = extractBackgroundImage(el);
            if (img) applyViewportBackdrop(img);
        });
        return;
    }

    console.log("[grayscale][route] no matching route");
}
