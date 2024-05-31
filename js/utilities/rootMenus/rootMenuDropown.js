import { bigWait, wait } from "../utility.js";
import waitForElement from "../waitForElement.js";

export default function rootMenuDropdown() {

	waitForElement('._1Ky59qmywxOUtNcI1cgmkX', function(element) {
		wait();
		waitForElement('._1Ky59qmywxOUtNcI1cgmkX', function(element) {
			// Select the existing menu
			var menu = document.querySelector("._1Ky59qmywxOUtNcI1cgmkX"); // selecting the menu

			// Create wrapper div
			var rootMenuWrapperDiv = document.createElement('div');
			rootMenuWrapperDiv.setAttribute("class", "rootMenuWrapperDiv");
			rootMenuWrapperDiv.style.backgroundColor = 'none'; // Setting the background color
			rootMenuWrapperDiv.style.minWidth = '0px';
			rootMenuWrapperDiv.style.height = '30px';
			rootMenuWrapperDiv.style.marginTop = '6px';
			rootMenuWrapperDiv.style.borderRadius = '6px';
			rootMenuWrapperDiv.style.display = 'flex';
			rootMenuWrapperDiv.style.zIndex = '2';

			// Create wrapper div
			var rootToggleButtonWrapperDiv = document.createElement('div');
			rootToggleButtonWrapperDiv.setAttribute("class", "rootToggleButtonWrapperDiv");
			rootToggleButtonWrapperDiv.style.backgroundColor = 'none'; // Setting the background color
			rootToggleButtonWrapperDiv.style.minWidth = '30px';
			rootToggleButtonWrapperDiv.style.minHeight = '30px';
			rootToggleButtonWrapperDiv.style.marginTop = '6px';
			rootToggleButtonWrapperDiv.style.borderRadius = '6px';
			rootToggleButtonWrapperDiv.style.display = 'flex';
			rootToggleButtonWrapperDiv.style.zIndex = '2';

			// Create SVG Button
			var buttonSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			buttonSVG.setAttribute("id", "toggleButton");
			buttonSVG.setAttribute("width", "22");
			buttonSVG.setAttribute("height", "22");
			buttonSVG.style.marginLeft = "4px";
			buttonSVG.style.marginTop = "4px";
			buttonSVG.style.webkitAppRegion = "no-drag"; // -webkit-app-region style

			var target = document.querySelector("._39oUCO1OuizVPwcnnv88no"); // selecting the target of the menu
			if (target.firstChild){

				rootToggleButtonWrapperDiv.appendChild(buttonSVG);
				target.insertBefore(rootToggleButtonWrapperDiv, target.firstChild); // inserting the menu before the first child of the target

			}else{ console.log("fuckfuckfuckfuckfuckfuck");}


			// Create SVG Logo
			var logoSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			logoSVG.setAttribute("xmlns", "http://www.w3.org/2000/svg");
			logoSVG.setAttribute("width", "22");
			logoSVG.setAttribute("height", "22");
			logoSVG.setAttribute("viewBox", "0 0 256 259");
			logoSVG.innerHTML = `
				<g>
				<path id="logoPath" d="M127.778579,0 C60.4203546,0 5.24030561,52.412282 0,119.013983 L68.7236558,147.68805 C74.5451924,143.665561 81.5845466,141.322185 89.1497766,141.322185 C89.8324924,141.322185 90.5059824,141.340637 91.1702465,141.377541 L121.735621,96.668877 L121.735621,96.0415165 C121.735621,69.1388208 143.425688,47.2457835 170.088511,47.2457835 C196.751333,47.2457835 218.441401,69.1388208 218.441401,96.0415165 C218.441401,122.944212 196.751333,144.846475 170.088511,144.846475 C169.719475,144.846475 169.359666,144.83725 168.99063,144.828024 L125.398299,176.205276 C125.425977,176.786507 125.444428,177.367738 125.444428,177.939743 C125.444428,198.144443 109.160732,214.575753 89.1497766,214.575753 C71.5836817,214.575753 56.8868387,201.917832 53.5655182,185.163615 L4.40997549,164.654462 C19.6326942,218.967277 69.0834655,258.786219 127.778579,258.786219 C198.596511,258.786219 256,200.847629 256,129.393109 C256,57.9293643 198.596511,0 127.778579,0 Z M80.3519677,196.332478 L64.6033732,189.763644 C67.389592,195.63131 72.2239585,200.539484 78.6359521,203.233444 C92.4932392,209.064206 108.472481,202.430791 114.247888,188.435116 C117.043333,181.663313 117.061785,174.190342 114.294018,167.400086 C111.526251,160.609831 106.295171,155.31417 99.5879487,152.491048 C92.9176301,149.695603 85.7767911,149.797088 79.5031858,152.186594 L95.777656,158.976849 C105.999942,163.276114 110.834309,175.122157 106.571948,185.436702 C102.318812,195.751247 90.574254,200.631743 80.3519677,196.332478 Z M202.30901,96.0424391 C202.30901,78.1165345 187.85204,63.5211763 170.092201,63.5211763 C152.323137,63.5211763 137.866167,78.1165345 137.866167,96.0424391 C137.866167,113.968344 152.323137,128.554476 170.092201,128.554476 C187.85204,128.554476 202.30901,113.968344 202.30901,96.0424391 Z M145.938821,95.9870838 C145.938821,82.4988323 156.779242,71.5661525 170.138331,71.5661525 C183.506646,71.5661525 194.347066,82.4988323 194.347066,95.9870838 C194.347066,109.475335 183.506646,120.408015 170.138331,120.408015 C156.779242,120.408015 145.938821,109.475335 145.938821,95.9870838 Z" fill="#67707b"/>
				</g>
			`;
			buttonSVG.appendChild(logoSVG);





				// Insert the wrapper div (with SVG) as the first child after the menu
				
				
			//menu.insertAdjacentElement('afterend', wrapperDiv);
			rootMenuWrapperDiv.appendChild(menu);


				// Start with the menu hidden
				menu.style.display = "none";
				menu.style.backgroundColor = 'rgba(var(--backgroundLightish))';
				


				// Button click event
				buttonSVG.addEventListener("click", function () {
					
					if (menu.style.display != "flex") {
						menu.style.display = "flex"; // Show menu
						logoSVG.querySelector("#logoPath").setAttribute("fill", "rgba(var(--accent))");
						if (window.innerWidth >= 1551) {
							rootMenuWrapperDiv.style.marginLeft = "0px";
							rootMenuWrapperDiv.style.marginTop = "6px";
							rootToggleButtonWrapperDiv.style.height = "30px";
						}
						if (window.innerWidth < 1551) {
							if(document.querySelector('._2VtAqT03BpBsVdmxwptn9D') || window.innerWidth < 1180){
								rootMenuWrapperDiv.style.marginTop = "42px";
								rootMenuWrapperDiv.style.marginLeft = "-30px";
							}else{
								rootMenuWrapperDiv.style.marginTop = "0px";
								rootMenuWrapperDiv.style.marginLeft = "0px";
							}
							if (rootToggleButtonWrapperDiv.style.height === "30px") {
								rootToggleButtonWrapperDiv.style.height = "60px";
							} else {
								rootToggleButtonWrapperDiv.style.height = "30px";
							}
						}
					} else {
						menu.style.display = "none"; // Hide menu
						document.querySelector(".rootToggleButtonWrapperDiv").setAttribute("height", "30px");
						logoSVG.querySelector("#logoPath").setAttribute("fill", "var(--steamIconWhite)");
						if (window.innerWidth >= 1551) {
							rootMenuWrapperDiv.style.marginLeft = "0px";
							rootMenuWrapperDiv.style.marginTop = "6px";
							rootToggleButtonWrapperDiv.style.height = "30px";
						}
						if (window.innerWidth < 1551) {
							rootMenuWrapperDiv.style.marginLeft = "0px";
							if (rootToggleButtonWrapperDiv.style.height === "60px") {
								rootToggleButtonWrapperDiv.style.height = "30px";
							}
						}
					}
				});

				var target = document.querySelector("._39oUCO1OuizVPwcnnv88no"); // selecting the target of the menu
				if (target.firstChild){
				
					target.insertBefore(rootMenuWrapperDiv, target.firstChild.nextSibling); // inserting the menu after the first child of the target
				
				}else{ console.log("fuckfuckfuckfuckfuckfuck");
				}
		});
	});
}
