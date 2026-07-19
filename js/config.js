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
    }
  },

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
  CORE_COMPUTE_REWARD_BONUS_PER_POINT: 0.01  // AI Core: 1% more gold per compute
};
