// A manual popover escapes page stacking/clip contexts without making the page
// modal. Native dialogs also require ancestry to escape their inert backdrop.
export function syncDebugLayer(host, { promote = false, modal = null } = {}) {
    const doc = host?.ownerDocument || document;
    if (!host || !doc.documentElement) return;
    if (!modal?.isConnected || !modal.matches(':modal')) modal = [...doc.querySelectorAll('dialog:modal')].at(-1);
    const mount = modal || doc.documentElement;
    const popover = typeof host.showPopover === 'function';
    if (host.parentNode !== mount) {
        if (popover && host.matches(':popover-open')) host.hidePopover();
        mount.appendChild(host);
    }
    if (!popover) return; // Older clients retain the fixed, high-z fallback.
    host.setAttribute('popover', 'manual');
    for (const [name, value] of Object.entries({
        position: 'fixed', inset: 'auto', right: '16px', bottom: '16px',
        margin: '0', padding: '0', border: '0', background: 'transparent',
        overflow: 'visible', width: 'max-content', height: 'auto',
        'max-width': 'calc(100vw - 32px)', 'box-shadow': 'none',
    })) host.style.setProperty(name, value, 'important');
    if (promote && host.matches(':popover-open')) host.hidePopover();
    if (!host.matches(':popover-open')) {
        try { host.showPopover(); } catch { /* A hidden/detaching native window can retry when shown. */ }
    }
}
