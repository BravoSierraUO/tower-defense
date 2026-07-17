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

  drawBase(world, camera) {
    const ctx = this.ctx;
    const base = world.base;
    const p = camera.worldToScreen(base.x, base.y);
    const r = base.radius * camera.zoom;
    const healthPct = base.health / base.maxHealth;

    ctx.fillStyle = CONFIG.BG_COLOR;
    ctx.strokeStyle = healthPct > 0.3 ? CONFIG.BASE_COLOR : CONFIG.BASE_DAMAGE_COLOR;
    ctx.lineWidth = 3 * camera.zoom;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.55 * healthPct, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.BASE_COLOR;
    ctx.fill();
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
    this.drawBase(world, camera);
    this.drawTowers(world, camera);
    this.drawProjectiles(world, camera);
    this.drawEnemies(world, camera);
    // future layers: terrain, effects
  }
}
