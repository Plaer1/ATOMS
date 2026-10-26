'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AnnotationSession, ControllerAttachments, intendedTarget, intendedContext, readSavedColorMode, documentSource } = require('./steam-annotation-controller');
const { installAnnotationControl, isSteamBrowserViewPopup } = require('./steam-annotation-control');

function childFactory() {
    const children = [], options = [];
    const launch = (exe, args, opts) => {
        options.push(opts);
        const child = new EventEmitter(); child.pid = 100 + children.length;
        child.signals = []; child.replies = []; child.connected = true;
        child.send = (message, cb) => { child.replies.push(message); cb?.(); };
        child.kill = signal => { child.signals.push(signal); queueMicrotask(() => child.emit('exit', 0)); };
        children.push(child); queueMicrotask(() => child.emit('spawn')); return child;
    };
    return { children, options, launch };
}
function bridge(onRequest = () => {}, href = 'https://steamloopback.host/', initial = {}, name = '', title = '', nativeNames = []) {
    const listeners = new Map(), events = [];
    const window = {
        name,
        addEventListener: (n,f) => listeners.set(n, [...listeners.get(n) || [],f]),
        removeEventListener: (n,f) => listeners.set(n, (listeners.get(n) || []).filter(fn => fn !== f)),
        dispatchEvent(e) { events.push(e); for (const fn of listeners.get(e.type) || []) fn(e); },
        __atomsAnnotatorControlEmit: value => onRequest(JSON.parse(value))
    };
    const document = { title, getElementById: () => null };
    const state = { enabled: false, pending: false, available: true, revision: 0, previewMode: null, ...initial };
    vm.runInNewContext(`(${installAnnotationControl})(${JSON.stringify(state)},()=>{},(${isSteamBrowserViewPopup}),${JSON.stringify(nativeNames)});`, { window, document, URL, location: { href }, setTimeout, clearTimeout, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } } });
    return { api: window.__atomsAnnotationControlV1, window, events };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('two windows share one recorder; IPC enabled, serialized explicit start/stop with no restart', async () => {
    const fake = childFactory(); const controls = [];
    const session = new AnnotationSession({ directory: '/tmp/atoms-test-unused', launch: fake.launch, publish: s => controls.forEach(c => c.update(s)) });
    controls.push(bridge(r => session.setEnabled(r.enabled)).api, bridge(r => session.setEnabled(r.enabled)).api);
    assert.equal(fake.children.length, 0);
    controls[0].setEnabled(true); await session.queue;
    assert.equal(fake.children.length, 1); assert.ok(controls.every(c => c.enabled));
    assert.equal(fake.options[0].env.ATOMS_ANNOTATION_IPC, '1');
    assert.deepEqual(fake.options[0].stdio, ['ignore','ignore','ignore','ipc']);
    await session.setEnabled(true); assert.equal(fake.children.length, 1);
    controls[1].setEnabled(false); await session.queue;
    assert.ok(controls.every(c => !c.enabled && !c.pending));
    assert.deepEqual(fake.children[0].signals, ['SIGTERM']);
    controls[0].setEnabled(true); await session.queue;
    fake.children[1].emit('exit', 1); assert.ok(controls.every(c => !c.enabled));
    assert.equal(fake.children.length, 2);
});
test('failed start publishes error without enabled capture', async () => {
    const session = new AnnotationSession({ directory: '/tmp/atoms-test-unused', launch: () => { throw Error('launch failed'); } });
    const state = await session.setEnabled(true);
    assert.equal(state.enabled, false); assert.equal(state.pending, false); assert.equal(state.error, 'launch failed');
});
test('session serializes global requests; initial saved baseline preserves preview, changed setting clears it', async () => {
    const states = [], requests = [], controls = [];
    const session = new AnnotationSession({ publish: s => { states.push(s); controls.forEach(c => c.update(s)); } });
    for (const href of ['https://steamloopback.host/','https://store.steampowered.com/app/1','https://steamcommunity.com/id/test','about:blank?createflags=1']) {
        controls.push(bridge(r => { requests.push(r); if (r.type === 'color-mode') session.setColorMode(r.mode); }, href).api);
    }
    controls[0].setColorMode('light'); await session.queue;
    await session.reportSavedMode('dark'); assert.equal(session.state().previewMode, 'light');
    controls[1].setColorMode('dark'); controls[2].setColorMode('light'); await session.queue;
    assert.equal(session.state().previewMode, 'light'); assert.ok(controls.every(c => c.previewMode === 'light'));
    const fresh = bridge(() => {}, 'https://help.steampowered.com/', session.state());
    assert.equal(fresh.api.previewMode, 'light');
    await session.reportSavedMode('light');
    assert.equal(session.state().previewMode, null); assert.ok(controls.every(c => c.savedMode === 'light' && c.previewMode === null));
    assert.ok(states.every((s, i) => i === 0 || s.revision > states[i - 1].revision));
    assert.equal(requests.length, 3); // Applying broadcasts never echoes requests.
    await assert.rejects(session.setColorMode('invalid'), /Expected/);
    await session.setColorMode('dark'); assert.equal(session.state().previewMode, 'dark'); // Queue survives a rejected command.
});
test('bridge rejects stale state, resyncs BFCache and leaves saved-preference authority with the controller', () => {
    const requests = [], f = bridge(r => requests.push(r), undefined, { revision: 8, previewMode: 'light' });
    f.api.update({ revision: 7, previewMode: 'dark' }); assert.equal(f.api.previewMode, 'light');
    f.window.dispatchEvent({ type: 'pagehide' }); assert.equal(requests.length, 0);
    f.window.dispatchEvent({ type: 'pageshow', persisted: true });
    assert.equal(requests.at(-1).type, 'sync');
    f.window.dispatchEvent({ type: 'atoms-saved-color-mode', detail: { savedMode: 'dark' } });
    assert.equal(requests.length, 1); // Retired browser preference events do not write back.
    assert.equal(f.api.reportSavedMode, undefined);
    assert.ok(f.events.some(e => e.type === 'atoms-debug-state' && e.detail.revision === 8));
    f.api.stop(); assert.equal(f.api.setColorMode('dark'), false);
    assert.equal(requests.filter(r => r.type === 'color-mode').length, 0);
});
test('async note replies preserve request identity/errors; compact changes dispatch with opaque revision', async () => {
    const requests = [], f = bridge(r => requests.push(r));
    const first = f.api.requestNotes('list'), second = f.api.requestNotes('edit', { id: 'one', revision: 2, note: 'replacement' });
    assert.notEqual(requests[0].requestId, requests[1].requestId);
    f.api.receiveNotes({ requestId: requests[1].requestId, error: { message: 'Changed', code: 'CONFLICT' } });
    await assert.rejects(second, e => e.code === 'CONFLICT');
    f.api.receiveNotes({ requestId: requests[0].requestId, result: { revision: 'epoch:3', notes: [] } });
    assert.equal((await first).revision, 'epoch:3');
    await assert.rejects(f.api.requestNotes('record', { record: {} }), e => e.code === 'INVALID_REQUEST');
    f.api.notesChanged({ revision: 'epoch:4', changes: [{ type: 'delete', id: 'one', revision: 2 }] });
    assert.equal(f.api.notesRevision, 'epoch:4'); assert.equal(f.events.at(-1).type, 'atoms-annotation-notes-changed');
    const pending = f.api.requestNotes('list'); f.api.stop();
    await assert.rejects(pending, e => e.code === 'UNAVAILABLE');
});
test('service initialization and IPC share one serialized note owner independent of recorder lifecycle queue', async () => {
    const fake = childFactory(), calls = [], publications = [];
    let session;
    const service = { async handle(r) { calls.push(r); return { revision: 'service:1', saved: true }; }, async flush() { calls.push({ action: 'flush' }); } };
    session = new AnnotationSession({ directory: '/tmp/unused', launch: fake.launch, noteService: service, publish: (s,c) => publications.push({s,c}) });
    await session.initializeNotes(); assert.equal(session.state().notesRevision, 'service:1');
    await session.setEnabled(true); const child = fake.children[0];
    child.emit('message', { channel: 'atoms-annotation-notes', requestId: 'record-1', action: 'record', record: { type: 'selected' } });
    await session.noteQueue; await tick();
    assert.equal(child.replies[0].requestId, 'record-1'); assert.equal(child.replies[0].result.saved, true);
    await assert.rejects(session.requestNotes({ action: 'record', record: {} }), e => e.code === 'INVALID_REQUEST');
    // Simulate SIGTERM where the child must finish a note RPC before it exits.
    child.kill = () => {
        child.emit('message', { channel: 'atoms-annotation-notes', requestId: 'record-2', action: 'record', record: { type: 'selected' } });
        const original = child.send;
        child.send = (m, cb) => { original(m, cb); if (m.requestId === 'record-2') queueMicrotask(() => child.emit('exit', 0)); };
    };
    await session.setEnabled(false); assert.equal(child.replies.at(-1).requestId, 'record-2');
    session.notesChanged({ revision: 'epoch:5', changes: [{ type: 'edit', id: 'one', revision: 2 }] });
    assert.equal(publications.at(-1).s.notesRevision, 'epoch:5'); assert.equal(publications.at(-1).c.changes.length, 1);
    await session.flush(); assert.equal(calls.at(-1).action, 'flush');
});
test('intended targets exclude annotation frames, external pages and hostname suffix lookalikes', () => {
    const target = url => ({ type: 'page', title: 'Steam', webSocketDebuggerUrl: 'ws://unused', url });
    for (const url of ['https://steamloopback.host:123/a','https://store.steampowered.com/','https://steamcommunity.com/','https://help.steampowered.com/','https://partner.steamgames.com/','about:blank?createflags=1']) {
        assert.equal(intendedTarget(target(url)), true, url); assert.ok(bridge(() => {}, url).api, url);
    }
    for (const url of ['about:srcdoc','about:blank','https://example.com/','https://steamcommunity.com.evil.example/']) {
        assert.equal(intendedTarget(target(url)), false, url); assert.equal(bridge(() => {}, url).api, undefined, url);
    }
    for (const title of ['ATOMS annotation','ATOMS saved annotations']) assert.equal(intendedTarget({ ...target('https://steamloopback.host/'), title }), false);
    for (const name of ['atoms_annotation_uid0','atoms_annotation_manager_uid0']) assert.equal(bridge(()=>{},undefined,{},name).api,undefined);
    assert.doesNotMatch(documentSource({ revision: 2 }), /savedColorMode|SavedColorBootstrap|Core_GetBackendConfig/);
    assert.doesNotThrow(() => new vm.Script(documentSource({ revision: 2 })));
    assert.match(documentSource({ revision: 2 }), /debugPalette\.js/);
    assert.match(documentSource({ revision: 2 }), /installAnnotationNoteManager/);
});

test('known native BrowserView menu targets and opaque default contexts share strict admission', () => {
    const urls = [
        'about:blank?browserviewpopup=1&requestid=3&parentpopup=80',
        'about:blank?parentpopup=80&browserviewpopup=1&requestid=4'
    ];
    for (const [index, title] of ['MainMenu_uid80', 'QuickAccess_uid80'].entries()) {
        const url = urls[index], target = { type: 'page', url, title, webSocketDebuggerUrl: 'ws://unused' };
        assert.equal(intendedTarget(target), true);
        for (const origin of ['', 'null']) {
            assert.equal(intendedContext(target, { origin, auxData: { isDefault: true } }), true, origin);
        }
        assert.equal(intendedContext(target, { origin: '', auxData: { isDefault: false } }), false);
        assert.equal(intendedContext(target, { origin: 'https://external.example', auxData: { isDefault: true } }), false);
        assert.equal(intendedContext(target, { origin: '', name: 'atoms_annotation_uid80', auxData: { isDefault: true } }), false);
        assert.ok(bridge(() => {}, url, {}, '', title).api, 'actual document title');
        assert.ok(bridge(() => {}, url, {}, title).api, 'actual window name');
        // CDP already validated this target identity, while the preload may run
        // before Steam assigns its document title or window.name.
        assert.ok(bridge(() => {}, url, {}, '', '', [title]).api, 'early validated-target identity');
        assert.equal(bridge(() => {}, 'https://external.example', {}, '', '', [title]).api, undefined);
        assert.doesNotThrow(() => new vm.Script(documentSource({ revision: 3 }, target)));
    }
});
test('BrowserView admission rejects unrelated blanks, malformed parameters and annotation owners', () => {
    const valid = 'about:blank?browserviewpopup=1&requestid=3&parentpopup=80';
    const target = (url, title = 'MainMenu_uid80', name = '') => ({ type: 'page', url, title, name, webSocketDebuggerUrl: 'ws://unused' });
    const invalidURLs = [
        'about:blank', 'about:srcdoc?browserviewpopup=1&requestid=3&parentpopup=80',
        'https://external.example/?browserviewpopup=1&requestid=3&parentpopup=80',
        'about:blank?browserviewpopup=0&requestid=3&parentpopup=80',
        'about:blank?browserviewpopup=1&parentpopup=80',
        'about:blank?browserviewpopup=1&requestid=x&parentpopup=80',
        'about:blank?browserviewpopup=1&requestid=-3&parentpopup=80',
        'about:blank?browserviewpopup=1&requestid=3&parentpopup=8.0',
        'about:blank?browserviewpopup=1&requestid=3&parentpopup=80&requestid=4',
        'about:blank?browserviewpopup=1&requestid=3&parentpopup=80&other=1',
        valid + '#fragment'
    ];
    for (const url of invalidURLs) {
        const candidate = target(url);
        assert.equal(intendedTarget(candidate), false, url);
        assert.equal(intendedContext(candidate, { origin: '', auxData: { isDefault: true } }), false, url);
        assert.equal(bridge(() => {}, url, {}, '', 'MainMenu_uid80').api, undefined, url);
    }
    for (const title of ['Steam', 'Other_uid80', 'MainMenu_uid', 'QuickAccess_uid80_suffix', 'ATOMS annotation', 'ATOMS saved annotations']) {
        assert.equal(intendedTarget(target(valid, title)), false, title);
        assert.equal(bridge(() => {}, valid, {}, '', title).api, undefined, title);
    }
    for (const name of ['atoms_annotation_uid80', 'atoms_annotation_manager_uid80']) {
        const candidate = target(valid, 'MainMenu_uid80', name);
        assert.equal(intendedTarget(candidate), false);
        assert.equal(intendedContext(candidate, { origin: 'null', auxData: { isDefault: true } }), false);
        assert.equal(bridge(() => {}, valid, {}, name, 'MainMenu_uid80', ['MainMenu_uid80']).api, undefined);
    }
    // A known target hint cannot bypass an actual annotation document identity.
    assert.equal(bridge(() => {}, valid, {}, '', 'ATOMS saved annotations', ['MainMenu_uid80']).api, undefined);
});


test('production preload admits an early named menu target without outer-scope parser dependencies', () => {
    const url = 'about:blank?browserviewpopup=1&requestid=4&parentpopup=80';
    const target = { type: 'page', title: 'QuickAccess_uid80', url, webSocketDebuggerUrl: 'ws://unused' };
    let paletteSync = 0, paletteState = null, managerSync = 0;
    const window = {
        name: '', addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
        __atomsDebugPaletteBootstrapV1: true,
        __atomsAnnotationColorToggleV1: { version: 11, stopped: false, sync() { paletteSync++; }, applyState(state) { paletteState = state; } },
        __atomsAnnotationNoteManagerV1: { version: 1, stopped: false, sync() { managerSync++; } }
    };
    const document = { title: '', getElementById: () => null, addEventListener() {} };
    const context = { window, document, URL, location: { href: url }, setTimeout, clearTimeout,
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } } };
    vm.runInNewContext(documentSource({ revision: 6, enabled: false, previewMode: 'light', savedMode: 'dark' }, target), context);
    assert.equal(window.__atomsAnnotationControlV1.revision, 6);
    assert.equal(window.__atomsAnnotationControlV1.enabled, false);
    assert.equal(paletteSync, 1); assert.equal(paletteState.previewMode, 'light'); assert.equal(managerSync, 1);
    // The same early blank document gets no bootstrap hint from an unrelated
    // target, even though its URL carries the native query parameters.
    delete window.__atomsAnnotationControlV1;
    vm.runInNewContext(documentSource({ revision: 7 }, { ...target, title: 'Unrelated' }), context);
    assert.equal(window.__atomsAnnotationControlV1, undefined);
});

test('native preference reads only valid active ATOMS conditions; partial/unrelated files are unavailable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atoms-config-')); const file = path.join(dir, 'config.json');
    try {
        for (const [activeTheme, value, expected] of [['ATOMS','yes','light'],['ATOMS','no','dark'],['Other','yes',null],['ATOMS','?',null]]) {
            fs.writeFileSync(file, JSON.stringify({ themes: { activeTheme, conditions: { ATOMS: { 'Light mode?': value } } } }));
            assert.equal(readSavedColorMode(file), expected);
        }
        fs.writeFileSync(file, '{'); assert.equal(readSavedColorMode(file), null);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test('controller shutdown rejects late discovery, drains accepted handshakes and prevents their late install', async () => {
    const tracker = new ControllerAttachments();
    let release, installed = 0, started = 0, drained = false;
    const connecting = tracker.start(async active => {
        started++; await new Promise(resolve => { release = resolve; });
        if (active()) installed++;
    });
    await tick(); assert.equal(started, 1);
    tracker.beginStop();
    const draining = tracker.drain().then(() => { drained = true; });
    await tracker.start(() => { started++; installed++; });
    await tick(); assert.equal(drained, false); assert.equal(started, 1);
    release(); await connecting; await draining;
    assert.equal(installed, 0); assert.equal(tracker.pending.size, 0);
    const queued = new ControllerAttachments();
    const notOpened = queued.start(() => { installed++; });
    queued.beginStop(); await notOpened; await queued.drain();
    assert.equal(installed, 0); // Stop before the queued microtask never opens a socket.
});
