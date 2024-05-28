import addSeperator from "./addSeperator.js";
import addMenuItem from "./addMenuItem.js";
import getTranslation from "../translate.js";

export default async function modifySteamRootMenu() {
    try {

        const reloadSteamMenu = await getTranslation("reloadSteam", document.documentElement.lang);
		const restartSteam = await getTranslation("restartSteam", document.documentElement.lang);

        // Select the exit button from the Steam root menu.
        const exitButton = document.querySelector('#popup_target > div > div > div:nth-child(17)');
        // Get the parent element of the exit button.
        const parentElement = exitButton.parentNode;
        // Add a separator to the menu.
        const menuSeperator = addSeperator();
        // Add "Reload Steam" menu item before the exit button.
        const reloadElement = addMenuItem(reloadSteamMenu, '#popup_target > div > div > div:nth-child(15)', 'before', "location.reload()");
        // Add "Restart Steam" menu item before the exit button.
        const restartElement = addMenuItem(restartSteam, '#popup_target > div > div > div:nth-child(16)', 'before', "SteamClient.User.StartRestart(false)");

    } catch (error) {
        console.error('Error modifying Steam root menu:', error.message);
    }
}
