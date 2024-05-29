import waitForElement from './utilities/waitForElement.js';
import modifySteamRootMenu from './utilities/rootMenus/modifySteamRootMenu.js';
if(document.title == "Steam Root Menu") {
// Call the function in a chained manner
waitForElement('#popup_target', function(element) {
    waitForElement('#popup_target > div > div > div:nth-child(11)', modifySteamRootMenu);
});
}
