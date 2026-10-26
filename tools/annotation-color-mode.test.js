'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readAnnotationColorMode, createModeSelectionState } = require('./annotation-color-mode');
const { AnnotationSelectionStore } = require('./annotation-selection-store');

test('mode is read from the document on each selection, with legacy dark fallback', () => {
    global.document = { documentElement: {} };
    let marker = '';
    global.getComputedStyle = () => ({ getPropertyValue: () => marker });
    assert.equal(readAnnotationColorMode(), 'dark');
    marker = ' light '; assert.equal(readAnnotationColorMode(), 'light');
    marker = 'dark'; assert.equal(readAnnotationColorMode(), 'dark');
    delete global.document; delete global.getComputedStyle;
});

test('one element can retain independent light and dark selections', () => {
    const state = createModeSelectionState(), element = {};
    const dark = { colorMode: 'dark', selectionId: 'd' }, light = { colorMode: 'light', selectionId: 'l' };
    state.set(element, dark); state.set(element, light);
    assert.equal(state.get(element, 'dark'), dark);
    assert.equal(state.get(element, 'light'), light);
    state.delete(element, 'light');
    assert.equal(state.get(element, 'light'), undefined);
    assert.deepEqual(state.all(element), [dark]);
});

test('light/dark context survives disk persistence and removing one mode preserves the other', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atoms-mode-'));
    try {
        const file = path.join(dir, 'selected-assets.jsonl');
        const store = new AnnotationSelectionStore(file);
        for (const colorMode of ['light', 'dark']) store.record({ colorMode, payload: {
            selected: true, colorMode, selectionId: colorMode, asset: { id: 'same-element' }, note: colorMode
        }});
        let reopened = new AnnotationSelectionStore(file);
        assert.deepEqual(reopened.records.map(r => r.colorMode), ['light', 'dark']);
        reopened.record({ colorMode: 'light', payload: { selected: false, selectionId: 'light' } });
        reopened = new AnnotationSelectionStore(file);
        assert.equal(reopened.records.length, 1);
        assert.equal(reopened.records[0].colorMode, 'dark');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
