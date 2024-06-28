import addSeperator from "./addSeperator.js";
import addMenuItem from "./addMenuItem.js";
import getTranslation from "../translate.js";
import { bigWait, wait } from "../utility.js";
import waitForElement from "../waitForElement.js";

export default async function modifySteamRootMenu() {
	bigWait();
	bigWait();
	try {
		bigWait();
		bigWait();
        const reloadSteamMenu = await getTranslation("reloadSteam", document.documentElement.lang);
		const restartSteam = await getTranslation("restartSteam", document.documentElement.lang);
        
		waitForElement('#popup_target > div > div > div:nth-child(11)', function(element) {

			// Select the exit button from the Steam root menu.
			const exitButton = document.querySelector('#popup_target > div > div > div:nth-child(11)');
			// Get the parent element of the exit button.
			const parentElement = exitButton.parentNode;

			// Add "Reload Steam" menu item before the exit button.
			addMenuItem(reloadSteamMenu, '#popup_target > div > div > div:nth-child(11)', 'before', "location.reload()");
			// Add "Restart Steam" menu item before the exit button.
			 addMenuItem(restartSteam, '#popup_target > div > div > div:nth-child(12)', 'before', "SteamClient.User.StartRestart(false)");
			// Add a separator to the menu.
			addMenuItem("", '#popup_target > div > div > div:nth-child(13)', 'before', "", ['_2jXHP0742MyApMUVUM8IFn', '_21GPYlKBCLsHQpTsHw_RL_']);
		});
		

    } catch (error) {
        console.error('Error modifying Steam root menu:', error.message);
    }

}
