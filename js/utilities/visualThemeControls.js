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
            :host { all: initial; }
            button {
                all: unset;
                box-sizing: border-box;
                min-width: 82px;
                padding: 8px 10px;
                border: 1px solid rgba(255, 255, 255, .28);
                border-radius: 7px;
                color: #f5eef7;
                background: rgba(28, 28, 31, .94);
                box-shadow: 0 4px 18px rgba(0, 0, 0, .42);
                font: 600 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                letter-spacing: .035em;
                text-align: center;
                cursor: pointer;
                user-select: none;
            }
            button:hover { background: rgba(61, 61, 68, .98); }
            button:focus-visible { outline: 2px solid #de7bff; outline-offset: 2px; }
            button[data-disabled="false"]::before { content: "● "; color: #de7bff; }
            button[data-disabled="true"]::before { content: "○ "; color: #b1b1b6; }
        </style>
        <button type="button" title="Toggle all ATOMS styles in this page"></button>
    `;

    const button = root.querySelector('button');
    button.addEventListener('click', onToggle);
    return { host, button };
}

export function installThemeToggle(options = {}) {
    const existing = window[API_KEY];
    const hasPreference = Object.prototype.hasOwnProperty.call(options, 'showButton');
    if (existing?.version === 2) {
        if (hasPreference) existing.setButtonEnabled(options.showButton);
        existing.install();
        return existing;
    }

    // Upgrade the old unconditional button, including the capture fallback.
    existing?.setDisabled?.(false);
    existing?.stop?.();
    document.getElementById(HOST_ID)?.remove();

    const originalDisabled = new WeakMap();
    let showButton = hasPreference ? Boolean(options.showButton) : window[PREFERENCE_KEY] === true;
    window[PREFERENCE_KEY] = showButton;
    let disabled = showButton && readDisabled();
    if (!showButton) saveDisabled(false);
    let button = null;
    let observer = null;

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
        if (!mount || !showButton || document.title === 'SharedJSContext') return;
        let host = document.getElementById(HOST_ID);
        if (!host) {
            const controls = makeToggleButton(() => setDisabled(!disabled));
            host = controls.host;
            button = controls.button;
            mount.appendChild(host);
        } else {
            button = host.shadowRoot && host.shadowRoot.querySelector('button');
        }
        updateButton();
    };

    const install = () => {
        ensureButton();
        apply();

        if (showButton && !observer && document.documentElement) {
            observer = new MutationObserver((mutations) => {
                let needsSync = false;
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
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
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });
        }
    };

    const setButtonEnabled = (enabled) => {
        showButton = Boolean(enabled);
        window[PREFERENCE_KEY] = showButton;
        if (!showButton) {
            setDisabled(false);
            observer?.disconnect();
            observer = null;
            document.getElementById(HOST_ID)?.remove();
            button = null;
        } else {
            install();
        }
        return showButton;
    };

    const api = {
        version: 2,
        install,
        isDisabled: () => disabled,
        isButtonEnabled: () => showButton,
        setButtonEnabled,
        setDisabled,
        sync: apply,
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
