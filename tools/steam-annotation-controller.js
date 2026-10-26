#!/usr/bin/env node
'use strict';

// One opt-in session authority for all intended Steam documents. Recorder OFF
// has no picker/input hooks; controls and note management remain available.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { installAnnotationControl, isSteamBrowserViewPopup } = require('./steam-annotation-control');
const { installAnnotationColorToggle } = require('./steam-annotation-color-toggle');
const { installAnnotationNoteManager } = require('./steam-annotation-note-manager');
const BINDING = '__atomsAnnotatorControlEmit';
const NOTE_CHANNEL = 'atoms-annotation-notes';
const intendedURL = value => /^https?:\/\/(?:steamloopback\.host|store\.steampowered\.com|steamcommunity\.com|help\.steampowered\.com|partner\.steamgames\.com)(?::\d+)?(?:[/?#]|$)/i.test(value || '');
const nativeBlank = value => /^about:blank\?createflags=/i.test(value || '');
const intendedTarget = target => target.type === 'page' && !['ATOMS annotation', 'ATOMS saved annotations'].includes(target.title) &&
    !/^atoms_annotation(?:_manager)?_uid/.test(target.name || '') && Boolean(target.webSocketDebuggerUrl) &&
    (intendedURL(target.url) || nativeBlank(target.url) || isSteamBrowserViewPopup(target.url, target.name, target.title));
const intendedContext = (target, context) => Boolean(context.auxData?.isDefault && intendedTarget(target) &&
    !/^atoms_annotation(?:_manager)?_uid/.test(context.name || '') &&
    (intendedURL((context.origin || '') + '/') || (nativeBlank(target.url) && !context.origin) ||
        (isSteamBrowserViewPopup(target.url, target.name, target.title) && (!context.origin || context.origin === 'null'))));
function readSavedColorMode(file) {
    try {
        const config = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (config.themes?.activeTheme !== 'ATOMS') return null;
        const value = config.themes?.conditions?.ATOMS?.['Light mode?'];
        return value === 'yes' ? 'light' : value === 'no' ? 'dark' : null;
    } catch (_) { return null; } // A partial/unavailable config is not a change.
}
const errorReply = error => ({ message: error?.message || 'Note request failed', code: error?.code || 'STORAGE_ERROR' });

// Close the discovery/handshake race before cleanup takes its connection
// inventory. Work already accepted can finish its bounded handshake, but it
// must check active() before installing resources.
class ControllerAttachments {
    constructor() { this.stopping = false; this.pending = new Set(); }
    start(work) {
        if (this.stopping) return Promise.resolve();
        const task = Promise.resolve().then(() => {
            if (!this.stopping) return work(() => !this.stopping);
        });
        this.pending.add(task);
        task.then(() => this.pending.delete(task), () => this.pending.delete(task));
        return task;
    }
    beginStop() { this.stopping = true; }
    async drain() {
        while (this.pending.size) await Promise.allSettled([...this.pending]);
    }
}

class AnnotationSession {
    constructor({ directory, launch = spawn, publish = () => {}, noteService = null }) {
        Object.assign(this, { directory, launch, publish, noteService });
        this.child = null; this.pending = false; this.error = '';
        this.previewMode = null; this.savedMode = null; this.revision = 0; this.notesRevision = null;
        this.queue = Promise.resolve(); this.noteQueue = Promise.resolve();
    }
    state() {
        return { enabled: Boolean(this.child), pending: this.pending, available: true, error: this.error,
            previewMode: this.previewMode, savedMode: this.savedMode, revision: this.revision, notesRevision: this.notesRevision };
    }
    changed(change) { this.revision++; this.publish(this.state(), change); }
    enqueue(action) {
        const result = this.queue.then(action);
        this.queue = result.catch(() => {}); return result;
    }
    setColorMode(mode) {
        return this.enqueue(() => {
            if (mode !== null && mode !== 'dark' && mode !== 'light') throw Object.assign(Error('Expected null, light or dark'), { code: 'INVALID_REQUEST' });
            if (this.previewMode !== mode) { this.previewMode = mode; this.changed(); }
            return this.state();
        });
    }
    reportSavedMode(mode) {
        return this.enqueue(() => {
            if (mode !== 'dark' && mode !== 'light') return this.state();
            if (this.savedMode !== mode) {
                // First successful read establishes the baseline; a real later
                // setting change cancels the temporary session preview.
                if (this.savedMode !== null) this.previewMode = null;
                this.savedMode = mode; this.changed();
            }
            return this.state();
        });
    }
    notesChanged(change) {
        if (!change || change.revision === undefined) return;
        this.notesRevision = change.revision; this.changed(change);
    }
    requestNotes(request, fromRecorder = false) {
        // This queue must not wait behind recorder shutdown: the child flushes
        // its outstanding record RPC before exiting on SIGTERM.
        const result = this.noteQueue.then(async () => {
            if (!this.noteService) throw Object.assign(Error('Note service unavailable'), { code: 'UNAVAILABLE' });
            const allowed = fromRecorder ? request?.action === 'record' : ['list', 'edit', 'delete'].includes(request?.action);
            if (!allowed) throw Object.assign(Error('Unsupported note action'), { code: 'INVALID_REQUEST' });
            return this.noteService.handle(request);
        });
        this.noteQueue = result.catch(() => {}); return result;
    }
    async initializeNotes() {
        if (this.noteService) {
            const result = await this.requestNotes({ action: 'list' });
            this.notesRevision = result.revision; this.changed();
        }
    }
    handleChildMessage(child, message) {
        if (child !== this.child || message?.channel !== NOTE_CHANNEL || typeof message.requestId !== 'string') return;
        const request = { action: message.action, record: message.record, id: message.id, revision: message.revision };
        this.requestNotes(request, true).then(result => reply({ result }), error => reply({ error: errorReply(error) }));
        function reply(payload) {
            if (child.connected !== false && typeof child.send === 'function') {
                try { child.send({ channel: NOTE_CHANNEL, requestId: message.requestId, ...payload }, () => {}); } catch (_) { /* Child already gone. */ }
            }
        }
    }
    setEnabled(enabled) {
        return this.enqueue(async () => {
            this.pending = true; this.error = ''; this.changed();
            try {
                if (enabled && !this.child) {
                    const child = this.launch(process.execPath, [path.join(__dirname, 'steam-visual-audit.js')], {
                        cwd: path.dirname(__dirname),
                        env: { ...process.env, ATOMS_VISUAL_AUDIT_DIR: this.directory, ATOMS_ANNOTATION_IPC: '1' },
                        stdio: ['ignore', 'ignore', 'ignore', 'ipc']
                    });
                    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
                    this.child = child;
                    child.on('message', message => this.handleChildMessage(child, message));
                    child.once('exit', () => {
                        if (this.child !== child) return;
                        this.child = null; this.changed(); // Never automatically restart.
                    });
                } else if (!enabled && this.child) {
                    const child = this.child;
                    await new Promise(resolve => {
                        const timer = setTimeout(() => child.kill('SIGKILL'), 12000);
                        child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGTERM');
                    });
                    if (this.child === child) this.child = null;
                }
            } catch (error) { this.error = error.message; }
            finally { this.pending = false; this.changed(); }
            return this.state();
        });
    }
    async flush() { await this.noteQueue; await this.noteService?.flush(); }
}

function documentSource(state, target = {}) {
    // Native popup names can arrive after preloading. Only a target already
    // validated by the same strict parser supplies these bootstrap identities.
    const nativeNames = isSteamBrowserViewPopup(target.url, target.name, target.title) ? [target.name, target.title].filter(Boolean) : [];
    // Millennium owns default stylesheets; the opt-in debug tools own only
    // their session preview. A late import cannot revive a stopped owner.
    return `(()=>{const api=(${installAnnotationControl.toString()})(${JSON.stringify(state)},()=>(${installAnnotationColorToggle.toString()})(),(${isSteamBrowserViewPopup.toString()}),${JSON.stringify(nativeNames)});if(!api)return;(${installAnnotationNoteManager.toString()})();if(!window.__atomsDebugPaletteBootstrapV1){window.__atomsDebugPaletteBootstrapV1=true;import('https://millennium.host/v1/themes/ATOMS/js/utilities/debugPalette.js').then(m=>{const install=()=>{if(!api.stopped&&window.__atomsDebugMenuEnabledV1!==false)m.installDebugPalette();};if(document.documentElement)install();else document.addEventListener('DOMContentLoaded',install,{once:true});}).catch(()=>{delete window.__atomsDebugPaletteBootstrapV1;});}})();`;
}

async function main() {
    const root = path.dirname(__dirname);
    const registry = path.join(root, '.clanker/artifacts/light-mode/active-capture.json');
    const saved = fs.existsSync(registry) ? JSON.parse(fs.readFileSync(registry, 'utf8')) : {};
    const directory = process.argv[2] || saved.directory || path.join(root, '.clanker/artifacts/visual-audits', `capture-${Date.now()}`);
    fs.mkdirSync(directory, { recursive: true });
    if (saved.pid && !fs.existsSync(path.join(directory, 'stopped.json'))) {
        try { process.kill(saved.pid, 0); throw Error('Stop the existing recorder before starting its controller'); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    const lock = path.join(root, '.clanker/artifacts/light-mode/annotation-controller.json');
    if (fs.existsSync(lock)) {
        const previous = JSON.parse(fs.readFileSync(lock, 'utf8'));
        try { process.kill(previous.pid, 0); throw Error('Annotation controller is already running'); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, directory }) + '\n');
    const connections = new Map();
    const attaches = new ControllerAttachments();
    let failures = 0;
    const cdp = process.env.ATOMS_CDP || saved.cdp || 'http://127.0.0.1:8080';
    const configFile = process.env.ATOMS_MILLENNIUM_CONFIG || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'millennium', 'config.json');
    const update = (state, change) => {
        fs.writeFileSync(registry, JSON.stringify({ ...saved, pid: session.child?.pid || null, directory, cdp, debugCompanionPid: null, controllerPid: process.pid, annotatorEnabled: state.enabled }, null, 2) + '\n');
        for (const c of connections.values()) {
            c.refresh().catch(() => {});
            if (change) for (const contextId of c.contexts) c.evaluate(`window.__atomsAnnotationControlV1?.notesChanged(${JSON.stringify(change)})`, contextId).catch(() => {});
        }
    };
    const { AnnotationNoteService } = require('./annotation-note-service');
    const service = new AnnotationNoteService(path.join(directory, 'selected-assets.jsonl'), { publish: change => session.notesChanged(change) });
    const session = new AnnotationSession({ directory, noteService: service, publish: update });
    await session.reportSavedMode(readSavedColorMode(configFile));
    await session.initializeNotes();
    async function attach(target, active) {
        if (!active()) return;
        const ws = new WebSocket(target.webSocketDebuggerUrl, { handshakeTimeout: 3500 });
        let id = 0;
        const pending = new Map();
        const call = (method, params = {}) => new Promise((resolve, reject) => {
            const n = ++id, timer = setTimeout(() => { pending.delete(n); reject(Error(method + ' timeout')); }, 3500);
            pending.set(n, { resolve, reject, timer });
            try { ws.send(JSON.stringify({ id: n, method, params })); } catch (error) { clearTimeout(timer); pending.delete(n); reject(error); }
        });
        let refreshQueue = Promise.resolve(), dirty = false;
        const c = { ws, call, contexts: new Set(), script: null,
            evaluate: (expression, contextId) => call('Runtime.evaluate', { expression, contextId, returnByValue: true }),
            install: contextId => active() ? c.evaluate(documentSource(session.state(), target), contextId) : Promise.resolve(),
            drainRefresh: () => refreshQueue.catch(() => {}),
            refresh() {
                dirty = true;
                refreshQueue = refreshQueue.catch(() => {}).then(async () => {
                    while (dirty && active()) {
                        dirty = false;
                        const previous = c.script;
                        c.script = (await call('Page.addScriptToEvaluateOnNewDocument', { source: documentSource(session.state(), target) })).identifier;
                        if (previous) await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: previous });
                        await Promise.all([...c.contexts].map(contextId => c.install(contextId).catch(() => {})));
                    }
                });
                return refreshQueue;
            }
        };
        connections.set(target.id, c);
        ws.on('error', () => {});
        ws.on('message', raw => {
            let m; try { m = JSON.parse(raw); } catch (_) { return; }
            const p = pending.get(m.id);
            if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result || {}); }
            if (m.method === 'Runtime.executionContextCreated') {
                const ctx = m.params.context;
                if (intendedContext(target, ctx)) {
                    c.contexts.add(ctx.id);
                    if (active()) c.install(ctx.id).catch(() => {});
                }
            }
            if (m.method === 'Runtime.executionContextDestroyed') c.contexts.delete(m.params.executionContextId);
            if (m.method === 'Runtime.executionContextsCleared') c.contexts.clear();
            if (active() && m.method === 'Runtime.bindingCalled' && m.params.name === BINDING && c.contexts.has(m.params.executionContextId)) {
                const contextId = m.params.executionContextId;
                let request; try { request = JSON.parse(m.params.payload); } catch (_) { return; }
                if (request?.type === 'notes' && typeof request.requestId === 'string') {
                    // Explicit fields only: browser requests can never append a record.
                    const payload = request.payload || {};
                    session.requestNotes({ action: request.action, id: payload.id, revision: payload.revision, note: payload.note, colorMode: payload.colorMode })
                        .then(result => reply({ result }), error => reply({ error: errorReply(error) }));
                    function reply(value) { c.evaluate(`window.__atomsAnnotationControlV1?.receiveNotes(${JSON.stringify({ requestId: request.requestId, ...value })})`, contextId).catch(() => {}); }
                } else if (request?.type === 'color-mode') session.setColorMode(request.mode).catch(() => {});
                else if (request?.type === 'sync') c.install(contextId).catch(() => {});
                else if ((request?.type === 'annotator' || !request?.type) && typeof request?.enabled === 'boolean') session.setEnabled(request.enabled).catch(() => {});
            }
        });
        ws.on('close', () => {
            if (connections.get(target.id) === c) connections.delete(target.id);
            for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('CDP closed')); } pending.clear();
        });
        try {
            await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
            if (!active()) { ws.close(); return; }
            await call('Runtime.addBinding', { name: BINDING });
            if (!active()) { ws.close(); return; }
            await call('Runtime.enable');
            if (!active()) return; // Stop owns cleanup of contexts already preloaded.
            await c.refresh();
        } catch (_) { ws.close(); }
    }
    async function poll() {
        if (attaches.stopping) return;
        await session.reportSavedMode(readSavedColorMode(configFile));
        if (attaches.stopping) return;
        try {
            const listed = await (await fetch(cdp + '/json/list', { signal: AbortSignal.timeout(2500) })).json();
            if (attaches.stopping) return;
            failures = 0;
            for (const t of listed) if (intendedTarget(t) && !connections.has(t.id)) attaches.start(active => attach(t, active)).catch(() => {});
        } catch (_) { if (++failures >= 15) stop(); }
    }
    async function stop() {
        if (attaches.stopping) return;
        attaches.beginStop(); clearInterval(timer);
        await session.setEnabled(false); await session.flush();
        await attaches.drain();
        await Promise.all([...connections.values()].map(async c => {
            await c.drainRefresh();
            if (c.script) await c.call('Page.removeScriptToEvaluateOnNewDocument', { identifier: c.script }).catch(() => {});
            for (const contextId of c.contexts) await c.evaluate('window.__atomsAnnotationControlV1?.stop()', contextId).catch(() => {});
            c.ws.close();
        }));
        fs.rmSync(lock, { force: true });
    }
    update(session.state());
    const timer = setInterval(poll, 2000); poll();
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    console.log('[ATOMS] annotation controller ready; recorder OFF');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { AnnotationSession, ControllerAttachments, intendedTarget, intendedContext, intendedURL, readSavedColorMode, documentSource };
