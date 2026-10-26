import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshDebugHooks } from '../js/utilities/refreshDebugHooks.js';

function fixture(value='yes') {
    let config={themes:{activeTheme:'ATOMS',conditions:{ATOMS:{'Show floating theme toggle?':value,'Light mode?':'yes'}}},other:{preserve:true}};
    const calls=[],owner={MILLENNIUM_API:{ffi:(_,method)=>async(...args)=>{calls.push({method,args});if(method==='Core_GetBackendConfig')return structuredClone(config);config=JSON.parse(args[0]);return {};}}};
    return {win:{document:{title:'Steam'},location:{hostname:'steamloopback.host'},opener:owner},calls,owner,setConfig:x=>config=x};
}
test('native debug startup refreshes Millennium hooks once with the complete unchanged config',async()=>{
    const f=fixture(),one=refreshDebugHooks(true,f.win),two=refreshDebugHooks(true,f.win);
    assert.equal(one,two);assert.deepEqual(await one,{refreshed:true,unchanged:true});
    const writes=f.calls.filter(c=>c.method==='Core_SetBackendConfig');assert.equal(writes.length,1);
    assert.equal(writes[0].args[1],false);assert.deepEqual(JSON.parse(writes[0].args[0]).other,{preserve:true});
    assert.equal(JSON.parse(writes[0].args[0]).themes.conditions.ATOMS['Light mode?'],'yes');
});
test('web documents, missing native APIs and stale conditional branches never write configuration',async()=>{
    const web=fixture();web.win.location.hostname='steamcommunity.com';assert.deepEqual(await refreshDebugHooks(true,web.win),{refreshed:false});assert.equal(web.calls.length,0);
    const missing=fixture();missing.win.opener={};assert.deepEqual(await refreshDebugHooks(true,missing.win),{refreshed:false});
    const stale=fixture('no');assert.deepEqual(await refreshDebugHooks(true,stale.win),{refreshed:false});assert.equal(stale.calls.some(c=>c.method==='Core_SetBackendConfig'),false);
    stale.setConfig({themes:{activeTheme:'ATOMS',conditions:{ATOMS:{'Show floating theme toggle?':'yes'}}}});
    assert.deepEqual(await refreshDebugHooks(true,stale.win),{refreshed:true,unchanged:true});
});
test('sequential on/off startup follows current native config and preserves all unrelated values',async()=>{
    const f=fixture();await refreshDebugHooks(true,f.win);
    f.setConfig({themes:{activeTheme:'ATOMS',conditions:{ATOMS:{'Show floating theme toggle?':'no','Light mode?':'no'}}},unrelated:[1,2]});
    assert.deepEqual(await refreshDebugHooks(false,f.win),{refreshed:true,unchanged:true});
    const writes=f.calls.filter(c=>c.method==='Core_SetBackendConfig');assert.equal(writes.length,2);assert.deepEqual(JSON.parse(writes[1].args[0]).unrelated,[1,2]);
    assert.deepEqual(await refreshDebugHooks(false,f.win),{refreshed:true,unchanged:true});assert.equal(f.calls.filter(c=>c.method==='Core_SetBackendConfig').length,2);
});
