// Standalone browser-local note store. This module is not wired into the
// active JSONL recorder; callers opt in by importing this API explicitly.
export const KEY = 'atoms.annotator.notes.v1';
export const MAX_RECORDS = 500;
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_NOTE_LENGTH = 800;
export const CHANGE_EVENT = 'atoms-annotation-store-changed';

const LIMITS = Object.freeze({ route: 1024, windowId: 512, selector: 4096, context: 8192 });

export class AnnotationStoreError extends Error {
	constructor(code, message) {
		super(message);
		this.name = 'AnnotationStoreError';
		this.code = code;
	}
}

const fail = (code, message) => { throw new AnnotationStoreError(code, message); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const cloneJson = value => {
	try { return JSON.parse(JSON.stringify(value)); }
	catch (_) { fail('invalid', 'Annotation data must be JSON-compatible.'); }
};

function validString(value, name, max, { empty = false } = {}) {
	if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) {
		fail('invalid', `Annotation ${name} must be ${empty ? 'a string' : 'a non-empty string'} of at most ${max} characters.`);
	}
	return value;
}

function normalizeRecord(value, { imported = false } = {}) {
	if (!isObject(value)) fail('invalid', 'Annotation record must be an object.');
	const source = cloneJson(value);
	const id = source.id;
	if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) {
		fail('invalid', 'Annotation record needs a stable ID of at most 128 safe characters.');
	}
	const ts = Number(source.ts);
	if (!Number.isFinite(ts) || ts <= 0) fail('invalid', 'Annotation timestamp must be a positive finite number.');
	const record = {
		...source,
		id,
		ts,
		route: validString(source.route, 'route', LIMITS.route),
		windowId: validString(source.windowId ?? (imported ? 'legacy:unknown' : undefined), 'window identity', LIMITS.windowId),
		selector: validString(source.selector, 'selector', LIMITS.selector),
		context: validString(source.context, 'context', LIMITS.context),
		note: validString(source.note, 'note', MAX_NOTE_LENGTH, { empty: true }),
		colorMode: source.colorMode === 'dark' || source.colorMode === 'light' ? source.colorMode : null,
		status: source.status === 'done' ? 'done' : 'open',
	};
	if (record.saveRequestId !== undefined && (typeof record.saveRequestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(record.saveRequestId))) {
		fail('invalid', 'Annotation save request ID must be at most 128 safe characters.');
	}
	if (!imported && record.colorMode === null) fail('invalid', 'New annotations must capture dark or light color mode.');
	return record;
}

function sameAuthoredRequest(left, right) {
	return ['route', 'windowId', 'selector', 'context', 'colorMode', 'note', 'selectionId']
		.every(field => left[field] === right[field]);
}

function makeId(cryptoObject) {
	if (typeof cryptoObject?.randomUUID === 'function') return `atoms-${cryptoObject.randomUUID()}`;
	if (typeof cryptoObject?.getRandomValues === 'function') {
		const bytes = new Uint8Array(16);
		cryptoObject.getRandomValues(bytes);
		bytes[6] = (bytes[6] & 0x0f) | 0x40;
		bytes[8] = (bytes[8] & 0x3f) | 0x80;
		const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
		return `atoms-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	}
	fail('unavailable', 'This page does not provide a secure ID generator.');
}

const canonicalJson = value => {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
	return JSON.stringify(value);
};

// Deterministic import IDs are not security tokens; exact-content conflict
// checks prevent a hash collision from replacing another note.
function legacyId(record) {
	const sourceId = record.__atomsNote?.id;
	const identity = typeof sourceId === 'string' && sourceId ? { sourceId } : { record };
	const text = canonicalJson(identity);
	const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
	const hashes = seeds.map((seed, index) => {
		let hash = seed >>> 0;
		for (let i = 0; i < text.length; i++) {
			hash ^= text.charCodeAt(i) + index;
			hash = Math.imul(hash, 0x01000193 + (index * 2));
			hash ^= hash >>> (13 + index);
		}
		return (hash >>> 0).toString(16).padStart(8, '0');
	});
	return `atoms-legacy-${hashes.join('')}`;
}

function legacyRoute(record) {
	if (typeof record.route === 'string' && record.route) return record.route;
	const value = record.url || record.target?.urlAtAttach || record.target?.url;
	try {
		const url = new URL(value);
		return `${url.host}${url.pathname}` || url.host;
	} catch (_) {
		return record.title || record.target?.titleAtAttach || record.target?.title || 'legacy:unknown-route';
	}
}

function activeLegacyRows(records) {
	const active = [];
	const keyFor = record => {
		const payload = record.payload || {};
		if (payload.selectionId) return `selection:${payload.selectionId}`;
		return JSON.stringify([record.target?.id, record.url, payload.asset?.id]);
	};
	for (const record of records) {
		if (!isObject(record)) fail('invalid', 'Legacy annotation records must be objects.');
		if (record.payload?.selected === false) {
			const key = keyFor(record);
			for (let index = active.length - 1; index >= 0; index--) if (keyFor(active[index]) === key) active.splice(index, 1);
		} else active.push(record);
	}
	return active;
}

/**
 * Create an isolated annotation store.
 *
 * `add` accepts {route, windowId, selector, context, note, colorMode} plus
 * optional JSON metadata and stable `saveRequestId`/`selectionId`. Repeating a
 * request token with the same authored fields returns the original record;
 * changed authored fields conflict. `list` returns oldest-first copies. `update` accepts
 * note/colorMode/status patches; `remove` deletes by exact ID. `import` accepts
 * a JSON array or {records:[...]}; it only adds new IDs and rejects conflicting
	 * IDs, so import never silently replaces existing notes. `importLegacy(records)`
	 * adapts existing ATOMS JSONL rows without modifying their source file.
	 * `onChange` subscribes to same-window writes and cross-window storage events.
 */
export function createAnnotationStore({
	storage = globalThis.localStorage,
	eventTarget = globalThis.window,
	cryptoObject = globalThis.crypto,
	now = () => Date.now(),
	idFactory = () => makeId(cryptoObject),
	key = KEY,
	maxRecords = MAX_RECORDS,
	maxBytes = MAX_BYTES,
} = {}) {
	if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
		fail('unavailable', 'Browser storage is unavailable for this page.');
	}
	if (typeof key !== 'string' || !key.startsWith('atoms.annotator.')) fail('invalid', 'Annotation store key must use the ATOMS namespace.');
	const listeners = new Set();
	let storageListener = null;

	const notify = () => {
		const records = list();
		for (const listener of listeners) {
			try { listener(records); } catch (error) { globalThis.console?.error?.('[ATOMS annotation store] listener failed', error); }
		}
		if (eventTarget?.dispatchEvent && typeof globalThis.CustomEvent === 'function') {
			eventTarget.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { records } }));
		}
	};
	const load = () => {
		let raw;
		try { raw = storage.getItem(key); }
		catch (_) { fail('unavailable', 'Browser storage is blocked for this page.'); }
		if (raw == null || raw === '') return { seq: 0, records: [] };
		let data;
		try { data = JSON.parse(raw); }
		catch (_) { fail('corrupt', `Stored annotations under ${key} are unreadable; nothing was overwritten.`); }
		if (!isObject(data) || !Array.isArray(data.records) || !Number.isSafeInteger(data.seq) || data.seq < 0) {
			fail('corrupt', `Stored annotations under ${key} have an invalid shape; nothing was overwritten.`);
		}
		if (data.records.length > maxRecords) fail('corrupt', 'Stored annotations exceed the configured record limit; nothing was overwritten.');
		let records;
		try { records = data.records.map(record => normalizeRecord(record, { imported: true })); }
		catch (_) { fail('corrupt', `Stored annotations under ${key} contain an invalid record; nothing was overwritten.`); }
		const ids = new Set();
		for (const record of records) {
			if (ids.has(record.id)) fail('corrupt', 'Stored annotations contain duplicate IDs; nothing was overwritten.');
			ids.add(record.id);
		}
		return { seq: data.seq, records };
	};
	const write = data => {
		if (data.records.length > maxRecords) fail('full', `Annotation store is limited to ${maxRecords} records.`);
		const text = JSON.stringify(data);
		if (new TextEncoder().encode(text).length > maxBytes) fail('too-big', `Annotation store would exceed ${maxBytes} bytes.`);
		try { storage.setItem(key, text); }
		catch (_) { fail('quota', 'The browser refused to save the annotation; existing notes were left unchanged.'); }
		notify();
	};
	const list = (filter = {}) => {
		if (!isObject(filter)) fail('invalid', 'Annotation list filter must be an object.');
		return load().records.filter(record =>
			(filter.route === undefined || record.route === filter.route) &&
			(filter.windowId === undefined || record.windowId === filter.windowId) &&
			(filter.status === undefined || record.status === filter.status))
			.map(record => cloneJson(record));
	};
	const onChange = listener => {
		if (typeof listener !== 'function') fail('invalid', 'Annotation change listener must be a function.');
		listeners.add(listener);
		if (!storageListener && eventTarget?.addEventListener) {
			storageListener = event => { if (event.key === key || event.key === null) notify(); };
			eventTarget.addEventListener('storage', storageListener);
		}
		return () => {
			listeners.delete(listener);
			if (!listeners.size && storageListener) {
				eventTarget.removeEventListener?.('storage', storageListener);
				storageListener = null;
			}
		};
	};

	return Object.freeze({
		key,
		list,
		add(input) {
			if (!isObject(input)) fail('invalid', 'Annotation input must be an object.');
			const data = load();
			const authored = cloneJson(input);
			const matches = authored.saveRequestId
				? data.records.filter(saved => saved.saveRequestId === authored.saveRequestId) : [];
			if (matches.length > 1) fail('conflict', 'Annotation save request ID is already associated with multiple records.');
			const prior = matches[0];
			const record = normalizeRecord({ ...authored, id: prior?.id || idFactory(), ts: prior?.ts || now(), status: 'open' });
			if (prior) {
				if (!sameAuthoredRequest(prior, record)) fail('conflict', 'Annotation save request ID was reused with different authored content.');
				return cloneJson(prior);
			}
			if (data.records.some(saved => saved.id === record.id)) fail('conflict', 'Generated annotation ID already exists.');
			data.seq++;
			data.records.push(record);
			write(data);
			return cloneJson(record);
		},
		update(id, patch) {
			if (typeof id !== 'string' || !isObject(patch)) fail('invalid', 'Annotation update needs an ID and patch object.');
			if (Object.keys(patch).some(name => !['note', 'colorMode', 'status'].includes(name))) fail('invalid', 'Only note, colorMode and status can be edited.');
			const data = load(), index = data.records.findIndex(record => record.id === id);
			if (index < 0) fail('missing', `No annotation with ID ${id}.`);
			const next = { ...data.records[index], ...cloneJson(patch) };
			if (patch.note !== undefined) validString(patch.note, 'note', MAX_NOTE_LENGTH, { empty: true });
			if (patch.colorMode !== undefined && patch.colorMode !== 'dark' && patch.colorMode !== 'light') fail('invalid', 'Color mode must be dark or light.');
			if (patch.status !== undefined && patch.status !== 'open' && patch.status !== 'done') fail('invalid', 'Status must be open or done.');
			data.records[index] = normalizeRecord(next, { imported: true });
			write(data);
			return cloneJson(data.records[index]);
		},
		remove(id) {
			if (typeof id !== 'string') fail('invalid', 'Annotation ID must be a string.');
			const data = load(), next = data.records.filter(record => record.id !== id);
			if (next.length === data.records.length) fail('missing', `No annotation with ID ${id}.`);
			data.records = next;
			write(data);
			return { removed: 1, id };
		},
		import(input) {
			let parsed = input;
			if (typeof input === 'string') {
				try { parsed = JSON.parse(input); }
				catch (_) { fail('invalid', 'Annotation import must be valid JSON.'); }
			}
			const incoming = Array.isArray(parsed) ? parsed : isObject(parsed) && Array.isArray(parsed.records) ? parsed.records : null;
			if (!incoming) fail('invalid', 'Annotation import must be an array or an object with a records array.');
			const additions = incoming.map(record => normalizeRecord(record, { imported: true }));
			const ids = new Map();
			const requestIds = new Map();
			for (const record of additions) {
				const prior = ids.get(record.id);
				if (prior && JSON.stringify(prior) !== JSON.stringify(record)) fail('conflict', `Import contains conflicting annotation ID ${record.id}.`);
				ids.set(record.id, record);
				if (record.saveRequestId) {
					const requestPrior = requestIds.get(record.saveRequestId);
					if (requestPrior && requestPrior.id !== record.id) fail('conflict', 'Import associates one save request ID with multiple records.');
					requestIds.set(record.saveRequestId, record);
				}
			}
			const data = load(), existing = new Map(data.records.map(record => [record.id, record]));
			const existingRequests = new Map(data.records.filter(record => record.saveRequestId).map(record => [record.saveRequestId, record]));
			const newRecords = [];
			for (const record of ids.values()) {
				const prior = existing.get(record.id);
				if (prior) {
					if (JSON.stringify(prior) !== JSON.stringify(record)) fail('conflict', `Annotation ID ${record.id} already exists with different content.`);
				} else {
					const requestPrior = record.saveRequestId && existingRequests.get(record.saveRequestId);
					if (requestPrior && requestPrior.id !== record.id) fail('conflict', 'Save request ID already belongs to a different annotation.');
					newRecords.push(record);
				}
			}
			if (!newRecords.length) return { added: 0, records: list() };
			data.records.push(...newRecords);
			data.seq += newRecords.length;
			write(data);
			return { added: newRecords.length, records: list() };
		},
		importLegacy(input) {
			const rows = Array.isArray(input) ? input : isObject(input) && Array.isArray(input.records) ? input.records : null;
			if (!rows) fail('invalid', 'Legacy import must be an array of recorder rows.');
			const additions = activeLegacyRows(cloneJson(rows)).map(original => {
				const payload = isObject(original.payload) ? original.payload : {};
				const asset = isObject(payload.asset) ? payload.asset : {};
				const target = isObject(original.target) ? original.target : {};
				const mode = original.colorMode === 'dark' || original.colorMode === 'light' ? original.colorMode :
					(payload.colorMode === 'dark' || payload.colorMode === 'light' ? payload.colorMode : null);
				const timestamp = Number.isFinite(Number(original.ts)) && Number(original.ts) > 0 ? Number(original.ts) : Date.parse(original.timestamp);
				if (!Number.isFinite(timestamp) || timestamp <= 0) fail('invalid', 'Legacy annotation is missing a valid timestamp.');
				const windowId = original.windowId || original.window?.name || target.windowId || target.name || target.id ||
					target.titleAtAttach || target.title || original.title || `legacy:${legacyRoute(original)}`;
				const selector = asset.selector || original.selector;
				const context = asset.context || original.context || selector;
				const note = typeof payload.note === 'string' ? payload.note : (typeof original.note === 'string' ? original.note : '');
				return normalizeRecord({
					id: legacyId(original), ts: timestamp, route: legacyRoute(original), windowId: String(windowId),
					selector, context, note, colorMode: mode, status: 'open',
					...(typeof payload.saveRequestId === 'string' ? { saveRequestId: payload.saveRequestId } : {}),
					...(typeof payload.selectionId === 'string' ? { selectionId: payload.selectionId } : {}),
					legacyRecord: original,
				}, { imported: true });
			});
			return this.import(additions);
		},
		onChange,
		usage() {
			const data = load(), text = JSON.stringify(data);
			return { count: data.records.length, max: maxRecords, bytes: new TextEncoder().encode(text).length, maxBytes };
		},
	});
}

let defaultStore;
const getDefaultStore = () => (defaultStore ||= createAnnotationStore());
// Lazy so importing this module in Node tooling has no browser-storage side effects.
export const annotationStore = Object.freeze({
	key: KEY,
	...Object.fromEntries(['list', 'add', 'update', 'remove', 'import', 'importLegacy', 'onChange', 'usage']
		.map(name => [name, (...args) => getDefaultStore()[name](...args)])),
});
