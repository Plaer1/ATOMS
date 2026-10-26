'use strict';
// Hot-load additions into an existing capture without replacing its picker or
// touching authored notes. New recorder starts include these helpers directly.
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { installAnnotationColorToggle } = require('./steam-annotation-color-toggle');
const { installAnnotationModalLayer } = require('./steam-annotation-modal-layer');
const { installAnnotationInputLock } = require('./steam-annotation-input-lock');
const { installAnnotationOverlayEditor } = require('./steam-annotation-overlay-editor');
const { installAnnotationThemeToggle } = require('./steam-annotation-theme-toggle');
const directory = process.argv[2];
if (!directory) throw Error('Usage: node tools/steam-annotation-companion.js CAPTURE_DIR');
const cdp = process.env.ATOMS_CDP || 'http://127.0.0.1:8080';
const source = `(async()=>{
 if(/^atoms_annotation_uid/.test(window.name))return true;
 if(!window.__atomsVisualAuditV5 || window.__atomsVisualAuditV5.stopped)return false;
 // Compatibility for a recorder started before overlay notes stopped trapping
 // the entire page. Fresh source skips that trap for desktop overlays.
 if(/^desktopoverlay_uid\\d+$/.test(window.name)&&typeof getEventListeners==='function') {
   for(const item of getEventListeners(document).focusin||[]) {
     if(['keepFocus','compatible'].includes(item.listener.name))document.removeEventListener('focusin',item.listener,item.useCapture);
   }
 }

 const wasDisabled = window.__atomsThemeToggleV1?.isDisabled?.() || false;
 if (!(window.__atomsThemeToggleV1?.version >= 4)) {
   window.__atomsAnnotationThemeToggleV1?.stop();
   const m=await import('https://millennium.host/v1/themes/ATOMS/js/utilities/visualThemeControls.js?debug-controls-v4');
   m.installThemeToggle({showButton:true});
   await (${installAnnotationThemeToggle.toString()})().ready;
 }
 window.__atomsInstallAnnotationColorToggleV1 = (${installAnnotationColorToggle.toString()});
 window.__atomsInstallAnnotationColorToggleV1();
 (${installAnnotationModalLayer.toString()})();
 (${installAnnotationInputLock.toString()})();
 (${installAnnotationOverlayEditor.toString()})();
 window.__atomsThemeToggleV1?.setDisabled(wasDisabled);
 return true;
})()`;
const connections = new Map();
let stopped = false;
async function attach(target) {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0, ready = false;
    const pending = new Map(), contexts = new Set(), needsInstall = new Set();
    const call = (method,params={}) => new Promise((resolve,reject)=>{
        const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error(method+' timeout'));},6000);
        pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));
    });
    const install = async contextId => { const r=await call('Runtime.evaluate',{expression:source,contextId,returnByValue:true,awaitPromise:true,includeCommandLineAPI:true,userGesture:true}); if(r.result?.value===true)needsInstall.delete(contextId); else if(r.exceptionDetails)console.warn('Helper install failed:',target.title,r.exceptionDetails.text); };
    const connection = {ws,call,contexts,needsInstall,install,script:null}; connections.set(target.id,connection);
    ws.on('message',raw=>{
        const m=JSON.parse(raw);const p=pending.get(m.id);
        if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result||{});}
        if(m.method==='Runtime.executionContextCreated'&&m.params.context.auxData?.isDefault){const n=m.params.context.id;contexts.add(n);needsInstall.add(n);if(ready)install(n).catch(()=>{});}
        if(m.method==='Runtime.executionContextDestroyed'){contexts.delete(m.params.executionContextId);needsInstall.delete(m.params.executionContextId);}
        if(m.method==='Runtime.executionContextsCleared'){contexts.clear();needsInstall.clear();}
    });
    ws.on('close',()=>{if(connections.get(target.id)===connection)connections.delete(target.id);for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('CDP closed'));}pending.clear();});
    try {
        await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
        await call('Runtime.enable');
        connection.script=(await call('Page.addScriptToEvaluateOnNewDocument',{source})).identifier;
        ready=true;await Promise.all([...contexts].map(install));
        console.log('Attached debug/modal helpers:',target.title);
    } catch(e){console.warn('Attach failed:',target.title,e.message);ws.close();}
}
async function poll(){
    if(stopped)return;
    if(fs.existsSync(path.join(directory,'stopped.json')))return stop();
    try{const targets=await(await fetch(cdp+'/json/list')).json();
        for(const t of targets)if(['page','iframe'].includes(t.type)&&t.webSocketDebuggerUrl&&!/^about:srcdoc/.test(t.url)&&!connections.has(t.id))attach(t);
        for(const c of connections.values())for(const contextId of c.needsInstall)c.install(contextId).catch(()=>{});
    }catch(e){console.warn(e.message);}
}
async function stop(){
    if(stopped)return;stopped=true;clearInterval(timer);
    await Promise.all([...connections.values()].map(async c=>{
        if(c.script)await c.call('Page.removeScriptToEvaluateOnNewDocument',{identifier:c.script}).catch(()=>{});
        await Promise.all([...c.contexts].map(contextId=>c.call('Runtime.evaluate',{expression:'window.__atomsAnnotationOverlayEditorV1?.stop();window.__atomsAnnotationColorToggleV1?.stop();window.__atomsAnnotationModalLayerV1?.stop();',contextId}).catch(()=>{})));
        c.ws.close();
    }));
}
const timer=setInterval(poll,1000);poll();process.on('SIGINT',stop);process.on('SIGTERM',stop);
