import waitForElement from './utilities/waitForElement.js';
import modifySteamRootMenu from './utilities/rootMenus/modifySteamRootMenu.js';

if(document.title == "Steam Root Menu") {
waitForElement('#popup_target', function(element) {
	 waitForElement('._2jXHP0742MyApMUVUM8IFn._21GPYlKBCLsHQpTsHw_RL_', modifySteamRootMenu);
});
}