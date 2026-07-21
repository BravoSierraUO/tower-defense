import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { ENEMY_CLASSES } from '../js/enemyClasses.js';
import { Spawner } from '../js/spawner.js';
import { freshGame } from './helpers.mjs';

describe('Phase 15: enemy-class registry', () => {
  test('one entry per CONFIG.DIFFICULTY_TIERS key, no more, no less', () => {
    const tierIds = Object.keys(CONFIG.DIFFICULTY_TIERS).sort();
    const classIds = ENEMY_CLASSES.map(c => c.id).sort();
    assert.deepEqual(classIds, tierIds, 'ENEMY_CLASSES ids must exactly match DIFFICULTY_TIERS keys');
  });

  test('no duplicate ids, every shape is a known one', () => {
    const ids = ENEMY_CLASSES.map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate class ids');
    for (const c of ENEMY_CLASSES) {
      assert.ok(['circle', 'square', 'triangle'].includes(c.shape), `${c.id} has a known shape`);
      assert.ok(c.name && c.description, `${c.id} has a name and description`);
    }
  });
});

describe('Phase 15: tierId threaded through spawning', () => {
  test('World.spawnEnemy() defaults tierId to null when called with no args (backward compat)', () => {
    const { world } = freshGame(1000);
    const enemy = world.spawnEnemy();
    assert.equal(enemy.tierId, null);
  });

  test('Spawner.pickTier() returns an id matching a real ENEMY_CLASSES entry', () => {
    const spawner = new Spawner();
    spawner.waveNumber = CONFIG.DIFFICULTY_TIERS.hard.unlockWave;
    const seen = new Set();
    for (let i = 0; i < 100; i++) seen.add(spawner.pickTier().id);
    for (const id of seen) {
      assert.ok(ENEMY_CLASSES.some(c => c.id === id), `${id} has a matching ENEMY_CLASSES entry`);
    }
  });

  test('a real wave-spawned enemy carries a valid tierId end to end', () => {
    const { world } = freshGame(1000);
    world.spawner.waveNumber = 1;
    const tier = world.spawner.pickTier();
    const enemy = world.spawnEnemy(tier.healthMult, tier.speedMult, world.spawner.pickArmorType(), tier.id);
    assert.equal(enemy.tierId, 'easy', 'only easy is unlocked at wave 1');
    assert.ok(ENEMY_CLASSES.some(c => c.id === enemy.tierId));
  });
});
