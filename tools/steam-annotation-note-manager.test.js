'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { installAnnotationNoteManager } = require('./steam-annotation-note-manager');
class Events {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, fn) { this.listeners.set(type, [...this.listeners.get(type) || [], fn]); }
    removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(value => value !== fn)); }
    fire(type, extra = {}) {
        const event = { type, target:this, prevented:false, preventDefault() { this.prevented = true; }, stopPropagation() {}, composedPath: () => [this], ...extra };
        for (const fn of this.listeners.get(type) || []) fn(event); return event;
    }
}
class Node extends Events {
    constructor(tag, doc) { super(); this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = []; this.attrs = {}; this.dataset = {}; this.style = {setProperty() {}}; this.hidden = false; this.value = ''; }
    get id() { return this.attrs.id; } set id(value) { this.attrs.id=value; }
    get textContent() { return this._text || this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this._text = String(value); this.children=[]; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) { return this.attrs[name]; }
    get isConnected() { return this === this.ownerDocument.documentElement || Boolean(this.parentNode?.isConnected) || Boolean(this.host?.isConnected); }
    appendChild(node) { node.remove(); node.parentNode=this; this.children.push(node); return node; }
    replaceChildren(...nodes) { for (const child of this.children) child.parentNode=null; this.children=[]; this._text=''; nodes.forEach(node => this.appendChild(node)); }
    remove() { if (this.parentNode) this.parentNode.children=this.parentNode.children.filter(node => node!==this); this.parentNode=null; }
    attachShadow() { this.shadowRoot = new Node('shadow', this.ownerDocument); this.shadowRoot.host=this; return this.shadowRoot; }
    matches(selector) {
        if (selector === ':popover-open') return this.popoverOpen;
        if (selector.includes(',')) return selector.split(',').some(part => this.matches(part));
        if (selector.startsWith('#')) return this.id===selector.slice(1);
        if (selector.startsWith('.')) return String(this.attrs.class || '').split(' ').includes(selector.slice(1));
        return this.tagName===selector.toUpperCase();
    }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    getElementById(id) { return this.querySelector(`#${id}`); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    focus() { this.ownerDocument.activeElement=this; }
    showModal() { this.open=true; }
    close() { this.open=false; }
    showPopover() { this.popoverOpen=true; }
    hidePopover() { this.popoverOpen=false; }
    getBoundingClientRect() { return {left:20,top:40,right:740,bottom:600}; }
}
function doc() {
    const value = new Events();
    value.createElement=tag => new Node(tag,value);
    value.documentElement=value.createElement('html'); value.head=value.createElement('head'); value.body=value.createElement('body');
    value.documentElement.appendChild(value.head); value.documentElement.appendChild(value.body);
    value.getElementById=id => value.documentElement.querySelector(`#${id}`); return value;
}
const settle = async () => { for(let i=0;i<8;i++) await Promise.resolve(); };
function fixture({ overlay = false, noteOpen = false } = {}) {
    const document=doc(), window=new Events(), requests=[], palette=[], native=[];
    let revision=1;
    let notes=[{ id:'first',revision:'first:1', record:{timestamp:'original-time',url:'https://example.invalid/page',title:'Page',colorMode:'dark',target:{id:'target'},payload:{note:'<img src=x onerror=bad()>',colorMode:'dark',selectionId:'one',asset:{selector:'.selected',unknown:{danger:'<script>bad()</script>'}}},futureField:{kept:true}} },
        {id:'second',revision:'second:1',record:{timestamp:'neighbor-time',payload:{note:'neighbor',colorMode:'light'}}}];
    window.name=overlay ? 'desktopoverlay_uid123' : 'Steam';
    window.__atomsDebugPaletteV1={apply(target) { palette.push(target); return () => palette.push('release'); }};
    window.__atomsAnnotationControlV1={available:true,enabled:false,setEnabled() { throw Error('manager must not change recorder state'); },async requestNotes(action,payload) {
        requests.push({action,payload:structuredClone(payload)});
        if(action==='list') return {revision:`global:${revision}`,notes:structuredClone(notes)};
        const index=notes.findIndex(entry=>entry.id===payload.id);
        if(index<0 || notes[index].revision!==payload.revision) throw Object.assign(Error('stale'),{code:'CONFLICT'});
        if(action==='delete') notes.splice(index,1);
        else {
            notes[index].record.payload.note=payload.note; notes[index].record.payload.colorMode=payload.colorMode; notes[index].record.colorMode=payload.colorMode;
            notes[index].revision=`${payload.id}:${++revision}`;
        }
        revision++; return {revision:`global:${revision}`};
    }};
    const toolbar=document.createElement('div'); toolbar.id='atoms-theme-toggle-host'; document.documentElement.appendChild(toolbar);
    const shadow=toolbar.attachShadow(); const anchor=document.createElement('button'); anchor.id='atoms-annotator-menu'; shadow.appendChild(anchor);
    if(noteOpen) { const audit=document.createElement('div');audit.id='atoms-visual-audit-host';document.documentElement.appendChild(audit);const note=document.createElement('div');note.id='note';note.style.display='block';audit.attachShadow().appendChild(note); }
    let popup;
    if(overlay) {
        popup=new Events();popup.document=doc();popup.closed=false;popup.close=()=>{const event=popup.fire('beforeunload'); if(!event.prevented)popup.closed=true;};
        popup.SteamClient={Window:Object.fromEntries(['ShowWindow','BringToFront','SetKeyFocus'].map(name=>[name,(...args)=>native.push([name,...args])]))};
        window.opener={SteamClient:{Overlay:{GetOverlayBrowserInfo:async()=>[{unPID:123,nBrowserID:456,eBrowserType:0}]}},g_PopupManager:{constructor:{CreatePopup(name,options) {native.push({name,options});return {popup};}}}};
    }
    vm.runInNewContext(`(${installAnnotationNoteManager})();`,{window,document,innerWidth:1280,innerHeight:900,console});
    const api=window.__atomsAnnotationNoteManagerV1;
    const root=()=>overlay ? popup.document.body : document.getElementById('atoms-annotation-note-manager-host')?.shadowRoot;
    const byText=(text,parent=root())=>parent.querySelectorAll('button').find(button=>button.textContent===text);
    return {window,document,api,anchor,requests,palette,native,popup,root,byText,notes:()=>notes,external() {notes[0].revision='external:2';notes[0].record.payload.note='changed elsewhere';revision++;window.fire('atoms-annotation-notes-changed',{detail:{revision:`global:${revision}`}});}};
}

test('hamburger menu has one inert Manage notes entry and never changes recording', async()=>{
    const f=fixture(); f.api.toggleMenu(f.anchor);
    const menu=f.root().querySelector('#notes-menu');
    assert.equal(menu.querySelectorAll('button').length,1);assert.equal(menu.querySelector('button').textContent,'Manage notes');assert.equal(f.anchor.getAttribute('aria-expanded'),'true');
    f.document.fire('keydown',{key:'Escape'});assert.equal(menu.hidden,true);assert.equal(f.document.activeElement,f.anchor);
    await f.api.open({anchor:f.anchor});
    assert.equal(f.api.isOpen(),true);assert.equal(f.root().querySelectorAll('article').length,2);
    assert.match(f.root().querySelector('pre').textContent, /futureField/);assert.match(f.root().querySelector('pre').textContent, /<script>bad\(\)<\/script>/);
    assert.equal(f.root().querySelector('img'),null);assert.match(f.root().textContent,/Captured: original-time/);assert.match(f.root().textContent,/Target: unavailable/);
    assert.deepEqual(f.requests.map(value=>value.action),['list']); f.api.close();assert.equal(f.document.activeElement,f.anchor);f.api.stop();
});

test('save submits only exact revision/text/mode and preserves neighboring provenance',async()=>{
    const f=fixture();const before=structuredClone(f.notes());await f.api.open({anchor:f.anchor});
    f.byText('Edit').fire('click');f.root().querySelector('textarea').value='corrected';f.root().querySelector('select').value='light';f.byText('Save').fire('click');await settle();
    assert.deepEqual(f.requests.find(value=>value.action==='edit').payload,{id:'first',revision:'first:1',note:'corrected',colorMode:'light'});
    assert.equal(f.notes()[0].record.timestamp,before[0].record.timestamp);assert.deepEqual(f.notes()[0].record.payload.asset,before[0].record.payload.asset);assert.deepEqual(f.notes()[1],before[1]);
    assert.equal(f.api.isDirty(),false);assert.equal(f.root().querySelector('textarea'),null);f.api.stop();
});

test('delete requires local exact-record confirmation and retains its neighbor',async()=>{
    const f=fixture();await f.api.open();const neighbor=structuredClone(f.notes()[1]);
    f.byText('Delete').fire('click');assert.equal(f.notes().length,2);f.byText('Keep editing').fire('click');assert.equal(f.notes().length,2);
    f.byText('Delete').fire('click');f.byText('Delete annotation').fire('click');await settle();
    assert.deepEqual(f.requests.find(value=>value.action==='delete').payload,{id:'first',revision:'first:1'});assert.deepEqual(f.notes(),[neighbor]);f.api.stop();
});

test('external conflict preserves draft; refresh and close require explicit discard',async()=>{
    const f=fixture();await f.api.open({anchor:f.anchor});f.byText('Edit').fire('click');const field=f.root().querySelector('textarea');field.value='unsaved draft';
    f.external();await settle();assert.equal(f.root().querySelector('textarea'),field);assert.equal(field.value,'unsaved draft');
    f.byText('Save').fire('click');await settle();assert.match(f.root().querySelector('#notes-status').textContent,/changed or was removed/);assert.equal(field.value,'unsaved draft');
    const before=f.requests.length;f.api.refresh();assert.equal(f.requests.length,before);assert.equal(f.api.stop(),false);
    f.byText('Keep editing').fire('click');const unload=f.window.fire('beforeunload');assert.equal(unload.prevented,true);
    f.api.close();assert.equal(f.api.isOpen(),true);f.byText('Keep editing').fire('click');assert.equal(field.value,'unsaved draft');
    f.api.refresh();f.byText('Discard changes').fire('click');await settle();assert.equal(f.root().querySelector('textarea'),null);assert.match(f.root().textContent,/changed elsewhere/);
    f.api.close();assert.equal(f.api.isOpen(),false);f.api.stop();
});

test('an open annotation editor is preserved instead of silently saved or cancelled',async()=>{
    const f=fixture({noteOpen:true});f.api.toggleMenu(f.anchor);assert.equal(await f.api.open({anchor:f.anchor}),false);
    assert.equal(f.requests.length,0);assert.equal(f.api.isOpen(),false);assert.match(f.root().textContent,/Save or cancel the open annotation/);f.api.stop();
});

test('overlay manager uses game-owned Steam popup and shares palette without recorder dependency',async()=>{
    const f=fixture({overlay:true});await f.api.open({anchor:f.anchor});
    const creation=f.native.find(value=>value.name);assert.equal(creation.name,'atoms_annotation_manager_uid123');assert.equal(creation.options.target_browser.m_nBrowserID,456);assert.equal(creation.options.eCreationFlags,4114);
    assert.ok(f.native.some(value=>value[0]==='SetKeyFocus'&&value[1]===true));assert.ok(f.palette.includes(f.popup.document.documentElement));
    f.byText('Edit').fire('click');assert.equal(f.popup.document.activeElement.tagName,'TEXTAREA');f.root().querySelector('textarea').value='draft';f.api.close();assert.equal(f.popup.closed,false);
    f.byText('Discard changes').fire('click');assert.equal(f.popup.closed,true);assert.equal(f.api.isOpen(),false);f.api.stop();
});

test('an in-flight list cannot replace a draft or editor started after its request',async()=>{
    for(const existingEditor of [false,true]) {
        const f=fixture();await f.api.open();
        if(existingEditor)f.byText('Edit').fire('click');
        const original=f.window.__atomsAnnotationControlV1.requestNotes;let resolveList;
        f.window.__atomsAnnotationControlV1.requestNotes=(action,payload)=>action==='list'?new Promise(resolve=>{resolveList=resolve;}):original(action,payload);
        f.external();
        if(!existingEditor)f.byText('Edit').fire('click');
        const field=f.root().querySelector('textarea');field.value='started while list was pending';
        resolveList(await original('list',{}));await settle();
        assert.equal(f.root().querySelector('textarea'),field);assert.equal(field.value,'started while list was pending');assert.equal(f.api.isDirty(),true);
        assert.match(f.root().querySelector('#notes-status').textContent,/draft is preserved/);
        f.api.close();f.byText('Discard changes').fire('click');f.api.stop();
    }
});

test('controller epoch changes refresh clean lists and preserve dirty drafts',async()=>{
    const f=fixture();await f.api.open();const before=f.requests.length;
    f.window.__atomsAnnotationControlV1.notesRevision='new-service:1';f.window.fire('atoms-debug-state');await settle();
    assert.equal(f.requests.length,before+1);
    f.byText('Edit').fire('click');f.root().querySelector('textarea').value='draft through restart';
    f.window.__atomsAnnotationControlV1.notesRevision='newer-service:1';f.window.fire('atoms-debug-state');await settle();
    assert.equal(f.root().querySelector('textarea').value,'draft through restart');assert.match(f.root().querySelector('#notes-status').textContent,/draft is preserved/);
    f.api.close();f.byText('Discard changes').fire('click');f.api.stop();
});

test('palette installed after opening binds all manager surfaces without duplicate bindings',async()=>{
    const f=fixture();delete f.window.__atomsDebugPaletteV1;await f.api.open();const applied=[];
    f.window.__atomsDebugPaletteV1={apply(target){applied.push(target);return ()=>applied.push('release');}};f.window.fire('atoms-debug-palette');
    assert.equal(applied.length,3);f.window.fire('atoms-debug-palette');assert.equal(applied.length,3);
    f.api.close();f.api.stop();assert.equal(applied.filter(value=>value==='release').length,3);
});
