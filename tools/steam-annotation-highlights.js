#!/usr/bin/env node
'use strict';

// This control changes only the annotator's decoration. It can be installed
// into an existing capture without replacing its selection or note state.
function installAnnotationHighlights() {
    if (/^about:srcdoc(?:[?#]|$)/i.test(location.href)) return 'ignored-note-frame';
    const key = '__atomsAnnotationHighlightsV1';
    if (window[key] && !window[key].stopped) {
        window[key].sync();
        return 'already-installed';
    }
    const storageKey = 'atoms-annotation-highlights-hidden-v1';
    let enabled = true;
    try { enabled = sessionStorage.getItem(storageKey) !== '1'; } catch (_) {}
    const keyboardWindows = new Map();
    const noteFrames = new Map();
    let stopped = false;
    let mountObserver = null;

    const sync = () => {
        if (stopped) return;
        const shadow = document.getElementById('atoms-visual-audit-host')?.shadowRoot;
        if (!shadow) return;
        let style = shadow.getElementById('atoms-highlight-visibility');
        if (!style) {
            style = document.createElement('style');
            style.id = 'atoms-highlight-visibility';
            shadow.appendChild(style);
        }
        const css = enabled ? '' : '#box { display: none !important; }';
        if (style.textContent !== css) style.textContent = css;
        const frame = shadow.getElementById('note-input-frame');
        if (frame && !noteFrames.has(frame)) {
            const attach = () => {
                try { if (frame.contentWindow) attachKeyboard(frame.contentWindow, true); } catch (_) {}
            };
            noteFrames.set(frame, attach);
            frame.addEventListener('load', attach);
            attach();
        }
    };

    const setEnabled = (value) => {
        enabled = Boolean(value);
        try { sessionStorage.setItem(storageKey, enabled ? '0' : '1'); } catch (_) {}
        sync();
        return enabled;
    };

    const detachKeyboard = (targetWindow, handlers) => {
        targetWindow.removeEventListener('keydown', handlers.keydown, true);
        targetWindow.removeEventListener('keyup', handlers.keyup, true);
        targetWindow.removeEventListener('pointerdown', handlers.cancelTap, true);
        targetWindow.removeEventListener('wheel', handlers.cancelTap, true);
        targetWindow.removeEventListener('blur', handlers.cancelTap, true);
    };

    const attachKeyboard = (targetWindow, refresh = false) => {
        if (keyboardWindows.has(targetWindow)) {
            if (!refresh) return;
            // A srcdoc navigation preserves the WindowProxy, but discards
            // listeners from its old document. Rebind after every frame load.
            detachKeyboard(targetWindow, keyboardWindows.get(targetWindow));
        }
        let tapStarted = null;
        const cancelTap = () => { tapStarted = null; };
        const keydown = (event) => {
            if (event.key !== 'Control') { cancelTap(); return; }
            if (event.repeat) return;
            tapStarted = !event.altKey && !event.metaKey && !event.shiftKey ? Date.now() : null;
        };
        const keyup = (event) => {
            if (event.key !== 'Control') { cancelTap(); return; }
            const isTap = tapStarted !== null && Date.now() - tapStarted <= 650 &&
                !event.altKey && !event.metaKey && !event.shiftKey;
            cancelTap();
            if (isTap) setEnabled(!enabled);
        };
        targetWindow.addEventListener('keydown', keydown, true);
        targetWindow.addEventListener('keyup', keyup, true);
        targetWindow.addEventListener('pointerdown', cancelTap, true);
        targetWindow.addEventListener('wheel', cancelTap, true);
        targetWindow.addEventListener('blur', cancelTap, true);
        keyboardWindows.set(targetWindow, { keydown, keyup, cancelTap });
    };

    const stop = () => {
        if (stopped) return;
        stopped = true;
        if (mountObserver) mountObserver.disconnect();
        document.removeEventListener('DOMContentLoaded', observeMount);
        for (const [targetWindow, handlers] of keyboardWindows) detachKeyboard(targetWindow, handlers);
        for (const [frame, attach] of noteFrames) frame.removeEventListener('load', attach);
        document.getElementById('atoms-visual-audit-host')?.shadowRoot
            ?.getElementById('atoms-highlight-visibility')?.remove();
        window[key].stopped = true;
    };

    const observeMount = () => {
        if (stopped || !document.documentElement) return;
        sync();
        if (mountObserver) return;
        // Only watch direct root children: the existing annotator mounts here.
        // Do not add another full-page mutation scanner for this shortcut.
        mountObserver = new MutationObserver(mutations => {
            if (mutations.some(m => [...m.addedNodes].some(node => node.id === 'atoms-visual-audit-host'))) sync();
        });
        mountObserver.observe(document.documentElement, { childList: true });
    };

    window[key] = { sync, setEnabled, isEnabled: () => enabled, stop, stopped: false };
    attachKeyboard(window);
    observeMount();
    if (!document.documentElement) document.addEventListener('DOMContentLoaded', observeMount, { once: true });
    return 'installed';
}

module.exports = { installAnnotationHighlights };

// A temporary companion adds the shortcut to the already-running capture.
// Future captures install it through steam-visual-audit.js itself.
if (require.main === module) {
    const fs = require('fs');
    const path = require('path');
    const WebSocket = require('ws');
    const root = process.env.ATOMS_CDP || 'http://127.0.0.1:53106';
    const reportDir = process.env.ATOMS_VISUAL_AUDIT_DIR;
    const source = `(${installAnnotationHighlights.toString()})();`;
    const connections = new Map();
    let stopped = false;
    let polling = false;

    function connect(target) {
        const socket = new WebSocket(target.webSocketDebuggerUrl);
        const pending = new Map();
        const contexts = new Set();
        let sequence = 0;
        let preloadId = null;
        let ready = false;
        const call = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++sequence;
            const timer = setTimeout(() => { pending.delete(id); reject(new Error(method)); }, 3000);
            pending.set(id, { resolve, reject, timer });
            socket.send(JSON.stringify({ id, method, params }));
        });
        const install = (contextId) => call('Runtime.evaluate', {
            expression: source, contextId, returnByValue: true
        }).catch(() => {});
        const connection = {
            socket,
            async close() {
                ready = false;
                if (socket.readyState === WebSocket.OPEN) {
                    if (preloadId) await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: preloadId }).catch(() => {});
                    await Promise.all([...contexts].map(contextId => call('Runtime.evaluate', {
                        expression: 'window.__atomsAnnotationHighlightsV1?.stop()', contextId
                    }).catch(() => {})));
                    socket.close();
                } else socket.terminate();
            }
        };
        connections.set(target.id, connection);
        socket.on('message', (raw) => {
            const message = JSON.parse(raw);
            const request = pending.get(message.id);
            if (request) {
                pending.delete(message.id);
                clearTimeout(request.timer);
                if (message.error) request.reject(new Error(message.error.message));
                else request.resolve(message.result || {});
            }
            if (message.method === 'Runtime.executionContextCreated') {
                const context = message.params.context;
                if (context.auxData?.isDefault) {
                    contexts.add(context.id);
                    if (ready) install(context.id);
                }
            } else if (message.method === 'Runtime.executionContextDestroyed') contexts.delete(message.params.executionContextId);
            else if (message.method === 'Runtime.executionContextsCleared') contexts.clear();
        });
        socket.once('open', async () => {
            try {
                await call('Runtime.enable');
                await call('Page.enable');
                const preload = await call('Page.addScriptToEvaluateOnNewDocument', { source });
                preloadId = preload.identifier;
                ready = true;
                await Promise.all([...contexts].map(install));
            } catch (error) {
                console.warn(`[annotation-highlights] attach failed for ${target.title}: ${error.message}`);
                socket.close();
            }
        });
        socket.on('error', () => {});
        socket.once('close', () => {
            if (connections.get(target.id) === connection) connections.delete(target.id);
            for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('CDP closed')); }
            pending.clear();
        });
    }

    async function poll() {
        if (stopped || polling) return;
        polling = true;
        try {
            // Exit when the capture stops; this process never relaunches it.
            if (reportDir && fs.existsSync(path.join(reportDir, 'stopped.json'))) { await finish(); return; }
            const response = await fetch(`${root}/json/list`, { signal: AbortSignal.timeout(3000) });
            const list = await response.json();
            const pages = list.filter(t => ['page', 'iframe'].includes(t.type) && t.webSocketDebuggerUrl && !t.url.startsWith('about:srcdoc'));
            const liveIds = new Set(pages.map(t => t.id));
            for (const [id, connection] of connections) if (!liveIds.has(id)) { connections.delete(id); connection.close().catch(() => {}); }
            for (const target of pages) if (!connections.has(target.id)) connect(target);
        } catch (_) {
            // Steam may be between renderers. The next discovery pass suffices.
        } finally { polling = false; }
    }

    async function finish() {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
        await Promise.all([...connections.values()].map(c => c.close()));
        console.log('[annotation-highlights] stopped');
    }
    const timer = setInterval(poll, 750);
    process.on('SIGTERM', finish);
    process.on('SIGINT', finish);
    console.log('[annotation-highlights] Control tap toggles hover decoration; annotation stays active');
    poll();
}
