import { zoomEnabler } from './utilities/utility.js';
import removeProfileBrand from './utilities/removeProfileBrand.js';
import { systemAccentColors } from './utilities/systemAccentColors.js';
import waitForElement from './utilities/waitForElement.js';
import { applyGrayscaleBackground } from './utilities/greyscaleBackground.js';


waitForElement('body', function(element) {

// Enable zoom
zoomEnabler();

if (document.title.startsWith("Steam Community ::")) {
    if (document.querySelector('.profile_header_actions') && document.querySelector('.profile_header_actions').childElementCount == 1) {
        removeProfileBrand();
    }
}
if (document.title.startsWith("Steam Community")) {
waitForElement('.apphub_background', function(element) {
	applyGrayscaleBackground('.apphub_background');
});
}
});