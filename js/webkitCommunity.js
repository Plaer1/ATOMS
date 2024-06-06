import { zoomEnabler } from './utilities/utility.js';
import removeProfileBrand from './utilities/removeProfileBrand.js';
import { systemAccentColors } from './utilities/systemAccentColors.js';

waitForElement('body', function(element) {
	systemAccentColors();
});

// Enable zoom
zoomEnabler();

if (document.title.startsWith("Steam Community ::")) {
    if (document.querySelector('.profile_header_actions') && document.querySelector('.profile_header_actions').childElementCount == 1) {
        removeProfileBrand();
    }
}
