import test from 'node:test';
import assert from 'node:assert/strict';
import installRootMenu from '../js/utilities/rootMenus/rootMenuDropown.js';

function fixture() {
    let observer;
    class Element {
        constructor(tag = 'div') { this.tagName = tag; this.children = []; this.parentNode = null; this.style = {}; this.attrs = {}; this.events = {}; this._innerHTML = ''; }
        setAttribute(key, value) { this.attrs[key] = value; }
        get isConnected() { return this === doc || Boolean(this.parentNode?.isConnected); }
        get firstChild() { return this.children[0] || null; }
        get nextSibling() { const siblings = this.parentNode?.children || []; return siblings[siblings.indexOf(this) + 1] || null; }
        appendChild(child) { return this.insertBefore(child, null); }
        insertBefore(child, before) { if (child.parentNode) child.remove(); const at = before ? this.children.indexOf(before) : -1; this.children.splice(at < 0 ? this.children.length : at, 0, child); child.parentNode = this; return child; }
        remove() { if (!this.parentNode) return; const siblings = this.parentNode.children; siblings.splice(siblings.indexOf(this), 1); this.parentNode = null; }
        contains(child) { return this === child || this.children.some(x => x.contains(child)); }
        querySelector(selector) { const find = node => { for (const child of node.children) { if (selector[0] === '.' && (child.attrs.class || '').split(/\s+/).includes(selector.slice(1))) return child; if (selector[0] === '#' && child.attrs.id === selector.slice(1)) return child; const nested = find(child); if (nested) return nested; } return null; }; return find(this); }
        set innerHTML(value) { this._innerHTML = value; this.children = []; if (value.includes('id="logoPath"')) { const path = new Element('path'); path.attrs.id = 'logoPath'; path.attrs.fill = 'rgb(var(--icon))'; this.appendChild(path); } }
        get innerHTML() { return this._innerHTML; }
        addEventListener(name, fn) { this.events[name] = fn; }
        getBoundingClientRect() { return { right: 100, left: 0 }; }
    }
    const doc = new Element('document'); doc.title = ''; doc.createElement = tag => new Element(tag); doc.createElementNS = (_, tag) => new Element(tag);
    const listeners = new Map();
    const win = { innerWidth: 1600, MutationObserver: class { constructor(fn) { this.fn = fn; observer = this; } observe() {} disconnect() { this.disconnected = true; } }, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
    const mount = () => { const target = new Element(); target.attrs.class = '_39oUCO1OuizVPwcnnv88no'; const menu = new Element(); menu.attrs.class = '_1Ky59qmywxOUtNcI1cgmkX'; target.appendChild(menu); doc.appendChild(target); return { target, menu }; };
    return { doc, win, mount, notify: () => observer.fn(), observer: () => observer, listeners };
}

test('waits without a timeout for a late Steam title and root menu, then installs only one toggle', () => {
    const f = fixture(), api = installRootMenu({ win: f.win, doc: f.doc });
    const { target, menu } = f.mount(); f.notify();
    assert.equal(target.querySelector('.rootToggleButtonWrapperDiv'), null);
    f.doc.title = 'Steam'; f.notify();
    const wrapper = target.querySelector('.rootMenuWrapperDiv'), toggle = target.querySelector('.rootToggleButtonWrapperDiv');
    assert.ok(wrapper?.contains(menu)); assert.ok(toggle); assert.equal(menu.style.display, 'none');
    const button = toggle.querySelector('#toggleButton'), path = button.querySelector('#logoPath');
    button.events.click(); assert.equal(menu.style.display, 'flex'); assert.equal(path.attrs.fill, 'rgb(var(--accent))');
    button.events.click(); assert.equal(menu.style.display, 'none'); assert.equal(path.attrs.fill, 'rgb(var(--icon))');
    f.notify(); assert.equal(installRootMenu({ win: f.win, doc: f.doc }), api);
    assert.equal(target.children.filter(x => x.attrs.class === 'rootToggleButtonWrapperDiv').length, 1);
    assert.equal(target.children.filter(x => x.attrs.class === 'rootMenuWrapperDiv').length, 1);
    api.stop(); assert.equal(f.observer().disconnected, true); assert.equal(f.listeners.has('pagehide'), false);
});

test('repairs an incomplete wrapper without discarding Steam’s native menu', () => {
    const f = fixture(); f.doc.title = 'Steam'; const { target, menu } = f.mount();
    installRootMenu({ win: f.win, doc: f.doc });
    target.querySelector('.rootToggleButtonWrapperDiv').remove(); f.notify();
    const wrapper = target.querySelector('.rootMenuWrapperDiv');
    assert.ok(wrapper?.contains(menu)); assert.ok(target.querySelector('.rootToggleButtonWrapperDiv'));
    assert.equal(target.children.filter(x => x.attrs.class === 'rootMenuWrapperDiv').length, 1);
});

test('reinstalls once after Steam replaces its title bar', () => {
    const f = fixture(); f.doc.title = 'Steam'; const old = f.mount();
    installRootMenu({ win: f.win, doc: f.doc }); old.target.remove();
    const next = f.mount(); f.notify(); f.notify();
    assert.ok(next.target.querySelector('.rootMenuWrapperDiv')?.contains(next.menu));
    assert.equal(next.target.children.filter(x => x.attrs.class === 'rootToggleButtonWrapperDiv').length, 1);
});
