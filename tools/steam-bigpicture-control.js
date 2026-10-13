#!/usr/bin/env node
'use strict';

/*
 * Small, deliberately conservative CDP remote for the local Steam client.
 *
 * It is intended for visual-audit navigation only.  It can inspect a Big
 * Picture renderer, send directional/navigation keys, and click an exact
 * visible navigation label.  It refuses labels that could launch, purchase,
 * install, delete, uninstall, or otherwise change the user's Steam state.
 */

const http = require('http');
let WebSocket;
try {
    WebSocket = require('ws');
} catch (_) {
    WebSocket = require(require.resolve('ws', { paths: [process.cwd()] }));
}

const cdpRoot = process.env.ATOMS_CDP || 'http://127.0.0.1:8080';
const targetName = process.env.ATOMS_STEAM_TARGET || 'Steam Big Picture Mode';
const [command = 'inspect', ...argumentsList] = process.argv.slice(2);
const safeKeys = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown', 'Escape'
]);
const safeMainMenuLabels = new Set([
    'Home', 'Library', 'Store', 'Friends & Chat', 'Media', 'Downloads', 'Settings'
]);
const unsafeLabel = /\b(?:play|launch|install|uninstall|purchase|buy|checkout|add\s+to\s+cart|delete|remove|sign\s*out|log\s*out|quit|exit\s+steam)\b/i;

const getJson = (url) => new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
            if (response.statusCode < 200 || response.statusCode >= 300) {
                reject(new Error(`HTTP ${response.statusCode}: ${url}`));
                return;
            }
            try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
        });
    });
    request.on('error', reject);
    request.setTimeout(3000, () => request.destroy(new Error(`Timeout: ${url}`)));
});

const connect = (target) => new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const pending = new Map();
    let nextId = 0;
    const close = () => {
        for (const item of pending.values()) {
            clearTimeout(item.timer);
            item.reject(new Error('CDP socket closed'));
        }
        pending.clear();
        try { socket.close(); } catch (_) {}
    };
    socket.once('open', () => resolve({
        call(method, params = {}) {
            return new Promise((resolveCall, rejectCall) => {
                const id = ++nextId;
                const timer = setTimeout(() => {
                    pending.delete(id);
                    rejectCall(new Error(`CDP timeout: ${method}`));
                }, 7000);
                pending.set(id, { resolve: resolveCall, reject: rejectCall, timer });
                socket.send(JSON.stringify({ id, method, params }));
            });
        },
        close
    }));
    socket.once('error', reject);
    socket.on('message', (raw) => {
        let message;
        try { message = JSON.parse(raw); } catch (_) { return; }
        if (!message.id || !pending.has(message.id)) return;
        const item = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(item.timer);
        if (message.error) item.reject(new Error(JSON.stringify(message.error)));
        else item.resolve(message.result || {});
    });
    socket.once('close', () => {
        for (const item of pending.values()) {
            clearTimeout(item.timer);
            item.reject(new Error('CDP socket closed'));
        }
        pending.clear();
    });
});

const evaluate = async (connection, expression, awaitPromise = false) => {
    const result = await connection.call('Runtime.evaluate', {
        expression,
        awaitPromise,
        returnByValue: true,
        userGesture: true
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
    return result.result && result.result.value;
};

const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const inspectExpression = `(()=>{
    const visible=(el)=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el);return r.width>4&&r.height>4&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&c.display!=='none'&&c.visibility!=='hidden'};
    const compact=(el)=>{const r=el.getBoundingClientRect();return {tag:el.tagName,text:(el.innerText||el.getAttribute('aria-label')||el.title||'').replace(/\\s+/g,' ').trim().slice(0,140),classes:String(el.className||'').slice(0,180),id:el.id||'',x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}};
    const controls=[...document.querySelectorAll('button,a,[role=button],[role=link],.Focusable')].filter(visible).map(compact).filter((item)=>item.text||item.id).slice(0,100);
    return {title:document.title,url:location.href,bodyText:(document.body&&document.body.innerText||'').replace(/\\s+/g,' ').trim().slice(0,2200),controls};
})()`;

const findTextExpression = (label) => `(()=>{
    const wanted=${JSON.stringify(normalize(label)).replace(/</g, '\\u003c')};
    const visible=(el)=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el);return r.width>4&&r.height>4&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&c.display!=='none'&&c.visibility!=='hidden'};
    const text=(el)=>(el.innerText||el.getAttribute('aria-label')||el.title||'').replace(/\\s+/g,' ').trim();
    const nodes=[...document.querySelectorAll('button,a,[role=button],[role=link],.Focusable')].filter(visible);
    const exact=nodes.filter((el)=>text(el)===wanted);
    const candidates=exact.length?exact:nodes.filter((el)=>text(el).includes(wanted));
    const el=candidates.sort((left,right)=>text(left).length-text(right).length)[0];
    if(!el)return null;
    const r=el.getBoundingClientRect();
    return {text:text(el),tag:el.tagName,classes:String(el.className||'').slice(0,180),x:r.x,y:r.y,w:r.width,h:r.height};
})()`;

const revealTextExpression = (label) => `(()=>{
    const wanted=${JSON.stringify(normalize(label)).replace(/</g, '\\u003c')};
    const text=(el)=>(el.innerText||el.getAttribute('aria-label')||el.title||'').replace(/\\s+/g,' ').trim();
    const nodes=[...document.querySelectorAll('button,a,[role=button],[role=link],.Focusable')];
    const exact=nodes.filter((el)=>text(el)===wanted);
    const candidates=exact.length?exact:nodes.filter((el)=>text(el).includes(wanted));
    const el=candidates.sort((left,right)=>text(left).length-text(right).length)[0];
    if(!el)return null;
    el.scrollIntoView({block:'nearest',inline:'center',behavior:'instant'});
    const r=el.getBoundingClientRect();
    return {text:text(el),tag:el.tagName,classes:String(el.className||'').slice(0,180),x:r.x,y:r.y,w:r.width,h:r.height};
})()`;

const inspectSelectorExpression = (selector) => `(()=>{
    const selector=${JSON.stringify(selector).replace(/</g, '\\u003c')};
    const compact=(el)=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el);return {
        tag:el.tagName,
        text:(el.innerText||el.getAttribute('aria-label')||el.title||'').replace(/\\s+/g,' ').trim().slice(0,160),
        classes:String(el.className||'').slice(0,220),
        parentClasses:String(el.parentElement&&el.parentElement.className||'').slice(0,220),
        inline:el.getAttribute('style')||'',
        rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
        computed:{backgroundColor:c.backgroundColor,backgroundImage:c.backgroundImage,borderColor:c.borderColor,color:c.color,opacity:c.opacity,filter:c.filter,display:c.display,visibility:c.visibility,maskImage:c.maskImage,webkitMaskImage:c.webkitMaskImage,boxShadow:c.boxShadow}
    }};
    try { return {selector,count:document.querySelectorAll(selector).length,items:[...document.querySelectorAll(selector)].slice(0,30).map(compact)}; }
    catch(error) { return {selector,error:String(error&&error.message||error)}; }
})()`;

const mainMenuExpression = (label) => `(()=>{
    const wanted=${JSON.stringify(label).replace(/</g, '\\u003c')};
    const text=(el)=>(el.innerText||el.getAttribute('aria-label')||el.title||'').replace(/\\s+/g,' ').trim();
    const item=[...document.querySelectorAll('._2w9TpQwxU7vcwaAbf3KGv_')].find((el)=>text(el)===wanted);
    if(!item)return null;
    item.click();
    return {text:text(item),classes:String(item.className||'').slice(0,180)};
})()`;

const reloadBigPictureCssExpression = `(()=>new Promise((resolve)=>{
    const links=[...document.querySelectorAll('link[rel="stylesheet"]')]
        .filter((link)=>link.href.includes('/themes/ATOMS/css/bigpicture.css'));
    const current=links.find((link)=>!link.disabled)||links.at(-1);
    if(!current){resolve({ok:false,reason:'ATOMS Big Picture stylesheet is not attached'});return;}
    const fresh=current.cloneNode(true);
    const base=current.href.replace(/[?&]atomsLive=\\d+/g,'');
    fresh.disabled=false;
    fresh.href=base+(base.includes('?')?'&':'?')+'atomsLive='+Date.now();
    let settled=false;
    const finish=(result)=>{if(settled)return;settled=true;if(result.ok)links.forEach((link)=>link.remove());else fresh.remove();resolve(result);};
    fresh.addEventListener('load',()=>finish({ok:true,href:fresh.href}),{once:true});
    fresh.addEventListener('error',()=>finish({ok:false,reason:'stylesheet failed to load'}),{once:true});
    setTimeout(()=>finish({ok:false,reason:'stylesheet reload timed out'}),4000);
    current.after(fresh);
}))()`;

const inspectCascade = async (connection, selector) => {
    const documentRoot = await connection.call('DOM.getDocument', { depth: 1 });
    const node = await connection.call('DOM.querySelector', { nodeId: documentRoot.root.nodeId, selector });
    if (!node.nodeId) return { selector, error: 'No matching element' };
    await connection.call('CSS.enable');
    const result = await connection.call('CSS.getMatchedStylesForNode', { nodeId: node.nodeId });
    const wanted = new Set(['opacity', 'filter', 'background', 'background-color', 'background-image', 'border', 'border-color']);
    const rules = (result.matchedCSSRules || [])
        .map(({ rule }) => {
            const declarations = (rule.style && rule.style.cssProperties || [])
                .filter((item) => wanted.has(String(item.name || '').toLowerCase()))
                .map((item) => ({ name: item.name, value: item.value, important: Boolean(item.important), disabled: Boolean(item.disabled) }));
            if (!declarations.length) return null;
            return {
                origin: rule.origin,
                selector: rule.selectorList && rule.selectorList.text || '',
                declarations
            };
        })
        .filter(Boolean);
    return {
        selector,
        inline: result.inlineStyle && result.inlineStyle.cssProperties || [],
        rules
    };
};

const findTarget = async () => {
    const targets = await getJson(`${cdpRoot}/json/list`);
    const target = targets.find((item) => item.title === targetName && item.webSocketDebuggerUrl);
    if (!target) throw new Error(`No attached Steam renderer named ${JSON.stringify(targetName)}`);
    return target;
};

const run = async () => {
    const target = await findTarget();
    const connection = await connect(target);
    try {
        if (command === 'inspect') {
            console.log(JSON.stringify(await evaluate(connection, inspectExpression), null, 2));
            return;
        }

        if (command === 'key') {
            const key = argumentsList[0];
            if (!safeKeys.has(key)) throw new Error(`Only safe navigation keys are allowed: ${Array.from(safeKeys).join(', ')}`);
            const code = key === 'Escape' ? 'Escape' : key;
            await connection.call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: key === 'Escape' ? 27 : 0, nativeVirtualKeyCode: key === 'Escape' ? 27 : 0 });
            await connection.call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: key === 'Escape' ? 27 : 0, nativeVirtualKeyCode: key === 'Escape' ? 27 : 0 });
            console.log(JSON.stringify({ action: 'key', key }));
            return;
        }

        if (command === 'click-text') {
            const requested = normalize(argumentsList.join(' '));
            if (!requested) throw new Error('Usage: click-text <exact visible navigation label>');
            if (unsafeLabel.test(requested)) throw new Error(`Refusing potentially state-changing label: ${requested}`);
            const match = await evaluate(connection, findTextExpression(requested));
            if (!match) throw new Error(`No visible control matched ${JSON.stringify(requested)}`);
            if (unsafeLabel.test(match.text)) throw new Error(`Refusing potentially state-changing matched control: ${match.text}`);
            const x = Math.round(match.x + match.w / 2);
            const y = Math.round(match.y + match.h / 2);
            await connection.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
            await connection.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
            console.log(JSON.stringify({ action: 'click-text', match, x, y }));
            return;
        }

        if (command === 'reveal-text') {
            const requested = normalize(argumentsList.join(' '));
            if (!requested) throw new Error('Usage: reveal-text <safe navigation label>');
            if (unsafeLabel.test(requested)) throw new Error(`Refusing potentially state-changing label: ${requested}`);
            const match = await evaluate(connection, revealTextExpression(requested));
            if (!match) throw new Error(`No navigation control matched ${JSON.stringify(requested)}`);
            if (unsafeLabel.test(match.text)) throw new Error(`Refusing potentially state-changing matched control: ${match.text}`);
            console.log(JSON.stringify({ action: 'reveal-text', match }));
            return;
        }

        if (command === 'inspect-selector') {
            const selector = argumentsList.join(' ').trim();
            if (!selector) throw new Error('Usage: inspect-selector <CSS selector>');
            console.log(JSON.stringify(await evaluate(connection, inspectSelectorExpression(selector)), null, 2));
            return;
        }

        if (command === 'back') {
            await evaluate(connection, 'history.back()');
            console.log(JSON.stringify({ action: 'back' }));
            return;
        }

        if (command === 'menu') {
            const requested = normalize(argumentsList.join(' '));
            if (!safeMainMenuLabels.has(requested)) {
                throw new Error(`Only safe main-menu navigation is allowed: ${Array.from(safeMainMenuLabels).join(', ')}`);
            }
            const match = await evaluate(connection, mainMenuExpression(requested));
            if (!match) throw new Error(`No main-menu item matched ${JSON.stringify(requested)}`);
            console.log(JSON.stringify({ action: 'menu', match }));
            return;
        }

        if (command === 'cascade') {
            const selector = argumentsList.join(' ').trim();
            if (!selector) throw new Error('Usage: cascade <CSS selector>');
            console.log(JSON.stringify(await inspectCascade(connection, selector), null, 2));
            return;
        }

        if (command === 'reload-bigpicture-css') {
            console.log(JSON.stringify(await evaluate(connection, reloadBigPictureCssExpression, true)));
            return;
        }

        throw new Error('Usage: inspect | inspect-selector <CSS selector> | cascade <CSS selector> | reload-bigpicture-css | back | menu <Home|Library|Store|Friends & Chat|Media|Downloads|Settings> | key <ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|Escape> | reveal-text <safe label> | click-text <safe visible label>');
    } finally {
        connection.close();
    }
};

run().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
