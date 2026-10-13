import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import installMenus from '../js/utilities/restartMenus.js';
import installDownloads from '../js/utilities/titlebarDownloads.js';
import { installThemeToggle } from '../js/utilities/visualThemeControls.js';

test('new checkbox groups all existing Millennium settings in the same visible tab', () => {
    const skin = JSON.parse(fs.readFileSync(new URL('../skin.json', import.meta.url), 'utf8'));
    const condition = skin.Conditions['Show floating theme toggle?'];
    assert.equal(condition.default, 'no');
    assert.deepEqual(Object.keys(condition.values), ['no', 'yes']);
    // Current Millennium drops untabbed groups and splits undefined tab names.
    assert.ok(Object.values(skin.Conditions).every(value => value.tab === 'General'));
    assert.equal(Object.keys(skin.Conditions).length, 5);
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
    appendChild(e) { e.remove(); this.children.push(e); e.parentNode = this; return e; }
    insertBefore(e, anchor) { e.remove(); this.children.splice(this.children.indexOf(anchor), 0, e); e.parentNode = this; }
    remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
    cloneNode() { const e = new Element(this.tagName); e.attrs = new Map(this.attrs); return e; }
    matches(s) {
        if (s.includes(',')) return s.split(',').some(v => this.matches(v.trim()));
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
    globalThis.document = { title, documentElement: root,
        createElement: t => new Element(t), querySelector: s => root.querySelector(s), querySelectorAll: s => root.querySelectorAll(s),
        getElementById: id => root.querySelector(`[id="${id}"]`) };
    globalThis.window = { opener: { eval: expr => calls.push(expr) },
        addEventListener: (n, f) => listeners.set(n, f), removeEventListener: n => listeners.delete(n), dispatchEvent() {} };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent } });
    globalThis.sessionStorage = { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v) };
    globalThis.CustomEvent = class { constructor(n, v) { this.type = n; this.detail = v.detail; } };
    globalThis.Node = { ELEMENT_NODE: 1 };
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

test('old recorder toggle is restored and replaced without an unconditional button', () => {
    fixture(); const calls = [];
    window.__atomsThemeToggleV1 = { setDisabled: v => calls.push(v), stop: () => calls.push('stop') };
    assert.equal(installThemeToggle().version, 2);
    assert.deepEqual(calls, [false, 'stop']);
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
});
