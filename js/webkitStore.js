// main.js
import handleQueueKeys from './utilities/queueKeyHandler.js';
import { skipAgeGate, zoomEnabler } from './utilities/utility.js';
import addPriceInfo from './utilities/ITAD/addPriceInfo.js';
import waitForElement from './utilities/waitForElement.js';
import addInfoButtons from './utilities/addInfoButtons.js';
import { systemAccentColors } from './utilities/systemAccentColors.js';
import { applyGrayscaleBackground } from './utilities/greyscaleBackground.js';

waitForElement('body', function(element) {

systemAccentColors();

waitForElement('.game_page_background', function(element) {
applyGrayscaleBackground('.game_page_background');
});

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
	waitForElement('.game_area_purchase_game', addPriceInfo);
	//waitForElement(".steamLowest", /*openDefaultBrowserWindows*/wait); i'm not sure this does anything????
	waitForElement(".apphub_OtherSiteInfo", addInfoButtons);
}
	// makes the text on the loading element fun
	if (document.querySelector(".LoadingWrapper") != null ){
		//funnyText2();
		waitForElement(".LoadingText", funnyText);
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