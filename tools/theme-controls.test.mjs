import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import installMenus from '../js/utilities/restartMenus.js';
import installDownloads from '../js/utilities/titlebarDownloads.js';
import { installThemeToggle } from '../js/utilities/visualThemeControls.js';
import { installAnnotationThemeToggle } from './steam-annotation-theme-toggle.js';
import { installAnnotationControl } from './steam-annotation-control.js';
import { installAnnotationModalLayer } from './steam-annotation-modal-layer.js';

test('new checkbox groups all existing Millennium settings in the same visible tab', () => {
    const skin = JSON.parse(fs.readFileSync(new URL('../skin.json', import.meta.url), 'utf8'));
    const condition = skin.Conditions['Show floating theme toggle?'];
    assert.equal(condition.default, 'no');
    assert.deepEqual(Object.keys(condition.values), ['no', 'yes']);
    // Current Millennium drops untabbed groups and splits undefined tab names.
    assert.ok(Object.values(skin.Conditions).every(value => value.tab === 'General'));
    const light = skin.Conditions['Light mode?'];
    assert.equal(light.default, 'no');
    assert.deepEqual(light.values.yes.TargetCss, { affects: ['.*'], src: 'css/lightMode.css' });
    assert.equal(light.values.yes.TargetJs, undefined);
});

// Small structural DOM doubles only. Visual acceptance is in the live Steam RDP.
class Element {
    constructor(tag = 'div') {
        this.tagName = tag.toUpperCase(); this.children = []; this.attrs = new Map();
        this.dataset = {}; this.style = { setProperty() {} }; this.listeners = new Map();
        this.disabled = false; this.nodeType = 1;
    }
    get className() { return this.attrs.get('class') || ''; }
    set className(v) { this.attrs.set('class', v); }
    get id() { return this.attrs.get('id'); }
    set id(v) { this.attrs.set('id', v); }
    get classList() { return { contains: c => this.className.split(' ').includes(c) }; }
    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    getAttribute(k) { return this.attrs.get(k) ?? null; }
    hasAttribute(k) { return this.attrs.has(k); }
    removeAttribute(k) { this.attrs.delete(k); }
    get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] ?? null; }
    get isConnected() { return this === globalThis.document?.documentElement || Boolean(this.parentNode?.isConnected); }
    appendChild(e) { e.remove(); this.children.push(e); e.parentNode = this; return e; }
    insertBefore(e, anchor) { e.remove(); this.children.splice(this.children.indexOf(anchor), 0, e); e.parentNode = this; }
    remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
    showPopover() { this.popoverOpen = true; const stack = document.topLayer; if (stack) { const i = stack.indexOf(this); if (i >= 0) stack.splice(i, 1); stack.push(this); } }
    hidePopover() { this.popoverOpen = false; const stack = document.topLayer; const i = stack?.indexOf(this) ?? -1; if (i >= 0) stack.splice(i, 1); }
    cloneNode() { const e = new Element(this.tagName); e.attrs = new Map(this.attrs); return e; }
    matches(s) {
        if (s === ':popover-open') return Boolean(this.popoverOpen);
        if (s === ':modal') return this.tagName === 'DIALOG' && Boolean(this.modal);
        if (s === 'dialog:modal') return this.matches(':modal');
        if (s.includes(',')) return s.split(',').some(v => this.matches(v.trim()));
        const wantedId = s.match(/^#([\w-]+)/)?.[1];
        if (wantedId && this.id !== wantedId) return false;
        const tag = s.match(/^[a-z]+/i)?.[0];
        if (tag && tag.toUpperCase() !== this.tagName) return false;
        if ([...s.matchAll(/\.([\w-]+)/g)].some(m => !this.classList.contains(m[1]))) return false;
        return [...s.matchAll(/\[([^=\]~]+)(?:(~?=)"([^"]*)")?\]/g)].every(([, k, op, v]) =>
            op === '~=' ? String(this[k] || this.getAttribute(k)).split(' ').includes(v) : op ? this.getAttribute(k) === v : this.hasAttribute(k));
    }
    querySelectorAll(s) { return this.children.flatMap(e => [...(e.matches(s) ? [e] : []), ...e.querySelectorAll(s)]); }
    querySelector(s) { return this.querySelectorAll(s)[0] || null; }
    closest(s) { return this.matches(s) ? this : this.parentNode?.closest(s) ?? null; }
    addEventListener(n, f) { this.listeners.set(n, f); }
    click() { (this.onclick || this.listeners.get('click'))?.(); }
    attachShadow() {
        this.shadowRoot = new Element();
        Object.defineProperty(this.shadowRoot, 'innerHTML', { set() { this.appendChild(new Element('button')); } });
        return this.shadowRoot;
    }
}

function fixture(title = 'Steam', userAgent = 'Windows', lang = 'en') {
    const root = new Element('html'); root.lang = lang;
    const observers = [], listeners = new Map(), saved = new Map(), calls = [];
    const documentListeners = new Map();
    globalThis.document = { title, documentElement: root, topLayer: [],
        addEventListener: (n, f) => documentListeners.set(n, f), removeEventListener: n => documentListeners.delete(n),
        dispatchEvent: event => documentListeners.get(event.type)?.(event),
        createElement: t => new Element(t), querySelector: s => root.querySelector(s), querySelectorAll: s => root.querySelectorAll(s),
        getElementById: id => root.querySelector(`[id="${id}"]`) };
    globalThis.window = { opener: { eval: expr => calls.push(expr) },
        addEventListener: (n, f) => listeners.set(n, f), removeEventListener: n => listeners.delete(n),
        dispatchEvent: event => { listeners.get(event.type)?.(event); return true; } };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent } });
    globalThis.sessionStorage = { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v) };
    globalThis.CustomEvent = class { constructor(n, v) { this.type = n; this.detail = v.detail; } };
    globalThis.Node = { ELEMENT_NODE: 1 };
    globalThis.location = { href: 'https://steamcommunity.com/' };
    globalThis.MutationObserver = class {
        constructor(fn) { this.fn = fn; observers.push(this); }
        observe() { this.active = true; }
        disconnect() { this.active = false; }
    };
    return { root, observers, saved, calls, add: (parent, cls = '', tag = 'div') => {
        const e = new Element(tag); e.className = cls; parent.appendChild(e); return e;
    } };
}

test('floating toggle defaults off, restores old OFF state, and allocates no observer', () => {
    const f = fixture(); f.saved.set('atoms-theme-disabled-v1', '1');
    const api = installThemeToggle();
    assert.equal(api.isButtonEnabled(), false);
    assert.equal(api.isDisabled(), false);
    assert.equal(f.observers.length, 0);
    assert.equal(document.getElementById('atoms-theme-toggle-host'), null);
    assert.equal(f.saved.get('atoms-theme-disabled-v1'), '0');
});

test('tiny browser context menus keep global controls enabled without mounting pills over their rows', () => {
    const f = fixture('useBrowserViewContextMenu');
    f.root.className = 'useBrowserViewContextMenu MillenniumWindow_ContextMenu';
    const api = installThemeToggle({ showButton: true });
    assert.equal(api.isButtonEnabled(), true);
    assert.equal(document.getElementById('atoms-theme-toggle-host'), null);
    api.setButtonEnabled(true); api.install();
    assert.equal(document.getElementById('atoms-theme-toggle-host'), null);
    f.root.className = '';
    api.install();
    assert.ok(document.getElementById('atoms-theme-toggle-host'));
    f.root.className = 'useBrowserViewContextMenu MillenniumWindow_ContextMenu';
    api.install();
    assert.equal(document.getElementById('atoms-theme-toggle-host'), null);
    assert.equal(api.isButtonEnabled(), true);
});

test('toggle cycles preserve foreign and initially disabled sheets, then removes itself', () => {
    const f = fixture();
    const link = (href, disabled = false) => { const e = f.add(f.root, '', 'link'); e.rel = 'stylesheet'; e.href = href; e.disabled = disabled; return e; };
    const own = link('https://millennium.host/v1/themes/ATOMS/css/library.css');
    const conditional = link('https://millennium.host/v1/themes/ATOMS/css/optional.css', true);
    const foreign = link('https://steamloopback.host/steamui/css/sp.css');
    const effect = f.add(f.root, '', 'style'); effect.setAttribute('data-atoms-visual-effect', 'hero');
    const api = installThemeToggle({ showButton: true });
    assert.equal(installThemeToggle(), api);
    assert.equal(f.observers.length, 1);
    assert.equal(document.querySelectorAll('[id="atoms-theme-toggle-host"]').length, 1);
    document.getElementById('atoms-theme-toggle-host').shadowRoot.querySelector('button').click();
    assert.equal(own.disabled, true); assert.equal(effect.disabled, true); assert.equal(foreign.disabled, false);
    const late = link('https://millennium.host/v1/themes/ATOMS/css/late.css');
    f.observers[0].fn([{ addedNodes: [late] }]);
    assert.equal(late.disabled, true);
    api.setButtonEnabled(false);
    assert.equal(own.disabled, false); assert.equal(effect.disabled, false); assert.equal(late.disabled, false);
    assert.equal(conditional.disabled, true); assert.equal(foreign.disabled, false);
    assert.equal(document.getElementById('atoms-theme-toggle-host'), null);
    assert.equal(f.observers[0].active, false);
    installThemeToggle(); assert.equal(api.isButtonEnabled(), false);
    installThemeToggle({ showButton: true }); assert.equal(f.observers.length, 2);
    api.stop();
});

test('controller palette shortcut attaches when the debug host mounts after the bridge and remounts', () => {
    const f = fixture();
    globalThis.location = { href: 'https://steamcommunity.com/app/1374490/' };
    let paletteInstalls = 0;
    installAnnotationControl({ enabled: false, pending: false, available: true }, () => {
        const host = document.getElementById('atoms-theme-toggle-host');
        if (!host) return;
        paletteInstalls++;
        const shadow = host.shadowRoot;
        if (!shadow.querySelector('#atoms-color-mode-toggle')) {
            const button = document.createElement('button');
            button.id = 'atoms-color-mode-toggle';
            shadow.appendChild(button);
        }
    });
    assert.equal(paletteInstalls, 0);

    const api = installThemeToggle({ showButton: true });
    const host = document.getElementById('atoms-theme-toggle-host');
    assert.equal(paletteInstalls, 1);
    assert.ok(host.shadowRoot.querySelector('#atoms-color-mode-toggle'));
    api.install();
    assert.equal(paletteInstalls, 1); // Routine synchronization emits no mount event.

    host.remove();
    f.observers[0].fn([{ addedNodes: [] }]);
    assert.equal(document.getElementById('atoms-theme-toggle-host'), host);
    assert.equal(host.isConnected, true);
    assert.equal(paletteInstalls, 2);
    assert.equal(host.shadowRoot.querySelectorAll('#atoms-color-mode-toggle').length, 1);
    api.stop();
});

test('old recorder toggle is restored and replaced without an unconditional button', () => {
    fixture(); const calls = [];
    window.__atomsThemeToggleV1 = { setDisabled: v => calls.push(v), stop: () => calls.push('stop') };
    assert.equal(installThemeToggle().version, 7);
    assert.deepEqual(calls, [false, 'stop']);
});

test('annotator owns the real comparison button and restores sheets on stop', async () => {
    const f = fixture();
    globalThis.location = { href: 'https://steamloopback.host/index.html' };
    document.removeEventListener = () => {};
    window.__atomsVisualAuditV5 = { stop() {} };
    const own = f.add(f.root, '', 'link');
    own.rel = 'stylesheet'; own.href = 'https://millennium.host/v1/themes/ATOMS/css/library.css';
    const conditional = f.add(f.root, '', 'link');
    conditional.rel = 'stylesheet'; conditional.href = 'https://millennium.host/v1/themes/ATOMS/css/optional.css'; conditional.disabled = true;
    const controls = installThemeToggle();
    assert.equal(document.getElementById('atoms-theme-toggle-host'), null);
    const capture = installAnnotationThemeToggle();
    assert.equal(await capture.ready, true);
    installThemeToggle({ showButton: false }); // A late Millennium default-off entrypoint.
    assert.equal(controls.isButtonEnabled(), true);
    document.getElementById('atoms-theme-toggle-host').shadowRoot.querySelector('button').click();
    assert.equal(own.disabled, true);
    window.__atomsVisualAuditV5.stop();
    assert.equal(own.disabled, false);
    assert.equal(conditional.disabled, true);
    assert.equal(document.getElementById('atoms-theme-toggle-host'), null);
    assert.equal(controls.isDisabled(), false);
    assert.equal(controls.isButtonEnabled(), false);
    assert.equal(f.observers[0].active, false);
});

for (const platform of ['Windows', 'X11; Linux', 'Macintosh; Mac OS X']) {
    for (const title of ['Account Menu', 'Steam Root Menu', 'Library Context Menu']) {
        test(`${platform}: ${title} restart entries and duplicate-safe remount`, async () => {
            const f = fixture(title, platform, 'en-US');
            const menu = f.add(f.root, '_2EstNjFIIZm_WUSKm5Wt7n _3pofGqV0buiKAfMPEs3_82');
            const native = f.add(menu, 'contextMenuItem'); native.id = 'native-exit'; native.textContent = 'Exit'; native.setAttribute('role', 'menuitem');
            const supported = title === 'Account Menu' || (title === 'Steam Root Menu' && !platform.includes('Macintosh'));
            const api = await installMenus();
            if (!supported) { assert.equal(api, null); assert.equal(menu.children.length, 1); return; }
            assert.equal(await installMenus(), api); api.sync();
            assert.equal(menu.children.length, 3);
            assert.equal(menu.children[title === 'Account Menu' ? 2 : 0], native);
            const reload = menu.querySelector('[data-atoms-menu-action="reload"]');
            const restart = menu.querySelector('[data-atoms-menu-action="restart"]');
            assert.equal(reload.textContent, 'Reload Steam'); assert.equal(restart.textContent, 'Restart Steam');
            assert.equal(restart.hasAttribute('id'), false);
            reload.click(); restart.onkeydown({ key: 'Enter', preventDefault() {}, stopPropagation() {} });
            assert.deepEqual(f.calls, ['location.reload()', 'SteamClient.User.StartRestart(false)']);
            menu.remove(); const replacement = f.add(f.root, menu.className);
            replacement.appendChild(native); api.sync(); api.sync(); assert.equal(replacement.children.length, 3);
            api.stop(); assert.equal(f.observers[0].active, false);
        });
    }
}

for (const mac of [false, true]) test(`downloads relocation preserves native controls (${mac ? 'Mac' : 'Windows/Linux'})`, () => {
    const f = fixture(); const api = installDownloads({ mac });
    const toolbar = f.add(f.root, 'toolbar');
    const trafficLights = f.add(toolbar, 'native-traffic-lights');
    const controls = f.add(toolbar, '_3cykd-VfN_xBxf3Qxriccm');
    const buttons = ['close', 'maximize', 'minimize'].map(c => f.add(controls, c));
    const downloads = f.add(f.root, '_3vCzSrrXZzZjVJFZNg9SGu');
    api.sync(); assert.equal(installDownloads({ mac }), api); api.sync();
    const wrapper = downloads.parentNode;
    assert.equal(wrapper.nextSibling, controls); assert.equal(wrapper.parentNode, toolbar);
    assert.equal(document.querySelectorAll('.Focusable-downloads').length, 1);
    assert.equal(trafficLights.parentNode, toolbar); assert.deepEqual(controls.children, buttons);
    for (const b of buttons) assert.equal(b.parentNode, controls);
    downloads.remove(); const newBar = f.add(f.root, '_3vCzSrrXZzZjVJFZNg9SGu'); api.sync();
    assert.equal(wrapper.parentNode, null); assert.equal(newBar.parentNode.nextSibling, controls);
    assert.equal(document.querySelectorAll('.Focusable-downloads').length, 1);
    api.stop(); assert.equal(f.observers[0].active, false);
});

test('system accent preserves the configured palette when no OS vars exist', () => {
    const source = fs.readFileSync(new URL('../js/utilities/systemAccentColors.js', import.meta.url), 'utf8');
    const properties = new Map();
    const run = values => vm.runInNewContext(source, {
        document: { readyState: 'complete', documentElement: { style: { setProperty: (k, v) => properties.set(k, v) } } },
        window: { addEventListener() {} }, getComputedStyle: () => ({ getPropertyValue: k => values[k] || '' })
    });
    run({}); assert.equal(properties.size, 0);
    run({ '--SystemAccentColorAccent-RGB': '222, 123, 255' });
    assert.match(properties.get('--accent'), /SystemAccentColor/);
    assert.match(properties.get('--accentFilter'), /^hue-rotate/);
    assert.match(properties.get('--youtubeRedFilter'), /^hue-rotate/);
    for (const suffix of ['', 'Light', 'Darkest', 'Transparent', 'DarkTransparent']) {
        assert.equal(properties.get(`--accent${suffix}`), properties.get(`--accentLightMode${suffix}`));
    }
    assert.match(properties.get('--accentLight'), /SystemAccentColorAccent-RGB/,
        'a missing system shade falls back to the available base');
    assert.match(properties.get('--accentTransparent'), /, 0\.498$/);
    assert.match(properties.get('--accentDarkTransparent'), /, 1$/);
});

 test('debug annotator button reflects the shared controller and requests a global change', () => {
    const f = fixture(); const requests = [];
    window.__atomsAnnotationControlV1 = { available: true, enabled: false, pending: false, setEnabled: enabled => requests.push(enabled) };
    const api = installThemeToggle({ showButton: true });
    const button = document.getElementById('atoms-theme-toggle-host').shadowRoot.querySelector('#atoms-annotator-toggle');
    assert.equal(button.textContent, 'ANNOTATOR OFF'); assert.equal(button.disabled, false);
    button.click(); assert.deepEqual(requests, [true]);
    api.setButtonEnabled(false); assert.equal(document.getElementById('atoms-theme-toggle-host'), null);
 });

test('annotator hamburger is distinct from its toggle and only opens the one manager menu', () => {
    const f = fixture(), calls=[];
    window.__atomsAnnotationControlV1={available:true,enabled:false,requestNotes(){},setEnabled:value=>calls.push(['recorder',value])};
    window.__atomsAnnotationNoteManagerV1={toggleMenu:anchor=>calls.push(['menu',anchor.id])};
    const api=installThemeToggle({showButton:true});
    const root=document.getElementById('atoms-theme-toggle-host').shadowRoot;
    const menu=root.querySelector('#atoms-annotator-menu');
    assert.equal(menu.getAttribute('aria-haspopup'),'menu');assert.equal(menu.disabled,false);
    menu.click();assert.deepEqual(calls,[['menu','atoms-annotator-menu']]);
    root.querySelector('#atoms-annotator-toggle').click();assert.deepEqual(calls[1],['recorder',true]);api.stop();
});

test('owned annotation and manager popups never receive floating debug controls', () => {
    for (const name of ['atoms_annotation_uid123','atoms_annotation_manager_uid123']) {
        fixture();window.name=name;const api=installThemeToggle({showButton:true});
        assert.equal(document.getElementById('atoms-theme-toggle-host'),null);
        api.install();assert.equal(document.getElementById('atoms-theme-toggle-host'),null);api.stop();
    }
});

test('toolbar stays in the top layer, follows modal ancestry and promotes above later page popovers without focusing',()=>{
    const f=fixture('Steam Community'),focused=f.add(f.root,'','input');document.activeElement=focused;
    const api=installThemeToggle({showButton:true}),host=document.getElementById('atoms-theme-toggle-host');
    assert.equal(host.getAttribute('popover'),'manual');assert.equal(host.matches(':popover-open'),true);
    assert.equal(document.topLayer.at(-1),host);assert.equal(document.activeElement,focused);
    const dialog=f.add(f.root,'','dialog');dialog.modal=true;
    f.observers[0].fn([{type:'attributes',target:dialog,addedNodes:[],removedNodes:[]}]);
    assert.equal(host.parentNode,dialog);assert.equal(document.topLayer.at(-1),host);
    const popup=f.add(dialog);popup.setAttribute('popover','manual');popup.showPopover();
    document.dispatchEvent({type:'toggle',target:popup,newState:'open',composedPath:()=>[popup,dialog,f.root]});
    assert.equal(document.topLayer.at(-1),host);assert.equal(document.activeElement,focused);
    const fullscreen=f.add(dialog,'','video');document.topLayer.push(fullscreen);
    document.dispatchEvent({type:'fullscreenchange',target:document});
    assert.equal(document.topLayer.at(-1),host);
    const own=f.add(f.root);own.id='atoms-annotation-note-manager-host';const menu=f.add(own);menu.setAttribute('popover','manual');menu.showPopover();
    document.dispatchEvent({type:'toggle',target:menu,composedPath:()=>[menu,own,f.root]});
    assert.equal(document.topLayer.at(-1),menu);
    dialog.modal=false;document.dispatchEvent({type:'close',target:dialog});
    assert.equal(host.parentNode,f.root);assert.equal(document.querySelectorAll('[id="atoms-theme-toggle-host"]').length,1);
    api.stop();assert.equal(document.getElementById('atoms-theme-toggle-host'),null);
});

test('upgrading the toolbar retains its inherited enabled preference before retiring the old owner',()=>{
    fixture();window.__atomsThemeToggleButtonEnabledV1=true;
    window.__atomsThemeToggleV1={version:6,setDisabled(){},stop(){window.__atomsThemeToggleButtonEnabledV1=false;}};
    const api=installThemeToggle();assert.equal(api.version,7);assert.equal(api.isButtonEnabled(),true);
    assert.ok(document.getElementById('atoms-theme-toggle-host'));api.stop();
});

test('recorder modal cleanup cannot demote a toolbar whose layer is owned by the controls',()=>{
    const f=fixture(),api=installThemeToggle({showButton:true}),host=document.getElementById('atoms-theme-toggle-host');
    f.add(f.root).id='atoms-visual-audit-host';const layer=installAnnotationModalLayer();
    layer.sync();layer.stop();assert.equal(host.matches(':popover-open'),true);assert.equal(document.topLayer.at(-1),host);
    api.stop();
});
