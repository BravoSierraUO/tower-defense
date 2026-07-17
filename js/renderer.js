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

  drawPath(world, camera) {
    const ctx = this.ctx;
    const path = world.path;
    if (!path || path.length < 2) return;

    ctx.strokeStyle = CONFIG.PATH_COLOR;
    ctx.lineWidth = CONFIG.PATH_WIDTH * camera.zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const first = camera.worldToScreen(path[0].x, path[0].y);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < path.length; i++) {
      const p = camera.worldToScreen(path[i].x, path[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  drawTowers(world, camera) {
    const ctx = this.ctx;
    for (const tower of world.towers) {
      const p = camera.worldToScreen(tower.x, tower.y);
      const r = CONFIG.TOWER_RADIUS * camera.zoom;

      ctx.fillStyle = CONFIG.TOWER_COLOR;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawProjectiles(world, camera) {
    const ctx = this.ctx;
    for (const projectile of world.projectiles) {
      const p = camera.worldToScreen(projectile.x, projectile.y);
      const r = CONFIG.PROJECTILE_RADIUS * camera.zoom;

      ctx.fillStyle = CONFIG.PROJECTILE_COLOR;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawEnemies(world, camera) {
    const ctx = this.ctx;
    for (const enemy of world.enemies) {
      const p = camera.worldToScreen(enemy.x, enemy.y);
      const r = CONFIG.ENEMY_RADIUS * camera.zoom;

      ctx.fillStyle = CONFIG.ENEMY_COLOR;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  draw(world, camera) {
    this.clear();
    drawGrid(this.ctx, camera);
    this.drawPath(world, camera);
    this.drawTowers(world, camera);
    this.drawProjectiles(world, camera);
    this.drawEnemies(world, camera);
    // future layers: terrain, effects
  }
}
