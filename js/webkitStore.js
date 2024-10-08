// main.js
import handleQueueKeys from './utilities/queueKeyHandler.js';
import { skipAgeGate, zoomEnabler } from './utilities/utility.js';
import addPriceInfo from './utilities/ITAD/addPriceInfo.js';
import waitForElement from './utilities/waitForElement.js';
import addInfoButtons from './utilities/addInfoButtons.js';
import { systemAccentColors } from './utilities/systemAccentColors.js';
import { applyGrayscaleBackground } from './utilities/greyscaleBackground.js';
import { getUUID } from './utilities/ITAD/newITAD.js';



waitForElement('body', function(element) {



systemAccentColors();

waitForElement('.game_page_background', function(element) {
applyGrayscaleBackground('.game_page_background');
}, 69, 55555, 0);

// Skip age gate - DO NOT FORGET TO SET YOUR REAL BIRTHDAY!
waitForElement('.agegate_birthday_selector', function(element) {
	if (document.querySelector('.agegate_birthday_selector') != null) {
		skipAgeGate();	
	}
});

// Enable zoom
zoomEnabler();

// everything below here is optional or in beta

// Handle queue keys
handleQueueKeys();


// Check if button exists
if (document.querySelector('.btn_addtocart') != null) {
	//waitForElement('.game_area_purchase_game', addPriceInfo);
	//waitForElement(".apphub_OtherSiteInfo", addInfoButtons);

			// Define subID and subID variables to use later
			let subID = "somesubID";  // Replace with the actual subID you want to use
			// Iterate over all forms in the document
			document.querySelectorAll('form').forEach(form => {
				// Check if the form has an id that starts with 'add_to_cart'
				if (form.name.startsWith('add_to_cart')) {
					console.log("layer2");
					// Search for children elements that have 'name' set to 'subid'
					const subidElement = form.querySelector('[name="subid"]');
					if (subidElement) {
						console.log("layer3");
						// Get the value of the 'subid' element
						subID = subidElement.value;
						
						// If subID is valid, run the function
						if (subID) {
							const subID = subidElement.value; // Assign to the subID variable
	
							getUUID(subID).then(prices => {
								if (prices) {
									console.log(`The lowest price ever for ${subID}: $${prices.lowestEverPrice}`);
									console.log(`The current lowest price for ${subID}: $${prices.currentLowestPrice}`);
								}
							});
						}
					}
				}
			});
	

}


	// makes the text on the loading element fun
	if (document.querySelector(".LoadingWrapper") != null ){
		//funnyText2();
		waitForElement(".LoadingText", funnyText);
	}



	
if (document.title.startsWith("Steam Community ::")) {
    if (document.querySelector('.profile_header_actions') && document.querySelector('.profile_header_actions').childElementCount == 1) {
        removeProfileBrand();
    }
}

if (document.title.toString() == 'Steam Community') {
waitForElement('.apphub_background', function(element) {
	applyGrayscaleBackground('.apphub_background');
});
}
function funnyText() {
	// Define custom easing function
	Math.easeInOutSine = (t, b, c, d) => 
		-c/2 * (Math.cos(Math.PI*t/d) - 1) + b;
	const easing = Math.easeInOutSine;

	// Select the target element
	const target = document.querySelector('.LoadingText');
	
	// Get the bounding box of the target
	const bbox = target.getBoundingClientRect();
	const left = bbox.left;
	const width = bbox.width;
	const height = 100;
	
	// Wrap each character in a span
	target.innerHTML = target.innerText.split('').map(
	  (char) => `<span>${char}</span>`
	).join('');

	// Apply transformation to each child span
	Array.prototype.forEach.call(target.children, (el) => {
	  const bbox = el.getBoundingClientRect();
	  const w = bbox.width;
	  const l = bbox.left - left;
	  
	  // Calculate offsets and angles
	  const offset = easing(l, 0, height, width);
	  const skew = offset - easing(w + l, 0, height, width);
	  const angle = Math.atan(skew / w);

	  // Apply transformations
	  el.style.transform = `translateY(${-offset}px) skewY(${angle}rad)`;
	  const computedStyles = window.getComputedStyle(el);
	});
  
	// Adjust the target's padding
	target.style.paddingTop = `${height}px`;
	target.style.color = `rgb(var(--textAccented))`
}
	  
});