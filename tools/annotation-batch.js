#!/usr/bin/env node
'use strict';

// One-shot batch bookkeeping; never connects to Steam or starts a recorder.
const fs = require('fs');
const path = require('path');
const { AnnotationSelectionStore, activeSelections, selectionFingerprint } = require('./annotation-selection-store');

const paths = directory => ({
    notes: path.join(directory, 'selected-assets.jsonl'),
    batch: path.join(directory, 'annotation-batch.json'),
    stopped: path.join(directory, 'stopped.json')
});
const readNotes = file => activeSelections(fs.readFileSync(file, 'utf8').split('\n').filter(line => line.trim()).map(JSON.parse));

function readBatch(file) {
    const batch = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (batch.version !== 1 || !Array.isArray(batch.fingerprints) ||
        batch.fingerprints.some(key => typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key))) {
        throw new Error('Invalid annotation batch; pending notes were not changed');
    }
    return batch;
}

function beginBatch(directory) {
    const files = paths(directory);
    const records = readNotes(files.notes);
    const batch = { version: 1, started: new Date().toISOString(), fingerprints: records.map(selectionFingerprint) };
    // Do not replace an interrupted batch. Resume it, or finish it first.
    fs.writeFileSync(files.batch, JSON.stringify(batch, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { batch: batch.fingerprints.length, pending: records.length };
}

function batchStatus(directory) {
    const files = paths(directory);
    const batch = readBatch(files.batch);
    return { batch: batch.fingerprints.length, pending: readNotes(files.notes).length };
}

function finishBatch(directory, keep = []) {
    const files = paths(directory);
    // Recorder startup removes this marker. Stopping capture is not itself
    // completion; finishing is an explicit step after fixes and verification.
    if (!fs.existsSync(files.stopped)) throw new Error('Stop the annotator before closing a batch');
    const batch = readBatch(files.batch);
    if (keep.some(key => !batch.fingerprints.includes(key))) throw new Error('Deferred annotation is not in this batch');
    const deferred = new Set(keep);
    const completed = batch.fingerprints.filter(key => !deferred.has(key));
    const store = new AnnotationSelectionStore(files.notes);
    const result = store.completeBatch(completed);
    // Only hashes were stored here; no note archive or completion tombstones.
    fs.unlinkSync(files.batch);
    return result;
}

if (require.main === module) {
    try {
        const [command, directory, ...args] = process.argv.slice(2);
        const keep = [];
        for (let i = 0; i < args.length; i += 2) {
            if (args[i] !== '--keep' || !args[i + 1]) throw new Error('Expected --keep FINGERPRINT');
            keep.push(args[i + 1]);
        }
        if (!directory || !['begin', 'status', 'finish'].includes(command) || (command !== 'finish' && keep.length)) {
            throw new Error('Usage: node tools/annotation-batch.js begin|status|finish CAPTURE_DIR [--keep FINGERPRINT ...]');
        }
        const result = command === 'begin' ? beginBatch(directory) :
            command === 'status' ? batchStatus(directory) : finishBatch(directory, keep);
        console.log(JSON.stringify(result));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { beginBatch, batchStatus, finishBatch };
