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
  }
}


