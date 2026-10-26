'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {installAnnotationColorToggle}=require('./steam-annotation-color-toggle');
class Events {
    constructor(){this.listeners=new Map();}
    addEventListener(t,f){this.listeners.set(t,[...this.listeners.get(t)||[],f]);}
    removeEventListener(t,f){this.listeners.set(t,(this.listeners.get(t)||[]).filter(x=>x!==f));}
    dispatchEvent(e){for(const f of this.listeners.get(e.type)||[])f(e);}
}
function fixture(theme='dark',options={}){
    const window=new Events(),links=[],buttons=[];
    let storageAccesses=0, forcedMode=null;
    for(const name of ['localStorage','sessionStorage'])Object.defineProperty(window,name,{get(){storageAccesses++;throw Error('Debug palette must not use storage');}});
    const link=()=>Object.assign(new Events(),{tagName:'LINK',rel:'stylesheet',href:'https://millennium.host/v1/themes/ATOMS/css/lightMode.css',media:'',dataset:{},isConnected:true,remove(){this.isConnected=false;}});
    if(theme==='light')links.push(link());
    const shadow={getElementById:id=>buttons.find(b=>b.id===id&&!b.removed),appendChild:b=>buttons.push(b)};
    const root={},head={appendChild:l=>links.push(l)};
    const document={documentElement:options.ready===false?null:root,head:options.ready===false?null:head,querySelectorAll:()=>links.filter(l=>l.isConnected),getElementById:()=>document.documentElement?({shadowRoot:shadow}):null,createElement:tag=>{
        if(tag==='link')return link();
        const b=new Events();b.style={};b.attributes={};b.setAttribute=(name,value)=>{b.attributes[name]=value;};b.remove=()=>{b.removed=true;};return b;
    }};
    window.__atomsThemeToggleV1={setDisabled(){}};
    const control = options.control === false ? null : options.control || {
        previewMode:null,revision:0,available:true,
        setColorMode(mode){this.previewMode=mode;this.revision++;window.dispatchEvent({type:'atoms-debug-state',detail:this});}
    };
    if(control)window.__atomsAnnotationControlV1=control;
    if(options.audit!==false)window.__atomsVisualAuditV5={stop(){}};
    const actualMode=()=>forcedMode||(links.some(l=>l.isConnected&&l.media!=='not all')?'light':'dark');
    const context=vm.createContext({window,document,location:{href:'https://store.steampowered.com/'},getComputedStyle:element=>{if(!element)throw new TypeError('getComputedStyle requires an element');return {getPropertyValue:actualMode};},setTimeout,clearTimeout,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},MutationObserver:class{observe(){}disconnect(){}}});
    const install=()=>vm.runInContext(`(${installAnnotationColorToggle})();`,context);
    const api=install();
    return{window,document,links,buttons,link,actualMode,install,setReady:ready=>{document.documentElement=ready?root:null;document.head=ready?head:null;},setRenderedMode:m=>{forcedMode=m;},api,get storageAccesses(){return storageAccesses;}};
}
test('a light preview restores local defaults while hidden, then resumes the session choice',()=>{
    const f=fixture('dark');f.api.setMode('light');
    assert.equal(f.actualMode(),'light');assert.equal(f.api.getOverride(),'light');
    f.window.dispatchEvent({type:'pagehide'});f.window.dispatchEvent({type:'pageshow'});
    assert.equal(f.actualMode(),'light');assert.equal(f.api.getOverride(),'light');
    assert.equal(f.api.getMode(),'light');assert.equal(f.buttons.at(-1).textContent,'DARK MODE');
    assert.equal(f.links.filter(l=>l.isConnected&&'atomsDebugColorMode'in l.dataset).length,1);
    assert.equal(f.storageAccesses,0);f.api.stop();
});
test('a dark preview restores only saved light stylesheet media on document hide',()=>{
    const f=fixture('light'),native=f.links[0];f.api.setMode('dark');
    assert.equal(native.media,'not all');assert.equal(f.actualMode(),'dark');
    f.window.dispatchEvent({type:'pagehide'});
    assert.equal(native.media,'');assert.equal(f.api.getMode(),'dark');
    assert.equal(f.api.getOverride(),'dark');assert.equal(f.storageAccesses,0);f.api.stop();
});
test('without an override the control follows the loaded theme rather than cached initial colors',()=>{
    const f=fixture('dark');f.links.push(f.link());f.window.dispatchEvent({type:'load'});
    assert.equal(f.api.getMode(),'light');assert.equal(f.buttons.at(-1).textContent,'DARK MODE');
    f.buttons.at(-1).dispatchEvent({type:'click'});
    assert.equal(f.api.getOverride(),'dark');assert.equal(f.actualMode(),'dark');f.api.stop();
});
test('same-page sync keeps a preview; reset and fresh document follow the saved theme',()=>{
    const f=fixture('dark');f.api.setMode('light');f.api.sync();
    assert.equal(f.api.getMode(),'light');f.api.reset();assert.equal(f.api.getMode(),'dark');
    const next=fixture('dark');assert.equal(next.api.getOverride(),null);assert.equal(next.api.getMode(),'dark');
    f.api.stop();next.api.stop();
});


test('reset refreshes the label after media reactivation without animation frames',async()=>{
    const f=fixture('light');f.api.setMode('dark');f.setRenderedMode('dark');
    f.api.reset();assert.equal(f.buttons.at(-1).textContent,'LIGHT MODE');
    f.setRenderedMode('light');await new Promise(r=>setTimeout(r,5));
    assert.equal(f.buttons.at(-1).textContent,'DARK MODE');f.api.stop();
});


test('late Millennium palette loading updates the default button after the window load event',()=>{
    const f=fixture('dark');f.setRenderedMode('dark');
    const native=f.link();f.links.push(native);f.api.sync();
    assert.equal(f.buttons.at(-1).textContent,'LIGHT MODE');
    f.setRenderedMode('light');native.dispatchEvent({type:'load'});
    assert.equal(f.buttons.at(-1).textContent,'DARK MODE');
    assert.equal(f.api.getOverride(),null);f.api.stop();
});

test('controller-only preview stops without a recorder and reinstalls a working owner',()=>{
    const f=fixture('dark',{audit:false}),old=f.api;
    old.setMode('light');assert.equal(f.actualMode(),'light');
    assert.doesNotThrow(()=>old.stop());
    assert.equal(old.stopped,true);assert.equal(old.getOverride(),null);
    assert.equal(f.actualMode(),'dark');
    const next=f.install();assert.notEqual(next,old);assert.equal(next.version,11);
    next.setMode('light');assert.equal(next.getOverride(),'light');assert.equal(f.actualMode(),'light');
    assert.equal(f.storageAccesses,0);next.stop();
});

test('fresh document without root can reset, stop, reject stale overrides, and reinstall when ready',()=>{
    const f=fixture('dark',{audit:false,ready:false}),old=f.api;
    assert.equal(old.getMode(),'dark');assert.equal(old.reset(),'dark');
    assert.doesNotThrow(()=>old.stop());assert.equal(old.stopped,true);
    assert.equal(old.setMode('light'),'dark');assert.equal(old.getOverride(),null);
    assert.equal(f.links.length,0);
    f.setReady(true);const next=f.install();assert.notEqual(next,old);
    assert.equal(next.getOverride(),null);next.setMode('light');assert.equal(f.actualMode(),'light');
    assert.equal(f.storageAccesses,0);next.stop();
});

test('a stale stopped API cannot change a replacement preview or mark its owner stopped',()=>{
    const f=fixture('dark',{audit:false}),old=f.api;
    const replacement={version:6,stopped:false};f.window.__atomsAnnotationColorToggleV1=replacement;
    old.stop();assert.equal(old.stopped,true);assert.equal(replacement.stopped,false);
    f.window.__atomsAnnotationColorToggleV1=old;
    const next=f.install();next.setMode('light');
    assert.equal(old.setMode('dark'),'light');assert.equal(old.getOverride(),null);
    assert.equal(next.getOverride(),'light');assert.equal(next.stopped,false);assert.equal(f.actualMode(),'light');
    next.stop();
});

test('v11 replaces a legacy v5 owner even when legacy stop throws',()=>{
    const f=fixture('dark',{audit:false});f.api.stop();let stops=0;
    const legacy={version:5,stopped:false,stop(){stops++;throw Error('Legacy cleanup failed');}};
    f.window.__atomsAnnotationColorToggleV1=legacy;
    const next=f.install();assert.equal(stops,1);assert.notEqual(next,legacy);assert.equal(next.version,11);
    next.setMode('light');assert.equal(f.actualMode(),'light');next.stop();
});

test('stop publishes its flag and cleans resources before a fallible theme callback',()=>{
    const f=fixture('dark',{audit:false});
    f.window.__atomsThemeToggleV1.setDisabled=()=>{throw Error('Theme callback failed');};
    assert.throws(()=>f.api.stop(),/Theme callback failed/);assert.equal(f.api.stopped,true);
    f.window.__atomsThemeToggleV1.setDisabled=()=>{};
    const next=f.install();assert.notEqual(next,f.api);assert.equal(next.stopped,false);
    next.setMode('light');assert.equal(f.actualMode(),'light');next.stop();
});


test('global preview requests apply only authoritative revisions across documents, recorder stop and BFCache',()=>{
    const requests=[];
    const control={previewMode:null,revision:0,stopped:false,setColorMode:mode=>requests.push(mode)};
    const a=fixture('dark',{control}),b=fixture('dark',{control});
    a.api.setMode('light');
    assert.deepEqual(requests,['light']);assert.equal(a.actualMode(),'dark');
    Object.assign(control,{previewMode:'light',revision:1});
    for(const f of [a,b])f.window.dispatchEvent({type:'atoms-debug-state',detail:control});
    assert.equal(a.actualMode(),'light');assert.equal(b.actualMode(),'light');
    assert.equal(requests.length,1); // Received state never echoes to the controller.
    a.window.__atomsVisualAuditV5.stop();
    assert.equal(a.api.stopped,false);assert.equal(a.api.getOverride(),'light');
    a.window.dispatchEvent({type:'pagehide'});
    assert.equal(a.actualMode(),'dark');assert.equal(a.api.getOverride(),'light');assert.equal(requests.length,1);
    a.window.dispatchEvent({type:'pageshow',persisted:true});assert.equal(a.actualMode(),'light');
    const fresh=fixture('dark',{control});assert.equal(fresh.actualMode(),'light');
    a.api.applyState({previewMode:'dark',revision:0});assert.equal(a.actualMode(),'light');
    b.api.reset();assert.deepEqual(requests,['light',null]);assert.equal(b.actualMode(),'light');
    Object.assign(control,{previewMode:null,savedMode:'dark',revision:2});
    for(const f of [a,b,fresh])f.api.applyState(control);
    assert.equal(a.actualMode(),'dark');assert.equal(b.actualMode(),'dark');assert.equal(fresh.actualMode(),'dark');
    for(const f of [a,b,fresh]){assert.equal(f.storageAccesses,0);f.api.stop();}
    assert.equal(requests.length,2);
});

test('global dark preview covers late saved light links and restores saved media on setting change',()=>{
    const requests=[],control={previewMode:'dark',savedMode:'light',revision:3,setColorMode:m=>requests.push(m)};
    const f=fixture('dark',{control});
    const saved=f.link();f.links.push(saved);f.api.sync();
    assert.equal(saved.media,'not all');assert.equal(f.actualMode(),'dark');
    saved.dispatchEvent({type:'load'});assert.equal(saved.media,'not all');
    f.api.applyState({previewMode:null,savedMode:'light',revision:4});
    assert.equal(saved.media,'');assert.equal(f.actualMode(),'light');assert.equal(f.api.getOverride(),null);
    f.api.stop();assert.equal(requests.length,0);
});

test('fresh null-root document defers global light link until DOM is ready without a phantom local override',()=>{
    const requests=[],control={previewMode:'light',revision:8,setColorMode:m=>requests.push(m)};
    const f=fixture('dark',{ready:false,control});
    assert.equal(f.api.getOverride(),'light');assert.equal(f.links.length,0);
    f.setReady(true);f.api.sync();assert.equal(f.actualMode(),'light');
    f.api.stop();assert.equal(requests.length,0);
    const next=f.install();assert.equal(next.version,11);assert.equal(f.actualMode(),'light');
    next.stop();assert.equal(requests.length,0);
});

test('only the color mode button requests the palette adapter counterpart, and remount cleans it',()=>{
    const f=fixture(),calls=[],releases=[];
    f.window.__atomsDebugPaletteV1={apply:(element,options)=>{calls.push({element,options});return()=>releases.push(element);}};
    f.window.dispatchEvent({type:'atoms-debug-palette'});
    assert.equal(calls.length,1);assert.equal(calls[0].options.counterpart,true);
    f.api.sync();assert.equal(calls.length,1);
    f.buttons.at(-1).remove();f.api.sync();
    assert.equal(releases.length,1);assert.equal(calls.length,2);
    f.api.stop();assert.equal(releases.length,2);
});

test('a replacement host button cannot retain an orphaned label, palette, or click owner',()=>{
    const f=fixture('dark'),calls=[],releases=[];
    f.window.__atomsDebugPaletteV1={apply:(element,options)=>{calls.push({element,options});return()=>releases.push(element);}};
    f.api.sync();
    const original=f.buttons.at(-1);original.remove();
    const orphan=f.document.createElement('button');
    orphan.id='atoms-color-mode-toggle';orphan.textContent='DARK MODE';
    f.buttons.push(orphan);f.api.sync();
    const current=f.buttons.filter(b=>!b.removed).at(-1);
    assert.notEqual(current,orphan);
    assert.equal(current.textContent,'LIGHT MODE');
    assert.equal(calls.at(-1).element,current);assert.equal(calls.at(-1).options.counterpart,true);
    assert.equal(releases.length,1);
    current.dispatchEvent({type:'click'});
    assert.equal(f.api.getMode(),'light');assert.equal(current.textContent,'DARK MODE');
    f.api.stop();assert.equal(releases.length,2);
});


test('without a live controller there is no independent palette fork',()=>{
    const f=fixture('dark',{control:false});
    assert.equal(f.buttons.at(-1).disabled,true);
    assert.match(f.buttons.at(-1).title,/unavailable/i);
    f.api.setMode('light');f.buttons.at(-1).dispatchEvent({type:'click'});f.api.reset();
    assert.equal(f.api.getOverride(),null);assert.equal(f.actualMode(),'dark');assert.equal(f.links.length,0);
    f.api.applyState({previewMode:'light',revision:1});assert.equal(f.actualMode(),'light');
    f.api.stop();assert.equal(f.actualMode(),'dark');assert.equal(f.storageAccesses,0);
});

test('dark preview then saved light and saved dark cannot retain a borrowed tagged preview link',()=>{
    const control={previewMode:'dark',savedMode:'dark',revision:1,setColorMode(){}};
    const f=fixture('dark',{control}),orphan=f.link();
    orphan.dataset.atomsDebugColorMode='';f.links.push(orphan);f.api.sync();
    assert.equal(orphan.media,'not all');
    const saved=f.link();f.links.push(saved);
    Object.assign(control,{previewMode:null,savedMode:'light',revision:2});f.api.applyState(control);
    assert.equal(saved.isConnected,true);assert.equal(saved.media,'');assert.equal(f.actualMode(),'light');
    assert.equal(orphan.isConnected,false);
    saved.remove();Object.assign(control,{savedMode:'dark',revision:3});f.api.applyState(control);
    assert.equal(f.actualMode(),'dark');assert.equal(f.api.getOverride(),null);
    // A delayed copied marker during an already-null state must also be removed.
    const late=f.link();late.dataset.atomsDebugColorMode='';f.links.push(late);f.api.sync();
    assert.equal(late.isConnected,false);assert.equal(f.actualMode(),'dark');
    assert.equal(f.storageAccesses,0);f.api.stop();
});


test('mode button names the target action while retaining its counterpart palette binding',()=>{
    const f=fixture('dark'),button=f.buttons.at(-1);
    assert.equal(button.textContent,'LIGHT MODE');assert.match(button.attributes['aria-label'],/Preview light mode/);
    button.dispatchEvent({type:'click'});assert.equal(f.actualMode(),'light');
    assert.equal(button.textContent,'DARK MODE');assert.match(button.title,/Preview dark mode/);
    assert.equal(button.attributes['aria-pressed'],undefined);
    button.dispatchEvent({type:'click'});assert.equal(f.actualMode(),'dark');assert.equal(button.textContent,'LIGHT MODE');
    f.api.stop();
});

test('global light preview enables a stale disabled saved link and restores its original media on reset',()=>{
    const f=fixture('dark'),saved=f.link();
    saved.media='not all';f.links.push(saved);
    assert.equal(f.actualMode(),'dark');
    f.api.setMode('light');
    assert.equal(f.actualMode(),'light');assert.equal(saved.media,'');
    const late=f.link();late.media='not all';f.links.push(late);f.api.sync();
    assert.equal(late.media,'');
    f.api.reset();
    assert.equal(saved.media,'not all');assert.equal(late.media,'not all');
    assert.equal(f.actualMode(),'dark');assert.equal(f.api.getOverride(),null);
    assert.equal(f.storageAccesses,0);f.api.stop();
});

test('stylesheet load acknowledgement does not reactivate an already-correct media state',()=>{
    const f=fixture('light'),native=f.links[0];
    let media=native.media,writes=0;
    Object.defineProperty(native,'media',{get:()=>media,set:value=>{
        media=value;
        if(++writes>4)throw Error('Repeated stylesheet activation');
        native.dispatchEvent({type:'load'});
    }});
    assert.doesNotThrow(()=>f.api.setMode('dark'));
    assert.equal(f.actualMode(),'dark');assert.equal(writes,1);
    assert.doesNotThrow(()=>f.api.setMode('light'));
    assert.equal(f.actualMode(),'light');assert.equal(writes,2);
    native.dispatchEvent({type:'load'});f.api.sync();
    assert.equal(writes,2);
    f.api.stop();assert.equal(writes,2);
});
