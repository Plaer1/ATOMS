import moveButtons from './utilities/moveButtons.js';
import moveButtonsMac from './utilities/moveButtonsMac.js';
import combineTopMenus from './utilities/combineTopMeuns.js';
import waitForElement from './utilities/waitForElement.js';
import rootMenuDropdown from './utilities/rootMenus/rootMenuDropown.js';
import downloadAll from './utilities/downloadAll.js';
//for sfp:
import transparentGames from './utilities/transparentGames.js';
import handleQueueKeys from './utilities/queueKeyHandler.js';
import runGrayscaleScript from './utilities/greyscaleBackground.js';

//needs work:
import launchGameKeyHandler from './utilities/launchGameKeyHandler.js';
import { wideGameIcons } from './utilities/wideGameIcons.js';
import { installThemeToggle } from './utilities/visualThemeControls.js';
import { installBigPictureMenuStyles } from './utilities/bigPictureMenus.js';
import installLibraryTileTilt from './utilities/libraryTileTilt.js';
// On macOS Steam's native traffic lights share the web titlebar. Keep
// structural top-bar edits away from them so their placement stays native.
const IS_MAC = /Macintosh/.test(navigator.userAgent);

// The main window and its title can appear well after the initial body during
// slow Steam startup. Keep the root-menu installer watching until it mounts;
// macOS retains its native top bar.
if (!IS_MAC) rootMenuDropdown();

waitForElement('body', function(element) {

installThemeToggle();
installBigPictureMenuStyles();

if (IS_MAC) {
	// The macOS main target can start as a synthetic sign-in/blank document;
	// keep watching so the bottom bar is moved when Steam mounts it.
	moveButtonsMac();
}

if (document.title == "Steam") {
	installLibraryTileTilt();
	downloadAll();
	if (!IS_MAC) {
		waitForElement('._3Z3ohQ8-1NKnCZkbS6fvy', combineTopMenus);
		waitForElement('._1KrJ3sFAqPBN9mfpaNTU5F', moveButtons);
	}
	if (!document.getElementById("millennium-injected")) {
		handleQueueKeys();
		transparentGames();
		runGrayscaleScript();
	}


	//launchGameKeyHandler(); causes bugs w/ some menus will fix soon
	//waitForElement('._3vHkmRShhzwd67_MtEq8-n', wideGameIcons); //this needs visual improvement
}
});
