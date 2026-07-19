// Positions a fixed set of elements on an arc around a shared anchor point
// (originally the old always-on .build-bar's center; now also the radial
// context menu's click origin — see js/ui/radialMenu.js). 0deg = due up from
// the anchor, spreading symmetrically left/right across arcDegrees, then
// rotated by centerDeg — a flyout submenu passes the angle of its parent
// slot here so it fans out from that slot's direction instead of always
// straight up.
export function slotAngle(index, n, arcDegrees) {
  const startDeg = -arcDegrees / 2;
  const stepDeg = n > 1 ? arcDegrees / (n - 1) : 0;
  return n > 1 ? startDeg + stepDeg * index : 0;
}

export function layoutRadial(slotEls, { radius, arcDegrees, centerDeg = 0 }) {
  const n = slotEls.length;
  slotEls.forEach((el, i) => {
    const deg = centerDeg + slotAngle(i, n, arcDegrees);
    const rad = deg * Math.PI / 180;
    const x = radius * Math.sin(rad);
    const y = -radius * Math.cos(rad);
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  });
}
