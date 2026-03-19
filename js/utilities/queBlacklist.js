import { staticAppNames, staticKeywords } from "./runtimeConfig.js";

export default function queBlacklist() {
  const qs  = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
  const visible = (el) => !!el && getComputedStyle(el).display !== "none";
  const lower = (s) => (s || "").toLowerCase();

  const bannedTags = staticKeywords.map(lower);     // tag blacklist
  const bannedApps = staticAppNames;                // already lowercased

  // 1) Unconditional TAG blacklist
  const tagBlock = () => {
    const el = qs(".popular_tags");
    if (!el) return false;
    // check anchors first
    const hitAnchor = qsa("a", el).some(a => bannedTags.some(t => lower(a.textContent).includes(t)));
    if (hitAnchor) return true;
    // fallback: whole block text
    return bannedTags.some(t => lower(el.textContent).includes(t));
  };

  if (tagBlock()) {
    handleIgnoreAndProceed();
    return;
  }

  // 2) App name blacklist
  const appNameEl = qs(".apphub_AppName");
  if (appNameEl && bannedApps.some(n => lower(appNameEl.textContent).includes(n))) {
    handleIgnoreAndProceed();
    return;
  }

  // 3) Optional heuristics (keep, but not required)
  // Free-to-play with store overlay
  const gamePriceEl = qs(".game_purchase_price");
  const storeOverlayEl = qs(".item_store_overlay_link");
  if (gamePriceEl && lower(gamePriceEl.textContent).includes("free to play") && storeOverlayEl) {
    handleIgnoreAndProceed();
    return;
  }

  // Watch for late-loading tags and re-check once they appear
  const tagContainer = qs(".popular_tags") || document.body;
  const obs = new MutationObserver(() => {
    if (tagBlock()) {
      obs.disconnect();
      handleIgnoreAndProceed();
    }
  });
  obs.observe(tagContainer, { childList: true, subtree: true });
}

function handleIgnoreAndProceed() {
  const qs = (s, r = document) => r.querySelector(s);
  const visible = (el) => !!el && getComputedStyle(el).display !== "none";

  // Try both inactive/active ignore buttons
  const ignoreBtn =
    qs("#ignoreBtn .queue_control_button.queue_btn_ignore .btnv6_blue_hoverfade.btn_medium") ||
    qs("#ignoreBtn .queue_control_button.queue_btn_ignore .btn_medium");

  if (visible(ignoreBtn)) ignoreBtn.click();

  const nextBtn = qs(".btn_next_in_queue");
  if (nextBtn) nextBtn.click();
}

// Only run where it makes sense
if (document.querySelector(".btn_addtocart")) {
  queBlacklist();
}
