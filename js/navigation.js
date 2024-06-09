import waitForElement from './utilities/waitForElement.js';
import { bigWait } from './utilities/utility.js';
import modifySteamRootMenu from './utilities/rootMenus/modifySteamRootMenu.js';

if(document.title == "Steam Root Menu") {

bigWait();
waitForElement('#popup_target', function(element) {
    waitForElement('#popup_target > div > div > div:nth-child(11)', modifySteamRootMenu);
});
}