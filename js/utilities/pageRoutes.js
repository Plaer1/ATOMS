// Personal landing pages preserve Steam's layout, artwork, and surfaces.
// Their nested Community subpages continue to use the full ATOMS theme.
export function isProfileLanding({ hostname = '', pathname = '' } = globalThis.location || {}) {
    return /^(?:www\.)?steamcommunity\.com$/i.test(hostname)
        && /^\/(?:id|profiles)\/[^/]+\/?$/.test(pathname);
}

export function isSteamworks({ hostname = '' } = globalThis.location || {}) {
    return hostname === 'partner.steamgames.com';
}
