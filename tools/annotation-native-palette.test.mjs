import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOppositePaletteToButton, applyPaletteToHost, handleBrowserDocumentHello, nativeDocumentRoute, route } from '../js/annotation/menu.js';

test('pill palette application updates only its host and ignores invalid properties', () => {
    const values = new Map();
    const host = { style: { setProperty: (name, value) => values.set(name, value) } };
    applyPaletteToHost(host, { '--accent': '215, 120, 190', '--background': '22, 22, 22', color: 'red', '--unsafe': 'x'.repeat(600) });
    assert.deepEqual([...values], [['--accent', '215, 120, 190'], ['--background', '22, 22, 22']]);
    applyPaletteToHost(host, { '--accent': '230, 170, 220' });
    assert.equal(values.get('--accent'), '230, 170, 220');
});

test('preview button receives opposite theme roles while other pill controls remain untouched', () => {
    const values = new Map();
    const button = { style: { setProperty: (name, value) => values.set(name, value) }, dataset: {} };
    applyOppositePaletteToButton(button, {
        raised: 'rgb(248, 244, 251)', text: 'rgb(30, 24, 35)', border: 'rgb(200, 190, 208)',
        accent: 'rgb(170, 90, 150)', hover: 'rgb(238, 229, 242)', scheme: 'light',
    });
    assert.equal(values.get('--atoms-preview-surface'), 'rgb(248, 244, 251)');
    assert.equal(values.get('--atoms-preview-text'), 'rgb(30, 24, 35)');
    assert.equal(values.get('--atoms-preview-scheme'), 'light');
    assert.equal(button.dataset.paletteReady, 'true');
});

test('a new BrowserView document hello clears only an active temporary preview before replying', () => {
    const calls = [];
    const reset = () => calls.push('reset');
    const send = () => calls.push('state');
    assert.equal(handleBrowserDocumentHello({ kind: 'state' }, 'light', reset, send), false);
    assert.deepEqual(calls, []);
    assert.equal(handleBrowserDocumentHello({ kind: 'hello' }, 'light', reset, send), true);
    assert.deepEqual(calls, ['reset', 'state']);
    calls.length = 0;
    handleBrowserDocumentHello({ kind: 'hello' }, null, reset, send);
    assert.deepEqual(calls, ['state']);
});


test('no-history native title is the same current-page key used by jump', () => {
    const properties = {
        name: 'Properties',
        opener: { name: 'SP Desktop_uid0', MainWindowBrowserManager: { m_URL: 'https://store.steampowered.com/app/999/' }, SteamUIStore: { WindowStore: { GetWindowInstanceFromWindow: () => ({}) } } },
        location: { protocol: 'about:', pathname: 'blank', href: 'about:blank' },
        document: { title: 'Properties', location: { protocol: 'about:', pathname: 'blank', href: 'about:blank' } },
    };
    assert.equal(route(properties), 'Properties');
    assert.equal(nativeDocumentRoute(properties), 'Properties');
});
