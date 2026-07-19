import { CONFIG } from './config.js';

export class Tower {
  // Phase 7a: damageType defaults to 'kinetic' so every pre-existing call site
  // (tests included) keeps working unmodified — stats are identical across
  // types this phase, only the combat.js matchup multiplier differs.
  constructor(x, y, cost = CONFIG.TOWER_COST, damageType = 'kinetic') {
    this.x = x;
    this.y = y;
    this.tier = 1; // 1-3, see CONFIG.TOWER_TIERS
    this.cooldown = 0;
    this.cost = cost; // what was actually paid — sell refund is a % of this
    this.damageType = damageType; // 'kinetic' | 'plasma' | 'energy', see CONFIG.DAMAGE_TYPES
    this.applyTier();
  }

  applyTier() {
    const t = CONFIG.TOWER_TIERS[this.tier - 1];
    this.range = CONFIG.TOWER_RANGE * t.rangeMult;
    this.damage = CONFIG.TOWER_DAMAGE * t.damageMult;
    this.fireRate = CONFIG.TOWER_FIRE_RATE * t.fireRateMult;
  }

  canUpgrade() {
    return this.tier < CONFIG.TOWER_TIERS.length;
  }

  upgrade() {
    if (!this.canUpgrade()) return;
    this.tier++;
    this.applyTier();
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
  }
}
