import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { updateCombat, Projectile } from '../js/combat.js';
import { Enemy } from '../js/enemy.js';
import { freshGame, finishBuild } from './helpers.mjs';

const AWAY_FROM_BASE = 200;

describe('combat: tower targeting & firing', () => {
  test('a tower with an enemy in range fires a projectile and resets its cooldown at full power', () => {
    const { world } = freshGame(100000);
    // Phase 4d: an active Reactor covers this one tower's consumption, so
    // powerFactor() is 1 and the cooldown is the plain 1/fireRate value.
    const reactor = world.buildRoom('reactor', 0, 0);
    finishBuild(reactor);
    const tower = world.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE);
    const enemy = new Enemy(AWAY_FROM_BASE + 10, AWAY_FROM_BASE, 0, 0);
    world.enemies.push(enemy);

    updateCombat(world, 0.016);

    assert.equal(world.projectiles.length, 1);
    assert.equal(world.projectiles[0].target, enemy);
    assert.equal(world.powerFactor(), 1, 'sanity: a tier-1 reactor covers one tier-1 tower, no brownout');
    assert.ok(Math.abs(tower.cooldown - 1 / tower.fireRate) < 1e-9);
  });

  test('a tower does not fire when nothing is inside its range', () => {
    const { world } = freshGame(CONFIG.TOWER_COST);
    world.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE);
    const farEnemy = new Enemy(AWAY_FROM_BASE + CONFIG.TOWER_RANGE + 500, AWAY_FROM_BASE, 0, 0);
    world.enemies.push(farEnemy);

    updateCombat(world, 0.016);

    assert.equal(world.projectiles.length, 0);
  });

  test('a tower on cooldown does not re-fire even with a target in range', () => {
    const { world } = freshGame(CONFIG.TOWER_COST);
    const tower = world.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE);
    world.enemies.push(new Enemy(AWAY_FROM_BASE + 10, AWAY_FROM_BASE, 0, 0));

    updateCombat(world, 0.016); // first shot, sets cooldown
    const projectileCountAfterFirst = world.projectiles.length;
    updateCombat(world, 0.016); // still on cooldown

    assert.equal(world.projectiles.length, projectileCountAfterFirst, 'no second projectile while on cooldown');
  });
});

describe('combat: Energy System brownout (Phase 4d)', () => {
  test('a brownout (no Reactor built) stretches a tower\'s cooldown past 1/fireRate without touching damage', () => {
    const { world } = freshGame(CONFIG.TOWER_COST);
    const tower = world.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE); // no Reactor -> supply 0 -> brownout
    const enemy = new Enemy(AWAY_FROM_BASE + 10, AWAY_FROM_BASE, 0, 0);
    world.enemies.push(enemy);

    updateCombat(world, 0.016);

    assert.equal(world.projectiles.length, 1, 'a brownout throttles fire rate, it does not stop firing entirely');
    assert.equal(world.projectiles[0].damage, tower.damage, 'brownout affects cooldown only, never damage');
    assert.ok(tower.cooldown > 1 / tower.fireRate, 'cooldown is stretched past the full-power value');
    assert.ok(Math.abs(tower.cooldown - 1 / (tower.fireRate * CONFIG.BROWNOUT_MIN_FIRE_RATE_MULT)) < 1e-9);
  });
});

describe('combat: Projectile', () => {
  test('deals its damage to the target on arrival, then marks itself dead', () => {
    const enemy = new Enemy(0, 0, 0, 0);
    enemy.x = 100; enemy.y = 0;
    const projectile = new Projectile(0, 0, enemy, 25);
    const healthBefore = enemy.health;

    projectile.update(1); // PROJECTILE_SPEED(500) * 1s >> 100 distance, arrives this step

    assert.equal(healthBefore - enemy.health, 25);
    assert.equal(projectile.dead, true);
  });

  test('dies harmlessly if its target died or reached the base first', () => {
    const enemy = new Enemy(100, 0, 0, 0);
    enemy.reachedTarget = true;
    const projectile = new Projectile(0, 0, enemy, 25);
    const healthBefore = enemy.health;

    projectile.update(1);

    assert.equal(enemy.health, healthBefore, 'no damage dealt to an enemy that already reached the base');
    assert.equal(projectile.dead, true);
  });
});

describe('combat: base damage & Shield', () => {
  test('an enemy that reaches the base deals ENEMY_BASE_DAMAGE exactly once (hasHitBase guard)', () => {
    const { world } = freshGame(0);
    const enemy = new Enemy(0, 0, 0, 0);
    enemy.reachedTarget = true;
    world.enemies.push(enemy);

    const healthAfterFirstHit = world.base.maxHealth - CONFIG.ENEMY_BASE_DAMAGE;
    updateCombat(world, 0.016);
    assert.equal(world.base.health, healthAfterFirstHit);

    updateCombat(world, 0.016); // same enemy, still in world.enemies (nothing removed it here)
    assert.equal(world.base.health, healthAfterFirstHit, 'hasHitBase prevented a second hit');
  });

  test('an active Shield room reduces base damage by exactly its shieldPct', () => {
    const { world, commandCore } = freshGame(100000);
    commandCore.research = 1000;
    commandCore.unlockTech('factoryAccess');
    commandCore.unlockTech('shieldAccess');
    const shield = world.buildRoom('shield', 0, 0);
    finishBuild(shield);

    const enemy = new Enemy(0, 0, 0, 0);
    enemy.reachedTarget = true;
    world.enemies.push(enemy);

    const healthBefore = world.base.health;
    updateCombat(world, 0.016);
    const dmgTaken = healthBefore - world.base.health;
    const expected = CONFIG.ENEMY_BASE_DAMAGE * (1 - commandCore.totals().shieldPct);
    assert.ok(Math.abs(dmgTaken - expected) < 1e-9);
    assert.ok(dmgTaken < CONFIG.ENEMY_BASE_DAMAGE, 'Shield actually reduced the raw damage');
  });
});

describe('combat: Hangar drones', () => {
  test('an active Hangar deals dronePower * dt to the enemy closest to the base every frame, with no Hangar built at all', () => {
    const { world } = freshGame(0);
    const enemy = new Enemy(50, 0, 0, 0);
    world.enemies.push(enemy);
    const healthBefore = enemy.health;

    updateCombat(world, 1.0);

    assert.equal(enemy.health, healthBefore, 'no drone damage with no Hangar built');
  });

  test('an active Hangar damages the closest live enemy by dronePower * dt', () => {
    const { world, commandCore } = freshGame(100000);
    commandCore.research = 1000;
    commandCore.unlockTech('factoryAccess');
    commandCore.unlockTech('hangarAccess');
    const hangar = world.buildRoom('hangar', 0, 0);
    finishBuild(hangar);

    const near = new Enemy(50, 0, 9999, 9999);
    const far = new Enemy(500, 0, 9999, 9999);
    world.enemies.push(far, near);

    const nearHealthBefore = near.health;
    const farHealthBefore = far.health;
    updateCombat(world, 1.0);

    const dronePower = commandCore.totals().dronePower;
    assert.ok(Math.abs((nearHealthBefore - near.health) - dronePower) < 1e-9, 'closest enemy takes drone damage');
    assert.equal(far.health, farHealthBefore, 'farther enemy untouched');
  });
});
