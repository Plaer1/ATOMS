'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AnnotationNoteService } = require('./annotation-note-service');
const { AnnotationSelectionStore, selectionFingerprint } = require('./annotation-selection-store');
const { beginBatch, finishBatch } = require('./annotation-batch');

const note = (text = 'feedback', mode = 'dark', selectionId = 'picked') => ({
    at: '2026-10-25T01:00:00Z', type: 'selection', colorMode: mode,
    target: { id: 'target', extra: [1, 2] }, url: 'https://steamcommunity.com/a',
    customProvenance: { futureField: true },
    payload: { selected: true, selectionId, colorMode: mode, note: text, asset: { id: 'same-selector', custom: 'asset' } }
});

function fixture(t, rows = []) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atoms-note-service-'));
    t.after(() => fs.rmSync(dir, { recursive: true }));
    const file = path.join(dir, 'selected-assets.jsonl');
    fs.writeFileSync(file, rows.map(row => JSON.stringify(row) + '\n').join(''));
    return { dir, file, read: () => fs.readFileSync(file, 'utf8'), service: options => new AnnotationNoteService(file, options) };
}
const list = service => service.handle({ action: 'list' });
const add = (service, record) => service.handle({ action: 'record', record });
const edit = (service, entry, patch) => service.handle({ action: 'edit', id: entry.id, revision: entry.revision, ...patch });
const remove = (service, entry) => service.handle({ action: 'delete', id: entry.id, revision: entry.revision });
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code);

test('listing and restarting exact duplicate legacy rows never migrates or merges them', async t => {
    const f = fixture(t), raw = '  { "payload" : { "selected":true, "note":"same\\u0020text", "selectionId":"same" } }\r\n';
    fs.writeFileSync(f.file, raw + raw);
    const first = f.service(), a = await list(first), b = await list(first);
    assert.equal(f.read(), raw + raw);
    assert.equal(a.notes.length, 2);
    assert.notEqual(a.notes[0].id, a.notes[1].id);
    assert.deepEqual(a, b);
    const second = f.service(), restarted = await list(second);
    assert.notEqual(restarted.revision, a.revision);
    assert.notEqual(restarted.notes[0].id, a.notes[0].id);
    await rejects(edit(second, a.notes[0], { note: 'stale' }), 'CONFLICT');
    await rejects(remove(second, a.notes[1]), 'CONFLICT');
    assert.equal(f.read(), raw + raw);
});

test('text and mode correction preserves capture provenance and all unrelated row bytes', async t => {
    const original = note('original'), sibling = note('untouched', 'light');
    const f = fixture(t), rawSibling = '\t' + JSON.stringify(sibling).replace('untouched', 'un\\u0074ouched') + '\r\n';
    fs.writeFileSync(f.file, JSON.stringify(original) + '\n' + rawSibling);
    const service = f.service(), snapshot = await list(service);
    const result = await edit(service, snapshot.notes[0], { note: 'corrected', colorMode: 'light' });
    assert.equal(result.note.id, snapshot.notes[0].id);
    assert.notEqual(result.note.revision, snapshot.notes[0].revision);
    const expected = { ...original, colorMode: 'light', payload: { ...original.payload, note: 'corrected', colorMode: 'light' } };
    const { __atomsNote: meta, ...actual } = result.note.record;
    assert.deepEqual(actual, expected);
    assert.deepEqual(meta, { version: 1, id: result.note.id, revision: result.note.revision });
    assert.equal(f.read().split('\n').slice(1).join('\n'), rawSibling);
    const restarted = await list(f.service());
    assert.equal(restarted.notes[0].id, result.note.id);
    assert.equal(restarted.notes[0].revision, result.note.revision);
    assert.notEqual(restarted.notes[1].id, snapshot.notes[1].id);
});

test('serialized append, edit and delete preserve exact siblings and reject stale retries', async t => {
    const f = fixture(t, [note('edit'), note('delete')]), service = f.service();
    const initial = await list(service);
    const pending = [add(service, note('new')), edit(service, initial.notes[0], { note: 'changed' }), remove(service, initial.notes[1])];
    const [added, edited, deleted] = await Promise.all(pending);
    await service.flush();
    assert.equal(deleted.removed, 1);
    assert.deepEqual((await list(service)).notes.map(row => row.record.payload.note), ['changed', 'new']);
    await rejects(edit(service, initial.notes[0], { note: 'late' }), 'CONFLICT');
    await rejects(remove(service, initial.notes[1]), 'CONFLICT');
    assert.equal((await list(service)).notes.find(row => row.id === added.note.id).revision, added.note.revision);
    assert.notEqual(edited.note.revision, initial.notes[0].revision);
    assert.deepEqual(fs.readdirSync(f.dir), ['selected-assets.jsonl']);
});

test('one exact identity wins concurrent stale edits and the queue stays usable', async t => {
    const f = fixture(t, [note()]), service = f.service(), row = (await list(service)).notes[0];
    const results = await Promise.allSettled([edit(service, row, { note: 'first' }), edit(service, row, { note: 'second' })]);
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].reason.code, 'CONFLICT');
    await add(service, note('after conflict'));
    assert.deepEqual((await list(service)).notes.map(row => row.record.payload.note), ['first', 'after conflict']);
});

test('live withdrawal requires unambiguous selection and mode or an exact row revision', async t => {
    const f = fixture(t, [note('dark one'), note('light', 'light'), note('dark two')]), service = f.service();
    const initial = await list(service), before = f.read();
    const withdrawal = { ...note('', 'dark'), payload: { ...note().payload, selected: false } };
    await rejects(add(service, withdrawal), 'CONFLICT');
    assert.equal(f.read(), before);
    const lightWithdrawal = { ...withdrawal, colorMode: 'light', payload: { ...withdrawal.payload, colorMode: 'light' } };
    assert.equal((await add(service, lightWithdrawal)).removed, 1);
    const exact = { ...withdrawal, payload: { ...withdrawal.payload, recordId: initial.notes[0].id, revision: initial.notes[0].revision } };
    assert.equal((await add(service, exact)).removed, 1);
    assert.deepEqual((await list(service)).notes.map(row => row.record.payload.note), ['dark two']);
    await rejects(add(service, exact), 'CONFLICT');
    assert.equal((await service.handle({ action: 'record', record: withdrawal, id: initial.notes[2].id, revision: initial.notes[2].revision })).removed, 1);
    assert.equal(f.read(), '');
    assert.equal((await add(service, withdrawal)).removed, 0);
});

test('duplicate persistent IDs and revisions are kept distinct and cannot target the wrong record', async t => {
    const a = { ...note('same'), __atomsNote: { version: 1, id: 'copied-id', revision: 'copied-revision', future: 3 } };
    const b = { ...a, __atomsNote: { ...a.__atomsNote, revision: 'other-revision' } };
    const f = fixture(t, [a, a, b]), service = f.service(), snapshot = await list(service);
    assert.equal(new Set(snapshot.notes.map(row => row.id)).size, 3);
    await rejects(service.handle({ action: 'delete', id: 'copied-id', revision: 'copied-revision' }), 'CONFLICT');
    const result = await edit(service, snapshot.notes[1], { note: 'only second' });
    assert.equal(result.note.record.__atomsNote.future, 3);
    assert.deepEqual((await list(service)).notes.map(row => row.record.payload.note), ['same', 'only second', 'same']);
    await remove(service, snapshot.notes[0]);
    assert.deepEqual((await list(service)).notes.map(row => row.record.payload.note), ['only second', 'same']);
});

test('record results and queued requests cannot mutate internal storage by reference', async t => {
    const f = fixture(t), service = f.service(), input = note('captured');
    const promise = add(service, input);
    input.payload.note = 'caller changed';
    const result = await promise;
    result.note.record.payload.note = 'result changed';
    const snapshot = await list(service);
    snapshot.notes[0].record.customProvenance.futureField = false;
    assert.equal((await list(service)).notes[0].record.payload.note, 'captured');
    assert.equal((await list(service)).notes[0].record.customProvenance.futureField, true);
    assert.equal(JSON.parse(f.read()).payload.note, 'captured');
    const restarted = (await list(f.service())).notes[0];
    assert.equal(restarted.id, result.note.id);
    assert.equal(restarted.revision, result.note.revision);
});

test('publish contains compact exact changes, includes prior mode, and flush waits for it', async t => {
    const f = fixture(t), updates = [];
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const service = f.service({ publish: async update => { updates.push(update); if (updates.length === 1) await gate; } });
    const pending = add(service, note('never publish this raw text'));
    let flushed = false;
    const drain = service.flush().then(() => { flushed = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(flushed, false);
    release();
    const added = await pending;
    await drain;
    const edited = await edit(service, added.note, { note: '', colorMode: 'light' });
    await remove(service, edited.note);
    assert.deepEqual(updates.map(update => update.changes[0].type), ['add', 'edit', 'delete']);
    assert.equal(updates[1].changes[0].previousColorMode, 'dark');
    assert.equal(updates[1].changes[0].colorMode, 'light');
    assert.equal(updates[1].changes[0].previousRevision, added.note.revision);
    assert.equal(updates[2].changes[0].revision, edited.note.revision);
    assert.doesNotMatch(JSON.stringify(updates), /never publish|payload|customProvenance|asset/);
    assert.equal(new Set(updates.map(update => update.revision)).size, 3);
});

test('failed publication does not reject or duplicate a committed save', async t => {
    const f = fixture(t), service = f.service({ publish: () => { throw Error('private callback detail'); } });
    const added = await add(service, note());
    assert.equal(added.saved, true);
    assert.equal((await list(service)).notes.length, 1);
    await remove(service, added.note);
    assert.equal(f.read(), '');
});

test('atomic write failure preserves old bytes and identity, then a later operation succeeds', async t => {
    const f = fixture(t, [note('original')]), updates = [], service = f.service({ publish: update => updates.push(update) });
    const row = (await list(service)).notes[0], before = f.read();
    const rename = fs.renameSync;
    fs.renameSync = () => { throw Error('filesystem detail containing private text'); };
    try {
        await assert.rejects(edit(service, row, { note: 'unsaved' }), error =>
            error.code === 'STORAGE_ERROR' && !error.message.includes('private'));
    } finally { fs.renameSync = rename; }
    assert.equal(f.read(), before);
    assert.deepEqual((await list(service)).notes[0], row);
    assert.equal(updates.length, 0);
    assert.deepEqual(fs.readdirSync(f.dir), ['selected-assets.jsonl']);
    assert.equal((await edit(service, row, { note: 'retry' })).note.record.payload.note, 'retry');
});

test('malformed data and unsupported reserved metadata fail safely without losing provenance', async t => {
    const f = fixture(t), service = f.service();
    const malformed = '{"private original text":broken}\n';
    fs.writeFileSync(f.file, malformed);
    await assert.rejects(list(service), error => error.code === 'STORAGE_ERROR' && !error.message.includes('private'));
    assert.equal(f.read(), malformed);
    const reserved = { ...note(), __atomsNote: { futureSchema: 99 } };
    fs.writeFileSync(f.file, JSON.stringify(reserved) + '\n');
    const row = (await list(service)).notes[0], before = f.read();
    await rejects(edit(service, row, { note: 'cannot erase unknown metadata' }), 'INVALID_REQUEST');
    await rejects(add(service, reserved), 'INVALID_REQUEST');
    assert.equal(f.read(), before);
    await remove(service, row);
    assert.equal(f.read(), '');
});

test('invalid and unchanged edits leave revision, bytes and publication untouched', async t => {
    const f = fixture(t, [note()]), updates = [], service = f.service({ publish: update => updates.push(update) });
    const initial = await list(service), row = initial.notes[0], before = f.read();
    for (const patch of [{ colorMode: 'sepia' }, { note: null }, {}, { colorMode: 1 }]) await rejects(edit(service, row, patch), 'INVALID_REQUEST');
    const unchanged = await edit(service, row, { note: row.record.payload.note, colorMode: 'dark' });
    assert.equal(unchanged.revision, initial.revision);
    assert.equal(unchanged.note.revision, row.revision);
    assert.equal(f.read(), before);
    assert.deepEqual(updates, []);
});

test('old batch fingerprints retain corrected and newer notes while exact deletions stay absent', async t => {
    const f = fixture(t, [note('correct me'), note('delete me'), note('complete me')]), service = f.service();
    beginBatch(f.dir);
    const snapshot = await list(service);
    await edit(service, snapshot.notes[0], { note: 'corrected', colorMode: 'light' });
    await remove(service, snapshot.notes[1]);
    await add(service, note('arrived later'));
    await service.flush();
    fs.writeFileSync(path.join(f.dir, 'stopped.json'), '{}\n');
    assert.deepEqual(finishBatch(f.dir), { removed: 1, pending: 2 });
    const afterFinish = await list(service);
    assert.deepEqual(afterFinish.notes.map(row => row.record.payload.note), ['corrected', 'arrived later']);
    assert.equal(afterFinish.notes[0].id, snapshot.notes[0].id);
    await add(service, note('after off-state cleanup'));
    assert.deepEqual((await list(service)).notes.map(row => row.record.payload.note), ['corrected', 'arrived later', 'after off-state cleanup']);
    assert.doesNotMatch(f.read(), /delete me|complete me/);
});

test('external cleanup resets legacy handles and a later append cannot resurrect cached notes', async t => {
    const a = note('completed'), b = note('keep legacy');
    const f = fixture(t, [a, b]), service = f.service(), initial = await list(service);
    new AnnotationSelectionStore(f.file).completeBatch([selectionFingerprint(a)]);
    await rejects(edit(service, initial.notes[1], { note: 'stale legacy editor' }), 'CONFLICT');
    const refreshed = await list(service);
    assert.notEqual(refreshed.revision, initial.revision);
    assert.notEqual(refreshed.notes[0].id, initial.notes[1].id);
    await add(service, note('new record'));
    assert.deepEqual((await list(service)).notes.map(row => row.record.payload.note), ['keep legacy', 'new record']);
    assert.doesNotMatch(f.read(), /completed|stale legacy editor/);
});

test('lost acknowledgement retry returns the same persisted operation across timestamp/order changes and restart', async t => {
    const f = fixture(t), service = f.service(), original = note('one operation');
    original.timestamp = 'first receive time'; original.payload.saveRequestId = 'stable-draft-id'; original.payload.saveAttemptId = 'first-attempt';
    const first = await add(service, original), before = f.read();
    const retry = { ...original, timestamp: 'retry receive time', payload: { ...original.payload, saveAttemptId: 'new-attempt' } };
    const same = await add(service, retry);
    assert.equal(same.note.id, first.note.id); assert.equal(same.note.revision, first.note.revision);
    assert.deepEqual(same.changes, []); assert.equal(f.read(), before);
    const restarted = await add(f.service(), retry);
    assert.equal(restarted.note.id, first.note.id); assert.equal(f.read(), before);
    assert.equal((await list(service)).notes.length, 1);
});

test('same save operation cannot overwrite different content or an edited revision', async t => {
    const f = fixture(t), service = f.service(), original = note('original');
    original.payload.saveRequestId = 'stable-id';
    const first = await add(service, original);
    await rejects(add(service, { ...original, payload: { ...original.payload, note: 'different draft' } }), 'CONFLICT');
    await edit(service, first.note, { colorMode: 'light' });
    await rejects(add(service, original), 'CONFLICT');
    assert.equal((await list(service)).notes.length, 1);
    assert.equal((await list(service)).notes[0].record.colorMode, 'light');
});

test('late operation retry cannot recreate a row deleted or batch-completed in the same service epoch', async t => {
    const f = fixture(t), service = f.service(), original = note('delete this');
    original.payload.saveRequestId = 'deleted-operation';
    const first = await add(service, original); await remove(service, first.note);
    await rejects(add(service, original), 'CONFLICT'); assert.equal(f.read(), '');
    const completed = note('complete this'); completed.payload.saveRequestId = 'completed-operation';
    const added = await add(service, completed);
    new AnnotationSelectionStore(f.file).completeBatch([selectionFingerprint(added.note.record)]);
    await rejects(add(service, completed), 'CONFLICT'); assert.equal(f.read(), '');
});
