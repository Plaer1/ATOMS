import translations from "../../data/translations.js";

// Function to get the translation for a given text and country code
export default async function getTranslation(text, countryCode) {
    if (translations[text]) {
        if (translations[text][countryCode]) {
            return translations[text][countryCode].toString();
        } else {
            return `Translation not found for country code: ${countryCode}`;
        }
    } else {
        return `Translation not found for text: ${text}`;
    }
}

