'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { activeRows, expressionFor, legacyId, migrate, parseArgs, parseJsonlText, validateResult } = require('./annotation-migrate-native.cjs');

const row = (extra = {}) => ({
    timestamp: '2026-10-30T12:00:00.000Z', type: 'selection', colorMode: 'dark',
    target: { id: 'target-a', titleAtAttach: 'Steam Store', urlAtAttach: 'https://store.steampowered.com/app/10/' },
    url: 'https://store.steampowered.com/app/10/',
    payload: { selectionId: 'selection-a', note: 'private note text', asset: { selector: '.tile', context: 'main > .tile' } },
    ...extra,
});

function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atoms-migration-'));
    const sourcePath = path.join(dir, 'selected-assets.jsonl');
    const records = [row(), row({ payload: { selectionId: 'selection-b', selected: false } })];
    fs.writeFileSync(sourcePath, `${records.map(JSON.stringify).join('\n')}\n`);
    return { dir, sourcePath, records };
}

test('JSONL parsing is strict, accepts a final newline, and rejects blank or malformed lines', () => {
    assert.deepEqual(parseJsonlText('{"id":1}\n'), [{ id: 1 }]);
    assert.throws(() => parseJsonlText('{"id":1}\n\n'), /Blank JSONL record/);
    assert.throws(() => parseJsonlText('{bad}\n'), /Malformed JSONL record/);
    assert.throws(() => parseJsonlText('[]'), /must be an object/);
    assert.equal(activeRows([row(), row({ payload: { selectionId: 'selection-a', selected: false } })]).length, 0);
});

test('argument parsing requires explicit source, endpoint and target; dry-run is opt-in', () => {
    assert.deepEqual(parseArgs(['--source', 'notes.jsonl', '--cdp', 'http://127.0.0.1:8080', '--target', 'abc', '--dry-run']), {
        sourcePath: 'notes.jsonl', endpoint: 'http://127.0.0.1:8080', targetId: 'abc', dryRun: true,
    });
    assert.throws(() => parseArgs(['--cdp', 'file:///tmp']), /HTTP or HTTPS/);
    assert.throws(() => parseArgs(['--source', 'x']), /Explicit/);
});

test('browser expression imports only through installed module and never emits note contents', () => {
    const expression = expressionFor([row()], false);
    assert.match(expression, /performance\.getEntriesByType/);
    assert.match(expression, /import\(moduleUrl\)/);
    assert.match(expression, /store\.importLegacy\(rows\)/);
    assert.doesNotMatch(expression, /console\.(?:log|error)|process\.stdout/);
    assert.match(expression, /private note text/); // Payload is sent to Steam for import, never printed by this helper.
    assert.match(expressionFor([row()], true), /dryRun:true/);
});

test('migration validates metadata/counts, repeats idempotently, and leaves source bytes intact', async () => {
    const f = fixture(), sourceBytes = fs.readFileSync(f.sourcePath);
    let writes = 0;
    const ids = [legacyId(f.records[0])];
    const connect = async () => ({
        async call(_method, options) {
            const dryRun = options.expression.includes('if(true)return');
            if (!dryRun) writes++;
            return { result: { value: {
                ok: true, dryRun, inputRows: 2, expectedRecords: 1, added: dryRun ? 0 : (writes === 1 ? 1 : 0),
                beforeCount: dryRun ? 0 : (writes === 1 ? 0 : 1), afterCount: dryRun || writes !== 1 ? (dryRun ? 0 : 1) : 1, ids: dryRun ? [] : ids,
                metadataVerified: true, preservedExisting: true,
            } } };
        }, close() {},
    });
    const args = { sourcePath: f.sourcePath, endpoint: 'http://127.0.0.1:8080', targetId: 'steam-page', connect };
    const first = await migrate(args), repeated = await migrate(args);
    assert.equal(first.added, 1); assert.equal(repeated.added, 0);
    assert.equal(writes, 2);
    assert.deepEqual(fs.readFileSync(f.sourcePath), sourceBytes);
});

test('migration refuses source changes during the operation and native verification failures', async () => {
    const f = fixture(); let call = 0;
    const changing = async () => ({
        async call() {
            call++;
            if (call === 2) fs.appendFileSync(f.sourcePath, '\n');
            return { result: { value: { ok: true, dryRun: true, inputRows: 2, expectedRecords: 1, added: 0, beforeCount: 0, afterCount: 0, ids: [], metadataVerified: true, preservedExisting: true } } };
        }, close() {},
    });
    await assert.rejects(migrate({ sourcePath: f.sourcePath, endpoint: 'http://127.0.0.1:8080', targetId: 'x', connect: changing }), /changed during/);
    const g = fixture();
    const unavailable = async () => ({ async call() { return { result: { value: { ok: false, reason: 'module-missing' } } }; }, close() {} });
    await assert.rejects(migrate({ sourcePath: g.sourcePath, endpoint: 'http://127.0.0.1:8080', targetId: 'x', connect: unavailable }), /module is unavailable/);
    assert.throws(() => validateResult({ ok: false }, [row()], false), /verification/);
});
