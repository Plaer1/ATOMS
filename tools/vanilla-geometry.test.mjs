import test from 'node:test';
import assert from 'node:assert/strict';
import restoreVanillaGeometry from '../js/utilities/restoreVanillaGeometry.js';

function fixture(t) {
    const globals = ['window','document','getComputedStyle','MutationObserver','ResizeObserver','setTimeout'];
    const before = new Map(globals.map(key => [key, globalThis[key]]));
    t.after(() => { for (const [key,value] of before) globalThis[key] = value; });
    const style = () => {
        const values = new Map();
        return {
            getPropertyValue: key => values.get(key)?.value ?? '',
            getPropertyPriority: key => values.get(key)?.priority ?? '',
            setProperty: (key,value,priority = '') => values.set(key,{ value,priority }),
            removeProperty: key => values.delete(key)
        };
    };
    const callbacks = [], listeners = new Map();
    const state = { height: 481.34375, containers: [], saleCards: [], disabled: false };
    const card = { style: style(), isConnected: true };
    const container = { style: style(), querySelector: () => ({ getBoundingClientRect: () => ({ height: state.height }) }) };
    const link = { tagName: 'LINK', rel: 'stylesheet', href: 'https://millennium.host/v1/themes/ATOMS/css/webkit.css', disabled: false };
    state.containers.push(container);
    globalThis.window = { __atomsThemeToggleV1: { isDisabled: () => state.disabled }, addEventListener: (key,fn) => listeners.set(key,fn) };
    globalThis.document = { documentElement: {}, querySelectorAll: selector => {
        if (selector.startsWith('link[')) return [link];
        if (selector === '#home_maincap_v7 .carousel_container') return state.containers;
        if (selector === '._1gsW0WuP7ZclL1_ScZlsvo') return state.saleCards;
        return selector.includes('.store_capsule > .capsule.main_capsule') ? [card] : [];
    } };
    globalThis.getComputedStyle = () => ({ getPropertyValue: property => property === 'height' ? '481.34375px' : 'auto' });
    globalThis.MutationObserver = class { constructor(fn) { state.mutation = fn; } observe() {} };
    globalThis.ResizeObserver = class { constructor(fn) { state.resize = fn; } observe() {} unobserve() {} disconnect() {} };
    globalThis.setTimeout = fn => { callbacks.push(fn); return callbacks.length; };
    const flush = () => { const pending = callbacks.splice(0); for (const fn of pending) fn(); };
    return { state, card, container, link, listeners, flush, style };
}

test('responsive artwork height follows resize and content changes without touching pagination or native links', t => {
    const f = fixture(t), api = restoreVanillaGeometry(); f.flush();
    assert.equal(f.container.style.getPropertyValue('--atoms-maincap-art-height'),'481.34375px');
    f.state.height = 320; f.listeners.get('resize')(); f.flush();
    assert.equal(f.container.style.getPropertyValue('--atoms-maincap-art-height'),'320px');
    f.state.height = 360; f.state.mutation(); f.flush();
    assert.equal(f.container.style.getPropertyValue('--atoms-maincap-art-height'),'360px');
    assert.equal(f.link.disabled,false);
    assert.equal(restoreVanillaGeometry(),api);
});

test('comparison clears owned geometry and restores exact inline values and priorities before reenabling', t => {
    const f = fixture(t);
    f.container.style.setProperty('--atoms-maincap-art-height','77px','important');
    f.card.style.setProperty('width','111px','important');
    const api = restoreVanillaGeometry(); f.flush();
    f.state.disabled = true; f.listeners.get('atoms-theme-toggle')({ detail: { disabled: true } });
    assert.equal(f.container.style.getPropertyValue('--atoms-maincap-art-height'),'77px');
    assert.equal(f.container.style.getPropertyPriority('--atoms-maincap-art-height'),'important');
    assert.equal(f.card.style.getPropertyValue('width'),'111px');
    f.state.disabled = false; f.listeners.get('atoms-theme-toggle')({ detail: { disabled: false } }); f.flush();
    assert.equal(f.container.style.getPropertyValue('--atoms-maincap-art-height'),'481.34375px');
    api.clear();
    assert.equal(f.container.style.getPropertyValue('--atoms-maincap-art-height'),'77px');
    assert.equal(f.card.style.getPropertyPriority('width'),'important');
});

test('unmounted or zero-height artwork does not leave a stale measurement on the former owner', t => {
    const f = fixture(t), api = restoreVanillaGeometry(); f.flush();
    f.state.height = 0; api.refresh();
    assert.equal(f.container.style.getPropertyValue('--atoms-maincap-art-height'),'');
    f.state.height = 420; api.refresh();
    f.state.containers = []; f.state.mutation(); f.flush();
    assert.equal(f.container.style.getPropertyValue('--atoms-maincap-art-height'),'');
});

test('coexisting sale/wishlist badges use measured card-local geometry and follow late resize', t => {
    const f=fixture(t);let bottom=128;
    const card={style:f.style(),offsetHeight:200,clientTop:0,getBoundingClientRect:()=>({top:100,height:200})};
    const sale={closest:()=>card,getBoundingClientRect:()=>({bottom,width:90,height:28})};
    card.querySelector=s=>s.startsWith(':scope')?{}:sale;f.state.saleCards=[card];
    const api=restoreVanillaGeometry();f.flush();
    assert.equal(card.style.getPropertyValue('--atoms-sale-badge-bottom'),'28px');
    bottom=144;f.state.resize();f.flush();assert.equal(card.style.getPropertyValue('--atoms-sale-badge-bottom'),'44px');
    card.offsetHeight=100;api.refresh();assert.equal(card.style.getPropertyValue('--atoms-sale-badge-bottom'),'22px');
});

test('sale geometry restores prior priority on comparison, missing flag, and recycled cards', t => {
    const f=fixture(t);let hasFlag=true;
    const card={style:f.style(),getBoundingClientRect:()=>({top:10,height:100})};
    card.style.setProperty('--atoms-sale-badge-bottom','8px','important');
    const sale={closest:()=>card,getBoundingClientRect:()=>({bottom:40,width:80,height:30})};
    card.querySelector=s=>s.startsWith(':scope')?(hasFlag?{}:null):sale;f.state.saleCards=[card];
    const api=restoreVanillaGeometry();f.flush();assert.equal(card.style.getPropertyValue('--atoms-sale-badge-bottom'),'30px');
    hasFlag=false;f.state.mutation();f.flush();assert.equal(card.style.getPropertyValue('--atoms-sale-badge-bottom'),'8px');assert.equal(card.style.getPropertyPriority('--atoms-sale-badge-bottom'),'important');
    hasFlag=true;api.refresh();f.state.disabled=true;f.listeners.get('atoms-theme-toggle')({detail:{disabled:true}});assert.equal(card.style.getPropertyValue('--atoms-sale-badge-bottom'),'8px');
    f.state.disabled=false;api.refresh();f.state.saleCards=[];f.state.mutation();f.flush();assert.equal(card.style.getPropertyValue('--atoms-sale-badge-bottom'),'8px');
});
