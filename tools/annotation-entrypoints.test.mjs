import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const evaluate = (name, mocks) => {
    const source = read(name).replace(/^import .*;\s*$/gm, '');
    vm.runInNewContext(source, { ...mocks, window: mocks.window, document: mocks.document });
};

function fixture() {
    const calls = [];
    const window = {
        __atomsVisualAuditV5: { stop: () => calls.push('visual') },
        __atomsAnnotationControlV1: { stop: () => calls.push('control') },
        __atomsAnnotationColorToggleV1: { stop: () => calls.push('color') },
        __atomsAnnotationThemeToggleV1: { stop: () => calls.push('theme') },
        __atomsAnnotationNoteManagerV1: { stop: () => calls.push('notes') },
        __atomsDebugPaletteV1: { stop: () => calls.push('palette') },
    };
    const document = { body: {}, addEventListener: () => calls.push('dom-ready-listener') };
    return { calls, window, document };
}

test('debug-on retires old UI, hides legacy toolbar and installs native menu', () => {
    const f = fixture();
    evaluate('js/themeToggle.js', {
        ...f,
        refreshDebugHooks: enabled => f.calls.push(`refresh:${enabled}`),
        installThemeToggle: options => f.calls.push(`legacy:${options.showButton}`),
        installAnnotationMenu: () => f.calls.push('native-install'),
    });
    assert.equal(f.window.__atomsDebugMenuEnabledV1, true);
    assert.deepEqual(f.calls, [
        'refresh:true', 'visual', 'control', 'color', 'theme', 'notes',
        'legacy:false', 'palette', 'native-install',
    ]);
});

test('debug-off tears down native UI and retires legacy helpers without clearing saved notes', () => {
    const f = fixture();
    const savedNotes = [{ id: 'keep-me' }];
    evaluate('js/themeToggleOff.js', {
        ...f,
        refreshDebugHooks: enabled => f.calls.push(`refresh:${enabled}`),
        teardownAnnotationMenu: () => f.calls.push('native-teardown'),
        installThemeToggle: options => f.calls.push(`legacy:${options.showButton}`),
    });
    assert.equal(f.window.__atomsDebugMenuEnabledV1, false);
    assert.deepEqual(f.calls, [
        'refresh:false', 'native-teardown', 'visual', 'control', 'color', 'theme', 'notes',
        'legacy:false', 'palette',
    ]);
    assert.deepEqual(savedNotes, [{ id: 'keep-me' }]);
    assert.doesNotMatch(read('js/themeToggleOff.js'), /(?:localStorage|annotationStore|clear\w*Notes)/i);
});
