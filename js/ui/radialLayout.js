// Positions a fixed set of .build-slot elements on an arc around their
// .build-bar's anchor point (see the "radial layout" comment in
// css/style.css). Run once at panel construction — slot count per bar never
// changes at runtime, so there's nothing to recompute per frame. 0deg = due
// up from the anchor, spreading symmetrically left/right across arcDegrees.
export function layoutRadial(slotEls, { radius, arcDegrees }) {
  const n = slotEls.length;
  const startDeg = -arcDegrees / 2;
  const stepDeg = n > 1 ? arcDegrees / (n - 1) : 0;
  slotEls.forEach((el, i) => {
    const deg = n > 1 ? startDeg + stepDeg * i : 0;
    const rad = deg * Math.PI / 180;
    const x = radius * Math.sin(rad);
    const y = -radius * Math.cos(rad);
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  });
}
