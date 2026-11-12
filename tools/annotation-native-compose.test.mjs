import test from 'node:test';
import assert from 'node:assert/strict';
import { bringExactPillToFront, focusComposerAfterShow, handleAcknowledgedPinRequest, shouldSubmitComposer, waitForPickerRelease } from '../js/annotation/menu.js';

test('composer Enter saves; Shift+Enter, Alt+Enter, and IME composition remain text input', () => {
    assert.equal(shouldSubmitComposer({ key: 'Enter' }), true);
    assert.equal(shouldSubmitComposer({ key: 'Enter', shiftKey: true }), false);
    assert.equal(shouldSubmitComposer({ key: 'Enter', altKey: true }), false);
    assert.equal(shouldSubmitComposer({ key: 'Enter', isComposing: true }), false);
    assert.equal(shouldSubmitComposer({ key: 'Enter', keyCode: 229 }), false);
    assert.equal(shouldSubmitComposer({ key: 'a' }), false);
});

test('composer waits for resize, show, native key focus, and then field focus', async () => {
    const calls = [];
    const field = { focus: options => calls.push(['field-focus', options]) };
    const win = { SteamClient: { Window: {
        ShowWindow: () => calls.push('show'),
        BringToFront: () => calls.push('front'),
        MarkLastFocused: () => calls.push('mark-last-focused'),
        SetKeyFocus: () => { calls.push('native-focus'); return Promise.resolve(); },
    } } };
    assert.equal(await focusComposerAfterShow({ win, field, fit: () => calls.push('fit'), bringToFront: async () => calls.push('cdp-front'), delay: async ms => calls.push(`delay-${ms}`) }), true);
    assert.deepEqual(calls, ['delay-60', 'fit', 'show', 'front', 'mark-last-focused', 'native-focus', 'cdp-front', 'delay-40', ['field-focus', { preventScroll: true }]]);
});

test('composer never focuses while Alt remains held', async () => {
    let focused = false;
    const win = { SteamClient: { Window: { ShowWindow() { throw Error('must not show'); } } } };
    assert.equal(await focusComposerAfterShow({ win, field: { focus: () => { focused = true; } }, blocked: () => true, delay: async () => {} }), false);
    assert.equal(focused, false);
});

test('follower relay waits for Alt release and refuses focus-stealing timeout', async () => {
    let held = true;
    const win = {
        __atomsAnnotationPickerV1: { isHeld: () => held },
    };
    let polls = 0;
    const released = waitForPickerRelease(win, 100, async () => { if (++polls === 2) held = false; });
    assert.equal(await released, true);
    held = true;
    assert.equal(await waitForPickerRelease(win, 40, async () => {}), false);
});

test('BrowserView hover pin resolves only after owner acknowledgment and release clears a pending pin', async () => {
    const messages = [];
    let resolvePin;
    const pendingPin = new Promise(resolve => { resolvePin = resolve; });
    const pinResult = handleAcknowledgedPinRequest({ kind: 'pin', requestId: 'pin-a', active: true, token: 't1', url: '/page' }, {
        pin: () => pendingPin,
        unpin: async () => true,
        acknowledge: message => messages.push(message),
    });
    await Promise.resolve();
    assert.equal(messages.length, 0, 'the shield must wait while the owner is still pinning');
    await handleAcknowledgedPinRequest({ kind: 'pin', requestId: 'pin-b', active: false, token: 't1' }, {
        pin: async () => true,
        unpin: async () => true,
        acknowledge: message => messages.push(message),
    });
    resolvePin(false);
    await pinResult;
    assert.deepEqual(messages.map(message => [message.requestId, message.ok, message.value]), [
        ['pin-b', true, true], ['pin-a', true, false],
    ]);
});

test('CDP brings only the exact live pill document forward and always detaches', async () => {
    const calls = [];
    const expected = { name: 'atoms_annotator_pill_SP_Desktop_uid0', title: 'ATOMS · SP Desktop_uid0', url: 'https://steamloopback.host/index.html', marker: 'unguessable-marker' };
    const cdp = { async send(method, params, sessionId) {
        calls.push([method, params, sessionId]);
        if (method === 'Target.getTargets') return { targetInfos: [
            { type: 'page', targetId: 'browser-copy', title: expected.title, url: 'about:blank?createflags=4223242' },
            { type: 'page', targetId: 'other-page', title: 'Other', url: expected.url },
            { type: 'browser', targetId: 'browser', title: expected.title, url: expected.url },
            { type: 'page', targetId: 'pill', title: expected.title, url: 'about:blank?createflags=4223242' },
        ] };
        if (method === 'Target.attachToTarget') return { sessionId: `session-${params.targetId}` };
        if (method === 'Runtime.evaluate') return { result: { value: JSON.stringify({ ...expected, marker: sessionId === 'session-pill' ? expected.marker : 'not-the-pill' }) } };
        return {};
    } };
    assert.equal(await bringExactPillToFront(cdp, expected), true);
    assert.deepEqual(calls.filter(([method]) => method === 'Page.bringToFront').map(([, params, session]) => [params, session]), [[{}, 'session-pill']]);
    assert.deepEqual(calls.filter(([method]) => method === 'Target.detachFromTarget').map(([, params]) => params.sessionId), ['session-browser-copy', 'session-pill']);
});

test('CDP refuses replacement or canceled pill targets without activating another document', async () => {
    const calls = [];
    let allowed = true;
    const expected = { name: 'atoms_annotator_pill_main', title: 'ATOMS · main', url: 'https://steamloopback.host/index.html', marker: 'marker' };
    const cdp = { async send(method, params, sessionId) {
        calls.push(method);
        if (method === 'Target.getTargets') return { targetInfos: [{ type: 'page', targetId: 'replacement', title: expected.title, url: expected.url }] };
        if (method === 'Target.attachToTarget') return { sessionId: 'replacement-session' };
        if (method === 'Runtime.evaluate') { allowed = false; return { result: { value: JSON.stringify({ ...expected, marker: 'new-marker' }) } }; }
        return {};
    } };
    assert.equal(await bringExactPillToFront(cdp, { ...expected, isAllowed: () => allowed }), false);
    assert.equal(calls.includes('Page.bringToFront'), false);
    assert.equal(calls.includes('Target.detachFromTarget'), true);
});
