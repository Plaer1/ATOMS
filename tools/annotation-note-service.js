'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID, createHash } = require('crypto');
const { AnnotationSelectionStore, selectionKey } = require('./annotation-selection-store');

const META = '__atomsNote';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const modeOf = record => record.colorMode || record.payload?.colorMode;
const clone = value => JSON.parse(JSON.stringify(value));

class NoteServiceError extends Error {
    constructor(code, message) { super(message); this.code = code; }
}
const invalid = () => new NoteServiceError('INVALID_REQUEST', 'Invalid annotation note request');
const conflict = () => new NoteServiceError('CONFLICT', 'The saved note changed or is no longer available; reload the notes');
const storageError = () => new NoteServiceError('STORAGE_ERROR', 'Annotation notes could not be read or saved');

function metadata(record) {
    const value = record[META];
    return object(value) && value.version === 1 && typeof value.id === 'string' && value.id.length > 0 &&
        typeof value.revision === 'string' && value.revision.length > 0 ? value : null;
}

function withIdentity(record, id, revision) {
    // Do not overwrite an unrelated pre-existing field with our reserved name.
    if (own(record, META) && !metadata(record)) throw invalid();
    return { ...record, [META]: { ...record[META], version: 1, id, revision } };
}

function saveFingerprint(record) {
    // Recorder receive time can change when an acknowledgement is lost. All
    // authored content and capture provenance still participate in the key.
    const { timestamp, [META]: ignored, ...content } = record;
    const { saveAttemptId, ...payload } = content.payload;
    content.payload = payload;
    const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value)
        ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
    return createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex');
}

function change(type, entry, previous) {
    const result = { type, id: entry.id, revision: entry.revision };
    const selectionId = entry.record.payload?.selectionId;
    const colorMode = modeOf(entry.record);
    if (typeof selectionId === 'string') result.selectionId = selectionId;
    if (colorMode === 'dark' || colorMode === 'light') result.colorMode = colorMode;
    if (previous) {
        result.previousRevision = previous.revision;
        const previousMode = modeOf(previous.record);
        if (previousMode === 'dark' || previousMode === 'light') result.previousColorMode = previousMode;
    }
    return result;
}

// One instance owns all recorder and manager mutations for a capture. Handles
// on untouched legacy rows are session scoped: listing never migrates them.
// Only new/edited rows acquire persistent reserved metadata. Callers must treat
// both row revisions and the epoch-qualified list revision as opaque strings.
class AnnotationNoteService {
    constructor(file, { publish = () => {} } = {}) {
        this.file = path.resolve(file);
        this.publish = publish;
        this.epoch = randomUUID();
        this.sequence = 0;
        this.revision = `${this.epoch}:0`;
        this.entries = [];
        this.saveRequests = new Map();
        this.store = null;
        this.queue = Promise.resolve();
    }

    handle(request) {
        let input;
        try {
            if (!object(request)) throw invalid();
            input = clone(request);
        } catch { return Promise.reject(invalid()); }
        const operation = this.queue.then(async () => {
            try {
                await this.refresh();
                return clone(await this.execute(input));
            } catch (error) {
                throw error instanceof NoteServiceError ? error : storageError();
            }
        });
        // A rejected edit must not poison subsequent saves or the shutdown drain.
        this.queue = operation.catch(() => {});
        return operation;
    }

    async flush() {
        let queue;
        do { queue = this.queue; await queue; } while (queue !== this.queue);
    }

    async notify(changes) {
        // Persistence already committed. A notification failure cannot turn a
        // successful append into a rejected save that a caller might duplicate.
        try { await this.publish(clone({ revision: this.revision, changes })); } catch {}
    }

    async refresh() {
        let text;
        try { text = fs.readFileSync(this.file, 'utf8'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; text = ''; }
        if (this.store && text === this.store.sourceText) return;
        const store = new AnnotationSelectionStore(this.file);
        const ids = new Map();
        for (const record of store.records) {
            const meta = metadata(record);
            if (meta) ids.set(meta.id, (ids.get(meta.id) || 0) + 1);
            if (typeof meta?.saveRequestId === 'string') this.saveRequests.set(meta.saveRequestId, meta.id);
        }
        const entries = store.records.map(record => {
            const meta = metadata(record);
            // Copied/duplicate persistent IDs must never silently merge rows.
            return meta && ids.get(meta.id) === 1
                ? { id: meta.id, revision: meta.revision, record }
                : { id: randomUUID(), revision: randomUUID(), record };
        });
        const reloaded = Boolean(this.store);
        this.store = store;
        this.entries = entries;
        if (reloaded) {
            this.revision = `${this.epoch}:${++this.sequence}`;
            await this.notify([]);
        }
    }

    find(id, revision) {
        if (typeof id !== 'string' || typeof revision !== 'string') throw invalid();
        const entry = this.entries.find(item => item.id === id);
        if (!entry || entry.revision !== revision) throw conflict();
        return entry;
    }

    async commit(entries, changes) {
        this.store.replace(entries.map(entry => entry.record));
        this.entries = entries;
        this.revision = `${this.epoch}:${++this.sequence}`;
        await this.notify(changes);
    }

    async remove(entry, saved = false) {
        const changes = [change('delete', entry)];
        await this.commit(this.entries.filter(item => item !== entry), changes);
        return { revision: this.revision, saved, removed: 1, changes };
    }

    async withdraw(input) {
        const record = input.record;
        const payload = record.payload;
        const id = input.id ?? payload.recordId;
        const revision = input.revision ?? payload.revision ?? payload.recordRevision;
        if (id !== undefined || revision !== undefined) return this.remove(this.find(id, revision));
        const key = selectionKey(record), colorMode = modeOf(record);
        const matches = this.entries.filter(entry => selectionKey(entry.record) === key &&
            (!colorMode || modeOf(entry.record) === colorMode));
        if (matches.length > 1) throw conflict();
        if (!matches.length) return { revision: this.revision, saved: false, removed: 0, changes: [] };
        return this.remove(matches[0]);
    }

    async execute(input) {
        if (input.action === 'list') return { revision: this.revision, notes: this.entries };
        if (input.action === 'record') {
            if (!object(input.record) || !object(input.record.payload)) throw invalid();
            if (input.record.payload.selected === false) return this.withdraw(input);
            const requestId = input.record.payload.saveRequestId;
            if (requestId !== undefined && (typeof requestId !== 'string' || !requestId)) throw invalid();
            const fingerprint = requestId ? saveFingerprint(input.record) : null;
            if (requestId && this.saveRequests.has(requestId)) {
                const matches = this.entries.filter(entry => metadata(entry.record)?.saveRequestId === requestId);
                const entry = matches[0], meta = entry && metadata(entry.record);
                if (matches.length !== 1 || meta.saveRevision !== entry.revision ||
                    meta.saveFingerprint !== fingerprint || saveFingerprint(entry.record) !== fingerprint) throw conflict();
                return { revision: this.revision, saved: true, removed: 0, note: entry, changes: [] };
            }
            const id = randomUUID(), revision = randomUUID();
            const record = withIdentity(input.record, id, revision);
            if (requestId) Object.assign(record[META], { saveRequestId: requestId, saveFingerprint: fingerprint, saveRevision: revision });
            const entry = { id, revision, record }, changes = [change('add', entry)];
            await this.commit([...this.entries, entry], changes);
            if (requestId) this.saveRequests.set(requestId, id);
            return { revision: this.revision, saved: true, removed: 0, note: entry, changes };
        }
        if (input.action === 'delete') return this.remove(this.find(input.id, input.revision));
        if (input.action === 'edit') {
            const previous = this.find(input.id, input.revision);
            const hasNote = own(input, 'note'), hasMode = own(input, 'colorMode');
            if ((!hasNote && !hasMode) || (hasNote && typeof input.note !== 'string') ||
                (hasMode && input.colorMode !== 'dark' && input.colorMode !== 'light')) throw invalid();
            if (!object(previous.record.payload)) throw invalid();
            const record = { ...previous.record, payload: { ...previous.record.payload } };
            if (hasNote) record.payload.note = input.note;
            if (hasMode) record.colorMode = record.payload.colorMode = input.colorMode;
            if (JSON.stringify(record) === JSON.stringify(previous.record)) {
                return { revision: this.revision, note: previous, changes: [] };
            }
            const revision = randomUUID();
            const entry = { id: previous.id, revision, record: withIdentity(record, previous.id, revision) };
            const changes = [change('edit', entry, previous)];
            await this.commit(this.entries.map(item => item === previous ? entry : item), changes);
            return { revision: this.revision, note: entry, changes };
        }
        throw invalid();
    }
}

module.exports = { AnnotationNoteService };
