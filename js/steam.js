import moveButtons from './utilities/moveButtons.js';
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



waitForElement('body', function(element) {

if (document.title == "Steam") {
	downloadAll();
	waitForElement('._1Ky59qmywxOUtNcI1cgmkX', rootMenuDropdown); //notme
	waitForElement('._1KrJ3sFAqPBN9mfpaNTU5F', moveButtons);
	waitForElement('._3Z3ohQ8-1NKnCZkbS6fvy', combineTopMenus);
	if (!document.getElementById("millennium-injected")) {
		handleQueueKeys();
		transparentGames();
		runGrayscaleScript();
	}


	//launchGameKeyHandler(); causes bugs w/ some menus will fix soon
	//waitForElement('._3vHkmRShhzwd67_MtEq8-n', wideGameIcons); //this needs visual improvement
}
});
