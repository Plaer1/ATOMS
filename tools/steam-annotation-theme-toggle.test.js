'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { installAnnotationThemeToggle } = require('./steam-annotation-theme-toggle');

function fixture({ existing = true, loading = false, href = 'https://store.steampowered.com/' } = {}) {
    const listeners = new Map(), warnings = [], calls = [], notes = new Set(['saved-a', 'saved-b']);
    const controls = {
        version: 2, enabled: false, disabled: false,
        setButtonEnabled(value) {
            this.enabled = Boolean(value);
            if (!this.enabled) this.disabled = false;
            calls.push(this.enabled);
            return this.enabled;
        }
    };
    const nativeSet = controls.setButtonEnabled;
    const audit = { stopped: false, getSelected: () => notes.size,
        stop() { this.stopped = true; return 'stopped'; } };
    const nativeStop = audit.stop;
    const window = { __atomsVisualAuditV5: audit, ...(existing ? { __atomsThemeToggleV1: controls } : {}) };
    const document = {
        readyState: loading ? 'loading' : 'complete',
        addEventListener: (name, listener) => listeners.set(name, listener),
        removeEventListener: name => listeners.delete(name)
    };
    const module = { installThemeToggle() { window.__atomsThemeToggleV1 = controls; return controls; } };
    const run = loadControls => vm.runInNewContext(`(${installAnnotationThemeToggle})(loadControls)`, {
        window, document, location: { href }, loadControls: loadControls || (() => Promise.resolve(module)),
        console: { warn: (...args) => warnings.push(args) }
    });
    return { controls, nativeSet, audit, nativeStop, window, document, listeners, warnings, calls, notes, module, run };
}

test('capture shows the normal button without replacing selections or duplicating ownership', async () => {
    const f = fixture();
    const api = f.run();
    assert.equal(await api.ready, true);
    assert.equal(f.controls.enabled, true);
    const hook = f.controls.setButtonEnabled;
    assert.equal(f.run(), api);
    assert.equal(f.controls.setButtonEnabled, hook);
    assert.equal(f.audit.getSelected(), 2);
    assert.deepEqual([...f.notes], ['saved-a', 'saved-b']);
    // Millennium's default-off entrypoint may arrive after the preload.
    f.controls.setButtonEnabled(false);
    assert.equal(f.controls.enabled, true);
    api.stop();
    assert.equal(f.controls.setButtonEnabled, f.nativeSet);
});

test('stopping annotations restores an OFF preview, hides the button, and releases hooks', async () => {
    const f = fixture();
    const api = f.run();
    await api.ready;
    f.controls.disabled = true;
    assert.equal(f.audit.stop(), 'stopped');
    assert.equal(api.stopped, true);
    assert.equal(api.isActive(), false);
    assert.equal(f.controls.enabled, false);
    assert.equal(f.controls.disabled, false);
    assert.equal(f.controls.setButtonEnabled, f.nativeSet);
    assert.equal(f.audit.stop, f.nativeStop);
    assert.equal(f.audit.getSelected(), 2);
    const count = f.calls.length;
    api.stop();
    assert.equal(await api.sync(), false);
    assert.equal(f.calls.length, count);
});

test('new document loads controls once and stays visible through DOM ready and late off module', async () => {
    const f = fixture({ existing: false, loading: true });
    let loads = 0;
    const api = f.run(async () => { loads++; return f.module; });
    const duplicate = f.run();
    assert.equal(duplicate, api);
    assert.equal(await api.ready, true);
    assert.equal(loads, 1);
    f.controls.setButtonEnabled(false);
    await f.listeners.get('DOMContentLoaded')();
    assert.equal(f.controls.enabled, true);
    api.stop();
    assert.equal(f.listeners.size, 0);
    assert.equal(f.controls.enabled, false);
});

test('stopped captures cannot resurrect a button when a delayed import resolves', async () => {
    const f = fixture({ existing: false });
    let resolve;
    const api = f.run(() => new Promise(r => { resolve = r; }));
    await Promise.resolve();
    api.stop();
    resolve(f.module);
    assert.equal(await api.ready, false);
    assert.equal(f.window.__atomsThemeToggleV1, undefined);
    assert.equal(f.calls.length, 0);
});

test('stop releases the comparison control even when an older audit stop throws', async () => {
    const f = fixture();
    f.audit.stop = () => { throw Error('older audit cleanup failed'); };
    const api = f.run();
    await api.ready;
    assert.throws(() => f.audit.stop(), /older audit cleanup failed/);
    assert.equal(api.stopped, true);
    assert.equal(f.controls.enabled, false);
});

test('a fresh resume can reclaim the button after a complete stop', async () => {
    const f = fixture();
    const first = f.run();
    await first.ready;
    first.stop();
    const resumed = f.run();
    assert.notEqual(resumed, first);
    assert.equal(await resumed.ready, true);
    assert.equal(f.controls.enabled, true);
    resumed.stop();
});

test('the annotator never instruments its isolated note input frame', () => {
    const f = fixture({ href: 'about:srcdoc' });
    assert.equal(f.run(), null);
    assert.equal(f.calls.length, 0);
});

test('recorder installs the controller after its picker and explicitly stops it', () => {
    const source = fs.readFileSync(require.resolve('./steam-visual-audit.js'), 'utf8');
    assert.match(source, /visualAuditSource\.toString\(\).*installAnnotationThemeToggle\.toString\(\)/);
    assert.match(source, /window\.__atomsAnnotationThemeToggleV1\?\.stop\(\)/);
});
