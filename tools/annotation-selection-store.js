'use strict';

const fs = require('fs');
const path = require('path');
const { randomBytes, createHash } = require('crypto');

function selectionKey(record) {
    const payload = record.payload || {};
    if (payload.selectionId) return `selection:${payload.selectionId}`;
    // Older captures had no per-selection ID. Keep different pages/targets
    // separate rather than deleting unrelated notes with the same CSS hash.
    return JSON.stringify([record.target?.id, record.url, payload.asset?.id]);
}

function activeSelections(records) {
    const retained = [];
    for (const record of records) {
        if (record.payload?.selected === false) {
            const key = selectionKey(record);
            for (let i = retained.length - 1; i >= 0; i--) {
                if (selectionKey(retained[i]) === key) retained.splice(i, 1);
            }
        } else {
            retained.push(record);
        }
    }
    return retained;
}

function selectionFingerprint(record) {
    return createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

function parseLines(text) {
    const entries = [];
    let pending = '';
    for (const line of text.match(/[^\n]*(?:\n|$)/g) || []) {
        if (!line) continue;
        pending += line;
        if (!line.trim()) continue;
        const record = JSON.parse(line);
        if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid annotation record');
        entries.push({ record, raw: pending });
        pending = '';
    }
    return { entries, trailing: pending };
}

class AnnotationSelectionStore {
    constructor(file) {
        this.file = path.resolve(file);
        const text = fs.existsSync(this.file) ? fs.readFileSync(this.file, 'utf8') : '';
        // Refuse malformed input instead of silently discarding a user's note.
        const parsed = parseLines(text);
        this.sourceText = text;
        this.rawEntries = parsed.entries;
        this.trailing = parsed.trailing;
        const records = parsed.entries.map(entry => entry.record);
        this.records = activeSelections(records);
        this.prunedEvents = records.length - this.records.length;
        if (this.prunedEvents) this.replace(this.records);
    }

    replace(records) {
        // Keep the bytes of untouched rows, including legacy formatting. A
        // targeted correction must not migrate every other saved annotation.
        const originals = new Map(this.rawEntries.map(entry => [entry.record, entry.raw]));
        const entries = records.map(record => ({ record, raw: originals.get(record) || JSON.stringify(record) + '\n' }));
        for (let i = 0; i < entries.length - 1; i++) {
            if (!entries[i].raw.endsWith('\n')) entries[i].raw += '\n';
        }
        const trailing = entries.length ? this.trailing : '';
        const text = entries.map(entry => entry.raw).join('') + trailing;
        const temporary = `${this.file}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
        let opened = false;
        try {
            const mode = fs.existsSync(this.file) ? fs.statSync(this.file).mode & 0o777 : 0o600;
            const fd = fs.openSync(temporary, 'wx', mode);
            opened = true;
            try {
                fs.writeFileSync(fd, text);
                fs.fsyncSync(fd);
            } finally { fs.closeSync(fd); }
            fs.renameSync(temporary, this.file);
            this.records = records.slice();
            this.rawEntries = entries;
            this.trailing = trailing;
            this.sourceText = text;
        } finally {
            if (opened && fs.existsSync(temporary)) fs.unlinkSync(temporary);
        }
    }

    record(record) {
        if (record.payload?.selected === false) {
            const key = selectionKey(record);
            const next = this.records.filter(saved => selectionKey(saved) !== key);
            const removed = this.records.length - next.length;
            if (removed) this.replace(next);
            this.records = next;
            return { removed, saved: false };
        }
        this.replace([...this.records, record]);
        return { removed: 0, saved: true };
    }

    // Call on a freshly opened store after recording stops. A multiset of exact
    // record hashes removes only the reviewed batch, not later notes sharing a
    // selector/selection ID. Completed text is deleted, not archived or marked.
    completeBatch(fingerprints) {
        if (!Array.isArray(fingerprints) || fingerprints.some(key => typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key))) {
            throw new Error('Expected an array of SHA-256 annotation fingerprints');
        }
        const remaining = new Map();
        for (const key of fingerprints) remaining.set(key, (remaining.get(key) || 0) + 1);
        const next = this.records.filter(record => {
            const key = selectionFingerprint(record), count = remaining.get(key) || 0;
            if (!count) return true;
            remaining.set(key, count - 1);
            return false;
        });
        const removed = this.records.length - next.length;
        if (removed) this.replace(next);
        this.records = next;
        return { removed, pending: next.length };
    }
}

module.exports = { AnnotationSelectionStore, activeSelections, selectionFingerprint, selectionKey };
