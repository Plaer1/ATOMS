import { day, month, year, zoomInKey, zoomOutKey } from "../../config.js";
// Wait for 80ms
function wait() {
  return new Promise(resolve => setTimeout(resolve, 80));
}

// Wait for 800ms
function bigWait() {
  return new Promise(resolve => setTimeout(resolve, 800));
}

// ageGate.js
function skipAgeGate() {
  //skips age gate (don't tell gabe or my local senator pls)
  if (document.querySelector("#app_agegate > div.main_content_ctn > div.agegate_text_container.btns > div") != null){
      document.getElementById("ageYear").value = year;
      document.getElementById("ageMonth").value = month;
      document.getElementById("ageDay").value = day;
      document.querySelector("#view_product_page_btn").click();
  }
}
function zoomEnabler() {
  //enables zoom
  // Load previous zoom level or set to 100 if it's the first time
  var zoomLevel = parseFloat(localStorage.getItem('zoomLevel')) || 1.0;
  document.body.style.zoom = zoomLevel;
  window.addEventListener('keydown', function(event) {
      if (event.ctrlKey || event.metaKey) { // metaKey is for MacOS
          switch (event.key) {
              case zoomInKey: // Zoom in
                  zoomLevel = Math.min(zoomLevel + 0.1, 3.0); // Limit zoom in to 300%
                  break;
              case zoomOutKey: // Zoom out
                  zoomLevel = Math.max(zoomLevel - 0.1, 0.5); // Limit zoom out to 50%
                  break;
              case '0': // Reset
                  zoomLevel = 1.0;
                  break;
          }

          document.body.style.zoom = zoomLevel;
          localStorage.setItem('zoomLevel', zoomLevel); // Remember zoom level
      }
  });
}

  

export { wait, bigWait, skipAgeGate, zoomEnabler };

