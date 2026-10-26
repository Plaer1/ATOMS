import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/utilities/transparentGames.js', import.meta.url), 'utf8');
const install = vm.runInNewContext(source.replace('export default function', 'function') + '\ntransparentGames;');
const tileClass = '_1pwP4eeP1zQD7PEgmsep0W', artClass = '_24_AuLm54JVe1Zc0AApCDR';
const markerClass = '_8YrRmy_c6O0FCxFT8gjqo', wrapperClass = '_1R9r2OBCxAmtuUVrgBEUBw';
const owned = 'var(--transparentGameOpacity)';
class Style {
    constructor() { this.values = new Map(); this.writes = 0; }
    getPropertyValue(k) { return this.values.get(k)?.value || ''; }
    getPropertyPriority(k) { return this.values.get(k)?.priority || ''; }
    setProperty(k, value, priority = '') { this.values.set(k, { value, priority }); this.writes++; }
    removeProperty(k) { const old = this.getPropertyValue(k); this.values.delete(k); this.writes++; return old; }
}
class Element {
    constructor(doc, tag = 'div', classes = '') {
        this.doc = doc; this.nodeType = 1; this.tagName = tag.toUpperCase(); this.classes = new Set(classes.split(/\s+/).filter(Boolean));
        this.children = []; this.parentElement = null; this.style = new Style(); this.tileScans = 0;
        this.classList = { contains: c => this.classes.has(c), add: c => this.classes.add(c), remove: c => this.classes.delete(c) };
    }
    matches(selector) {
        return selector.split(',').some(part => {
            part = part.trim(); const tag = part.match(/^[a-z]+/i)?.[0];
            return (!tag || tag.toUpperCase() === this.tagName) && [...part.matchAll(/\.([\w-]+)/g)].every(m => this.classes.has(m[1]));
        });
    }
    closest(selector) { for (let e = this; e; e = e.parentElement) if (e.matches(selector)) return e; return null; }
    querySelectorAll(selector) {
        if (selector === '.' + tileClass) this.tileScans++;
        const out = []; const visit = e => { for (const child of e.children) { if (child.matches(selector)) out.push(child); visit(child); } }; visit(this); return out;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    append(...children) { for (const child of children) { child.remove(); child.parentElement = this; this.children.push(child); } }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(e => e !== this); this.parentElement = null; }
    get isConnected() { for (let e = this; e; e = e.parentElement) if (e === this.doc.documentElement) return true; return false; }
}
function events(object) {
    const listeners = new Map();
    object.addEventListener = (type, callback, options) => { const list = listeners.get(type) || []; list.push({ callback, once: options?.once }); listeners.set(type, list); };
    object.removeEventListener = (type, callback) => listeners.set(type, (listeners.get(type) || []).filter(l => l.callback !== callback));
    object.dispatch = (type, detail) => { for (const entry of [...(listeners.get(type) || [])]) { entry.callback({ type, detail }); if (entry.once) object.removeEventListener(type, entry.callback); } };
    object.listenerCount = () => [...listeners.values()].reduce((n, list) => n + list.length, 0);
    return object;
}
function fixture({ root = true } = {}) {
    const doc = events({ documentElement: null, body: null });
    doc.querySelector = sel => doc.documentElement && (doc.documentElement.matches(sel) ? doc.documentElement : doc.documentElement.querySelector(sel));
    const observers = []; const win = events({ document: doc, getComputedStyle: e => ({ backgroundImage: e.backgroundImage || 'none' }) });
    win.MutationObserver = class {
        constructor(callback) { this.callback = callback; this.connected = false; this.observations = 0; observers.push(this); }
        observe() { this.connected = true; this.observations++; }
        disconnect() { this.connected = false; }
        emit(mutations) { if (this.connected) this.callback(mutations); }
    };
    const mount = () => { doc.documentElement = new Element(doc, 'html'); doc.body = new Element(doc, 'body'); doc.documentElement.append(doc.body); };
    if (root) mount();
    const tile = ({ uninstalled = true, opacity, priority = '', image = true } = {}) => {
        const element = new Element(doc, 'div', tileClass), wrapper = new Element(doc, 'div', wrapperClass), art = image ? new Element(doc, 'img', artClass) : wrapper;
        const marker = new Element(doc, 'div', markerClass); if (image) wrapper.append(art); element.append(wrapper); if (uninstalled) element.append(marker);
        if (opacity !== undefined) art.style.setProperty('opacity', opacity, priority); doc.body.append(element); return { element, wrapper, art, marker };
    };
    const emit = mutations => observers.at(-1).emit(mutations);
    return { doc, win, observers, mount, tile, emit, element: (tag, classes) => new Element(doc, tag, classes) };
}

test('dims capsule art only and restores opacity value/priority without touching layout', () => {
    const f = fixture(), t = f.tile({ opacity: '.4', priority: 'important' });
    t.art.style.setProperty('transform', 'translateX(7px)'); t.art.style.setProperty('width', '171px');
    const api = install(f.win);
    assert.equal(t.art.style.getPropertyValue('opacity'), owned); assert.equal(t.art.style.getPropertyPriority('opacity'), 'important');
    assert.equal(t.element.style.getPropertyValue('opacity'), ''); assert.equal(t.art.style.getPropertyValue('transform'), 'translateX(7px)');
    api.stop(); assert.equal(t.art.style.getPropertyValue('opacity'), '.4'); assert.equal(t.art.style.getPropertyPriority('opacity'), 'important');
    assert.equal(t.art.style.getPropertyValue('width'), '171px'); assert.equal(f.win.__atomsTransparentGamesV1, undefined);
});

test('progress child alone is not a state marker; native uninstalled bar and image-backed capsule are supported', () => {
    const f = fixture(), t = f.tile({ uninstalled: false }), progress = f.element('div', 'mA39Hqv8LacDppegb_Q_Z'); t.element.append(progress);
    const background = f.tile({ image: false }); background.art.backgroundImage = 'url(native-capsule)';
    const api = install(f.win); assert.equal(t.art.style.getPropertyValue('opacity'), ''); assert.equal(background.art.style.getPropertyValue('opacity'), owned);
    const bar = f.element('div', 'kX-tIJx4a9vKVuUkKJARv'); bar.append(progress); t.element.append(bar);
    f.emit([{ type: 'childList', target: t.element, addedNodes: [bar] }]); assert.equal(t.art.style.getPropertyValue('opacity'), owned); api.stop();
});

test('asynchronous badge insertion/removal reconciles the ancestor tile and restores installed art', () => {
    const f = fixture(), t = f.tile({ uninstalled: false, opacity: '.9' }), api = install(f.win);
    t.wrapper.append(t.marker); f.emit([{ type: 'childList', target: t.wrapper, addedNodes: [t.marker] }]); assert.equal(t.art.style.getPropertyValue('opacity'), owned);
    t.marker.remove(); f.emit([{ type: 'childList', target: t.wrapper, addedNodes: [] }]); assert.equal(t.art.style.getPropertyValue('opacity'), '.9'); api.stop();
});

test('recycled art and removed tiles release detached targets without leaking inline dimming', () => {
    const f = fixture(), t = f.tile({ opacity: '.6' }), api = install(f.win), next = f.element('img', artClass);
    t.art.remove(); t.wrapper.append(next); f.emit([{ type: 'childList', target: t.wrapper, addedNodes: [next] }]);
    assert.equal(t.art.style.getPropertyValue('opacity'), '.6'); assert.equal(next.style.getPropertyValue('opacity'), owned);
    t.element.remove(); f.emit([{ type: 'childList', target: f.doc.body, addedNodes: [] }]); assert.equal(next.style.getPropertyValue('opacity'), ''); api.stop();
});

test('a later opacity owner is neither fought nor overwritten by refresh/stop', () => {
    const f = fixture(), t = f.tile(), api = install(f.win); t.art.style.setProperty('opacity', '.87', 'important');
    f.emit([{ type: 'attributes', target: t.art, attributeName: 'style' }]); api.refresh(); assert.equal(t.art.style.getPropertyValue('opacity'), '.87');
    api.stop(); assert.equal(t.art.style.getPropertyValue('opacity'), '.87'); assert.equal(t.art.style.getPropertyPriority('opacity'), 'important');
});

test('reinstall is idempotent and dirty-tile mutations do not rescan the whole Library', () => {
    const f = fixture(), t = f.tile(), api = install(f.win); assert.equal(install(f.win), api); assert.equal(f.observers.length, 1); assert.equal(f.observers[0].observations, 1);
    const scans = f.doc.documentElement.tileScans, writes = t.art.style.writes;
    f.emit([{ type: 'attributes', target: t.art, attributeName: 'style' }]); assert.equal(f.doc.documentElement.tileScans, scans); assert.equal(t.art.style.writes, writes); api.stop();
});

test('Big Picture and theme comparison suspend/restore art, then desktop/ON resumes', () => {
    const f = fixture(), t = f.tile({ opacity: '.8' }), api = install(f.win);
    f.doc.body.classList.add('GamepadMode'); f.emit([{ type: 'attributes', target: f.doc.body }]); assert.equal(t.art.style.getPropertyValue('opacity'), '.8');
    f.doc.body.classList.remove('GamepadMode'); f.emit([{ type: 'attributes', target: f.doc.body }]); assert.equal(t.art.style.getPropertyValue('opacity'), owned);
    f.win.dispatch('atoms-theme-toggle', { disabled: true }); assert.equal(t.art.style.getPropertyValue('opacity'), '.8');
    f.win.dispatch('atoms-theme-toggle', { disabled: false }); assert.equal(t.art.style.getPropertyValue('opacity'), owned); api.stop(); assert.equal(f.win.listenerCount(), 0);
});

test('BFCache hide restores/disconnects and show rescans without duplicating the owner', () => {
    const f = fixture(), t = f.tile({ opacity: '.3' }), api = install(f.win);
    f.win.dispatch('pagehide'); assert.equal(t.art.style.getPropertyValue('opacity'), '.3'); assert.equal(f.observers[0].connected, false);
    f.win.dispatch('pageshow'); assert.equal(t.art.style.getPropertyValue('opacity'), owned); assert.equal(f.observers.length, 1); assert.equal(f.observers[0].connected, true); api.stop();
});

test('early DOM installation waits safely; stop before readiness prevents a late install', () => {
    const f = fixture({ root: false }), api = install(f.win); f.mount(); const t = f.tile(); f.doc.dispatch('DOMContentLoaded'); assert.equal(t.art.style.getPropertyValue('opacity'), owned); api.stop();
    const g = fixture({ root: false }), stopped = install(g.win); stopped.stop(); g.mount(); const untouched = g.tile(); g.doc.dispatch('DOMContentLoaded'); assert.equal(untouched.art.style.getPropertyValue('opacity'), ''); assert.equal(g.observers[0].connected, false);
});


test('a connected element reused outside the tile role releases its prior art opacity', () => {
    const f = fixture(), t = f.tile({ opacity: '.72' }), api = install(f.win);
    t.element.classList.remove(tileClass); f.emit([{ type: 'attributes', target: t.element, attributeName: 'class' }]);
    assert.equal(t.art.style.getPropertyValue('opacity'), '.72'); api.stop();
});
