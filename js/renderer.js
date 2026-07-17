import { CONFIG } from './config.js';
import { drawGrid } from './grid.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  clear() {
    this.ctx.fillStyle = CONFIG.BG_COLOR;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(world, camera) {
    this.clear();
    drawGrid(this.ctx, camera);
    // future layers: terrain, paths, buildings, projectiles, enemies, effects
  }
}
