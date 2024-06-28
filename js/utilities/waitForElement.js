export default function waitForElement(selector, callback, intervalTime = 69, timeout = 4444, waitForOpener = 0) {
    const searchContext = waitForOpener === 1 ? 'Parent Window' : 'Current Context';
  
    const elementCheck = () => {
      let element;
      if (waitForOpener === 1) {
        if (!window.opener) {
          return;
        }
        element = window.opener.document.querySelector(selector);
      } else {
        element = document.querySelector(selector);
      }
  
      if (element) {
        clearInterval(interval);
        observer.disconnect();
        clearTimeout(failureTimeout);
        callback(element);
      }
    };
  
    const observer = new MutationObserver(elementCheck);
  
    let interval = setInterval(elementCheck, intervalTime);
  
    let failureTimeout = setTimeout(function () {
      clearInterval(interval);
      observer.disconnect();
    }, timeout);
  
    if (waitForOpener === 1 && window.opener) {
      observer.observe(window.opener.document, { childList: true, subtree: true });
    } else {
      observer.observe(document, { childList: true, subtree: true });
    }
  };
  