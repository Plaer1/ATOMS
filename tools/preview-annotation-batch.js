#!/usr/bin/env node
'use strict';

// One-shot local cascade/layout preview: native Steam CSS plus the actual
// theme stylesheet. It never connects to or modifies the Steam capture.
const http = require('http');
const fs = require('fs');
const path = require('path');
const themeRoot = path.resolve(__dirname, '..');
const nativeRoot = 'https://store.fastly.steamstatic.com/public/';
const html = `<!doctype html><html><head><meta charset="utf-8">
<title>ATOMS annotation batch 1 preview</title>
<link rel="stylesheet" href="${nativeRoot}shared/css/motiva_sans.css">
<link rel="stylesheet" href="${nativeRoot}shared/css/shared_global.css">
<link rel="stylesheet" href="${nativeRoot}shared/css/buttons.css">
<link rel="stylesheet" href="${nativeRoot}css/v6/store.css?v=ODdGIzDVKFLu">
<link rel="stylesheet" href="${nativeRoot}css/home.css?v=Z0AWZztObpaH">
<link rel="stylesheet" href="/css/webkit.css">
<style>
body#preview { margin:0; padding:24px; color:#eee; font:14px/1.5 sans-serif; }
#preview h1 { font-size:20px; margin:0 0 6px; }
#preview main { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; margin-top:18px; }
#preview section { min-width:0; padding:10px; border:1px solid #555; border-radius:5px; }
#preview h2 { margin:0 0 8px; font:600 13px/1.5 sans-serif; }
#preview .sample { padding:12px; min-height:44px; box-sizing:border-box; }
#preview .home_tabs_columns { display:block; min-height:0; }
#preview .tab_row_item { padding:8px; margin-bottom:6px; }
#preview .store_capsule_container .discount_block { display:flex; position:static; margin:0; padding:0; }
#preview .discount_prices { display:flex; gap:6px; padding:4px; }
#preview .discount_pct { padding:4px; }
#preview .ds_wishlist_flag { display:block; position:static; width:95px; padding:5px; }
#preview .creator_actions { display:flex; gap:6px; }
#preview .curator_capsule_name { font-size:14px; }
#preview .curator_capsule_blurb { width:220px; line-height:20px; }
#preview .creator_capsule_ctn { padding:12px; }
#preview .creator_follow_btn img { width:16px; height:16px; }
</style></head><body id="preview" class="v6 v7">
<h1>Store annotation batch 1 — cascade and layout check</h1>
<p>Native Steam styles with the saved ATOMS stylesheet. This is an isolated preview.</p>
<main>
<section><h2>Carousel canvas / promotional corner</h2>
<div id="hero" class="_3gVAXLzTzt5xCjFA1_c9rn sample">Neutral carousel text and canvas</div>
<div id="corner" class="tqaXEuWN2wV5_8lmSkMng _8UPO4fZBxxerbhcRBpAcc sample">Pink wash ending in grey</div>
<div id="badge" class="znNVIhFP6KdJlUS2p2B7q sample">Three-stop pink label</div></section>
<section><h2>Recommendation / update backgrounds</h2>
<div id="key-tags" class="deep_dive_key_tags sample">Recommendation tags</div>
<div id="updated" class="recently_updated_desc sample">Recently updated</div>
<div id="widget-header" class="_2-tz2hqtOXPPtMnVPHNSdx WidgetHeaderCtn sample">Widget header fade</div></section>
<section><h2>Steam Deck background layers</h2><div id="home_deck_content">
<div id="deck" class="home_deck_section ctn_background sample">Neutral layered background</div></div></section>
<section class="store_capsule_container"><h2>Price contrast / native green discount</h2>
<div id="price" class="discount_block discount_block_inline">
<div id="sale-badge" class="discount_pct">-50%</div><div class="discount_prices">
<div id="original-price" class="discount_original_price">$19.99</div>
<div id="final-price" class="discount_final_price">$9.99</div></div></div>
<div id="wishlist" class="ds_flag ds_wishlist_flag">Wishlisted</div></section>
<section><h2>Grey rows / lighter selected row</h2><div class="home_tabs_columns">
<a id="row-default" class="tab_row_item"><div class="tab_item_name">Normal row</div></a>
<a id="row-active" class="tab_row_item focus"><div class="tab_item_name">Selected row</div></a></div></section>
<section><h2>Home-card wishlist / options hover</h2>
<a class="home_content_item" style="display:block;position:relative;min-height:50px"><div id="wide-wishlist" class="ds_flag ds_wishlist_flag">On Wishlist</div></a>
<div id="options-hover" class="ds_options" style="position:relative;opacity:1;right:0;width:40px;height:30px"><div></div></div></section>
<section><h2>Grey creator / follow controls / pink checkmark</h2>
<div id="creator" class="creator_capsule_ctn"><div>From developers and publishers you know</div><div class="creator_actions">
<button id="follow-off" class="creator_follow_btn btnv6_white_transparent btn_small_thin"><span>Follow</span></button>
<button id="follow-on" class="creator_follow_btn btnv6_white_transparent btn_small_thin following"><span>
<img id="tick" src="https://store.akamai.steamstatic.com/public/images/v6/ico/ico_selected.png">Following</span></button>
</div></div></section>
<section><h2>Curator descriptions size to their text</h2><div id="apps_recommended_by_curators_v2">
<div id="curator-small" class="curator_capsule_ctn"><div class="curator_capsule_name">Short description</div>
<div id="curator-short-text" class="curator_capsule_blurb">A short recommendation.</div></div>
<div id="curator-long" class="curator_capsule_ctn"><div class="curator_capsule_name">Longer description</div>
<div id="curator-long-text" class="curator_capsule_blurb">A longer recommendation to check that the card grows with its text and does not reserve five blank lines for every short description.</div></div>
</div></section>
<section><h2>Approved gift-card hue rotation</h2>
<img id="gift" class="home_gift_card_img" src="https://cdn.akamai.steamstatic.com/store/home/gc_fan.webp" width="138" height="76"></section>
</main></body></html>`;

const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
    const file = path.resolve(themeRoot, '.' + pathname);
    if (!file.startsWith(themeRoot + path.sep) || !file.endsWith('.css')) { response.writeHead(404).end(); return; }
    fs.readFile(file, (error, data) => {
        if (error) { response.writeHead(404).end(); return; }
        response.setHeader('Content-Type', 'text/css; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(data);
    });
});
server.listen(0, '127.0.0.1', () => console.log(`http://127.0.0.1:${server.address().port}/`));
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
