import {
	wait,
	bigWait
} from './utility.js';
import waitForElement from './waitForElement.js';

//queueKeyHandler.js
export default function handleQueueKeys() {
	'use strict';

	// refreshes on que "error"
	if (document.querySelector("#error_box") != null) {
		funnyText();
		wait();
		bigWait();
		location.reload();
	}

	// refreshes on que if you end up on the page between refreshes somehow
	if (document.querySelector(".discovery_queue_static") != null) {
		if (document.querySelector(".discovery_queue_static").style.display == "block") {
			document.querySelector(".discovery_queue_overlay").click();
		}
	}

	document.addEventListener('keydown', function (e) {

		switch (e.keyCode) {

			//left
			case 37:

				if (document.querySelector("#add_to_wishlist_area").style.display == "none") {
					document.querySelector("#add_to_wishlist_area_success > a > span").click();
				} else {
					document.querySelector("#add_to_wishlist_area > a > span").click();
				}

				break;

				//up
			case 38:
				if (document.querySelector("#queueBtnFollow > div.btnv6_blue_hoverfade.btn_medium.queue_btn_inactive").style.display != "none") {
					// click to follow
					document.querySelector("#queueBtnFollow > div.btnv6_blue_hoverfade.btn_medium.queue_btn_inactive").click();
				} else {
					//Click to UNfollow
					document.querySelector("#queueBtnFollow > div.btnv6_blue_hoverfade.btn_medium.queue_btn_active").click();
				}

				break;

				//right
			case 39:
				//if in que, go next
				if (document.querySelector(".queue_sub_text") != null) {

					document.querySelector(".btn_next_in_queue").click();
					break;
				}
				//if on a game page that isn't in the que, start que.   TEST ME
				if (document.querySelector("[data-tooltip-text='View and customize your personal Discovery Queue.']") != null) {

					window.location.href = "https://store.steampowered.com/explore/next/0?snr=1_5_9__12";
					break;
				}
				//if you aren't in the que, hop in bb.
				if (document.querySelector(".home_page_content") != null || document.querySelector(".SaleBackgroundCtn") != null) {


					window.location.href = "https://store.steampowered.com/explore/next/0?snr=1_5_9__12";
					break;
				}
				//if at the end, restart que
				if (document.querySelector(".finish_queue_text") != null) {


					document.querySelector("#nextInDiscoveryQueue > div.btn_next_in_queue.btn_next_in_queue_trigger > div").click();
					break;
				}

				//if at the que page with empty que, start another que
				if (document.querySelector("#refresh_queue_btn").style.display != "none") {

					document.querySelector("#refresh_queue_btn").click();
					window.location.href = "https://store.steampowered.com/explore/next/0?snr=1_5_9__12";
					break;
				}
				break;

				//down
			case 40:
				//if a game
				if (document.querySelector("#game_area_purchase > div.game_area_bubble.game_area_dlc_bubble") == null) {
					if (document.querySelector("#ignoreBtn > div.queue_control_button.queue_btn_ignore > div.btnv6_blue_hoverfade.btn_medium.queue_btn_inactive").style.display != "none") {
						document.querySelector("#ignoreBtn > div.queue_control_button.queue_btn_ignore > div.btnv6_blue_hoverfade.btn_medium.queue_btn_inactive").click();
					} else {
						document.querySelector("#ignoreBtn > div.queue_control_button.queue_btn_ignore > div.btnv6_blue_hoverfade.btn_medium.queue_btn_active").click();
					}
				}
				//if DLC
				if (document.querySelector("#game_area_purchase > div.game_area_bubble.game_area_dlc_bubble") != null) {
					if (document.querySelector("#ignoreBtn > div.queue_control_button.queue_btn_ignore > div.btnv6_blue_hoverfade.btn_medium.queue_btn_inactive").style.display != "none") {
						document.querySelector("#ignoreBtn > div.queue_control_button.queue_btn_ignore > div.btnv6_blue_hoverfade.btn_medium.queue_btn_inactive").click();
					} else {
						document.querySelector("#ignoreBtn > div.queue_control_button.queue_btn_ignore > div.btnv6_blue_hoverfade.btn_medium.queue_btn_active").click();
					}
				}
				break;
		}
	});
};


function funnyText() {
	Math.easeInOutSine = (t, b, c, d) =>
		-c/2 * (Math.cos(Math.PI*t/d) - 1) + b;
	const
		easing = Math.easeInOutSine,
	  target = document.querySelector('.pageheader'),
		bbox = target.getBoundingClientRect(),
		left = bbox.left,
	  width = bbox.width,
	  height = 100;
	target.innerHTML = target.innerText.split('').map(
		(char) => `<span>${char}</span>`
	).join('');
	Array.prototype.forEach.call(target.children, (el) => {
	  const 
			bbox = el.getBoundingClientRect(),
		w = bbox.width,
		l = bbox.left - left,
		offset = easing(l, 0, height, width),
		skew = offset - easing(w + l, 0, height, width),
		angle = Math.atan(skew/w);
	  el.style.transform = `translateY(${-offset}px) skewY(${angle}rad)`;
	});
	target.style.paddingTop = `${height}px`;	
}

  
  