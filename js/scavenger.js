import { CONFIG } from './config.js';

// Phase 4c: exterior world-grid placeable like Tower, but passive — no
// target/damage/cooldown. Mines metal through the AI Cycle Budget scheduler
// (World.metalPerSecond()) rather than a flat per-second rate of its own.
export class ScavengerTurret {
  constructor(x, y, cost = CONFIG.SCAVENGER_COST) {
    this.x = x;
    this.y = y;
    this.tier = 1; // 1-3, see CONFIG.SCAVENGER_TIERS
    this.cost = cost; // metal actually paid — sell refund is a % of this
    this.applyTier();
  }

  applyTier() {
    this.metalPerCycle = CONFIG.SCAVENGER_TIERS[this.tier - 1].metalPerCycle;
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
