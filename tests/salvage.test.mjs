import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { Corpse } from '../js/corpse.js';
import { Enemy } from '../js/enemy.js';
import { freshGame } from './helpers.mjs';

// Phase 16: enemy corpses + the Scavenger tractor-beam salvage loop.

describe('Phase 16: placement zones (ring)', () => {
  // Phase 18 correction: this ring was built as a SQUARE from a literal reading of the
  // user's "+/- 5 in each direction". It is a CIRCLE — the intended model is radial, and the
  // inner edge (SCAVENGER_MIN_BASE_DISTANCE) was already circular, so the square was the
  // inconsistent part. The radius keeps the old edge distance (200), so the compound now
  // LOSES the diagonals: a former corner sat 200*sqrt(2) ≈ 283 out and is now tower field.
  // The corner assertion below is inverted from what it used to claim, on purpose.
  test('scavengers are legal inside the circular ring and refused out in the tower field', () => {
    const { world } = freshGame(100000);
    const R = CONFIG.BASE_RING_RADIUS;
    assert.ok(world.scavengerPlacementAllowed(100, 100), 'inside the ring');
    assert.ok(world.scavengerPlacementAllowed(R, 0), 'the radius is inclusive on-axis');
    assert.ok(!world.scavengerPlacementAllowed(R, R), 'the old square corner is now OUTSIDE — it is a circle');
    assert.ok(!world.scavengerPlacementAllowed(10, 0), 'too close to the base core');
    assert.ok(!world.scavengerPlacementAllowed(R + 1, 0), 'out past the ring is tower turf');
    assert.ok(world.inTowerField(R + 1, 0), 'and inTowerField agrees on the same point');
    assert.ok(!world.inTowerField(100, 100), 'a ring cell is not tower field');
  });

  test('the ring boundary is radial, not axis-aligned', () => {
    // The distinguishing property: on a square, a point at 45° reaches further from the
    // base before leaving the zone than one on an axis. On a circle they leave at the same
    // distance. This is the test that would have failed before the Phase 18 correction.
    const { world } = freshGame(100000);
    const R = CONFIG.BASE_RING_RADIUS;
    const diag = R / Math.SQRT2; // a 45° point at exactly distance R
    assert.ok(world.inBaseRing(diag, diag), 'a 45° point at distance R is inside');
    assert.ok(!world.inBaseRing(diag + 5, diag + 5), 'just past distance R at 45° is outside');
    // Same distance, every direction, same answer.
    for (const deg of [0, 30, 45, 60, 90, 135, 180, 225, 270, 315]) {
      const rad = deg * Math.PI / 180;
      const inside = { x: Math.cos(rad) * (R - 2), y: Math.sin(rad) * (R - 2) };
      const outside = { x: Math.cos(rad) * (R + 2), y: Math.sin(rad) * (R + 2) };
      assert.ok(world.inBaseRing(inside.x, inside.y), `${deg}°: just inside R is in the ring`);
      assert.ok(world.inTowerField(outside.x, outside.y), `${deg}°: just outside R is tower field`);
    }
  });

  test('ring and tower field are complementary except the base core', () => {
    const { world } = freshGame(100000);
    const R = CONFIG.BASE_RING_RADIUS;
    for (const d of [0, 10, 39, 40, 100, 199, 200, 201, 400]) {
      const inRing = world.inBaseRing(d, 0);
      const inField = world.inTowerField(d, 0);
      assert.ok(!(inRing && inField), `distance ${d} cannot be both zones`);
      // The base core (inside SCAVENGER_MIN_BASE_DISTANCE) is deliberately neither —
      // nothing places on the base itself.
      if (d < CONFIG.SCAVENGER_MIN_BASE_DISTANCE) {
        assert.ok(!inRing && !inField, `distance ${d} is the base core — neither zone`);
      } else {
        assert.ok(inRing || inField, `distance ${d} must be one zone or the other`);
      }
    }
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
    assert.equal(c.scrapValue, Math.round(enemy.maxHealth * CONFIG.CORPSE_SCRAP_PER_ENEMY_HEALTH));
    assert.equal(c.x, 300, 'dropped at the death position');
  });

  test('a corpse decays and is dropped once its life runs out, with no scavenger to collect it', () => {
    const { world } = freshGame(0);
    world.scavengers.length = 0;    // strip the starter so nothing tractors
    world.corpses.push(new Corpse(9999, 9999, 50)); // far from anything
    const scrapBefore = world.scrap;

    world.updateSalvage(CONFIG.CORPSE_DECAY_SECONDS + 0.01);
    assert.equal(world.corpses.length, 0, 'expired corpse is filtered out');
    assert.equal(world.scrap, scrapBefore, 'nothing salvaged it, so no scrap gained');
  });
});

describe('Phase 16: tractor salvage', () => {
  test('a scavenger reels in a corpse within its tractorRadius and converts it to SCRAP', () => {
    const { world } = freshGame(0);
    world.scavengers.length = 0;
    const scav = world.placeStarterScavenger(100, 0); // free, inside ring
    // a corpse just outside collection range but well inside tractor reach
    const corpse = new Corpse(scav.x + 60, scav.y, 40);
    world.corpses.push(corpse);
    const scrapBefore = world.scrap;
    const ironBefore = world.iron;

    // one big step: 60px at CORPSE_TRACTOR_SPEED closes the gap into collect range
    world.updateSalvage(1.0);
    assert.equal(corpse.pulledBy, scav, 'the covering scavenger claimed it');
    assert.equal(world.corpses.length, 0, 'collected and removed');
    // Phase 20: salvage is the definitional SCRAP source — run-only, and it must not
    // touch the prep pool, or the run economy could fund permanent power.
    assert.equal(world.scrap - scrapBefore, 40, 'its full value was banked as scrap');
    assert.equal(world.iron, ironBefore, 'and no iron was minted');
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
    const scrapBefore = world.scrap;

    world.updateSalvage(1.0);
    // The affix keeps its `metalYieldMult` id — renaming affix ids would touch
    // AFFIX_POOL plus every already-rolled item, so it's deliberately deferred.
    assert.equal(world.scrap - scrapBefore, 60, '40 * 1.5 = 60');
  });
});
