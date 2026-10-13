import { installThemeToggle } from './utilities/visualThemeControls.js';

const ROOTS = ['html', 'body', '#popup_target'];

function makeTransparent(element) {
    if (!element) return;

    for (const [property, value] of [
        ['background-color', 'transparent'],
        ['background-image', 'none']
    ]) {
        if (
            element.style.getPropertyValue(property) !== value ||
            element.style.getPropertyPriority(property) !== 'important'
        ) {
            element.style.setProperty(property, value, 'important');
        }
    }
}

function clearOverlayRoot() {
    for (const selector of ROOTS) {
        makeTransparent(document.querySelector(selector));
    }
}

function installInGameOverlayFix() {
    if (window.__atomsInGameOverlayV1) {
        clearOverlayRoot();
        return;
    }

    installThemeToggle();
    clearOverlayRoot();

    let queued = false;
    const resync = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            clearOverlayRoot();
        });
    };

    const observer = new MutationObserver(resync);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
    });

    window.__atomsInGameOverlayV1 = {
        resync: clearOverlayRoot,
        stop: () => observer.disconnect()
    };
}

if (document.body) {
    installInGameOverlayFix();
} else {
    document.addEventListener('DOMContentLoaded', installInGameOverlayFix, { once: true });
}
