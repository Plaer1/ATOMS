import waitForElement from './waitForElement.js';

// makes sure the targets are there before moving
export default function addInfoButtons() {
    var appid = window.location.href.split('/app/')[1].split('/')[0];
    // Find the button with the class 'apphub_OtherSiteInfo'
    var originalButton = document.querySelector('.apphub_OtherSiteInfo');
    
    if (originalButton) {
        // Create the steamdbInfoButton
        var steamdbInfoButton = document.createElement('div');
        steamdbInfoButton.setAttribute("class", "steamdbInfoButton");
        steamdbInfoButton.setAttribute("title", "PC Gaming Wiki Link");
		steamdbInfoButton.style.height = '26px';
        steamdbInfoButton.style.width = '26px';
		steamdbInfoButton.style.marginRight = '6px';
		steamdbInfoButton.style.marginTop = '-6px';
        steamdbInfoButton.innerHTML = 
        `<a class="btnv6_blue_hoverfade btn_medium" href="https://pcgamingwiki.com/api/appid.php?appid=${appid}&utm_source=Steam&utm_medium=Steam">
            <svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="16px" height="16px" viewBox="0 0 16 16" enable-background="new 0 0 16 16" xml:space="preserve">
                <polygon opacity="0.75" fill="var(--steamIconWhite)" enable-background="new    " points="7.5,15.134 1.5,13.23 1.5,2.682 7.5,0.634 "/>
                <path opacity="0.5" fill="var(--steamIconWhite)" enable-background="new    " d="M12.881,1.305L8.344,0.634v14.5l4.584-0.596L12.881,1.305z   M10.344,13.787l-1,0.115V8.5h1V13.787z M12.344,6.947l-1.021-0.075c-0.151,0.222-0.429,0.377-0.72,0.377  c-0.342,0-0.438-0.203-0.574-0.492L9.344,6.688V5.85l0.747,0.075c0.151-0.222,0.292-0.377,0.583-0.377  c0.342,0,0.644,0.203,0.779,0.492l0.891,0.069V6.947z M12.344,4.281l-3-0.26V3.184l3,0.26V4.281z"/>
            </svg>
        </a>`;
        
        // Create the pcgamingwikiInfoButton
        var pcgamingwikiInfoButton = document.createElement('div');
        pcgamingwikiInfoButton.setAttribute("class", "pcgamingwikiInfoButton");
        pcgamingwikiInfoButton.setAttribute("title", "SteamDB Link");
		pcgamingwikiInfoButton.style.height = '26px';
        pcgamingwikiInfoButton.style.width = '26px';
        pcgamingwikiInfoButton.style.marginRight = '6px';
		pcgamingwikiInfoButton.style.marginTop = '-6px';

		pcgamingwikiInfoButton.innerHTML = 
        `<a class="btnv6_blue_hoverfade btn_medium" href="steam://openurl_external/https://steamdb.info/app/${appid}/?utm_source=Steam&utm_medium=Steam">
            <svg xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:svg="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 128 128">
                <path d="M 63.9 0 C 30.5 0 3.1 11.9 0.1 27.1 l 35.6 6.7 c 2.9 -0.9 6.2 -1.3 9.6 -1.3 l 16.7 -10 c -0.2 -2.5 1.3 -5.1 4.7 -7.2 4.8 -3.1 12.3 -4.8 19.9 -4.8 5.2 -0.1 10.5 0.7 15 2.2 11.2 3.8 13.7 11.1 5.7 16.3 -5.1 3.3 -13.3 5 -21.4 4.8 l -22 7.9 c -0.2 1.6 -1.3 3.1 -3.4 4.5 -5.9 3.8 -17.4 4.7 -25.6 1.9 -3.6 -1.2 -6 -3 -7 -4.8 L 2.5 38.4 C 4.8 42 8.5 45.3 13.3 48.2 5 53 0 59 0 65.5 0 71.9 4.8 77.8 12.9 82.6 4.8 87.3 0 93.2 0 99.6 0 115.3 28.6 128 64 128 99.3 128 128 115.3 128 99.6 128 93.2 123.2 87.3 115.1 82.6 123.2 77.8 128 71.9 128 65.5 128 59 123 52.9 114.6 48.1 122.9 43 127.9 36.7 127.9 29.9 127.9 13.4 99.2 0 63.9 0 Z m 22.8 14.2 c -5.2 0.1 -10.2 1.2 -13.4 3.3 -5.5 3.6 -3.8 8.5 3.8 11.1 7.6 2.6 18.1 1.8 23.6 -1.8 5.5 -3.6 3.8 -8.5 -3.8 -11 -3.1 -1 -6.7 -1.5 -10.2 -1.5 z m 0.3 1.7 c 7.4 0 13.3 2.8 13.3 6.2 0 3.4 -5.9 6.2 -13.3 6.2 -7.4 0 -13.3 -2.8 -13.3 -6.2 -0 -3.4 5.9 -6.2 13.3 -6.2 z m -41.7 18.5 0 0 c -1.6 0.1 -3.1 0.2 -4.6 0.4 l 9.1 1.7 a 10.8 5 0 1 1 -8.1 9.3 l -8.9 -1.7 c 1 0.9 2.4 1.7 4.3 2.4 6.4 2.2 15.4 1.5 20 -1.5 4.6 -3 3.2 -7.2 -3.2 -9.3 -2.6 -0.9 -5.7 -1.3 -8.6 -1.3 z m 63.7 16.6 0 9.3 c 0 11 -20.2 19.9 -45 19.9 -24.9 0 -45 -8.9 -45 -19.9 l 0 -9.2 c 11.5 5.3 27.4 8.6 44.9 8.6 17.6 0 33.6 -3.3 45.2 -8.7 z m 0 34.6 0 8.8 c 0 11 -20.2 19.9 -45 19.9 -24.9 0 -45 -8.9 -45 -19.9 l 0 -8.8 c 11.6 5.1 27.4 8.2 45 8.2 17.6 0 33.5 -3.1 45 -8.2 z"
				style="fill:var(--steamIconWhite);"/>
            </svg>
        </a>`;
        
        // Insert the buttons in the specified order
        originalButton.insertBefore(pcgamingwikiInfoButton, originalButton.firstChild);
        originalButton.insertBefore(steamdbInfoButton, pcgamingwikiInfoButton);
    } else {
        console.log('Button with class apphub_OtherSiteInfo not found');
    }
}
