import { CONFIG } from './config.js';

// Weighted random pick from a plain {key: weight} table — every table this
// module reads is proportions, not literal percent-of-100, so callers never
// need to pre-normalize (World.orePerSecond() derives its own continuous
// shares straight off ORE_LOOT_TABLE without ever calling this).
function rollWeighted(table) {
  const total = Object.values(table).reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [key, weight] of Object.entries(table)) {
    if (roll < weight) return key;
    roll -= weight;
  }
  return Object.keys(table)[0];
}

// Mining path (idle) — which ore a Scavenger's cycle rolls, weighted by its
// tier's CONFIG.ORE_LOOT_TABLE. Only used for the stats-screen odds display;
// World.orePerSecond() is what actually pays ore into Inventory, as a
// continuous rate rather than discrete rolls like this one.
export function rollOre(tier) {
  return rollWeighted(CONFIG.ORE_LOOT_TABLE[tier - 1]);
}

// Combat path (tower-defensish) — wreck salvage never rolls plain Metal, see
// CONFIG.ENEMY_ORE_DROP_TABLE's comment.
export function rollDroppedOre() {
  return rollWeighted(CONFIG.ENEMY_ORE_DROP_TABLE);
}

// Foundry's rarityBonusPct (ROOM_TYPES.foundry) shifts weight out of grey and
// into green/gold — 70/30 split between them, first-pass and not tuned, same
// as every other constant in this system.
export function rollItemRarity(bonusPct = 0) {
  const shifted = {};
  for (const tier of CONFIG.RARITY_TIERS) {
    if (tier.id === 'grey') {
      shifted[tier.id] = Math.max(0, tier.weight - bonusPct * 100);
    } else {
      shifted[tier.id] = tier.weight + bonusPct * 100 * (tier.id === 'green' ? 0.7 : 0.3);
    }
  }
  return rollWeighted(shifted);
}

function rollAffixValue(affix) {
  return affix.min + Math.random() * (affix.max - affix.min);
}

// Picks `tier.affixCount` unique affixes (RARITY_TIERS) from AFFIX_POOL, each
// with its own random value in [min, max] — grey rolls none.
export function rollAffixes(rarityId) {
  const tier = CONFIG.RARITY_TIERS.find(t => t.id === rarityId);
  const count = tier ? tier.affixCount : 0;
  const pool = [...CONFIG.AFFIX_POOL];
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const affix = pool.splice(idx, 1)[0];
    picked.push({ id: affix.id, label: affix.label, stat: affix.stat, value: rollAffixValue(affix) });
  }
  return picked;
}

// Reads a possibly-null equipped item's rolled affixes for one stat and folds
// them into a single multiplier — 1 (no-op) if the item is null or carries no
// matching affix. Tower/Scavenger call this once per relevant base stat
// (effectiveRange(), effectiveFireRate(), etc.) rather than Tower/Scavenger
// reaching into Inventory internals directly.
export function affixMultiplier(item, stat) {
  if (!item) return 1;
  return item.affixes.reduce((mult, a) => (a.stat === stat ? mult + a.value : mult), 1);
}

let nextItemId = 1;

// Phase 11 skeleton: raw ore + refined materials are plain stackable counts
// (same shape as World.gold/metal); crafted/dropped components are discrete
// instances in `items` since each one independently rolls its own rarity +
// affixes — two Motors from the same recipe are never identical, the
// Torn/Mafia "5 guns, 5 different guns" feel from one recipe.
export class Inventory {
  constructor() {
    this.ore = { fancyMetal: 0, platinum: 0, diamonds: 0 };
    this.refined = { alloy: 0, circuitWire: 0, prismaticCoil: 0 };
    this.items = [];
    // Permanent totals, never spent down — same "life stats vs. spendable
    // pool" split profile.js already uses for CP vs. badges. Mined is a
    // continuous accrual sum (fractional); salvaged is a discrete per-kill
    // count. Both are pure stats-screen flex, gate nothing.
    this.lifetimeOreMined = { fancyMetal: 0, platinum: 0, diamonds: 0 };
    this.lifetimeOreSalvaged = { fancyMetal: 0, platinum: 0, diamonds: 0 };
  }

  // Called continuously by World.updateOreAccrual() — 'metal' is never
  // passed here, World.metal owns that pool directly (see orePerSecond()).
  addOre(type, amount) {
    this.ore[type] = (this.ore[type] || 0) + amount;
    this.lifetimeOreMined[type] = (this.lifetimeOreMined[type] || 0) + amount;
  }

  // Called once per kill-drop roll (World.rollKillDrops()) — always exactly 1 unit.
  addSalvagedOre(type) {
    this.ore[type] = (this.ore[type] || 0) + 1;
    this.lifetimeOreSalvaged[type] = (this.lifetimeOreSalvaged[type] || 0) + 1;
  }

  canAfford(costs, pool) {
    return Object.entries(costs).every(([key, amount]) => (pool[key] || 0) >= amount);
  }

  spend(costs, pool) {
    for (const [key, amount] of Object.entries(costs)) pool[key] -= amount;
  }

  canRefine(recipeId) {
    const recipe = CONFIG.REFINED_RECIPES[recipeId];
    return !!recipe && this.canAfford(this.costsOf(recipe), this.ore);
  }

  // Same silent-no-op-if-you-can't-afford-it convention every other
  // build/upgrade action in this codebase already uses.
  refine(recipeId) {
    if (!this.canRefine(recipeId)) return false;
    this.spend(this.costsOf(CONFIG.REFINED_RECIPES[recipeId]), this.ore);
    this.refined[recipeId] = (this.refined[recipeId] || 0) + 1;
    return true;
  }

  // Recipe objects (REFINED_RECIPES/COMPONENT_RECIPES) carry a display `label`
  // alongside their material-key costs — strip it before treating the object
  // as a cost map.
  costsOf(recipe) {
    const costs = { ...recipe };
    delete costs.label;
    return costs;
  }

  canCraft(recipeId) {
    const recipe = CONFIG.COMPONENT_RECIPES[recipeId];
    return !!recipe && this.canAfford(this.costsOf(recipe), this.refined);
  }

  craft(recipeId, rarityBonusPct = 0) {
    if (!this.canCraft(recipeId)) return null;
    this.spend(this.costsOf(CONFIG.COMPONENT_RECIPES[recipeId]), this.refined);
    return this.addCraftedItem(recipeId, rarityBonusPct);
  }

  // Shared by craft() (paid, Foundry) and World.rollKillDrops() (free,
  // skip-the-line wreck salvage) — same rarity/affix roll either way, only
  // whether a cost was paid differs.
  addCraftedItem(recipeId, rarityBonusPct = 0) {
    const rarity = rollItemRarity(rarityBonusPct);
    const item = {
      id: nextItemId++,
      recipeId,
      rarity,
      affixes: rollAffixes(rarity)
    };
    this.items.push(item);
    return item;
  }
}
