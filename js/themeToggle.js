import { installThemeToggle } from './utilities/visualThemeControls.js';

if (document.body) {
    installThemeToggle({ showButton: true });
} else {
    document.addEventListener('DOMContentLoaded', () => installThemeToggle({ showButton: true }), { once: true });
}
