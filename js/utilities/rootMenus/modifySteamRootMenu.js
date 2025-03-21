import addMenuItem from "./addMenuItem.js";
import getTranslation from "../translate.js";
import waitForElement from "../waitForElement.js";

export default async function modifySteamRootMenu() {
    try {
        const reloadSteamMenu = await getTranslation("reloadSteam", document.documentElement.lang);
        console.log('Translation for reloadSteam:', reloadSteamMenu);

        const restartSteam = await getTranslation("restartSteam", document.documentElement.lang);
        console.log('Translation for restartSteam:', restartSteam);

        waitForElement('._2EstNjFIIZm_WUSKm5Wt7n._3pofGqV0buiKAfMPEs3_82', function(menuContainer) {
            console.log('Menu container found:', menuContainer);

            const items = menuContainer.querySelectorAll('._2jXHP0742MyApMUVUM8IFn._21GPYlKBCLsHQpTsHw_RL_');
            const lastItem = items[items.length - 1];
            console.log('Last menu item:', lastItem);

            if (lastItem) {
                // Insert separator after the last menu item.
                const separator = addMenuItem("", '._2EstNjFIIZm_WUSKm5Wt7n._3pofGqV0buiKAfMPEs3_82 > ._2jXHP0742MyApMUVUM8IFn._21GPYlKBCLsHQpTsHw_RL_:last-of-type', 'after', "", ['_2jXHP0742MyApMUVUM8IFn', '_21GPYlKBCLsHQpTsHw_RL_']);
                console.log('Separator added:', separator);

                // Insert "Reload Steam" menu item after separator.
                const reloadItem = addMenuItem(reloadSteamMenu, '._2EstNjFIIZm_WUSKm5Wt7n._3pofGqV0buiKAfMPEs3_82 > ._2jXHP0742MyApMUVUM8IFn._21GPYlKBCLsHQpTsHw_RL_:last-of-type', 'after', "location.reload()");
                console.log('Reload Steam menu item added:', reloadItem);

                // Insert "Restart Steam" menu item after "Reload Steam".
                const restartItem = addMenuItem(restartSteam, '._2EstNjFIIZm_WUSKm5Wt7n._3pofGqV0buiKAfMPEs3_82 > ._2jXHP0742MyApMUVUM8IFn._21GPYlKBCLsHQpTsHw_RL_:last-of-type', 'after', "SteamClient.User.StartRestart(false)");
                console.log('Restart Steam menu item added:', restartItem);
            } else {
                console.warn('Could not find the last menu item to insert after.');
            }
        });

    } catch (error) {
        console.error('Error modifying Steam root menu:', error.message);
    }
}
