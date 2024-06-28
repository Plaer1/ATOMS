import waitForElement from "./waitForElement.js";

export function applyGrayscaleBackground(selector) {

    // Get the element
    const element = document.querySelector(selector);
    if (!element) {
        console.error(`No element found with selector: ${selector}`);
        return;
    }

    waitForElement(selector, function(element) {

        // Get the computed styles from the element
        const computedStyle = getComputedStyle(element);
        let backgroundImage = computedStyle.backgroundImage;
        const backgroundSize = computedStyle.backgroundSize;
        const backgroundPosition = computedStyle.backgroundPosition;
        const backgroundRepeat = computedStyle.backgroundRepeat;

        // Check if background property contains a URL
        if (backgroundImage === 'none') {
            const background = computedStyle.background;
            const urlMatch = background.match(/url\((.*?)\)/);
            if (urlMatch) {
                backgroundImage = `url(${urlMatch[1]})`;
            }
        }

        console.log(backgroundImage);

        // Apply the background image to the ::before pseudo-element using a style tag
        const style = document.createElement('style');
        style.innerHTML = `
            ${selector}::before {
                content: "";
                display: block;
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 56.19vw;
                background-image: ${backgroundImage} !important;
                background-size: ${backgroundSize};
                background-position: ${backgroundPosition};
                background-repeat: ${backgroundRepeat};
                filter: grayscale(100%) brightness(0.77);
                z-index: -1; /* Ensure the background stays behind the content */
                opacity: 1; /* Ensure it's fully visible */
            }
            ${selector} {
                position: relative;
                background: rgba(var(--background)) !important;
                overflow: hidden; /* Ensure content doesn't spill out */
                z-index: 0; /* Ensure it stays above the ::before element */
            }
        `;
        document.head.appendChild(style);
    });
}
