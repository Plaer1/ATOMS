'use strict';

// Self-contained: serialized into each Steam document alongside the picker.
function readAnnotationColorMode() {
    const marker = getComputedStyle(document.documentElement)
        .getPropertyValue('--atoms-color-mode').trim();
    return marker === 'light' ? 'light' : 'dark';
}

function createModeSelectionState() {
    const entries = new WeakMap();
    return {
        get(element, mode) { return entries.get(element)?.get(mode); },
        set(element, entry) {
            if (!entries.has(element)) entries.set(element, new Map());
            entries.get(element).set(entry.colorMode, entry);
        },
        delete(element, mode) { entries.get(element)?.delete(mode); },
        all(element) { return [...(entries.get(element)?.values() || [])]; }
    };
}

module.exports = { readAnnotationColorMode, createModeSelectionState };
