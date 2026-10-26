'use strict';

// Also serialized into the picker document. The draft remains owned by its
// editor until a matching persistence acknowledgement confirms the operation.
function createAnnotationDraftSave({ createId, send, update, saved, removed,
    setTimer = setTimeout, clearTimer = clearTimeout, ackTimeoutMs = 12000 }) {
    const requests = new Map(), deleted = new Set(), revisions = new Map();
    const key = (selectionId, colorMode, selected) => JSON.stringify([selectionId, colorMode, selected]);
    let api;
    const begin = (entry, selected) => {
        if (entry.savePending) return false;
        entry.selectionId ||= createId();
        if (selected) entry.saveRequestId ||= createId();
        const request = { entry, selected, selectionId: entry.selectionId, colorMode: entry.colorMode,
            saveRequestId: selected ? entry.saveRequestId : undefined, saveAttemptId: createId() };
        requests.set(key(request.selectionId, request.colorMode, selected), request);
        entry.savePending = true; entry.saveError = '';
        update({ pending: true, error: '' }, entry);
        request.timer = setTimer(() => api.acknowledge({ ...request, ok: false,
            error: selected ? 'Saving was not confirmed. Press Enter to retry; your draft is preserved.' :
                'Removal was not confirmed. Alt-click this selection again to retry.' }), ackTimeoutMs);
        const payload = { selected, colorMode: request.colorMode, selectionId: request.selectionId, saveAttemptId: request.saveAttemptId,
            ...(selected ? { note: entry.note, saveRequestId: request.saveRequestId } :
                entry.recordId ? { recordId: entry.recordId, revision: entry.revision } : {}),
            asset: entry.descriptor, previewFilter: entry.previewFilter, previewApplied: entry.previewApplied };
        try { if (send(payload) === false) throw Error('Unavailable'); }
        catch { api.acknowledge({ ...request, ok: false }); }
        return true;
    };
    api = {
        save(entry, note) {
            if (!entry || entry.savePending) return false;
            entry.note = note;
            return begin(entry, true);
        },
        withdraw: entry => entry ? begin(entry, false) : false,
        deleted(id) { if (typeof id === 'string') deleted.add(id); },
        changed(id, revision) { if (typeof id === 'string') revisions.set(id, revision); },
        acknowledge(ack) {
            if (!ack || typeof ack.selected !== 'boolean') return false;
            const requestKey = key(ack.selectionId, ack.colorMode, ack.selected), request = requests.get(requestKey);
            if (!request || ack.saveAttemptId !== request.saveAttemptId ||
                (request.selected && ack.saveRequestId !== request.saveRequestId)) return false;
            requests.delete(requestKey);
            clearTimer(request.timer);
            const entry = request.entry;
            entry.savePending = false;
            const accepted = ack.ok && (!request.selected || (typeof ack.id === 'string' &&
                typeof ack.revision === 'string' && !deleted.has(ack.id) &&
                (!revisions.has(ack.id) || revisions.get(ack.id) === ack.revision)));
            entry.saveError = accepted ? '' : (typeof ack.error === 'string' && ack.error) ||
                (request.selected ? 'This annotation was not confirmed. Press Enter to retry, or check saved notes.' :
                    'Removal was not confirmed. Alt-click this selection again to retry.');
            update({ pending: false, error: entry.saveError }, entry);
            if (accepted) {
                if (request.selected) {
                    entry.recordId = ack.id; entry.revision = ack.revision;
                    saved(entry);
                } else removed(entry);
            }
            return true;
        },
        stop() {
            for (const request of requests.values()) clearTimer(request.timer);
            requests.clear();
        }
    };
    return api;
}

module.exports = { createAnnotationDraftSave };
