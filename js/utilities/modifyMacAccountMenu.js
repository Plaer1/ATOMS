import installRestartMenuActions from './restartMenus.js';

// Compatibility entry point for existing callers.
export default function modifyMacAccountMenu() {
    if (/Macintosh|Mac OS X/.test(navigator.userAgent)) return installRestartMenuActions();
}
