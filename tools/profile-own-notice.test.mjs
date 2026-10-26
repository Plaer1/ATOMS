import test from 'node:test';
import assert from 'node:assert/strict';
import { installProfileOwnNotice } from '../js/utilities/profileOwnNotice.js';

function fixture(t, pathname = '/id/example/') {
    const previous = new Map(['document','window','location','MutationObserver'].map(key => [key, globalThis[key]]));
    t.after(() => { for (const [key,value] of previous) globalThis[key] = value; });
    const listeners = new Map(), styles = [], notices = [], links = [];
    const node = () => ({ attrs: new Map(), dataset: {},
        getAttribute(key) { return this.attrs.get(key) ?? null; },
        setAttribute(key,value) { this.attrs.set(key,String(value)); }, removeAttribute(key) { this.attrs.delete(key); },
        remove() { this.removed = true; } });
    const state = { profile: true };
    globalThis.location = { hostname: 'steamcommunity.com', pathname, href: 'https://steamcommunity.com' + pathname };
    globalThis.window = { addEventListener: (key,fn) => listeners.set(key,fn), removeEventListener: key => listeners.delete(key) };
    globalThis.document = { documentElement: {}, head: { appendChild: value => styles.push(value) }, createElement: node,
        querySelector: selector => selector === 'body.profile_page' && state.profile ? {} : null,
        querySelectorAll: selector => selector === '.profile_header_actions a[href]' ? links : notices };
    globalThis.MutationObserver = class { constructor(fn) { state.mutation = fn; } observe() {} disconnect() { state.disconnected = true; } };
    const notice = node(); notices.push(notice);
    return { state, notice, links, styles, listeners, node };
}

test('own notice only hides when native profile edit action is present, then restores when it disappears', t => {
    const f = fixture(t), api = installProfileOwnNotice();
    assert.equal(f.notice.getAttribute('data-atoms-own-profile-notice'), null);
    f.links.push({ href: 'https://example.invalid/id/example/edit/info' }); f.state.mutation();
    assert.equal(f.notice.getAttribute('data-atoms-own-profile-notice'), null);
    // Native identity alias is allowed; no account ID is hardcoded in helper.
    f.links.push({ href: 'https://steamcommunity.com/profiles/123456/edit/info' }); f.state.mutation();
    assert.equal(f.notice.getAttribute('data-atoms-own-profile-notice'), 'hidden');
    assert.equal(f.styles[0].dataset.atomsVisualEffect, 'profile-own-notice');
    f.links.length = 0; f.state.mutation();
    assert.equal(f.notice.getAttribute('data-atoms-own-profile-notice'), null); api.stop();
});

test('nested routes and non-profile structures never install the notice effect', t => {
    const f = fixture(t, '/id/example/games/');
    assert.equal(installProfileOwnNotice(), null); assert.equal(f.styles.length, 0);
    location.pathname = '/id/example/'; f.state.profile = false;
    assert.equal(installProfileOwnNotice(), null); assert.equal(f.styles.length, 0);
});

test('route exit and stop restore owned attribute preimages and leave the real notice node intact', t => {
    const f = fixture(t); f.notice.setAttribute('data-atoms-own-profile-notice','prior-value');
    f.links.push({ href: '/id/example/edit/info' });
    const api = installProfileOwnNotice();
    assert.equal(installProfileOwnNotice(), api); assert.equal(f.styles.length, 1);
    location.pathname = '/id/example/inventory/'; f.listeners.get('popstate')();
    assert.equal(f.notice.getAttribute('data-atoms-own-profile-notice'), 'prior-value');
    location.pathname = '/id/example/'; api.refresh();
    assert.equal(f.notice.getAttribute('data-atoms-own-profile-notice'), 'hidden');
    api.stop(); assert.equal(f.notice.getAttribute('data-atoms-own-profile-notice'), 'prior-value');
    assert.equal(f.notice.removed, undefined); assert.equal(f.styles[0].removed, true); assert.equal(f.state.disconnected, true);
});
