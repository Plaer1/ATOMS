import waitForElement from "./waitForElement.js";

export default function transparentGames() {
    const TILE_SEL = '._1pwP4eeP1zQD7PEgmsep0W';            // game tile/card
    const UNINSTALLED_BADGE_SEL = '.mA39Hqv8LacDppegb_Q_Z';   // "Not installed" indicator
    const LIB_CONTAINER_SEL = '._2Z9gJ6Pd7eZn-kfODcXJuR';     // library container root

    function applyOpacity(tile) {
        try {
            if (!(tile instanceof Element)) return;
            const uninstalled = tile.querySelector(UNINSTALLED_BADGE_SEL);
            if (!uninstalled) return;

            const targetElement =
                tile.querySelector('[style*="background-image"]') ||
                tile.querySelector('img') ||
                (uninstalled.parentElement &&
                 uninstalled.parentElement.parentElement &&
                 uninstalled.parentElement.parentElement.parentElement &&
                 uninstalled.parentElement.parentElement.parentElement.parentElement &&
                 uninstalled.parentElement.parentElement.parentElement.parentElement.parentElement &&
                 uninstalled.parentElement.parentElement.parentElement.parentElement.parentElement
                    .firstElementChild?.firstElementChild?.nextElementSibling) ||
                tile;

            if (targetElement) {
                targetElement.style.cssText = 'opacity: var(--transparentGameOpacity) !important';
            }
        } catch {
            // ignore failures
        }
    }

    function scan(root = document) {
        const tiles = root.querySelectorAll(TILE_SEL);
        tiles.forEach(applyOpacity);
    }

    function start() {
        scan(document);

        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'childList') {
                    for (const node of m.addedNodes) {
                        if (!(node instanceof Element)) continue;
                        if (node.matches(TILE_SEL)) {
                            applyOpacity(node);
                        }
                        const subtreeTiles = node.querySelectorAll?.(TILE_SEL);
                        if (subtreeTiles && subtreeTiles.length) {
                            subtreeTiles.forEach(applyOpacity);
                        }
                    }
                } else if (m.type === 'attributes') {
                    const t = m.target;
                    if (t instanceof Element && t.matches(TILE_SEL)) {
                        applyOpacity(t);
                    }
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }

    const libNow = document.querySelector(LIB_CONTAINER_SEL);
    if (libNow) {
        start();
    } else {
        waitForElement(LIB_CONTAINER_SEL, start);
    }
}


	if (document.getElementById("millennium-injected")) {
		waitForElement('._3Sb2o_mQ30IDRh0C72QUUu', transparentGames);
	}