export default function funnyText(selector) {
    const target = document.querySelector(selector);
    if (!target) {
        return;
    }

    const easeInOutSine = (t, b, c, d) =>
        -c / 2 * (Math.cos(Math.PI * t / d) - 1) + b;

    const text = target.innerText;
    if (!text) {
        return;
    }

    const bbox = target.getBoundingClientRect();
    const left = bbox.left;
    const width = bbox.width;
    const height = 100;

    target.innerHTML = text.split("").map((char) => `<span>${char}</span>`).join("");

    Array.from(target.children).forEach((element) => {
        const childBox = element.getBoundingClientRect();
        const childWidth = childBox.width;
        const childLeft = childBox.left - left;

        const offset = easeInOutSine(childLeft, 0, height, width);
        const skew = offset - easeInOutSine(childWidth + childLeft, 0, height, width);
        const angle = Math.atan(skew / childWidth);

        element.style.transform = `translateY(${-offset}px) skewY(${angle}rad)`;
    });

    target.style.paddingTop = `${height}px`;
    target.style.color = "rgb(var(--textAccented))";
}
