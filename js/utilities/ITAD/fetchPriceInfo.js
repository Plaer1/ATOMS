import { itadApiKey } from "../../../config.js";
function fetchCurrentLowest(appHubAppName) {
  return new Promise((resolve, reject) => {
    //console.log('fetchCurrentLowest started for:', appHubAppName);
    var request = new XMLHttpRequest();
    var country_code = getCountryCode();

    var url = 'https://api.isthereanydeal.com/v01/game/storelow/?key=' + itadApiKey + '&plains=' + appHubAppName + '&shops=steam,greenmangaming,amazonus,battlenet,epic,gog,humblestore,itchio,macgamestore,microsoft,newegg,origin,uplay,squenix,wingamestore' + '&country=' + country_code;
    //console.log('URL:', url);

    request.open('GET', url);
    //console.log('XMLHttpRequest opened.');

    request.onreadystatechange = function () {
      //console.log('Ready state:', request.readyState);

      if (request.readyState === 4) {
        //console.log('Status:', request.status);
        //console.log('Headers:', request.getAllResponseHeaders());

        try {
          var responseObj = JSON.parse(request.responseText);
          //console.log('Response:', responseObj);

          if (responseObj.data && responseObj.data[appHubAppName]) {
            var shopsData = responseObj.data[appHubAppName];
            //console.log('Shops data:', shopsData);

            var lowestPriceString;
            if (shopsData && shopsData.length > 0) {
              var lowestPrice = shopsData[0].price;
              var lowestPriceShop = shopsData[0].shop;

              for (var i = 1; i < shopsData.length; i++) {
                if (shopsData[i].price < lowestPrice) {
                  lowestPrice = shopsData[i].price;
                  lowestPriceShop = shopsData[i].shop;
                }
              }

              var currencySymbol = "$"; // Replace with your desired currency symbol
              lowestPriceString = 'The current lowest price is ' + currencySymbol + lowestPrice + ' at ' + lowestPriceShop;
              //console.log('Lowest price string:', lowestPriceString);
            } else {
              lowestPriceString = 'No data was found.';
            }

            // Instead of calling a callback, resolve the promise
            resolve(lowestPriceString);
          }else {
            lowestPriceString = 'No data was found.';
          }
        } catch(e) {
          //console.error("Error while processing the response: ", e);
          // Reject the promise in case of error
          reject(e);
        }
      }
    };

    request.send();
    //console.log('XMLHttpRequest sent.');
  });
}


function fetchHistoricalLow(appHubAppName) {
  return new Promise((resolve, reject) => {
    //console.log('fetchHistoricalLow started for:', appHubAppName);
    var request = new XMLHttpRequest();
    var country_code = getCountryCode();

    var url = 'https://api.isthereanydeal.com/v01/game/lowest/?key=' + itadApiKey + '&plains=' + appHubAppName + '&country=' + country_code;
    //console.log('URL:', url);

    request.open('GET', url);
    //console.log('XMLHttpRequest opened.');

    request.onreadystatechange = function () {
      //console.log('Ready state:', request.readyState);

      if (request.readyState === 4) {
        //console.log('Status:', request.status);
        //console.log('Headers:', request.getAllResponseHeaders());

        try {
          var responseObj = JSON.parse(request.responseText);
          //console.log('Response:', responseObj);

          if (responseObj.data && responseObj.data[appHubAppName]) {
            var shopData = responseObj.data[appHubAppName];

            var historicalLowPriceString;
            if (shopData && shopData.shop) {
              var lowestPrice = shopData.price;
              var lowestPriceShop = shopData.shop.id;
              var lowestPriceDate = new Date(shopData.added * 1000); // Convert Unix timestamp to JavaScript Date object

              var currencySymbol = "$"; // Replace with your desired currency symbol
              historicalLowPriceString = 'The historical lowest price was ' + currencySymbol + lowestPrice + ' at ' + lowestPriceShop + ' on ' + lowestPriceDate.toDateString();
              //console.log('Historical low price string:', historicalLowPriceString);
            } else {
              historicalLowPriceString = 'No data was found.';
            }

            // Instead of calling a callback, resolve the promise
            resolve(historicalLowPriceString);
          }else {
            historicalLowPriceString = 'No data was found.';
          }
        } catch(e) {
          //console.error("Error while processing the response: ", e);
          // Reject the promise in case of error
          reject(e);
        }
      }
    };

    request.send();
    //console.log('XMLHttpRequest sent.');
  });
}

function fetchSteamLow(appHubAppName) {
  return new Promise((resolve, reject) => {
    //console.log('fetchSteamLow started for:', appHubAppName);
    var request = new XMLHttpRequest();
    var country_code = getCountryCode();

    var url = 'https://api.isthereanydeal.com/v01/game/lowest/?key=' + itadApiKey + '&plains=' + appHubAppName + '&shops=steam' + '&country=' + country_code;
    //console.log('URL:', url);

    request.open('GET', url);
    //console.log('XMLHttpRequest opened.');

    request.onreadystatechange = function () {
      //console.log('Ready state:', request.readyState);

      if (request.readyState === 4) {
        //console.log('Status:', request.status);
        //console.log('Headers:', request.getAllResponseHeaders());

        try {
          var responseObj = JSON.parse(request.responseText);
          //console.log('Response:', responseObj);

          if (responseObj.data && responseObj.data[appHubAppName]) {
            var shopData = responseObj.data[appHubAppName];

            var steamLowPriceString;

            if (shopData.shop) {
              var lowestPrice = shopData.price;
              var lowestPriceDate = new Date(shopData.added * 1000); // Convert Unix timestamp to JavaScript Date object
              var currencySymbol = "$"; // Replace with your desired currency symbol
              steamLowPriceString = 'The Steam lowest price was ' + currencySymbol + lowestPrice + ' on ' + lowestPriceDate.toDateString();
            } else {
              steamLowPriceString = "This game hasn't been on a Steam sale yet :(";
            }

            //console.log('Steam low price string:', steamLowPriceString);

            // Instead of calling a callback, resolve the promise
            resolve(steamLowPriceString);
          } else {
            reject("No data available for the provided appHubAppName");
          }
        } catch(e) {
          //console.error("Error while processing the response: ", e);
          // Reject the promise in case of error
          reject(e);
        }
      }
    };

    request.send();
    //console.log('XMLHttpRequest sent.');
  });
}

function getCountryCode() {
  var div = document.getElementById("application_config");
  if (div) {
    var dataConfig = div.getAttribute("data-config");
    if (dataConfig) {
      var countryCode = JSON.parse(dataConfig).COUNTRY;
      return countryCode;
    }
  }
  return null; // Return null if the div or data-config attribute is not found
}

export { fetchCurrentLowest, fetchHistoricalLow, fetchSteamLow };
