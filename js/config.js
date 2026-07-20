export const CONFIG = {
  GRID_SIZE: 40,
  WORLD_WIDTH: 2000,
  WORLD_HEIGHT: 2000,
  ZOOM_MIN: 0.3,
  ZOOM_MAX: 3,
  ZOOM_SPEED: 0.001,
  PAN_SPEED: 500,
  // Rebindable via Settings > Hotkeys (js/keybindings.js) — these are only the
  // defaults, the actual runtime binding is whatever's in localStorage merged over
  // this. Single physical keys only, no modifier chords (Ctrl/Shift/Alt) — deliberately
  // out of scope for an action set this small in a non-RTS.
  DEFAULT_KEYBINDINGS: {
    panUp: 'w',
    panDown: 's',
    panLeft: 'a',
    panRight: 'd'
  },
  BG_COLOR: '#0B1020',
  GRID_COLOR: 'rgba(98,208,255,0.08)',
  GRID_COLOR_MAJOR: 'rgba(98,208,255,0.15)',

  TOWER_RANGE: 150,
  TOWER_DAMAGE: 10,
  TOWER_FIRE_RATE: 1,
  TOWER_RADIUS: 14,
  TOWER_COLOR: '#62D0FF',

  // Phase 7a: Damage Triangle. Kinetic -> beats -> Plasma -> beats -> Energy ->
  // beats -> Kinetic; same-type (or either side untyped) is neutral. Reinterprets
  // 3 of satellites.md's 9 named classes as the 3 typed attackers instead of
  // inventing new class names — Railgun/Laser/Missile. The other 6 (Drone
  // Carrier/Support/EMP/Shield/Mining/Repair) are utility roles and stay
  // outside the triangle; that's Phase 7b's job, along with per-class stats/
  // XP/evolution (every type here still shares TOWER_DAMAGE/RANGE/FIRE_RATE
  // and towerCost() — only the matchup multiplier differs this phase).
  // Each type's own `beats` is the single source of truth — combat.js derives
  // both the attacker's advantage and the victim's disadvantage from it,
  // rather than a separate lookup table that could drift out of sync.
  // First-pass values, not tuned: moderate rather than a harder 1.5x/0.5x
  // classic-RPS spread, since this stacks multiplicatively on top of tier
  // scaling, combo streak, and prestige damage bonuses that already compound.
  DAMAGE_TYPES: {
    kinetic: { label: 'Railgun', color: '#8FA6B8', beats: 'plasma' },
    // Violet rather than the more obvious orange/red: plasma's color needs to
    // read clearly against ENEMY_COLOR (#FF7070) when drawn as an armor-type
    // ring around an enemy (drawEnemies) — an orange-red plasma ring on a
    // red enemy body was nearly invisible in a live screenshot check.
    plasma:  { label: 'Missile', color: '#B24BFF', beats: 'energy' },
    energy:  { label: 'Laser',   color: '#62D0FF', beats: 'kinetic' }
  },
  DAMAGE_TYPE_ADVANTAGE_MULT: 1.4,
  DAMAGE_TYPE_DISADVANTAGE_MULT: 0.7,

  PROJECTILE_SPEED: 500,
  PROJECTILE_RADIUS: 4,
  PROJECTILE_COLOR: '#FFFFFF',

  ENEMY_SPEED: 100,
  ENEMY_HEALTH: 50,
  ENEMY_RADIUS: 10,
  ENEMY_COLOR: '#FF7070',
  ENEMY_SPAWN_INTERVAL: 1.2,
  ENEMY_BASE_DAMAGE: 10,

  // Phase 7d: Invader-vs-Turret Combat. Rolled once per spawn (World.pickAggroTarget) —
  // on a hit, the enemy walks at the nearest live Tower/Scavenger instead of the base;
  // on a miss (or an empty field), behavior is unchanged from every phase before this
  // one. Deals the same ENEMY_BASE_DAMAGE contact hit a base-bound enemy would, just to
  // a turret's health pool instead — no separate damage constant invented for it.
  ENEMY_AGGRO_CHANCE: 0.2,
  ENEMY_AGGRO_COLOR: '#FFB020', // telegraph ring/line color, distinct from every DAMAGE_TYPES/SCAVENGER color already in play
  // A tower kill scored while it was still aggro'd on a turret (i.e. shot down before
  // reaching it) pays extra, on top of the normal GOLD_PER_ENEMY_HEALTH payout — the
  // user's own framing was "we get some metal and money," so this is the game's first
  // per-kill metal payout, distinct from wave-clear metal.
  DEFENDER_BONUS_GOLD_MULT: 0.5,
  DEFENDER_BONUS_METAL_PER_ENEMY_HEALTH: 0.2,

  BASE_X: 0,
  BASE_Y: 0,
  BASE_HEALTH: 100,
  BASE_RADIUS: 26,
  BASE_COLOR: '#62D0FF',
  BASE_DAMAGE_COLOR: '#FF7070',

  SPAWN_MARGIN: 150,
  TOWER_MAX_COUNT: 50,
  TOWER_MIN_BASE_DISTANCE: 60, // keeps towers off/adjacent to the base

  MAX_WAVES: 20,
  WAVE_BASE_ENEMIES: 5,
  WAVE_ENEMY_GROWTH: 2,

  // Difficulty tiers a spawner can draw from. Multipliers apply to base
  // ENEMY_HEALTH / ENEMY_SPEED. `unlockWave` is the first wave this tier
  // can appear in; a spawner picks a weighted mix among unlocked tiers.
  DIFFICULTY_TIERS: {
    easy:   { healthMult: 1,    speedMult: 1,    unlockWave: 1, weight: 1 },
    medium: { healthMult: 1.8,  speedMult: 1.15, unlockWave: 4, weight: 0.6 },
    hard:   { healthMult: 3,    speedMult: 1.3,  unlockWave: 8, weight: 0.3 }
  },

  // Phase 2a: Command Core interior grid. Rooms produce abstract resources
  // (power/compute/storageCap) with no gameplay effect yet — Phase 2b's
  // economy is what will spend/consume them.
  // Phase 3 adds 5 more room types (lab/factory/hangar/shield/dock), all
  // gold-gated to build/upgrade (see ROOM_BUILD_COST_*) and — except lab,
  // which is the free tech-tree root — locked behind `requiresTech` nodes
  // in TECH_TREE below.
  CORE_GRID_SIZE: 8,
  CORE_CELL_SIZE: 64,
  ROOM_TYPES: {
    reactor: {
      label: 'Reactor', color: '#F3C969', output: 'power',
      tiers: [{ power: 10 }, { power: 22 }, { power: 40 }]
    },
    // Phase 4c: reframed from a flat gold-reward booster into the AI Cycle
    // Budget engine — cyclesPerMin is AI bandwidth, split across active metal
    // producers (Scavenger Turret, Mine) by World.metalPerSecond().
    aiCore: {
      label: 'AI Core', color: '#62D0FF', output: 'cyclesPerMin',
      tiers: [{ cyclesPerMin: 2 }, { cyclesPerMin: 4 }, { cyclesPerMin: 8 }]
    },
    storage: {
      label: 'Storage', color: '#9B59B6', output: 'storageCap',
      tiers: [{ storageCap: 100 }, { storageCap: 250 }, { storageCap: 500 }]
    },
    lab: {
      label: 'Lab', color: '#6EF2A3', output: 'researchRate',
      tiers: [{ researchRate: 2 }, { researchRate: 5 }, { researchRate: 10 }]
    },
    // Phase 4c: second metal source alongside Scavenger Turret, parallel to
    // how Reactor/Lab already work (free root, no requiresTech). Its
    // metalPerCycle only pays out through the same AI Cycle Budget scheduler
    // Scavenger Turret competes in — see World.activeMetalProducers().
    mine: {
      label: 'Mine', color: '#B08968', output: 'metalPerCycle',
      tiers: [{ metalPerCycle: 3 }, { metalPerCycle: 8 }, { metalPerCycle: 18 }]
    },
    // Phase 11 skeleton: Factory does double duty as of this phase — its
    // original buildTimeReduction job, plus rarityBonusPct (shifts crafted-
    // item odds toward Green/Gold, see rollItemRarity() in inventory.js).
    // A standalone Foundry room was the original plan here, but ROOM_TYPES
    // is hard-capped at 10 entries (game.js's number-key selector only has
    // 10 slots, '1'-'9' then '0' — see tests/balance.test.mjs's regression
    // guard for the Phase 4c bug this exact mistake already caused once).
    // Reusing Factory both respects that ceiling and the user's own "can't
    // have too many rooms" call — it was already the one dependency the
    // Foundry idea needed anyway.
    factory: {
      label: 'Factory', color: '#FF9F5B', output: 'buildTimeReduction',
      tiers: [
        { buildTimeReduction: 1,   rarityBonusPct: 0 },
        { buildTimeReduction: 2.5, rarityBonusPct: 0.05 },
        { buildTimeReduction: 4,   rarityBonusPct: 0.12 }
      ],
      requiresTech: 'factoryAccess'
    },
    hangar: {
      label: 'Hangar', color: '#FF6FD8', output: 'dronePower',
      tiers: [{ dronePower: 3 }, { dronePower: 8 }, { dronePower: 15 }],
      requiresTech: 'hangarAccess'
    },
    shield: {
      label: 'Shield', color: '#5BD1FF', output: 'shieldPct',
      tiers: [{ shieldPct: 0.1 }, { shieldPct: 0.22 }, { shieldPct: 0.35 }],
      requiresTech: 'shieldAccess'
    },
    dock: {
      label: 'Dock', color: '#C9A24B', output: 'tradeBonus',
      tiers: [{ tradeBonus: 0.1 }, { tradeBonus: 0.25 }, { tradeBonus: 0.45 }],
      requiresTech: 'dockAccess'
    },
    // Free root like Reactor/Lab/Mine, not gated behind dockAccess like Dock —
    // gold<->metal rebalancing should be available from minute one, same as
    // metal itself. Appended last so every existing room type's key stays put.
    market: {
      label: 'Market', color: '#7ED9FF', output: 'marketBonus',
      tiers: [{ marketBonus: 0.1 }, { marketBonus: 0.25 }, { marketBonus: 0.45 }]
    }
  },

  // Phase 3: Lab output accrues into CommandCore.research (a spendable
  // stockpile, same pattern as world.gold). Each node costs research and
  // requires its prereqs unlocked first — Lab itself needs no node since
  // it's the always-buildable root; no Lab built = no researchRate = tree
  // never advances, which is gate enough without a separate "lab built" check.
  //
  // Phase 6: commsAccess follows moduleSlots' precedent — a tech node with no
  // unlocksRoom key at all, gating a feature rather than a Command Core room.
  // Deliberate: ROOM_TYPES is already at its hard cap of 10 (see the Factory/
  // Foundry note above and tests/balance.test.mjs's regression guard), and
  // Communications doesn't produce a resource the way every other room does —
  // it just flips on the ability bar. Root-level (no prereq) like Lab/Factory/
  // moduleSlots rather than nested, since nothing else depends on it.
  TECH_TREE: [
    { id: 'factoryAccess', label: 'Factory Access', cost: 15, prereq: [], unlocksRoom: 'factory' },
    { id: 'hangarAccess', label: 'Hangar Access', cost: 25, prereq: ['factoryAccess'], unlocksRoom: 'hangar' },
    { id: 'shieldAccess', label: 'Shield Access', cost: 25, prereq: ['factoryAccess'], unlocksRoom: 'shield' },
    { id: 'dockAccess', label: 'Dock Access', cost: 40, prereq: ['hangarAccess', 'shieldAccess'], unlocksRoom: 'dock' },
    { id: 'moduleSlots', label: 'Module Slots', cost: 20, prereq: [], unlocksModules: true },
    { id: 'commsAccess', label: 'Communications Access', cost: 30, prereq: [], unlocksAbilities: true }
  ],

  // Phase 3: room construction now costs gold and takes time (reduced by
  // Factory's buildTimeReduction, floored so it's never instant). Upgrade
  // cost grows per tier. Module slots (unlocked via the 'moduleSlots' tech
  // node) let a built room hold small flat bonuses to its own output —
  // one universal module type, cost scales with room tier & slot count.
  ROOM_BUILD_COST_BASE: 30,
  ROOM_BUILD_COST_GROWTH: 15, // + per room already built, any type
  ROOM_UPGRADE_COST_BASE: 40,
  ROOM_UPGRADE_COST_GROWTH: 1.8, // multiplier per tier already reached
  ROOM_BUILD_TIME_BASE: 6, // seconds
  ROOM_MODULE_SLOTS_PER_TIER: [0, 1, 2], // index = tier - 1
  MODULE_BASE_COST: 25,
  MODULE_COST_GROWTH: 1.6, // multiplier per module already installed in that room
  MODULE_BONUS_PCT: 0.2, // each installed module = +20% to the room's output stat(s)

  // Phase 3: Dock lets you manually convert gold into research. Ratio
  // improves with Dock's tier (tradeBonus, from ROOM_TYPES.dock.tiers).
  DOCK_TRADE_GOLD_COST: 50,
  DOCK_TRADE_BASE_RATIO: 0.5, // research per gold at tradeBonus = 0

  // Market: manual gold<->metal trading, same shape as Dock's gold->research
  // trade above (two directions instead of one).
  MARKET_TRADE_GOLD_COST: 40,
  MARKET_TRADE_METAL_COST: 40,
  MARKET_TRADE_BASE_RATIO: 0.5, // output per unit spent at marketBonus = 0

  // Phase 2b: Skeleton Economy. Command Core output now has a real effect —
  // Reactor(power) discounts tower cost, AI Core(compute) boosts gold
  // rewards, Storage(storageCap) raises the gold cap.
  STARTING_GOLD: 100,
  GOLD_CAP_BASE: 500,
  TOWER_COST: 40,
  TOWER_SELL_REFUND_PCT: 0.6,
  GOLD_PER_ENEMY_HEALTH: 0.4,
  WAVE_CLEAR_BONUS_BASE: 20,
  WAVE_CLEAR_BONUS_GROWTH: 5,

  // Phase 8a: idle wave loop. Waves no longer auto-start on a timer — the spawner sits in
  // 'idle' until Spawner.triggerWave() is called (a HUD button). A full clear (100% of the
  // wave's enemy value killed) pays the full salvage bundle below; a wipe (base destroyed
  // mid-wave) still pays out, scaled down by a bronze/silver/gold chest tier instead of
  // ending the run. WIPE_CHEST_TIERS.minPct is checked against
  // Spawner.waveValueKilled / Spawner.waveValueTotal — raw enemy.maxHealth sums, deliberately
  // never passed through rewardMultiplier()/combo/prestige, so a future "+XP%"-style upgrade
  // only inflates payout, never the completion percentage itself.
  WAVE_CLEAR_METAL_BASE: 15,
  WAVE_CLEAR_METAL_GROWTH: 3,
  WAVE_CLEAR_MODULE_CHARGE: 1,     // free module install (see World.installModuleAt)
  WAVE_CLEAR_PRODUCTION_PARTS: 1,  // free build-timer rush (see World.rushBuildRoom)
  WIPE_CHEST_TIERS: [
    { id: 'bronze', minPct: 0,    mult: 0.25 },
    { id: 'silver', minPct: 0.34, mult: 0.5 },
    { id: 'gold',   minPct: 0.67, mult: 0.75 }
  ],
  // Phase 2b's CORE_POWER_COST_DISCOUNT_PER_POINT (Reactor cheapened Tower/Scavenger cost) is gone
  // as of Phase 4d — Reactor's power is a live supply pool now, not a one-time cost discount (see
  // below). Phase 2b's CORE_COMPUTE_REWARD_BONUS_PER_POINT (AI Core boosted gold reward) is gone as
  // of Phase 4c — AI Core's whole identity became the Cycle Budget scheduler below, one job not two.

  // Phase 4b: Economy Depth. Combo streak rewards uninterrupted kill chains;
  // base passive income scales with player level; Fast-Build lets a Command
  // Core room's build timer be rushed for gold; towers get the same tiered
  // upgrade-cost gate rooms already have; base damage can be repaired for gold.
  COMBO_WINDOW: 2.5,             // seconds since the last kill before the streak resets
  COMBO_BONUS_PER_STACK: 0.02,   // +2% gold per streak stack
  COMBO_MAX_STACKS: 25,          // caps the combo bonus at +50%
  BASE_PASSIVE_INCOME_PER_LEVEL: 0.05, // gold/sec per profile level
  FAST_BUILD_GOLD_PER_SECOND: 4, // cost to rush-finish a room's remaining build timer
  // Phase 7d: healthMult added to every tier — a turret is now a real target
  // (see ENEMY_AGGRO_CHANCE above), so upgrading it buys survivability too,
  // not just damage/range/fire-rate.
  TOWER_HEALTH: 60,
  TOWER_TIERS: [
    { damageMult: 1,   rangeMult: 1,    fireRateMult: 1,    healthMult: 1 },
    { damageMult: 1.8, rangeMult: 1.15, fireRateMult: 1.15, healthMult: 1.6 },
    { damageMult: 3,   rangeMult: 1.3,  fireRateMult: 1.3,  healthMult: 2.4 }
  ],
  TOWER_UPGRADE_COST_BASE: 30,
  TOWER_UPGRADE_COST_GROWTH: 1.8,
  BASE_REPAIR_GOLD_PER_HP: 2,
  BASE_REPAIR_AMOUNT: 20,

  // Phase 4c: Day-One Power & Metal. Gold stays the Command-Core-room currency;
  // metal funds everything on the exterior world grid (Tower AND Scavenger
  // Turret, migrated off gold this phase). Scavenger Turret is a passive
  // exterior placeable that mines metal through the AI Cycle Budget scheduler
  // (World.metalPerSecond()) rather than a flat rate — see aiCore/mine above.
  // STARTING_METAL covers exactly one Tower (TOWER_COST below): at 0 it took
  // ~4.5 min of starter-Scavenger accrual before the very first action was
  // affordable — invisible to the player as anything but a silently-broken
  // click, and directly blocked Phase 8b's "Place a Tower" tutorial mission.
  STARTING_METAL: 40,
  METAL_CAP_BASE: 300,
  BASE_CYCLES_PER_MIN: 3, // always-on AI bandwidth floor, even with zero AI Core built — keeps
                          // the starter Scavenger Turret "already producing" true from minute one
  SCAVENGER_COST: 25,
  SCAVENGER_MAX_COUNT: 20,
  // Phase 7d: a Scavenger has no way to defend itself, so it's the more
  // fragile of the two exterior placeables tier-for-tier (see TOWER_HEALTH).
  SCAVENGER_HEALTH: 40,
  SCAVENGER_TIERS: [
    { metalPerCycle: 3,  healthMult: 1 },
    { metalPerCycle: 8,  healthMult: 1.4 },
    { metalPerCycle: 18, healthMult: 2 }
  ],
  SCAVENGER_UPGRADE_COST_BASE: 20,
  SCAVENGER_UPGRADE_COST_GROWTH: 1.8,
  SCAVENGER_COLOR: '#D9A441',

  // Phase 11 skeleton: Materials, Crafting & Itemization — "Ultima Online in
  // space." Two deliberately different acquisition shapes for the same item
  // pool, matching the game's own idle/tower-defense split: mining (idle) is
  // a continuous derived rate exactly like Metal already is, no RNG in the
  // per-frame loop; combat salvage (tower-defense) is a real per-kill dice
  // roll, since a kill is already a discrete event. World.metal itself is
  // untouched by any of this — 'metal' rolls below still count for the
  // stats-screen odds table but never write to Inventory; rarer ore is a
  // pure bonus stream layered on top of Metal's existing accrual, not carved
  // out of it, so this can't regress the existing economy. First-pass
  // numbers throughout, not tuned — same standing caveat every other
  // constant block in this file already carries.
  ORE_TYPES: {
    metal:      { label: 'Metal',       color: '#8FA6B8' },
    fancyMetal: { label: 'Fancy Metal', color: '#4CD97B' },
    platinum:   { label: 'Platinum',    color: '#F3C969' },
    diamonds:   { label: 'Diamonds',    color: '#8FE3FF' }
  },
  // Weighted odds a Scavenger's cycle payout rolls, index = tier - 1. Sums to
  // 100 per tier; better tiers shift weight toward the rarer end, same
  // "upgrading makes the good stuff more likely, not just more" feel the
  // rarity-bonus Foundry tiers below go for.
  ORE_LOOT_TABLE: [
    { metal: 80, fancyMetal: 15,   platinum: 4.99, diamonds: 0.01 },
    { metal: 72, fancyMetal: 20,   platinum: 7.97, diamonds: 0.03 },
    { metal: 65, fancyMetal: 25,   platinum: 9.95, diamonds: 0.05 }
  ],
  // Combat's own table — deliberately excludes plain Metal (wreck salvage
  // reads as a distinct, richer reward than background mining, not a copy of
  // it) and is checked once per kill, not blended into the continuous rate above.
  ENEMY_ORE_DROP_TABLE: { fancyMetal: 70, platinum: 27, diamonds: 3 },
  ENEMY_ORE_DROP_CHANCE: 0.12,       // per kill
  ENEMY_COMPONENT_DROP_CHANCE: 0.03, // per kill — skips straight to a rolled component, no recipe cost

  // Factory refines raw ore into refined materials, then assembles refined
  // materials into components — reuses the one room rather than adding a
  // second (see Factory's own comment above). Every key here is an
  // Inventory.ore/refined field name.
  REFINED_RECIPES: {
    alloy:         { label: 'Alloy',          fancyMetal: 3 },
    circuitWire:   { label: 'Circuit Wire',   fancyMetal: 2, platinum: 1 },
    prismaticCoil: { label: 'Prismatic Coil', platinum: 2, diamonds: 1 }
  },
  // Every craft (paid, at an active Factory) or drop (free, combat) independently
  // rolls its own rarity + affixes via inventory.js's rollItemRarity()/rollAffixes()
  // — two Motors from the same recipe are never identical. overdriveCore is the
  // aspirational top-end item: expensive enough that crafting one at all is
  // the flex, not something meant to be spammed.
  COMPONENT_RECIPES: {
    motor:         { label: 'Motor',          alloy: 2, circuitWire: 1 },
    targetingChip: { label: 'Targeting Chip', circuitWire: 2 },
    armorPlate:    { label: 'Armor Plate',    alloy: 3 },
    overdriveCore: { label: 'Overdrive Core', prismaticCoil: 2 }
  },
  // Grey/Green/Gold, exactly the language the user asked for — weight is the
  // roll odds, affixCount is how many random affixes (below) a Green/Gold
  // item gets on top of just filling a recipe slot. Foundry's rarityBonusPct
  // (ROOM_TYPES.foundry) shifts weight out of grey and into green/gold at
  // craft time — see rollItemRarity() in inventory.js.
  RARITY_TIERS: [
    { id: 'grey',  label: 'Grey',  color: '#9AA5B1', weight: 70, affixCount: 0 },
    { id: 'green', label: 'Green', color: '#4CD97B', weight: 25, affixCount: 1 },
    { id: 'gold',  label: 'Gold',  color: '#F3C969', weight: 5,  affixCount: 2 }
  ],
  // Deliberately spans multiple stat families ("go crazy") so the same
  // component name can land wildly different roles — a Gold Motor might be a
  // fire-rate item, might be a rare-ore-find item. `stat` names are read by
  // whatever eventually consumes affixes (Phase 7c's parked upgrade modal);
  // this pass only rolls and stores them.
  AFFIX_POOL: [
    { id: 'damage',     label: 'Damage',         stat: 'damageMult',      min: 0.03,  max: 0.08 },
    { id: 'fireRate',   label: 'Fire Rate',      stat: 'fireRateMult',    min: 0.03,  max: 0.08 },
    { id: 'range',      label: 'Range',          stat: 'rangeMult',       min: 0.03,  max: 0.08 },
    { id: 'cooldown',   label: 'Cooldown',       stat: 'cooldownMult',    min: -0.08, max: -0.03 },
    { id: 'rareFind',   label: 'Rare-Ore Find',  stat: 'rareOreFindMult', min: 0.02,  max: 0.05 },
    { id: 'metalYield', label: 'Metal Yield',    stat: 'metalYieldMult',  min: 0.03,  max: 0.08 },
    { id: 'buildSpeed', label: 'Build Speed',    stat: 'buildSpeedMult',  min: 0.03,  max: 0.08 }
  ],

  // Phase 4d: Energy System. Reactor's power is a live supply pool combat Towers
  // draw from continuously (World.powerSupply/powerConsumption/powerFactor) —
  // consumption > supply throttles fire rate instead of a one-time cost discount.
  // Only Towers consume power (Scavenger Turret is passive, never fires; Command
  // Core rooms aren't power consumers). A brownout always throttles, never fully
  // stops, a tower — floored the same way Shield/Fortification cap well under 100%.
  TOWER_POWER_CONSUMPTION: [2, 3.5, 5], // per tier, index = tier - 1
  BROWNOUT_MIN_FIRE_RATE_MULT: 0.25,

  // Phase 4: player profile (persistent across runs — level/achievements/prestige).
  // Cascade-style CP economy ported from a sister project: a single CP spine
  // fed by run events, a gentle sqrt level curve, and a prestige loop that resets the
  // CP climb for a permanent CP-gain bonus + spendable skill points. See profile.js.
  PROFILE: {
    STORAGE_KEY: 'td.profile.v1',
    LEVEL_CP_FACTOR: 40,             // level n begins at LEVEL_CP_FACTOR*(n-1)^2 CP — fast early, eases off
    CP_PER_KILL: 1,
    CP_PER_WAVE_CLEAR_BASE: 8,
    CP_PER_WAVE_CLEAR_GROWTH: 2,     // + per wave number cleared past the first
    CP_PER_TOWER_PLACED: 2,
    CP_PER_ROOM_BUILT: 10,
    CP_PER_TECH_UNLOCKED: 20,
    CP_RUN_WIN: 150,
    CP_RUN_LOSS_PER_WAVE: 6,         // consolation CP scaled by wave reached — losing still banks progress
    TIER_CP: { common: 8, special: 20, epic: 50, legendary: 120 },   // CP bonus on achievement unlock
    PRESTIGE_GATE_BASE: 10,
    PRESTIGE_GATE_GROWTH: 10,        // gate = BASE + GROWTH*prestige → level 10, 20, 30… escalates each time
    PRESTIGE_FLAT_BONUS_PER: 0.1     // +10% CP gain per prestige, always on (before any skill spend)
  },

  // Phase 6, station-tier item: no new persistent state — driven off the prestige
  // count Profile already tracks (Profile.stationTier()). Names straight from
  // lore.md's growth chain (Small -> Orbital Platform -> ... -> Dyson Node), with
  // "Small" renamed "Outpost" for a real display label. Index = min(prestige,
  // length-1), so a maxed-out run settles at Dyson Node instead of running off the end.
  //
  // Phase 12: baseDamage turns the same tier index into the Base's own passive DPS
  // (combat.js's applyBaseDefense, same shape as Hangar's applyHangarDrones) — Prestige
  // is already the one lever that grows the station visually, so it's also the one
  // lever that grows its self-defense, rather than inventing a second currency/gate.
  // Tier 0 (Outpost) deals 0, same "nothing extra yet" precedent drawStationRings()
  // already set. First-pass numbers, not tuned, roughly bracketing Hangar's own
  // dronePower tier curve (3/8/15) since both are continuous no-projectile DPS.
  STATION_TIERS: [
    { name: 'Outpost', baseDamage: 0 },
    { name: 'Orbital Platform', baseDamage: 4 },
    { name: 'Defense Station', baseDamage: 10 },
    { name: 'Citadel', baseDamage: 18 },
    { name: 'Orbital City', baseDamage: 28 },
    { name: 'Mega Station', baseDamage: 40 },
    { name: 'Planetary Ring', baseDamage: 55 },
    { name: 'Dyson Node', baseDamage: 75 }
  ],

  // Prestige skill tree: each node is a flat % bonus to one stat, spent with
  // prestigePoints earned on prestige. `stat` keys are read by Profile#bonusFor().
  SKILLS: [
    { id: 'gold', stat: 'gold', name: 'Gold Mastery', icon: '💰', per: 0.05, max: 10 },
    { id: 'damage', stat: 'damage', name: 'Damage Mastery', icon: '⚔️', per: 0.05, max: 10 },
    { id: 'build', stat: 'build', name: 'Build Mastery', icon: '🔧', per: 0.08, max: 10 },
    { id: 'fortify', stat: 'fortify', name: 'Fortification', icon: '🛡️', per: 0.03, max: 10 }
  ],

  // Phase 6: the 5 orbital abilities from lore.md/structures.md, gated behind
  // TECH_TREE's commsAccess node — the first player-triggered, mid-wave action
  // in a game that was 100% passive/economic once a wave started. Deliberately
  // all global/no-target effects (World.useAbility() applies to every enemy/
  // tower on the field at once) rather than click-to-aim — that's the slice
  // that needed real design (see the Roadmap card) and stays LATER; this ships
  // the cooldown-gated trigger loop itself, same "carve the testable slice out
  // of the bigger vision" call Phase 7a made against 7b. First-pass numbers,
  // not tuned, same standing caveat every constant block here already carries.
  ABILITIES: [
    { id: 'emp', label: 'EMP Burst', icon: '⚡', cooldown: 45, slowMult: 0.35, duration: 4 },
    { id: 'orbitalLaser', label: 'Orbital Laser', icon: '🛰️', cooldown: 60, damage: 45 },
    { id: 'supplyDrop', label: 'Supply Drop', icon: '📦', cooldown: 50, gold: 80, metal: 40 },
    { id: 'droneRepair', label: 'Drone Repair', icon: '🔧', cooldown: 40, healPct: 0.5 },
    { id: 'satelliteRecall', label: 'Satellite Recall', icon: '📡', cooldown: 35 }
  ]
};
