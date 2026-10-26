import { installThemeToggle } from './utilities/visualThemeControls.js';
import { refreshDebugHooks } from './utilities/refreshDebugHooks.js';

window.__atomsDebugMenuEnabledV1 = false;
refreshDebugHooks(false);

// Retire session helpers too: they can outlive the controller process in an
// existing Steam document. The saved Millennium palette remains authoritative.
window.__atomsVisualAuditV5?.stop();
window.__atomsAnnotationControlV1?.stop();
window.__atomsAnnotationColorToggleV1?.stop();
window.__atomsAnnotationThemeToggleV1?.stop();
window.__atomsAnnotationNoteManagerV1?.stop();
installThemeToggle({ showButton: false });
window.__atomsDebugPaletteV1?.stop();
