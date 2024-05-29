import { zoomEnabler } from './utilities/utility.js';
import removeProfileBrand from './utilities/removeProfileBrand.js';

// Enable zoom
zoomEnabler();

if (document.title.startsWith("Steam Community ::")) {
    if (document.querySelector('.profile_header_actions') && document.querySelector('.profile_header_actions').childElementCount == 1) {
        removeProfileBrand();
    }
}
