// Phase 20: the stage gate. Stage 1 (idle/prep) is where you build and sell;
// Stage 2 (a TD run) is where you touch nothing — no new turrets, no selling.
// Spec: docs/economy-redesign.md.
//
// The gate lives on World rather than Game so it's enforced where the mutation
// happens — neither the UI nor a future input path can route around it. These
// tests are the reason it can be wired up later with confidence: the mechanism
// is proven before anything depends on it.
//
// NOT WIRED YET, deliberately. A TD run has no way to end until death is
// reintroduced (Phase 8a removed it — a destroyed base heals back to full and
// pays a lesser chest instead of ending the run), and gating builds before a run
// can end would leave a player permanently unable to build after wave 1. So the
// default is prep, and every existing test stays green untouched.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { freshGame } from './helpers.mjs';

// A legal tower spot: outside the base ring (towers only live in the tower field).
const TOWER_SPOT = { x: CONFIG.BASE_RING_RADIUS + CONFIG.GRID_SIZE * 2, y: 0 };
// A legal scavenger spot: inside the ring, off the base core.
const SCAV_SPOT = { x: 100, y: 100 };

describe('Phase 20 stage gate: defaults', () => {
  test('a fresh World starts in Stage 1 (prep), not mid-run', () => {
    // Load-bearing: every one of the ~270 pre-existing tests builds a World and
    // expects to be able to place things. Defaulting to prep is what keeps them
    // green, and what keeps the unwired gate invisible in play.
    const { world } = freshGame(100000);
    assert.equal(world.tdRunActive, false);
    assert.equal(world.canModifyDefenses(), true);
  });

  test('beginTdRun / endTdRun flip the gate', () => {
    const { world } = freshGame(100000);
    world.beginTdRun();
    assert.equal(world.tdRunActive, true);
    assert.equal(world.canModifyDefenses(), false);
    world.endTdRun();
    assert.equal(world.tdRunActive, false);
    assert.equal(world.canModifyDefenses(), true);
  });

  test('both are idempotent', () => {
    // A run beginning twice (two wave triggers) or ending twice (death and a
    // flee racing) must not leave the flag inverted.
    const { world } = freshGame(100000);
    world.beginTdRun();
    world.beginTdRun();
    assert.equal(world.canModifyDefenses(), false);
    world.endTdRun();
    world.endTdRun();
    assert.equal(world.canModifyDefenses(), true);
  });

  test('the gate is independent of spawner.state', () => {
    // The distinction that matters: a run spans many waves, so the spawner
    // sitting at 'idle' between wave 3 and wave 4 is still mid-run. A
    // spawner.state check would get exactly this case wrong.
    const { world } = freshGame(100000);
    world.beginTdRun();
    world.spawner.state = 'idle';
    assert.equal(world.canModifyDefenses(), false, 'still mid-run between waves');
  });
});

describe('Phase 20 stage gate: building is prep-only', () => {
  test('placeTower works in prep and is refused mid-run', () => {
    const { world } = freshGame(100000);
    const placed = world.placeTower(TOWER_SPOT.x, TOWER_SPOT.y, 'kinetic');
    assert.ok(placed, 'prep: placement allowed');

    world.beginTdRun();
    const during = world.placeTower(TOWER_SPOT.x + CONFIG.GRID_SIZE * 2, TOWER_SPOT.y, 'kinetic');
    assert.equal(during, null, 'mid-run: refused');
    assert.equal(world.towers.length, 1, 'no tower was added');
  });

  test('placeScavenger works in prep and is refused mid-run', () => {
    const { world } = freshGame(100000);
    assert.ok(world.placeScavenger(SCAV_SPOT.x, SCAV_SPOT.y), 'prep: placement allowed');
    const before = world.scavengers.length;

    world.beginTdRun();
    assert.equal(world.placeScavenger(60, 60), null, 'mid-run: refused');
    assert.equal(world.scavengers.length, before);
  });

  test('a refused mid-run build charges nothing', () => {
    // The gate must return before the cost is taken, not after — a silent charge
    // for a tower that never appeared is the worst version of this bug.
    const { world } = freshGame(100000);
    world.beginTdRun();
    const ironBefore = world.iron;
    world.placeTower(TOWER_SPOT.x, TOWER_SPOT.y, 'kinetic');
    world.placeScavenger(SCAV_SPOT.x, SCAV_SPOT.y);
    assert.equal(world.iron, ironBefore, 'no iron spent on a refused build');
  });

  test('a refused mid-run build does not bump towersPlaced', () => {
    // towersPlaced drives tutorial missions and profile CP — a refused build
    // must not award progress.
    const { world } = freshGame(100000);
    world.beginTdRun();
    const placed = world.towersPlaced;
    const scavs = world.scavengersPlaced;
    world.placeTower(TOWER_SPOT.x, TOWER_SPOT.y, 'kinetic');
    world.placeScavenger(SCAV_SPOT.x, SCAV_SPOT.y);
    assert.equal(world.towersPlaced, placed);
    assert.equal(world.scavengersPlaced, scavs);
  });
});

describe('Phase 20 stage gate: selling is prep-only', () => {
  test('sellTowerAt works in prep and is refused mid-run', () => {
    const { world } = freshGame(100000);
    world.placeTower(TOWER_SPOT.x, TOWER_SPOT.y, 'kinetic');

    world.beginTdRun();
    assert.equal(world.sellTowerAt(TOWER_SPOT.x, TOWER_SPOT.y), false, 'mid-run: refused');
    assert.equal(world.towers.length, 1, 'the tower survives');

    world.endTdRun();
    assert.equal(world.sellTowerAt(TOWER_SPOT.x, TOWER_SPOT.y), true, 'prep: sell allowed');
    assert.equal(world.towers.length, 0);
  });

  test('sellScavengerAt works in prep and is refused mid-run', () => {
    const { world } = freshGame(100000);
    world.placeScavenger(SCAV_SPOT.x, SCAV_SPOT.y);

    world.beginTdRun();
    assert.equal(world.sellScavengerAt(SCAV_SPOT.x, SCAV_SPOT.y), false);
    assert.equal(world.scavengers.length, 1);

    world.endTdRun();
    assert.equal(world.sellScavengerAt(SCAV_SPOT.x, SCAV_SPOT.y), true);
    assert.equal(world.scavengers.length, 0);
  });

  test('a refused mid-run sell pays no refund', () => {
    // The exploit this closes: if the gate returned after the refund, selling
    // mid-run would mint currency and keep the turret.
    const { world } = freshGame(100000);
    world.placeTower(TOWER_SPOT.x, TOWER_SPOT.y, 'kinetic');
    world.beginTdRun();
    const ironBefore = world.iron;
    world.sellTowerAt(TOWER_SPOT.x, TOWER_SPOT.y);
    assert.equal(world.iron, ironBefore, 'no refund paid');
    assert.equal(world.towers.length, 1, 'and the turret is still there');
  });
});

describe('Phase 20 stage gate: what it deliberately does NOT gate', () => {
  test('the gate-bypassing starter placement still works mid-run', () => {
    // placeStarterScavenger is Game's onboarding guarantee and bypasses every
    // normal gate by design (see CLAUDE.md). It must keep bypassing this one, or
    // a restart mid-run would silently lose the free starter.
    const { world } = freshGame(100000);
    world.beginTdRun();
    const starter = world.placeStarterScavenger(CONFIG.BASE_X + CONFIG.SCAVENGER_MIN_BASE_DISTANCE + CONFIG.GRID_SIZE, CONFIG.BASE_Y);
    assert.ok(starter, 'starter placement bypasses the stage gate');
  });

  test('turret upgrades are NOT gated yet', () => {
    // Recorded as a pending design decision, not an oversight. The spec's
    // two-ladder upgrade model (temporary in-run upgrades bought with salvage vs.
    // permanent prep upgrades) needs Tower to carry a persistent tier AND a
    // run-scoped modifier, which it does not yet. Until then upgrading stays
    // stage-agnostic and this test pins the current behaviour so the change is
    // deliberate and visible when it lands.
    const { world } = freshGame(100000);
    const tower = world.placeTower(TOWER_SPOT.x, TOWER_SPOT.y, 'kinetic');
    world.beginTdRun();
    assert.equal(world.upgradeTower(tower), true, 'upgrading mid-run currently allowed');
    assert.equal(tower.tier, 2);
  });

  test('salvage still accrues mid-run', () => {
    // The whole point of a run: scavengers keep pulling metal in while you are
    // locked out of building. Gating income would break the economy the run is for.
    const { world } = freshGame(100000); // must afford the scavenger to have a producer at all
    assert.ok(world.placeScavenger(SCAV_SPOT.x, SCAV_SPOT.y), 'fixture: scavenger placed');
    world.beginTdRun();
    const before = world.iron;
    world.updateCycleBudget(1);
    assert.ok(world.iron > before, 'idle/cycle-budget metal still accrues mid-run');
  });
});
