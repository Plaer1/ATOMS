const BASE_ACCENT_RGB = [35, 133, 189];
const BASE_YOUTUBE_RED_RGB = [255, 0, 51];
const SYSTEM_ACCENT_VARIABLES = {
    accent: ["--SystemAccentColorAccent-RGB", "--SystemAccentColor-RGB"],
    accentLightish: ["--SystemAccentColorAccentLight1-RGB", "--SystemAccentColorLight1-RGB"],
    accentLight: ["--SystemAccentColorAccentLight2-RGB", "--SystemAccentColorLight2-RGB"],
    accentLightest: ["--SystemAccentColorAccentLight3-RGB", "--SystemAccentColorLight3-RGB"],
    accentDarkish: ["--SystemAccentColorAccentDark1-RGB", "--SystemAccentColorDark1-RGB"],
    accentDark: ["--SystemAccentColorAccentDark2-RGB", "--SystemAccentColorDark2-RGB"],
    accentDarkest: ["--SystemAccentColorAccentDark3-RGB", "--SystemAccentColorDark3-RGB"],
};

function applyAccentReferences() {
    const rootStyle = document.documentElement.style;

    rootStyle.setProperty("--accent", buildCssVarReference(SYSTEM_ACCENT_VARIABLES.accent));
    rootStyle.setProperty("--accentLightish", buildCssVarReference(SYSTEM_ACCENT_VARIABLES.accentLightish));
    rootStyle.setProperty("--accentLight", buildCssVarReference(SYSTEM_ACCENT_VARIABLES.accentLight));
    rootStyle.setProperty("--accentLightest", buildCssVarReference(SYSTEM_ACCENT_VARIABLES.accentLightest));
    rootStyle.setProperty("--accentDarkish", buildCssVarReference(SYSTEM_ACCENT_VARIABLES.accentDarkish));
    rootStyle.setProperty("--accentDark", buildCssVarReference(SYSTEM_ACCENT_VARIABLES.accentDark));
    rootStyle.setProperty("--accentDarkest", buildCssVarReference(SYSTEM_ACCENT_VARIABLES.accentDarkest));
    rootStyle.setProperty("--textLightish", buildCssVarReference(SYSTEM_ACCENT_VARIABLES.accentLight));
    rootStyle.setProperty("--textLight", buildCssVarReference(SYSTEM_ACCENT_VARIABLES.accentLightest));
    rootStyle.setProperty("--textLightest", buildCssVarReference(SYSTEM_ACCENT_VARIABLES.accentLightest));
    rootStyle.setProperty("--textDarkish", buildCssVarReference(SYSTEM_ACCENT_VARIABLES.accentDarkish));
    rootStyle.setProperty("--textDark", buildCssVarReference(SYSTEM_ACCENT_VARIABLES.accentDark));
}

function buildCssVarReference(propertyNames) {
    return propertyNames.reduceRight((fallbackReference, propertyName) => {
        if (!fallbackReference) {
            return `var(${propertyName})`;
        }

        return `var(${propertyName}, ${fallbackReference})`;
    }, "");
}

function readCssCustomProperty(propertyNames) {
    const computedStyle = getComputedStyle(document.documentElement);

    for (const propertyName of propertyNames) {
        const value = computedStyle.getPropertyValue(propertyName).trim();
        if (value) {
            return {
                propertyName,
                value,
            };
        }
    }

    return null;
}

function readSystemAccentRgb() {
    const accentProperty = readCssCustomProperty(SYSTEM_ACCENT_VARIABLES.accent);
    if (!accentProperty) {
        return null;
    }

    const cssVar = accentProperty.value;

    const matches = cssVar.match(/\d+/g);
    if (!matches || matches.length < 3) {
        return null;
    }

    const values = matches.slice(0, 3).map(Number);
    if (values.some((value) => Number.isNaN(value))) {
        return null;
    }

    return {
        raw: values.join(","),
        values,
    };
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }

        h /= 6;
    }

    return [h * 360, s, l];
}

function applyAccentFilter(rgbValues) {
    const [targetHue] = rgbToHsl(...BASE_ACCENT_RGB);
    const [currentHue] = rgbToHsl(...rgbValues);
    let hueRotate = currentHue - targetHue;

    if (hueRotate < 0) {
        hueRotate += 360;
    }

    document.documentElement.style.setProperty("--accentFilter", `hue-rotate(${hueRotate}deg)`);
}

function applyYouTubeRedFilter(rgbValues) {
    const [sourceHue] = rgbToHsl(...BASE_YOUTUBE_RED_RGB);
    const [targetHue] = rgbToHsl(...rgbValues);
    let hueRotate = targetHue - sourceHue;

    if (hueRotate < 0) {
        hueRotate += 360;
    }

    document.documentElement.style.setProperty("--youtubeRedFilter", `hue-rotate(${hueRotate}deg)`);
}

function applySystemAccentColors() {
    const accentData = readSystemAccentRgb();
    if (!accentData) {
        // Some macOS/Linux builds expose no Millennium system-color vars.
        // Keep the configured palette instead of replacing it with invalid vars.
        return;
    }

    applyAccentReferences();
    applyAccentFilter(accentData.values);
    applyYouTubeRedFilter(accentData.values);
}

applySystemAccentColors();

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applySystemAccentColors, { once: true });
}

window.addEventListener("load", applySystemAccentColors);
window.addEventListener("pageshow", applySystemAccentColors);
