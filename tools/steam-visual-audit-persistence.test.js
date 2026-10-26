'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync(path.join(__dirname, 'steam-visual-audit.js'), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const turn = () => new Promise(resolve => setImmediate(resolve));

function writeFixture(record) {
    const acks = [], writes = [], events = [];
    const context = { selectionWriter: { record(value) { writes.push(value); return record(value); } }, counts: { selections: 0 },
        event: (...args) => events.push(args), streams: {}, limits: {}, Date, JSON };
    vm.runInNewContext(section('function write(', '\nfunction event(') + ';globalThis.write = write;', context);
    const origin = { contextId: 42, connection: { call(method, params) {
        assert.equal(method, 'Runtime.evaluate'); assert.equal(params.contextId, 42);
        vm.runInNewContext(params.expression, { window: { dispatchEvent: event => acks.push(event.detail) },
            CustomEvent: class { constructor(type, value) { assert.equal(type, 'atoms-annotation-save-ack'); this.detail = value.detail; } } });
        return Promise.resolve();
    } } };
    return { context, origin, acks, writes, events };
}

test('recorder acknowledges only the origin selection/context with persisted exact identity', async () => {
    const f = writeFixture(async () => ({ note: { id: 'record-id', revision: 'row-revision' } }));
    f.context.write('selections', { colorMode: 'light', payload: { selectionId: 'selection', colorMode: 'light', selected: true, saveRequestId: 'draft-request', saveAttemptId: 'attempt', note: 'private draft' } }, f.origin);
    await turn();
    assert.equal(f.acks.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(f.acks[0])), { selectionId: 'selection', colorMode: 'light', selected: true,
        saveRequestId: 'draft-request', saveAttemptId: 'attempt', ok: true, id: 'record-id', revision: 'row-revision', error: '' });
    assert.doesNotMatch(JSON.stringify(f.acks), /private draft|payload/);
    assert.equal(f.writes[0].payload.note, 'private draft'); assert.equal(f.context.counts.selections, 1);
});

test('rejected recorder save sends a sanitized exact failure without broadcasting draft content', async () => {
    const f = writeFixture(async () => { throw Object.assign(Error('private filesystem text'), { code: 'CONFLICT' }); });
    f.context.write('selections', { payload: { selectionId: 'selection', colorMode: 'dark', selected: false, recordId: 'id', revision: 'rev' } }, f.origin);
    await turn();
    assert.equal(f.acks[0].selected, false); assert.equal(f.acks[0].colorMode, 'dark'); assert.equal(f.acks[0].ok, false);
    assert.match(f.acks[0].error, /changed or was removed/);
    assert.doesNotMatch(JSON.stringify([f.acks, f.events]), /private filesystem/);
});

function connectionFixture() {
    class Socket extends EventEmitter {
        static OPEN = 1;
        static CLOSED = 3;
        constructor() { super(); this.readyState = 0; queueMicrotask(() => { if (this.readyState === 0) { this.readyState = 1; this.emit('open'); } }); }
        close() { if (this.readyState === 3) return; this.readyState = 3; this.emit('close'); }
        terminate() { this.close(); }
    }
    const context = { WebSocket: Socket, AnnotationInputLockBridge: class { async stop() {} }, source: 'PICKER-SOURCE',
        stopping: false, BINDING: 'binding', LOCK_BINDING: 'lock', event() {}, write() {}, setTimeout, clearTimeout };
    vm.runInNewContext(section('class TargetConnection', '\nfunction attach(') + ';globalThis.TargetConnection = TargetConnection;', context);
    const connection = new context.TargetConnection({ id: 'target', type: 'page', title: 'Steam', webSocketDebuggerUrl: 'local-double' });
    const calls = [];
    connection.call = async (method, params) => { calls.push({ method, params }); return {}; };
    return { context, connection, calls };
}

test('late connection setup cannot proceed to bindings/preload/picker installation after OFF', async () => {
    const f = connectionFixture(), pending = deferred();
    f.connection.call = async (method, params) => { f.calls.push({ method, params }); return method === 'Runtime.enable' ? pending.promise : {}; };
    const connecting = f.connection.connect(); await turn();
    const stopping = f.connection.stop(); pending.resolve({});
    await Promise.all([connecting, stopping]);
    assert.equal(f.connection.ready, false);
    assert.equal(f.calls.some(call => ['DOM.enable', 'CSS.enable', 'Runtime.addBinding', 'Page.addScriptToEvaluateOnNewDocument'].includes(call.method)), false);
    assert.equal(f.calls.some(call => call.params?.expression === 'PICKER-SOURCE'), false);
});

test('preload identifier arriving during OFF is removed before the target socket closes', async () => {
    const f = connectionFixture(), pending = deferred(), reached = deferred();
    f.connection.call = async (method, params) => {
        f.calls.push({ method, params });
        if (method === 'Page.addScriptToEvaluateOnNewDocument') { reached.resolve(); return pending.promise; }
        return {};
    };
    const connecting = f.connection.connect(); await reached.promise;
    const stopping = f.connection.stop(); await turn();
    assert.notEqual(f.connection.ws.readyState, 3);
    pending.resolve({ identifier: 'late-preload' }); await Promise.all([connecting, stopping]);
    assert.equal(f.calls.find(call => call.method === 'Page.removeScriptToEvaluateOnNewDocument').params.identifier, 'late-preload');
    assert.equal(f.connection.preloadScriptId, null); assert.equal(f.connection.ws.readyState, 3);
    assert.equal(f.calls.some(call => call.params?.expression === 'PICKER-SOURCE'), false);
});

test('target poll resolving after OFF cannot attach new recorder targets', async () => {
    const pending = deferred(), attached = [];
    const context = { stopping: false, getJson: () => pending.promise, CDP_ROOT: 'local-double', ONLY_TARGET: '', targets: new Map(), event() {}, attach: target => attached.push(target) };
    vm.runInNewContext(section('async function pollTargets()', '\nlet pollTimer') + ';globalThis.poll = pollTargets;', context);
    const polling = context.poll(); context.stopping = true;
    pending.resolve([{ id: 'late', type: 'page', url: 'https://steamcommunity.com/', title: 'Steam', webSocketDebuggerUrl: 'local-double' }]);
    await polling; assert.deepEqual(attached, []);
});

test('shutdown drains pending attaches and closes sockets before it closes the note writer', async () => {
    const attaching = deferred(), closed = deferred(), order = [], timers = [];
    const context = { stopping: false, pollTimer: null, clearInterval() {}, clearTimeout() {}, setTimeout: fn => timers.push(fn), attaching: new Set([attaching.promise]),
        targets: new Map([['target', { stop: async () => { order.push('stop'); }, closeSocket() { order.push('socket-closed'); attaching.resolve(); return closed.promise; } }]]),
        selectionWriter: { async close() { order.push('writer-closed'); } }, event() {}, counts: {}, sessionDir: '/synthetic',
        fs: { writeFileSync() { order.push('marker'); } }, path, streams: { events: { end(done) { order.push('streams-ended'); done(); } } },
        console: { log() {} } };
    vm.runInNewContext(section('async function finish(signal)', "\nprocess.on('SIGINT'") + ';globalThis.finish = finish;', context);
    const finishing = context.finish('test'); await turn();
    assert.deepEqual(order, ['stop']); timers[0](); await turn();
    assert.deepEqual(order, ['stop', 'socket-closed']); closed.resolve(); await finishing;
    assert.deepEqual(order, ['stop', 'socket-closed', 'writer-closed', 'marker', 'streams-ended']);
});
