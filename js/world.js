import { CONFIG } from './config.js';
import { Tower } from './tower.js';
import { Enemy } from './enemy.js';
import { Base } from './base.js';
import { Spawner } from './spawner.js';

export class World {
  constructor() {
    this.width = CONFIG.WORLD_WIDTH;
    this.height = CONFIG.WORLD_HEIGHT;
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.base = new Base();
    this.spawner = new Spawner();
    this.spawnRadius = Math.hypot(this.width / 2, this.height / 2) + CONFIG.SPAWN_MARGIN;
  }

  // Spawns an enemy at a random angle on a ring outside the world, aimed at the base.
  spawnEnemy(healthMultiplier = 1, speedMultiplier = 1) {
    const angle = Math.random() * Math.PI * 2;
    const x = this.base.x + Math.cos(angle) * this.spawnRadius;
    const y = this.base.y + Math.sin(angle) * this.spawnRadius;
    this.enemies.push(new Enemy(x, y, this.base.x, this.base.y, healthMultiplier, speedMultiplier));
  }

  updateSpawning(dt) {
    this.spawner.update(dt, this);
  }

  updateEnemies(dt) {
    for (const enemy of this.enemies) {
      enemy.update(dt);
    }
    this.enemies = this.enemies.filter(e => !e.reachedTarget && !e.isDead());
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
