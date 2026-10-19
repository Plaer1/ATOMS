'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { beginBatch, batchStatus, finishBatch } = require('./annotation-batch');
const { AnnotationSelectionStore, selectionFingerprint } = require('./annotation-selection-store');

const note = text => ({ type: 'selection', payload: { selected: true, selectionId: text, note: text } });
function fixture(t, records) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atoms-batch-test-'));
    t.after(() => fs.rmSync(dir, { recursive: true }));
    const file = path.join(dir, 'selected-assets.jsonl');
    const manifest = path.join(dir, 'annotation-batch.json');
    fs.writeFileSync(file, records.map(row => JSON.stringify(row) + '\n').join(''));
    const stop = () => fs.writeFileSync(path.join(dir, 'stopped.json'), '{}\n');
    return { dir, file, manifest, stop, read: () => fs.readFileSync(file, 'utf8') };
}

test('begin stores only exact hashes and refuses to replace an existing batch', t => {
    const f = fixture(t, [note('private note text')]);
    assert.deepEqual(beginBatch(f.dir), { batch: 1, pending: 1 });
    const manifest = fs.readFileSync(f.manifest, 'utf8');
    assert.doesNotMatch(manifest, /private note text|payload|selector/);
    assert.deepEqual(JSON.parse(manifest).fingerprints, [selectionFingerprint(note('private note text'))]);
    assert.throws(() => beginBatch(f.dir), { code: 'EEXIST' });
    assert.equal(fs.readFileSync(f.manifest, 'utf8'), manifest);
});

test('finish refuses to mutate a capture that has not stopped', t => {
    const f = fixture(t, [note('pending')]);
    beginBatch(f.dir);
    const before = f.read();
    assert.throws(() => finishBatch(f.dir), /Stop the annotator/);
    assert.equal(f.read(), before);
    assert.equal(fs.existsSync(f.manifest), true);
});

test('closeout removes completed notes but preserves deferred items and later arrivals', t => {
    const done = note('finished'), deferred = note('needs approval'), later = note('arrived later');
    const f = fixture(t, [done, deferred]);
    beginBatch(f.dir);
    new AnnotationSelectionStore(f.file).record(later);
    assert.deepEqual(batchStatus(f.dir), { batch: 2, pending: 3 });
    f.stop();
    assert.deepEqual(finishBatch(f.dir, [selectionFingerprint(deferred)]), { removed: 1, pending: 2 });
    assert.equal(f.read(), [deferred, later].map(row => JSON.stringify(row) + '\n').join(''));
    assert.deepEqual(fs.readdirSync(f.dir).sort(), ['selected-assets.jsonl', 'stopped.json']);
});

test('a note withdrawn since the snapshot is not restored at closeout', t => {
    const withdrawn = note('withdrawn'), done = note('finished');
    const f = fixture(t, [withdrawn, done]);
    beginBatch(f.dir);
    new AnnotationSelectionStore(f.file).record({ ...withdrawn, payload: { ...withdrawn.payload, selected: false } });
    f.stop();
    assert.deepEqual(finishBatch(f.dir), { removed: 1, pending: 0 });
    assert.equal(f.read(), '');
});

test('unknown deferred key or malformed manifest leaves the pending file untouched', t => {
    const f = fixture(t, [note('pending')]);
    beginBatch(f.dir);
    f.stop();
    const before = f.read();
    assert.throws(() => finishBatch(f.dir, ['a'.repeat(64)]), /not in this batch/);
    assert.equal(f.read(), before);
    fs.writeFileSync(f.manifest, '{"version":1,"fingerprints":["bad"]}\n');
    assert.throws(() => finishBatch(f.dir), /Invalid annotation batch/);
    assert.equal(f.read(), before);
});

test('one-shot CLI closes a stopped batch and reports zero pending records', t => {
    const f = fixture(t, [note('done')]);
    f.stop();
    const cli = path.join(__dirname, 'annotation-batch.js');
    for (const [command, expected] of [['begin', { batch: 1, pending: 1 }], ['finish', { removed: 1, pending: 0 }]]) {
        const result = spawnSync(process.execPath, [cli, command, f.dir], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), expected);
    }
    assert.equal(f.read(), '');
});
