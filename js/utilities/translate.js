import { filePathPrefix } from "../../config.js";
// Define the URL to the JSON file
const jsonFileUrl = filePathPrefix + '/data/translations.json';

// Function to get the translation for a given text and country code
export default async function getTranslation(text, countryCode) {

    try {
        // Fetch the translations JSON file
        const response = await fetch(jsonFileUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch translations: ${response.statusText}`);
        }

        // Parse the JSON response
        const translations = await response.json();


        // Check if the text key exists in translations
        if (translations[text]) {
            // Check if the country code exists for the text key
            if (translations[text][countryCode]) {
                // Return the translation for the given country code as a string
                var translation = translations[text][countryCode].toString();

                return translation;
            } else {
                // If the country code doesn't exist, return a default message
                const defaultMessage = `Translation not found for country code: ${countryCode}`;

                return defaultMessage;
            }
        } else {
            // If the text key doesn't exist, return a default message
            const defaultMessage = `Translation not found for text: ${text}`;

            return defaultMessage;
        }
    } catch (error) {
        console.error('Error fetching translations:', error.message);
        return 'Error fetching translations. Please try again later.';
    }
}



// Call the function with example inputs




