import {
  wait,
  bigWait
} from './utility.js';
import waitForElement from './waitForElement.js';
// makes sure the targets are there before moving
export default function moveButtons() {

  waitForElement('._3cykd-VfN_xBxf3Qxriccm', targetProtect);
}
//makes sure the actual things to move are there before moving
function targetProtect() {

  waitForElement('._3vCzSrrXZzZjVJFZNg9SGu', moversProtect);
}
//actually moves the elements
function moversProtect() {

  const targetClass = '_3cykd-VfN_xBxf3Qxriccm';
  const classesToMove = [
	'_3vCzSrrXZzZjVJFZNg9SGu' //whole damn bar
	//'_2EQ7ghgqIdjKv9jsQC0Zq9', // download button  
	//'_1TdaAqMFadi0UTqilrkelR' // friends and chat
	//'_2foCkpRXhqq0UGVE50BWqj' // add a game
  ];

  // Find the target element
  const targetElement = document.querySelector('.' + targetClass);
  // If target element exists
  if (targetElement) {
	// Loop through classes to move
	classesToMove.forEach((classToMove) => {
	  // Find elements with class to move
	  const elementsToMove = document.querySelectorAll('.' + classToMove);

	  // Iterate through found elements
	  elementsToMove.forEach((elementToMove) => {

		// Create a new div with class "Focusable"
		const focusableDiv = document.createElement('div');
		focusableDiv.classList.add('Focusable-downloads');

		// Move the element inside the new div
		focusableDiv.append(elementToMove);

		// Append the new div to the target element
		targetElement.parentNode.insertBefore(focusableDiv, targetElement);

	  });
	});
  } else {
	console.error('Target element not found:', targetClass);
  }

  // Select all elements with the class "_3vCzSrrXZzZjVJFZNg9SGu" and remove them from the DOM
 //document.querySelectorAll('_2foCkpRXhqq0UGVE50BWqj').forEach(element => { 
	//element.remove();
 // });
}
