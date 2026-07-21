import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, MissionTracker } from '../js/missions.js';

describe('MissionTracker (Phase 8b)', () => {
  test('starts with the first mission current and nothing completed', () => {
    const t = new MissionTracker();
    assert.equal(t.isDone(), false);
    assert.equal(t.current().id, MISSIONS[0].id);
  });

  test('a satisfied check completes that mission and advances current() to the next one', () => {
    const t = new MissionTracker();
    t.update({ towersPlaced: 1, scavengersPlaced: 0, waveNumber: 0, roomsBuilt: 1, view: 'field' });
    assert.equal(t.completed.has(MISSIONS[0].id), true);
    assert.equal(t.current().id, MISSIONS[1].id);
  });

  test('stays completed even if the underlying state later regresses (sticky, like achievements)', () => {
    const t = new MissionTracker();
    t.update({ towersPlaced: 1, scavengersPlaced: 0, waveNumber: 0, roomsBuilt: 1, view: 'field' });
    t.update({ towersPlaced: 0, scavengersPlaced: 0, waveNumber: 0, roomsBuilt: 1, view: 'field' }); // e.g. the tower got sold
    assert.equal(t.completed.has(MISSIONS[0].id), true, 'still counts once earned');
    assert.equal(t.current().id, MISSIONS[1].id);
  });

  test('a check throwing an error is treated as false, not a crash', () => {
    const t = new MissionTracker();
    t.update({}); // missing every field the checks read off of
    assert.equal(t.isDone(), false);
    assert.equal(t.current().id, MISSIONS[0].id);
  });

  test('isDone() flips true once every mission is satisfied in one pass', () => {
    const t = new MissionTracker();
    t.update({ towersPlaced: 1, scavengersPlaced: 1, waveNumber: 1, roomsBuilt: 2, view: 'core' });
    assert.equal(t.isDone(), true);
    assert.equal(t.current(), null);
  });

  test('current() always returns the earliest unmet mission, even if a later one is independently satisfied', () => {
    const t = new MissionTracker();
    // Only the LAST mission's condition is true — checks are independent (no prereq chain),
    // so it completes on its own, but current() should still surface mission #1 as next-up.
    t.update({ towersPlaced: 0, scavengersPlaced: 0, waveNumber: 0, roomsBuilt: 2, view: 'field' });
    assert.equal(t.completed.has(MISSIONS[4].id), true); // build-room (roomsBuilt>=2), the last in the chain
    assert.equal(t.completed.has(MISSIONS[0].id), false);
    assert.equal(t.current().id, MISSIONS[0].id);
  });

  test('update() returns exactly the missions that newly completed this call, empty otherwise', () => {
    const t = new MissionTracker();
    const first = t.update({ towersPlaced: 1, scavengersPlaced: 0, waveNumber: 0, roomsBuilt: 1, view: 'field' });
    assert.deepEqual(first.map(m => m.id), [MISSIONS[0].id]);

    const second = t.update({ towersPlaced: 1, scavengersPlaced: 0, waveNumber: 0, roomsBuilt: 1, view: 'field' }); // nothing new
    assert.deepEqual(second, []);
  });

  test('track() overrides current() to the picked mission, but only while it stays unmet', () => {
    const t = new MissionTracker();
    t.track(MISSIONS[3].id); // open-core
    assert.equal(t.current().id, MISSIONS[3].id, 'tracked pick wins over the earliest-unmet default');

    t.update({ towersPlaced: 0, scavengersPlaced: 0, waveNumber: 0, roomsBuilt: 0, view: 'core' }); // completes MISSIONS[3] (open-core)
    assert.equal(t.completed.has(MISSIONS[3].id), true);
    assert.equal(t.current().id, MISSIONS[0].id, 'falls back to earliest-unmet once the tracked one completes');
  });

  test('track() with an unknown id is a no-op, not a crash', () => {
    const t = new MissionTracker();
    t.track('not-a-real-mission');
    assert.equal(t.trackedId, null);
    assert.equal(t.current().id, MISSIONS[0].id);
  });

  test('every mission carries a well-formed reward (gold and/or metal, no other keys, all positive)', () => {
    for (const m of MISSIONS) {
      assert.ok(m.reward, `${m.id} has a reward`);
      const keys = Object.keys(m.reward);
      assert.ok(keys.length > 0 && keys.every(k => k === 'gold' || k === 'metal'), `${m.id}'s reward is only gold/metal`);
      for (const k of keys) assert.ok(m.reward[k] > 0, `${m.id}'s ${k} reward is positive`);
    }
  });
});
