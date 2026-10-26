import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { installDebugPalette, rootVariableRules } from '../js/utilities/debugPalette.js';
const require = createRequire(import.meta.url), postcss = require('postcss');
class Style {
    constructor() { this.values = new Map(); this.priorities = new Map(); }
    [Symbol.iterator]() { return this.values.keys(); }
    setProperty(name,value,priority='') { this.values.set(name,value); this.priorities.set(name,priority); }
    getPropertyValue(name) { return this.values.get(name)||''; }
    getPropertyPriority(name) { return this.priorities.get(name)||''; }
}
function rules(text) {
    const convert = node => {
        if(node.type==='rule') { const style = new Style();for(const decl of node.nodes.filter(node=>node.type==='decl')) style.setProperty(decl.prop,decl.value,decl.important?'important':'');return {selectorText:node.selector,style}; }
        if(node.type==='atrule' && node.nodes) return {constructor:{name:node.name==='media'?'CSSMediaRule':node.name==='supports'?'CSSSupportsRule':'CSSLayerBlockRule'},conditionText:node.params,name:node.params,cssRules:node.nodes.map(convert)};
        return {};
    };
    return postcss.parse(text).nodes.map(convert);
}
const rootMatch = selector => selector.split(',').some(value=>/^\s*(?::root|html)(?::root)?\s*$/.test(value));
test('variable boundary preserves root priorities/conditions and excludes product paint',()=>{
    const result = rootVariableRules(rules(':root{--a:1!important;color:red}.card{--a:9;background:red}@media (wide){:root{--b:2}}@media (narrow){:root{--b:3}}@supports (display:grid){:root:root{--a:4}}'),{matches:rootMatch},{matchMedia:query=>({matches:query==='(wide)'}),CSS:{supports:()=>true}});
    assert.match(result,/--a:1 !important/);assert.match(result,/:root:root\{--a:4/);assert.match(result,/--b:2/);assert.doesNotMatch(result,/--b:3|color:red|background:red|\.card/);
});
class Events {
    constructor(){this.listeners=new Map();}
    addEventListener(name,fn){this.listeners.set(name,[...this.listeners.get(name)||[],fn]);}
    removeEventListener(name,fn){this.listeners.set(name,(this.listeners.get(name)||[]).filter(value=>value!==fn));}
    dispatchEvent(event){for(const fn of this.listeners.get(event.type)||[])fn(event);return true;}
}
function fixture() {
    const win=new Events(), sheets=[], requests=[], observed=[], inputs=new Style();
    inputs.setProperty('--atoms-color-mode','light');inputs.setProperty('--SystemAccentColorAccent-RGB','12, 100, 180');
    class Element extends Events {
        constructor(tag,doc){super();this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.style=new Style();this.attributes=[];this.children=[];}
        matches(selector){return rootMatch(selector);}
        setAttribute(name,value){this.removeAttribute(name);this.attributes.push({name,value});}
        removeAttribute(name){this.attributes=this.attributes.filter(attr=>attr.name!==name);if(name==='style')this.style=new Style();}
        appendChild(node){this.children.push(node);node.parentNode=this;node.isConnected=true;if(node.tagName==='IFRAME')queueMicrotask(()=>node.dispatchEvent({type:'load'}));return node;}
        replaceChildren(...nodes){this.children=nodes;}
        remove(){this.isConnected=false;}
    }
    const makeDoc=()=>{const doc={};doc.documentElement=new Element('html',doc);doc.documentElement.isConnected=true;doc.head=new Element('head',doc);doc.body=new Element('body',doc);doc.createElement=tag=>new Element(tag,doc);return doc;};
    const document=makeDoc();win.document=document;
    const sandbox=makeDoc();sandbox.URL='about:srcdoc';
    const computed=(root,css='')=>{
        const values=new Map(), weight=new Map();
        const put=(name,value,priority,specificity)=>{const score=(priority?100000:0)+specificity;if(!weight.has(name)||score>=weight.get(name)){values.set(name,value);weight.set(name,score);}};
        for(const rule of rules(css)) if(rule.style) for(const name of rule.style) put(name,rule.style.getPropertyValue(name),rule.style.getPropertyPriority(name),(rule.selectorText.match(/:root/g)||[]).length);
        for(const name of root.style)put(name,root.style.getPropertyValue(name),root.style.getPropertyPriority(name),1000);
        const resolve=(value,seen=new Set())=>value.replace(/var\((--[\w-]+)(?:,\s*([^()]*))?\)/g,(_,name,fallback)=>{if(seen.has(name))return '';return resolve(values.get(name)||fallback||'',new Set([...seen,name]));});
        return {getPropertyValue:name=>resolve(values.get(name)||''),[Symbol.iterator]:()=>values.keys()};
    };
    sandbox.defaultView={getComputedStyle:root=>computed(root,sandbox.head.children.map(node=>node.textContent||'').join(''))};
    document.createElement=tag=>{const node=new Element(tag,document);if(tag==='iframe'){node.contentDocument=sandbox;node.contentWindow=sandbox.defaultView;}return node;};
    win.getComputedStyle=()=>inputs;win.CSSStyleSheet=class{replaceSync(text){this.cssRules=rules(text);sheets.push(text);}};
    win.MutationObserver=class{constructor(fn){this.fn=fn;observed.push(this);}observe(){}disconnect(){this.stopped=true;}};
    win.CustomEvent=class{constructor(type,init){this.type=type;this.detail=init.detail;}};win.setTimeout=setTimeout;win.clearTimeout=clearTimeout;
    win.matchMedia=()=>({matches:true});win.CSS={supports:()=>true};
    const defaults=':root{--backgroundDarkish:1,2,3;--background:4,5,6;--backgroundLightish:7,8,9;--backgroundDarkest:10,11,12;--textLight:201,202,203;--textLightish:181,182,183;--textLightest:221,222,223;--accent:90,80,70;--textOnAccent:0,0,0;--backgroundLight:50,51,52;--backgroundOverlay:0,0,0;--backgroundOverlayOpacity:.6;--textAccented:var(--accent);--backgroundLightModeDarkish:231,232,233;--textLightMode:31,32,33;--accentLightMode:40,50,60;}';
    let fail = false;
    let config=':root{--backgroundDarkish:21,22,23;--accent:var(--SystemAccentColorAccent-RGB);--accentLightMode:101,102,103;}';
    const light=':root:root{--backgroundDarkish:var(--backgroundLightModeDarkish)!important;--textLight:var(--textLightMode)!important;--accent:var(--accentLightMode)!important;--textOnAccent:255,255,255!important}';
    const options={window:win,baseURL:'https://millennium.host/v1/themes/ATOMS/',fetchText:async url=>{requests.push(url);if(fail)throw Error('configuration unavailable');return url.endsWith('configDefaults.css')?defaults:url.endsWith('lightMode.css')?light:config;}};
    win.__atomsAnnotationControlV1={savedMode:'light',previewMode:null};
    return {win,document,sandbox,options,requests,observed,inputs,setConfig:value=>config=value,setFailure:value=>fail=value,computed};
}

test('fresh saved-light startup resolves customized dark counterpart without touching visible palette',async()=>{
    const f=fixture();f.document.documentElement.style.setProperty('--backgroundDarkish','25,26,27');f.document.documentElement.style.setProperty('--backgroundLight','51,52,53','important');
    const api=installDebugPalette(f.options), target={style:new Style()};api.apply(target);await api.ready;
    assert.equal(api.snapshot().mode,'light');assert.equal(api.snapshot().active.surface,'rgb(231,232,233)');assert.equal(api.snapshot().counterpart.surface,'rgb(25,26,27)');
    assert.equal(api.snapshot().counterpart.accent,'rgb(12, 100, 180)');assert.equal(api.snapshot().active.accent,'rgb(101,102,103)');
    assert.equal(target.style.getPropertyValue('--atoms-debug-surface'),'rgb(231,232,233)');assert.equal(target.style.getPropertyPriority('--atoms-debug-surface'),'important');
    assert.equal(f.document.documentElement.style.getPropertyValue('--backgroundDarkish'),'25,26,27');assert.equal(f.document.documentElement.style.getPropertyPriority('--backgroundLight'),'important');assert.equal(api.snapshot().active.border,'rgb(51,52,53)');
    const frame=f.document.body.children[0];assert.equal(frame.srcdoc.includes('<script'),false);assert.equal(frame.attributes.find(attr=>attr.name==='sandbox').value,'allow-same-origin');api.stop();
});

test('mode-only counterpart binding and comparison-off survive late system/config changes',async()=>{
    const f=fixture(), api=installDebugPalette(f.options);await api.ready;const regular={style:new Style()}, opposite={style:new Style()};const release=api.apply(regular);api.apply(opposite,{counterpart:true});
    f.win.__atomsAnnotationControlV1.previewMode='dark';f.inputs.setProperty('--atoms-color-mode','');await api.refresh();
    assert.equal(regular.style.getPropertyValue('--atoms-debug-scheme'),'dark');assert.equal(opposite.style.getPropertyValue('--atoms-debug-scheme'),'light');
    assert.equal(regular.style.getPropertyValue('--atoms-debug-accent'),'rgb(12, 100, 180)');assert.equal(opposite.style.getPropertyValue('--atoms-debug-accent'),'rgb(101,102,103)');
    f.inputs.setProperty('--SystemAccentColorAccent-RGB','200, 70, 30');await api.refresh();assert.equal(api.snapshot().active.accent,'rgb(200, 70, 30)');
    f.setConfig(':root{--backgroundDarkish:14,15,16;--accent:var(--SystemAccentColorAccent-RGB);--accentLightMode:11,99,155;}');await api.refresh({reload:true});assert.equal(api.snapshot().active.surface,'rgb(14,15,16)');assert.equal(api.snapshot().counterpart.accent,'rgb(11,99,155)');
    assert.equal(f.requests.length,6);release();f.win.__atomsAnnotationControlV1.previewMode='light';await api.refresh();assert.equal(regular.style.getPropertyValue('--atoms-debug-scheme'),'dark');assert.equal(opposite.style.getPropertyValue('--atoms-debug-scheme'),'dark');api.stop();
});

test('resolver failure keeps last good bindings and stop removes hidden frame',async()=>{
    const f=fixture(), api=installDebugPalette(f.options);await api.ready;const before=api.snapshot();
    f.setFailure(true);await api.refresh({reload:true});assert.equal(api.snapshot(),before);assert.match(api.status().error,/configuration unavailable/);
    api.stop();assert.equal(api.stopped,true);assert.equal(f.document.body.children[0].isConnected,false);assert.equal(f.observed[0].stopped,true);assert.ok(before.active.surface);
    const bad=fixture();bad.options.fetchText=async()=>{throw Error('configuration unavailable');};const failed=installDebugPalette(bad.options);await failed.ready;assert.equal(failed.snapshot(),null);assert.match(failed.status().error,/configuration unavailable/);failed.stop();
});
