import { itadApiKey } from "../../../config.js";

// Array to store subIDs and UUIDs
const gameArray = [];

async function getUUID(appID) {
    console.log(`Searching for "${appID}"...`);

    try {
        let plainResponse = await fetch(`https://api.isthereanydeal.com/lookup/id/shop/61/v1?key=${itadApiKey}`, {
            method: "POST",
            body: JSON.stringify([`sub/${appID}`])
        });
        console.log('Fetching game ID from ITAD...');

        let plainData = await plainResponse.json();
        console.log(JSON.stringify(plainData, null, 2)); // Log the entire response

        // Access the plain ID directly
        let plain = plainData[`sub/${appID}`]; // Direct access since there's no data object

        // Check if plain is found
        if (!plain) {
            console.error(`No plain ID found for appID: ${appID}`);
            return;
        }

        console.log(`Game "${appID}" found. Plain ID: ${plain}`);

        // Add to the gameArray (correct order)
        gameArray.push({ subid: appID, uuid: plain }); // Store appID as subid and plain ID as uuid
        console.log(`Added to gameArray: ${JSON.stringify(gameArray)}`); // Log the updated array

        // ... (continue with the rest of the code)
    } catch (error) {
        console.error('Error fetching data:', error);
    }
	console.log(gameArray);
}

export { getUUID, gameArray };
