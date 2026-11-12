import { installThemeToggle } from './utilities/visualThemeControls.js';
import { refreshDebugHooks } from './utilities/refreshDebugHooks.js';
import { install as installAnnotationMenu } from './annotation/menu.js';

function retireLegacyHelpers() {
    window.__atomsVisualAuditV5?.stop();
    window.__atomsAnnotationControlV1?.stop();
    window.__atomsAnnotationColorToggleV1?.stop();
    window.__atomsAnnotationThemeToggleV1?.stop();
    window.__atomsAnnotationNoteManagerV1?.stop();
}

function installNativeMenu() {
    // Keep the old toggle helper's session reset and cleanup, without showing
    // its legacy toolbar beside the native annotator pill.
    installThemeToggle({ showButton: false });
    window.__atomsDebugPaletteV1?.stop();
    installAnnotationMenu();
}

window.__atomsDebugMenuEnabledV1 = true;
refreshDebugHooks(true);
retireLegacyHelpers();

if (document.body) {
    installNativeMenu();
} else {
    document.addEventListener('DOMContentLoaded', installNativeMenu, { once: true });
}
