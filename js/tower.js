import { CONFIG } from './config.js';
import { affixMultiplier } from './inventory.js';

export class Tower {
  // Phase 7a: damageType defaults to 'kinetic' so every pre-existing call site
  // (tests included) keeps working unmodified — stats are identical across
  // types this phase, only the combat.js matchup multiplier differs.
  constructor(x, y, cost = CONFIG.TOWER_COST, damageType = 'kinetic') {
    this.x = x;
    this.y = y;
    this.tier = 1; // 1-3, see CONFIG.TOWER_TIERS — the BUNDLED upgrade (all stats + health + power draw)
    // Phase 20: the two per-stat upgrade ladders (docs/economy-redesign.md §I).
    // Both are stored as integer COUNTS rather than multipliers: floats drift when
    // repeatedly multiplied, the iron cost curve wants to scale off the count anyway,
    // and resetting the run ladder is `= 0` instead of recomputing a product.
    //
    //   permUpgrades — bought in PREP with iron. Permanent; survives a run.
    //   runUpgrades  — bought DURING a run with scrap. Temporary; wiped at run end.
    //
    // Both compound multiplicatively at CONFIG.STAT_UPGRADE_MULT per step, so the
    // user's worked example holds: base 5, one run boost -> 5.5; die; buy a permanent
    // step so the base reads 6; next run one boost -> 6.6.
    this.permUpgrades = { damage: 0, fireRate: 0, range: 0 };
    this.runUpgrades = { damage: 0, fireRate: 0, range: 0 };
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
    // Phase 7d: an upgrade also fully heals — investing more in a turret
    // both raises its cap and repairs whatever an enemy had chipped off.
    this.maxHealth = CONFIG.TOWER_HEALTH * t.healthMult;
    this.health = this.maxHealth;
  }

  // Phase 7d: an aggro'd enemy (World.pickAggroTarget) deals contact damage here
  // instead of to the base — same shape as Base.takeDamage()/isDestroyed().
  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
  }

  isDestroyed() {
    return this.health <= 0;
  }

  // Phase 20: the multiplicative chain, in one place.
  //
  //   effective = BASE x tierMult x permMult x runMult x itemAffixMult
  //
  // `this.damage`/`fireRate`/`range` already carry BASE x tierMult (applyTier above).
  // The two new factors slot in beside the Phase 11 affix multiplier that was already
  // here — which is the point: this is one more factor in an existing chain, not a
  // new mechanism.
  permMult(stat) {
    return Math.pow(CONFIG.STAT_UPGRADE_MULT, this.permUpgrades[stat] || 0);
  }

  runMult(stat) {
    return Math.pow(CONFIG.STAT_UPGRADE_MULT, this.runUpgrades[stat] || 0);
  }

  statMult(stat) {
    return this.permMult(stat) * this.runMult(stat);
  }

  // The single line that makes the run ladder temporary. Called for every tower by
  // World.endTdRun() — no snapshot, no restore, nothing to unwind, and therefore no
  // path by which a scrap-bought boost becomes permanent power.
  resetRunUpgrades() {
    for (const stat of Object.keys(this.runUpgrades)) this.runUpgrades[stat] = 0;
  }

  // Base stat * whatever the equipped item's matching affix rolled (1 = no
  // effect, no item equipped or none of its affixes match this stat).
  effectiveRange() {
    return this.range * this.statMult('range') * affixMultiplier(this.equippedItem, 'rangeMult');
  }

  effectiveDamage() {
    return this.damage * this.statMult('damage') * affixMultiplier(this.equippedItem, 'damageMult');
  }

  effectiveFireRate() {
    return this.fireRate * this.statMult('fireRate') * affixMultiplier(this.equippedItem, 'fireRateMult');
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
