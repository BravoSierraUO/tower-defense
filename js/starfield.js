// Field-view background: we're an orbital station, so the exterior view gets a
// starfield instead of flat CONFIG.BG_COLOR. Stars are hashed off a virtual world-
// space grid rather than generated/stored up front, so the field is effectively
// infinite and needs no array, no seed persistence, no bounds — same "only touch
// what's in camera.getViewBounds()" shape drawGrid() already uses. Two layers with
// different parallax factors (how fast each drifts relative to the camera) give a
// cheap sense of depth without full 3D — a real technique, not just more stars.
const CELL_SIZE = 140;

// Deterministic pseudo-random in [0,1) for a (cell, salt) pair — same cell always
// hashes to the same star, so panning away and back shows the same sky, not a
// re-rolled one.
function hash(x, y, salt) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

function drawLayer(ctx, camera, { parallax, density, minSize, maxSize, minAlpha, maxAlpha, colorRGB, now }) {
  const cx = camera.x * parallax;
  const cy = camera.y * parallax;
  const halfW = ctx.canvas.width / 2 / camera.zoom;
  const halfH = ctx.canvas.height / 2 / camera.zoom;

  const startX = Math.floor((cx - halfW) / CELL_SIZE) - 1;
  const endX = Math.ceil((cx + halfW) / CELL_SIZE) + 1;
  const startY = Math.floor((cy - halfH) / CELL_SIZE) - 1;
  const endY = Math.ceil((cy + halfH) / CELL_SIZE) + 1;

  for (let gx = startX; gx <= endX; gx++) {
    for (let gy = startY; gy <= endY; gy++) {
      if (hash(gx, gy, 1) > density) continue; // most cells stay empty — a sparse sky, not a snowstorm

      const wx = (gx + hash(gx, gy, 2)) * CELL_SIZE;
      const wy = (gy + hash(gx, gy, 3)) * CELL_SIZE;
      const sx = ctx.canvas.width / 2 + (wx - cx) * camera.zoom;
      const sy = ctx.canvas.height / 2 + (wy - cy) * camera.zoom;

      const size = (minSize + hash(gx, gy, 4) * (maxSize - minSize)) * camera.zoom;
      const phase = hash(gx, gy, 5) * Math.PI * 2;
      const twinkle = 0.85 + 0.15 * Math.sin(now / 900 + phase); // gentle, not a strobe
      const alpha = (minAlpha + hash(gx, gy, 6) * (maxAlpha - minAlpha)) * twinkle;

      ctx.fillStyle = `rgba(${colorRGB},${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawStarfield(ctx, camera) {
  const now = performance.now();
  // Far layer: smaller, dimmer, drifts at 0.3x the camera's pan — reads as distant.
  drawLayer(ctx, camera, { parallax: 0.3, density: 0.35, minSize: 0.4, maxSize: 1.1, minAlpha: 0.15, maxAlpha: 0.45, colorRGB: '180,200,255', now });
  // Near layer: fewer stars but bigger/brighter, closer to 1:1 with the world — visual anchors.
  drawLayer(ctx, camera, { parallax: 0.7, density: 0.06, minSize: 1.0, maxSize: 2.0, minAlpha: 0.4, maxAlpha: 0.85, colorRGB: '220,235,255', now });
}
