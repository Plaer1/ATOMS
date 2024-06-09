import moveButtons from './utilities/moveButtons.js';
import combineTopMenus from './utilities/combineTopMeuns.js';
import waitForElement from './utilities/waitForElement.js';

import rootMenuDropdown from './utilities/rootMenus/rootMenuDropown.js';
import transparentGames from './utilities/transparentGames.js';
import { systemAccentColors } from './utilities/systemAccentColors.js';
import { wideGameIcons } from './utilities/wideGameIcons.js';
waitForElement('body', systemAccentColors);


if (document.title == "Steam") {

	waitForElement('._1Ky59qmywxOUtNcI1cgmkX', rootMenuDropdown);
	waitForElement('._1KrJ3sFAqPBN9mfpaNTU5F', moveButtons);
	waitForElement('._3Z3ohQ8-1NKnCZkbS6fvy', combineTopMenus);
	waitForElement('._3Sb2o_mQ30IDRh0C72QUUu', transparentGames);
	
}
//this needs visual improvement
//waitForElement('._3vHkmRShhzwd67_MtEq8-n', wideGameIcons);