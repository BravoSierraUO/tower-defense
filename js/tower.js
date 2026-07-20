import { CONFIG } from './config.js';
import { affixMultiplier } from './inventory.js';

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
    // Phase 11: at most one crafted/dropped component (js/inventory.js), equipped
    // via World.equipItem() — a first pass, no per-class item-type restriction
    // (any component fits any Tower/Scavenger) and no multi-slot loadout, both
    // deliberately left for Phase 7b's fuller module system to pick up later.
    this.equippedItem = null;
    this.applyTier();
  }

  applyTier() {
    const t = CONFIG.TOWER_TIERS[this.tier - 1];
    this.range = CONFIG.TOWER_RANGE * t.rangeMult;
    this.damage = CONFIG.TOWER_DAMAGE * t.damageMult;
    this.fireRate = CONFIG.TOWER_FIRE_RATE * t.fireRateMult;
  }

  // Base stat * whatever the equipped item's matching affix rolled (1 = no
  // effect, no item equipped or none of its affixes match this stat).
  effectiveRange() {
    return this.range * affixMultiplier(this.equippedItem, 'rangeMult');
  }

  effectiveDamage() {
    return this.damage * affixMultiplier(this.equippedItem, 'damageMult');
  }

  effectiveFireRate() {
    return this.fireRate * affixMultiplier(this.equippedItem, 'fireRateMult');
  }

  // Cooldown affixes (CONFIG.AFFIX_POOL's 'cooldown' entry) roll negative
  // values — a direct multiplier on the computed cooldown duration itself
  // (combat.js), separate from effectiveFireRate() above even though both
  // ultimately push the same "fires more often" lever. Kept as two distinct
  // affixes for itemization variety, not because they're mechanically
  // independent — same "go crazy on breadth" call the whole affix pool made.
  cooldownAffixMult() {
    return affixMultiplier(this.equippedItem, 'cooldownMult');
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
