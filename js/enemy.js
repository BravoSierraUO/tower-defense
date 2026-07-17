import { CONFIG } from './config.js';

export class Enemy {
  constructor(path) {
    this.path = path;
    this.waypointIndex = 0;
    this.x = path[0].x;
    this.y = path[0].y;
    this.speed = CONFIG.ENEMY_SPEED;
    this.health = CONFIG.ENEMY_HEALTH;
    this.reachedEnd = false;
  }

  update(dt) {
    if (this.reachedEnd) return;

    const target = this.path[this.waypointIndex + 1];
    if (!target) {
      this.reachedEnd = true;
      return;
    }

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;

    if (step >= dist) {
      this.x = target.x;
      this.y = target.y;
      this.waypointIndex++;
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  isDead() {
    return this.health <= 0;
  }
}
