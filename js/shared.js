import { systemAccentColors } from './utilities/systemAccentColors.js';
import waitForElement from './utilities/waitForElement.js';

waitForElement('body', function(element) {
	systemAccentColors();
});