import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/utilities/libraryTileTilt.js', import.meta.url), 'utf8');
const install = vm.runInNewContext(source.replace('export default function', 'function') + '\ninstallLibraryTileTilt;');
const tileClass = '_1pwP4eeP1zQD7PEgmsep0W', hoverClass = '_54PuCatl_tYG836TOs4Mv';
const panelClass = 'WYgDg9NyCcMIVuMyZ_NBC', shineClass = 'MyNb5dG3FsBnKdp8j_ntk';
const marker = 'data-atoms-library-tile-tilt', x = '--atoms-library-tilt-x', y = '--atoms-library-tilt-y';
class Style {
    constructor() { this.values = new Map(); this.writes = 0; }
    getPropertyValue(k) { return this.values.get(k)?.value || ''; }
    getPropertyPriority(k) { return this.values.get(k)?.priority || ''; }
    setProperty(k, value, priority = '') { this.values.set(k, { value, priority }); this.writes++; }
    removeProperty(k) { this.values.delete(k); this.writes++; }
}
function events(object) {
    const listeners = new Map();
    object.addEventListener = (type, cb) => { const set = listeners.get(type) || new Set(); set.add(cb); listeners.set(type, set); };
    object.removeEventListener = (type, cb) => listeners.get(type)?.delete(cb);
    object.dispatch = (type, event = {}) => { for (const cb of [...listeners.get(type) || []]) cb({ type, ...event }); };
    object.listenerCount = () => [...listeners.values()].reduce((n, set) => n + set.size, 0);
    return object;
}
class Element {
    constructor(doc, classes = '') {
        this.doc = doc; this.nodeType = 1; this.children = []; this.parentElement = null;
        this.classes = new Set(classes.split(' ').filter(Boolean)); this.attributes = new Map(); this.style = new Style();
        this.classList = { contains: x => this.classes.has(x), add: x => this.classes.add(x), remove: x => this.classes.delete(x) };
    }
    matches(selector) { return selector.split(',').some(s => [...s.matchAll(/\.([\w-]+)/g)].every(m => this.classes.has(m[1]))); }
    closest(selector) { for (let e = this; e; e = e.parentElement) if (e.matches(selector)) return e; return null; }
    contains(target) { for (let e = target; e; e = e.parentElement) if (e === this) return true; return false; }
    querySelector(selector) { for (const e of this.children) { if (e.matches(selector)) return e; const nested = e.querySelector(selector); if (nested) return nested; } return null; }
    append(...children) { for (const e of children) { e.remove(); e.parentElement = this; this.children.push(e); } }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(e => e !== this); this.parentElement = null; }
    getAttribute(k) { return this.attributes.get(k) ?? null; }
    setAttribute(k, v) { this.attributes.set(k, v); }
    removeAttribute(k) { this.attributes.delete(k); }
    get isConnected() { return this.doc.documentElement.contains(this); }
    getBoundingClientRect() { return { left: 100, top: 50, width: 200, height: 300 }; }
}
function fixture() {
    const doc = events({ visibilityState: 'visible' }); doc.documentElement = new Element(doc); doc.body = new Element(doc, 'HighPerfMode'); doc.documentElement.append(doc.body);
    const motion = events({ matches: false }), frames = new Map(), observers = []; let nextFrame = 1;
    const win = events({ document: doc, matchMedia: () => motion,
        getComputedStyle: element => element.style,
        requestAnimationFrame(cb) { const id = nextFrame++; frames.set(id, cb); return id; },
        cancelAnimationFrame(id) { frames.delete(id); },
    });
    win.MutationObserver = class {
        constructor(cb) { this.cb = cb; this.connected = false; observers.push(this); }
        observe() { this.connected = true; } disconnect() { this.connected = false; }
    };
    const tile = () => {
        const outer = new Element(doc, `${tileClass} ${hoverClass}`), panel = new Element(doc, panelClass), shine = new Element(doc, shineClass), art = new Element(doc, 'native-art');
        panel.append(art, shine); outer.append(panel); doc.body.append(outer); return { outer, panel, shine, art };
    };
    const flush = () => { for (const [id, cb] of [...frames]) { frames.delete(id); cb(); } };
    const move = (t, clientX = 200, clientY = 200, extra = {}) => doc.dispatch('pointermove', { target: t.art, clientX, clientY, pointerType: 'mouse', buttons: 0, ...extra });
    return { doc, win, motion, frames, observers, tile, flush, move, emit: () => { for (const o of observers) if (o.connected) o.cb([]); } };
}

test('coalesces pointer movement and produces opposite bounded angles/shine offsets without changing art', () => {
    const f = fixture(), t = f.tile(), api = install(f.win);
    t.art.style.setProperty('opacity', '.333'); t.art.style.setProperty('transform', 'native'); t.shine.style.setProperty('background', 'custom-pride-gradient');
    f.move(t, 110, 65); f.move(t, 100, 50); assert.equal(f.frames.size, 1); f.flush();
    assert.equal(t.panel.style.getPropertyValue(x), '6.000deg'); assert.equal(t.panel.style.getPropertyValue(y), '-6.000deg');
    assert.equal(t.panel.style.getPropertyValue('--atoms-library-shine-x'), '-8.000%'); assert.equal(t.panel.getAttribute(marker), 'pointer');
    f.move(t, 9999, 9999); f.flush(); assert.equal(t.panel.style.getPropertyValue(x), '-6.000deg'); assert.equal(t.panel.style.getPropertyValue(y), '6.000deg');
    assert.equal(t.art.style.getPropertyValue('opacity'), '.333'); assert.equal(t.art.style.getPropertyValue('transform'), 'native'); assert.equal(t.shine.style.getPropertyValue('background'), 'custom-pride-gradient');
    assert.equal(t.panel.style.getPropertyValue('transform'), ''); api.stop();
});
test('restores exact preimages on exit and does not release for movement among tile descendants', () => {
    const f = fixture(), t = f.tile(), api = install(f.win); t.panel.style.setProperty(x, '1deg', 'important'); t.panel.setAttribute(marker, 'earlier');
    t.panel.style.setProperty('--atoms-library-tilt-base', '9deg', 'important');
    f.move(t); f.flush(); f.doc.dispatch('pointerout', { target: t.art, relatedTarget: t.shine }); assert.equal(api.isActive(), true);
    f.doc.dispatch('pointerout', { target: t.art, relatedTarget: null }); assert.equal(api.isActive(), false);
    assert.equal(t.panel.style.getPropertyValue(x), '1deg'); assert.equal(t.panel.style.getPropertyPriority(x), 'important'); assert.equal(t.panel.getAttribute(marker), 'earlier');
    assert.equal(t.panel.style.getPropertyValue('--atoms-library-tilt-base'), '9deg'); assert.equal(t.panel.style.getPropertyPriority('--atoms-library-tilt-base'), 'important');
    assert.equal(t.panel.style.getPropertyValue(y), ''); api.stop();
});
test('themeOFF, native low-performance and reduced-motion release active effects and gate new movement', () => {
    const f = fixture(), t = f.tile(), api = install(f.win);
    f.move(t); f.flush(); f.win.dispatch('atoms-theme-toggle', { detail: { disabled: true } }); assert.equal(t.panel.getAttribute(marker), null);
    f.move(t); assert.equal(f.frames.size, 0); f.win.dispatch('atoms-theme-toggle', { detail: { disabled: false } });
    f.move(t); f.flush(); f.doc.body.classList.add('LowPerfMode'); f.emit(); assert.equal(api.isActive(), false); f.move(t); assert.equal(f.frames.size, 0);
    f.doc.body.classList.remove('LowPerfMode'); f.move(t); f.flush(); f.motion.matches = true; f.motion.dispatch('change'); assert.equal(api.isActive(), false);
    f.move(t); assert.equal(f.frames.size, 0); f.motion.matches = false; f.move(t); f.flush(); assert.equal(api.isActive(), true); api.stop();
});
test('gamepad/basic UI, landscape, missing native sheen and disabled native hovers stay untouched', () => {
    for (const variant of ['GamepadMode', 'BasicUI', 'landscape', 'no-shine', 'dragging']) {
        const f = fixture(), t = f.tile(), api = install(f.win);
        if (['GamepadMode', 'BasicUI'].includes(variant)) f.doc.body.classList.add(variant);
        if (variant === 'landscape') t.panel.classList.add('_3VOR2AeYATx3qSE0I-Pm-5');
        if (variant === 'no-shine') t.shine.remove(); if (variant === 'dragging') t.outer.classList.remove(hoverClass);
        f.move(t); f.flush(); assert.equal(t.panel.getAttribute(marker), null, variant); assert.equal(t.panel.style.writes, 0, variant); api.stop();
    }
});
test('pointerdown/drag/touch/keyboard focus yield to native input without consuming any event', () => {
    for (const type of ['pointerdown', 'dragstart', 'keydown', 'pointercancel']) {
        const f = fixture(), t = f.tile(), api = install(f.win); f.move(t); f.flush(); f.doc.dispatch(type, { target: t.art }); assert.equal(api.isActive(), false, type); api.stop();
    }
    const f = fixture(), t = f.tile(), api = install(f.win); f.move(t, 200, 200, { pointerType: 'touch' }); assert.equal(f.frames.size, 0);
    f.move(t, 200, 200, { buttons: 1 }); assert.equal(f.frames.size, 0); api.stop();
});
test('detached/recycled tiles and a replaced native sheen restore only the old owner', () => {
    const f = fixture(), t = f.tile(), next = f.tile(), api = install(f.win); f.move(t); f.flush(); t.outer.remove(); f.emit();
    assert.equal(api.isActive(), false); assert.equal(t.panel.getAttribute(marker), null);
    f.move(next); f.flush(); next.shine.remove(); f.emit(); assert.equal(api.isActive(), false); assert.equal(next.panel.getAttribute(marker), null); api.stop();
    const g = fixture(), old = g.tile(), destination = g.tile(), moved = install(g.win); g.move(old); g.flush();
    destination.outer.append(old.panel); g.emit(); assert.equal(moved.isActive(), false); assert.equal(old.panel.getAttribute(marker), null); moved.stop();
});
test('later inline/marker owners are preserved rather than overwritten by another frame or stop', () => {
    const f = fixture(), t = f.tile(), api = install(f.win); f.move(t); f.flush(); t.panel.style.setProperty(y, '44deg', 'important');
    f.move(t, 120, 80); f.flush(); assert.equal(api.isActive(), false); assert.equal(t.panel.style.getPropertyValue(y), '44deg'); assert.equal(t.panel.style.getPropertyPriority(y), 'important');
    f.move(t); f.flush(); t.panel.setAttribute(marker, 'later'); f.move(t); f.flush(); assert.equal(api.isActive(), false); assert.equal(t.panel.getAttribute(marker), 'later'); api.stop();
});
test('BFCache/visibility and stop cancel queued frames; reinstall is idempotent with no idle observer', () => {
    const f = fixture(), t = f.tile(), api = install(f.win); assert.equal(install(f.win), api); assert.equal(f.observers.length, 1); assert.equal(f.observers[0].connected, false);
    f.move(t); assert.equal(f.frames.size, 1); f.win.dispatch('pagehide'); assert.equal(f.frames.size, 0); assert.equal(f.observers[0].connected, false);
    f.move(t); assert.equal(f.frames.size, 0); f.win.dispatch('pageshow'); f.move(t); f.flush(); assert.equal(api.isActive(), true);
    f.doc.visibilityState = 'hidden'; f.doc.dispatch('visibilitychange'); assert.equal(api.isActive(), false);
    f.doc.visibilityState = 'visible'; f.move(t); api.stop(); f.flush(); assert.equal(t.panel.getAttribute(marker), null);
    assert.equal(f.doc.listenerCount() + f.win.listenerCount() + f.motion.listenerCount(), 0); assert.equal(f.win.__atomsLibraryTileTiltV1, undefined);
});

test('live slider changes scale native pitch, pointer rotation and shine together at 0/100/200 percent', () => {
    const f = fixture(), t = f.tile(), api = install(f.win);
    for (const [percent, base, angle, shine] of [['0%', '0.000deg', '0.000deg', '0.000%'], ['100%', '3.000deg', '6.000deg', '-8.000%'], ['200%', '6.000deg', '12.000deg', '-16.000%']]) {
        f.doc.documentElement.style.setProperty('--libraryTileTiltIntensity', percent); f.move(t, 100, 50); f.flush();
        assert.equal(t.panel.style.getPropertyValue('--atoms-library-tilt-base'), base);
        assert.equal(t.panel.style.getPropertyValue(x), angle); assert.equal(t.panel.style.getPropertyValue('--atoms-library-shine-x'), shine);
        assert.equal(install(f.win), api); assert.equal(f.observers.length, 1);
    }
    f.move(t, 100, 50); f.doc.documentElement.style.setProperty('--libraryTileTiltIntensity', '50%'); f.flush();
    assert.equal(t.panel.style.getPropertyValue('--atoms-library-tilt-base'), '1.500deg'); assert.equal(t.panel.style.getPropertyValue(x), '3.000deg'); api.stop();
    assert.equal(t.panel.style.getPropertyValue('--atoms-library-tilt-base'), '');
});
test('missing, malformed and nonfinite slider values fall back to 100 percent; finite values are clamped', () => {
    const f = fixture(), t = f.tile(), api = install(f.win);
    for (const value of ['', 'NaN%', 'Infinity%', '1e309%', '100garbage%', '100', 'calc(50% + 50%)']) {
        f.doc.documentElement.style.setProperty('--libraryTileTiltIntensity', value); f.move(t, 100, 50); f.flush();
        assert.equal(t.panel.style.getPropertyValue('--atoms-library-tilt-base'), '3.000deg', value);
        assert.equal(t.panel.style.getPropertyValue(x), '6.000deg', value);
    }
    for (const [value, expected] of [['-10%', '0.000deg'], ['250%', '6.000deg'], [' 25.5% ', '.765deg']]) {
        f.doc.documentElement.style.setProperty('--libraryTileTiltIntensity', value); f.move(t, 100, 50); f.flush();
        assert.equal(Number.parseFloat(t.panel.style.getPropertyValue('--atoms-library-tilt-base')), Number.parseFloat(expected), value);
    }
    api.stop();
});
test('installing the intensity-aware API safely replaces the prior version and remains idempotent', () => {
    const f = fixture(); let stopped = 0;
    f.win.__atomsLibraryTileTiltV1 = { version: 1, stopped: false, stop() { stopped++; } };
    const api = install(f.win); assert.equal(stopped, 1); assert.equal(api.version, 2); assert.equal(install(f.win), api); api.stop();
});
