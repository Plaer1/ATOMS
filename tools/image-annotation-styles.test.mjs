import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const postcss = require('postcss');
const read = name => fs.readFileSync(new URL('../css/' + name, import.meta.url), 'utf8');
const rules = name => {
    const result = [];
    postcss.parse(read(name)).walkRules(rule => result.push(rule));
    return result;
};
const value = (rule, prop) => rule.nodes.find(node => node.prop === prop)?.value;

test('Millennium description uses a neutral theme grey, not accented text', () => {
    const rule = rules('library.css').find(rule => rule.selector === '.MillenniumWindow_MainSteamWindow .MillenniumThemes_Description');
    assert.equal(value(rule, 'color'), 'rgba(var(--greyLightest), .65)');
});

test('notifications retain a neutral card and transparent decorative highlights', () => {
    const all = rules('library.css');
    const card = all.find(rule => rule.selector === ':root ._1OOQPJx0nCNP9ME9toCmV7');
    assert.equal(value(card, 'background-color'), 'rgb(var(--backgroundDarkish))');
    assert.equal(value(card, 'background-image'), 'none');
    assert.equal(value(card, 'box-shadow'), 'none');
    assert.equal(value(card, 'filter'), 'none');
    const glow = all.find(rule => rule.selector.includes('._1OOQPJx0nCNP9ME9toCmV7::before'));
    assert.equal(value(glow, 'background'), 'transparent');
    assert.equal(value(glow, 'opacity'), '0');
    const watermark = all.find(rule => rule.selector.includes('._3RkGkNRNheAkoRA3migph5'));
    assert.equal(value(watermark, 'color'), 'rgb(var(--greyLightest))');
    assert.ok(!value(watermark, 'opacity'));
    assert.ok(!value(watermark, 'display'));
    assert.ok(!value(watermark, 'visibility'));
    const bell = all.find(rule => rule.selector.includes(':root .RtSv39ZoBOySnb8XQ5hJf:hover'));
    assert.equal(value(bell, 'background'), 'transparent');
    assert.equal(value(bell, 'box-shadow'), 'none');
    const selection = rules('mediaSelections.css').find(rule => rule.selector.includes('._1OOQPJx0nCNP9ME9toCmV7'));
    assert.equal(value(selection, 'filter'), 'none');
    assert.ok(!value(card, 'opacity'));
    assert.ok(!card.selector.includes('img'));
});

test('tile backings are neutral and only the exact native fallback SVG is hidden', () => {
    const fallback = rules('gameArtworkFallback.css');
    assert.equal(fallback.length, 2);
    assert.equal(fallback[0].selector, '._1R9r2OBCxAmtuUVrgBEUBw');
    const source = fallback[1].selector.match(/src="([^"]+)"/)[1];
    const decoded = Buffer.from(source.split(',')[1], 'base64').toString();
    assert.match(decoded, /#184E7B 0%/);
    assert.match(decoded, /#001427 74\.5192%/);
    assert.equal(value(fallback[0], 'background-color'), 'rgb(var(--backgroundLightish))');
    assert.equal(value(fallback[0], 'background-image'), 'none');
    assert.equal(value(fallback[1], 'visibility'), 'hidden');
    assert.ok(!read('gameArtworkFallback.css').includes('display: none'));
    assert.ok(!fallback.some(rule => value(rule, 'filter')));
    for (const sheet of ['library.css', 'bigpicture.css']) {
        assert.match(read(sheet), /@import url\('gameArtworkFallback\.css'\)/);
    }
});

test('startup tint is source-scoped and composes with the native gutter blur', () => {
    const startup = rules('bigpicture.css').filter(rule => rule.selector.includes('bigpicture_startup.webm'));
    assert.equal(startup.length, 2);
    assert.equal(value(startup[0], 'filter'), 'var(--accentFilter)');
    assert.equal(value(startup[1], 'filter'), 'blur(16px) var(--accentFilter)');
    for (const rule of startup) assert.match(rule.selector, /\.j78ibJaZ9aRJEMt_g81_F/);
    assert.match(startup[0].selector, /deck_boot_transition\.png/);
});

test('Favorite retains all four sprite states without filtering the button', () => {
    const favorite = rules('annotationBatch2.css').filter(rule => rule.selector.includes('#FavoriteItemBtn') && rule.selector.endsWith('::before'));
    assert.deepEqual(favorite.map(rule => value(rule, 'mask-position')), ['0 0', '0 -30px', '0 -60px', '0 -90px']);
    assert.match(value(favorite[0], 'mask-image'), /ico_fav_tiled\.png/);
    assert.equal(value(favorite[0], 'background-color'), 'rgb(var(--accent))');
    assert.equal(value(favorite[0], 'pointer-events'), 'none');
    assert.ok(!rules('annotationBatch2.css').some(rule => rule.selector.includes('#FavoriteItemBtn') && value(rule, 'filter')));
});

test('avatar repair removes frame backing without hiding or tinting avatar pixels', () => {
    const rule = rules('annotationBatch2.css').find(rule => rule.selector === 'html body .playerAvatar .profile_avatar_frame img');
    assert.equal(value(rule, 'background-image'), 'none');
    assert.equal(value(rule, 'background-color'), 'transparent');
    assert.ok(!value(rule, 'filter'));
    assert.ok(!value(rule, 'display'));
});

test('responsive search overrides prevent the submit icon escaping its frame', () => {
    const all = rules('annotationBatch2.css');
    const frame = all.find(rule => rule.selector === 'html body :is(.searchTextContainer, .discussionSearchTextContainer)');
    const icon = all.find(rule => rule.selector.endsWith('> :is(.searchTextSubmitImg, .discussionSearchTextSubmitImg)'));
    assert.equal(value(frame, 'height'), '46px');
    assert.equal(value(frame, 'background-image'), 'none');
    assert.equal(value(icon, 'left'), 'auto');
    assert.equal(value(icon, 'right'), '4px');
});
