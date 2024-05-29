import {
	fetchCurrentLowest,
	fetchHistoricalLow,
	fetchSteamLow,
} from './fetchPriceInfo.js';


export default function addPriceInfo() {

		// Get the current URL
		var currentUrl = window.location.href;

		// Extract the appid from the URL
		var appid = currentUrl.split('/app/')[1].split('/')[0];

	
	// Get a list of all purchase game elements
	var gamePurchaseElements = Array.from(document.querySelectorAll('.game_area_purchase_game'));
	//console.log("Found " + gamePurchaseElements.length + " purchase game elements");

	gamePurchaseElements.forEach(function (purchaseElement, index) {
		// Find the h1 within the purchase element
		var gameNameElement = purchaseElement.querySelector('h1');
		// Remove unwanted strings
		var gameName = gameNameElement.innerText.replace('Buy ', '').replace(' ', '').replace(/\W/g, '').toLowerCase();
		//console.log("Processing game: " + gameName);

		// Fetch the lowest price string
		var lowestPricePromise = fetchCurrentLowest(gameName);
		// Fetch the historical lowest price string
		var historicalLowPricePromise = fetchHistoricalLow(gameName);
		// Fetch the Steam lowest price string
		var steamLowPricePromise = fetchSteamLow(gameName);

		// Wait for all promises to resolve
		Promise.all([lowestPricePromise, historicalLowPricePromise, steamLowPricePromise]).then(function (values) {
			var lowestPriceString = values[0];
			var historicalLowPriceString = values[1];
			var steamLowPriceString = values[2];
			//console.log("Fetched prices for game: " + gameName);

			// If the prices are the same, change the provider to 'Steam'
			if (steamLowPriceString.split('$')[1].split(' ')[0] == lowestPriceString.split('$')[1].split(' ')[0]) {
				lowestPriceString = `The current lowest price is ${steamLowPriceString.split(' ')[5]} at Steam`;
			}
			if (steamLowPriceString.split('$')[1].split(' ')[0] == historicalLowPriceString.split('$')[1].split(' ')[0]) {
				historicalLowPriceString = `The historical lowest price was ${steamLowPriceString.split(' ')[5]} at Steam on ${historicalLowPriceString.split(' ').slice(-3).join(' ')}`;
			}

			var gameNameUrl = gameNameElement.innerText.replace('Buy ', '').replace(' ', '+').replace('®', '').replace(/\W/g, '').toLowerCase();

			// Create new element
			var newElement = document.createElement('div');
			newElement.classList.add('game_purchase_area_friends_want'); // Assign the class to the new element
			newElement.classList.add('itad_wrapper'); // Assign the class to the new element
			newElement.innerHTML = `<a href="https://isthereanydeal.com"><img class="itad_icon" src="https://isthereanydeal.com/public/assets/logo-GBHE6XF2.svg" alt="Data provided by IsThereAnyDeal" 
                              style="margin-right: 7px;"></a>
                              <div style="display:inline-block;" class="itad_text">
                                <span><a href="https://steamdb.info/app/${appid}/charts/">${steamLowPriceString}</a></span><br>
                                <span><a href="https://isthereanydeal.com/game/${gameNameUrl}/">${lowestPriceString}</a></span><br>
                                <span><a href="https://isthereanydeal.com/game/${gameNameUrl}/history/">${historicalLowPriceString}</a></span><br>
                              </div>`;

			// Insert the new element after the current div
			purchaseElement.insertAdjacentElement('afterend', newElement);
			//console.log("Inserted the new element after the target element for game: " + gameName);
		});
	});
}