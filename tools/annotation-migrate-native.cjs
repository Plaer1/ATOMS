#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');

function fail(message) { throw new Error(message); }
function sourceSnapshot(file) {
    const bytes = fs.readFileSync(file);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (_) { fail('Source JSONL is not valid UTF-8.'); }
    return { bytes, text, hash: crypto.createHash('sha256').update(bytes).digest('hex') };
}
function parseJsonlText(text) {
    if (typeof text !== 'string') fail('Source must be UTF-8 JSONL text.');
    if (!text.trim()) return [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (lines.at(-1) === '') lines.pop();
    return lines.map((line, index) => {
        if (!line.trim()) fail(`Blank JSONL record at line ${index + 1}.`);
        let value;
        try { value = JSON.parse(line); } catch (_) { fail(`Malformed JSONL record at line ${index + 1}.`); }
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`JSONL record ${index + 1} must be an object.`);
        return value;
    });
}
function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}
function legacyId(record) {
    const sourceId = record.__atomsNote?.id;
    const text = canonical(typeof sourceId === 'string' && sourceId ? { sourceId } : { record });
    const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
    const hashes = seeds.map((seed, index) => {
        let hash = seed >>> 0;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i) + index;
            hash = Math.imul(hash, 0x01000193 + (index * 2));
            hash ^= hash >>> (13 + index);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    });
    return `atoms-legacy-${hashes.join('')}`;
}
function activeRows(records) {
    const active = [];
    const keyFor = record => {
        const payload = record.payload || {};
        if (payload.selectionId) return `selection:${payload.selectionId}`;
        return JSON.stringify([record.target?.id, record.url, payload.asset?.id]);
    };
    for (const record of records) {
        if (record.payload?.selected === false) {
            const key = keyFor(record);
            for (let i = active.length - 1; i >= 0; i--) if (keyFor(active[i]) === key) active.splice(i, 1);
        } else active.push(record);
    }
    const seen = new Set();
    return active.filter(row => { const key = canonical(row); if (seen.has(key)) return false; seen.add(key); return true; });
}
function validateResult(result, records, dryRun) {
    const expectedRows = activeRows(records), expected = expectedRows.length;
    const expectedIds = expectedRows.map(legacyId);
    if (!result || result.ok !== true || result.dryRun !== dryRun || result.inputRows !== records.length ||
        result.expectedRecords !== expected || result.metadataVerified !== true || result.preservedExisting !== true ||
        !Array.isArray(result.ids) || result.ids.length !== (dryRun ? 0 : expected) || result.ids.some(id => !/^atoms-legacy-[a-f0-9]{32}$/.test(id)) ||
        (!dryRun && result.ids.some((id, index) => id !== expectedIds[index])) ||
        !Number.isInteger(result.added) || result.added < 0 || result.added > expected || !Number.isInteger(result.beforeCount) ||
        !Number.isInteger(result.afterCount) || result.afterCount !== result.beforeCount + result.added) {
        fail(`Steam migration verification did not pass (${JSON.stringify({ expected, dryRun, resultDryRun: result?.dryRun, inputRows: result?.inputRows, expectedRecords: result?.expectedRecords, added: result?.added, beforeCount: result?.beforeCount, afterCount: result?.afterCount, idCount: result?.ids?.length, idValid: result?.ids?.every(id => /^atoms-legacy-[a-f0-9]{32}$/.test(id)), metadataVerified: result?.metadataVerified, preservedExisting: result?.preservedExisting, arithmetic: result?.afterCount === result?.beforeCount + result?.added })}).`);
    }
    if (dryRun && result.added !== 0) fail('Dry-run unexpectedly reported writes.');
    return { inputRows: records.length, expectedRecords: expected, added: result.added, existing: expected - result.added, ids: result.ids };
}
async function getJson(url) {
    const client = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
        const request = client.get(url, response => {
            let body = '';
            response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
            response.on('end', () => {
                if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error('CDP target listing unavailable.'));
                try { resolve(JSON.parse(body)); } catch (_) { reject(new Error('CDP target listing was invalid.')); }
            });
        });
        request.setTimeout(3000, () => request.destroy(new Error('CDP endpoint timed out.')));
        request.on('error', () => reject(new Error('CDP endpoint unavailable.')));
    });
}
function expressionFor(records, dryRun) {
    const payload = JSON.stringify(records).replace(/</g, '\\u003c');
    return `(async()=>{try{
      const rows=${payload};
      const entries=performance.getEntriesByType('resource').map(x=>x.name);
      const menuUrl=entries.find(x=>/\\/js\\/annotation\\/menu\\.js(?:[?#]|$)/.test(x));
      if(!menuUrl)return {ok:false,reason:'module-missing'};
      const moduleUrl=new URL('./store.js',menuUrl).href;
      const mod=await import(moduleUrl), store=mod.annotationStore;
      if(!store||typeof store.importLegacy!=='function'||typeof store.list!=='function')return {ok:false,reason:'module-missing'};
      const before=store.list();
      const active=[];
      const key=r=>r.payload?.selectionId?'selection:'+r.payload.selectionId:JSON.stringify([r.target?.id,r.url,r.payload?.asset?.id]);
      for(const r of rows){if(r.payload?.selected===false){const k=key(r);for(let i=active.length-1;i>=0;i--)if(key(active[i])===k)active.splice(i,1);}else active.push(r);}
      const canon=v=>Array.isArray(v)?'['+v.map(canon).join(',')+']':v&&typeof v==='object'?'{' + Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}':JSON.stringify(v);
      const unique=[...new Map(active.map(r=>[canon(r),r])).values()];
      if(${dryRun ? 'true' : 'false'})return {ok:true,dryRun:true,inputRows:rows.length,expectedRecords:unique.length,added:0,beforeCount:before.length,afterCount:before.length,ids:[],metadataVerified:true,preservedExisting:true};
      const imported=store.importLegacy(rows), after=store.list(), ids=[];
      for(const source of unique){const found=after.find(n=>n.legacyRecord&&canon(n.legacyRecord)===canon(source));
        if(!found||!/^atoms-legacy-[a-f0-9]{32}$/.test(found.id)||canon(found.legacyRecord)!==canon(source))return {ok:false,reason:'metadata-mismatch'};
        const expectedMode=source.colorMode==='dark'||source.colorMode==='light'?source.colorMode:(source.payload?.colorMode==='dark'||source.payload?.colorMode==='light'?source.payload.colorMode:null);
        const expectedNote=typeof source.payload?.note==='string'?source.payload.note:(typeof source.note==='string'?source.note:'');
        const expectedTs=Number.isFinite(Number(source.ts))&&Number(source.ts)>0?Number(source.ts):Date.parse(source.timestamp);
        const asset=source.payload?.asset||{}, target=source.target||{};
        let expectedRoute=source.route;
        if(typeof expectedRoute!=='string'||!expectedRoute){try{const u=new URL(source.url||target.urlAtAttach||target.url);expectedRoute=u.host+u.pathname;}catch(_){expectedRoute=source.title||target.titleAtAttach||target.title||'legacy:unknown-route';}}
        const expectedWindow=source.windowId||source.window?.name||target.windowId||target.name||target.id||target.titleAtAttach||target.title||source.title||('legacy:'+expectedRoute);
        const expectedSelector=asset.selector||source.selector, expectedContext=asset.context||source.context||expectedSelector;
        if(found.note!==expectedNote||found.colorMode!==expectedMode||found.ts!==expectedTs||found.route!==expectedRoute||found.windowId!==String(expectedWindow)||found.selector!==expectedSelector||found.context!==expectedContext)return {ok:false,reason:'metadata-mismatch'};
        ids.push(found.id);
      }
      const unchanged=before.every(old=>after.some(now=>now.id===old.id&&canon(now)===canon(old)));
      const newlyExpected=unique.filter(source=>!before.some(old=>canon(old.legacyRecord)===canon(source))).length;
      if(!unchanged||imported.added!==newlyExpected||after.length!==before.length+newlyExpected)return {ok:false,reason:'store-verification-failed'};
      return {ok:true,dryRun:false,inputRows:rows.length,expectedRecords:unique.length,added:imported.added,beforeCount:before.length,afterCount:after.length,ids,metadataVerified:true,preservedExisting:unchanged};
    }catch(_){return {ok:false,reason:'storage-or-import-failed'};}})()`;
}
async function connectCdp(endpoint, targetId, WebSocketImpl) {
    const targets = await getJson(new URL('/json/list', endpoint));
    const target = targets.find(item => {
        if (item.id !== targetId || item.type !== 'page' || !item.webSocketDebuggerUrl) return false;
        try { const url = new URL(item.url); return ['store.steampowered.com', 'steamcommunity.com', 'steamloopback.host'].includes(url.hostname); }
        catch (_) { return false; }
    });
    if (!target) fail('The explicit CDP target was not found as a page.');
    const socket = new WebSocketImpl(target.webSocketDebuggerUrl);
    let nextId = 0;
    const pending = new Map();
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('CDP WebSocket timed out.')), 5000);
        socket.once('open', () => { clearTimeout(timer); resolve(); });
        socket.once('error', () => { clearTimeout(timer); reject(new Error('CDP WebSocket could not connect.')); });
    });
    socket.on('message', raw => {
        let message; try { message = JSON.parse(String(raw)); } catch (_) { return; }
        const wait = pending.get(message.id); if (!wait) return;
        pending.delete(message.id); message.error ? wait.reject(new Error('CDP command failed.')) : wait.resolve(message.result);
    });
    return {
        target,
        call(method, params = {}) {
            const id = ++nextId;
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP command timed out.')); }, 15000);
                pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
                socket.send(JSON.stringify({ id, method, params }), error => { if (error) { pending.delete(id); clearTimeout(timer); reject(new Error('CDP command failed.')); } });
            });
        },
        close() { try { socket.close(); } catch (_) {} },
    };
}
async function migrate({ sourcePath, endpoint, targetId, dryRun = false, connect = connectCdp }) {
    if (!sourcePath || !endpoint || !targetId) fail('Explicit --source, --cdp and --target arguments are required.');
    const file = path.resolve(sourcePath), first = sourceSnapshot(file);
    const records = parseJsonlText(first.text);
    // Read and verify native storage/module before any mutation.
    const ws = connect === connectCdp ? require('ws') : null;
    const cdp = await connect(endpoint, targetId, ws);
    try {
        const probe = await cdp.call('Runtime.evaluate', { expression: expressionFor(records, true), awaitPromise: true, returnByValue: true });
        const probeValue = probe?.result?.value;
        if (!probeValue?.ok) fail(probeValue?.reason === 'module-missing' ? 'Installed native annotation module is unavailable in the selected Steam window.' : 'Native storage is unavailable in the selected Steam window.');
        if (dryRun) {
            const final = sourceSnapshot(file); if (final.hash !== first.hash) fail('Source JSONL changed during migration.');
            return validateResult(probeValue, records, true);
        }
        if (sourceSnapshot(file).hash !== first.hash) fail('Source JSONL changed before import.');
        const result = await cdp.call('Runtime.evaluate', { expression: expressionFor(records, false), awaitPromise: true, returnByValue: true });
        const value = result?.result?.value;
        const final = sourceSnapshot(file); if (final.hash !== first.hash) fail('Source JSONL changed during migration.');
        if (!value?.ok) fail('Native import failed validation; no note text was collected.');
        return validateResult(value, records, false);
    } finally { cdp.close(); }
}
function parseArgs(args) {
    const options = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--dry-run') options.dryRun = true;
        else if (['--source', '--cdp', '--target'].includes(arg)) {
            if (!args[i + 1] || args[i + 1].startsWith('--')) fail(`Missing value for ${arg}.`);
            options[{ '--source': 'sourcePath', '--cdp': 'endpoint', '--target': 'targetId' }[arg]] = args[++i];
        } else fail(`Unknown argument: ${arg}`);
    }
    if (options.endpoint) {
        const url = new URL(options.endpoint);
        if (!['http:', 'https:'].includes(url.protocol)) fail('CDP endpoint must use HTTP or HTTPS.');
    }
    if (!options.sourcePath || !options.endpoint || !options.targetId) fail('Explicit --source, --cdp and --target arguments are required.');
    return options;
}
if (require.main === module) {
    (async () => {
        try {
            const result = await migrate(parseArgs(process.argv.slice(2)));
            console.log(JSON.stringify(result, null, 2));
        } catch (error) { console.error(`Migration refused: ${error.message}`); process.exitCode = 1; }
    })();
}
module.exports = { activeRows, canonical, expressionFor, legacyId, migrate, parseArgs, parseJsonlText, validateResult };
