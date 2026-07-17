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
  }
};
