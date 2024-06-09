export default function insertMenuSeperator() {

// Create new element
var newElement = document.createElement('div');

// Add classes to new element
newElement.classList.add('menu_MenuWrapper_2Lu3d', 'menuHamburger');

// Find the parent element by classes
var parentElement = document.querySelector('.rootmenu_RootMenuBar_1Ky59.steamdesktop_RootMenuBar_3s0lk');

// Insert the new element after the first child of the parent element
parentElement.insertBefore(newElement, parentElement.children[1]);

}