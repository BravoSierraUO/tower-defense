import { CONFIG } from './config.js';
import { affixMultiplier } from './inventory.js';

// Phase 4c: exterior world-grid placeable like Tower, but passive — no
// target/damage/cooldown. Mines metal through the AI Cycle Budget scheduler
// (World.metalPerSecond()) rather than a flat per-second rate of its own.
export class ScavengerTurret {
  constructor(x, y, cost = CONFIG.SCAVENGER_COST) {
    this.x = x;
    this.y = y;
    this.tier = 1; // 1-3, see CONFIG.SCAVENGER_TIERS
    this.cost = cost; // metal actually paid — sell refund is a % of this
    // Phase 11: same single-slot equip model as Tower, see its constructor comment.
    this.equippedItem = null;
    this.applyTier();
  }

  applyTier() {
    const t = CONFIG.SCAVENGER_TIERS[this.tier - 1];
    this.metalPerCycle = t.metalPerCycle;
    // Phase 7d: see Tower.applyTier()'s comment — same full-heal-on-upgrade call.
    this.maxHealth = CONFIG.SCAVENGER_HEALTH * t.healthMult;
    this.health = this.maxHealth;
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
  }

  isDestroyed() {
    return this.health <= 0;
  }

  effectiveMetalPerCycle() {
    return this.metalPerCycle * affixMultiplier(this.equippedItem, 'metalYieldMult');
  }

  // Read by World.orePerSecond() — only meaningful for the rarer ore types,
  // never plain Metal (see orePerSecond()'s own comment on why).
  rareOreFindMult() {
    return affixMultiplier(this.equippedItem, 'rareOreFindMult');
  }

  canUpgrade() {
    return this.tier < CONFIG.SCAVENGER_TIERS.length;
  }

  upgrade() {
    if (!this.canUpgrade()) return;
    this.tier++;
    this.applyTier();
  }
}
