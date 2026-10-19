'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AnnotationSelectionStore, activeSelections, selectionFingerprint } = require('./annotation-selection-store');

const note = (text, { id = 'same-css', selected = true, url = 'https://steamcommunity.com/a', target = 'page', selectionId } = {}) => ({
    target: { id: target }, url, type: 'selection',
    payload: { selected, asset: { id }, note: text, ...(selectionId ? { selectionId } : {}) }
});

function fixture(t, records = []) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atoms-selection-test-'));
    t.after(() => fs.rmSync(dir, { recursive: true }));
    const file = path.join(dir, 'selected-assets.jsonl');
    fs.writeFileSync(file, records.map(r => JSON.stringify(r) + '\n').join(''));
    return { file, dir, read: () => fs.readFileSync(file, 'utf8'), store: () => new AnnotationSelectionStore(file) };
}

test('legacy unselect removes prior notes and the cancellation, not later reselections', () => {
    const rows = [note('withdrawn'), note('withdrawn correction'), note('', { selected: false }), note('current')];
    assert.deepEqual(activeSelections(rows), [rows[3]]);
});

test('legacy CSS hashes do not merge different pages or client targets', () => {
    const keepPage = note('other URL', { url: 'https://steamcommunity.com/b' });
    const keepTarget = note('other target', { target: 'other-page' });
    const rows = [note('delete'), keepPage, keepTarget, note('', { selected: false })];
    assert.deepEqual(activeSelections(rows), [keepPage, keepTarget]);
});

test('per-selection IDs distinguish identical selectors on the same page', () => {
    const keep = note('keep sibling', { selectionId: 'sibling' });
    const rows = [note('delete', { selectionId: 'picked' }), keep, note('', { selected: false, selectionId: 'picked' })];
    assert.deepEqual(activeSelections(rows), [keep]);
});

test('resume prunes legacy withdrawals from disk without backup or tombstones', t => {
    const keep = note('keep', { id: 'other' });
    const f = fixture(t, [note('withdrawn'), note('', { selected: false }), keep]);
    const store = f.store();
    assert.equal(store.prunedEvents, 2);
    assert.deepEqual(store.records, [keep]);
    assert.equal(f.read(), JSON.stringify(keep) + '\n');
    assert.deepEqual(fs.readdirSync(f.dir), ['selected-assets.jsonl']);
});

test('live delete and later append share the new file rather than a stale stream', t => {
    const f = fixture(t), store = f.store();
    store.record(note('remove me', { selectionId: 'one' }));
    store.record(note('keep me', { selectionId: 'two' }));
    assert.deepEqual(store.record(note('', { selected: false, selectionId: 'one' })), { removed: 1, saved: false });
    store.record(note('new note', { selectionId: 'three' }));
    assert.doesNotMatch(f.read(), /remove me|"selected":false/);
    assert.deepEqual(f.read().trim().split('\n').map(JSON.parse), store.records);
    assert.equal(store.records.length, 2);
});

test('malformed saved data is rejected without rewriting the file', t => {
    const f = fixture(t);
    fs.writeFileSync(f.file, '{broken JSON\n');
    assert.throws(() => f.store(), SyntaxError);
    assert.equal(f.read(), '{broken JSON\n');
});

test('failed atomic replacement preserves both old disk data and in-memory notes', t => {
    const original = note('must survive', { selectionId: 'one' });
    const f = fixture(t, [original]), store = f.store();
    const rename = fs.renameSync;
    fs.renameSync = () => { throw Error('simulated rename failure'); };
    try {
        assert.throws(() => store.record(note('', { selected: false, selectionId: 'one' })), /rename failure/);
    } finally { fs.renameSync = rename; }
    assert.equal(f.read(), JSON.stringify(original) + '\n');
    assert.deepEqual(store.records, [original]);
    assert.deepEqual(fs.readdirSync(f.dir), ['selected-assets.jsonl']);
});

test('completion removes exact reviewed records, not newer notes with the same selector and selection ID', t => {
    const completed = note('finished', { selectionId: 'one' });
    const later = note('new feedback', { selectionId: 'one' });
    const f = fixture(t, [completed, later]), store = f.store();
    assert.deepEqual(store.completeBatch([selectionFingerprint(completed)]), { removed: 1, pending: 1 });
    assert.deepEqual(store.records, [later]);
    assert.equal(f.read(), JSON.stringify(later) + '\n');
    assert.deepEqual(fs.readdirSync(f.dir), ['selected-assets.jsonl']);
});

test('completion treats repeated exact records as a multiset rather than deleting every match', t => {
    const repeated = note('same record');
    const f = fixture(t, [repeated, repeated]), store = f.store();
    assert.deepEqual(store.completeBatch([selectionFingerprint(repeated)]), { removed: 1, pending: 1 });
    assert.deepEqual(store.records, [repeated]);
});

test('completing all reviewed records leaves an empty file, no history or completion markers', t => {
    const records = [note('one'), note('two')];
    const f = fixture(t, records), store = f.store();
    assert.deepEqual(store.completeBatch(records.map(selectionFingerprint)), { removed: 2, pending: 0 });
    assert.equal(f.read(), '');
    assert.deepEqual(store.completeBatch(records.map(selectionFingerprint)), { removed: 0, pending: 0 });
});

test('failed completion preserves notes on disk and in memory', t => {
    const original = note('must survive');
    const f = fixture(t, [original]), store = f.store();
    const rename = fs.renameSync;
    fs.renameSync = () => { throw Error('simulated rename failure'); };
    try {
        assert.throws(() => store.completeBatch([selectionFingerprint(original)]), /rename failure/);
    } finally { fs.renameSync = rename; }
    assert.equal(f.read(), JSON.stringify(original) + '\n');
    assert.deepEqual(store.records, [original]);
    assert.deepEqual(fs.readdirSync(f.dir), ['selected-assets.jsonl']);
});

test('invalid completion keys are rejected without changing notes', t => {
    const f = fixture(t, [note('keep')]), store = f.store();
    const before = f.read();
    for (const value of [undefined, 'all', ['bad-key'], [null]]) {
        assert.throws(() => store.completeBatch(value), /SHA-256/);
        assert.equal(f.read(), before);
    }
});
