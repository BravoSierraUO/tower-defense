import { CONFIG } from './config.js';

export class Base {
  constructor(x = CONFIG.BASE_X, y = CONFIG.BASE_Y) {
    this.x = x;
    this.y = y;
    this.radius = CONFIG.BASE_RADIUS;
    this.maxHealth = CONFIG.BASE_HEALTH;
    this.health = CONFIG.BASE_HEALTH;
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
  }

  isDestroyed() {
    return this.health <= 0;
  }
}
