
export default function removeMenuItems() {
  var element;

  element = document.querySelector('#popup_target > div > div > div:nth-child(13)');
  if (element) element.remove();
  
  element = document.querySelector('#popup_target > div > div > div:nth-child(9)');
  if (element) element.remove();
  
  element = document.querySelector('#popup_target > div > div > div:nth-child(4)');
  if (element) element.remove();
  
  element = document.querySelector('#popup_target > div > div > div:nth-child(1)');
  if (element) element.remove();
  
}
