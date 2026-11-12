// ATOMS native floating window helper. Steam popups are independent documents,
// so each owner must supply its own entry module and the palette values to copy.
export const FLAGS = Object.freeze({
    Hidden: 1 << 1,
    NoTaskbarIcon: 1 << 3,
    Resizable: 1 << 4,
    ApplyBrowserScaleToDimensions: 1 << 12,
    AlwaysOnTop: 1 << 13,
    NoWindowShadow: 1 << 14,
});

export const FLOATING = FLAGS.Hidden | FLAGS.NoTaskbarIcon |
    FLAGS.ApplyBrowserScaleToDimensions | FLAGS.AlwaysOnTop | FLAGS.NoWindowShadow;

export function untether({ name, title, rect, module, entry, hand, palette = {}, flags = FLOATING } = {}) {
    const shared = window.opener || window;
    let popup = null;
    try {
        popup = shared.g_PopupManager?.constructor?.CreatePopup(name, {
            title,
            dimensions: {
                width: Math.round(rect.width), height: Math.round(rect.height),
                left: Math.round(rect.left), top: Math.round(rect.top),
            },
            eCreationFlags: flags,
        })?.popup || null;
    } catch (error) {
        console.error('[ATOMS annotation window]', name, error);
    }
    if (!popup) return null;

    popup.__atomsAnnotationOwner = hand;
    const doc = popup.document;
    doc.title = title;
    const vars = Object.entries(palette).filter(([key, value]) =>
        /^--[\w-]+$/.test(key) && typeof value === 'string' && value.length < 512)
        .map(([key, value]) => `${key}:${value};`).join('');
    const style = doc.createElement('style');
    style.textContent = `:root{${vars};color-scheme:${palette['--atoms-color-scheme'] || 'dark'}}html,body{margin:0;overflow:hidden;background:rgb(var(--backgroundDarkish, 28,28,28));color:rgb(var(--textLightest, 234,234,234))}`;
    doc.head.append(style);
    const script = doc.createElement('script');
    script.type = 'module';
    script.textContent = `import(${JSON.stringify(module)}).then(m=>m[${JSON.stringify(entry)}]());`;
    doc.head.append(script);
    return popup;
}

export const windowRect = async (win = window) => {
    try { return await win.SteamClient.Window.GetWindowDimensions(); }
    catch (_) { return null; }
};

export async function mouseAt(win = window) {
    try {
        const text = String(await win.SteamClient.Window.GetMousePositionDetails());
        const x = Number(/x=([-\d.]+)/.exec(text)?.[1]);
        const y = Number(/y=([-\d.]+)/.exec(text)?.[1]);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    } catch (_) { return null; }
}

export function moveSelf(left, top, win = window) {
    return win.SteamClient?.Window?.MoveTo?.(Math.round(left), Math.round(top), win.devicePixelRatio || 1);
}
