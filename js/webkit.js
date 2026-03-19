import { skipAgeGate, zoomEnabler } from './utilities/utility.js';
import waitForElement from './utilities/waitForElement.js';
import removeProfileBrand from './utilities/removeProfileBrand.js';
import handleQueueKeys from './utilities/queueKeyHandler.js';
import runGrayscaleScript from './utilities/greyscaleBackground.js';
import funnyText from './utilities/funnyText.js';
waitForElement('body', function(element) {



// Skip age gate - DO NOT FORGET TO SET YOUR REAL BIRTHDAY!
waitForElement('.agegate_birthday_selector', function(element) {
		skipAgeGate();	
});

// Enable zoom
zoomEnabler();


// everything below here is optional or in beta


	// makes the text on the loading element fun
	if (document.querySelector(".LoadingWrapper") != null ){
		waitForElement(".LoadingText", function() {
			funnyText(".LoadingText");
		});
	}
	// makes the text on the loading element fun
		if (document.title.startsWith("Welcome to Steam")) {
		waitForElement(".home_ctn.content_more, .home_ctn.bottom_content", function() {
			funnyText("#content_callout .more_content_title span");
		});
	}

	if (!document.getElementById("millennium-injected")) {
			handleQueueKeys();
	}

if (document.title.startsWith("Steam Community")) {
	waitForElement('.apphub_background', function(element){
		runGrayscaleScript();
	});
    if (document.querySelector('.profile_header_actions') && document.querySelector('.profile_header_actions').childElementCount == 1) {
        removeProfileBrand();
    }
}

});

