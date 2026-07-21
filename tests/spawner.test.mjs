import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { Spawner } from '../js/spawner.js';
import { freshGame } from './helpers.mjs';

describe('Spawner: idle wave loop (Phase 8a)', () => {
  test('starts idle and only moves to spawning via triggerWave()', () => {
    const spawner = new Spawner();
    const { world } = freshGame(0);
    assert.equal(spawner.state, 'idle');
    assert.equal(spawner.canTriggerWave(), true);

    spawner.update(999, world); // idle never auto-advances, no matter how much time passes
    assert.equal(spawner.state, 'idle');
    assert.equal(spawner.waveNumber, 0);

    assert.equal(spawner.triggerWave(), true);
    assert.equal(spawner.state, 'spawning');
    assert.equal(spawner.waveNumber, 1);
    assert.equal(spawner.enemiesToSpawn, CONFIG.WAVE_BASE_ENEMIES);
  });

  test('triggerWave() is a no-op outside idle', () => {
    const spawner = new Spawner();
    spawner.triggerWave();
    assert.equal(spawner.state, 'spawning');
    assert.equal(spawner.triggerWave(), false, 'already spawning — cannot re-trigger');
    assert.equal(spawner.waveNumber, 1, 'wave number did not advance a second time');
  });

  test('enemiesToSpawn grows by WAVE_ENEMY_GROWTH per wave', () => {
    const spawner = new Spawner();
    spawner.startWave(5, false);
    assert.equal(spawner.waveNumber, 5);
    assert.equal(spawner.maxWave, 5, 'a non-replay startWave() advances the progress frontier');
    assert.equal(spawner.enemiesToSpawn, CONFIG.WAVE_BASE_ENEMIES + 4 * CONFIG.WAVE_ENEMY_GROWTH);
  });

  test('spawns exactly enemiesToSpawn enemies, one per ENEMY_SPAWN_INTERVAL, then goes active', () => {
    const spawner = new Spawner();
    const { world } = freshGame(0);
    spawner.triggerWave();
    const total = spawner.enemiesToSpawn;

    for (let i = 0; i < total; i++) {
      spawner.update(CONFIG.ENEMY_SPAWN_INTERVAL + 0.001, world);
    }

    assert.equal(world.enemies.length, total);
    assert.equal(spawner.state, 'active');
    assert.equal(
      spawner.waveValueTotal,
      world.enemies.reduce((sum, e) => sum + e.maxHealth, 0),
      'every spawned enemy\'s maxHealth is tallied into waveValueTotal'
    );
  });

  test('a full clear (100% killed) pays the full salvage bundle and counts as a real clear', () => {
    const spawner = new Spawner();
    const { world } = freshGame(0);
    spawner.waveNumber = 1;
    spawner.state = 'active';
    spawner.waveValueTotal = 100;
    spawner.waveValueKilled = 100; // simulates every spawned enemy having died
    // world.enemies is already empty — simulates the last enemy having just died/reached base

    spawner.update(0.016, world);

    const expectedGold = Math.round((CONFIG.WAVE_CLEAR_BONUS_BASE + 0 * CONFIG.WAVE_CLEAR_BONUS_GROWTH) * world.rewardMultiplier());
    const expectedMetal = Math.round(CONFIG.WAVE_CLEAR_METAL_BASE + 0 * CONFIG.WAVE_CLEAR_METAL_GROWTH);
    assert.equal(world.gold, expectedGold);
    assert.equal(world.metal, expectedMetal);
    assert.equal(world.moduleCharges, CONFIG.WAVE_CLEAR_MODULE_CHARGE);
    assert.equal(world.productionParts, CONFIG.WAVE_CLEAR_PRODUCTION_PARTS);
    assert.equal(spawner.wavesCleared, 1);
    assert.equal(spawner.lastChestTier, null);
    assert.equal(spawner.state, 'idle', 'returns to idle, waiting on the next triggerWave()');
  });

  test('a wipe (base destroyed mid-wave) pays a chest scaled by % killed, heals the base, and does not count as a clear', () => {
    const spawner = new Spawner();
    const { world } = freshGame(0);
    spawner.waveNumber = 1;
    spawner.state = 'active';
    spawner.waveValueTotal = 100;
    spawner.waveValueKilled = 50; // 50% — lands in the silver tier (minPct 0.34)
    world.base.health = 0; // destroyed

    spawner.update(0.016, world);

    const silver = CONFIG.WIPE_CHEST_TIERS.find(t => t.id === 'silver');
    const expectedGold = Math.round(CONFIG.WAVE_CLEAR_BONUS_BASE * silver.mult * world.rewardMultiplier());
    const expectedMetal = Math.round(CONFIG.WAVE_CLEAR_METAL_BASE * silver.mult);
    assert.equal(world.gold, expectedGold);
    assert.equal(world.metal, expectedMetal);
    assert.equal(world.moduleCharges, 0, 'no salvage tokens on a wipe, only on a full clear');
    assert.equal(world.productionParts, 0);
    assert.equal(spawner.lastChestTier, 'silver');
    assert.equal(spawner.wavesCleared, 0, 'a wipe never counts as a true clear');
    assert.equal(world.base.health, world.base.maxHealth, 'base heals back to full — a wipe costs the chest tier, not the run');
    assert.equal(spawner.state, 'idle');
  });

  test('a near-total wipe (0% killed) still floors at the bronze chest tier', () => {
    const spawner = new Spawner();
    const { world } = freshGame(0);
    spawner.waveNumber = 1;
    spawner.state = 'active';
    spawner.waveValueTotal = 100;
    spawner.waveValueKilled = 0;
    world.base.health = 0;

    spawner.update(0.016, world);

    assert.equal(spawner.lastChestTier, 'bronze');
    assert.ok(world.gold > 0, 'bronze still pays something, not zero');
  });

  test('completes instead of looping once MAX_WAVES is cleared', () => {
    const spawner = new Spawner();
    const { world } = freshGame(0);
    spawner.waveNumber = CONFIG.MAX_WAVES;
    spawner.state = 'active';

    spawner.update(0.016, world);

    assert.equal(spawner.complete, true);
    assert.equal(spawner.state, 'active', 'state is left as-is once complete — finalizeWave() only sets it in the non-complete branch');
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
      const tier = spawner.pickTier();
      assert.equal(tier.id, 'easy', 'only easy is unlocked at wave 1');
      assert.equal(tier.healthMult, CONFIG.DIFFICULTY_TIERS.easy.healthMult, 'still carries the real tier\'s stats');
    }
  });

  test('pickTier can offer harder tiers once their unlockWave is reached', () => {
    const spawner = new Spawner();
    spawner.waveNumber = CONFIG.DIFFICULTY_TIERS.hard.unlockWave;
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(spawner.pickTier().id);
    assert.ok(seen.has('hard'), 'hard tier turns up once unlocked (weighted random over 200 rolls)');
  });
});

describe('Spawner: wave replay (farm an old wave without touching progress)', () => {
  test('triggerReplay() refuses a wave never reached', () => {
    const spawner = new Spawner();
    assert.equal(spawner.triggerReplay(1), false, 'maxWave is still 0 — wave 1 has never been reached');
    assert.equal(spawner.state, 'idle');
  });

  test('triggerReplay() re-fights an already-reached wave without advancing maxWave', () => {
    const spawner = new Spawner();
    spawner.triggerWave(); // wave 1
    spawner.startWave(2, false); // simulate having pushed on to wave 2 (maxWave now 2)
    spawner.state = 'idle'; // back at idle between waves, same as after a real finalizeWave()
    assert.equal(spawner.maxWave, 2);

    assert.equal(spawner.triggerReplay(1), true);
    assert.equal(spawner.waveNumber, 1, 'the active wave is the replayed one');
    assert.equal(spawner.maxWave, 2, 'progress frontier is untouched by a replay');
    assert.equal(spawner.isReplay, true);
  });

  test('triggerReplay() refuses a wave beyond maxWave (can\'t skip ahead)', () => {
    const spawner = new Spawner();
    spawner.triggerWave(); // maxWave = 1
    assert.equal(spawner.triggerReplay(2), false, 'wave 2 has not been reached yet');
  });

  test('a replay clear pays that wave\'s own (lower) reward scale and does not bump wavesCleared', () => {
    const spawner = new Spawner();
    const { world } = freshGame(0);
    spawner.triggerWave(); // wave 1
    spawner.startWave(5, false); // now at wave 5 (maxWave = 5)
    spawner.state = 'idle';
    spawner.triggerReplay(1); // farm the cheaper wave 1 instead
    spawner.state = 'active';
    spawner.waveValueTotal = 100;
    spawner.waveValueKilled = 100;

    spawner.update(0.016, world);

    const expectedGold = Math.round(CONFIG.WAVE_CLEAR_BONUS_BASE * world.rewardMultiplier()); // wave-1 scale, not wave-5
    assert.equal(world.gold, expectedGold);
    assert.equal(spawner.wavesCleared, 0, 'a replay clear is reward-only — it never feeds profile/achievement progress');
    assert.equal(spawner.maxWave, 5, 'progress frontier still untouched after the replay resolves');
    assert.equal(spawner.state, 'idle');
  });

  test('a replayed wave can never itself trip MAX_WAVES completion', () => {
    const spawner = new Spawner();
    const { world } = freshGame(0);
    spawner.maxWave = CONFIG.MAX_WAVES;
    spawner.complete = false; // hasn't been marked complete yet in this scenario
    spawner.triggerReplay(CONFIG.MAX_WAVES);
    spawner.state = 'active';

    spawner.update(0.016, world);

    assert.equal(spawner.complete, false, 'only a non-replay finalize can set complete');
  });
});
