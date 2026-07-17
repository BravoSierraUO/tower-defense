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
  ENEMY_SPAWN_INTERVAL: 1.5,
  PATH_COLOR: 'rgba(255,255,255,0.12)',
  PATH_WIDTH: 30,

  // Temporary hardcoded path (waypoints). Replaced by level data later.
  PATH: [
    { x: -900, y: 0 },
    { x: -300, y: 0 },
    { x: -300, y: 400 },
    { x: 300, y: 400 },
    { x: 300, y: -300 },
    { x: 900, y: -300 }
  ]
};
