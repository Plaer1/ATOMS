import waitForElement from "./waitForElement.js";

function applyGrayscaleBackground(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        console.error(`No element found with selector: ${selector}`);
        return;
    }

    waitForElement(selector, function(element) {
        // Fetching the background-image directly from the element's style attribute
        let backgroundImage = element.style.backgroundImage;

        if (!backgroundImage || backgroundImage === 'none' || backgroundImage === '') {
            console.warn(`No valid background-image found for ${selector}`);
            return;
        }

        const computedStyle = getComputedStyle(element);
        const backgroundPosition = computedStyle.backgroundPosition;

        const style = document.createElement('style');
        style.innerHTML = `
            ${selector}::before {
                content: "";
                display: block;
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: -webkit-fill-available; /* Fill the space of the parent element */
                background-image: ${backgroundImage} !important;
                background-size: contain; /* Adjust image size to fit within the element */
                background-position: ${backgroundPosition};
                background-repeat: no-repeat; /* Ensuring the background doesn't repeat */
                filter: grayscale(100%) brightness(0.77);
                z-index: -1;
                opacity: 1;
            }
            ${selector} {
                position: relative;
                background: rgba(var(--background)) !important;
                overflow: hidden;
                z-index: 0;
            }
        `;
        document.head.appendChild(style);
    });
}

if (document.title.startsWith("Steam Community")) {
    waitForElement('.apphub_background', function(element) {
        applyGrayscaleBackground('.apphub_background');
    });
} else {
    waitForElement('.game_page_background', function(element) {
        applyGrayscaleBackground('.game_page_background');
    }, 69, 55555, 0);
}
