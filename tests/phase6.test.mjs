import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { Tower } from '../js/tower.js';
import { Enemy } from '../js/enemy.js';
import { freshGame } from './helpers.mjs';

function unlockComms(commandCore) {
  commandCore.research = 9999;
  commandCore.unlockTech('commsAccess');
}

describe('Phase 6: commsAccess gate', () => {
  test('an ability cannot be used before commsAccess is unlocked, even off cooldown', () => {
    const { world } = freshGame(100000);
    assert.equal(world.canUseAbility('supplyDrop'), false);
    assert.equal(world.useAbility('supplyDrop'), false);
    assert.equal(world.gold, 100000, 'no effect applied — the gold amount is untouched');
  });

  test('unlocking commsAccess makes every ability usable (all start off cooldown)', () => {
    const { world, commandCore } = freshGame(100000);
    unlockComms(commandCore);
    for (const ability of CONFIG.ABILITIES) assert.equal(world.canUseAbility(ability.id), true, ability.id);
  });
});

describe('Phase 6: ability cooldowns', () => {
  test('useAbility() sets the cooldown, canUseAbility() goes false until it drains', () => {
    const { world, commandCore } = freshGame(100000);
    unlockComms(commandCore);

    assert.equal(world.useAbility('supplyDrop'), true);
    assert.equal(world.canUseAbility('supplyDrop'), false);
    assert.equal(world.abilityCooldowns.supplyDrop, CONFIG.ABILITIES.find(a => a.id === 'supplyDrop').cooldown);

    world.updateAbilities(9999); // way past any real cooldown
    assert.equal(world.abilityCooldowns.supplyDrop, 0);
    assert.equal(world.canUseAbility('supplyDrop'), true);
  });

  test('cooldowns tick independently per ability', () => {
    const { world, commandCore } = freshGame(100000);
    unlockComms(commandCore);
    world.useAbility('emp');
    assert.equal(world.abilityCooldowns.orbitalLaser, 0, 'using one ability does not touch another\'s cooldown');
  });

  test('a second useAbility() call while on cooldown is a no-op', () => {
    const { world, commandCore } = freshGame(100000);
    unlockComms(commandCore);
    world.useAbility('supplyDrop');
    const goldAfterFirst = world.gold;
    assert.equal(world.useAbility('supplyDrop'), false);
    assert.equal(world.gold, goldAfterFirst, 'second call paid nothing — still on cooldown');
  });
});

describe('Phase 6: ability effects', () => {
  test('EMP slows every live, still-en-route enemy for its duration, leaves arrived ones alone', () => {
    const { world, commandCore } = freshGame(100000);
    unlockComms(commandCore);
    const enemy = new Enemy(0, 0, 100, 0);
    const arrived = new Enemy(0, 0, 100, 0);
    arrived.reachedTarget = true;
    world.enemies.push(enemy, arrived);

    world.useAbility('emp');
    const def = CONFIG.ABILITIES.find(a => a.id === 'emp');
    assert.equal(enemy.slowTimer, def.duration);
    assert.equal(enemy.effectiveSpeed(), enemy.speed * def.slowMult);
    assert.equal(arrived.slowTimer, 0, 'an enemy that already reached its target is untouched');
  });

  test('Orbital Laser deals flat damage to every live enemy, feeding the normal kill/reward path', () => {
    const { world, commandCore } = freshGame(0);
    unlockComms(commandCore);
    const def = CONFIG.ABILITIES.find(a => a.id === 'orbitalLaser');
    const weak = new Enemy(0, 0, 100, 0);
    weak.health = 1; // lethal
    const tough = new Enemy(0, 0, 100, 0);
    tough.health = def.damage + 50; // survives
    world.enemies.push(weak, tough);

    world.useAbility('orbitalLaser');
    assert.equal(tough.health, 50, 'flat damage applied directly, no armor-type multiplier');
    world.updateEnemies(0.016); // the ordinary cleanup/reward loop, unmodified by the ability
    assert.equal(world.enemies.includes(weak), false, 'a killed-by-laser enemy is removed exactly like any other kill');
    assert.equal(world.kills, 1);
    assert.ok(world.gold > 0, 'the normal per-kill gold payout still fired');
  });

  test('Supply Drop grants flat gold + metal, capped at the pool ceilings', () => {
    const { world, commandCore } = freshGame(0);
    unlockComms(commandCore);
    const def = CONFIG.ABILITIES.find(a => a.id === 'supplyDrop');
    world.useAbility('supplyDrop');
    assert.equal(world.gold, Math.min(def.gold, world.goldCap()));
    assert.equal(world.metal, Math.min(def.metal, world.metalCap()));
  });

  test('Drone Repair heals every Tower/Scavenger by healPct of missing health, never past maxHealth', () => {
    const { world, commandCore } = freshGame(100000);
    unlockComms(commandCore);
    const def = CONFIG.ABILITIES.find(a => a.id === 'droneRepair');
    const tower = world.placeTower(200, 200);
    tower.takeDamage(tower.maxHealth - 1); // 1 hp left
    const fullHealthTower = world.placeTower(400, 400); // already full — should stay put, not overheal

    world.useAbility('droneRepair');
    assert.equal(tower.health, Math.min(tower.maxHealth, 1 + tower.maxHealth * def.healPct));
    assert.equal(fullHealthTower.health, fullHealthTower.maxHealth);
  });

  test('Satellite Recall clears attackTarget on every aggro\'d enemy and redirects it to the base', () => {
    const { world, commandCore } = freshGame(100000);
    unlockComms(commandCore);
    const tower = new Tower(150, 0);
    world.towers.push(tower);
    const aggroed = new Enemy(0, 0, tower.x, tower.y, 1, 1, null, tower);
    const baseBound = new Enemy(0, 0, world.base.x, world.base.y);
    world.enemies.push(aggroed, baseBound);

    world.useAbility('satelliteRecall');
    assert.equal(aggroed.attackTarget, null);
    assert.equal(aggroed.targetX, world.base.x);
    assert.equal(aggroed.targetY, world.base.y);
    assert.equal(baseBound.attackTarget, null, 'was already base-bound, recall is a no-op for it');
  });
});
