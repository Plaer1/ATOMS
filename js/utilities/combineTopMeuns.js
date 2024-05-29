import {
  wait,
  bigWait
} from './utility.js';
import waitForElement from './waitForElement.js';

// Waits for the target element to be present before moving elements
export default function combineTopMenus() {
  waitForElement('._39oUCO1OuizVPwcnnv88no', function(element) {
	waitForElement('._3Z3ohQ8-1NKnCZkbS6fvy', function(element) {
		waitForElement('._3Z3ohQ8-1NKnCZkbS6fvy', function(element) {

			const targetClass = '._39oUCO1OuizVPwcnnv88no'; // the top bar

			const classesToMove = [
				'._3Z3ohQ8-1NKnCZkbS6fvy' // navigation menu
			];

			// Find the target element
			const targetElement = document.querySelector(targetClass);

			// If target element exists
			if (targetElement) {
				// Loop through classes to move
				classesToMove.forEach((classToMove) => {
				// Find elements with class to move
				const elementsToMove = document.querySelectorAll(classToMove);

				// Iterate through found elements
				elementsToMove.forEach((elementToMove) => {
					bigWait();
					// Append the div to the target element as the first child
					targetElement.insertBefore(elementToMove, targetElement.firstChild);
				});
				});
			} else {
				console.error('Target element not found:', targetClass);
			}
		});
	});
});
}
