/*
 * Browser-safe, read-only grouped export for the in-Steam annotation manager.
 *
 * Stable API:
 *   exportTOON(notes, { includeTimestamp = false }) -> string
 *   groupNotes(notes) -> normalized route/window/mode groups
 *
 * `notes` accepts either raw annotation records or NoteService list entries
 * shaped as { id, revision, record }. It does not read storage or mutate notes.
 */

export const ANNOTATION_EXPORT_HEADER = 'ATOMS ANNOTATIONS TOON/1';
export const ANNOTATION_EXPORT_REMINDER = 'REMINDER: COPY DOWN the notes, then DELETE COPIED NOTES in Steam.';

const text = value => value == null ? '' : String(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function pageUrl(record, target) {
    return text(record.url ?? target.urlAtAttach ?? '');
}

function pageRoute(record, url) {
    if (record.route != null) return text(record.route);
    if (!url) return '';
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return `${parsed.host}${parsed.pathname}`;
    } catch (_) {
        // Steam client and about:blank routes remain their exact URL string.
    }
    return url;
}

function modeOf(record, payload) {
    const mode = record.colorMode ?? payload.colorMode;
    return mode === 'dark' || mode === 'light' ? mode : 'unknown';
}

function stableFallbackId(record, payload, asset, route, url, title, targetId, mode) {
    const known = payload.selectionId ?? asset.id;
    if (known != null && text(known)) return `legacy-${text(known)}`;

    // Older records can lack both persistent note IDs and selection IDs. A
    // deterministic compact fallback makes repeated exports refer to the same
    // record without relying on Node crypto or browser-only storage.
    const fingerprint = JSON.stringify([
        route, url, title, targetId, mode,
        asset.selector ?? record.selector ?? '', asset.context ?? record.context ?? '',
        payload.note ?? record.note ?? '', record.timestamp ?? record.ts ?? ''
    ]);
    let hash = 0x811c9dc5;
    for (let i = 0; i < fingerprint.length; i += 1) {
        hash ^= fingerprint.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return `legacy-${(hash >>> 0).toString(36)}`;
}

function normalize(item) {
    const wrapper = object(item) && object(item.record) ? item : null;
    const record = wrapper ? wrapper.record : object(item) ? item : {};
    const payload = object(record.payload) ? record.payload : {};
    const asset = object(payload.asset) ? payload.asset : object(record.asset) ? record.asset : {};
    const target = object(record.target) ? record.target : {};
    const url = pageUrl(record, target);
    const route = pageRoute(record, url);
    const title = text(record.title ?? target.titleAtAttach ?? '');
    const targetId = text(target.id ?? record.windowId ?? record.targetId ?? '');
    const windowName = text(target.name ?? record.windowName ?? '');
    const targetType = text(target.type ?? record.targetType ?? '');
    const mode = modeOf(record, payload);
    const id = wrapper?.id ?? record.__atomsNote?.id ?? record.id ?? payload.recordId ?? payload.selectionId ??
        stableFallbackId(record, payload, asset, route, url, title, targetId, mode);

    return {
        route,
        title,
        url,
        windowId: targetId,
        windowName,
        targetType,
        mode,
        id: text(id),
        selector: text(asset.selector ?? record.selector ?? ''),
        context: text(asset.context ?? record.context ?? ''),
        note: text(payload.note ?? record.note ?? ''),
        timestamp: text(record.timestamp ?? record.ts ?? '')
    };
}

const groupKey = entry => JSON.stringify([
    entry.route, entry.title, entry.url, entry.windowId, entry.windowName, entry.targetType, entry.mode
]);

const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export function groupNotes(notes) {
    if (!Array.isArray(notes)) throw new TypeError('Expected an array of annotation notes');
    const groups = new Map();
    for (const item of notes) {
        const rawRecord = object(item) && object(item.record) ? item.record : item;
        if (object(rawRecord) && rawRecord.status === 'done') continue;
        const entry = normalize(item);
        const key = groupKey(entry);
        if (!groups.has(key)) {
            groups.set(key, {
                route: entry.route,
                title: entry.title,
                url: entry.url,
                windowId: entry.windowId,
                windowName: entry.windowName,
                targetType: entry.targetType,
                mode: entry.mode,
                notes: []
            });
        }
        groups.get(key).notes.push({
            id: entry.id,
            selector: entry.selector,
            context: entry.context,
            note: entry.note,
            timestamp: entry.timestamp
        });
    }
    const modeOrder = { dark: 0, light: 1, unknown: 2 };
    return [...groups.values()].sort((a, b) =>
        compare(a.route, b.route) || modeOrder[a.mode] - modeOrder[b.mode] ||
        compare(a.title, b.title) || compare(a.url, b.url) || compare(a.windowId, b.windowId) ||
        compare(a.windowName, b.windowName) || compare(a.targetType, b.targetType));
}

// JSON string cells preserve commas, quotes, backslashes, whitespace and line
// breaks. Escaping U+2028/U+2029 keeps a single logical TOON row on one line.
function cell(value) {
    return JSON.stringify(text(value)).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function exportTOON(notes, { includeTimestamp = false } = {}) {
    if (typeof includeTimestamp !== 'boolean') throw new TypeError('includeTimestamp must be a boolean');
    const groups = groupNotes(notes);
    if (!groups.length) return `${ANNOTATION_EXPORT_HEADER}\n${ANNOTATION_EXPORT_REMINDER}`;

    const output = [ANNOTATION_EXPORT_HEADER, ANNOTATION_EXPORT_REMINDER, ''];
    for (const group of groups) {
        const count = group.notes.length;
        output.push(`route ${cell(group.route)} {title:${cell(group.title)},url:${cell(group.url)},windowId:${cell(group.windowId)},windowName:${cell(group.windowName)},targetType:${cell(group.targetType)},mode:${cell(group.mode)}}`);
        const fields = ['id', 'selector', 'context', 'note', ...(includeTimestamp ? ['timestamp'] : [])];
        output.push(`notes[${count}]{${fields.join(',')}}:`);
        for (const note of group.notes) {
            const values = [note.id, note.selector, note.context, note.note];
            if (includeTimestamp) values.push(note.timestamp);
            output.push(`  ${values.map(cell).join(',')}`);
        }
        output.push('');
    }
    return output.join('\n').trimEnd();
}
