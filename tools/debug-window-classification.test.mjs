import assert from 'node:assert/strict';
import test from 'node:test';
import { isTransientSteamWindow } from '../js/utilities/visualThemeControls.js';

const doc = (title = 'Steam', className = '') => ({
    title,
    documentElement: { classList: { contains: name => className.split(/\s+/).includes(name) } }
});
const win = (name = '', href = 'https://steamcommunity.com/') => ({ name, location: { href } });

test('ordinary Steam, Friends, and Store or Community web views retain controls', () => {
    for (const href of [
        'https://steamcommunity.com/',
        'https://steamcommunity.com/friends/',
        'https://store.steampowered.com/news/',
        'https://steamcommunity.com/groups/example'
    ]) {
        assert.equal(isTransientSteamWindow(doc('Steam'), win('', href)), false, href);
    }
});

test('native transient menu, toast, tooltip, and overlay identities suppress controls', () => {
    const cases = [
        [doc('Steam Menu'), win()],
        [doc('Friends Supernav'), win()],
        [doc('Sign in to Steam'), win()],
        [doc('Steam', 'useBrowserViewContextMenu MillenniumWindow_ContextMenu'), win()],
        [doc('Steam'), win('contextmenu_uid42')],
        [doc('Steam'), win('notificationtoasts_uid42')],
        [doc('Steam'), win('tooltip_uid42')],
        [doc('Steam'), win('desktopoverlay_uid42')],
        [doc('Steam'), win('MainMenu_uid42')],
        [doc('Steam'), win('QuickAccess_uid42')],
        [doc('Steam'), win('', 'about:blank?createflags=65536')]
    ];
    for (const [document, window] of cases) assert.equal(isTransientSteamWindow(document, window), true);
});

test('only exact supported MainMenu and QuickAccess BrowserView URLs bypass name filtering', () => {
    for (const name of ['MainMenu_uid1', 'QuickAccess_uid22']) {
        const href = 'about:blank?browserviewpopup=1&requestid=7&parentpopup=8';
        assert.equal(isTransientSteamWindow(doc('Steam Menu'), win(name, href)), false, `${name} supported`);
        for (const invalid of [
            `${href}&other=1`,
            href.replace('requestid=7', 'requestid=7&requestid=9'),
            href.replace('parentpopup=8', 'parentpopup=bad'),
            'about:blank?browserviewpopup=1&requestid=7',
            'https://steamcommunity.com/?browserviewpopup=1&requestid=7&parentpopup=8'
        ]) assert.equal(isTransientSteamWindow(doc('Steam'), win(name, invalid)), true, `${name}: ${invalid}`);
    }
});

test('late menu titles remove only the bar and ordinary titles restore it', async () => {
    const observers = [];
    class Element {
        constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = new Map(); this.style = { setProperty() {} }; this.dataset = {}; this.nodeType = 1; }
        get id() { return this.attrs.get('id'); }
        set id(value) { this.attrs.set('id', value); }
        get className() { return this.attrs.get('class') || ''; }
        set className(value) { this.attrs.set('class', value); }
        get classList() { return { contains: name => this.className.split(/\s+/).includes(name) }; }
        setAttribute(key, value) { this.attrs.set(key, String(value)); }
        remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
        appendChild(child) { child.remove(); this.children.push(child); child.parentNode = this; return child; }
        get isConnected() { return this === document.documentElement || Boolean(this.parentNode?.isConnected); }
        matches(selector) { return selector === ':popover-open' ? false : selector === ':modal' ? false : false; }
        querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        attachShadow() { const shadow = new Element(); shadow.querySelector = selector => selector === 'button' ? shadow.button : null; shadow.appendChild = child => { shadow.button = child; child.parentNode = shadow; }; Object.defineProperty(shadow, 'innerHTML', { set() { shadow.appendChild(new Element('button')); } }); this.shadowRoot = shadow; return shadow; }
        addEventListener() {}
    }
    globalThis.Node = { ELEMENT_NODE: 1 };
    globalThis.CustomEvent = class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
    globalThis.MutationObserver = class { constructor(callback) { this.callback = callback; observers.push(this); } observe(target) { this.target = target; this.active = true; } disconnect() { this.active = false; } fire(records = []) { if (this.active) this.callback(records); } };
    const root = new Element('html'), head = new Element('head'), title = new Element('title');
    head.appendChild(title);
    globalThis.document = {
        title: 'Steam', documentElement: root, head,
        createElement: tag => new Element(tag),
        querySelector: selector => selector === 'title' ? title : null,
        querySelectorAll: () => [],
        getElementById: id => root.children.find(child => child.id === id) || null,
        addEventListener() {}, removeEventListener() {}
    };
    globalThis.window = { name: '', location: { href: 'https://steamcommunity.com/' }, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
    globalThis.location = window.location;
    globalThis.sessionStorage = { getItem: () => '1', setItem() {} };
    const { installThemeToggle } = await import('../js/utilities/visualThemeControls.js');
    const api = installThemeToggle({ showButton: true });
    const getHost = () => document.getElementById('atoms-theme-toggle-host');
    assert.ok(getHost());
    assert.equal(api.isButtonEnabled(), true);
    const titleWatch = observers.find(observer => observer.target === title);
    assert.ok(titleWatch);
    document.title = 'Friends Supernav';
    titleWatch.fire();
    assert.equal(getHost(), null);
    assert.equal(api.isButtonEnabled(), true);
    api.install();
    observers.find(observer => observer.target === document)?.fire([{ addedNodes: [] }]);
    assert.equal(getHost(), null);
    document.title = 'Steam';
    titleWatch.fire();
    assert.ok(getHost());
    api.stop();
});
