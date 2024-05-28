// Define the URL to the JSON file
const jsonFileUrl = 'skins/ATOMS/translations.json';

// Function to get the translation for a given text and country code
export default async function getTranslation(text, countryCode) {
    console.log('Fetching translations from server...');
    try {
        // Fetch the translations JSON file
        const response = await fetch(jsonFileUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch translations: ${response.statusText}`);
        }

        // Parse the JSON response
        const translations = await response.json();
        console.log('Translations fetched successfully.');

        // Check if the text key exists in translations
        if (translations[text]) {
            // Check if the country code exists for the text key
            if (translations[text][countryCode]) {
                // Return the translation for the given country code as a string
                var translation = translations[text][countryCode].toString();
                console.log(`Translation found for text: '${text}' and country code: '${countryCode}': ${translation}`);
                return translation;
            } else {
                // If the country code doesn't exist, return a default message
                const defaultMessage = `Translation not found for country code: ${countryCode}`;
                console.log(defaultMessage);
                return defaultMessage;
            }
        } else {
            // If the text key doesn't exist, return a default message
            const defaultMessage = `Translation not found for text: ${text}`;
            console.log(defaultMessage);
            return defaultMessage;
        }
    } catch (error) {
        console.error('Error fetching translations:', error.message);
        return 'Error fetching translations. Please try again later.';
    }
}



// Call the function with example inputs
//console.log(getTranslation(translations.translations, "reloadSteam", "en")); // Output: Reload Steam
//console.log(getTranslation(translations.translations, "restartSteam", "zh-TW")); // Output: 重新啟動蒸汽
//console.log(getTranslation(translations.translations, "nonExistentText", "en")); // Output: Translation not found for text: nonExistentText
//console.log(getTranslation(translations.translations, "reloadSteam", "nonExistentCode")); // Output: Translation not found for country code: nonExistentCode
