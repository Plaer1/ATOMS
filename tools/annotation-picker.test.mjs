import test from 'node:test';
import assert from 'node:assert/strict';
import {
    activateAfterHoverPin, canStopWithDraft, contextFor, createSaveCoordinator,
    describePicked, focusEditorInput, handleEditorKey, isPickerDocument,
    readColorMode, readablePickerFrame, relayWithAck, resolveColorMode,
    selectorFor, setEditorSaving, shouldBlockPageEvent
} from '../js/annotation/picker.js';

function fixture() {
    const storage = new Map();
    const doc = {
        title: 'Steam',
        location: { protocol: 'https:', host: 'store.steampowered.com', pathname: '/app/42/', href: 'https://store.steampowered.com/app/42/?l=en' },
        documentElement: {},
    };
    const win = {
        name: 'SteamMain_uid42', document: doc, location: doc.location,
        CSS: { escape: value => String(value).replace(/ /g, '\\ ') },
        crypto: { randomUUID: () => 'fixed-uuid' },
        sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    };
    doc.defaultView = win;
    const root = { nodeType: 1, tagName: 'MAIN', id: '', classList: [], parentElement: null, children: [] };
    const rowA = { nodeType: 1, tagName: 'DIV', id: '', classList: ['tile'], parentElement: root, children: [] };
    const rowB = { nodeType: 1, tagName: 'DIV', id: '', classList: ['tile'], parentElement: root, children: [] };
    root.children = [rowA, rowB];
    const element = { nodeType: 1, tagName: 'BUTTON', id: 'save button', classList: ['primary', 'Focusable'], parentElement: rowB, children: [], ownerDocument: doc };
    rowB.children = [element];
    return { doc, win, root, rowA, rowB, element };
}

test('selector and context identify the exact sibling and escape an id', () => {
    const { win, element } = fixture();
    assert.equal(selectorFor(element, win), '#save\\ button');
    assert.equal(contextFor(element, win), 'main > div.tile:nth-child(2) > #save\\ button:nth-child(1)');
});

test('picker metadata records sampled mode, route and window without retaining a DOM node', () => {
    const { doc, win, element } = fixture();
    let mode = ' light ';
    const read = () => readColorMode(doc, () => ({ getPropertyValue: name => name === '--atoms-color-mode' ? mode : '' }));
    assert.equal(read(), 'light');
    const picked = describePicked(element, { window: win, colorMode: read() });
    mode = 'dark';
    assert.equal(read(), 'dark');
    assert.equal(picked.colorMode, 'light');
    assert.equal(picked.route, 'store.steampowered.com/app/42/');
    assert.equal(picked.windowId, 'name:SteamMain_uid42');
    assert.deepEqual(picked.window, {
        id: 'name:SteamMain_uid42', name: 'SteamMain_uid42', title: 'Steam',
        href: 'https://store.steampowered.com/app/42/?l=en'
    });
    assert.equal(picked.selector, '#save\\ button');
    assert.equal(picked.context.includes('div.tile:nth-child(2)'), true);
    assert.equal(Object.hasOwn(picked, 'element'), false);
});

test('missing and unreadable mode markers stay unknown unless a validated owner fallback exists', () => {
    const { doc } = fixture();
    const absent = () => ({ getPropertyValue: () => '' });
    assert.equal(readColorMode(doc, absent), null);
    assert.equal(readColorMode(doc, () => { throw Error('style unavailable'); }), null);
    assert.equal(resolveColorMode(doc, 'light', absent), 'light');
    assert.equal(resolveColorMode(doc, 'sepia', absent), null);
    assert.equal(resolveColorMode(doc, 'dark', () => { throw Error('style unavailable'); }), 'dark');
});

test('Alt, held and modal events are blocked while ordinary page input and picker UI remain usable', () => {
    const event = (altKey = false) => ({ altKey });
    assert.equal(shouldBlockPageEvent(event(false)), false);
    assert.equal(shouldBlockPageEvent(event(true)), true);
    assert.equal(shouldBlockPageEvent(event(false), { held: true }), true);
    assert.equal(shouldBlockPageEvent(event(false), { pending: true }), true);
    assert.equal(shouldBlockPageEvent(event(false), { pending: true, pickerUi: true }), false);
});

test('owned srcdoc and annotation windows are excluded; Store BrowserView windows remain eligible', () => {
    assert.equal(isPickerDocument('about:srcdoc'), true);
    assert.equal(isPickerDocument('https://steamloopback.host/', 'atoms_annotation_uid12'), true);
    assert.equal(isPickerDocument('https://steamloopback.host/', '', 'ATOMS saved annotations'), true);
    assert.equal(isPickerDocument('about:blank?browserviewpopup=1&requestid=12&parentpopup=3', 'QuickAccess_uid3'), false);
});

test('cross-origin iframe metadata access is contained instead of escaping the 500ms frame poll', () => {
    assert.equal(readablePickerFrame({ get contentWindow() { throw Error('SecurityError'); } }), null);
    assert.equal(readablePickerFrame({ contentWindow: { get document() { throw Error('SecurityError'); } } }), null);
    const doc = { location: { href: 'about:blank?browserviewpopup=1' }, title: 'Store' };
    const frame = { contentWindow: { document: doc, name: 'QuickAccess_uid1' } };
    assert.equal(readablePickerFrame(frame).document, doc);
});

test('a nonempty or in-flight draft refuses teardown', () => {
    assert.equal(canStopWithDraft(false), true);
    assert.equal(canStopWithDraft(true), false);
    assert.equal(canStopWithDraft(false, true), false);
});

test('save coordinator collapses duplicate submits and allows same-token retry after lost acknowledgement', async () => {
    let calls = 0;
    const accepted = [];
    const request = { saveRequestId: 'stable-selection-save', route: '/app/42', note: 'keep draft' };
    const save = createSaveCoordinator(async record => {
        calls += 1;
        if (calls === 1) { accepted.push(record); throw Error('ack lost'); }
        accepted.push(record);
        return { id: 'stored-once' };
    });
    const firstA = save(request), firstB = save(request);
    assert.equal(firstA, firstB);
    await assert.rejects(firstA, /ack lost/);
    const retryA = save(request), retryB = save(request);
    assert.equal(retryA, retryB);
    assert.deepEqual(await retryA, { id: 'stored-once' });
    assert.equal(calls, 2);
    assert.deepEqual(accepted.map(row => [row.saveRequestId, row.note]), [
        ['stable-selection-save', 'keep draft'], ['stable-selection-save', 'keep draft']
    ]);
});

test('successful save unlocks a second note; failed save unlocks controls without clearing its draft', async () => {
    const field = { readOnly: false, value: 'first note' };
    const buttons = [{ disabled: false }, { disabled: false }];
    let writes = 0;
    const save = createSaveCoordinator(async record => {
        writes += 1;
        if (record.note === 'retry me' && writes === 2) throw Error('ack lost');
        return record;
    });

    setEditorSaving(field, buttons, true);
    await save({ saveRequestId: 'first', note: field.value });
    setEditorSaving(field, buttons, false); // successful closeNote path
    field.value = '';
    setEditorSaving(field, buttons, false); // next openNote path
    assert.equal(field.readOnly, false);
    assert.deepEqual(buttons.map(button => button.disabled), [false, false]);

    field.value = 'retry me';
    setEditorSaving(field, buttons, true);
    await assert.rejects(save({ saveRequestId: 'second', note: field.value }), /ack lost/);
    setEditorSaving(field, buttons, false); // submit catch path
    assert.equal(field.readOnly, false);
    assert.deepEqual(buttons.map(button => button.disabled), [false, false]);
    assert.equal(field.value, 'retry me');
});

test('Enter submits and Escape cancels; IME composition Enter is left alone', () => {
    let submits = 0, cancels = 0, consumed = 0;
    const actions = { submit: () => { submits += 1; }, cancel: () => { cancels += 1; }, consume: () => { consumed += 1; } };
    assert.equal(handleEditorKey({ key: 'Enter' }, actions), true);
    assert.equal(handleEditorKey({ key: 'Enter', isComposing: true }, actions), false);
    assert.equal(handleEditorKey({ key: 'Escape' }, actions), true);
    assert.deepEqual([submits, cancels, consumed], [1, 1, 2]);
});

test('editor focus retries immediately, next frame and after 48ms without native window focus', () => {
    let focused = 0, frameFocused = 0, activeElement = null;
    const doc = { get activeElement() { return activeElement; } };
    const field = { ownerDocument: doc, focus() { focused += 1; activeElement = field; } };
    const frame = { contentWindow: { focus() { frameFocused += 1; } }, contentDocument: doc, focus() {} };
    const frameCallbacks = [], timers = [];
    assert.equal(focusEditorInput(frame, field, {
        requestFrame: callback => frameCallbacks.push(callback),
        schedule: (callback, delay) => timers.push([callback, delay]),
        canFocus: () => true,
    }), true);
    frameCallbacks[0](); timers[0][0]();
    assert.equal(timers[0][1], 48);
    assert.equal(focused, 3);
    assert.equal(frameFocused, 3);
    assert.equal(activeElement, field);
});

test('hover shield activates only after every initial hover pin succeeds and hold is still current', async () => {
    let resolvePin, activated = 0, current = true;
    const pinWait = new Promise(resolve => { resolvePin = resolve; });
    const activation = activateAfterHoverPin([{}, {}], () => pinWait, () => current, () => { activated += 1; });
    await Promise.resolve();
    assert.equal(activated, 0);
    resolvePin(true);
    assert.equal(await activation, true);
    assert.equal(activated, 1);

    current = false;
    assert.equal(await activateAfterHoverPin([{}], async () => true, () => current, () => { activated += 1; }), false);
    assert.equal(activated, 1);
    assert.equal(await activateAfterHoverPin([{}], async () => false, () => true, () => { activated += 1; }), false);
    assert.equal(activated, 1);
});

test('relay acknowledgements resolve or reject for recoverable menu selection handling', async () => {
    const metadata = { selectionId: 'selection-1' };
    assert.deepEqual(await relayWithAck(async value => ({ accepted: value.selectionId }), metadata), { accepted: 'selection-1' });
    await assert.rejects(relayWithAck(async () => { throw Error('relay timed out'); }, metadata), /relay timed out/);
});
