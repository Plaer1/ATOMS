'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { installAnnotationOverlayEditor } = require('./steam-annotation-overlay-editor');
class Events {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, fn) { this.listeners.set(type, [...this.listeners.get(type) || [], fn]); }
    removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(f => f !== fn)); }
    fire(type, extra = {}) { const e = { defaultPrevented:false, preventDefault() { this.defaultPrevented=true; }, stopImmediatePropagation() {}, ...extra }; for (const f of this.listeners.get(type) || []) f(e);return e; }
}
async function fixture({deferredSave = false, initialSaveState = null} = {}) {
    const window = new Events(), calls = [], actions = [], original = { value: 'pending note' };
    const note = { style: { display: 'block', visibility: '' }, setAttribute() {}, getBoundingClientRect: () => ({ left: 1500, top: 96 }) };
    const frame = { contentDocument: { getElementById: () => original }, contentWindow: new Events() };
    const scrim = { style: { setProperty: (k,v) => calls.push([k,v]) } };
    const shadow = { getElementById: id => id === 'note' ? note : id === 'note-input-frame' ? frame : scrim };
    const document = { body: { inert: true }, documentElement: {}, getElementById: () => ({ shadowRoot: shadow }) };
    const popup = new Events(); popup.closed = false;
    popup.close = () => { const event=popup.fire('beforeunload');if(!event.defaultPrevented)popup.closed = true; };
    const field = new Events(); field.focus = () => calls.push('input-focus');
    const save = new Events(), cancel = new Events(), status = new Events();
    status.setAttribute=(name,value)=>{status[name]=value;};
    popup.document = { documentElement: {}, head: { insertAdjacentHTML() {} }, body: {}, getElementById: id => id === 'save' ? save : id === 'cancel' ? cancel : id === 'save-status' ? status : field };
    popup.SteamClient = { Window: Object.fromEntries(['MarkLastFocused','SetKeyFocus','ShowWindow','BringToFront'].map(name => [name, (...args) => calls.push([name,...args])])) };
    const palettes=[];
    window.__atomsDebugPaletteV1={apply(element) { palettes.push(element);return ()=>palettes.push('release'); }};
    window.name = 'desktopoverlay_uid457034';
    window.opener = { SteamClient: { Overlay: { GetOverlayBrowserInfo: async () => [{ unPID:457034,nBrowserID:5373969,eBrowserType:0 }] } }, g_PopupManager: { constructor: { CreatePopup(name, options) { calls.push(['popup',name,options]); return { popup }; } } } };
    window.__atomsVisualAuditV5 = { stop() { calls.push('audit-stop'); }, input: { note(e) { actions.push({ key:e.data.key, value:original.value, source:e.source });if(deferredSave && e.data.key==='Enter') {window.fire('atoms-annotation-save-state',{detail:{pending:true,error:''}});return;} note.style.display='none'; original.value=''; } } };
    if(initialSaveState)window.__atomsVisualAuditV5.getSaveState=()=>initialSaveState;
    vm.runInNewContext(`(${installAnnotationOverlayEditor})();`, { window,document,innerWidth:3440,innerHeight:1440,console,queueMicrotask,MutationObserver:class { observe() {} disconnect() {} } });
    await Promise.resolve(); await Promise.resolve();
    return { window, document, note, frame, original, popup, field, save, cancel, status, calls, actions, palettes, api:window.__atomsAnnotationOverlayEditorV1 };
}
test('native annotation window keeps the selection, mirrors edits and clears saved text on close', async () => {
    const f = await fixture();
    assert.equal(f.document.body.inert, false);
    assert.equal(f.note.style.visibility, 'hidden');
    assert.equal(f.field.value, 'pending note');
    const creation = f.calls.find(c => c[0] === 'popup');
    assert.equal(creation[2].target_browser.m_unPID, 457034);
    assert.equal(creation[2].target_browser.m_nBrowserID, 5373969);
    assert.equal(creation[2].eCreationFlags, 4114);
    assert.equal('owner_window' in creation[2], false); // SharedJSContext owns native Steam popups
    f.field.value='edited'; f.field.fire('input');
    assert.equal(f.original.value, 'edited');
    f.save.fire('click'); f.api.sync();
    assert.deepEqual(f.actions, [{ key:'Enter',value:'edited',source:f.frame.contentWindow }]);
    assert.equal(f.popup.closed, true);
    assert.equal(f.original.value, ''); // no carryover into the next annotation
    assert.equal(f.note.style.visibility, '');
    f.api.stop();
});
test('native cancel and window close route to the existing cancellation handler', async () => {
    for (const closeWindow of [false,true]) {
        const f = await fixture();
        if (closeWindow) f.popup.close(); else f.cancel.fire('click');
        f.api.sync();
        assert.equal(f.actions.length, 1);
        assert.equal(f.actions[0].key, 'Escape');
        f.api.stop();
    }
});
test('stopping the helper preserves an unsaved note without saving or cancelling it', async () => {
    const f=await fixture(); f.field.value='unsaved editing';
    f.api.stop();
    assert.equal(f.original.value, 'unsaved editing');
    assert.equal(f.actions.length, 0);
    assert.equal(f.popup.closed, true);
    assert.equal(f.note.style.visibility, '');
    assert.equal(f.note.style.display, 'block');
    assert.equal(f.api.stopped, true);
});


test('Enter and Escape in the native editor use the current selection callback', async () => {
    for (const key of ['Enter','Escape']) {
        const f=await fixture(); f.field.fire('keydown', { key }); f.api.sync();
        assert.equal(f.actions.length,1); assert.equal(f.actions[0].key,key);
        f.api.stop();
    }
});

test('native editor shares live palette binding and releases it without changing the note', async () => {
    const f = await fixture();
    assert.equal(f.palettes[0], f.popup.document.documentElement);
    f.field.value='still unsaved';
    const rebound=[]; f.window.__atomsDebugPaletteV1={apply(element) {rebound.push(element);return ()=>rebound.push('release');}};
    f.window.fire('atoms-debug-palette');
    assert.equal(f.palettes.at(-1),'release');assert.equal(rebound[0],f.popup.document.documentElement);
    assert.equal(f.field.value,'still unsaved');assert.equal(f.actions.length,0);
    f.api.stop();assert.equal(rebound.at(-1),'release');assert.equal(f.original.value,'still unsaved');
});

test('pending save locks overlay actions; failed ack preserves draft and supports Enter retry', async () => {
    const f=await fixture({deferredSave:true});f.field.value='recoverable draft';f.save.fire('click');
    assert.equal(f.field.disabled,true);assert.equal(f.save.disabled,true);assert.equal(f.cancel.disabled,true);assert.equal(f.status.textContent,'Saving annotation…');
    assert.equal(f.original.value,'recoverable draft');assert.equal(f.actions.length,1);assert.equal(f.popup.closed,false);
    f.save.fire('click');f.cancel.fire('click');f.field.fire('keydown',{key:'Escape'});f.popup.close();
    assert.equal(f.actions.length,1);assert.equal(f.popup.closed,false);assert.equal(f.note.style.display,'block');
    const focusBefore=f.calls.filter(value=>value==='input-focus').length;
    f.window.fire('atoms-annotation-save-state',{detail:{pending:false,error:'Could not save <draft>. Try again.'}});
    assert.equal(f.field.disabled,false);assert.equal(f.save.disabled,false);assert.equal(f.cancel.disabled,false);assert.equal(f.status.textContent,'Could not save <draft>. Try again.');assert.equal(f.status.hidden,false);
    assert.equal(f.field.value,'recoverable draft');assert.equal(f.original.value,'recoverable draft');assert.equal(f.calls.filter(value=>value==='input-focus').length,focusBefore+1);
    f.field.fire('keydown',{key:'Enter'});assert.equal(f.actions.length,2);assert.equal(f.actions[1].value,'recoverable draft');assert.equal(f.field.disabled,true);
    // Recorder acknowledgement is authoritative: success closes its original
    // note before publishing the settled state; the helper then closes popup.
    f.note.style.display='none';f.original.value='';f.window.fire('atoms-annotation-save-state',{detail:{pending:false,error:''}});f.api.sync();
    assert.equal(f.popup.closed,true);assert.equal(f.original.value,'');f.api.stop();
});

test('revived helper reads an already pending or failed picker save before opening popup',async()=>{
    for(const state of [{pending:true,error:''},{pending:false,error:'Retry the retained note'}]) {
        const f=await fixture({initialSaveState:state});
        assert.equal(f.field.disabled,state.pending);assert.equal(f.save.disabled,state.pending);assert.equal(f.cancel.disabled,state.pending);
        assert.equal(f.status.textContent,state.pending?'Saving annotation…':state.error);
        assert.equal(f.field.value,'pending note');assert.equal(f.original.value,'pending note');
        f.api.stop();assert.equal(f.actions.length,0);assert.equal(f.original.value,'pending note');
    }
});
