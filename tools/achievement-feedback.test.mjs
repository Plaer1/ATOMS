import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import installAchievementSparkles from '../js/utilities/achievementSparkles.js';

const require = createRequire(import.meta.url);
const postcss = require('postcss');
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const achievementCSS = read('css/achievements.css');
const ast = postcss.parse(achievementCSS);
const declarations = selector => {
    const result = [];
    ast.walkRules(rule => {
        if (rule.selector === selector) rule.walkDecls(d => result.push([d.prop, d.value, d.important]));
    });
    return result;
};

test('achievement CSS is imported and background aliases resolve at the root', () => {
    assert.match(read('css/webkit.css'), /@import url\('achievements\.css'\)/);
    assert.ok(declarations(':root').some(([name, value]) => name === '--atoms-achievement-panel' && value === 'rgb(var(--backgroundLightish))'));
    assert.match(achievementCSS, /background-color: var\(--atoms-achievement-panel\)/);
});

test('base and pseudo-fill progress use accent without recoloring distinct variants', () => {
    assert.match(achievementCSS, /\.EQqxstseYOM-:not\(\.gll5nH8jh6w-\)/);
    assert.match(achievementCSS, /\.Ipalm5ENV44-:not\(\._0XQXm1s6RWA-\)/);
    assert.ok(declarations('.cJQvFpktOuY-:not(._-4HvMTVx8TY-)').some(([name, value]) => name === '--color-progress-bar-foreground' && value === 'rgb(var(--accent))'));
});

test('trophy gradients retain their mask paint, alpha and shape fills', () => {
    assert.match(achievementCSS, /svg > g > path\[fill="#1A9FFF" i\]/);
    assert.match(achievementCSS, /stop\[stop-color="#1465CF" i\]/);
    assert.doesNotMatch(achievementCSS, /stop-opacity\s*:|(?:mask|clipPath)[^{]*\{\s*fill\s*:/);
    assert.doesNotMatch(achievementCSS, /hue-rotate|grayscale|brightness/);
});

test('native and added sparkles use accentLightest and respect reduced motion', () => {
    assert.match(achievementCSS, /color: rgb\(var\(--accentLightest\)\)/);
    assert.match(achievementCSS, /:where\(\.J1gNXqOLM6A-\).*data-atoms-achievement-sparkles/);
    const reduced = [];
    ast.walkAtRules('media', media => {
        if (media.params === '(prefers-reduced-motion: reduce)') media.walkDecls(d => reduced.push(d));
    });
    assert.ok(reduced.some(d => d.prop === 'display' && d.value === 'none' && d.important));
});

test('Profile Games sort buttons and selected underline are covered', () => {
    assert.match(achievementCSS, /\.e1OlraMtN2w- button:not\(\.unlHdc1q06Q-\)/);
    assert.ok(declarations('a.aMOYGh7hnLQ-.xm0ps8RlGjM-').some(([name, value]) => name === 'border-bottom-color' && value === 'rgb(var(--accent))'));
});

test('approved group logo uses one exact source selector, not a generic avatar class', () => {
    const media = postcss.parse(read('css/mediaSelections.css'));
    const matching = [];
    media.walkRules(r => { if (r.selector.includes('9b62d03b03693bbffa90947d8435f5238ea86cac')) matching.push(r); });
    assert.equal(matching.length, 1);
    assert.equal(matching[0].selector, 'img[src="https://avatars.fastly.steamstatic.com/9b62d03b03693bbffa90947d8435f5238ea86cac_full.jpg"]');
    assert.equal(matching[0].nodes.find(d => d.prop === 'filter').value, 'var(--accentFilter)');
});

test('Community underline fixes change color without adding border geometry', () => {
    const webkit = postcss.parse(read('css/webkit.css'));
    for (const selector of ['.group_tabs > .responsive_hidden', '.sectionTabs.item > .sectionTab']) {
        const rule = webkit.nodes.find(r => r.selector === selector);
        assert.deepEqual(rule.nodes.map(d => d.prop), ['border-bottom-color']);
        assert.equal(rule.nodes[0].value, 'rgb(var(--accent))');
    }
});

test('idle thumbs are transparent and interaction restores accent without hiding scrollbars', () => {
    const css = postcss.parse(read('css/scrollbars.css'));
    const thumb = css.nodes.find(r => r.selector === '::-webkit-scrollbar-thumb');
    assert.equal(thumb.nodes.find(d => d.prop === 'background-color').value, 'transparent');
    const active = css.nodes.find(r => r.selector?.includes(':focus-within'));
    assert.equal(active.nodes.find(d => d.prop === 'background-color').value, 'rgb(var(--accent))');
    assert.ok(active.selector.includes(':hover'));
    assert.doesNotMatch(read('css/scrollbars.css'), /display\s*:\s*none|width\s*:\s*0[; ]/);
    assert.match(read('css/library.css'), /\._1UXC2lGcmNTGepRJTwtuH0\s*\{\s*background-color: rgb\(var\(--background\)\)/);
});

// Structural doubles only; screenshots/computed styles in Steam RDP provide
// visual acceptance for these selectors and their native SVG animations.
class Element {
    constructor(classes = '', tag = 'div') {
        this.className = classes; this.tagName = tag; this.nodeType = 1;
        this.children = []; this.attrs = new Map(); this.styles = new Map();
        this.style = { setProperty: (k, v) => this.styles.set(k, v) };
    }
    get isConnected() { return this.tagName === 'body' || Boolean(this.parent?.isConnected); }
    appendChild(node) { node.parent = this; this.children.push(node); return node; }
    setAttribute(k, v) { this.attrs.set(k, v); }
    matches(selector) {
        if (selector.startsWith('[')) return this.attrs.has(selector.slice(1, -1));
        return [...selector.matchAll(/\.([\w-]+)/g)].every(m => this.className.split(' ').includes(m[1]));
    }
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector); }
    querySelectorAll(selector) {
        const parts = selector.split(' '), last = parts.pop();
        return this.children.flatMap(node => [
            ...(node.matches(last) && (!parts.length || node.parent?.closest(parts.join(' '))) ? [node] : []),
            ...node.querySelectorAll(selector)
        ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
    cloneNode(deep) {
        const node = new Element(this.className, this.tagName);
        node.attrs = new Map(this.attrs); node.styles = new Map(this.styles);
        if (deep) for (const child of this.children) node.appendChild(child.cloneNode(true));
        return node;
    }
    remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
}

function fixture({ source = true, pathname = '/id/test/achievements/440' } = {}) {
    const body = new Element('', 'body'), observers = [], listeners = new Map();
    const badge = body.appendChild(new Element('YdwpRPPithE- tQWKFb1QLD0-'));
    const ordinary = body.appendChild(new Element('YdwpRPPithE-'));
    const sourceHost = body.appendChild(new Element('baoabtDhz7Y-'));
    const sourceLayer = new Element('lDp-l-8FD9A-');
    for (let i = 0; i < 4; i++) sourceLayer.appendChild(new Element('_8ULQdRr0jAM-', 'svg'));
    if (source) sourceHost.appendChild(sourceLayer);
    const window = { addEventListener: (n, fn) => listeners.set(n, fn), removeEventListener: n => listeners.delete(n) };
    const document = { body, querySelector: s => body.querySelector(s), querySelectorAll: s => body.querySelectorAll(s) };
    const context = { window, document, location: { pathname }, MutationObserver: class {
        constructor(fn) { this.fn = fn; observers.push(this); }
        observe() { this.active = true; }
        disconnect() { this.active = false; }
    } };
    const run = () => vm.runInNewContext(`(${installAchievementSparkles.toString()})()`, context);
    return { body, badge, ordinary, sourceHost, sourceLayer, observers, listeners, run };
}

test('rare badges reuse native stars once without replacing ordinary badges', () => {
    const f = fixture(), api = f.run();
    assert.equal(f.run(), api);
    assert.equal(f.observers.length, 1);
    assert.equal(f.badge.children.length, 1);
    assert.equal(f.badge.children[0].children.length, 4);
    assert.equal(f.badge.children[0].styles.get('display'), 'none');
    assert.equal(f.ordinary.children.length, 0);
    f.observers[0].fn([{ addedNodes: [f.badge.children[0], { nodeType: 3 }] }]);
    assert.equal(f.badge.children.length, 1);
    api.stop();
    assert.equal(f.badge.children.length, 0);
    assert.equal(f.sourceHost.children[0], f.sourceLayer);
    assert.equal(f.observers[0].active, false);
});

test('late native source and newly virtualized rows are decorated without polling', () => {
    const f = fixture({ source: false }); f.run();
    assert.equal(f.badge.children.length, 0);
    f.sourceHost.appendChild(f.sourceLayer);
    f.observers[0].fn([{ addedNodes: [f.sourceLayer] }]);
    assert.equal(f.badge.children.length, 1);
    const next = f.body.appendChild(new Element('YdwpRPPithE- tQWKFb1QLD0-'));
    f.observers[0].fn([{ addedNodes: [next] }]);
    assert.equal(next.children.length, 1);
});

test('non-achievement routes allocate no sparkle observer', () => {
    const f = fixture({ pathname: '/id/test/games' });
    assert.equal(f.run(), null);
    assert.equal(f.observers.length, 0);
    assert.equal(f.badge.children.length, 0);
});
