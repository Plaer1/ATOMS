import { itadApiKey } from "../../../config.js";

async function getAppId(appHubAppName) {
  try {
    const url = `https://api.isthereanydeal.com/v02/game/lookup/?key=${itadApiKey}&title=${appHubAppName}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseObj = await response.json();

    if (responseObj.data && responseObj.data.list && responseObj.data.list.length > 0) {
      return responseObj.data.list[0].plain;
    } else {
      throw new Error('No app ID found for the provided game name');
    }
  } catch (e) {
    console.error("Error while fetching the app ID: ", e);
    throw e;
  }
}

async function fetchCurrentLowest(appHubAppName, bundle = false) {
  try {
    const plain = await getAppId(appHubAppName);
    const country_code = getCountryCode();
    const bundleParam = bundle ? "&bundle=1" : "";
    const url = `https://api.isthereanydeal.com/v01/game/storelow/?key=${itadApiKey}&plains=${plain}&shops=steam,greenmangaming,amazonus,battlenet,epic,gog,humblestore,itchio,macgamestore,microsoft,newegg,origin,uplay,squenix,wingamestore&country=${country_code}${bundleParam}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const responseObj = await response.json();
    
    if (responseObj.data && responseObj.data[plain]) {
      const shopsData = responseObj.data[plain];
      let lowestPriceString;
      
      if (shopsData && shopsData.length > 0) {
        let lowestPrice = shopsData[0].price;
        let lowestPriceShop = shopsData[0].shop;

        for (let i = 1; i < shopsData.length; i++) {
          if (shopsData[i].price < lowestPrice) {
            lowestPrice = shopsData[i].price;
            lowestPriceShop = shopsData[i].shop;
          }
        }

        const currencySymbol = "$"; // Replace with your desired currency symbol
        lowestPriceString = `The current lowest price is ${currencySymbol}${lowestPrice} at ${lowestPriceShop}`;
      } else {
        lowestPriceString = 'No data was found.';
      }
      return lowestPriceString;
    } else {
      return 'No data was found.';
    }
  } catch (e) {
    console.error("Error while processing the response: ", e);
    throw e;
  }
}

async function fetchHistoricalLow(appHubAppName, bundle = false) {
  try {
    const plain = await getAppId(appHubAppName);
    const country_code = getCountryCode();
    const bundleParam = bundle ? "&bundle=1" : "";
    const url = `https://api.isthereanydeal.com/v01/game/lowest/?key=${itadApiKey}&plains=${plain}&country=${country_code}${bundleParam}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const responseObj = await response.json();

    if (responseObj.data && responseObj.data[plain]) {
      const shopData = responseObj.data[plain];
      let historicalLowPriceString;

      if (shopData && shopData.shop) {
        const lowestPrice = shopData.price;
        const lowestPriceShop = shopData.shop.id;
        const lowestPriceDate = new Date(shopData.added * 1000); // Convert Unix timestamp to JavaScript Date object

        const currencySymbol = "$"; // Replace with your desired currency symbol
        historicalLowPriceString = `The historical lowest price was ${currencySymbol}${lowestPrice} at ${lowestPriceShop} on ${lowestPriceDate.toDateString()}`;
      } else {
        historicalLowPriceString = 'No data was found.';
      }
      return historicalLowPriceString;
    } else {
      return 'No data was found.';
    }
  } catch (e) {
    console.error("Error while processing the response: ", e);
    throw e;
  }
}

async function fetchSteamLow(appHubAppName, bundle = false) {
  try {
    const plain = await getAppId(appHubAppName);
    const country_code = getCountryCode();
    const bundleParam = bundle ? "&bundle=1" : "";
    const url = `https://api.isthereanydeal.com/v01/game/lowest/?key=${itadApiKey}&plains=${plain}&shops=steam&country=${country_code}${bundleParam}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const responseObj = await response.json();

    if (responseObj.data && responseObj.data[plain]) {
      const shopData = responseObj.data[plain];
      let steamLowPriceString;

      if (shopData.shop) {
        const lowestPrice = shopData.price;
        const lowestPriceDate = new Date(shopData.added * 1000); // Convert Unix timestamp to JavaScript Date object
        const currencySymbol = "$"; // Replace with your desired currency symbol
        steamLowPriceString = `The Steam lowest price was ${currencySymbol}${lowestPrice} on ${lowestPriceDate.toDateString()}`;
      } else {
        steamLowPriceString = "This game hasn't been on a Steam sale yet :(";
      }

      return steamLowPriceString;
    } else {
      throw new Error("No data available for the provided appHubAppName");
    }
  } catch (e) {
    console.error("Error while processing the response: ", e);
    throw e;
  }
}

function getCountryCode() {
  const div = document.getElementById("application_config");
  if (div) {
    const dataConfig = div.getAttribute("data-config");
    if (dataConfig) {
      const countryCode = JSON.parse(dataConfig).COUNTRY;
      return countryCode;
    }
  }
  return null; // Return null if the div or data-config attribute is not found
}

export { fetchCurrentLowest, fetchHistoricalLow, fetchSteamLow, getCountryCode };
