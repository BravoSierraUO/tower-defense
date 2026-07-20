import { CONFIG } from './config.js';
import { drawGrid } from './grid.js';
import { drawStarfield } from './starfield.js';
import { findTarget } from './combat.js';

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

    this.drawStationRings(p, r, camera, world.profile.stationTier());
  }

  // Phase 6: the station-tier reskin — "the station expands throughout the
  // campaign" (lore.md), tracked to Profile.stationTier() (the prestige count).
  // One extra concentric ring per tier, reusing BASE_COLOR at falling opacity
  // rather than inventing a new hue, so the Primitives audit's "one accent
  // color" claim stays true. Tier 0 (Outpost) draws nothing extra — the plain
  // base every phase before this one already had.
  drawStationRings(p, r, camera, tier) {
    if (tier <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = CONFIG.BASE_COLOR;
    ctx.lineWidth = 1.5 * camera.zoom;
    for (let i = 1; i <= tier; i++) {
      ctx.globalAlpha = 0.35 / i;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + i * 8 * camera.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawTowers(world, camera) {
    const ctx = this.ctx;
    const now = performance.now() / 1000;
    for (const tower of world.towers) {
      const p = camera.worldToScreen(tower.x, tower.y);
      const r = CONFIG.TOWER_RADIUS * camera.zoom;
      const color = CONFIG.DAMAGE_TYPES[tower.damageType]?.color ?? CONFIG.TOWER_COLOR;

      // Phase 7a: color by damageType (Railgun/Missile/Laser) instead of one
      // flat TOWER_COLOR, so the 3 types read apart on the field.
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Phase 7c: cosmetic flavor shot at whichever enemy findTarget() (the
      // same combat.js targeting a real shot would use) picks — a brief
      // dashed, translucent line, visually distinct from combat.js's real
      // Projectile so it reads as "this turret is alive," not a second
      // damage source. Pure render-layer: no health change, no cooldown
      // interaction, zero gameplay coupling.
      const flavorTarget = this.flavorShotActive(tower, now) ? findTarget(tower, world.enemies) : null;
      if (flavorTarget) {
        const tp = camera.worldToScreen(flavorTarget.x, flavorTarget.y);
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5 * camera.zoom;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(tp.x, tp.y);
        ctx.stroke();
        ctx.restore();
      }

      this.drawHealthBar(p, r, tower, camera, color);
    }
  }

  // Phase 7d: only drawn once a turret has actually taken damage — a full-health
  // one stays exactly as clean as it was every phase before turrets had health,
  // no permanent new UI chrome for the common case.
  drawHealthBar(p, r, entity, camera, color) {
    if (entity.health >= entity.maxHealth) return;
    const ctx = this.ctx;
    const w = r * 2;
    const y = p.y + r + 5 * camera.zoom;
    const pct = Math.max(0, entity.health / entity.maxHealth);

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(p.x - w / 2, y, w, 3 * camera.zoom);
    ctx.fillStyle = pct > 0.3 ? color : CONFIG.BASE_DAMAGE_COLOR;
    ctx.fillRect(p.x - w / 2, y, w * pct, 3 * camera.zoom);
  }

  // A short, deterministic "is this turret flavor-firing right now" window —
  // FLAVOR_SHOT_WINDOW seconds out of every FLAVOR_SHOT_PERIOD, phase-offset
  // per tower (off its own position) so a field of turrets doesn't all flash
  // in lockstep. Driven off performance.now(), same "no persisted animation
  // state" approach starfield.js's twinkle already uses.
  flavorShotActive(tower, now) {
    const period = 1.4;
    const window = 0.15;
    const phase = (now + tower.x * 0.013 + tower.y * 0.007) % period;
    return phase < window;
  }

  // Phase 4c: passive metal-mining exterior placeables — smaller and a
  // different color than combat towers to read as visually secondary.
  drawScavengers(world, camera) {
    const ctx = this.ctx;
    const now = performance.now() / 1000;
    // Time between AI Cycle Budget payouts (world.js) — the zap below is
    // timed to the real mechanic's own rate, not a clock of its own, so
    // upgrading AI Core/Scavenger tiers visibly speeds the animation up too.
    const period = 1 / Math.max(0.01, world.cyclesPerSecond());
    for (const scavenger of world.scavengers) {
      const p = camera.worldToScreen(scavenger.x, scavenger.y);
      const r = CONFIG.TOWER_RADIUS * camera.zoom * 0.8;

      ctx.fillStyle = CONFIG.SCAVENGER_COLOR;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Phase 7c: an asteroid drifts in from a fixed approach angle and gets
      // "zapped" on arrival, then the cycle repeats — phase-offset per
      // Scavenger (off its own position) so a field of them doesn't all zap
      // in lockstep.
      const phase = ((now + scavenger.x * 0.01) % period) / period; // 0 (just zapped) .. 1 (about to zap)
      const angle = (scavenger.x + scavenger.y) * 0.02;
      const dist = r * 3.2 * (1 - phase);
      const ax = p.x + Math.cos(angle) * (r + dist);
      const ay = p.y + Math.sin(angle) * (r + dist);

      ctx.fillStyle = '#8FA6B8';
      ctx.beginPath();
      ctx.arc(ax, ay, r * 0.35, 0, Math.PI * 2);
      ctx.fill();

      if (phase > 0.85) {
        ctx.strokeStyle = CONFIG.SCAVENGER_COLOR;
        ctx.lineWidth = 2 * camera.zoom;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(ax, ay);
        ctx.stroke();
      }

      this.drawHealthBar(p, r, scavenger, camera, CONFIG.SCAVENGER_COLOR);
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

      // Phase 7a: armorType ring — kept a separate outline rather than
      // recoloring the whole enemy, so it still reads as "enemy" (red) at a
      // glance instead of blending with a same-colored attacker type.
      const typeColor = CONFIG.DAMAGE_TYPES[enemy.armorType]?.color;
      if (typeColor) {
        ctx.strokeStyle = typeColor;
        ctx.lineWidth = 2.5 * camera.zoom;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Phase 7d: an aggro'd enemy (World.pickAggroTarget) has to read differently
      // on screen before it arrives, or the mechanic is invisible until a turret's
      // already dead — an outer amber ring plus a solid line at its actual target,
      // visually distinct from Phase 7c's dashed/translucent turret flavor-shot line.
      if (enemy.attackTarget) {
        ctx.strokeStyle = CONFIG.ENEMY_AGGRO_COLOR;
        ctx.lineWidth = 1.5 * camera.zoom;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4 * camera.zoom, 0, Math.PI * 2);
        ctx.stroke();

        const tp = camera.worldToScreen(enemy.attackTarget.x, enemy.attackTarget.y);
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(tp.x, tp.y);
        ctx.stroke();
        ctx.restore();
      }
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
    // Phase 7a: fieldBuildType is now a damageType key ('kinetic'/'plasma'/
    // 'energy') for the 3 typed attackers, or 'scavenger' — ghost color
    // matches whichever's armed.
    ctx.fillStyle = isScavenger ? CONFIG.SCAVENGER_COLOR : (CONFIG.DAMAGE_TYPES[fieldBuildType]?.color ?? CONFIG.TOWER_COLOR);
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  draw(world, camera, fieldBuildType, mouse, showGrid) {
    this.clear();
    drawStarfield(this.ctx, camera);
    if (showGrid) drawGrid(this.ctx, camera);
    this.drawBase(world, camera);
    this.drawTowers(world, camera);
    this.drawScavengers(world, camera);
    this.drawProjectiles(world, camera);
    this.drawEnemies(world, camera);
    this.drawFieldGhost(camera, fieldBuildType, mouse);
    // future layers: terrain, effects
  }
}
