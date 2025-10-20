// queueKeyHandler.js
function handleQueueKeys() {
  const qs = (s) => document.querySelector(s);
  const visible = (el) => !!el && getComputedStyle(el).display !== "none";
  const clickIf = (sel) => { const el = qs(sel); if (el) el.click(); return !!el; };

  // error page -> animate then reload
  const err = qs("#error_box");
  if (err) {
    funnyText();
    location.reload();
  }



  document.addEventListener("keydown", function (e) {
    if (!e.ctrlKey) return; // require Ctrl

    switch (e.keyCode) {
      // ←
      case 37: {
        const wishArea = qs("#add_to_wishlist_area");
        if (wishArea && !visible(wishArea)) {
          clickIf("#add_to_wishlist_area_success > a > span");
        } else {
          clickIf("#add_to_wishlist_area > a > span");
        }
        break;
      }

      // ↑  (Follow / Unfollow)
      case 38: {
        const followInactive = qs("#queueBtnFollow .queue_btn_inactive");
        const followActive   = qs("#queueBtnFollow .queue_btn_active");
        if (visible(followInactive)) {
          followInactive.click();
        } else if (visible(followActive)) {
          followActive.click();
        }
        break;
      }

      // →  (Next / enter queue / refresh)
      case 39: {
		// if stuck on static queue page, click overlay
  		const staticQ = qs(".discovery_queue_static");
  		if (visible(staticQ)) clickIf(".discovery_queue_overlay");
		
        if (qs(".queue_sub_text")) { // in queue
          clickIf(".btn_next_in_queue");
          break;
        }

        // game page but not in queue -> open queue
        if (qs("[data-tooltip-text='View and customize your personal Discovery Queue.']")) {
          window.location.href = "https://store.steampowered.com/explore/next/0?snr=1_5_9__12";
          break;
        }

        // home or sale page -> open queue
        if (qs(".home_page_content") || qs(".SaleBackgroundCtn")) {
          window.location.href = "https://store.steampowered.com/explore/next/0?snr=1_5_9__12";
          break;
        }

        // end of queue -> restart
        if (qs(".finish_queue_text")) {
          // click the restart button container if present
          if (!clickIf("#nextInDiscoveryQueue .btn_next_in_queue_trigger") ) {
            clickIf("#nextInDiscoveryQueue > div.btn_next_in_queue.btn_next_in_queue_trigger > div");
          }
          break;
        }

        // queue page with empty queue -> refresh and open new
        const refreshBtn = qs("#refresh_queue_btn");
        if (visible(refreshBtn)) {
          refreshBtn.click();
          window.location.href = "https://store.steampowered.com/explore/next/0?snr=1_5_9__12";
          break;
        }
        break;
      }

      // ↓  (Ignore / Unignore)
      case 40: {
        // treat game and DLC the same: toggle ignore by state
        const ignoreRoot     = qs("#ignoreBtn");
        const ignoreInactive = ignoreRoot && ignoreRoot.querySelector(".queue_btn_inactive");
        const ignoreActive   = ignoreRoot && ignoreRoot.querySelector(".queue_btn_active");

        if (visible(ignoreInactive)) {
          ignoreInactive.click();
        } else if (visible(ignoreActive)) {
          ignoreActive.click();
        }
        break;
      }
    }
  });
}

function funnyText() {
  Math.easeInOutSine = (t, b, c, d) => -c / 2 * (Math.cos(Math.PI * t / d) - 1) + b;
  const easing = Math.easeInOutSine;
  const target = document.querySelector('.pageheader');
  if (!target) return;
  const bbox = target.getBoundingClientRect();
  const left = bbox.left;
  const width = bbox.width;
  const height = 100;

  target.innerHTML = target.innerText.split('').map((char) => `<span>${char}</span>`).join('');
  Array.prototype.forEach.call(target.children, (el) => {
    const bb = el.getBoundingClientRect();
    const w = bb.width;
    const l = bb.left - left;
    const offset = easing(l, 0, height, width);
    const skew = offset - easing(w + l, 0, height, width);
    const angle = Math.atan(skew / w);
    el.style.transform = `translateY(${-offset}px) skewY(${angle}rad)`;
  });
  target.style.paddingTop = `${height}px`;
}

handleQueueKeys();
