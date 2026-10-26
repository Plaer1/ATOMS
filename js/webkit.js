import { skipAgeGate, zoomEnabler } from './utilities/utility.js';
import waitForElement from './utilities/waitForElement.js';
import { isProfileLanding, isSteamworks } from './utilities/pageRoutes.js';
import handleQueueKeys from './utilities/queueKeyHandler.js';
import runGrayscaleScript, { installApprovedStoreBackdrops } from './utilities/greyscaleBackground.js';
import funnyText from './utilities/funnyText.js';
import { installThemeToggle } from './utilities/visualThemeControls.js';
import restoreVanillaGeometry from './utilities/restoreVanillaGeometry.js';
import installAchievementSparkles from './utilities/achievementSparkles.js';
import installProfileOwnNotice from './utilities/profileOwnNotice.js';

waitForElement('body', function(element) {

installThemeToggle();
// Profile landings retain native layout/media, with the requested reversible
// own-profile notice and scoped shared-media chrome. Store utilities stay out.
if (isProfileLanding()) { installProfileOwnNotice(); return; }
if (isSteamworks()) return;

restoreVanillaGeometry();
installApprovedStoreBackdrops();
runGrayscaleScript();
installAchievementSparkles();



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


});
