# Another Take On Metro Steam:
[![Thanks for all the fish!](https://img.shields.io/badge/Donate-ko--fi-pink?style=flat-square&logo=kofi&logoColor=pink)](https://ko-fi.com/plaer1)    [![My Discord](https://img.shields.io/discord/493527438928642059?style=flat&logo=discord&logoColor=%23c381ff&label=My%20Chat)](https://discord.gg/EHMjbeEf82)    [![Follow me on Twitter](https://img.shields.io/twitter/url?url=https%3A%2F%2Fx.com%2FPleyar1&style=flat&logo=twitter&logoColor=%23c381ff&label=Follow%20me%20on%20Twitter&color=%23c381ff)](https://x.com/Pleyar1)    [![Size of skin](https://img.shields.io/github/repo-size/Plaer1/ATOMS?style=flat-square)](https://github.com/Plaer1/ATOMS/)

A theme for Steam based on:
[The Unofficial Metro for Steam](https://steamcommunity.com/groups/metroskin/discussions/0/141136086931804907/) and [Steam Dark mode by AikoMidori.](https://github.com/AikoMidori/steam-dark-mode)

<small>If you need support: you can find me as Plær1â€™ in [The Unofficial Metro for Steam Discord](https://discord.gg/UZvkvkh).</small>

| Store Page          | Library                        |
| ------------------- | ------------------------------ |
| ![ATOMS Store Page](https://github.com/Plaer1/ATOMS-Media/blob/d2844f744c5d28ffb571731a1eb7d43f4f9a2da5/steamStore.png) | ![ATOMS Steam Library](https://github.com/Plaer1/ATOMS-Media/blob/d2844f744c5d28ffb571731a1eb7d43f4f9a2da5/steamLibrary.png) |


## Install:
[Download and install SFP](https://github.com/PhantomGamers/SFP) to a folder on your pc*

<small><i>*you're going to need this <b>forever</b> so put it somewhere you'll remember... or else.</i></small>

Download and extract the skin (``ATOMS`` folder) to:
``%steamdata%/steamui/skins``
(this folder is easily accessed from the "open file" menu in the bottom right of SFP)

**These SFP settings must be configured for a normal experience:**
```
	   Inject on Steam start
	   Inject CSS
	   Inject Javascript
	   Make sure ATOMS is selected from the "Steam skin" dropdown.
```

** It's not required, but for maximum convenience, I recommend applying the following settings:
App:**
```
	   Show Tray Icon
	   Minimize to Tray
	   Close to Tray
	   Start Minimized
	   Inject on app start
	   Run Steam on start 
	   Run on boot
```
<small> (please note that you should now <b>DISABLE Steam opening on boot</b> in the *Steam* settings)</small>


## Features:
* Theme'd basically every page in Steam, *if you see* **anything** *that doesn't look theme'd at all*, ***please*** fill out a bug report or contact me on discord!

* Skip the age gate on store pages (***make sure to fill out your real birthday in the file***: ``utility.js``**!!**).

* Is there any deal integration:
![ATOMS ITAD](https://github.com/Plaer1/ATOMS-Media/blob/ddf4d9a452b3f83752d7aa7d8b0a05a37378fd1e/steamitad.png)

* Removed bottom menu and moved buttons to top right:
![ATOMS Bar Buttons](https://github.com/Plaer1/ATOMS-Media/blob/ddf4d9a452b3f83752d7aa7d8b0a05a37378fd1e/steamTopRightBar.png)

* Moved "Root" menu to it's own hidden menu:
![ATOMS Root Menu](https://github.com/Plaer1/ATOMS-Media/blob/ddf4d9a452b3f83752d7aa7d8b0a05a37378fd1e/steamRootMenu.png)

* Built from the ground up to be highly configurable, there are already settings in the ``config.css`` with more to come!


## Known bugs/to-do's
<small>If you find **any bugs** not listed here, please don't hesitate to contact me in the place(s) listed above to report new issues.</small>
* The ITAD integration doesn't show any bundles, etc, just the main game on the page.
 * ***Big picture mode is not done**, this is however a very high priority, as I have a steam deck and would like to get that part of the skin on the CSS loader repo.
 * Skin is not tested on MacOS please let me know what's not working and I'll add it to the to-do list!
 * Most of the web pages are still running a hacky version of "[webkit.css](https://github.com/AikoMidori/steam-dark-mode/blob/master/webkit.css)" and as such there are tons of accents that are still the vanilla steam blue, (hopefully all the backgrounds at least are dark-mode however). I will be updating this file myself eventually, however I'm waiting on an anticipated big update from Valve first (so we'll see when it happens if ever 😴😴😴).
* The "translations" for the "Reload Steam", and "Restart Steam" buttons are google translate and as-such are most likely **all wrong** if anyone who is multilingual could help out here that would be quite appreciated!
* On that same note, I will be implementing the correct regional pricing for the ITAD support, *before* I fix all the translations, it's just easier to start there. I am very sorry for any inconvienance this causes.

## Credits:
* [PhantomGamers](https://ko-fi.com/phantomgamers) for SFP, and being generally a cool guy.
*  [Shiina](https://shiinaskins.com) for the Steam Dark Mode skin, which many pages in this project still use.


\* this is just the first open-beta, I'm looking into Millineum patcher support for later.
