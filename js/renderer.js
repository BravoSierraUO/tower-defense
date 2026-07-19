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

  drawCore(commandCore, selectedType, mouse) {
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

      if (!room.isActive()) {
        const pct = Math.round((1 - room.buildTimeRemaining / room.buildTimeTotal) * 100);
        ctx.fillText(`building ${pct}%`, x + cell / 2, y + cell / 2 + 12);
        // Phase 4b: Fast-Build — right-click rushes the remaining timer for gold.
        const rushCost = Math.ceil(room.buildTimeRemaining * CONFIG.FAST_BUILD_GOLD_PER_SECOND);
        ctx.font = '9px monospace';
        ctx.fillText(`right-click: rush ${rushCost}g`, x + cell / 2, y + cell / 2 + 24);
        ctx.font = '11px monospace';
      } else {
        ctx.fillText('T' + room.tier, x + cell / 2, y + cell / 2 + 12);
        this.drawModuleSlots(room, x, y, cell, def.color);
      }
    }

    // Phase 9b: ghost outline on whichever cell the mouse is hovering, once a
    // room type is armed (via the radial menu's Build flyout or a number
    // key) — the "click to place" companion to the Field view's ghost tower.
    if (selectedType && mouse) {
      const hoverCell = this.screenToCoreCell(mouse.x, mouse.y);
      if (hoverCell && !commandCore.getRoomAt(hoverCell.gx, hoverCell.gy)) {
        const gx = originX + hoverCell.gx * cell;
        const gy = originY + hoverCell.gy * cell;
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = CONFIG.ROOM_TYPES[selectedType].color;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(gx + 3, gy + 3, cell - 6, cell - 6);
        ctx.restore();
      }
    }

    ctx.textAlign = 'left';
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

  // Small dot row under an active room's tier label — filled = module
  // installed, hollow = empty slot. No-op if the room has no slots (tier 1,
  // or 'moduleSlots' tech not yet unlocked keeps everyone's count effectively 0
  // via CommandCore.canInstallModule, but slot count itself is tier-based).
  drawModuleSlots(room, x, y, cell, color) {
    const slots = room.moduleSlotCount();
    if (slots <= 0) return;
    const ctx = this.ctx;
    const dotR = 3;
    const spacing = dotR * 2 + 4;
    const totalW = slots * spacing - 4;
    const startX = x + cell / 2 - totalW / 2 + dotR;
    const dotY = y + cell / 2 + 22;

    for (let i = 0; i < slots; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * spacing, dotY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = i < room.modules.length ? color : 'rgba(255,255,255,0.15)';
      ctx.fill();
    }
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

  // Phase 4c: passive metal-mining exterior placeables — smaller and a
  // different color than combat towers to read as visually secondary.
  drawScavengers(world, camera) {
    const ctx = this.ctx;
    for (const scavenger of world.scavengers) {
      const p = camera.worldToScreen(scavenger.x, scavenger.y);
      const r = CONFIG.TOWER_RADIUS * camera.zoom * 0.8;

      ctx.fillStyle = CONFIG.SCAVENGER_COLOR;
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

  // Phase 9b: translucent preview of whatever's armed (Tower/Scavenger),
  // following the mouse — the "turret ghost" that replaces the old always-on
  // build bar as the visible reminder of what a click will place. Screen-space
  // already (this.input.mouse is never world-transformed), so no
  // camera.screenToWorld round trip needed.
  drawFieldGhost(camera, fieldBuildType, mouse) {
    if (!fieldBuildType || !mouse) return;
    const ctx = this.ctx;
    const isScavenger = fieldBuildType === 'scavenger';
    const r = CONFIG.TOWER_RADIUS * camera.zoom * (isScavenger ? 0.8 : 1);
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = isScavenger ? CONFIG.SCAVENGER_COLOR : CONFIG.TOWER_COLOR;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  draw(world, camera, fieldBuildType, mouse) {
    this.clear();
    drawGrid(this.ctx, camera);
    this.drawBase(world, camera);
    this.drawTowers(world, camera);
    this.drawScavengers(world, camera);
    this.drawProjectiles(world, camera);
    this.drawEnemies(world, camera);
    this.drawFieldGhost(camera, fieldBuildType, mouse);
    // future layers: terrain, effects
  }
}
