export function applyGrayscaleBackground(className) {
    console.log(`Applying grayscale background to elements with class: ${className}`);

    // Get the element
    const element = document.querySelector(`.${className}`);
    if (!element) {
        console.error(`No element found with class: ${className}`);
        return;
    }
    console.log('Element found:', element);
    
    // Get the background image URL from the element
    const backgroundImage = getComputedStyle(element).backgroundImage;
    console.log('Background image URL:', backgroundImage);
    
    // Apply the background image to the ::before pseudo-element using a style tag
    const style = document.createElement('style');
    style.innerHTML = `
        .${className}::before {
            content: "";
        	background-position: center top;
   			background-repeat: no-repeat;
    		min-width: 972px;
            background-image: ${backgroundImage};
            background-size: cover;
            filter: grayscale(100%);
            z-index: -1; /* Ensure the background stays behind the content */
        }
        .${className} {
            position: relative;
            overflow: hidden; /* Ensure content doesn't spill out */
        }
    `;
    document.head.appendChild(style);
    console.log('Style applied for grayscale background');
}
