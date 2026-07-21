import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { Corpse } from '../js/corpse.js';
import { Enemy } from '../js/enemy.js';
import { freshGame } from './helpers.mjs';

// Phase 16: enemy corpses + the Scavenger tractor-beam salvage loop.

describe('Phase 16: placement zones (ring)', () => {
  test('scavengers are legal inside the (square) ring and refused out in the tower field', () => {
    const { world } = freshGame(100000);
    const H = CONFIG.BASE_RING_HALF;
    assert.ok(world.scavengerPlacementAllowed(100, 100), 'inside the ring');
    assert.ok(world.scavengerPlacementAllowed(H, 0), 'the square edge is inclusive');
    assert.ok(world.scavengerPlacementAllowed(H, H), 'and the corner too — it is a square, not a circle');
    assert.ok(!world.scavengerPlacementAllowed(10, 0), 'too close to the base core');
    assert.ok(!world.scavengerPlacementAllowed(H + 1, 0), 'out past the ring is tower turf');
    assert.ok(world.inTowerField(H + 1, 0), 'and inTowerField agrees on the same point');
    assert.ok(!world.inTowerField(100, 100), 'a ring cell is not tower field');
  });

  test('placeScavenger refuses a spot in the tower field but takes one in the ring', () => {
    const { world } = freshGame(100000);
    assert.equal(world.placeScavenger(400, 400), null, 'past the ring -> refused'); // dist ~566
    const s = world.placeScavenger(100, 100); // dist ~141, inside
    assert.ok(s, 'inside the ring -> placed');
    assert.equal(world.scavengersPlaced, 1, 'player-placed counter advanced');
  });

  test('the free starter Scavenger does NOT count toward scavengersPlaced (tutorial guard)', () => {
    const { world } = freshGame(100000);
    world.placeStarterScavenger(100, 0);
    assert.equal(world.scavengersPlaced, 0, 'starter is a freebie, not a player placement');
  });
});

describe('Phase 16: corpses', () => {
  test('a killed enemy drops one corpse where it fell, valued off its maxHealth', () => {
    const { world } = freshGame(100000);
    const enemy = new Enemy(300, 0, 300, 0); // target == position, so it doesn't drift before dying
    world.enemies.push(enemy);
    enemy.health = 0; // dead this frame
    world.updateEnemies(0.016);

    assert.equal(world.corpses.length, 1);
    const c = world.corpses[0];
    assert.equal(c.metalValue, Math.round(enemy.maxHealth * CONFIG.CORPSE_METAL_PER_ENEMY_HEALTH));
    assert.equal(c.x, 300, 'dropped at the death position');
  });

  test('a corpse decays and is dropped once its life runs out, with no scavenger to collect it', () => {
    const { world } = freshGame(0); // start with no metal so we can watch it stay put
    world.scavengers.length = 0;    // strip the starter so nothing tractors
    world.corpses.push(new Corpse(9999, 9999, 50)); // far from anything
    const metalBefore = world.metal;

    world.updateSalvage(CONFIG.CORPSE_DECAY_SECONDS + 0.01);
    assert.equal(world.corpses.length, 0, 'expired corpse is filtered out');
    assert.equal(world.metal, metalBefore, 'nothing salvaged it, so no metal gained');
  });
});

describe('Phase 16: tractor salvage', () => {
  test('a scavenger reels in a corpse within its tractorRadius and converts it to metal', () => {
    const { world } = freshGame(0);
    world.scavengers.length = 0;
    const scav = world.placeStarterScavenger(100, 0); // free, inside ring
    // a corpse just outside collection range but well inside tractor reach
    const corpse = new Corpse(scav.x + 60, scav.y, 40);
    world.corpses.push(corpse);
    const metalBefore = world.metal;

    // one big step: 60px at CORPSE_TRACTOR_SPEED closes the gap into collect range
    world.updateSalvage(1.0);
    assert.equal(corpse.pulledBy, scav, 'the covering scavenger claimed it');
    assert.equal(world.corpses.length, 0, 'collected and removed');
    assert.equal(world.metal - metalBefore, 40, 'its full value was banked as metal');
  });

  test('a corpse outside every scavenger tractorRadius is never pulled', () => {
    const { world } = freshGame(0);
    world.scavengers.length = 0;
    const scav = world.placeStarterScavenger(100, 0);
    const corpse = new Corpse(scav.x + scav.tractorRadius + 50, scav.y, 40);
    world.corpses.push(corpse);
    const startX = corpse.x;

    world.updateSalvage(0.1);
    assert.equal(corpse.pulledBy, null, 'out of reach -> not tractored');
    assert.equal(corpse.x, startX, 'and not moved');
  });

  test('the collecting scavenger\'s metalYieldMult affix scales the payout', () => {
    const { world } = freshGame(0);
    world.scavengers.length = 0;
    const scav = world.placeStarterScavenger(100, 0);
    scav.equippedItem = { affixes: [{ stat: 'metalYieldMult', value: 0.5 }] }; // +50%
    world.corpses.push(new Corpse(scav.x + 60, scav.y, 40));
    const metalBefore = world.metal;

    world.updateSalvage(1.0);
    assert.equal(world.metal - metalBefore, 60, '40 * 1.5 = 60');
  });
});
