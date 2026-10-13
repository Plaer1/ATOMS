'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { installAnnotationInputLock, AnnotationInputLockBridge } = require('./steam-annotation-input-lock');

class Events {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
    removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(f => f !== fn)); }
    fire(type, fields = {}) {
        const event = { type, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...fields };
        for (const fn of this.listeners.get(type) || []) { fn(event); if (event.stopped) break; }
        return event;
    }
}

function fixture() {
    const window = new Events(), document = new Events(), messages = [], picked = [];
    const note = { style: { display: 'none' } }, noteFrame = new Events();
    noteFrame.contentWindow = new Events();
    const hovered = { closest() { return null; } };
    const shadow = { frame: null, getElementById(id) { return id === 'note' ? note : id === 'note-input-frame' ? noteFrame : this.frame; }, prepend(frame) { this.frame = frame; frame.isConnected = true; frame.fire('load'); } };
    document.documentElement = {};
    document.getElementById = () => ({ shadowRoot: shadow });
    document.querySelectorAll = () => [hovered];
    document.hasFocus = () => true;
    document.createElement = () => {
        const frame = new Events();
        frame.style = { setProperty() {} };
        frame.contentWindow = new Events(); frame.contentWindow.focus = () => {};
        frame.contentDocument = { body: { focus() {} } };
        frame.remove = () => { frame.isConnected = false; shadow.frame = null; };
        return frame;
    };
    window.__atomsVisualAuditV5 = { input: { move: e => picked.push(['move', e.clientX]), click: e => picked.push(['click', e.clientX]), note: e => picked.push(['note', e.data.key]) } };
    window.__atomsAnnotationInputLockEmit = data => messages.push(JSON.parse(data));
    vm.runInNewContext(`(${installAnnotationInputLock})();`, { window, document, location: { href: 'https://store.steampowered.com/' }, performance, setTimeout, clearTimeout, MutationObserver: class { observe() {} disconnect() {} } });
    return { window, document, shadow, note, noteFrame, messages, picked, hovered, lock: window.__atomsAnnotationInputLockV1 };
}

test('Alt snapshots hover, shields Steam input, forwards picker input, and releases', () => {
    const f = fixture();
    assert.equal(f.window.fire('keydown', { key: 'Alt' }).prevented, true);
    assert.deepEqual(f.messages[0], { action: 'freeze', token: 1 });
    assert.equal(f.lock.getHovered()[0], f.hovered);
    assert.equal(f.lock.activate(1), true);
    const child = f.shadow.frame.contentWindow;
    assert.equal(child.fire('mousemove', { altKey: true, clientX: 80 }).prevented, true);
    child.fire('click', { altKey: true, button: 0, clientX: 80 });
    assert.deepEqual(f.picked, [['move', 80], ['click', 80]]);
    assert.equal(f.window.fire('mouseout', { altKey: true }).prevented, true);
    assert.equal(child.fire('wheel', { altKey: true }).prevented, true);
    child.fire('keyup', { key: 'Alt', altKey: false });
    assert.equal(f.lock.isHeld(), false);
    assert.equal(f.shadow.frame, null);
    assert.equal(f.window.fire('click').prevented, true); // no leaked gesture tail
    f.window.fire('pointerdown', { altKey: false });
    assert.equal(f.window.fire('click').prevented, undefined); // next real click works
    f.lock.stop();
});

test('isolated note input retains editing and handles Enter/Escape without inline scripts', () => {
    const f = fixture(); f.note.style.display = 'block';
    assert.equal(f.noteFrame.contentWindow.fire('keydown', { key: 'Backspace' }).prevented, undefined);
    f.noteFrame.contentWindow.fire('keydown', { key: 'Enter' });
    f.noteFrame.contentWindow.fire('keydown', { key: 'Escape' });
    assert.deepEqual(f.picked, [['note', 'Enter'], ['note', 'Escape']]);
    f.window.fire('keydown', { key: 'Alt' });
    assert.equal(f.lock.isHeld(), false);
    f.lock.stop();
});

test('CDP pins hovered nodes and clears a stale activation and queued release', async () => {
    const calls = [];
    const bridge = new AnnotationInputLockBridge(async (method, params) => {
        calls.push([method, params]);
        if (method === 'Runtime.evaluate') return { result: params.expression.includes('getHovered') ? { objectId: 'hovered' } : { value: false } };
        if (method === 'Runtime.getProperties') return { result: [{ name: '0', value: { objectId: 'node' } }] };
        if (method === 'DOM.requestNode') return { nodeId: 42 };
        return {};
    });
    bridge.handle({ executionContextId: 1, payload: JSON.stringify({ action: 'freeze', token: 1 }) });
    bridge.handle({ executionContextId: 1, payload: JSON.stringify({ action: 'release', token: 1 }) });
    await bridge.stop();
    assert.deepEqual(calls.filter(([method]) => method === 'CSS.forcePseudoState').map(([, p]) => p.forcedPseudoClasses), [['hover'], []]);
    assert.equal(bridge.forced.size, 0);
});
