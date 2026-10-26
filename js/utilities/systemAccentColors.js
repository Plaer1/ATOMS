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
    const reference = name => buildCssVarReference(SYSTEM_ACCENT_VARIABLES[name]);
    for (const name of Object.keys(SYSTEM_ACCENT_VARIABLES)) {
        const suffix = name.slice('accent'.length);
        rootStyle.setProperty(`--${name}`, reference(name));
        rootStyle.setProperty(`--accentLightMode${suffix}`, reference(name));
    }

    // Transparent fills must follow the same optional system accent as their
    // opaque partners, in both palettes. Values remain RGBA channel lists.
    const transparent = {
        Transparent: ['accent', .498],
        LightTransparentest: ['accent', .173],
        LessTransparent: ['accent', .765],
        MoreTransparent: ['accentLightest', .216],
        DarkTransparent: ['accentDark', 1],
        DarkerTransparent: ['accentDarkish', .816],
    };
    for (const [suffix, [shade, alpha]] of Object.entries(transparent)) {
        const value = `${reference(shade)}, ${alpha}`;
        rootStyle.setProperty(`--accent${suffix}`, value);
        rootStyle.setProperty(`--accentLightMode${suffix}`, value);
    }
    for (const [role, shade] of Object.entries({
        textLightish: 'accentLight', textLight: 'accentLightest', textLightest: 'accentLightest',
        textDarkish: 'accentDarkish', textDark: 'accentDark',
    })) rootStyle.setProperty(`--${role}`, reference(shade));
}

function buildCssVarReference(propertyNames) {
    // Some platforms expose the base color without the light/dark variants.
    // Keep every reference valid in that case instead of losing the declaration.
    const fallback = SYSTEM_ACCENT_VARIABLES.accent.filter(name => !propertyNames.includes(name));
    return [...propertyNames, ...fallback].reduceRight((reference, name) =>
        reference ? `var(${name}, ${reference})` : `var(${name})`, '');
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
