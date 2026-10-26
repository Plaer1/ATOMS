'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { AnnotationNoteClient, CHANNEL } = require('./annotation-note-client');

function transport() {
    const ipc = new EventEmitter();
    ipc.connected = true;
    ipc.sent = [];
    ipc.send = (message, done) => { ipc.sent.push(message); done?.(); };
    ipc.disconnect = () => { ipc.connected = false; ipc.emit('disconnect'); };
    ipc.reply = (index, result) => ipc.emit('message', { channel: CHANNEL, requestId: ipc.sent[index].requestId, result });
    return ipc;
}
const turn = () => new Promise(resolve => setImmediate(resolve));

test('recorder saves are serialized and shutdown waits for their acknowledgements', async () => {
    const ipc = transport(), writer = new AnnotationNoteClient({ transport: ipc });
    const first = writer.record({ payload: { note: 'one' } });
    const second = writer.record({ payload: { note: 'two' } });
    await turn();
    assert.equal(ipc.sent.length, 1);
    let closed = false;
    const closing = writer.close().then(() => { closed = true; });
    ipc.reply(0, { saved: true }); await first; await turn();
    assert.equal(ipc.sent.length, 2); assert.equal(closed, false);
    ipc.reply(1, { saved: true }); await second; await closing;
    assert.equal(ipc.connected, false); assert.equal(closed, true);
});

test('a disconnected IPC writer reports failure and never falls back to local storage', async () => {
    const ipc = transport();
    let localWrites = 0;
    const writer = new AnnotationNoteClient({ transport: ipc, service: { handle() { localWrites++; } } });
    const save = writer.record({ payload: { note: 'recoverable in the picker' } });
    await turn(); ipc.disconnect();
    await assert.rejects(save, /disconnected/);
    await assert.rejects(writer.close(), /disconnected/);
    assert.equal(localWrites, 0);
});

test('standalone mode uses its one service and flush includes a later accepted write', async () => {
    const records = [], release = [];
    const writer = new AnnotationNoteClient({ service: { handle(request) {
        records.push(request.record);
        return new Promise(resolve => release.push(resolve));
    } } });
    const first = writer.record({ n: 1 }); await turn();
    const draining = writer.flush();
    const second = writer.record({ n: 2 });
    release.shift()({ saved: true }); await first; await turn();
    assert.deepEqual(records, [{ n: 1 }, { n: 2 }]);
    release.shift()({ saved: true }); await second; await draining; await writer.close();
});

test('controller conflicts retain their recovery code at the recorder boundary', async () => {
    const ipc = transport(), writer = new AnnotationNoteClient({ transport: ipc });
    const save = writer.record({ payload: { note: 'draft' } }); await turn();
    ipc.emit('message', { channel: CHANNEL, requestId: ipc.sent[0].requestId,
        error: { code: 'CONFLICT', message: 'Reload the saved note before retrying' } });
    await assert.rejects(save, { code: 'CONFLICT' });
    await assert.rejects(writer.close(), { code: 'CONFLICT' });
});

test('a confirmed retry clears only that operation’s previous save failure', async () => {
    let fail = true;
    const writer = new AnnotationNoteClient({ service: { handle() {
        if (fail) throw Object.assign(Error('Temporary save failure'), { code: 'STORAGE_ERROR' });
        return { saved: true };
    } } });
    const record = { payload: { saveRequestId: 'one-draft' } };
    await assert.rejects(writer.record(record));
    fail = false; await writer.record(record);
    await writer.close();
});
