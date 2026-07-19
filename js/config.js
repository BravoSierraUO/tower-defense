export const CONFIG = {
  GRID_SIZE: 40,
  WORLD_WIDTH: 2000,
  WORLD_HEIGHT: 2000,
  ZOOM_MIN: 0.3,
  ZOOM_MAX: 3,
  ZOOM_SPEED: 0.001,
  PAN_SPEED: 500,
  BG_COLOR: '#0B1020',
  GRID_COLOR: 'rgba(98,208,255,0.08)',
  GRID_COLOR_MAJOR: 'rgba(98,208,255,0.15)',

  TOWER_RANGE: 150,
  TOWER_DAMAGE: 10,
  TOWER_FIRE_RATE: 1,
  TOWER_RADIUS: 14,
  TOWER_COLOR: '#62D0FF',

  PROJECTILE_SPEED: 500,
  PROJECTILE_RADIUS: 4,
  PROJECTILE_COLOR: '#FFFFFF',

  ENEMY_SPEED: 100,
  ENEMY_HEALTH: 50,
  ENEMY_RADIUS: 10,
  ENEMY_COLOR: '#FF7070',
  ENEMY_SPAWN_INTERVAL: 1.2,
  ENEMY_BASE_DAMAGE: 10,

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
  WAVE_START_DELAY: 3,
  WAVE_INTERVAL: 6,
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
    aiCore: {
      label: 'AI Core', color: '#62D0FF', output: 'compute',
      tiers: [{ compute: 5 }, { compute: 12 }, { compute: 24 }]
    },
    storage: {
      label: 'Storage', color: '#9B59B6', output: 'storageCap',
      tiers: [{ storageCap: 100 }, { storageCap: 250 }, { storageCap: 500 }]
    },
    lab: {
      label: 'Lab', color: '#6EF2A3', output: 'researchRate',
      tiers: [{ researchRate: 2 }, { researchRate: 5 }, { researchRate: 10 }]
    },
    factory: {
      label: 'Factory', color: '#FF9F5B', output: 'buildTimeReduction',
      tiers: [{ buildTimeReduction: 1 }, { buildTimeReduction: 2.5 }, { buildTimeReduction: 4 }],
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
    }
  },

  // Phase 3: Lab output accrues into CommandCore.research (a spendable
  // stockpile, same pattern as world.gold). Each node costs research and
  // requires its prereqs unlocked first — Lab itself needs no node since
  // it's the always-buildable root; no Lab built = no researchRate = tree
  // never advances, which is gate enough without a separate "lab built" check.
  TECH_TREE: [
    { id: 'factoryAccess', label: 'Factory Access', cost: 15, prereq: [], unlocksRoom: 'factory' },
    { id: 'hangarAccess', label: 'Hangar Access', cost: 25, prereq: ['factoryAccess'], unlocksRoom: 'hangar' },
    { id: 'shieldAccess', label: 'Shield Access', cost: 25, prereq: ['factoryAccess'], unlocksRoom: 'shield' },
    { id: 'dockAccess', label: 'Dock Access', cost: 40, prereq: ['hangarAccess', 'shieldAccess'], unlocksRoom: 'dock' },
    { id: 'moduleSlots', label: 'Module Slots', cost: 20, prereq: [], unlocksModules: true }
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
  CORE_POWER_COST_DISCOUNT_PER_POINT: 0.005, // Reactor: 0.5% cheaper towers per power
  CORE_COMPUTE_REWARD_BONUS_PER_POINT: 0.01, // AI Core: 1% more gold per compute

  // Phase 4: player profile (persistent across runs — level/achievements/prestige).
  // Cascade-style CP economy ported from a sister project (RMUV): a single CP spine
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

  // Prestige skill tree: each node is a flat % bonus to one stat, spent with
  // prestigePoints earned on prestige. `stat` keys are read by Profile#bonusFor().
  SKILLS: [
    { id: 'gold', stat: 'gold', name: 'Gold Mastery', icon: '💰', per: 0.05, max: 10 },
    { id: 'damage', stat: 'damage', name: 'Damage Mastery', icon: '⚔️', per: 0.05, max: 10 },
    { id: 'build', stat: 'build', name: 'Build Mastery', icon: '🔧', per: 0.08, max: 10 },
    { id: 'fortify', stat: 'fortify', name: 'Fortification', icon: '🛡️', per: 0.03, max: 10 }
  ]
};
