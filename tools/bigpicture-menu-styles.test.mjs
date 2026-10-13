import test from 'node:test';
import assert from 'node:assert/strict';
import { installBigPictureMenuStyles } from '../js/utilities/bigPictureMenus.js';

function windowMock(name, parentStyle = null) {
    const links = [], listeners = new Map();
    return { name, links, listeners,
        document: {
            head: { appendChild: link => links.push(link) },
            querySelector: selector => selector.includes('bigpicture-menu-source') ? links[0] ?? null : parentStyle,
            createElement: () => ({ dataset: {}, attributes: new Map(),
                toggleAttribute(key, value) { if (value) this.attributes.set(key, ''); else this.attributes.delete(key); }
            })
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
