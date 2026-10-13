#!/usr/bin/env node
'use strict';

// Isolated cascade fixture using the installed Steam CSS and saved ATOMS CSS.
// Does not connect to Steam, run a monitor, or perform any Steam actions.
const fs = require('fs');
const path = require('path');
const http = require('http');
const root = path.resolve(__dirname, '..');
const steamCSS = path.resolve(root, '../../../steamui/css');
const html = `<!doctype html><html><head><meta charset="utf-8">
<title>ATOMS Big Picture annotation checks</title>
<link rel="stylesheet" href="/native/library.css"><link rel="stylesheet" href="/native/sp.css">
<link rel="stylesheet" href="/css/bigpicture.css">
<style>
body#fixture{padding:24px;box-sizing:border-box;overflow:auto;font:16px/1.5 sans-serif}
#fixture h1{font-size:22px;margin:0 0 6px}#fixture h2{font-size:17px;margin:0 0 14px}
#fixture main{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:22px}
#fixture section{padding:20px;border:1px solid #3d3d3d;min-width:0}
#fixture .DialogContent{padding:0;display:block}#fixture button{margin:8px 0}
#fixture ._21qvBvPytuUH_A5_jX87K5{margin:0;padding:16px}
#fixture .row{display:flex;gap:16px;align-items:center;margin-bottom:14px}
#fixture ._38sNQt6oEVaeO9D-gI_Lhl{width:46px}#fixture #header_profile{padding:10px;background:#262626}
#fixture .avatarStatus{width:5px;height:30px}#fixture .sample-avatar{padding:4px 12px;color:#e5dde5}
</style></head><body id="fixture" class="BasicUI">
<h1>Big Picture — annotation checks</h1>
<p>Isolated checks with native Steam CSS + saved ATOMS stylesheet. No artwork is recolored.</p>
<main>
<section><h2>Dialog controls</h2><div class="_16sYNwqxz6giarbVaRUl7R DialogContent">
<button id="normal" class="DialogButton _1pqdnNXI2o4kBW6FVZDAvX">Default button</button>
<button id="focused" class="DialogButton _1pqdnNXI2o4kBW6FVZDAvX gpfocus">Controller focus</button>
<button id="primary" class="DialogButton _1pqdnNXI2o4kBW6FVZDAvX Primary">Primary button</button>
<button id="primary-focus" class="DialogButton _1pqdnNXI2o4kBW6FVZDAvX Primary gpfocus">Primary focused</button>
<button id="disabled" disabled class="DialogButton _1pqdnNXI2o4kBW6FVZDAvX Primary gpfocus Disabled">Disabled remains disabled</button>
</div></section>
<section><h2>Context menu</h2><div class="BasicUIContextMenu"><div class="oZw50c4oJ6-r0HP8UWv25">
<div id="menu-normal" class="_34o03-8cUc3fQX1u650c0L contextMenuItem">Normal entry</div>
<div id="menu-focus" class="_34o03-8cUc3fQX1u650c0L contextMenuItem _2XVTVAadkIvrBujZYN5jbL">Focused entry</div>
<div id="menu-checked" class="_34o03-8cUc3fQX1u650c0L contextMenuItem menuChecked">Checked entry</div>
<div id="menu-disabled" class="_34o03-8cUc3fQX1u650c0L contextMenuItem _2XVTVAadkIvrBujZYN5jbL disabled">Disabled entry</div>
</div></div></section>
<section><h2>Compatibility filter sheet</h2><div id="sheet" class="_21qvBvPytuUH_A5_jX87K5">
<div class="_6J6XVDtXd6mSzS5-QxxYl">Compatibility</div><div class="SELChOvVALTWJkZ_f6Fdm">
<div id="filter-row" class="O7cW3FbZwmFjlnkBXHSAc"><div id="radio" class="_10D3YZA1PCzTRlBpDUg_Tb"></div><div>Unselected option</div></div>
<div id="filter-focus" class="O7cW3FbZwmFjlnkBXHSAc _2wFsakmtWPcbhLMPqVG19h _16qJV6_2HQdlW7H3Uu14sP gpfocus"><div id="radio-selected" class="_10D3YZA1PCzTRlBpDUg_Tb"></div><div>Selected option<div id="description" class="_1Fjvh-xtvO3Po31DV9mEz">Neutral description on a grey focused row.</div></div></div>
</div></div></section>
<section><h2>Status colors</h2><div class="row"><div id="friends" class="_38sNQt6oEVaeO9D-gI_Lhl _15VplG8ZhNCYs8IUwaufpO mHKj-UeGQdjT9lC0rOGdq">3</div><span>Friends count · theme green</span></div>
<div class="row"><div id="header_profile"><div class="avatarHolder online row"><span class="sample-avatar">Avatar unchanged</span><div id="status" class="avatarStatus"></div></div></div><span>Online strip · pink</span></div>
</section>
<section><h2>Collection-card backplates</h2>
<div style="display:flex;gap:12px;align-items:flex-start">
<div class="_1pwP4eeP1zQD7PEgmsep0W _54PuCatl_tYG836TOs4Mv" style="width:120px;height:180px">
<div id="portrait-card" class="WYgDg9NyCcMIVuMyZ_NBC _1Pf6J2JFkZ-oRpe0_7cabJ _3ANruIVwRSgaU7L1eWRnf8" style="width:120px;height:180px">
<div id="portrait-backplate" class="_1R9r2OBCxAmtuUVrgBEUBw _2E7G8grj_-tgxXbTXs1t2E _3Ehhd5MxErV_bXQE4qVhzB _2IYf7aM4eYQ2Oh-ntmzHbm _13w3SEbKLJRUhSyoGQZze8 _3QIfJmcfmiE8FBFu3iB1Nb"></div>
<div class="_2BOmkMg4r689AAjdLObYs2"><div class="_2GRcKrPZsMSF6glMPRMZei"><span>Portrait</span></div></div></div></div>
<div class="_1pwP4eeP1zQD7PEgmsep0W _54PuCatl_tYG836TOs4Mv _3Lu_5jVxDAvsdeGpBzaQAt" style="width:120px;height:180px">
<div id="square-card" class="WYgDg9NyCcMIVuMyZ_NBC _1Pf6J2JFkZ-oRpe0_7cabJ _3ANruIVwRSgaU7L1eWRnf8" style="width:120px;height:180px">
<div id="square-backplate" class="_1R9r2OBCxAmtuUVrgBEUBw _2E7G8grj_-tgxXbTXs1t2E _3Ehhd5MxErV_bXQE4qVhzB _2IYf7aM4eYQ2Oh-ntmzHbm _13w3SEbKLJRUhSyoGQZze8 _3QIfJmcfmiE8FBFu3iB1Nb"></div>
<div class="_2BOmkMg4r689AAjdLObYs2"><div class="_2GRcKrPZsMSF6glMPRMZei"><span>Square</span></div></div></div></div>
</div></section>
<section><h2>Soundtrack Play button</h2><div class="_22Q27ULX8FrTAxrt3fLxn1"><div class="_23WS1avBGZoqC160AY_xbC">
<button id="soundtrack" class="_2TWHMJvrhtyyuTse9Rqwps DialogButton _DialogLayout Primary cXzBZxhPBl7fZs9LODEnc">Play soundtrack</button>
<button id="soundtrack-focus" class="_2TWHMJvrhtyyuTse9Rqwps DialogButton _DialogLayout Primary cXzBZxhPBl7fZs9LODEnc gpfocus">Controller focus</button>
<button id="soundtrack-disabled" disabled class="_2TWHMJvrhtyyuTse9Rqwps DialogButton _DialogLayout Primary cXzBZxhPBl7fZs9LODEnc Disabled gpfocus">Disabled</button>
</div></div></section>
</main></body></html>`;
const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
    const native = pathname.startsWith('/native/');
    const base = native ? steamCSS : root;
    const file = path.resolve(base, '.' + (native ? pathname.slice(7) : pathname));
    if (!file.startsWith(base + path.sep) || !file.endsWith('.css')) { res.writeHead(404).end(); return; }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end(); return; }
        res.setHeader('Content-Type', 'text/css'); res.setHeader('Cache-Control', 'no-store'); res.end(data);
    });
});
server.listen(0, '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port + '/'));
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
