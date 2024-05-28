import waitForElement from './utilities/waitForElement.js';
import modifySteamRootMenu from './utilities/rootMenus/modifySteamRootMenu.js';
if(document.title == "Steam Root Menu") {
  waitForElement('#popup_target', waitForElement('#popup_target > div > div > div:nth-child(11)', modifySteamRootMenu));
}
