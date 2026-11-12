import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnnotationStore, KEY, MAX_BYTES, AnnotationStoreError } from '../js/annotation/store.js';

class Storage {
	constructor(initial = null) { this.data = new Map(initial === null ? [] : [[KEY, initial]]); this.failWrite = false; }
	getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
	setItem(key, value) { if (this.failWrite) throw Error('quota'); this.data.set(key, String(value)); }
}
class Events {
	constructor() { this.listeners = new Map(); this.events = []; }
	addEventListener(type, fn) { const set = this.listeners.get(type) || new Set(); set.add(fn); this.listeners.set(type, set); }
	removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
	dispatchEvent(event) { this.events.push(event); for (const fn of this.listeners.get(event.type) || []) fn(event); return true; }
}
const base = (extra = {}) => ({ route: 'store.steampowered.com/app/1', windowId: 'SP Desktop_uid0', selector: 'div.tile',
	context: 'main > div:nth-child(2) > div.tile:nth-child(1)', note: 'Fix contrast', colorMode: 'light', ...extra });
const fixture = (options = {}) => {
	const storage = options.storage || new Storage(), eventTarget = options.eventTarget || new Events(), ids = [...(options.ids || ['atoms-a', 'atoms-b', 'atoms-c'])];
	const store = createAnnotationStore({ storage, eventTarget, now: () => 1730000000000, idFactory: () => ids.shift() || 'atoms-overflow', ...options });
	return { store, storage, eventTarget };
};
const errorCode = code => error => error instanceof AnnotationStoreError && error.code === code;

test('standalone store records precise page/window/selector/context, timestamp and palette without touching other keys', () => {
	const f = fixture(), note = f.store.add(base({ vendor: { arbitrary: [1, 'x'] } }));
	assert.equal(note.id, 'atoms-a'); assert.equal(note.ts, 1730000000000); assert.equal(note.route, base().route);
	assert.equal(note.windowId, 'SP Desktop_uid0'); assert.equal(note.selector, 'div.tile'); assert.equal(note.context, base().context);
	assert.equal(note.colorMode, 'light'); assert.deepEqual(note.vendor, { arbitrary: [1, 'x'] });
	assert.deepEqual([...f.storage.data.keys()], [KEY]);
	assert.equal(f.store.list()[0].note, 'Fix contrast');
});

test('list filters and edits preserve unknown imported metadata; remove addresses exact ID', () => {
	const f = fixture();
	const a = f.store.add(base({ route: '/library/home', windowId: 'SP Desktop_uid0' }));
	const b = f.store.add(base({ route: 'steamcommunity.com/groups', windowId: 'Friends_uid4', colorMode: 'dark' }));
	assert.deepEqual(f.store.list({ windowId: 'SP Desktop_uid0' }).map(row => row.id), ['atoms-a']);
	assert.deepEqual(f.store.list({ route: 'steamcommunity.com/groups' }).map(row => row.id), ['atoms-b']);
	const imported = { ...base({ id: 'legacy-9', ts: 1700000000000, colorMode: 'dark', custom: { keep: true }, futureField: 'preserved' }) };
	f.store.import({ records: [imported] });
	const edited = f.store.update('legacy-9', { note: 'Changed', colorMode: 'light', status: 'done' });
	assert.deepEqual(edited.custom, { keep: true }); assert.equal(edited.futureField, 'preserved');
	assert.equal(edited.note, 'Changed'); assert.equal(edited.colorMode, 'light'); assert.equal(edited.status, 'done');
	assert.deepEqual(f.store.remove(a.id), { removed: 1, id: 'atoms-a' });
	assert.deepEqual(f.store.list().map(row => row.id), ['atoms-b', 'legacy-9']);
	assert.throws(() => f.store.remove(a.id), errorCode('missing'));
});

test('corrupt storage and malformed records fail closed without rewriting bytes', () => {
	for (const raw of ['{broken', JSON.stringify({ seq: 0, records: [{ nope: true }] }), JSON.stringify({ seq: 'bad', records: [] })]) {
		const storage = new Storage(raw), f = fixture({ storage });
		assert.throws(() => f.store.add(base()), error => error instanceof AnnotationStoreError);
		assert.equal(storage.getItem(KEY), raw);
	}
});

test('quota and size/record limits reject the attempted write while preserving saved data', () => {
	const f = fixture({ maxRecords: 1 });
	const first = f.store.add(base()), before = f.storage.getItem(KEY);
	assert.throws(() => f.store.add(base({ note: 'second' })), errorCode('full'));
	assert.equal(f.storage.getItem(KEY), before);
	const quota = fixture(); quota.store.add(base()); const saved = quota.storage.getItem(KEY); quota.storage.failWrite = true;
	assert.throws(() => quota.store.add(base()), errorCode('quota')); assert.equal(quota.storage.getItem(KEY), saved);
	const oversized = fixture({ maxBytes: 128 });
	assert.throws(() => oversized.store.add(base()), errorCode('too-big'));
	assert.equal(oversized.storage.getItem(KEY), null);
	assert.equal(MAX_BYTES, 2 * 1024 * 1024);
});

test('new notes validate palette and bounded fields; invalid import is transactional', () => {
	const f = fixture();
	assert.throws(() => f.store.add(base({ colorMode: 'sepia' })), errorCode('invalid'));
	assert.throws(() => f.store.add(base({ note: 'n'.repeat(801) })), errorCode('invalid'));
	const before = f.storage.getItem(KEY);
	assert.throws(() => f.store.import([base({ id: 'same', ts: 1700000000000 }), base({ id: 'same', ts: 1700000000001 })]), errorCode('conflict'));
	assert.equal(f.storage.getItem(KEY), before);
	assert.throws(() => f.store.update('missing', { route: '/elsewhere' }), errorCode('invalid'));
});

test('stable saveRequestId retries return original record and changed authored data conflicts', () => {
	const moments = [1730000000000, 1730000009000, 1730000018000];
	const f = fixture({ now: () => moments.shift() });
	const authored = base({ saveRequestId: 'request-9', selectionId: 'selection-9' });
	const first = f.store.add(authored), beforeRetry = f.storage.getItem(KEY);
	const retry = f.store.add({ ...authored });
	assert.equal(retry.id, first.id); assert.equal(retry.ts, first.ts);
	assert.equal(f.storage.getItem(KEY), beforeRetry); assert.equal(f.store.list().length, 1);
	assert.equal(retry.saveRequestId, 'request-9'); assert.equal(retry.selectionId, 'selection-9');
	assert.throws(() => f.store.add({ ...authored, note: 'Changed note' }), errorCode('conflict'));
	assert.throws(() => f.store.add({ ...authored, selectionId: 'different-selection' }), errorCode('conflict'));
	assert.throws(() => f.store.import([
		{ ...base({ id: 'import-a', ts: 1730000000000, saveRequestId: 'shared-request', selectionId: 'selection-9' }) },
		{ ...base({ id: 'import-b', ts: 1730000000000, saveRequestId: 'shared-request', selectionId: 'selection-9' }) },
	]), errorCode('conflict'));
	assert.equal(f.storage.getItem(KEY), beforeRetry); assert.equal(f.store.list()[0].note, authored.note);
});

test('import is additive and idempotent; conflicting IDs never overwrite existing notes', () => {
	const f = fixture();
	const imported = { ...base({ id: 'imported-1', ts: 1700000000000, extra: { opaque: true } }) };
	assert.equal(f.store.import(JSON.stringify({ records: [imported] })).added, 1);
	assert.equal(f.store.import([imported]).added, 0);
	assert.deepEqual(f.store.list()[0].extra, { opaque: true });
	assert.throws(() => f.store.import([{ ...imported, note: 'replacement' }]), errorCode('conflict'));
	assert.equal(f.store.list()[0].note, imported.note);
});

test('LCARS-shaped legacy notes import safely without invented capture mode', () => {
	const f = fixture();
	const legacy = { id: '12-abcde', ts: 1730000000001, route: 'steamcommunity.com/app/1', selector: 'button.save',
		context: 'main > button.save:nth-child(2)', note: 'LCARS note', status: 'open', custom: { source: 'LCARSv2' } };
	assert.equal(f.store.import([legacy]).added, 1);
	const imported = f.store.list()[0];
	assert.equal(imported.windowId, 'legacy:unknown'); assert.equal(imported.colorMode, null);
	assert.deepEqual(imported.custom, { source: 'LCARSv2' }); assert.equal(imported.note, 'LCARS note');
});

test('ATOMS JSONL legacy adapter preserves original row identity, metadata, route and both color modes', () => {
	const f = fixture();
	const old = {
		timestamp: '2026-10-30T12:00:00.000Z', type: 'selection', colorMode: 'light',
		target: { id: 'cdp-target-1', titleAtAttach: 'Steam Store', urlAtAttach: 'https://store.steampowered.com/app/42/' },
		url: 'https://store.steampowered.com/app/42/', title: 'Store', customTop: { retained: [1, 2] },
		payload: { selected: true, colorMode: 'light', selectionId: 'picked-light', saveRequestId: 'request-light', note: 'Check the light state',
			asset: { id: 'asset-hash', kind: 'element', selector: 'button.purchase', context: 'main > div:nth-child(2) > button.purchase:nth-child(1)', customAsset: 'keep' },
			customPayload: { keep: true } },
		__atomsNote: { version: 1, id: 'row-id-light', revision: 'revision-light', saveRequestId: 'request-light', arbitrary: 'preserve' },
	};
	const dark = { ...old, timestamp: '2026-10-30T12:01:00.000Z', colorMode: 'dark', title: 'Steam Friends',
		target: { id: 'cdp-target-2', titleAtAttach: 'Steam Friends', urlAtAttach: 'https://steamcommunity.com/groups/test' },
		url: 'https://steamcommunity.com/groups/test', __atomsNote: { version: 1, id: 'row-id-dark', revision: 'revision-dark' },
		payload: { ...old.payload, colorMode: 'dark', selectionId: 'picked-dark', saveRequestId: 'request-dark', note: 'Dark mode note' } };
	const before = JSON.stringify([old, dark]);
	const result = f.store.importLegacy([old, dark]);
	assert.equal(result.added, 2); assert.equal(JSON.stringify([old, dark]), before);
	const imported = f.store.list();
	assert.equal(imported[0].route, 'store.steampowered.com/app/42/');
	assert.equal(imported[0].windowId, 'cdp-target-1'); assert.equal(imported[0].selector, 'button.purchase');
	assert.equal(imported[0].context, old.payload.asset.context); assert.equal(imported[0].note, old.payload.note);
	assert.equal(imported[0].colorMode, 'light'); assert.equal(imported[0].ts, Date.parse(old.timestamp));
	assert.deepEqual(imported[0].legacyRecord, old);
	assert.deepEqual(imported[0].legacyRecord.__atomsNote, old.__atomsNote);
	assert.deepEqual(imported[0].legacyRecord.customTop, old.customTop);
	assert.deepEqual(imported[0].legacyRecord.payload.asset.customAsset, 'keep');
	assert.equal(imported[1].colorMode, 'dark'); assert.equal(imported[1].note, 'Dark mode note');
	assert.equal(imported[0].saveRequestId, 'request-light');
	const retry = f.store.add({ route: imported[0].route, windowId: imported[0].windowId, selector: imported[0].selector,
		context: imported[0].context, note: imported[0].note, colorMode: imported[0].colorMode,
		selectionId: imported[0].selectionId, saveRequestId: imported[0].saveRequestId });
	assert.equal(retry.id, imported[0].id);
});

test('ATOMS legacy import is deterministic/idempotent and rejects an entire conflicting batch', () => {
	const f = fixture();
	const row = { timestamp: '2026-10-30T12:00:00Z', type: 'selection', target: { id: 'target-x' },
		url: 'https://steamcommunity.com/groups/a', colorMode: 'dark',
		payload: { selected: true, colorMode: 'dark', selectionId: 'selection-x', note: 'Keep me',
			asset: { id: 'asset-x', selector: 'a.link', context: 'main > a.link:nth-child(1)' } },
		__atomsNote: { version: 1, id: 'stable-row', revision: 'r1' }, extra: { nested: { opaque: true } } };
	const first = f.store.importLegacy([row]); const storedBefore = f.storage.getItem(KEY);
	const id = first.records[0].id;
	assert.equal(f.store.importLegacy([row]).added, 0); assert.equal(f.store.list()[0].id, id);
	const unrelated = { ...row, __atomsNote: { version: 1, id: 'another-row', revision: 'r1' }, payload: { ...row.payload, selectionId: 'other', note: 'Would add' } };
	const conflict = { ...row, payload: { ...row.payload, note: 'Conflicting rewrite' } };
	assert.throws(() => f.store.importLegacy([unrelated, conflict]), errorCode('conflict'));
	assert.equal(f.storage.getItem(KEY), storedBefore); assert.equal(f.store.list().length, 1);
	assert.deepEqual(f.store.list()[0].legacyRecord.extra, row.extra);
});

test('same-window subscriptions and cross-window storage events receive fresh copies', () => {
	const f = fixture(), updates = [];
	const unsubscribe = f.store.onChange(rows => updates.push(rows));
	f.store.add(base());
	assert.equal(updates.length, 1); assert.equal(updates[0][0].id, 'atoms-a');
	assert.equal(f.eventTarget.events.at(-1).type, 'atoms-annotation-store-changed');
	for (const listener of f.eventTarget.listeners.get('storage')) listener({ key: KEY });
	assert.equal(updates.length, 2); updates[1][0].note = 'mutated caller copy';
	assert.equal(f.store.list()[0].note, 'Fix contrast');
	unsubscribe(); assert.equal(f.eventTarget.listeners.get('storage').size, 0);
});

test('storage errors are surfaced without exposing raw stored note contents', () => {
	const storage = new Storage(); storage.getItem = () => { throw Error('private browser error'); };
	const f = fixture({ storage });
	assert.throws(() => f.store.list(), error => error.code === 'unavailable' && !error.message.includes('private browser error'));
});
