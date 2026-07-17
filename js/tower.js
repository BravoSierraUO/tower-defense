import { CONFIG } from './config.js';

export class Tower {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.range = CONFIG.TOWER_RANGE;
    this.damage = CONFIG.TOWER_DAMAGE;
    this.fireRate = CONFIG.TOWER_FIRE_RATE;
    this.cooldown = 0;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
  }
}
