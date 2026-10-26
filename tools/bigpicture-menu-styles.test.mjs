import test from 'node:test';
import assert from 'node:assert/strict';
import { installBigPictureMenuStyles } from '../js/utilities/bigPictureMenus.js';

function windowMock(name, parentStyle = null) {
    const links = [], listeners = new Map();
    const node = (tag = 'link') => ({ tagName: tag.toUpperCase(), dataset: {}, attributes: new Map(), textContent: '',
        setAttribute(key, value) { this.attributes.set(key, value); },
        getAttribute(key) { return this.attributes.get(key); },
        hasAttribute(key) { return this.attributes.has(key); },
        toggleAttribute(key, value) { if (value) this.attributes.set(key, ''); else this.attributes.delete(key); },
        remove() { links.splice(links.indexOf(this), 1); }
    });
    return { name, links, listeners, node,
        document: {
            head: { appendChild: link => links.push(link) },
            querySelector(selector) {
                if (selector.includes('bigpicture-menu-source')) return links.find(l=>l.dataset.atomsBigpictureMenuSource !== undefined) ?? null;
                if (selector.includes('bigpicture-palette=')) return links.find(l=>l.getAttribute('data-atoms-bigpicture-palette') === selector.match(/="(.*?)"/)[1]) ?? null;
                return parentStyle;
            },
            querySelectorAll(selector) {
                if (selector === '[data-atoms-bigpicture-palette]') return links.filter(l=>l.hasAttribute('data-atoms-bigpicture-palette'));
                return links.filter(l=>l.nativePalette);
            },
            createElement: node
        },
        addEventListener: (name, callback) => listeners.set(name, callback),
        removeEventListener: name => listeners.delete(name)
    };
}

test('seeds one scoped sheet in SharedJSContext and owner for Steam native CSS copying', () => {
    const shared = windowMock('Shared');
    shared.g_WindowFocusCoordinator = {};
    const owner = windowMock('Steam', { disabled: false });
    owner.opener = shared;
    const api = installBigPictureMenuStyles(owner, 'menus.css');
    assert.equal(shared.links.length, 1);
    assert.equal(owner.links.length, 1);
    assert.equal(shared.links[0].href, 'menus.css');
    assert.equal(installBigPictureMenuStyles(owner, 'menus.css'), api);
    api.sync();
    assert.equal(shared.links.length, 1);
    assert.equal(owner.links.length, 1);
    const menu = windowMock('MainMenu_uid139');
    api.applyTo(menu);
    api.applyTo(menu);
    assert.equal(menu.links.length, 1);
    const store = windowMock('Store');
    api.applyTo(store);
    assert.equal(store.links.length, 0);
    api.stop();
    assert.equal(owner.listeners.size, 0);
});

test('toggle state is copied as an attribute and closed owners are not retained', () => {
    const shared = windowMock('Shared');
    shared.g_WindowFocusCoordinator = {};
    const owner = windowMock('Steam', { disabled: true });
    owner.opener = shared;
    const api = installBigPictureMenuStyles(owner, 'menus.css');
    assert.equal(shared.links[0].disabled, true);
    assert.equal(shared.links[0].attributes.has('disabled'), true);
    owner.listeners.get('atoms-theme-toggle')({ detail: { disabled: false } });
    assert.equal(shared.links[0].disabled, false);
    assert.equal(shared.links[0].attributes.has('disabled'), false);
    owner.closed = true;
    const bp = windowMock('Steam Big Picture Mode', { disabled: false });
    bp.opener = shared;
    api.setOwner(bp);
    api.sync();
    assert.equal(bp.links.length, 1);
    api.stop();
    assert.equal(bp.listeners.size, 0);
    assert.equal(shared.__atomsBigPictureMenusV1, undefined);
    assert.equal(installBigPictureMenuStyles({}, 'menus.css'), null);
});

test('detached panes copy only loader-produced palette nodes and retire removed light condition', () => {
    const shared = windowMock('Shared'); shared.g_WindowFocusCoordinator = {};
    const owner = windowMock('Steam', { disabled: false }); owner.opener = shared;
    const light = owner.node(); light.href = 'https://millennium.host/v1/themes/ATOMS/css/lightMode.css'; light.nativePalette = true;
    const custom = owner.node('style'); custom.id = 'RootColors'; custom.nativePalette = true; custom.textContent = ':root{--accent:1,2,3}';
    owner.links.push(light, custom);
    const api = installBigPictureMenuStyles(owner, 'menus.css');
    const menu = windowMock('QuickAccess_uid7'); api.applyTo(menu);
    const palette = () => menu.links.filter(l=>l.hasAttribute('data-atoms-bigpicture-palette'));
    assert.equal(palette().length, 2); assert.equal(palette()[0].href, light.href); assert.equal(palette()[1].textContent, custom.textContent);
    assert.equal(owner.links.filter(l=>l.hasAttribute('data-atoms-bigpicture-palette')).length, 0);
    custom.textContent = ':root{--accent:7,8,9}'; api.sync(); assert.equal(palette()[1].textContent, custom.textContent);
    owner.listeners.get('atoms-theme-toggle')({ detail: { disabled: true } }); assert.ok(palette().every(l=>l.disabled && l.hasAttribute('disabled')));
    owner.links.splice(owner.links.indexOf(light), 1); api.sync(); assert.equal(palette().length, 1);
    api.stop(); assert.equal(palette().length, 0);
});

test('native renderer reload rebinds the owner even when its WindowProxy survives', () => {
    const shared = windowMock('Shared'); shared.g_WindowFocusCoordinator = {};
    const owner = windowMock('Steam', { disabled: false }); owner.opener = shared;
    const api = installBigPictureMenuStyles(owner, 'menus.css');
    owner.listeners.clear(); // A native document reload removes window listeners.
    const fresh = windowMock('Steam', { disabled: false }); owner.document = fresh.document;
    api.setOwner(owner);
    assert.equal(owner.listeners.size, 1);
    owner.listeners.get('atoms-theme-toggle')({ detail: { disabled: true } });
    assert.equal(shared.links[0].disabled, true);
    api.stop(); assert.equal(owner.listeners.size, 0);
});
