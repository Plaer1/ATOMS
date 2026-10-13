#!/usr/bin/env node
'use strict';

// Hold Alt: preserve CSS :hover in CDP and route input through a transparent
// child document. The child keeps React/Steam's pre-existing window listeners
// out of the input path, while the existing picker still chooses real elements.
const LOCK_BINDING = '__atomsAnnotationInputLockEmit';

function installAnnotationInputLock() {
    if (/^about:srcdoc(?:[?#]|$)/i.test(location.href)) return 'ignored-note-frame';
    const KEY = '__atomsAnnotationInputLockV1';
    if (window[KEY] && !window[KEY].stopped) return 'already-installed';
    let held = false, token = 0, frame = null, stopped = false;
    let hovered = [], readyTimer = null, tailUntil = 0;
    const bindings = [];
    const shadow = () => document.getElementById('atoms-visual-audit-host')?.shadowRoot;
    const audit = () => window.__atomsVisualAuditV5;
    const noteOpen = () => shadow()?.getElementById('note')?.style.display === 'block';
    const emit = (action, id) => {
        try { window.__atomsAnnotationInputLockEmit(JSON.stringify({ action, token: id })); }
        catch (_) { release(); }
    };
    const listen = (target, type, handler, options = true) => {
        target.addEventListener(type, handler, options);
        bindings.push(() => target.removeEventListener(type, handler, options));
    };
    const eat = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    const forward = (kind, event) => {
        const input = audit()?.input;
        if (!input || noteOpen()) return;
        // Hit-testing is synchronous. The shield returns before the next paint,
        // and the browser never dispatches a physical event into the page.
        frame?.style.setProperty('pointer-events', 'none', 'important');
        try {
            input[kind]({ clientX: event.clientX, clientY: event.clientY,
                altKey: true, button: event.button || 0,
                preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {} });
        } finally { frame?.style.setProperty('pointer-events', 'auto', 'important'); }
    };
    const release = () => {
        if (!held && !frame) return;
        held = false;
        clearTimeout(readyTimer);
        tailUntil = performance.now() + 250;
        frame?.remove(); frame = null;
        hovered = [];
        emit('release', token);
    };
    const begin = () => {
        if (held || stopped || !audit() || audit().stopped || !audit().input || noteOpen()) return;
        held = true;
        token += 1;
        hovered = [...document.querySelectorAll(':hover')].filter(e =>
            !e.closest('#atoms-visual-audit-host, #atoms-theme-toggle-host')).slice(0, 64);
        // Fail open if the CDP owner disappears; do not leave Steam input stuck.
        readyTimer = setTimeout(release, 1500);
        emit('freeze', token);
    };
    const activate = id => {
        if (!held || id !== token || stopped || !shadow()) return false;
        clearTimeout(readyTimer);
        frame = document.createElement('iframe');
        frame.id = 'atoms-alt-input-shield';
        frame.title = 'ATOMS Alt input shield';
        frame.style.cssText = 'position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;border:0!important;background:transparent!important;pointer-events:auto!important;z-index:-1!important;';
        frame.srcdoc = '<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden;cursor:crosshair}</style></head><body tabindex="-1"></body></html>';
        frame.addEventListener('load', () => {
            if (!held || !frame?.isConnected || id !== token) return;
            const w = frame.contentWindow;
            const pointer = event => {
                eat(event);
                if (!event.altKey) { release(); return; }
                if (event.type === 'mousemove') forward('move', event);
                if (event.type === 'click' && event.button === 0) forward('click', event);
            };
            for (const type of ['pointermove', 'pointerdown', 'pointerup', 'mousemove', 'mousedown', 'mouseup',
                'click', 'dblclick', 'auxclick', 'contextmenu', 'dragstart', 'dragover', 'drop', 'wheel', 'touchstart', 'touchmove']) {
                w.addEventListener(type, pointer, { capture: true, passive: false });
            }
            w.addEventListener('keydown', event => {
                eat(event);
                if (event.key === 'Escape') release();
            }, true);
            w.addEventListener('keyup', event => {
                eat(event);
                if (event.key === 'Alt' || !event.altKey) release();
            }, true);
            if (!noteOpen()) {
                w.focus();
                frame.contentDocument.body.focus({ preventScroll: true });
            }
        }, { once: true });
        shadow().prepend(frame);
        return true;
    };
    const keydown = event => {
        if (event.key === 'Alt' && !event.repeat) begin();
        if (held && !noteOpen()) eat(event);
    };
    const keyup = event => {
        if (held && (event.key === 'Alt' || !event.altKey)) { eat(event); release(); }
    };
    const intercept = event => {
        if (stopped) return;
        if (event.type === 'pointerdown' && !event.altKey && !held) tailUntil = 0;
        if (held) {
            // Also block the transition events generated when the shield mounts.
            if (!noteOpen() && event.type === 'mousemove') forward('move', event);
            eat(event);
        } else if (performance.now() < tailUntil && /^(?:pointerup|mouseup|click|auxclick|contextmenu)$/.test(event.type)) eat(event);
    };
    listen(window, 'keydown', keydown);
    listen(window, 'keyup', keyup);
    for (const type of ['pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'pointermove',
        'mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'mousemove', 'pointerdown', 'pointerup',
        'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'wheel', 'dragstart', 'dragover', 'drop']) {
        listen(window, type, intercept, { capture: true, passive: false });
    }
    listen(window, 'pagehide', release);
    listen(document, 'visibilitychange', () => { if (document.hidden) release(); });
    listen(window, 'blur', () => {
        setTimeout(() => { if (!document.hasFocus()) release(); }, 0);
    });
    const noteFrame = () => shadow()?.getElementById('note-input-frame');
    let attachedNote = null;
    const bindNote = () => {
        const n = noteFrame();
        if (!n || n === attachedNote) return;
        attachedNote = n;
        const attach = () => {
            try {
                listen(n.contentWindow, 'keyup', keyup);
                // Steam can block the srcdoc's inline script. Install this
                // from the parent too, so Enter/Escape always reach the saved
                // picker's existing note handler, without rebuilding its state.
                listen(n.contentWindow, 'keydown', event => {
                    if (!noteOpen() || !['Enter', 'Escape'].includes(event.key) || !audit()?.input?.note) return;
                    eat(event);
                    audit().input.note({ source: n.contentWindow,
                        data: { channel: 'atoms-visual-audit-note', key: event.key } });
                });
            } catch (_) {}
        };
        listen(n, 'load', attach);
        attach();
    };
    const observer = new MutationObserver(bindNote);
    if (document.documentElement) observer.observe(document.documentElement, { childList: true });
    else listen(document, 'DOMContentLoaded', () => {
        observer.observe(document.documentElement, { childList: true });
        bindNote();
    });
    bindNote();
    const stop = () => {
        release(); stopped = true;
        observer.disconnect();
        bindings.splice(0).forEach(remove => remove());
        window[KEY].stopped = true;
    };
    window[KEY] = { activate, release, stop, getHovered: () => hovered,
        isHeld: () => held, getToken: () => token, stopped: false };
    return 'installed';
}

// One CSS operation per hovered ancestor, on Alt down/up only. No DOM scans or
// polling while the mouse moves. Serializing each context handles fast release.
class AnnotationInputLockBridge {
    constructor(call) { this.call = call; this.queues = new Map(); this.forced = new Map(); }
    handle(params) {
        let message;
        try { message = JSON.parse(params.payload); } catch (_) { return; }
        if (!['freeze', 'release'].includes(message.action) || !Number.isSafeInteger(message.token)) return;
        const contextId = params.executionContextId;
        const job = (this.queues.get(contextId) || Promise.resolve()).then(async () => {
            await this.clear(contextId);
            if (message.action === 'release') return;
            const group = 'atoms-alt-hover-' + contextId;
            try {
                await this.call('DOM.getDocument', { depth: 0 });
                const result = await this.call('Runtime.evaluate', {
                    expression: 'window.__atomsAnnotationInputLockV1?.getHovered()', contextId, objectGroup: group
                });
                if (!result.result?.objectId) return;
                const props = await this.call('Runtime.getProperties', { objectId: result.result.objectId, ownProperties: true });
                const nodes = [];
                this.forced.set(contextId, nodes);
                // Do not serialize two round trips for every hovered ancestor.
                // Steam's renderer can be busy: pin the small ancestor set in
                // parallel before acknowledging the input shield.
                await Promise.all(props.result.filter(p => /^\d+$/.test(p.name) && p.value?.objectId).slice(0, 64).map(async prop => {
                    const { nodeId } = await this.call('DOM.requestNode', { objectId: prop.value.objectId });
                    if (!nodeId) return;
                    nodes.push(nodeId);
                    await this.call('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
                }));
                const activated = await this.call('Runtime.evaluate', {
                    expression: `window.__atomsAnnotationInputLockV1?.activate(${message.token})`, contextId, returnByValue: true
                });
                if (activated.result?.value !== true) await this.clear(contextId);
            } catch (_) { await this.clear(contextId); }
            finally { await this.call('Runtime.releaseObjectGroup', { objectGroup: group }).catch(() => {}); }
        }).catch(() => {});
        this.queues.set(contextId, job);
    }
    async clear(contextId) {
        const nodes = this.forced.get(contextId) || [];
        this.forced.delete(contextId);
        await Promise.all(nodes.map(nodeId => this.call('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }).catch(() => {})));
    }
    async stop() {
        await Promise.all([...this.queues.values()]);
        await Promise.all([...this.forced.keys()].map(id => this.clear(id)));
    }
}

module.exports = { installAnnotationInputLock, AnnotationInputLockBridge, LOCK_BINDING };

// Live upgrade for the already-running recorder. It never restarts that process
// or touches its saved selections, and exits when that specific recorder ends.
if (require.main === module) {
    const fs = require('fs');
    const path = require('path');
    const WebSocket = require('ws');
    const root = process.env.ATOMS_CDP || 'http://127.0.0.1:50205';
    const capturePid = Number(process.env.ATOMS_CAPTURE_PID);
    const reportDir = process.env.ATOMS_VISUAL_AUDIT_DIR;
    if (!Number.isSafeInteger(capturePid) || capturePid < 1 || !reportDir) throw new Error('Live upgrade requires capture PID and report directory');
    const source = `(${installAnnotationInputLock.toString()})();`;
    const connections = new Map();
    let stopped = false, polling = false;
    function connect(target) {
        const socket = new WebSocket(target.webSocketDebuggerUrl);
        const pending = new Map(), contexts = new Set(), pendingInputs = new Set();
        let sequence = 0, preload = null, ready = false;
        const call = (method, params = {}) => new Promise((resolve, reject) => {
            if (socket.readyState !== WebSocket.OPEN) { reject(new Error('closed')); return; }
            const id = ++sequence;
            const timer = setTimeout(() => { pending.delete(id); reject(new Error(method)); }, 4000);
            pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
        });
        const bridge = new AnnotationInputLockBridge(call);
        // Expose only the existing, authored picker's two callbacks, preserving
        // its closure (including selections and an in-progress note).
        const connectExistingPicker = `(() => {
            if (/^about:srcdoc/.test(location.href)) return true;
            const a = window.__atomsVisualAuditV5;
            if (!a || a.stopped) return false;
            if (a.input?.note) return true;
            const move = (getEventListeners(document).mousemove || []).find(x => x.listener.name === 'onMove' && String(x.listener).includes('state.hovered = findPickedTarget(event)'));
            const click = (getEventListeners(window).click || []).find(x => x.listener.name === 'onClick' && String(x.listener).includes('blockAltPickerGesture(event)'));
            const note = (getEventListeners(window).message || []).find(x => x.listener.name === 'onNoteMessage' && String(x.listener).includes('atoms-visual-audit-note'));
            if (move && click && note) a.input = { move: move.listener, click: click.listener, note: note.listener };
            return Boolean(a.input?.note);
        })()`;
        const install = async contextId => {
            const result = await call('Runtime.evaluate', { expression: connectExistingPicker, contextId, includeCommandLineAPI: true, returnByValue: true });
            await call('Runtime.evaluate', { expression: source, contextId, returnByValue: true });
            if (result.result?.value === true) pendingInputs.delete(contextId);
        };
        const connection = { async close() {
            ready = false;
            if (socket.readyState === WebSocket.OPEN) {
                await Promise.all([...contexts].map(contextId => call('Runtime.evaluate', { expression: 'window.__atomsAnnotationInputLockV1?.stop()', contextId }).catch(() => {})));
                await bridge.stop();
                if (preload) await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: preload }).catch(() => {});
                socket.close();
            } else socket.terminate();
        }, async sync() {
            if (ready) await Promise.all([...pendingInputs].map(install));
        } };
        connections.set(target.id, connection);
        socket.on('message', raw => {
            const m = JSON.parse(raw), p = pending.get(m.id);
            if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result || {}); }
            if (m.method === 'Runtime.bindingCalled' && m.params.name === LOCK_BINDING) bridge.handle(m.params);
            if (m.method === 'Runtime.executionContextCreated' && m.params.context.auxData?.isDefault) {
                const id = m.params.context.id;
                contexts.add(id); pendingInputs.add(id);
                if (ready) install(id).catch(() => {});
            } else if (m.method === 'Runtime.executionContextDestroyed') {
                contexts.delete(m.params.executionContextId); pendingInputs.delete(m.params.executionContextId);
            } else if (m.method === 'Runtime.executionContextsCleared') { contexts.clear(); pendingInputs.clear(); }
        });
        socket.once('open', async () => {
            try {
                await call('Runtime.enable'); await call('Page.enable'); await call('DOM.enable'); await call('CSS.enable');
                await call('Runtime.addBinding', { name: LOCK_BINDING });
                preload = (await call('Page.addScriptToEvaluateOnNewDocument', { source })).identifier;
                ready = true; await connection.sync();
            } catch (e) { console.warn('[alt-input-lock] attach failed: ' + e.message); socket.close(); }
        });
        socket.on('error', () => {});
        socket.once('close', () => {
            if (connections.get(target.id) === connection) connections.delete(target.id);
            for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('closed')); }
            pending.clear();
        });
    }
    async function finish() {
        if (stopped) return; stopped = true; clearInterval(timer);
        await Promise.all([...connections.values()].map(c => c.close()));
        console.log('[alt-input-lock] stopped');
    }
    async function poll() {
        if (stopped || polling) return; polling = true;
        try {
            try { process.kill(capturePid, 0); } catch (_) { await finish(); return; }
            if (fs.existsSync(path.join(reportDir, 'stopped.json'))) { await finish(); return; }
            const pages = (await (await fetch(root + '/json/list', { signal: AbortSignal.timeout(3000) })).json())
                .filter(t => ['page', 'iframe'].includes(t.type) && t.webSocketDebuggerUrl && !t.url.startsWith('about:srcdoc'));
            const live = new Set(pages.map(t => t.id));
            for (const [id, c] of connections) if (!live.has(id)) { connections.delete(id); await c.close(); }
            for (const t of pages) {
                if (!connections.has(t.id)) connect(t);
                // The current recorder can install after executionContextCreated.
                else await connections.get(t.id).sync().catch(() => {});
            }
        } catch (_) {} finally { polling = false; }
    }
    const timer = setInterval(poll, 1000);
    process.on('SIGINT', finish); process.on('SIGTERM', finish);
    console.log('[alt-input-lock] live upgrade; existing capture and notes preserved');
    poll();
}
