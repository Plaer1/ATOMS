

//queueKeyHandler.js
export default function launchGameKeyHandler() {
		
	// Function to handle the 'Enter' key press
	function handleEnterKey(event) {
		// Check if the key pressed is 'Enter' and if the active element is not an input or textarea
		if (event.key === 'Enter' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA' && !document.querySelector('.DialogContent_InnerWidth')) {
		if (document.querySelector('._1rDh5rXSFZJOqCa4UpnI4z > ._3x1HklzyDs4TEjACrRO2tB')) {
			let parentElement = document.querySelector('._1UBpAXP408Ez_L_mXhW5Q9');

			if (parentElement) {
				// Find the image element two children below
				let imgElement = parentElement.querySelector('div > div > img');
				
				if (imgElement) {
					// Extract the URL from the img element's src attribute
					let imgUrl = imgElement.src;

					// Use a regular expression to extract the number after '/assets/' before '_'
					let match = imgUrl.match(/\/assets\/(\d+)_/);
					
					if (match && match[1]) {
						let number = match[1];
						
						// Construct the steam URL
						let steamUrl = `steam://launch/${number}/`;

						// You can now use the steamUrl, for example, log it or use it as needed
						console.log(steamUrl);

						// Example: Open the steam URL (if you want to)
						window.location.href = steamUrl;
					} else {
						console.log("Number not found in the image URL");
					}
				} else {
					console.log("Image element not found");
				}
			} else {
				console.log("Parent element not found");
			}	
		}
		else {
			// Find the element with the specified classes
			const targetElement = document.querySelector('._3ydigb6zZAjJ0JCDgHwSYA._2AzIX5kl9k6JnxLfR5H4kX.Focusable');
			// Click the element if it exists
			if (targetElement) {
				targetElement.click();
			}
		}
		}
		else if (document.querySelector('.DialogContent_InnerWidth')) {
			const targetElement = document.querySelector('button.DialogButton.Primary');
			if (targetElement) {
				targetElement.click();
				document.querySelector('._3x1HklzyDs4TEjACrRO2tB').focus();
			}
			else{
				console.log("fuck");
			}
		}
	}
	// Attach the event listener to the document
	document.addEventListener('keydown', handleEnterKey);

};
