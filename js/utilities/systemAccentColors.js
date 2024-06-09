import { systemAccentsEnabled} from "../../config.js";
export function systemAccentColors() {
  if (systemAccentsEnabled == 1) {
	document.documentElement.style.setProperty('--accent',		 	'var(--SystemAccentColor-RGB)');
	document.documentElement.style.setProperty('--accentLightish',	'var(--SystemAccentColorLight1-RGB)');
	document.documentElement.style.setProperty('--accentLight',		'var(--SystemAccentColorLight2-RGB)');
	document.documentElement.style.setProperty('--accentLightest', 	'var(--SystemAccentColorLight3-RGB)'); 
	document.documentElement.style.setProperty('--accentDarkish',	'var(--SystemAccentColorDark1-RGB)');		
	document.documentElement.style.setProperty('--accentDark',		'var(--SystemAccentColorDark2-RGB)');	
	document.documentElement.style.setProperty('--accentDarkest',	'var(--SystemAccentColorDark3-RGB)');	
	document.documentElement.style.setProperty('--accentDarkest',	'var(--SystemAccentColorDark3-RGB)');	

	document.documentElement.style.setProperty('--textLightish',	'var(--SystemAccentColorLight2-RGB)');
	document.documentElement.style.setProperty('--textLight',		'var(--SystemAccentColorLight3-RGB)');
	document.documentElement.style.setProperty('--textLightest', 	'var(--SystemAccentColorLight3-RGB)'); /*needs js? FIXME*/
	document.documentElement.style.setProperty('--textDarkish',		'var(--SystemAccentColorDark1-RGB)');		
	document.documentElement.style.setProperty('--textDark',		'var(--SystemAccentColorDark2-RGB)');


	setHueRotateFromCSSVar('--SystemAccentColor-RGB');
  }
}
function setHueRotateFromCSSVar(cssVarName) {
    // Read the CSS variable
    const cssVar = getComputedStyle(document.documentElement).getPropertyValue(cssVarName).trim();

    // Extract RGB values from the CSS variable
    const rgbValues = cssVar.match(/\d+/g).map(Number);

    // Convert RGB to HSL
    const rgbToHsl = (r, g, b) => {
        r /= 255;
        g /= 255;
        b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0; // achromatic
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [h * 360, s, l];
    };

    const targetColor = [35, 133, 189];
    const [targetHue] = rgbToHsl(...targetColor);
    const [currentHue] = rgbToHsl(...rgbValues);

    // Calculate the hue rotation
    let hueRotate = currentHue - targetHue;
    if (hueRotate < 0) {
        hueRotate += 360;
    }

    // Set the CSS variable
    document.documentElement.style.setProperty('--accentFilter', `hue-rotate(${hueRotate}deg)`);
}






