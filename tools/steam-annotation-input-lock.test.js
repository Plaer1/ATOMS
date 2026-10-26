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

function fixture({ hidden = false, previous, title = 'SP Overlay: test', deferShieldLoad = false, bindingFails = false } = {}) {
    const window = new Events(), document = new Events(), messages = [], picked = [];
    const note = { style: { display: 'none' } }, noteFrame = new Events();
    noteFrame.contentWindow = new Events();
    const focused = [], observers = [], freezeStates = [], timers = new Map();
    let nextTimer = 0;
    class Style {
        constructor() { this.values = new Map(); }
        setProperty(key, value, priority = '') { this.values.set(key, [String(value), priority]); }
        getPropertyValue(key) { return this.values.get(key)?.[0] || ''; }
        getPropertyPriority(key) { return this.values.get(key)?.[1] || ''; }
        removeProperty(key) { const value = this.getPropertyValue(key); this.values.delete(key); return value; }
        set cssText(text) {
            this.values.clear();
            for (const part of text.split(';')) {
                const colon = part.indexOf(':'); if (colon < 0) continue;
                const value = part.slice(colon + 1).trim();
                this.setProperty(part.slice(0, colon).trim(), value.replace(/\s*!important$/, ''), /!important$/.test(value) ? 'important' : '');
            }
        }
        get cssText() { return [...this.values].map(([key, [value, priority]]) => `${key}:${value}${priority ? '!important' : ''}`).join(';'); }
    }
    class Element extends Events {
        constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.style = new Style(); this.children = []; this.dataset = {}; this.attrs = new Map(); this.textContent = ''; }
        get isConnected() { return Boolean(this.root || this.parentNode?.isConnected); }
        appendChild(element) { element.remove(); this.children.push(element); element.parentNode = this; return element; }
        remove() {
            if (!this.parentNode) return;
            this.parentNode.children = this.parentNode.children.filter(child => child !== this);
            if (this.parentNode.frame === this) this.parentNode.frame = null;
            this.parentNode = null;
        }
        setAttribute(key, value) { this.attrs.set(key, value); if (key === 'id') this.id = value; }
        getAttribute(key) { return key === 'id' ? this.id || null : this.attrs.get(key) ?? null; }
    }
    noteFrame.contentWindow.focus = () => focused.push('frame');
    noteFrame.contentDocument = { getElementById: () => ({ focus: () => focused.push('input') }) };
    document.title = title;
    document.hidden = hidden;
    document.visibilityState = hidden ? 'hidden' : 'visible';
    window.SteamClient = { Window: { SetKeyFocus: value => focused.push(['native', value]) } };
    window.__atomsAnnotationInputLockV1 = previous;
    const hovered = new Element('div'); hovered.closest = () => null;
    hovered.style.setProperty('-webkit-app-region', 'drag', 'important');
    document.documentElement = new Element('html'); document.documentElement.root = true;
    document.head = document.documentElement.appendChild(new Element('head'));
    const host = document.documentElement.appendChild(new Element('div')); host.id = 'atoms-visual-audit-host';
    host.style.setProperty('-webkit-app-region', 'drag', 'important');
    const shadow = { frame: null, children: [], get isConnected() { return host.isConnected; },
        getElementById(id) { return id === 'note' ? note : id === 'note-input-frame' ? noteFrame : this.frame; },
        prepend(frame) { frame.remove(); this.children.unshift(frame); frame.parentNode = this; this.frame = frame; if (!deferShieldLoad) frame.fire('load'); } };
    host.shadowRoot = shadow;
    const nodes = () => { const walk = element => [element, ...element.children.flatMap(walk)]; return walk(document.documentElement); };
    document.getElementById = id => nodes().find(element => element.id === id) || null;
    document.querySelectorAll = selector => selector === ':hover' ? [hovered] : nodes().filter(element =>
        selector.startsWith('#') ? element.id === selector.slice(1) : element.tagName === selector.split('[')[0].toUpperCase());
    document.querySelector = selector => document.querySelectorAll(selector)[0] || null;
    document.hasFocus = () => true;
    document.activeElement = { tagName: 'BUTTON' };
    document.createElement = tag => {
        const frame = new Element(tag);
        if (tag !== 'iframe') return frame;
        frame.contentWindow = new Events(); frame.contentWindow.focus = () => { focused.push('shield-window'); document.activeElement = frame; };
        frame.contentDocument = { body: { focus() { focused.push('shield-body'); document.activeElement = frame; } } };
        return frame;
    };
    const dragStyles = () => nodes().filter(element => element.tagName === 'STYLE' && /app-region\s*:\s*no-drag/.test(element.textContent));
    window.__atomsVisualAuditV5 = { input: { move: e => picked.push(['move', e.clientX]), click: e => picked.push(['click', e.clientX]), note: e => picked.push(['note', e.data.key]) } };
    window.__atomsAnnotationInputLockEmit = data => {
        const message = JSON.parse(data); messages.push(message);
        if (message.action === 'freeze') freezeStates.push({ styles: dragStyles().map(style => style.textContent), hostDrag: host.style.getPropertyValue('-webkit-app-region') });
        if (bindingFails) throw new Error('CDP binding is gone');
    };
    vm.runInNewContext(`(${installAnnotationInputLock})();`, { window, document, location: { href: 'https://store.steampowered.com/' }, performance,
        setTimeout: (fn, delay = 0) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
        MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe(target) { this.target = target; } disconnect() { this.disconnected = true; } } });
    const runTimers = delay => { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); } };
    return { window, document, host, shadow, note, noteFrame, messages, picked, hovered, focused, observers, freezeStates, dragStyles, runTimers, lock: window.__atomsAnnotationInputLockV1 };
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


test('opening a note releases the focused Alt shield before acquiring overlay input focus', () => {
    const f = fixture();
    f.window.fire('keydown', { key: 'Alt' });
    f.lock.activate(1);
    assert.equal(f.lock.isHeld(), true);
    f.note.style.display = 'block';
    f.observers.find(o => o.target === f.note).callback();
    assert.equal(f.lock.isHeld(), false);
    assert.equal(f.shadow.frame, null);
    assert.equal(f.dragStyles().length, 0);
    assert.equal(f.host.style.getPropertyValue('-webkit-app-region'), 'drag');
    assert.equal(f.host.style.getPropertyPriority('-webkit-app-region'), 'important');
    assert.deepEqual(f.messages.at(-1), { action: 'release', token: 1 });
    assert.deepEqual(f.focused, ['frame', 'input']);
    assert.equal(f.noteFrame.contentWindow.fire('keydown', { key: 'a' }).prevented, undefined);
    f.lock.stop();
    assert.ok(f.observers.every(o => o.disconnected));
});

test('iframe editing remains available until a native overlay editor is ready', () => {
    for (const hidden of [false, true]) {
        const f = fixture({ hidden }); f.note.style.display = 'block';
        assert.equal(f.noteFrame.contentWindow.fire('pointerdown').prevented, undefined);
        assert.deepEqual(f.focused, ['frame', 'input']);
        f.lock.stop(); f.focused.length = 0;
        f.noteFrame.contentWindow.fire('click');
        assert.deepEqual(f.focused, []);
    }
});

test('upgrading the input helper stops its old listeners and retains the existing editor', () => {
    let stops = 0;
    const f = fixture({ previous: { stop() { stops += 1; } } });
    assert.equal(stops, 1);
    assert.equal(f.lock.version, 8);
    f.note.style.display = 'block';
    f.noteFrame.contentWindow.fire('keydown', { key: 'Enter' });
    assert.deepEqual(f.picked, [['note', 'Enter']]);
    f.lock.stop();
});

test('the saved-note manager keeps Alt typing out of the annotation shield', () => {
    const f = fixture();
    f.window.__atomsAnnotationNoteManagerV1 = { isOpen: () => true };
    const event = f.window.fire('keydown', { key: 'Alt' });
    assert.equal(event.prevented, undefined);
    assert.equal(f.lock.isHeld(), false);
    assert.deepEqual(f.messages, []);
    assert.equal(f.shadow.frame, null);
    f.lock.stop();
});


test('regular Steam and web editors retain DOM focus without changing native overlay focus', () => {
    const f = fixture({ title: 'Steam' }); f.note.style.display = 'block';
    f.noteFrame.contentWindow.fire('pointerdown');
    assert.deepEqual(f.focused, ['frame', 'input']);
    f.lock.stop();
});


test('note focus delegates to the native Steam overlay editor when available', () => {
    const f = fixture(); f.note.style.display = 'block';
    f.window.__atomsAnnotationOverlayEditorV1 = { focus() { f.focused.push('native-popup'); return true; } };
    f.noteFrame.contentWindow.fire('pointerdown');
    assert.deepEqual(f.focused, ['native-popup']);
    f.lock.stop();
});


test('Alt activation and release leave Steam keyboard focus on the original menu control', () => {
    const f = fixture();
    const focusedControl = f.document.activeElement;
    f.window.fire('keydown', { key: 'Alt', altKey: true });
    assert.equal(f.lock.activate(f.lock.getToken()), true);
    assert.equal(f.document.activeElement, focusedControl);
    assert.deepEqual(f.focused, []);
    f.window.fire('keyup', { key: 'Alt', altKey: false });
    assert.equal(f.lock.isHeld(), false);
    assert.equal(f.shadow.frame, null);
    assert.equal(f.document.activeElement, focusedControl);
    assert.deepEqual(f.focused, []);
    f.lock.stop();
});

test('native drag is suspended synchronously before the hover-freeze round trip', () => {
    const f = fixture();
    f.window.fire('keydown', { key: 'Alt', altKey: true });
    assert.equal(f.shadow.frame, null);
    assert.equal(f.freezeStates.length, 1);
    assert.equal(f.freezeStates[0].styles.length, 1);
    const css = f.freezeStates[0].styles[0];
    assert.match(css, /html\s*\*/);
    assert.match(css, /html\s*\*::before/);
    assert.match(css, /html\s*\*::after/);
    assert.match(css, /-webkit-app-region\s*:\s*no-drag\s*!important/);
    assert.equal(f.freezeStates[0].hostDrag, 'no-drag');
    assert.equal(f.hovered.style.getPropertyValue('-webkit-app-region'), 'drag');
    f.lock.stop();
});

test('a fast primary Alt-click reaches the picker once while normal page gestures stay blocked', () => {
    const f = fixture(), activated = [];
    for (const type of ['click', 'wheel', 'dragstart', 'keydown']) f.window.addEventListener(type, () => activated.push(type));
    f.window.fire('keydown', { key: 'Alt', altKey: true });
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
        const event = f.window.fire(type, { altKey: true, button: 0, clientX: 64 });
        assert.equal(event.prevented, true);
    }
    assert.equal(f.shadow.frame, null);
    assert.deepEqual(f.picked, [['click', 64]]);
    for (const [type, fields] of [
        ['click', { button: 1 }], ['wheel', {}], ['dragstart', {}], ['dragover', {}], ['drop', {}], ['keydown', { key: 'x' }]
    ]) assert.equal(f.window.fire(type, { altKey: true, ...fields }).prevented, true);
    assert.deepEqual(f.picked, [['click', 64]], 'secondary clicks and drags do not select');
    assert.deepEqual(activated, []);
    f.window.fire('keyup', { key: 'Alt', altKey: false });
    f.window.fire('pointerdown', { altKey: false, button: 0 });
    assert.equal(f.window.fire('click', { altKey: false, button: 0 }).prevented, undefined);
    assert.deepEqual(activated, ['click']);
    f.lock.stop();
});

test('an unready shield leaves parent routing active and owns no native drag region', () => {
    const f = fixture({ deferShieldLoad: true });
    f.window.fire('keydown', { key: 'Alt', altKey: true });
    f.lock.activate(f.lock.getToken());
    const frame = f.shadow.frame;
    assert.equal(frame.style.getPropertyValue('pointer-events'), 'none');
    assert.equal(frame.style.getPropertyValue('-webkit-app-region'), 'no-drag');
    assert.match(frame.srcdoc, /-webkit-app-region\s*:\s*no-drag\s*!important/);
    assert.match(frame.srcdoc, /::before/);
    f.window.fire('click', { altKey: true, button: 0, clientX: 75 });
    assert.deepEqual(f.picked, [['click', 75]]);
    assert.equal(frame.style.getPropertyValue('pointer-events'), 'none', 'forwarding must not activate the unready child');
    frame.fire('load');
    assert.equal(frame.style.getPropertyValue('pointer-events'), 'auto');
    frame.contentWindow.fire('click', { altKey: true, button: 0, clientX: 80 });
    assert.deepEqual(f.picked, [['click', 75], ['click', 80]]);
    assert.deepEqual(f.focused, []);
    f.lock.stop();
});

test('shield transition events do not mistake synthetic lost modifiers for an Alt release', () => {
    const f = fixture();
    f.window.fire('keydown', { key: 'Alt', altKey: true });
    f.lock.activate(f.lock.getToken());
    for (const type of ['pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave']) {
        assert.equal(f.window.fire(type, { altKey: false }).prevented, true, type);
        assert.equal(f.lock.isHeld(), true, type);
        assert.equal(f.dragStyles().length, 1, type);
    }
    assert.deepEqual(f.picked, []);
    f.lock.stop();
});

test('every gesture ending path restores native drag declarations and removes the shield', () => {
    const cases = [
        ['Alt up', f => f.window.fire('keyup', { key: 'Alt', altKey: false })],
        ['parent Escape', f => f.window.fire('keydown', { key: 'Escape', altKey: true })],
        ['lost Alt', f => f.window.fire('mousemove', { altKey: false })],
        ['pagehide', f => f.window.fire('pagehide')],
        ['hidden', f => { f.document.hidden = true; f.document.fire('visibilitychange'); }],
        ['blur', f => { f.document.hasFocus = () => false; f.window.fire('blur'); f.runTimers(0); }],
        ['stop', f => f.lock.stop()],
        ['readiness timeout', f => f.runTimers(1500), true],
        ['unready shield timeout', f => f.runTimers(1500), false, { deferShieldLoad: true }],
    ];
    for (const [name, end, beforeActivation, options] of cases) {
        const f = fixture(options);
        f.window.fire('keydown', { key: 'Alt', altKey: true });
        if (!beforeActivation) f.lock.activate(f.lock.getToken());
        assert.equal(f.dragStyles().length, 1, name);
        const endingEvent = end(f);
        if (['parent Escape', 'lost Alt'].includes(name)) assert.equal(endingEvent.prevented, true, name);
        assert.equal(f.lock.isHeld(), false, name);
        assert.equal(f.shadow.frame, null, name);
        assert.equal(f.dragStyles().length, 0, name);
        assert.equal(f.host.style.getPropertyValue('-webkit-app-region'), 'drag', name);
        assert.equal(f.host.style.getPropertyPriority('-webkit-app-region'), 'important', name);
        assert.equal(f.hovered.style.getPropertyValue('-webkit-app-region'), 'drag', name);
        assert.equal(f.hovered.style.getPropertyPriority('-webkit-app-region'), 'important', name);
        assert.deepEqual(f.focused, [], name);
        f.lock.release(); // Cleanup is idempotent.
        f.lock.stop();
    }
});

test('a missing CDP binding fails open without leaving native drag disabled', () => {
    const f = fixture({ bindingFails: true });
    f.window.fire('keydown', { key: 'Alt', altKey: true });
    assert.equal(f.freezeStates[0].styles.length, 1);
    assert.equal(f.lock.isHeld(), false);
    assert.equal(f.dragStyles().length, 0);
    assert.equal(f.host.style.getPropertyValue('-webkit-app-region'), 'drag');
    assert.equal(f.host.style.getPropertyPriority('-webkit-app-region'), 'important');
    f.lock.stop();
});
