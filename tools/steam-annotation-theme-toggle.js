'use strict';

// A capture-only owner for the normal theme control. No saved Millennium
// preference is changed; late-loading "off" entrypoints cannot hide it while
// annotations are active. Stopping restores the theme and removes the button.
function installAnnotationThemeToggle(loadControls) {
    if (/^about:srcdoc(?:[?#]|$)/i.test(location.href)) return null;
    const key = '__atomsAnnotationThemeToggleV1';
    const previous = window[key];
    if (previous && !previous.stopped) {
        previous.sync();
        return previous;
    }

    let active = true, controls = null, originalSet = null, forcedSet = null;
    let pending = null;
    const audit = window.__atomsVisualAuditV5;
    const originalStop = audit?.stop;
    let wrappedStop = null;

    const bind = candidate => {
        if (!active) return false;
        if (controls !== candidate) {
            if (controls?.setButtonEnabled === forcedSet) controls.setButtonEnabled = originalSet;
            controls = candidate;
            originalSet = controls.setButtonEnabled;
            const setter = originalSet;
            forcedSet = enabled => setter.call(candidate, active || enabled);
            controls.setButtonEnabled = forcedSet;
        }
        controls.setButtonEnabled(true);
        return true;
    };

    const sync = () => {
        if (!active) return Promise.resolve(false);
        const current = window.__atomsThemeToggleV1;
        if (current?.version === 2 && typeof current.setButtonEnabled === 'function') {
            return Promise.resolve(bind(current));
        }
        if (!pending) {
            pending = Promise.resolve()
                .then(() => loadControls ? loadControls() : import('https://millennium.host/v1/themes/ATOMS/js/utilities/visualThemeControls.js'))
                .then(module => {
                    if (!active) return false;
                    return bind(module.installThemeToggle({ showButton: true }));
                })
                .catch(error => {
                    if (active) console.warn('[ATOMS annotator] Could not show theme toggle:', error);
                    return false;
                })
                .finally(() => { pending = null; });
        }
        return pending;
    };

    const stop = () => {
        if (!active) return;
        active = false;
        api.stopped = true;
        document.removeEventListener('DOMContentLoaded', sync);
        if (controls) {
            if (controls.setButtonEnabled === forcedSet) controls.setButtonEnabled = originalSet;
            originalSet.call(controls, false);
        }
        if (audit?.stop === wrappedStop) audit.stop = originalStop;
    };

    // This also upgrades an already-running annotator without rebuilding its
    // picker or losing current selections/notes. New recorders call stop too.
    if (typeof originalStop === 'function') {
        wrappedStop = function (...args) {
            try { return originalStop.apply(this, args); }
            finally { stop(); }
        };
        audit.stop = wrappedStop;
    }

    const api = { sync, stop, isActive: () => active, stopped: false, ready: null };
    window[key] = api;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync, { once: true });
    api.ready = sync();
    return api;
}

module.exports = { installAnnotationThemeToggle };
