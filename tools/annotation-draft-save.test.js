'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAnnotationDraftSave } = require('./annotation-draft-save');

function fixture() {
    const sent = [], states = [], saved = [], removed = [], timers = new Map();
    let sequence = 0;
    const api = createAnnotationDraftSave({ createId: () => `opaque-${++sequence}`, send: payload => sent.push(payload),
        update: state => states.push(state), saved: entry => saved.push(entry), removed: entry => removed.push(entry),
        setTimer: fn => { const id = ++sequence; timers.set(id, fn); return id; }, clearTimer: id => timers.delete(id) });
    const entry = { element: {}, colorMode: 'light', descriptor: { selector: '.picked' }, note: '' };
    const ack = (ok = true, patch = {}) => ({ ...sent.at(-1), ok, id: 'saved-row', revision: 'saved-revision', ...patch });
    return { api, sent, states, saved, removed, timers, entry, ack };
}

test('draft remains pending until its exact operation acknowledgement confirms row identity', () => {
    const f = fixture();
    assert.equal(f.api.save(f.entry, 'draft'), true);
    assert.equal(f.entry.savePending, true); assert.equal(f.saved.length, 0);
    assert.equal(f.api.save(f.entry, 'second Enter'), false); assert.equal(f.sent.length, 1);
    for (const patch of [{ selectionId: 'other' }, { colorMode: 'dark' }, { selected: false }, { saveRequestId: 'other-request' }]) {
        assert.equal(f.api.acknowledge(f.ack(true, patch)), false);
        assert.equal(f.entry.savePending, true);
    }
    assert.equal(f.api.acknowledge(f.ack()), true);
    assert.equal(f.entry.recordId, 'saved-row'); assert.equal(f.entry.revision, 'saved-revision');
    assert.equal(f.saved[0], f.entry); assert.equal(f.entry.savePending, false); assert.equal(f.timers.size, 0);
});

test('failure preserves draft and stable save identity for an explicit successful retry', () => {
    const f = fixture(); f.api.save(f.entry, 'keep this draft');
    const first = { ...f.sent[0] };
    f.api.acknowledge(f.ack(false, { error: 'Could not confirm' }));
    assert.equal(f.entry.note, 'keep this draft'); assert.equal(f.saved.length, 0);
    assert.equal(f.entry.savePending, false); assert.equal(f.states.at(-1).error, 'Could not confirm');
    f.api.save(f.entry, 'keep this draft');
    assert.equal(f.sent[1].saveRequestId, first.saveRequestId);
    assert.notEqual(f.sent[1].saveAttemptId, first.saveAttemptId);
    assert.equal(f.sent[1].note, first.note);
    f.api.acknowledge(f.ack()); assert.equal(f.saved.length, 1); assert.equal(f.states.at(-1).error, '');
});

test('late acknowledgement for an earlier attempt cannot close a changed retry draft', () => {
    const f = fixture(); f.api.save(f.entry, 'first text');
    const oldAck = f.ack(); [...f.timers.values()][0]();
    f.api.save(f.entry, 'revised text');
    assert.equal(f.api.acknowledge(oldAck), false);
    assert.equal(f.entry.savePending, true); assert.equal(f.entry.note, 'revised text'); assert.equal(f.saved.length, 0);
    f.api.acknowledge(f.ack(false, { error: 'The saved operation differs; check saved notes.' }));
    assert.equal(f.entry.savePending, false); assert.equal(f.entry.note, 'revised text'); assert.equal(f.saved.length, 0);
});

test('a manager edit received before save acknowledgement preserves the original draft for conflict review', () => {
    const f = fixture(); f.api.save(f.entry, 'original');
    f.api.changed('saved-row', 'newer-manager-revision'); f.api.acknowledge(f.ack());
    assert.equal(f.saved.length, 0); assert.equal(f.entry.note, 'original'); assert.match(f.states.at(-1).error, /not confirmed/);
});

test('missing acknowledgement times out visibly, and a deleted row cannot be confirmed late', () => {
    const f = fixture(); f.api.save(f.entry, 'unknown commit');
    [...f.timers.values()][0]();
    assert.equal(f.entry.savePending, false); assert.match(f.states.at(-1).error, /retry/);
    const requestId = f.sent[0].saveRequestId;
    f.api.save(f.entry, 'unknown commit'); assert.equal(f.sent[1].saveRequestId, requestId);
    f.api.deleted('saved-row'); f.api.acknowledge(f.ack());
    assert.equal(f.saved.length, 0); assert.equal(f.entry.note, 'unknown commit');
    assert.match(f.states.at(-1).error, /not confirmed/);
});

test('withdrawal waits for persistence and failed removal leaves the exact selected entry available', () => {
    const f = fixture(); Object.assign(f.entry, { selectionId: 'selection', recordId: 'row', revision: 'row-rev' });
    f.api.withdraw(f.entry); assert.equal(f.removed.length, 0);
    assert.equal(f.sent[0].recordId, 'row'); assert.equal(f.sent[0].revision, 'row-rev');
    assert.equal(f.sent[0].colorMode, 'light'); assert.equal(f.sent[0].selected, false);
    f.api.acknowledge(f.ack(false)); assert.equal(f.removed.length, 0); assert.equal(f.entry.recordId, 'row');
    f.api.withdraw(f.entry); f.api.acknowledge(f.ack()); assert.equal(f.removed[0], f.entry);
});

test('unavailable send unlocks the draft and stop cancels pending acknowledgement timers', () => {
    const states = [], timers = new Map();
    const entry = { colorMode: 'dark' };
    const api = createAnnotationDraftSave({ createId: () => 'id', send: () => false, update: state => states.push(state),
        saved() { assert.fail('unconfirmed save'); }, removed() {}, setTimer: fn => { timers.set(1, fn); return 1; }, clearTimer: id => timers.delete(id) });
    api.save(entry, 'recover'); assert.equal(entry.savePending, false); assert.equal(timers.size, 0);
    assert.match(states.at(-1).error, /not confirmed/);
    const f = fixture(); f.api.save(f.entry, 'pending'); f.api.stop(); assert.equal(f.timers.size, 0);
    assert.equal(f.api.acknowledge(f.ack()), false); assert.equal(f.saved.length, 0);
});
