import { CONFIG } from './config.js';

export class Enemy {
  // Spawns at (x, y) and walks in a straight line toward (targetX, targetY) — the base.
  // Phase 7a: armorType defaults to null (neutral to every damage type) so every
  // pre-existing call site (tests included) keeps taking unmodified damage —
  // World.spawnEnemy() is the one real-game call site that assigns a real type.
  constructor(x, y, targetX, targetY, healthMultiplier = 1, speedMultiplier = 1, armorType = null) {
    this.x = x;
    this.y = y;
    this.targetX = targetX;
    this.targetY = targetY;
    this.speed = CONFIG.ENEMY_SPEED * speedMultiplier;
    this.health = CONFIG.ENEMY_HEALTH * healthMultiplier;
    this.maxHealth = this.health;
    this.reachedTarget = false;
    this.hasHitBase = false; // combat.js flips this once damage is applied
    this.armorType = armorType; // 'kinetic' | 'plasma' | 'energy' | null, see CONFIG.DAMAGE_TYPES
  }

  update(dt) {
    if (this.reachedTarget) return;

    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;

    if (step >= dist) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.reachedTarget = true;
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  isDead() {
    return this.health <= 0;
  }
}
