'use strict';

// Native <dialog>.showModal() makes root-level annotation UI inert, regardless
// of z-index. Keep the same hosts/listeners inside the active dialog and put
// them in its top layer so transformed or clipped modal content cannot hide UI.
function installAnnotationModalLayer() {
    if (/^about:srcdoc(?:[?#]|$)/i.test(location.href)) return null;
    const key = '__atomsAnnotationModalLayerV1';
    if (window[key]?.version >= 2 && !window[key].stopped) { window[key].sync(); return window[key]; }
    window[key]?.stop();
    const ids = ['atoms-visual-audit-host', 'atoms-theme-toggle-host'];
    const hosts = new Map();
    let stopped = false;
    const restore = (host, original) => {
        if (host.matches(':popover-open')) host.hidePopover();
        if (original.popover === null) host.removeAttribute('popover');
        else host.setAttribute('popover', original.popover);
        host.style.cssText = original.style;
        document.documentElement.appendChild(host);
    };
    const sync = () => {
        if (stopped || !document.documentElement) return;
        const modal = [...document.querySelectorAll('dialog:modal')].at(-1);
        const controlsOwnLayer = typeof window.__atomsThemeToggleV1?.syncLayer === 'function';
        if (controlsOwnLayer) {
            for (const [host] of hosts) if (host.id === 'atoms-theme-toggle-host') hosts.delete(host);
            window.__atomsThemeToggleV1.syncLayer();
        }
        for (const id of ids) {
            if (controlsOwnLayer && id === 'atoms-theme-toggle-host') continue;
            const found = document.getElementById(id);
            if (found && !hosts.has(found)) hosts.set(found, { style: found.style.cssText, popover: found.getAttribute('popover') });
        }
        for (const [host, original] of hosts) {
            if (modal) {
                if (host.parentNode !== modal) {
                    if (host.matches(':popover-open')) host.hidePopover();
                    modal.appendChild(host);
                }
                host.setAttribute('popover', 'manual');
                for (const [name,value] of Object.entries({margin:'0',padding:'0',border:'0',background:'transparent',overflow:'visible'})) host.style.setProperty(name,value,'important');
                if (host.id === 'atoms-visual-audit-host') {
                    host.style.setProperty('width','100vw','important');
                    host.style.setProperty('height','100vh','important');
                } else {
                    host.style.setProperty('inset','auto','important');
                    host.style.setProperty('right','16px','important');
                    host.style.setProperty('bottom','16px','important');
                    host.style.setProperty('width','max-content','important');
                    host.style.setProperty('height','max-content','important');
                }
                if (!host.matches(':popover-open')) host.showPopover();
            } else if (host.parentNode !== document.documentElement || host.hasAttribute('popover')) {
                restore(host, original);
            }
        }
    };
    const relevant = node => node.nodeType === 1 && (node.tagName === 'DIALOG' || ids.includes(node.id) || node.querySelector?.('dialog'));
    const observer = new MutationObserver(mutations => {
        if (mutations.some(m => m.type === 'attributes' ? m.target.tagName === 'DIALOG' : [...m.addedNodes,...m.removedNodes].some(relevant))) sync();
    });
    if (document.documentElement) observer.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['open'] });
    const onToggle = e => { if (e.target.tagName === 'DIALOG') sync(); };
    document.addEventListener('toggle', onToggle, true);
    document.addEventListener('close', onToggle, true);
    const audit = window.__atomsVisualAuditV5;
    const originalStop = audit?.stop;
    let wrappedStop;
    const stop = () => {
        if (stopped) return;
        stopped = true; observer.disconnect();
        document.removeEventListener('toggle', onToggle, true);
        document.removeEventListener('close', onToggle, true);
        for (const [host, original] of hosts) if (host.isConnected) restore(host, original);
        if (audit && audit.stop === wrappedStop) audit.stop = originalStop;
        api.stopped = true;
    };
    if (originalStop) {
        // Restore before picker cleanup removes its hosts.
        wrappedStop = function(...args) { stop(); return originalStop.apply(this,args); };
        audit.stop = wrappedStop;
    }
    const api = { version: 2, sync, stop, stopped:false };
    window[key] = api; sync(); return api;
}
module.exports = { installAnnotationModalLayer };
