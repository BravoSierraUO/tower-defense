import { CONFIG } from './config.js';

export class Enemy {
  // Spawns at (x, y) and walks in a straight line toward (targetX, targetY) — the base,
  // unless Phase 7d's aggro roll (World.pickAggroTarget) picked a Tower/Scavenger instead.
  // Phase 7a: armorType defaults to null (neutral to every damage type) so every
  // pre-existing call site (tests included) keeps taking unmodified damage —
  // World.spawnEnemy() is the one real-game call site that assigns a real type.
  // Phase 7d: attackTarget defaults to null (base-bound, the only behavior that existed
  // before this phase) — World.spawnEnemy() passes a live Tower/Scavenger instance when
  // the aggro roll hits, with targetX/targetY already pointed at that turret's position.
  constructor(x, y, targetX, targetY, healthMultiplier = 1, speedMultiplier = 1, armorType = null, attackTarget = null) {
    this.x = x;
    this.y = y;
    this.targetX = targetX;
    this.targetY = targetY;
    this.speed = CONFIG.ENEMY_SPEED * speedMultiplier;
    this.health = CONFIG.ENEMY_HEALTH * healthMultiplier;
    this.maxHealth = this.health;
    this.reachedTarget = false;
    this.hasHitTarget = false; // combat.js flips this once contact damage is applied (base or turret)
    this.armorType = armorType; // 'kinetic' | 'plasma' | 'energy' | null, see CONFIG.DAMAGE_TYPES
    this.attackTarget = attackTarget; // Tower | ScavengerTurret | null (null = base-bound)
    this.slowTimer = 0; // Phase 6: seconds remaining on World's EMP ability, ticked down in update()
    this.slowMult = 1;  // set alongside slowTimer by World.useAbility('emp'); irrelevant once slowTimer hits 0
  }

  effectiveSpeed() {
    return this.slowTimer > 0 ? this.speed * this.slowMult : this.speed;
  }

  update(dt) {
    if (this.reachedTarget) return;
    if (this.slowTimer > 0) this.slowTimer = Math.max(0, this.slowTimer - dt);

    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.effectiveSpeed() * dt;

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
