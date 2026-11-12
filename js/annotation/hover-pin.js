// Hold native :hover on the nodes under the pointer while the ATOMS picker
// owns Alt gestures. The page marks its document with atomsPickerPin and nodes
// with data-atoms-picker-hover; this module never changes Steam's window focus.

const pins = new Map();
const within = (promise, ms = 700) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('timeout')), ms);
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer));
});
const request = (cdp, method, params, sessionId) => within(Promise.resolve().then(() => cdp.send(method, params, sessionId)));
const forget = (cdp, method, params, sessionId) => {
    try { Promise.resolve(cdp.send(method, params, sessionId)).catch(() => {}); } catch (_) {}
};

function bridgeFor(win) {
    return (win.opener || win).MILLENNIUM_API?.ChromeDevToolsProtocol ||
        win.MILLENNIUM_API?.ChromeDevToolsProtocol || null;
}

async function findSession(cdp, token, url) {
    const { targetInfos = [] } = await request(cdp, 'Target.getTargets', {});
    const marker = `document.documentElement?.dataset.atomsPickerPin === ${JSON.stringify(token)}`;
    const pages = targetInfos.filter(target => target.type === 'page')
        .sort((a, b) => Number(b.url === url) - Number(a.url === url));
    for (const target of pages) {
        let sessionId;
        try {
            ({ sessionId } = await request(cdp, 'Target.attachToTarget', { targetId: target.targetId, flatten: true }));
            const found = await request(cdp, 'Runtime.evaluate', { expression: marker, returnByValue: true }, sessionId);
            if (found.result?.value === true) return sessionId;
        } catch (_) { /* A closed or inaccessible target does not block the picker. */ }
        if (sessionId) forget(cdp, 'Target.detachFromTarget', { sessionId });
    }
    return null;
}

async function clearPin(pin) {
    if (!pin?.sessionId) return;
    const { cdp, sessionId, nodeIds } = pin;
    await Promise.all(nodeIds.map(nodeId => request(cdp, 'CSS.forcePseudoState', {
        nodeId, forcedPseudoClasses: []
    }, sessionId).catch(() => {})));
    forget(cdp, 'Target.detachFromTarget', { sessionId });
}

export async function pinHover(token, url = '', win = window) {
    const cdp = bridgeFor(win);
    if (!cdp || pins.has(token)) return false;
    const pin = { cdp, sessionId: null, nodeIds: [] };
    pins.set(token, pin);
    try {
        pin.sessionId = await findSession(cdp, token, url);
        if (!pin.sessionId) {
            if (pins.get(token) === pin) pins.delete(token);
            return false;
        }
        if (!pins.has(token)) { await clearPin(pin); return false; }
        const sessionId = pin.sessionId;
        await request(cdp, 'DOM.enable', {}, sessionId);
        await request(cdp, 'CSS.enable', {}, sessionId);
        await request(cdp, 'DOM.getDocument', { depth: 0 }, sessionId);
        const list = await request(cdp, 'Runtime.evaluate', {
            expression: "[...document.querySelectorAll('[data-atoms-picker-hover]')]",
            objectGroup: 'atoms-picker-pin'
        }, sessionId);
        if (!list.result?.objectId) throw Error('No marked hover nodes');
        const props = await request(cdp, 'Runtime.getProperties', {
            objectId: list.result.objectId, ownProperties: true
        }, sessionId);
        await Promise.all((props.result || []).filter(prop => /^\d+$/.test(prop.name) && prop.value?.objectId)
            .slice(0, 64).map(async prop => {
                const { nodeId } = await request(cdp, 'DOM.requestNode', { objectId: prop.value.objectId }, sessionId);
                if (!nodeId) return;
                pin.nodeIds.push(nodeId);
                await request(cdp, 'CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] }, sessionId);
            }));
        if (!pin.nodeIds.length) throw Error('No hover nodes were pinned');
        if (!pins.has(token)) { await clearPin(pin); return false; }
        return true;
    } catch (_) {
        await clearPin(pin);
        if (pins.get(token) === pin) pins.delete(token);
        return false;
    } finally {
        if (pin.sessionId) forget(cdp, 'Runtime.releaseObjectGroup', { objectGroup: 'atoms-picker-pin' }, pin.sessionId);
    }
}

export function unpinHover(token) {
    const pin = pins.get(token);
    if (!pin) return Promise.resolve();
    pins.delete(token);
    return clearPin(pin);
}

export function createHoverPin(win = window) {
    return (active, token, url = '') => active
        ? pinHover(token, url, win)
        : unpinHover(token);
}
