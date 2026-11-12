import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyPaletteToHost, createAcknowledgedRequests, currentMode, install, isLoginWindow, isMenuWindow,
    jumpInDocument, nativeDocumentRoute, route
} from '../js/annotation/menu.js';

// Browser-free contract tests only. Window, history, CSS and transport objects
// are minimal stubs; these tests do not exercise Steam lifecycle, Chromium DOM,
// actual BrowserView messaging, native focus, or visual placement.

const modeWindow = value => ({
    document: { documentElement: {} },
    getComputedStyle: () => ({ getPropertyValue: name => name === '--atoms-color-mode' ? value : '' }),
});

test('login windows skip all native annotator startup before owner/follower setup', () => {
    const previousWindow = globalThis.window;
    try {
        for (const name of ['SP DesktopLoginWindow_uid0', 'SP DesktopLoginWindow_uid17', 'SP DesktopLoginWindow']) {
            const win = { name };
            globalThis.window = win;
            assert.equal(isLoginWindow(win), true, name);
            const api = install();
            assert.equal(typeof api.stop, 'function');
            assert.equal(win.__atomsAnnotationMenuV1, undefined);
            assert.equal(win.__atomsAnnotationPickerV1, undefined);
        }
        const main = { name: 'SP Desktop_uid0' };
        assert.equal(isLoginWindow(main), false);
        const community = { name: 'SP Community_uid0' };
        assert.equal(isLoginWindow(community), false);
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});

test('login startup retires an existing clean annotator owner but preserves a dirty one', () => {
    const previousWindow = globalThis.window;
    try {
        let stopped = 0;
        const clean = { version: 1, stopped: false, stop() { stopped++; this.stopped = true; return true; } };
        globalThis.window = { name: 'SP DesktopLoginWindow_uid0', __atomsAnnotationMenuV1: clean };
        install();
        assert.equal(stopped, 1);
        const dirty = { version: 1, stopped: false, stop() { return false; } };
        globalThis.window = { name: 'SP DesktopLoginWindow_uid0', __atomsAnnotationMenuV1: dirty };
        assert.equal(install(), dirty);
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});

test('currentMode accepts only explicit light/dark markers and fails closed when style is unavailable', () => {
    assert.equal(currentMode(modeWindow('light')), 'light');
    assert.equal(currentMode(modeWindow('dark')), 'dark');
    assert.equal(currentMode(modeWindow('')), null);
    assert.equal(currentMode({ document: { documentElement: {} }, getComputedStyle() { throw Error('not ready'); } }), null);
});

test('isMenuWindow separates native menu documents from Store BrowserView popups and web pages', () => {
    const nativeContext = { documentElement: { classList: { contains: name => name === 'MillenniumWindow_ContextMenu' } } };
    assert.equal(isMenuWindow({ location: { href: 'steamloopback://popup' }, name: 'contextmenu' }, nativeContext), true);
    assert.equal(isMenuWindow({ location: { href: 'about:blank?createflags=65536' }, name: 'other' }, { title: '', documentElement: { classList: { contains: () => false } } }), true);

    const blankDoc = { title: '', documentElement: { classList: { contains: () => false } } };
    const browserPopup = { name: 'QuickAccess_uid4', location: { href: 'about:blank?browserviewpopup=1&requestid=8&parentpopup=3' } };
    assert.equal(isMenuWindow(browserPopup, blankDoc), false);
    assert.equal(isMenuWindow({ name: 'store', location: { href: 'https://store.steampowered.com/app/42' } }, blankDoc), false);
});

test('native popup route uses its Steam history; browser route falls back to the shared URL', () => {
    const shared = {
        name: 'SP Desktop_uid0',
        SteamUIStore: { WindowStore: { GetWindowInstanceFromWindow: () => ({ m_history: { location: { pathname: '/library/app/440' } } }) } },
        MainWindowBrowserManager: { m_URL: 'https://store.steampowered.com/app/440/Team_Fortress_2/' },
    };
    const popup = { name: 'QuickAccess_uid3', opener: shared, location: { protocol: 'about:', pathname: 'blank', href: 'about:blank' } };
    popup.document = { location: popup.location };
    assert.equal(nativeDocumentRoute(popup), '/library/app/440');
    assert.equal(route(popup), '/library/app/440');

    const browser = { ...popup, name: 'SP Desktop_uid0' };
    browser.SteamUIStore = { WindowStore: { GetWindowInstanceFromWindow: () => ({ m_history: { location: { pathname: '/browser' } } }) } };
    browser.opener = browser;
    browser.MainWindowBrowserManager = shared.MainWindowBrowserManager;
    assert.equal(route(browser), 'store.steampowered.com/app/440/Team_Fortress_2/');
});

test('a no-history Properties popup does not inherit the opener’s browser route', () => {
    const shared = { name: 'SP Desktop_uid0', MainWindowBrowserManager: { m_URL: 'https://store.steampowered.com/app/999/' }, SteamUIStore: { WindowStore: { GetWindowInstanceFromWindow: () => ({}) } } };
    const properties = {
        name: 'Properties', opener: shared,
        location: { protocol: 'about:', pathname: 'blank', href: 'about:blank' },
        document: { title: 'Properties', location: { protocol: 'about:', pathname: 'blank', href: 'about:blank' } },
    };
    assert.equal(route(properties), 'Properties');
    assert.equal(nativeDocumentRoute(properties), route(properties));
});

test('applyPaletteToHost applies valid CSS custom properties and ignores malformed entries', () => {
    const vars = new Map();
    const host = { style: { setProperty: (name, value) => vars.set(name, value) } };
    applyPaletteToHost(host, {
        '--atoms-debug-accent': 'rgb(1 2 3)',
        'color': 'red',
        '--atoms-invalid': 12,
        '--atoms-too-long': 'x'.repeat(512),
    });
    assert.deepEqual([...vars.entries()], [['--atoms-debug-accent', 'rgb(1 2 3)']]);
});

test('jumpInDocument prefers one exact selector and uses context only as fallback', () => {
    const originalTimeout = globalThis.setTimeout;
    globalThis.setTimeout = callback => { callback(); return 0; };
    try {
        const seen = [];
        const element = {
            isConnected: true,
            style: { outline: '', outlineOffset: '' },
            scrollIntoView: options => { seen.push(['scroll', options]); },
        };
        const doc = { querySelectorAll: selector => { seen.push(['query', selector]); return selector === '#unique-target' ? [element] : []; } };
        assert.equal(jumpInDocument({ route: '/library/app/440', selector: '#unique-target', context: 'main > button:nth-child(2)' }, doc, {}, '/library/app/440'), '');
        assert.deepEqual(seen, [['query', '#unique-target'], ['scroll', { block: 'center', inline: 'center' }]]);
        assert.equal(jumpInDocument({ route: '/another-page', selector: '#unique-target' }, doc, {}, '/library/app/440'), 'Open the page and window recorded for this note to jump to it.');
    } finally { globalThis.setTimeout = originalTimeout; }
});

test('createAcknowledgedRequests resolves success, rejects explicit failure/throw/timeout, and closes pending requests', async () => {
    const messages = [];
    const requests = createAcknowledgedRequests(message => messages.push(message), 12);
    const success = requests.request('add', { record: { note: 'ok' } });
    assert.equal(messages[0].kind, 'add');
    assert.equal(requests.receive({ kind: 'ack', requestId: messages[0].requestId, ok: true, value: 'saved' }), true);
    assert.equal(await success, 'saved');

    const failure = requests.request('remove', { id: 'note-1' });
    assert.equal(requests.receive({ kind: 'ack', requestId: messages[1].requestId, ok: false, error: 'disk unavailable' }), true);
    await assert.rejects(failure, /disk unavailable/);

    const thrown = createAcknowledgedRequests(() => { throw Error('transport closed'); });
    await assert.rejects(thrown.request('update'), /transport closed/);

    const timeout = createAcknowledgedRequests(() => {}, 5);
    await assert.rejects(timeout.request('add'), /did not acknowledge/);
    const closed = createAcknowledgedRequests(() => {});
    const pending = closed.request('add');
    closed.close();
    await assert.rejects(pending, /window closed before saving/);
    await assert.rejects(closed.request('add'), /window is closed/);
});
