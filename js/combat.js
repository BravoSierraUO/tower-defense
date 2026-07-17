import { CONFIG } from './config.js';

export class Projectile {
  constructor(x, y, target, damage) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.damage = damage;
    this.speed = CONFIG.PROJECTILE_SPEED;
    this.dead = false;
  }

  update(dt) {
    if (this.target.isDead() || this.target.reachedTarget) {
      this.dead = true;
      return;
    }

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;

    if (step >= dist) {
      this.target.health -= this.damage;
      this.dead = true;
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }
}

function findTarget(tower, enemies) {
  let closest = null;
  let closestDist = tower.range;
  for (const enemy of enemies) {
    if (enemy.isDead() || enemy.reachedTarget) continue;
    const dist = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
    if (dist <= closestDist) {
      closest = enemy;
      closestDist = dist;
    }
  }
  return closest;
}

// Enemies that reached the base deal damage once, then become eligible for cleanup.
function resolveBaseHits(world) {
  for (const enemy of world.enemies) {
    if (enemy.reachedTarget && !enemy.hasHitBase) {
      world.base.takeDamage(CONFIG.ENEMY_BASE_DAMAGE);
      enemy.hasHitBase = true;
    }
  }
}

export function updateCombat(world, dt) {
  for (const tower of world.towers) {
    if (tower.cooldown > 0) continue;
    const target = findTarget(tower, world.enemies);
    if (target) {
      world.projectiles.push(new Projectile(tower.x, tower.y, target, tower.damage));
      tower.cooldown = 1 / tower.fireRate;
    }
  }

  for (const projectile of world.projectiles) {
    projectile.update(dt);
  }
  world.projectiles = world.projectiles.filter(p => !p.dead);

  resolveBaseHits(world);
}
