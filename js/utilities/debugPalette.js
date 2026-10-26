// Resolve palette variables in a script-free, hidden frame. The visible page
// never changes mode, and product rules are never copied into debug surfaces.
const KEY = '__atomsDebugPaletteV1';
const PREFIX = '--atoms-debug-';
const ROLES = {
    surface: 'backgroundDarkish', raised: 'background', hover: 'backgroundLightish',
    input: 'backgroundDarkest', text: 'textLight', muted: 'textLightish',
    heading: 'textLightest', accent: 'accent', 'on-accent': 'textOnAccent',
    border: 'backgroundLight', overlay: 'backgroundOverlay', error: 'textAccented',
};
const SYSTEM_NAMES = ['Accent', '', 'AccentLight1', 'Light1', 'AccentLight2', 'Light2',
    'AccentLight3', 'Light3', 'AccentDark1', 'Dark1', 'AccentDark2', 'Dark2', 'AccentDark3', 'Dark3']
    .map(shade => `--SystemAccentColor${shade}-RGB`);

// Keep only declarations which can contribute to this document's root. Keep
// selector specificity, !important, cascade layers and applicable conditions.
export function rootVariableRules(rules, root, env = window) {
    let result = '';
    for (const rule of Array.from(rules || [])) {
        if (rule.style && rule.selectorText) {
            let matches = false;
            try { matches = root.matches(rule.selectorText); } catch (_) {}
            if (!matches) continue;
            const declarations = Array.from(rule.style).filter(name => name.startsWith('--'))
                .map(name => `${name}:${rule.style.getPropertyValue(name)}${rule.style.getPropertyPriority(name) ? ' !important' : ''};`).join('');
            if (declarations) result += `${rule.selectorText}{${declarations}}\n`;
        } else if (rule.cssRules) {
            const name = rule.constructor?.name;
            if (name === 'CSSMediaRule' && !env.matchMedia(rule.conditionText).matches) continue;
            if (name === 'CSSSupportsRule' && !env.CSS.supports(rule.conditionText)) continue;
            const inner = rootVariableRules(rule.cssRules, root, env);
            if (!inner) continue;
            // Conditions were tested against the visible document, rather than
            // the tiny frame viewport. Preserve named/anonymous layer order.
            result += name === 'CSSLayerBlockRule' ? `@layer ${rule.name || ''}{${inner}}\n` : inner;
        } else if (rule.constructor?.name === 'CSSLayerStatementRule') {
            result += `${rule.cssText}\n`;
        }
    }
    return result;
}

export function readDebugPalette(computed) {
    const palette = {};
    for (const [name, role] of Object.entries(ROLES)) {
        const channels = computed.getPropertyValue(`--${role}`).trim();
        if (!channels) throw Error(`Theme palette role unavailable: ${role}`);
        palette[name] = `rgb(${channels})`;
    }
    palette['overlay-opacity'] = computed.getPropertyValue('--backgroundOverlayOpacity').trim() || '0';
    return palette;
}

export function installDebugPalette(options = {}) {
    const win = options.window || window, doc = win.document || document;
    if (win[KEY]?.version === 1 && !win[KEY].stopped) return win[KEY];
    // Structural tests/nonvisual shared documents do not need a resolver.
    if (!doc.documentElement || !win.getComputedStyle || !win.CSSStyleSheet) return null;
    let stopped = false, frame = null, sources = null, inFlight = null, rerun = false;
    let current = null, lastError = null, sourceGeneration = 0;
    const subscribers = new Set(), bindings = new Set(), removers = [];
    const base = options.baseURL || new URL('../../', import.meta.url).href;
    const load = options.fetchText || (async url => {
        const response = await win.fetch(url, { cache: 'no-store' });
        if (!response.ok) throw Error('Theme configuration could not be loaded');
        return response.text();
    });
    const listen = (target, event, fn, config) => {
        target.addEventListener(event, fn, config);
        removers.push(() => target.removeEventListener(event, fn, config));
    };
    const mode = () => {
        const control = win.__atomsAnnotationControlV1;
        if (['light', 'dark'].includes(control?.previewMode)) return control.previewMode;
        if (['light', 'dark'].includes(control?.savedMode)) return control.savedMode;
        const preview = win.__atomsAnnotationColorToggleV1;
        const override = preview?.getOverride?.();
        if (['light', 'dark'].includes(override)) return override;
        const actual = win.getComputedStyle(doc.documentElement).getPropertyValue('--atoms-color-mode').trim();
        return ['light', 'dark'].includes(actual) ? actual : current?.mode || 'dark';
    };
    const paint = (binding) => {
        if (!current) return;
        const own = binding.counterpart ? current.counterpart : current.active;
        const opposite = binding.counterpart ? current.active : current.counterpart;
        for (const [name, value] of Object.entries(own)) binding.element.style.setProperty(`${PREFIX}${name}`, value, 'important');
        for (const [name, value] of Object.entries(opposite)) binding.element.style.setProperty(`${PREFIX}opposite-${name}`, value, 'important');
    };
    const publish = (palettes) => {
        if (stopped) return;
        const activeMode = mode();
        current = { mode: activeMode, active: { ...palettes[activeMode], scheme: activeMode },
            counterpart: { ...palettes[activeMode === 'light' ? 'dark' : 'light'], scheme: activeMode === 'light' ? 'dark' : 'light' } };
        lastError = null;
        bindings.forEach(paint);
        subscribers.forEach(fn => { try { fn(current); } catch (_) {} });
        win.dispatchEvent(new win.CustomEvent('atoms-debug-palette', { detail: { mode: current.mode } }));
    };
    const makeFrame = () => {
        if (frame?.isConnected) return frame;
        frame = doc.createElement('iframe');
        frame.setAttribute('data-atoms-debug-palette-resolver', '');
        frame.setAttribute('aria-hidden', 'true');
        frame.setAttribute('sandbox', 'allow-same-origin');
        frame.tabIndex = -1;
        frame.style.cssText = 'display:none!important;pointer-events:none!important';
        // Recorder discovery skips srcdoc documents; no scripts, resources or
        // product styles are installed in this variable-only frame.
        frame.srcdoc = '<!doctype html><html><head></head><body></body></html>';
        (doc.body || doc.documentElement).appendChild(frame);
        return frame;
    };
    const resolve = async () => {
        const generation = sourceGeneration;
        const textSources = sources || await Promise.all(['css/configDefaults.css', 'config.css', 'css/lightMode.css']
            .map(path => load(new URL(path, base).href)));
        if (generation !== sourceGeneration) { rerun = true; return; }
        sources = textSources;
        if (stopped) return;
        const f = makeFrame();
        // srcdoc is asynchronous; wait for its actual, isolated document.
        if (!f.contentDocument?.head || f.contentDocument.URL !== 'about:srcdoc') {
            await new Promise((resolveLoad, reject) => {
                const timeout = win.setTimeout(() => { f.removeEventListener('load', loaded); reject(Error('Palette resolver not ready')); }, 5000);
                function loaded() { win.clearTimeout(timeout); resolveLoad(); }
                f.addEventListener('load', loaded, { once: true });
                if (f.contentDocument?.URL === 'about:srcdoc' && f.contentDocument.head) { f.removeEventListener('load', loaded); loaded(); }
            });
        }
        if (stopped) return;
        const sandbox = f.contentDocument, root = sandbox.documentElement;
        for (const attr of Array.from(root.attributes)) root.removeAttribute(attr.name);
        for (const attr of Array.from(doc.documentElement.attributes)) if (attr.name !== 'style') root.setAttribute(attr.name, attr.value);
        const compile = source => {
            const sheet = new win.CSSStyleSheet(); sheet.replaceSync(source);
            return rootVariableRules(sheet.cssRules, doc.documentElement, win);
        };
        const css = textSources.map(compile);
        const style = sandbox.createElement('style');
        sandbox.head.replaceChildren(style);
        // Inline customizations include the system-accent utility's references;
        // preserve their priority. Copy only OS inputs from computed values,
        // never the already-remapped active light roles.
        const actual = win.getComputedStyle(doc.documentElement);
        for (const name of new Set([...SYSTEM_NAMES, ...Array.from(actual).filter(name => name.startsWith('--SystemAccentColor'))])) {
            const value = actual.getPropertyValue(name).trim();
            if (value) root.style.setProperty(name, value);
        }
        for (const name of Array.from(doc.documentElement.style)) if (name.startsWith('--')) {
            root.style.setProperty(name, doc.documentElement.style.getPropertyValue(name), doc.documentElement.style.getPropertyPriority(name));
        }
        style.textContent = css[0] + css[1];
        const dark = readDebugPalette(f.contentWindow.getComputedStyle(root));
        style.textContent = css[0] + css[1] + css[2];
        const light = readDebugPalette(f.contentWindow.getComputedStyle(root));
        publish({ dark, light });
    };
    const refresh = ({ reload = false } = {}) => {
        if (stopped) return Promise.resolve(null);
        if (reload) { sources = null; sourceGeneration++; }
        if (inFlight) { rerun = true; return inFlight; }
        inFlight = (async () => {
            do {
                rerun = false;
                try { await resolve(); } catch (error) { lastError = error.message; }
            } while (rerun && !stopped);
            return current;
        })().finally(() => { inFlight = null; });
        return inFlight;
    };
    const api = {
        version: 1, stopped: false, ready: null, refresh,
        snapshot: () => current, status: () => ({ ready: Boolean(current), error: lastError }),
        subscribe(fn) { subscribers.add(fn); if (current) fn(current); return () => subscribers.delete(fn); },
        apply(element, { counterpart = false } = {}) {
            if (!element?.style?.setProperty) return () => {};
            const binding = { element, counterpart }; bindings.add(binding); paint(binding);
            return () => bindings.delete(binding);
        },
        stop() {
            stopped = true; api.stopped = true; observer.disconnect();
            removers.splice(0).forEach(remove => remove()); bindings.clear(); subscribers.clear(); frame?.remove();
        },
    };
    const observer = new win.MutationObserver(() => refresh());
    observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    listen(win, 'atoms-config-changed', () => refresh({ reload: true }));
    for (const event of ['atoms-debug-state', 'atoms-debug-color-mode', 'atoms-theme-toggle', 'load', 'pageshow']) listen(win, event, () => refresh());
    // Late conditional links can add palette inputs. No subtree instrumentation
    // or observation of our own frame/style writes is needed.
    if (doc.head) {
        const loaded = event => { if (event.target?.tagName === 'LINK') refresh({ reload: true }); };
        listen(doc.head, 'load', loaded, true);
    }
    win[KEY] = api;
    api.ready = refresh();
    return api;
}
