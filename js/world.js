import { CONFIG } from './config.js';
import { Tower } from './tower.js';
import { Enemy } from './enemy.js';

export class World {
  constructor() {
    this.width = CONFIG.WORLD_WIDTH;
    this.height = CONFIG.WORLD_HEIGHT;
    this.towers = [];
    this.enemies = [];
    this.path = CONFIG.PATH;
    this.spawnTimer = 0;
  }

  spawnEnemy() {
    this.enemies.push(new Enemy(this.path));
  }

  // Temporary: spawns on a timer until wave.js (v0.5) owns this.
  updateSpawning(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnEnemy();
      this.spawnTimer = CONFIG.ENEMY_SPAWN_INTERVAL;
    }
  }

  updateEnemies(dt) {
    for (const enemy of this.enemies) {
      enemy.update(dt);
    }
    this.enemies = this.enemies.filter(e => !e.reachedEnd && !e.isDead());
  }

  snapToGrid(x, y) {
    const size = CONFIG.GRID_SIZE;
    return {
      x: Math.floor(x / size) * size + size / 2,
      y: Math.floor(y / size) * size + size / 2
    };
  }

  isInsideWorld(x, y) {
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    return x >= -halfW && x <= halfW && y >= -halfH && y <= halfH;
  }

  placeTower(x, y) {
    const snapped = this.snapToGrid(x, y);
    if (!this.isInsideWorld(snapped.x, snapped.y)) return null;

    const occupied = this.towers.some(t => t.x === snapped.x && t.y === snapped.y);
    if (occupied) return null;

    const tower = new Tower(snapped.x, snapped.y);
    this.towers.push(tower);
    return tower;
  }
}
