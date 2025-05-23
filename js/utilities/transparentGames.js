import waitForElement from "./waitForElement.js";
export default function transparentGames() {
    // Handle DOM changes
    const handleMutations = (mutationsList) => {
        mutationsList.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof Element && node.matches('._1pwP4eeP1zQD7PEgmsep0W')) {
                        const uninstalledChild = node.querySelector('.mA39Hqv8LacDppegb_Q_Z');
                        if (uninstalledChild) {
                            // Navigate to the target element
                            const targetElement = uninstalledChild.parentElement.parentElement.parentElement.parentElement.parentElement.firstElementChild.firstElementChild.nextElementSibling;
                            if (targetElement) {
								targetElement.style.cssText = 'opacity: var(--transparentGameOpacity) !important'; // Using !important to ensure override
                            }
                        }
                    }
                });
            }
        });
    };

// Select the specific div to observe
let targetDiv = document.querySelector('._2Z9gJ6Pd7eZn-kfODcXJuR');

// Function to start observing
const startObserving = (targetDiv) => {
    const observer = new MutationObserver(handleMutations);
    const observerOptions = {
        childList: true,
        subtree: true,
    };
    observer.observe(targetDiv, observerOptions);
    
    // New observer to detect unloading
    const unloadObserver = new MutationObserver(handleUnload);
    const unloadObserverOptions = {
        childList: true,
        subtree: true,
    };
    unloadObserver.observe(document.body, unloadObserverOptions);
    
    function handleUnload(mutations) {
        for (const mutation of mutations) {
            if (!document.body.contains(targetDiv)) {
				
				const checkInterval = setInterval(() => {
					targetDiv = document.querySelector('._2Z9gJ6Pd7eZn-kfODcXJuR');
					if (targetDiv) {
						startObserving(targetDiv);
						clearInterval(checkInterval);
					}
				}, 321);
                unloadObserver.disconnect(); // stop observing after detection
                break;
            }
        }
    }
};

// Check if targetDiv exists and observe
if (targetDiv) {
    startObserving(targetDiv);
} else {
    const checkInterval = setInterval(() => {
        targetDiv = document.querySelector('._2Z9gJ6Pd7eZn-kfODcXJuR');
        if (targetDiv) {
            startObserving(targetDiv);
            clearInterval(checkInterval);
        }
    }, 222); // check every 222ms
}

}
waitForElement('._3Sb2o_mQ30IDRh0C72QUUu', transparentGames);