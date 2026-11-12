import test from 'node:test';
import assert from 'node:assert/strict';
import { cwpStartupVerdict, deferCwpInstall, waitForCwpFinalWindow } from '../js/annotation/menu.js';

function storage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, String(value)),
    };
}

test('CWP final creation flags take priority and are remembered without touching theme settings', () => {
    const saved = storage({ 'millennium.theme': 'light' });
    const win = { name: 'SP Desktop_uid0', __cwpCreateFlags: { 'SP Desktop_uid0': 0 }, opener: null };
    assert.equal(cwpStartupVerdict(win, saved), 'final');
    assert.equal(saved.getItem('atoms.annotator.cwp.v1'), '1');
    assert.equal(saved.getItem('millennium.theme'), 'light');
});

test('known CWP plugin waits for rebuild verdict and rejects the transient main window', async () => {
    const saved = storage();
    const win = { name: 'SP Desktop_uid0', PLUGIN_LIST: { 'steam-change-window-params': {} }, __cwpDecision: '', opener: null };
    assert.equal(cwpStartupVerdict(win, saved), 'pending');
    let checks = 0;
    const allowed = await waitForCwpFinalWindow(win, {
        storage: saved,
        maxWait: 300,
        delay: async () => { if (++checks === 2) win.__cwpDecision = 'rebuild'; },
    });
    assert.equal(allowed, false);
});

test('remembered CWP waits for final/keep and times out permissively', async () => {
    const saved = storage({ 'atoms.annotator.cwp.v1': '1' });
    const win = { name: 'SP Desktop_uid0', opener: null, __cwpDecision: '' };
    const final = await waitForCwpFinalWindow(win, { storage: saved, maxWait: 300, delay: async () => { win.__cwpDecision = 'keep'; } });
    assert.equal(final, true);
    const timeoutWin = { name: 'SP Desktop_uid0', opener: null };
    assert.equal(await waitForCwpFinalWindow(timeoutWin, { storage: saved, maxWait: 200, delay: async () => {} }), true);
});

test('unmanaged startup proceeds immediately and main CWP guard is window-specific', async () => {
    const saved = storage();
    assert.equal(cwpStartupVerdict({ name: 'SP Desktop_uid0' }, saved), 'final');
    assert.equal(await waitForCwpFinalWindow({ name: 'Friends_uid1' }, { storage: saved }), true);
});

test('deferred CWP install runs once after timeout approval and can be canceled by pagehide or OFF', async () => {
    const makeWindow = () => {
        const listeners = new Map();
        return {
            name: 'SP Desktop_uid0', opener: null,
            PLUGIN_LIST: { 'steam-change-window-params': {} },
            localStorage: storage({ 'atoms.annotator.cwp.v1': '1' }),
            addEventListener: (name, fn) => listeners.set(name, fn),
            removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
            fire: name => listeners.get(name)?.(),
        };
    };
    const allowedWindow = makeWindow();
    let installs = 0;
    const gate = deferCwpInstall(allowedWindow, () => installs++, { maxWait: 100, delay: async () => {} });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(installs, 1, 'a permissive timeout must not re-enter the pending gate');
    assert.equal(gate.pendingCwp, false);

    const hiddenWindow = makeWindow(); let hiddenInstalls = 0;
    deferCwpInstall(hiddenWindow, () => hiddenInstalls++, { maxWait: 200, delay: async () => { hiddenWindow.__cwpDecision = 'keep'; } });
    hiddenWindow.fire('pagehide');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(hiddenInstalls, 0);

    const offWindow = makeWindow(); let offInstalls = 0;
    const offGate = deferCwpInstall(offWindow, () => offInstalls++, { maxWait: 200, delay: async () => { offWindow.__cwpDecision = 'keep'; } });
    offGate.stop();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(offInstalls, 0);
});
