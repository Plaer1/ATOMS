import { installDebugPalette } from './debugPalette.js';
import { syncDebugLayer } from './debugLayer.js';

const TOGGLE_KEY = 'atoms-theme-disabled-v1';
const HOST_ID = 'atoms-theme-toggle-host';
const API_KEY = '__atomsThemeToggleV1';
const PREFERENCE_KEY = '__atomsThemeToggleButtonEnabledV1';

function isAtomsStylesheet(link) {
    if (!link || link.tagName !== 'LINK' || !link.rel.split(/\s+/).includes('stylesheet')) {
        return false;
    }

    const href = String(link.href || link.getAttribute('href') || '');
    return /(?:millennium\.host\/v1\/)?themes\/ATOMS(?:\/|$)/i.test(href);
}

function readDisabled() {
    try {
        return sessionStorage.getItem(TOGGLE_KEY) === '1';
    } catch (_) {
        return false;
    }
}

function saveDisabled(disabled) {
    try {
        sessionStorage.setItem(TOGGLE_KEY, disabled ? '1' : '0');
    } catch (_) {
        // Some transient Steam documents deliberately do not expose storage.
    }
}

function makeToggleButton(onToggle) {
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('aria-live', 'polite');
    host.style.setProperty('position', 'fixed', 'important');
    host.style.setProperty('right', '16px', 'important');
    host.style.setProperty('bottom', '16px', 'important');
    host.style.setProperty('z-index', '2147483647', 'important');
    host.style.setProperty('display', 'block', 'important');
    host.style.setProperty('pointer-events', 'auto', 'important');

    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
        <style>
            :host { all: initial; color-scheme: var(--atoms-debug-scheme); }
            :host::backdrop { background: transparent; pointer-events: none; }
            button {
                all: unset;
                box-sizing: border-box;
                min-width: 82px;
                padding: 8px 10px;
                border: 1px solid var(--atoms-debug-border);
                border-radius: 7px;
                color: var(--atoms-debug-text);
                background: var(--atoms-debug-surface);
                box-shadow: none;
                font: 600 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                letter-spacing: .035em;
                text-align: center;
                cursor: pointer;
                user-select: none;
            }
            button:hover { background: var(--atoms-debug-hover); color: var(--atoms-debug-heading); }
            button:focus-visible { outline: 2px solid var(--atoms-debug-accent); outline-offset: 2px; }
            button[data-disabled="false"]::before { content: "● "; color: var(--atoms-debug-accent); }
            button[data-disabled="true"]::before { content: "○ "; color: var(--atoms-debug-muted); }
            button[data-enabled="true"]::before { content: "● "; color: var(--atoms-debug-accent); }
            button[data-enabled="false"]::before { content: "○ "; color: var(--atoms-debug-muted); }
            button:disabled { color: var(--atoms-debug-muted); cursor: default; }
            button[data-error="true"] { border-color: var(--atoms-debug-error); }
            .annotator-controls { display: inline-flex; margin-left: 8px; }
            #atoms-annotator-toggle { border-radius: 7px 0 0 7px; }
            #atoms-annotator-menu { min-width: 28px; padding: 8px; border-left: 0; border-radius: 0 7px 7px 0; }
        </style>
        <button type="button" title="Toggle all ATOMS styles in this page"></button>
    `;

    const button = root.querySelector('button');
    button.addEventListener('click', onToggle);
    const annotatorButton = document.createElement('button');
    annotatorButton.id = 'atoms-annotator-toggle';
    annotatorButton.type = 'button';
    annotatorButton.addEventListener('click', () => {
        const control = window.__atomsAnnotationControlV1;
        if (control?.available && !control.pending) control.setEnabled(!control.enabled);
    });
    const group = document.createElement('span');
    group.className = 'annotator-controls';
    group.appendChild(annotatorButton);
    const menuButton = document.createElement('button');
    menuButton.id = 'atoms-annotator-menu';
    menuButton.type = 'button';
    menuButton.textContent = '☰';
    menuButton.setAttribute('aria-label', 'Annotation options');
    menuButton.setAttribute('aria-haspopup', 'menu');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.addEventListener('click', event => {
        event?.stopPropagation?.();
        window.__atomsAnnotationNoteManagerV1?.toggleMenu(menuButton);
    });
    group.appendChild(menuButton);
    root.appendChild(group);
    return { host, button };
}

export function installThemeToggle(options = {}) {
    const existing = window[API_KEY];
    const hasPreference = Object.prototype.hasOwnProperty.call(options, 'showButton');
    if (existing?.version === 7) {
        if (hasPreference) existing.setButtonEnabled(options.showButton);
        existing.install();
        return existing;
    }

    // Upgrade the old unconditional button, including the capture fallback.
    const inheritedPreference = window[PREFERENCE_KEY] === true;
    existing?.setDisabled?.(false);
    existing?.stop?.();
    document.getElementById(HOST_ID)?.remove();

    const originalDisabled = new WeakMap();
    let showButton = hasPreference ? Boolean(options.showButton) : inheritedPreference;
    window[PREFERENCE_KEY] = showButton;
    let disabled = showButton && readDisabled();
    if (!showButton) saveDisabled(false);
    let button = null;
    let buttonHost = null;
    let observer = null;
    let releasePalette = null;
    let modalHint = null;

    const syncLayer = ({ promote = false } = {}) => {
        const host = document.getElementById(HOST_ID);
        if (showButton && host) syncDebugLayer(host, { promote, modal: modalHint });
    };
    const onTopLayerChange = event => {
        const path = event.composedPath?.() || [event.target];
        if (path.some(node => ['atoms-annotation-note-manager-host', 'atoms-visual-audit-host'].includes(node?.id))) return;
        const target = path[0];
        if (!target || target.id === HOST_ID || !target.matches?.('dialog, [popover]')) return;
        if (target.matches(':modal')) modalHint = target;
        else if (modalHint === target) modalHint = null;
        syncLayer({ promote: true });
    };
    const onVisible = () => syncLayer();
    const onFullscreen = () => syncLayer({ promote: true });

    const themeLinks = () => Array.from(document.querySelectorAll('link[rel~="stylesheet"]'))
        .filter(isAtomsStylesheet);

    // A few visual effects (for example a grayscale page backdrop) need a
    // small runtime stylesheet. Marked effects participate in the same
    // side-by-side switch as regular ATOMS links.
    const visualEffectStyles = () => Array.from(document.querySelectorAll('style[data-atoms-visual-effect]'));

    const updateButton = () => {
        if (!button) return;
        button.dataset.disabled = String(disabled);
        button.textContent = disabled ? 'ATOMS OFF' : 'ATOMS ON';
        button.title = disabled
            ? 'Turn ATOMS styles back on in this page'
            : 'Turn ATOMS styles off in this page';
        button.setAttribute('aria-pressed', String(!disabled));
    };

    const updateAnnotatorButton = () => {
        const control = window.__atomsAnnotationControlV1;
        const element = document.getElementById(HOST_ID)?.shadowRoot?.querySelector('#atoms-annotator-toggle');
        if (!element) return;
        element.textContent = control?.pending ? 'ANNOTATOR…' : control?.enabled ? 'ANNOTATOR ON' : 'ANNOTATOR OFF';
        element.disabled = !control?.available || Boolean(control.pending);
        element.setAttribute('aria-pressed', String(Boolean(control?.enabled)));
        element.dataset.enabled = String(Boolean(control?.enabled));
        element.dataset.error = String(Boolean(control?.error));
        const menu = document.getElementById(HOST_ID)?.shadowRoot?.querySelector('#atoms-annotator-menu');
        if (menu) {
            menu.disabled = !control?.available || !control?.requestNotes || !window.__atomsAnnotationNoteManagerV1;
            menu.title = menu.disabled ? 'Start the annotation controller to manage notes' : 'Annotation options';
        }
        element.title = control?.error || (!control?.available
            ? 'Start tools/steam-annotation-controller.js to enable the global annotation switch'
            : control.enabled ? 'Stop annotating in every Steam window' : 'Start annotating in every Steam window');
    };

    const apply = () => {
        for (const stylesheet of [...themeLinks(), ...visualEffectStyles()]) {
            if (disabled) {
                if (!originalDisabled.has(stylesheet)) {
                    originalDisabled.set(stylesheet, stylesheet.disabled);
                }
                stylesheet.disabled = true;
            } else if (originalDisabled.has(stylesheet)) {
                stylesheet.disabled = originalDisabled.get(stylesheet);
            }
        }
        updateButton();
    };

    const setDisabled = (nextDisabled) => {
        disabled = Boolean(nextDisabled);
        saveDisabled(disabled);
        apply();
        window.dispatchEvent(new CustomEvent('atoms-theme-toggle', { detail: { disabled } }));
        return disabled;
    };

    const ensureButton = () => {
        // Store replaces body contents during navigation. Mount at the document
        // root so the comparison control survives those renders.
        const mount = document.documentElement;
        if (mount?.classList.contains('useBrowserViewContextMenu') && mount.classList.contains('MillenniumWindow_ContextMenu')) {
            releasePalette?.(); releasePalette = null;
            document.getElementById(HOST_ID)?.remove();
            button = null; buttonHost = null;
            return;
        }
        if (!mount || !showButton || document.title === 'SharedJSContext' || /^atoms_annotation(?:_manager)?_uid\d+$/.test(window.name || '')) return;
        let host = document.getElementById(HOST_ID) || buttonHost;
        let mounted = false;
        if (!host) {
            const controls = makeToggleButton(() => setDisabled(!disabled));
            host = controls.host;
            buttonHost = host;
            button = controls.button;
            mount.appendChild(host);
            releasePalette = installDebugPalette()?.apply(host) || null;
            mounted = true;
        } else {
            if (!host.isConnected) {
                mount.appendChild(host);
                mounted = true;
            }
            button = host.shadowRoot && host.shadowRoot.querySelector('button');
        }
        updateButton();
        updateAnnotatorButton();
        syncLayer();
        // The controller may connect before Millennium creates this host.
        // Notify it after mounting so it can attach the palette shortcut.
        if (mounted) window.dispatchEvent(new CustomEvent('atoms-debug-menu', { detail: { enabled: true } }));
    };

    const install = () => {
        window.removeEventListener('atoms-annotator-state', updateAnnotatorButton);
        window.removeEventListener('atoms-debug-state', updateAnnotatorButton);
        document.removeEventListener?.('toggle', onTopLayerChange, true);
        document.removeEventListener?.('close', onTopLayerChange, true);
        document.removeEventListener?.('visibilitychange', onVisible);
        document.removeEventListener?.('fullscreenchange', onFullscreen);
        window.removeEventListener('pageshow', onVisible);
        if (showButton) {
            window.addEventListener('atoms-annotator-state', updateAnnotatorButton);
            window.addEventListener('atoms-debug-state', updateAnnotatorButton);
            document.addEventListener?.('toggle', onTopLayerChange, true);
            document.addEventListener?.('close', onTopLayerChange, true);
            document.addEventListener?.('visibilitychange', onVisible);
            document.addEventListener?.('fullscreenchange', onFullscreen);
            window.addEventListener('pageshow', onVisible);
        }
        ensureButton();
        apply();

        if (showButton && !observer && document.documentElement) {
            observer = new MutationObserver((mutations) => {
                let needsSync = false;
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes || []) {
                        if (node.nodeType === Node.ELEMENT_NODE && (
                            isAtomsStylesheet(node) ||
                            node.matches?.('style[data-atoms-visual-effect]') ||
                            (typeof node.querySelector === 'function' && node.querySelector('link[rel~="stylesheet"], style[data-atoms-visual-effect]'))
                        )) {
                            needsSync = true;
                            break;
                        }
                    }
                    if (needsSync) break;
                }
                if (needsSync) apply();
                if (!document.getElementById(HOST_ID)) ensureButton();
                else if (mutations.some(m => m.type === 'attributes' || [...m.addedNodes || [], ...m.removedNodes || []].some(n => n.tagName === 'DIALOG' || n.querySelector?.('dialog')))) syncLayer({ promote: true });
            });
            observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
        }
    };

    const setButtonEnabled = (enabled) => {
        showButton = Boolean(enabled);
        window[PREFERENCE_KEY] = showButton;
        if (!showButton) {
            setDisabled(false);
            observer?.disconnect();
            observer = null;
            releasePalette?.(); releasePalette = null;
            document.getElementById(HOST_ID)?.remove();
            button = null;
            buttonHost = null;
        } else {
            install();
        }
        if (!showButton) {
            window.removeEventListener('atoms-annotator-state', updateAnnotatorButton);
            window.removeEventListener('atoms-debug-state', updateAnnotatorButton);
            document.removeEventListener?.('toggle', onTopLayerChange, true);
            document.removeEventListener?.('close', onTopLayerChange, true);
            document.removeEventListener?.('visibilitychange', onVisible);
            document.removeEventListener?.('fullscreenchange', onFullscreen);
            window.removeEventListener('pageshow', onVisible);
        }
        window.dispatchEvent(new CustomEvent('atoms-debug-menu', { detail: { enabled: showButton } }));
        return showButton;
    };

    const api = {
        version: 7,
        install,
        isDisabled: () => disabled,
        isButtonEnabled: () => showButton,
        setButtonEnabled,
        setDisabled,
        sync: apply,
        syncLayer,
        stop: () => {
            setButtonEnabled(false);
            observer?.disconnect();
            observer = null;
        }
    };

    window[API_KEY] = api;
    install();
    return api;
}
