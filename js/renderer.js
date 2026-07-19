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
    this.ctx.textAlign = 'left';
  }

  // Layout shared between drawCore() and screenToCoreCell() so clicks map
  // to exactly the cells that got drawn.
  coreLayout() {
    const cell = CONFIG.CORE_CELL_SIZE;
    const gridSize = CONFIG.CORE_GRID_SIZE;
    const originX = (this.canvas.width - cell * gridSize) / 2;
    const originY = (this.canvas.height - cell * gridSize) / 2;
    return { originX, originY, cell, gridSize };
  }

  screenToCoreCell(x, y) {
    const { originX, originY, cell, gridSize } = this.coreLayout();
    const gx = Math.floor((x - originX) / cell);
    const gy = Math.floor((y - originY) / cell);
    if (gx < 0 || gy < 0 || gx >= gridSize || gy >= gridSize) return null;
    return { gx, gy };
  }

  drawCore(commandCore, selectedType) {
    this.clear();
    const ctx = this.ctx;
    const { originX, originY, cell, gridSize } = this.coreLayout();

    ctx.strokeStyle = CONFIG.GRID_COLOR_MAJOR;
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(originX + i * cell, originY);
      ctx.lineTo(originX + i * cell, originY + gridSize * cell);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(originX, originY + i * cell);
      ctx.lineTo(originX + gridSize * cell, originY + i * cell);
      ctx.stroke();
    }

    for (const room of commandCore.rooms) {
      const def = room.def;
      const x = originX + room.gx * cell;
      const y = originY + room.gy * cell;

      ctx.fillStyle = def.color + '33';
      ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 3, y + 3, cell - 6, cell - 6);

      ctx.fillStyle = '#EAF1F8';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(def.label, x + cell / 2, y + cell / 2 - 4);
      ctx.fillText('T' + room.tier, x + cell / 2, y + cell / 2 + 12);
    }

    if (selectedType) {
      ctx.fillStyle = 'rgba(234,241,248,0.7)';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        `Placing: ${CONFIG.ROOM_TYPES[selectedType].label} — click an empty cell`,
        this.canvas.width / 2, originY - 20
      );
    }
    ctx.textAlign = 'left';
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
