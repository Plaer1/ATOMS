'use strict';

const CHANNEL = 'atoms-annotation-notes';

// The recorder has exactly one persistence destination: its controller over
// IPC, or a local service when run standalone. IPC failure never opens a
// second writer against the controller's file.
class AnnotationNoteClient {
    constructor({ file, transport = null, service = null, timeoutMs = 5000 }) {
        this.transport = transport;
        this.service = service || (!transport
            ? new (require('./annotation-note-service').AnnotationNoteService)(file) : null);
        this.timeoutMs = timeoutMs;
        this.queue = Promise.resolve();
        this.pending = new Map();
        this.failures = new Map();
        this.sequence = 0;
        this.closed = false;
        this.onMessage = message => {
            if (message?.channel !== CHANNEL || !this.pending.has(message.requestId)) return;
            const pending = this.pending.get(message.requestId);
            this.pending.delete(message.requestId);
            clearTimeout(pending.timer);
            if (message.error) pending.reject(Object.assign(new Error(message.error.message || String(message.error)), {
                code: message.error.code || 'STORAGE_ERROR'
            }));
            else pending.resolve(message.result);
        };
        this.onDisconnect = () => {
            for (const pending of this.pending.values()) {
                clearTimeout(pending.timer);
                pending.reject(new Error('Annotation controller disconnected before confirming the save'));
            }
            this.pending.clear();
        };
        transport?.on('message', this.onMessage);
        transport?.on('disconnect', this.onDisconnect);
    }

    request(request) {
        if (!this.transport) return this.service.handle(request);
        if (!this.transport.connected) return Promise.reject(new Error('Annotation controller is unavailable'));
        return new Promise((resolve, reject) => {
            const requestId = `record-${++this.sequence}`;
            const fail = error => {
                const pending = this.pending.get(requestId);
                if (!pending) return;
                this.pending.delete(requestId);
                clearTimeout(pending.timer);
                reject(error);
            };
            const timer = setTimeout(() => fail(new Error('Annotation save was not confirmed by its controller')), this.timeoutMs);
            this.pending.set(requestId, { resolve, reject, timer });
            try {
                this.transport.send({ channel: CHANNEL, requestId, ...request }, error => { if (error) fail(error); });
            } catch (error) { fail(error); }
        });
    }

    record(record) {
        if (this.closed) return Promise.reject(new Error('Annotation writer is closed'));
        const payload = record.payload || {};
        const operation = payload.saveRequestId || (payload.selectionId
            ? `${payload.selected === false ? 'withdraw' : 'save'}:${payload.selectionId}:${payload.colorMode || record.colorMode || ''}` : Symbol());
        const task = this.queue.then(() => this.request({ action: 'record', record })).then(result => {
            this.failures.delete(operation);
            return result;
        }, error => { this.failures.set(operation, error); throw error; });
        this.queue = task.catch(() => {});
        return task;
    }

    async flush() {
        // A write accepted while an earlier one is settling belongs to the
        // same drain; a shutdown cannot overtake it.
        let queue;
        do { queue = this.queue; await queue; } while (queue !== this.queue);
        await this.service?.flush?.();
        if (this.failures.size) throw this.failures.values().next().value;
    }

    async close() {
        this.closed = true;
        try { await this.flush(); }
        finally {
            this.transport?.removeListener('message', this.onMessage);
            this.transport?.removeListener('disconnect', this.onDisconnect);
            if (this.transport?.connected) this.transport.disconnect();
        }
    }
}

module.exports = { AnnotationNoteClient, CHANNEL };
