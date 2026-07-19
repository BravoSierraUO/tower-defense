import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { Spawner } from '../js/spawner.js';
import { freshGame } from './helpers.mjs';

describe('Spawner: wave state machine', () => {
  test('starts in countdown and moves to spawning once WAVE_START_DELAY elapses', () => {
    const spawner = new Spawner();
    const { world } = freshGame(0);
    assert.equal(spawner.state, 'countdown');
    spawner.update(CONFIG.WAVE_START_DELAY + 0.01, world);
    assert.equal(spawner.state, 'spawning');
    assert.equal(spawner.waveNumber, 1);
    assert.equal(spawner.enemiesToSpawn, CONFIG.WAVE_BASE_ENEMIES);
  });

  test('enemiesToSpawn grows by WAVE_ENEMY_GROWTH per wave', () => {
    const spawner = new Spawner();
    spawner.waveNumber = 4;
    spawner.startNextWave();
    assert.equal(spawner.waveNumber, 5);
    assert.equal(spawner.enemiesToSpawn, CONFIG.WAVE_BASE_ENEMIES + 4 * CONFIG.WAVE_ENEMY_GROWTH);
  });

  test('spawns exactly enemiesToSpawn enemies, one per ENEMY_SPAWN_INTERVAL, then goes active', () => {
    const spawner = new Spawner();
    const { world } = freshGame(0);
    spawner.startNextWave();
    const total = spawner.enemiesToSpawn;

    for (let i = 0; i < total; i++) {
      spawner.update(CONFIG.ENEMY_SPAWN_INTERVAL + 0.001, world);
    }

    assert.equal(world.enemies.length, total);
    assert.equal(spawner.state, 'active');
  });

  test('active -> countdown once all enemies are cleared, awarding the wave-clear bonus', () => {
    const spawner = new Spawner();
    const { world } = freshGame(0);
    spawner.waveNumber = 1;
    spawner.state = 'active';
    // world.enemies is already empty — simulates the last enemy having just died/reached base

    spawner.update(0.016, world);

    const expectedBonus = Math.round(
      (CONFIG.WAVE_CLEAR_BONUS_BASE + 0 * CONFIG.WAVE_CLEAR_BONUS_GROWTH) * world.rewardMultiplier()
    );
    assert.equal(world.gold, expectedBonus);
    assert.equal(spawner.state, 'countdown');
    assert.equal(spawner.timer, CONFIG.WAVE_INTERVAL);
  });

  test('completes instead of looping once MAX_WAVES is cleared', () => {
    const spawner = new Spawner();
    const { world } = freshGame(0);
    spawner.waveNumber = CONFIG.MAX_WAVES;
    spawner.state = 'active';

    spawner.update(0.016, world);

    assert.equal(spawner.complete, true);
    assert.equal(spawner.state, 'active', 'state is left as-is once complete — update() short-circuits on spawner.complete');
  });

  test('a completed spawner ignores further update() calls entirely', () => {
    const spawner = new Spawner();
    const { world } = freshGame(0);
    spawner.complete = true;
    spawner.waveNumber = CONFIG.MAX_WAVES;
    const goldBefore = world.gold;

    spawner.update(999, world);

    assert.equal(world.gold, goldBefore, 'no wave-clear bonus re-awarded after completion');
  });

  test('pickTier only offers tiers unlocked at the current wave number', () => {
    const spawner = new Spawner();
    spawner.waveNumber = 1; // below medium/hard unlockWave
    for (let i = 0; i < 50; i++) {
      assert.equal(spawner.pickTier(), CONFIG.DIFFICULTY_TIERS.easy, 'only easy is unlocked at wave 1');
    }
  });

  test('pickTier can offer harder tiers once their unlockWave is reached', () => {
    const spawner = new Spawner();
    spawner.waveNumber = CONFIG.DIFFICULTY_TIERS.hard.unlockWave;
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(spawner.pickTier());
    assert.ok(seen.has(CONFIG.DIFFICULTY_TIERS.hard), 'hard tier turns up once unlocked (weighted random over 200 rolls)');
  });
});
