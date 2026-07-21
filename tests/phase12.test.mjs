import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { Enemy } from '../js/enemy.js';
import { updateCombat } from '../js/combat.js';
import { Profile } from '../js/profile.js';
import { freshGame } from './helpers.mjs';

describe('Phase 12: Base Self-Defense', () => {
  test('a fresh (tier-0, Outpost) base deals no damage at all', () => {
    const { world } = freshGame(0);
    const enemy = new Enemy(0, 0, world.base.x, world.base.y);
    world.enemies.push(enemy);

    const healthBefore = enemy.health;
    updateCombat(world, 1);
    assert.equal(enemy.health, healthBefore, 'Outpost (tier 0) has baseDamage 0 — no self-defense yet');
  });

  test('a prestiged base (tier > 0) damages the closest live enemy, scaled by dt', () => {
    const profile = new Profile();
    profile.data.prestige = 1; // tier 1: Orbital Platform
    const { world } = freshGame(0, profile);
    assert.equal(world.profile.stationTier(), 1);

    const enemy = new Enemy(0, 0, world.base.x, world.base.y);
    world.enemies.push(enemy);

    const healthBefore = enemy.health;
    updateCombat(world, 1);
    const expectedDamage = CONFIG.STATION_TIERS[1].baseDamage * 1;
    assert.equal(healthBefore - enemy.health, expectedDamage);
  });

  test('only the closest live enemy to the base is hit, dead/arrived enemies are skipped', () => {
    const profile = new Profile();
    profile.data.prestige = 3;
    const { world } = freshGame(0, profile);

    const far = new Enemy(500, 0, world.base.x, world.base.y);
    const near = new Enemy(50, 0, world.base.x, world.base.y);
    const dead = new Enemy(10, 0, world.base.x, world.base.y);
    dead.health = 0;
    world.enemies.push(far, near, dead);

    const nearHealthBefore = near.health;
    const farHealthBefore = far.health;
    updateCombat(world, 1);

    assert.ok(near.health < nearHealthBefore, 'nearest live enemy takes the hit');
    assert.equal(far.health, farHealthBefore, 'farther enemy untouched');
  });

  test('station tier 0 stays exactly the "no ring" precedent — baseDamage 0 in CONFIG.STATION_TIERS[0]', () => {
    assert.equal(CONFIG.STATION_TIERS[0].baseDamage, 0);
  });
});

describe('Phase 11 fix: buildSpeedMult affix now shortens Command Core room construction', () => {
  test('World.buildSpeedMult() is 1 (no-op) with no towers/scavengers, or none equipped with the affix', () => {
    const { world } = freshGame(100000);
    assert.equal(world.buildSpeedMult(), 1);

    world.placeTower(200, 200);
    world.placeScavenger(100, 100);
    assert.equal(world.buildSpeedMult(), 1, 'placed but nothing equipped');
  });

  test('an equipped buildSpeedMult item on a Tower is picked up', () => {
    const { world } = freshGame(100000);
    const tower = world.placeTower(200, 200);
    tower.equippedItem = { affixes: [{ stat: 'buildSpeedMult', value: 0.2 }] };
    assert.equal(world.buildSpeedMult(), 1.2);
  });

  test('an equipped buildSpeedMult item on a Scavenger is picked up too', () => {
    const { world } = freshGame(100000);
    const scavenger = world.placeScavenger(100, 100);
    scavenger.equippedItem = { affixes: [{ stat: 'buildSpeedMult', value: 0.15 }] };
    assert.equal(world.buildSpeedMult(), 1.15);
  });

  test('the single best buildSpeedMult wins — not summed across a whole fleet', () => {
    const { world } = freshGame(100000);
    const weak = world.placeTower(200, 200);
    weak.equippedItem = { affixes: [{ stat: 'buildSpeedMult', value: 0.05 }] };
    const strong = world.placeTower(300, 300);
    strong.equippedItem = { affixes: [{ stat: 'buildSpeedMult', value: 0.3 }] };
    assert.equal(world.buildSpeedMult(), 1.3, 'best single item, not 1.05 + 1.3');
  });

  test('buildRoom() divides buildTimeTotal by buildSpeedMult() on top of Build Mastery, floored at 1s', () => {
    const { world, commandCore } = freshGame(100000);
    const tower = world.placeTower(200, 200);
    tower.equippedItem = { affixes: [{ stat: 'buildSpeedMult', value: 1 }] }; // +100%, easy to hand-check
    const room = world.buildRoom('reactor', 0, 0);
    const expected = Math.max(1, CONFIG.ROOM_BUILD_TIME_BASE / world.profile.buildMult() / 2);
    assert.equal(room.buildTimeTotal, expected);
    assert.equal(room.buildTimeRemaining, room.buildTimeTotal);
  });

  test('with no buildSpeedMult equipped anywhere, buildRoom() behaves exactly as before this fix', () => {
    const { world } = freshGame(100000);
    const room = world.buildRoom('reactor', 0, 0);
    const expected = Math.max(1, CONFIG.ROOM_BUILD_TIME_BASE / world.profile.buildMult());
    assert.equal(room.buildTimeTotal, expected);
  });
});
