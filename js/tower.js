import { CONFIG } from './config.js';

export class Tower {
  constructor(x, y, cost = CONFIG.TOWER_COST) {
    this.x = x;
    this.y = y;
    this.range = CONFIG.TOWER_RANGE;
    this.damage = CONFIG.TOWER_DAMAGE;
    this.fireRate = CONFIG.TOWER_FIRE_RATE;
    this.cooldown = 0;
    this.cost = cost; // what was actually paid — sell refund is a % of this
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
  }
}
