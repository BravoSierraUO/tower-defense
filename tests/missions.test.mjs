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
    t.update({ towersPlaced: 1, waveNumber: 0, roomsBuilt: 1, view: 'field' });
    assert.equal(t.completed.has(MISSIONS[0].id), true);
    assert.equal(t.current().id, MISSIONS[1].id);
  });

  test('stays completed even if the underlying state later regresses (sticky, like achievements)', () => {
    const t = new MissionTracker();
    t.update({ towersPlaced: 1, waveNumber: 0, roomsBuilt: 1, view: 'field' });
    t.update({ towersPlaced: 0, waveNumber: 0, roomsBuilt: 1, view: 'field' }); // e.g. the tower got sold
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
    t.update({ towersPlaced: 1, waveNumber: 1, roomsBuilt: 2, view: 'core' });
    assert.equal(t.isDone(), true);
    assert.equal(t.current(), null);
  });

  test('current() always returns the earliest unmet mission, even if a later one is independently satisfied', () => {
    const t = new MissionTracker();
    // Only the LAST mission's condition is true — checks are independent (no prereq chain),
    // so it completes on its own, but current() should still surface mission #1 as next-up.
    t.update({ towersPlaced: 0, waveNumber: 0, roomsBuilt: 2, view: 'field' });
    assert.equal(t.completed.has(MISSIONS[3].id), true);
    assert.equal(t.completed.has(MISSIONS[0].id), false);
    assert.equal(t.current().id, MISSIONS[0].id);
  });
});
