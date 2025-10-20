import waitForElement from "./waitForElement.js";
import getTranslation from "./translate.js";

export default function downloadAll() {
    const PARENT_SEL = '._1zv2D9H37p5yuOJNsCemS3';
    const CHILD_SEL  = '._1nCT-M7nZcoNzedbVzbXha';
    // Only target CHILD when it is the first child of PARENT
    const TARGET_SEL = `${PARENT_SEL} > ${CHILD_SEL}:first-child`;

    const TEXT_KEY = "downloadAll";
    const MARK_ATTR = "data-i18n-downloadall"; // "1" once inserted, "pending" while inserting

    // In-flight guard to prevent concurrent inserts on same element
    const IN_FLIGHT = new WeakSet();

    const normalizeLocale = (lang) => {
        if (!lang) return "en";
        const lc = lang.toLowerCase();
        const exact = ["pt-br", "es-419", "zh-cn", "zh-tw"];
        if (exact.includes(lc)) return lc;
        if (lc.startsWith("zh-")) {
            return (lc.includes("tw") || lc.includes("hk") || lc.includes("mo")) ? "zh-tw" : "zh-cn";
        }
        const primary = lc.split("-")[0];
        return primary || "en";
    };

    const locale = normalizeLocale(navigator.language);

    const insertForElement = async (el) => {
        if (!(el instanceof Element)) return;

        // If anything already inserted, or we already decided this element is done/pending, bail
        if (el.hasAttribute(MARK_ATTR)) return;
        if (IN_FLIGHT.has(el)) return;

        // Rule: if target already has ANY children, do nothing now.
        // Do not mark in this case, so we can re-check later if children are removed.
        if (el.children.length > 0) return;

        try {
            // Mark as pending BEFORE any await to avoid races
            el.setAttribute(MARK_ATTR, "pending");
            IN_FLIGHT.add(el);

            const text = await getTranslation(TEXT_KEY, locale);

            // Re-check: element might have gained a child while we were awaiting
            if (el.children.length > 0) {
                el.removeAttribute(MARK_ATTR); // allow future attempts if children get removed later
                IN_FLIGHT.delete(el);
                return;
            }

            // Create an anchor that triggers clickAllDownloadButtons()
            const link = document.createElement("a");
            link.textContent = text;
            link.href = "#";
            link.setAttribute("role", "button");

            // Requested classes and styles
            link.classList.add("_117rQTHH1RIewY7sSlvg3Z", "Sil68-ocRzI8Xeloq3d7R");
            link.style.paddingTop = ".666em";
            link.style.fontSize = "1.5em";

            link.addEventListener("click", (ev) => {
                ev.preventDefault();
                try {
                    clickAllDownloadButtons();
                } catch {}
            });

            el.appendChild(link);
            el.setAttribute(MARK_ATTR, "1");
        } catch {
            // On error, clear pending so we can try again later
            el.removeAttribute(MARK_ATTR);
        } finally {
            IN_FLIGHT.delete(el);
        }
    };

    const handleAppear = () => {
        const nodes = document.querySelectorAll(TARGET_SEL);
        nodes.forEach((n) => insertForElement(n));
    };

    const handleDisappear = () => {};

    let wasPresent = false;

    const evalPresence = () => {
        const present = !!document.querySelector(TARGET_SEL);

        if (present && !wasPresent) {
            wasPresent = true;
            handleAppear();
        } else if (!present && wasPresent) {
            wasPresent = false;
            handleDisappear();
        } else if (present && wasPresent) {
            document.querySelectorAll(TARGET_SEL).forEach((el) => {
                const marked = el.hasAttribute(MARK_ATTR);
                const inflight = IN_FLIGHT.has(el);
                if (!marked && !inflight && el.children.length === 0) insertForElement(el);
            });
        }
    };

    const start = () => {
        evalPresence();

        const observer = new MutationObserver((muts) => {
            for (const m of muts) {
                if (m.type === "childList") {
                    for (const node of m.addedNodes) {
                        if (!(node instanceof Element)) continue;

                        if (node.matches?.(TARGET_SEL)) {
                            if (!wasPresent) {
                                wasPresent = true;
                                handleAppear(); // scans everything once
                            }
                            insertForElement(node);
                        } else {
                            const hits = node.querySelectorAll?.(TARGET_SEL);
                            const count = hits ? hits.length : 0;
                            if (count) {
                                if (!wasPresent) {
                                    wasPresent = true;
                                    handleAppear();
                                }
                                hits.forEach((el) => insertForElement(el));
                            }
                        }
                    }
                }
            }
            evalPresence();
        });

        observer.observe(document.body, { childList: true, subtree: true });
    };

    waitForElement("body", start);
}

function clickAllDownloadButtons() {
  const parents = document.querySelectorAll('._1ugNiylO2vKXhirsGocAxa');

  parents.forEach((parent) => {
    if (!parent || !parent.children) return;

    const scopes = [parent.children[1], parent.children[2]].filter(Boolean);

    scopes.forEach((scope) => {
      const containers = scope.querySelectorAll('._1cMXIpc5BRVY11dIrWKMNW');
      containers.forEach((node) => {
        const firstParent = node.firstElementChild;
        const first = firstParent && firstParent.firstElementChild;
        if (first && typeof first.click === 'function') {
          first.click();
        }
      });
    });
  });
}
