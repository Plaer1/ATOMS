export function applyGrayscaleBackground(className) {

    // Get the element
    const element = document.querySelector(`.${className}`);
    if (!element) {
        console.error(`No element found with class: ${className}`);
        return;
    }

    // Get the background image URL from the element
    const backgroundImage = getComputedStyle(element).backgroundImage;
    
    // Apply the background image to the ::before pseudo-element using a style tag
    const style = document.createElement('style');
    style.innerHTML = `
        .${className}::before {
            content: "";
            display: block;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 56.1vw;
            background-image: ${backgroundImage};
            background-size: cover;
            background-position: center top;
			background-repeat: no-repeat;
            filter: grayscale(100%) brightness(0.77);
            z-index: -1; /* Ensure the background stays behind the content */
            opacity: 1; /* Ensure it's fully visible */
        }
        .${className} {
            position: relative;
            overflow: hidden; /* Ensure content doesn't spill out */
            z-index: 0; /* Ensure it stays above the ::before element */
        }
    `;
    document.head.appendChild(style);
}
