import assert from 'node:assert/strict';
import test from 'node:test';
import { createHoverPin, pinHover, unpinHover } from '../js/annotation/hover-pin.js';

function bridge({ marked = true } = {}) {
    const calls = [];
    const cdp = {
        async send(method, params = {}, sessionId) {
            calls.push({ method, params, sessionId });
            if (method === 'Target.getTargets') return { targetInfos: [{ type: 'page', url: 'https://store.steampowered.com/app/1/', targetId: 'target' }] };
            if (method === 'Target.attachToTarget') return { sessionId: 'session' };
            if (method === 'Runtime.evaluate' && params.expression.includes('dataset.atomsPickerPin')) {
                return { result: { value: marked } };
            }
            if (method === 'Runtime.evaluate') return { result: { objectId: 'array' } };
            if (method === 'Runtime.getProperties') return { result: [
                { name: '0', value: { objectId: 'element-1' } },
                { name: '1', value: { objectId: 'element-2' } },
                { name: 'length', value: { value: 2 } },
            ] };
            if (method === 'DOM.requestNode') return { nodeId: params.objectId === 'element-1' ? 11 : 12 };
            return {};
        },
    };
    return { calls, cdp, win: { MILLENNIUM_API: { ChromeDevToolsProtocol: cdp } } };
}

test('pins every marked hover node before resolving and clears them on release', async () => {
    const { calls, win } = bridge();
    const pin = createHoverPin(win);
    assert.equal(await pin(true, 'hold-1', 'https://store.steampowered.com/app/1/'), true);
    assert.deepEqual(calls.filter(call => call.method === 'CSS.forcePseudoState').map(call => [call.params.nodeId, call.params.forcedPseudoClasses]), [
        [11, ['hover']], [12, ['hover']],
    ]);
    await pin(false, 'hold-1');
    assert.deepEqual(calls.filter(call => call.method === 'CSS.forcePseudoState').map(call => call.params.forcedPseudoClasses), [
        ['hover'], ['hover'], [], [],
    ]);
    assert.equal(calls.some(call => call.method === 'Target.detachFromTarget'), true);
});

test('a missing marker or node set returns false, detaches and leaves the token reusable', async () => {
    const missing = bridge({ marked: false });
    assert.equal(await pinHover('same-token', '', missing.win), false);
    assert.equal(missing.calls.some(call => call.method === 'Target.detachFromTarget'), true);

    const empty = bridge();
    empty.cdp.send = async (method, params = {}, sessionId) => {
        empty.calls.push({ method, params, sessionId });
        if (method === 'Target.getTargets') return { targetInfos: [{ type: 'page', url: '', targetId: 'target' }] };
        if (method === 'Target.attachToTarget') return { sessionId: 'session' };
        if (method === 'Runtime.evaluate' && params.expression.includes('dataset.atomsPickerPin')) return { result: { value: true } };
        if (method === 'Runtime.evaluate') return { result: {} };
        return {};
    };
    assert.equal(await pinHover('same-token', '', empty.win), false);
    empty.cdp.send = bridge().cdp.send;
    // A failed attempt must not strand the token in the in-flight map.
    assert.equal(await pinHover('same-token', '', bridge().win), true);
});

test('release racing target discovery cleans the late session without pinning', async () => {
    let finishTargets;
    const calls = [];
    const cdp = { send(method, params = {}, sessionId) {
        calls.push({ method, params, sessionId });
        if (method === 'Target.getTargets') return new Promise(resolve => { finishTargets = resolve; });
        if (method === 'Target.attachToTarget') return Promise.resolve({ sessionId: 'late-session' });
        if (method === 'Runtime.evaluate') return Promise.resolve({ result: { value: true } });
        return Promise.resolve({});
    } };
    const win = { MILLENNIUM_API: { ChromeDevToolsProtocol: cdp } };
    const pending = pinHover('release-race', '', win);
    await Promise.resolve();
    unpinHover('release-race');
    finishTargets({ targetInfos: [{ type: 'page', url: '', targetId: 'late-target' }] });
    assert.equal(await pending, false);
    assert.equal(calls.some(call => call.method === 'Target.detachFromTarget' && call.params.sessionId === 'late-session'), true);
});

