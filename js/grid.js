import { CONFIG } from './config.js';

export function drawGrid(ctx, camera) {
  const b = camera.getViewBounds();
  const size = CONFIG.GRID_SIZE;

  const startX = Math.floor(b.left / size) * size;
  const endX = Math.ceil(b.right / size) * size;
  const startY = Math.floor(b.top / size) * size;
  const endY = Math.ceil(b.bottom / size) * size;

  ctx.lineWidth = 1;

  for (let x = startX; x <= endX; x += size) {
    ctx.strokeStyle = (x / size) % 5 === 0 ? CONFIG.GRID_COLOR_MAJOR : CONFIG.GRID_COLOR;
    const p1 = camera.worldToScreen(x, startY);
    const p2 = camera.worldToScreen(x, endY);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  for (let y = startY; y <= endY; y += size) {
    ctx.strokeStyle = (y / size) % 5 === 0 ? CONFIG.GRID_COLOR_MAJOR : CONFIG.GRID_COLOR;
    const p1 = camera.worldToScreen(startX, y);
    const p2 = camera.worldToScreen(endX, y);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
}
