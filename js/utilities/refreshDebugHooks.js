const KEY = '__atomsDebugHookRefreshV1';

// Millennium 3.6 condition changes can leave native URL hooks on the old branch
// after its UI reload. Republish unchanged config through Millennium itself;
// this is native debug startup only, never a web-side theme/palette loader.
export function refreshDebugHooks(enabled, win = window) {
    if (win.document?.title !== 'Steam' || win.location?.hostname !== 'steamloopback.host') {
        return Promise.resolve({ refreshed: false });
    }
    let owner, api;
    try {
        owner = win.MILLENNIUM_API?.ffi ? win : win.opener;
        api = owner?.MILLENNIUM_API;
    } catch { return Promise.resolve({ refreshed: false }); }
    if (typeof api?.ffi !== 'function') return Promise.resolve({ refreshed: false });
    const expected = enabled ? 'yes' : 'no', previous = owner[KEY];
    if (previous?.expected === expected) return previous.promise;
    const state = { expected };
    const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
    state.promise = Promise.resolve(previous?.promise).then(async () => {
        const before = parse(await api.ffi('core', 'Core_GetBackendConfig')());
        if (before?.themes?.activeTheme !== 'ATOMS' ||
            before.themes.conditions?.ATOMS?.['Show floating theme toggle?'] !== expected) {
            return { refreshed: false };
        }
        await api.ffi('core', 'Core_SetBackendConfig')(JSON.stringify(before), false);
        const after = parse(await api.ffi('core', 'Core_GetBackendConfig')());
        return { refreshed: true, unchanged: JSON.stringify(before) === JSON.stringify(after) };
    }).catch(() => ({ refreshed: false })).then(result => {
        // Retry only on another explicit startup call; a stale/failed branch
        // must not prevent a later valid condition from refreshing its hooks.
        if (!result.refreshed && owner[KEY] === state) delete owner[KEY];
        return result;
    });
    owner[KEY] = state;
    return state.promise;
}
