import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isProfileLanding, isSteamworks } from '../js/utilities/pageRoutes.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../skin.json', import.meta.url), 'utf8'));
const filesFor = target => manifest.Patches.filter(patch => new RegExp(patch.MatchRegexString).test(target))
    .flatMap(patch => [patch.TargetCss, patch.TargetJs].flat().filter(Boolean));

for (const path of ['/id/Pleyar1', '/id/Pleyar1/', '/profiles/76561198000000000', '/profiles/76561198000000000/']) {
    for (const suffix of ['', '?l=english', '#comments']) test(`profile landing is accent-only: ${path}${suffix}`, () => {
        const url = new URL(`https://steamcommunity.com${path}${suffix}`);
        assert.equal(isProfileLanding(url), true);
        assert.deepEqual(filesFor(url.href), ['css/profileAccents.css', 'js/webkit.js']);
    });
}
for (const route of [
    'https://steamcommunity.com/id/Pleyar1/games',
    'https://steamcommunity.com/profiles/76561198000000000/achievements/570',
    'https://steamcommunity.com/groups/fp',
    'https://steamcommunity.com/app/570',
    'https://steamcommunity.com/sharedfiles/filedetails/?id=123',
    'https://store.steampowered.com/app/570/',
    'https://store.steampowered.com/dlc/1850570/',
    'https://store.steampowered.com/charts/mostplayed',
]) test(`full theme retained: ${route}`, () => {
    assert.equal(isProfileLanding(new URL(route)), false);
    assert.deepEqual(filesFor(route), ['css/webkit.css', 'js/webkit.js']);
});
test('Support retains its extra sheet; partner and embedded videos have isolated entries', () => {
    assert.deepEqual(filesFor('https://help.steampowered.com/en/'), ['css/webkit.css', 'js/webkit.js', 'css/supportText.css']);
    assert.equal(isSteamworks(new URL('https://partner.steamgames.com/steamdirect')), true);
    assert.deepEqual(filesFor('https://partner.steamgames.com/steamdirect'), ['css/steamworksText.css', 'js/webkit.js']);
    for (const host of ['www.youtube.com', 'www.youtube-nocookie.com']) {
        assert.deepEqual(filesFor(`https://${host}/embed/xyz?autoplay=0`), ['css/youtube.css']);
    }
    assert.equal(manifest['Steam-WebKit'], undefined, 'unconditional hook would defeat route exclusions');
    assert.equal(manifest.webkitJS, undefined);
});
test('native Steam and detached window hooks remain reachable', () => {
    for (const title of ['Steam', 'Sign in to Steam', 'notificationtoasts_1', 'SteamBrowser_Find']) {
        assert.ok(filesFor(title).includes('css/library.css'), title);
    }
    assert.ok(filesFor('SP Overlay: 570').includes('css/inGameOverlay.css'));
    assert.ok(filesFor('Steam Big Picture Mode').includes('css/bigpicture.css'));
    assert.ok(filesFor('Controller Layout').includes('css/controller.css'));
    assert.ok(filesFor('contextMenu').includes('css/menus.css'));
});
