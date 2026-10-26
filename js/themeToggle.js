import { installThemeToggle } from './utilities/visualThemeControls.js';
import { refreshDebugHooks } from './utilities/refreshDebugHooks.js';

window.__atomsDebugMenuEnabledV1 = true;
refreshDebugHooks(true);

if (document.body) {
    installThemeToggle({ showButton: true });
} else {
    document.addEventListener('DOMContentLoaded', () => installThemeToggle({ showButton: true }), { once: true });
}
