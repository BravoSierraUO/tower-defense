import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { Tower } from '../js/tower.js';
import { ScavengerTurret } from '../js/scavenger.js';
import { Enemy } from '../js/enemy.js';
import { updateCombat } from '../js/combat.js';
import { freshGame } from './helpers.mjs';

const AWAY_FROM_BASE = 200;

describe('Phase 7d: Tower/Scavenger health', () => {
  test('a fresh Tower starts at full CONFIG.TOWER_HEALTH-scaled health', () => {
    const { world } = freshGame(100000);
    const tower = world.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE);
    assert.equal(tower.maxHealth, CONFIG.TOWER_HEALTH * CONFIG.TOWER_TIERS[0].healthMult);
    assert.equal(tower.health, tower.maxHealth);
  });

  test('takeDamage() floors at 0 and isDestroyed() flips once it does', () => {
    const tower = new Tower(0, 0);
    tower.takeDamage(tower.maxHealth - 1);
    assert.equal(tower.isDestroyed(), false);

    tower.takeDamage(9999);
    assert.equal(tower.health, 0);
    assert.equal(tower.isDestroyed(), true);
  });

  test('upgrading a damaged Tower fully heals it (bigger cap, repaired to full)', () => {
    const { world } = freshGame(100000);
    const tower = world.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE);
    tower.takeDamage(10);
    assert.ok(tower.health < tower.maxHealth);

    world.upgradeTower(tower);
    assert.equal(tower.tier, 2);
    assert.equal(tower.maxHealth, CONFIG.TOWER_HEALTH * CONFIG.TOWER_TIERS[1].healthMult);
    assert.equal(tower.health, tower.maxHealth, 'upgrade repairs, does not just raise the cap');
  });

  test('a ScavengerTurret has its own (more fragile) health curve', () => {
    const { world } = freshGame(100000);
    const scavenger = world.placeScavenger(100, 100); // Phase 16: scavengers live inside the base ring now
    assert.equal(scavenger.maxHealth, CONFIG.SCAVENGER_HEALTH * CONFIG.SCAVENGER_TIERS[0].healthMult);
    assert.ok(CONFIG.SCAVENGER_HEALTH < CONFIG.TOWER_HEALTH, 'sanity: Scavenger is the more fragile placeable tier-for-tier');

    scavenger.takeDamage(9999);
    assert.equal(scavenger.isDestroyed(), true);
  });
});

describe('Phase 7d: World.pickAggroTarget()', () => {
  test('never aggroes onto an empty field, no matter how many rolls', () => {
    const { world } = freshGame(0);
    for (let i = 0; i < 500; i++) {
      assert.equal(world.pickAggroTarget(0, 0), null);
    }
  });

  test('over many rolls, aggroes roughly ENEMY_AGGRO_CHANCE of the time and always picks the nearer candidate', () => {
    const { world } = freshGame(100000);
    const near = world.placeTower(200, 0);
    const far = world.placeTower(900, 0);
    const spawnX = 0, spawnY = 0; // near is closer to the spawn point than far

    let aggroCount = 0;
    for (let i = 0; i < 5000; i++) {
      const target = world.pickAggroTarget(spawnX, spawnY);
      if (target) {
        aggroCount++;
        assert.equal(target, near, 'the nearer candidate is always picked on an aggro hit');
      }
    }
    const rate = aggroCount / 5000;
    assert.ok(Math.abs(rate - CONFIG.ENEMY_AGGRO_CHANCE) < 0.03, `aggro rate ${rate} should track ENEMY_AGGRO_CHANCE (${CONFIG.ENEMY_AGGRO_CHANCE})`);
  });

  test('spawnEnemy() wires an aggro hit into a real Enemy: attackTarget set, targetX/Y at the turret', () => {
    const { world } = freshGame(100000);
    const tower = world.placeTower(200, 0);

    let aggroedEnemy = null;
    for (let i = 0; i < 500 && !aggroedEnemy; i++) {
      const enemy = world.spawnEnemy();
      if (enemy.attackTarget) aggroedEnemy = enemy;
    }
    assert.ok(aggroedEnemy, 'sanity: at least one of 500 spawns aggroed with a single tower on the field');
    assert.equal(aggroedEnemy.attackTarget, tower);
    assert.equal(aggroedEnemy.targetX, tower.x);
    assert.equal(aggroedEnemy.targetY, tower.y);
  });
});

describe('Phase 7d: combat resolution — aggro\'d enemies hit their turret, not the base', () => {
  test('an aggro\'d enemy that reaches its target damages the turret, leaves the base untouched', () => {
    const { world } = freshGame(0);
    const tower = new Tower(50, 50);
    world.towers.push(tower);
    const enemy = new Enemy(50, 50, tower.x, tower.y, 1, 1, null, tower);
    enemy.reachedTarget = true;
    world.enemies.push(enemy);

    const baseHealthBefore = world.base.health;
    const towerHealthBefore = tower.health;
    updateCombat(world, 0.016);

    assert.equal(world.base.health, baseHealthBefore, 'base takes no damage from a turret-bound enemy');
    assert.equal(towerHealthBefore - tower.health, CONFIG.ENEMY_BASE_DAMAGE);
  });

  test('a turret destroyed by an aggro\'d enemy is removed from world.towers — a real loss, no sell refund', () => {
    const { world } = freshGame(0);
    const tower = new Tower(50, 50);
    tower.health = CONFIG.ENEMY_BASE_DAMAGE; // exactly lethal on one contact hit
    world.towers.push(tower);
    const enemy = new Enemy(50, 50, tower.x, tower.y, 1, 1, null, tower);
    enemy.reachedTarget = true;
    world.enemies.push(enemy);

    const metalBefore = world.metal;
    updateCombat(world, 0.016);

    assert.equal(world.towers.includes(tower), false);
    assert.equal(world.metal, metalBefore, 'destruction pays no sell-style refund');
  });

  test('the hasHitTarget guard prevents a second contact hit on the same enemy', () => {
    const { world } = freshGame(0);
    const tower = new Tower(50, 50);
    world.towers.push(tower);
    const enemy = new Enemy(50, 50, tower.x, tower.y, 1, 1, null, tower);
    enemy.reachedTarget = true;
    world.enemies.push(enemy);

    updateCombat(world, 0.016);
    const healthAfterFirstHit = tower.health;
    updateCombat(world, 0.016); // same enemy, still in world.enemies

    assert.equal(tower.health, healthAfterFirstHit, 'hasHitTarget prevented a second hit');
  });
});

describe('Phase 7d: defender\'s bonus reward', () => {
  // Two separate fresh worlds (rather than two kills in one) so each kill is the
  // first of its world's combo streak — same rewardMultiplier() for both, isolating
  // the defender's-bonus delta from Phase 4b's combo-stacking bonus.
  test('killing an enemy that was aggro\'d on a turret pays extra gold + metal beyond a normal kill', () => {
    const { world: plainWorld } = freshGame(0);
    const plainEnemy = new Enemy(0, 0, 0, 0);
    plainEnemy.health = 0;
    plainWorld.enemies.push(plainEnemy);
    plainWorld.updateEnemies(0.016);

    const { world: aggroWorld } = freshGame(0);
    const tower = new Tower(50, 50);
    const aggroedEnemy = new Enemy(0, 0, tower.x, tower.y, 1, 1, null, tower);
    aggroedEnemy.health = 0;
    aggroWorld.enemies.push(aggroedEnemy);
    aggroWorld.updateEnemies(0.016);

    assert.equal(plainWorld.metal, 0, 'a normal kill pays no metal at all');
    assert.equal(aggroWorld.metal, Math.round(aggroedEnemy.maxHealth * CONFIG.DEFENDER_BONUS_METAL_PER_ENEMY_HEALTH), 'aggro kill pays the defender metal bonus');

    const expectedBonusGold = Math.round(aggroedEnemy.maxHealth * CONFIG.GOLD_PER_ENEMY_HEALTH * CONFIG.DEFENDER_BONUS_GOLD_MULT * aggroWorld.rewardMultiplier());
    assert.equal(aggroWorld.gold - plainWorld.gold, expectedBonusGold, 'aggro kill pays the same base gold plus the defender bonus on top');
  });
});
