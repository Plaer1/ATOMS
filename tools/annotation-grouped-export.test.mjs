import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ANNOTATION_EXPORT_HEADER,
    ANNOTATION_EXPORT_REMINDER,
    exportTOON,
    groupNotes,
} from '../js/annotation/grouped-export.js';

const note = ({
    id,
    mode = 'dark',
    url = 'https://store.steampowered.com/',
    title = 'Welcome to Steam',
    targetId = 'window-one',
    windowName,
    selector = '.tile',
    context = 'main > .tile',
    text = 'Fix this surface',
    timestamp = '2026-11-11T12:00:00.000Z',
    includeMode = true,
} = {}) => ({
    ...(id ? { __atomsNote: { version: 1, id, revision: 'secret-revision' } } : {}),
    ...(includeMode ? { colorMode: mode } : {}),
    url,
    title,
    timestamp,
    target: { id: targetId, titleAtAttach: title, urlAtAttach: url, type: 'page', ...(windowName ? { name: windowName } : {}) },
    payload: {
        ...(includeMode ? { colorMode: mode } : {}),
        selected: true,
        selectionId: id ? `selection-${id}` : undefined,
        saveAttemptId: 'private-attempt',
        note: text,
        asset: { id: 'asset-hash', selector, context },
    },
});

test('groups same route, title, window and mode once, while splitting palette and target contexts', () => {
    const input = [
        { id: 'service-note-1', revision: 'r1', record: note({ id: 'note-1' }) },
        { id: 'service-note-2', revision: 'r2', record: note({ id: 'note-2', selector: '.button', text: 'Make it readable' }) },
        note({ id: 'light-note', mode: 'light' }),
        note({ id: 'other-window', targetId: 'window-two' }),
    ];
    const groups = groupNotes(input);
    assert.equal(groups.length, 3);
    assert.deepEqual(groups.map(group => [group.mode, group.windowId, group.notes.length]), [
        ['dark', 'window-one', 2],
        ['dark', 'window-two', 1],
        ['light', 'window-one', 1],
    ]);
    assert.equal(groups[0].notes[0].id, 'service-note-1');
    assert.equal(groups[0].notes[1].id, 'service-note-2');

    const output = exportTOON(input);
    assert.ok(output.startsWith(`${ANNOTATION_EXPORT_HEADER}\n${ANNOTATION_EXPORT_REMINDER}`));
    assert.equal((output.match(/route "store\.steampowered\.com\/"/g) || []).length, 3);
    assert.match(output, /notes\[2\]\{id,selector,context,note\}:/);
    assert.match(output, /"dark"/);
    assert.match(output, /"light"/);
    assert.doesNotMatch(output, /revision|saveAttemptId|__atomsNote/);
});

test('unknown palette is explicit and never silently defaults to dark', () => {
    const unknown = note({ id: 'mode-unknown', includeMode: false });
    const groups = groupNotes([unknown]);
    assert.equal(groups[0].mode, 'unknown');
    assert.match(exportTOON([unknown]), /"unknown"/);
    assert.equal(groupNotes([note({ id: 'dark' }), unknown]).length, 2);
});

test('route, metadata, selector, context and multiline note cells are escaped losslessly', () => {
    const unusual = note({
        id: 'escaped',
        url: 'about:blank?name="R,2"',
        title: 'Page, title "quoted"\\tail',
        targetId: 'win,"quoted"',
        windowName: 'Top, "bar"',
        selector: '.class, [data-x="a\\b"]',
        context: 'main > .first\n > .second',
        text: 'Second line\nquote:" slash:\\ end',
    });
    unusual.route = 'route,\n"quoted"\\tail';
    const output = exportTOON([unusual]);
    assert.equal(output.split('\n').filter(line => line.startsWith('route "route,')).length, 1);
    assert.match(output, /route,\\n\\"quoted\\"\\\\tail/);
    assert.match(output, /Page, title \\\"quoted\\\"\\\\tail/);
    assert.match(output, /main > \.first\\n > \.second/);
    assert.match(output, /Second line\\nquote:\\" slash:\\\\ end/);
    assert.ok(!output.split('\n').some(line => line.includes('Second line') && !line.includes('\\n')));
});

test('timestamps are opt-in and group/page context appears once', () => {
    const rows = [note({ id: 'one' }), note({ id: 'two', timestamp: '2026-11-11T13:00:00Z' })];
    const compact = exportTOON(rows);
    assert.doesNotMatch(compact, /2026-11-11T/);
    const withTimestamp = exportTOON(rows, { includeTimestamp: true });
    assert.match(withTimestamp, /notes\[2\]\{id,selector,context,note,timestamp\}:/);
    assert.match(withTimestamp, /2026-11-11T12:00:00\.000Z/);
    assert.match(withTimestamp, /2026-11-11T13:00:00Z/);
    assert.equal((withTimestamp.match(/Welcome to Steam/g) || []).length, 1);
    assert.equal((withTimestamp.match(/https:\/\/store\.steampowered\.com\//g) || []).length, 1);
});

test('legacy IDs are deterministic and caller records remain untouched', () => {
    const legacy = note({ mode: 'light' });
    delete legacy.colorMode;
    delete legacy.payload.colorMode;
    delete legacy.payload.selectionId;
    const before = structuredClone(legacy);
    const first = groupNotes([legacy]);
    const second = groupNotes([legacy]);
    assert.equal(first[0].notes[0].id, second[0].notes[0].id);
    assert.equal(first[0].notes[0].id, 'legacy-asset-hash');
    assert.deepEqual(legacy, before);
});

test('empty export retains the visible copy-before-delete reminder', () => {
    assert.equal(exportTOON([]), `${ANNOTATION_EXPORT_HEADER}\n${ANNOTATION_EXPORT_REMINDER}`);
});

test('native store fields normalize and handled notes are excluded', () => {
    const active = {
        id: 'native-1', status: 'open', route: '/library', url: 'https://steam.example/library',
        title: 'Library', windowId: 'native-window', colorMode: 'light', timestamp: '2026-11-11T14:00:00Z',
        payload: { note: 'Keep this', asset: { selector: '.entry', context: 'main > .entry' } },
    };
    const handled = { ...active, id: 'native-done', status: 'done', payload: { note: 'Already copied' } };
    const output = exportTOON([active, handled], { includeTimestamp: true });
    assert.match(output, /windowId:"native-window"/);
    assert.match(output, /mode:"light"/);
    assert.match(output, /notes\[1\]/);
    assert.match(output, /Keep this/);
    assert.doesNotMatch(output, /Already copied|native-done/);
    assert.match(output, /2026-11-11T14:00:00Z/);
});

test('invalid input options fail clearly', () => {
    assert.throws(() => groupNotes({}), /array of annotation notes/);
    assert.throws(() => exportTOON([], { includeTimestamp: 'yes' }), /includeTimestamp must be a boolean/);
});
