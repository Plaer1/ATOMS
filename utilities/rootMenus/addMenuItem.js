let targetWindow = window.opener;

export default function addMenuItem(elementText, nextToElement, insertionPosition, onClickAction) {
  
  const newElement = document.createElement('div');
  // applies classes to the new menu element:
  newElement.classList.add('_2jXHP0742MyApMUVUM8IFn', '_2uiDecKkKjAq7nimy3uLhG', 'pFo3kQOzrl9qVLPXXGIMp', 'contextMenuItem');
  newElement.textContent = elementText;

  newElement.onclick = function () {
    if (targetWindow && typeof targetWindow.eval === 'function') {
      targetWindow.eval(onClickAction);
    }
  };

  const referenceElement = document.querySelector(nextToElement);
  if (referenceElement) {
    if (insertionPosition === 'before') {
      referenceElement.parentNode.insertBefore(newElement, referenceElement);
    } else if (insertionPosition === 'after') {
      referenceElement.parentNode.insertBefore(newElement, referenceElement.nextSibling);
    }
  }

  return newElement;
}
