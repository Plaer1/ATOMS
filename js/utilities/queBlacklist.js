import { staticAppNames, staticKeywords } from "../../config.js";
export default function queBlacklist() {
    console.log("Starting queBlacklist function");

    // Blocked popular tag keywords
    const keywords = staticKeywords; // moved texts to array

    // Blocked app name texts (already lowercased for comparison)
    const appNames = staticAppNames;

    // Check if .popular_tags element exists
    const popularTagsElement = document.querySelector(".popular_tags");
    console.log("Checking for .popular_tags element:", popularTagsElement);

    if (popularTagsElement && popularTagsElement.style.display !== "none") {
        const anchorElements = popularTagsElement.querySelectorAll("a");
        console.log("Found anchor elements in .popular_tags:", anchorElements);

        anchorElements.forEach(anchor => {
            console.log("Checking anchor text content:", anchor.textContent);
            // Check if any keyword in the array is present in the anchor text
            if (
                anchor.style.display !== "none" &&
                keywords.some(key => anchor.textContent.includes(key))
            ) {
                console.log("Match found in anchor text. Calling handleIgnoreAndProceed.");
                handleIgnoreAndProceed();
            }
        });
    }

    // Check if .apphub_AppName element exists
    const appNameElement = document.querySelector(".apphub_AppName");
    console.log("Checking for .apphub_AppName element:", appNameElement);

    // Use .some() to see if appNameElement's text contains any blocked app name
    if (
        appNameElement &&
        appNames.some(name => appNameElement.textContent.toLowerCase().includes(name))
    ) {
        console.log("Match found in .apphub_AppName text. Calling handleIgnoreAndProceed.");
        handleIgnoreAndProceed();
    }

    // Check if .game_purchase_price element exists
    const gamePriceElement = document.querySelector(".game_purchase_price");
    console.log("Checking for .game_purchase_price element:", gamePriceElement);

    const storeOverlayElement = document.querySelector(".item_store_overlay_link");
    console.log("Checking for .item_store_overlay_link element:", storeOverlayElement);

    if (
        gamePriceElement &&
        gamePriceElement.textContent.toLowerCase().includes("free to play") &&
        storeOverlayElement
    ) {
        console.log("Free To Play game with store overlay link found. Calling handleIgnoreAndProceed.");
        handleIgnoreAndProceed();
    }

    // New logic block: Free To Play, popular tag contains "Clicker", and description contains "drops"
    const gameAreaDescriptionElement = document.querySelector(".game_area_description");
    console.log("Checking for .game_area_description element:", gameAreaDescriptionElement);

    if (
        gamePriceElement &&
        gamePriceElement.textContent.toLowerCase().includes("free to play") &&
        popularTagsElement &&
        popularTagsElement.textContent.toLowerCase().includes("clicker") &&
        gameAreaDescriptionElement &&
        gameAreaDescriptionElement.textContent.toLowerCase().includes("drops")
    ) {
        console.log("Free To Play game with Clicker tag and 'drops' in description found. Calling handleIgnoreAndProceed.");
        handleIgnoreAndProceed();
    }

    // New logic block: Check if .dev_row contains an element with text "Quantum Quiver Games"
    const devRowElement = document.querySelector(".dev_row");
    console.log("Checking for .dev_row element:", devRowElement);

    if (
        devRowElement &&
        devRowElement.textContent.toLowerCase().includes("quantum quiver games")
    ) {
        console.log("Developer Quantum Quiver Games found. Calling handleIgnoreAndProceed.");
        handleIgnoreAndProceed();
    }
}

function handleIgnoreAndProceed() {
    console.log("Executing handleIgnoreAndProceed function");

    // Get the ignore button
    const ignoreButton = document.querySelector(
        "#ignoreBtn > div.queue_control_button.queue_btn_ignore > div.btnv6_blue_hoverfade.btn_medium"
    );
    console.log("Checking for ignore button:", ignoreButton);

    if (ignoreButton && ignoreButton.style.display !== "none") {
        console.log("Ignore button is available. Clicking ignore button.");
        ignoreButton.click();

        // Proceed by clicking the Next in Queue button
        const nextInQueueBtn = document.querySelector(".btn_next_in_queue");
        console.log("Checking for Next in Queue button:", nextInQueueBtn);

        if (nextInQueueBtn) {
            console.log("Clicking Next in Queue button.");
            nextInQueueBtn.click();
        }
    }
}
