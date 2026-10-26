import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { applyGrayscaleBackgroundToEl, renderedBackdropHeight } from '../js/utilities/greyscaleBackground.js';

const require = createRequire(import.meta.url);
const postcss = require('postcss');
const artwork = 'url("https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/570/page_bg_generated_v6b.jpg")';

// These doubles cover extraction and layer ownership. Real Steam screenshots
// and computed styles remain the acceptance check for the native layout.
function fixture(t, image = artwork) {
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'warn', () => {});
    const saved = new Map(['document', 'window', 'getComputedStyle', 'Image'].map(key => [key, globalThis[key]]));
    t.after(() => { for (const [key, value] of saved) globalThis[key] = value; });
    const events = [], elements = [], images = [];
    class Element {
        constructor(tag) {
            this.tagName = tag.toUpperCase(); this.dataset = {}; this.attrs = new Map();
            this.inlineWrites = [];
            this.style = { backgroundImage: '', getPropertyValue: () => '',
                setProperty: (key, value) => this.inlineWrites.push([key, value]) };
            this.isConnected = false; this.content = '';
            this.clientWidth = 948; this.clientHeight = 0;
        }
        setAttribute(key, value) {
            this.attrs.set(key, String(value));
            if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
        }
        getAttribute(key) {
            if (key.startsWith('data-')) return this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] ?? null;
            return this.attrs.get(key) ?? null;
        }
        set innerHTML(value) { this.content = value; }
        get innerHTML() { return this.content; }
        set textContent(value) { this.content = value; }
        get textContent() { return this.content; }
    }
    const matches = (element, selector) => {
        const tag = selector.match(/^[a-z]+/i)?.[0];
        if (tag && element.tagName !== tag.toUpperCase()) return false;
        return [...selector.matchAll(/\[([^=\]]+)(?:=["']([^"']*)["'])?\]/g)]
            .every(([, key, value]) => value === undefined ? element.getAttribute(key) !== null : element.getAttribute(key) === value);
    };
    const element = new Element('div'); element.isConnected = true; elements.push(element);
    const body = new Element('body'); body.isConnected = true; elements.push(body);
    const root = new Element('html'); root.isConnected = true; elements.push(root);
    const styles = [];
    globalThis.document = {
        body, documentElement: root,
        createElement: tag => new Element(tag),
        querySelector: selector => elements.find(node => matches(node, selector)) ?? null,
        querySelectorAll: selector => elements.filter(node => matches(node, selector)),
        head: { appendChild(style) { events.push('install'); style.isConnected = true; styles.push(style); elements.push(style); return style; } },
    };
    globalThis.window = {};
    globalThis.Image = class {
        constructor() { this.naturalWidth = 0; this.naturalHeight = 0; images.push(this); }
        set src(value) { this.url = value; }
        get src() { return this.url; }
        load(width = 1600, height = 900) {
            this.naturalWidth = this.width = width; this.naturalHeight = this.height = height;
            this.complete = true; this.onload?.();
        }
    };
    const state = { image };
    globalThis.getComputedStyle = target => {
        events.push('read');
        return { position: 'static', backgroundImage: target === element ? state.image : 'none',
            background: target === element ? state.image : 'none',
            backgroundPosition: 'left top', backgroundSize: 'auto', backgroundRepeat: 'repeat' };
    };
    return { element, body, root, styles, state, events, images };
}

const parse = styles => postcss.parse(styles.map(style => style.textContent).join('\n'));
const declaration = (rule, property) => rule.nodes.find(node => node.prop === property);

test('CSS-sourced artwork is captured before its unfiltered original is suppressed', t => {
    const f = fixture(t);
    assert.equal(applyGrayscaleBackgroundToEl(f.element, '.apphub_background', { opacityRole: 'pageBackdropOpacity' }), true);
    assert.ok(f.events.indexOf('read') < f.events.indexOf('install'));
    const rules = parse(f.styles).nodes;
    const layer = rules.find(rule => rule.selector?.endsWith('::before'));
    const original = rules.find(rule => declaration(rule, 'background-image')?.value === 'none');
    assert.equal(declaration(layer, 'background-image').value, artwork);
    assert.equal(declaration(layer, 'opacity').value, 'var(--pageBackdropOpacity, 1)');
    assert.ok(original, 'only hide the native image after a replacement layer exists');
    assert.match(original.selector, /data-grayscale-anchor/);
});

test('missing artwork leaves the original element and stylesheet list untouched', t => {
    const f = fixture(t, 'none');
    assert.equal(applyGrayscaleBackgroundToEl(f.element, '.apphub_background'), false);
    assert.equal(f.styles.length, 0);
    assert.equal(f.element.getAttribute('data-grayscale-anchor'), null);
    assert.equal(f.element.dataset.grayscaleSource, undefined);
    assert.equal(f.element.style.position, undefined);
});

test('reapplying after native suppression reuses the same artwork and layer', t => {
    const f = fixture(t);
    applyGrayscaleBackgroundToEl(f.element, '.apphub_background');
    const anchor = f.element.getAttribute('data-grayscale-anchor');
    f.state.image = 'none'; // The installed anchor rule now owns the native image.
    assert.equal(applyGrayscaleBackgroundToEl(f.element, '.apphub_background'), true);
    assert.equal(f.element.getAttribute('data-grayscale-anchor'), anchor);
    assert.equal(f.styles.length, 1);
    const layers = parse(f.styles).nodes.filter(rule => rule.selector?.endsWith('::before'));
    assert.equal(layers.length, 1);
    assert.equal(declaration(layers[0], 'background-image').value, artwork);
});

test('grayscale and fading belong to the decorative layer, never its foreground', t => {
    const f = fixture(t);
    applyGrayscaleBackgroundToEl(f.element, '.apphub_background');
    const css = parse(f.styles), effects = [];
    css.walkDecls(/^(filter|opacity)$/, decl => effects.push(decl));
    assert.equal(effects.length, 2);
    for (const effect of effects) assert.match(effect.parent.selector, /::before$/);
    const layer = effects[0].parent;
    assert.equal(declaration(layer, 'pointer-events').value, 'none');
    assert.match(declaration(layer, 'filter').value, /var\(--storeBackdropFilter/);
    assert.equal(declaration(layer, 'opacity').value, 'var(--storeBackdropOpacity, 1)');
});

test('page artwork is sized independently of an empty source and fades on its own layer', t => {
    const f = fixture(t);
    const opts = { pageArtwork: true, opacityRole: 'pageBackdropOpacity' };
    assert.equal(applyGrayscaleBackgroundToEl(f.element, '.apphub_background', opts), true);
    assert.equal(f.images.length, 1);
    f.images[0].load(1600, 1000); // Deliberately differs from the initial 16:9 fallback.
    const css = parse(f.styles), rules = css.nodes;
    const layer = rules.find(rule => rule.selector === 'body::before');
    assert.ok(layer, 'a zero-height apphub must not own the decorative layer dimensions');
    assert.equal(declaration(layer, 'background-image').value, artwork);
    assert.equal(declaration(layer, 'position').value, 'absolute');
    assert.equal(declaration(layer, 'height').value, 'auto');
    assert.equal(declaration(layer, 'width').value, '100%');
    assert.equal(declaration(layer, 'background-size').value, '100% auto');
    assert.equal(declaration(layer, 'background-repeat').value, 'no-repeat');
    const [width, height] = declaration(layer, 'aspect-ratio').value.split('/').map(Number);
    assert.equal(width / height, 1600 / 1000);
    assert.equal(declaration(layer, 'mask-image').value, 'var(--pageBackdropMask, none)');
    assert.equal(declaration(layer, 'opacity').value, 'var(--pageBackdropOpacity, 1)');
    assert.equal(declaration(layer, 'z-index').value, '-1');
    assert.equal(declaration(layer, 'pointer-events').value, 'none');
    const canvas = rules.find(rule => rule.selector === 'body');
    assert.equal(declaration(canvas, 'isolation').value, 'isolate');
    assert.match(declaration(canvas, 'background-color').value, /var\(--background\)/);
    assert.ok(!rules.some(rule => rule.selector.includes('> *')), 'foreground positioning stays native');
});

test('page source suppression is reversible with its one marked layer and repeat calls retain its URL', t => {
    const f = fixture(t), opts = { pageArtwork: true, opacityRole: 'pageBackdropOpacity' };
    applyGrayscaleBackgroundToEl(f.element, '.apphub_background', opts);
    f.images[0].load();
    f.state.image = 'none';
    assert.equal(applyGrayscaleBackgroundToEl(f.element, '.apphub_background', opts), true);
    assert.equal(f.styles.length, 1);
    assert.equal(f.styles[0].dataset.atomsVisualEffect, 'grayscale-background');
    const rules = parse(f.styles).nodes;
    const layers = rules.filter(rule => rule.selector === 'body::before');
    assert.equal(layers.length, 1);
    assert.equal(declaration(layers[0], 'background-image').value, artwork);
    const original = rules.find(rule => rule.selector.includes('data-grayscale-anchor') &&
        declaration(rule, 'background-image')?.value === 'none');
    assert.ok(original);
    assert.equal(declaration(original, 'background-color').value, 'transparent');
    assert.equal(declaration(original, 'background-color').important, true);
    for (const element of [f.element, f.body]) {
        assert.equal(element.style.backgroundImage, '');
        assert.ok(!element.inlineWrites.some(([key]) => key.startsWith('background')),
            'native artwork must return when its marked effect stylesheet is disabled');
    }
});

test('missing page source does not alter the canvas or start an image request', t => {
    const f = fixture(t, 'none');
    assert.equal(applyGrayscaleBackgroundToEl(f.element, '.apphub_background', { pageArtwork: true }), false);
    assert.equal(f.styles.length, 0);
    assert.equal(f.images.length, 0);
    assert.equal(f.element.getAttribute('data-grayscale-anchor'), null);
    assert.equal(f.body.style.position, undefined);
    assert.deepEqual(f.body.inlineWrites, []);
    assert.equal(f.element.style.backgroundImage, '');
});

test('a native URL followed by an empty background layer remains a valid image URL', t => {
    const f = fixture(t, `${artwork}, none`);
    assert.equal(applyGrayscaleBackgroundToEl(f.element, '.apphub_background', { pageArtwork: true }), true);
    assert.equal(f.images.length, 1);
    assert.equal(f.images[0].src, artwork.slice(5, -2));
    f.images[0].load();
    const layer = parse(f.styles).nodes.find(rule => rule.selector === 'body::before');
    assert.equal(declaration(layer, 'background-image').value, artwork);
    assert.equal(f.styles[0].dataset.grayscaleSource, artwork);
});

test('auto-sized artwork ends at its bitmap height even when the sale page grows', () => {
    for (const boxHeight of [900, 3785, 9000]) {
        assert.equal(renderedBackdropHeight(1828, 643, 'auto', 1886, boxHeight), 643);
    }
});

test('explicit background sizing uses the dimension that CSS specifies', () => {
    const expectedWidthScale = 1886 / 1828 * 643;
    const actualWidthScale = renderedBackdropHeight(1828, 643, '100% auto', 1886, 3785);
    assert.ok(Math.abs(actualWidthScale - expectedWidthScale) < 1e-9);
    assert.equal(renderedBackdropHeight(1828, 643, 'auto 50%', 1886, 3785), 1892.5);
    assert.equal(renderedBackdropHeight(1828, 643, '1200px 480px', 1886, 3785), 480);
});

test('cover and contain preserve the image aspect ratio against different limiting dimensions', () => {
    const widthLimitedHeight = 1886 / 1828 * 643;
    assert.ok(Math.abs(renderedBackdropHeight(1828, 643, 'contain', 1886, 3785) - widthLimitedHeight) < 1e-9);
    assert.equal(renderedBackdropHeight(1828, 643, 'cover', 1886, 3785), 3785);
});
