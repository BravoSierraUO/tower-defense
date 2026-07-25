// Phase 20: the two-pool currency split. What used to be one `world.metal` is now
// iron (Stage 1 / prep — buys and upgrades turrets, capped, survives a run) and
// scrap (Stage 2 / run-only — earned from salvage and combat, WIPED at run end).
// Spec: docs/economy-redesign.md §B1, §K.
//
// The invariant every test here defends: **scrap can never become permanent power.**
// That's the whole reason the split exists, and it's the thing a future change is
// most likely to break silently — a new reward routed to the wrong pool looks
// identical in play until someone notices the idle economy inflating.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { Corpse } from '../js/corpse.js';
import { freshGame } from './helpers.mjs';

const TOWER_SPOT = { x: CONFIG.BASE_RING_RADIUS + CONFIG.GRID_SIZE * 2, y: 0 };
const SCAV_SPOT = { x: 100, y: 100 };

describe('currency split: the two pools are genuinely separate', () => {
  test('a fresh World has iron from config and zero scrap', () => {
    const { world } = freshGame();
    assert.equal(world.iron, CONFIG.STARTING_IRON);
    assert.equal(world.scrap, 0, 'you start a session with no run currency');
  });

  test('iron is capped; scrap deliberately is not', () => {
    // Scrap is wiped every run end, so a ceiling would only punish a long
    // successful run — the run itself is the cap.
    const { world } = freshGame();
    world.addIron(CONFIG.IRON_CAP_BASE * 10);
    assert.equal(world.iron, world.ironCap());
    world.addScrap(CONFIG.IRON_CAP_BASE * 10);
    assert.equal(world.scrap, CONFIG.IRON_CAP_BASE * 10, 'scrap accrues past any iron ceiling');
  });

  test('addIron never touches scrap and addScrap never touches iron', () => {
    const { world } = freshGame(500);
    world.addIron(100);
    assert.equal(world.scrap, 0);
    const ironAfter = world.iron;
    world.addScrap(100);
    assert.equal(world.iron, ironAfter);
  });
});

describe('currency split: scrap dies with the run', () => {
  test('endTdRun wipes scrap and leaves iron alone', () => {
    // The single line that makes scrap run-only. No snapshot, no unwinding.
    const { world } = freshGame(500);
    world.beginTdRun();
    world.addScrap(9999);
    const ironBefore = world.iron;
    world.endTdRun();
    assert.equal(world.scrap, 0, 'scrap does not survive the run');
    assert.equal(world.iron, ironBefore, 'iron does');
  });

  test('no amount of scrap earned in a run can outlive it', () => {
    // The property under test is not "scrap resets" but "scrap cannot become
    // permanent power" — so earn it the way a real run does, then end the run.
    const { world } = freshGame(0);
    world.scavengers.length = 0;
    const scav = world.placeStarterScavenger(SCAV_SPOT.x, SCAV_SPOT.y);
    world.beginTdRun();
    for (let i = 0; i < 20; i++) world.corpses.push(new Corpse(scav.x + 60, scav.y, 40));
    world.updateSalvage(1.0);
    assert.ok(world.scrap > 0, 'a run earned scrap');
    assert.equal(world.iron, 0, 'and none of it leaked into iron');
    world.endTdRun();
    assert.equal(world.scrap, 0);
    assert.equal(world.iron, 0, 'the run produced exactly zero permanent currency');
  });
});

describe('currency split: producers route to the right pool', () => {
  // Nine producer sites, per the spec's routing table. An earlier draft of that
  // table said eight and mislabelled Supply Drop as mission rewards — these tests
  // are what caught it, which is the argument for having them.

  test('idle mining / the Cycle Budget pays IRON', () => {
    const { world } = freshGame(100000);
    assert.ok(world.placeScavenger(SCAV_SPOT.x, SCAV_SPOT.y), 'fixture: a producer exists');
    const ironBefore = world.iron;
    world.updateCycleBudget(1);
    assert.ok(world.iron > ironBefore, 'idle income is prep-side');
    assert.equal(world.scrap, 0);
  });

  test('tractor salvage pays SCRAP', () => {
    const { world } = freshGame(0);
    world.scavengers.length = 0;
    const scav = world.placeStarterScavenger(SCAV_SPOT.x, SCAV_SPOT.y);
    world.corpses.push(new Corpse(scav.x + 60, scav.y, 40));
    world.updateSalvage(1.0);
    assert.equal(world.scrap, 40);
    assert.equal(world.iron, 0);
  });

  test('a sell refund pays IRON', () => {
    // Safe from laundering only because selling is prep-only (the stage gate) —
    // there is no round-trip across the stage boundary. tests/stageGate.test.mjs
    // is what holds that half up.
    const { world } = freshGame(100000);
    const tower = world.placeTower(TOWER_SPOT.x, TOWER_SPOT.y, 'kinetic');
    assert.ok(tower);
    const ironBefore = world.iron;
    assert.equal(world.sellTowerAt(TOWER_SPOT.x, TOWER_SPOT.y), true);
    assert.ok(world.iron > ironBefore, 'refund is prep-side');
    assert.equal(world.scrap, 0);
  });

  test('the Supply Drop ability pays SCRAP, not iron', () => {
    // It fires during combat, so its material half is run currency. This is the
    // site the spec's routing table originally got wrong.
    const { world, commandCore } = freshGame(0);
    commandCore.unlockedTech.add('commsAccess');
    const def = CONFIG.ABILITIES.find(a => a.id === 'supplyDrop');
    assert.ok(def.scrap > 0, 'fixture: supplyDrop pays a material amount');
    assert.equal(world.useAbility('supplyDrop'), true);
    assert.equal(world.scrap, def.scrap);
    assert.equal(world.iron, 0);
  });
});

describe('currency split: spenders draw from IRON only', () => {
  test('scrap cannot buy a turret however much of it you hold', () => {
    // The exploit the split exists to prevent, stated as a test.
    const { world } = freshGame(0);
    world.scrap = 999999;
    assert.equal(world.placeTower(TOWER_SPOT.x, TOWER_SPOT.y, 'kinetic'), null);
    assert.equal(world.placeScavenger(SCAV_SPOT.x, SCAV_SPOT.y), null);
    assert.equal(world.scrap, 999999, 'and nothing was deducted trying');
  });

  test('scrap cannot upgrade a turret yet either', () => {
    // Pending the two-ladder model (spec §H2/§I): in-run upgrades bought with scrap
    // are meant to be TEMPORARY, which needs Tower to carry a persistent base and a
    // resetting run modifier. Until that exists, upgrades are prep-side and cost
    // iron — pinned here so the change is deliberate and visible when it lands.
    const { world } = freshGame(0);
    const w2 = freshGame(100000).world;
    const tower = w2.placeTower(TOWER_SPOT.x, TOWER_SPOT.y, 'kinetic');
    w2.iron = 0;
    w2.scrap = 999999;
    assert.equal(w2.upgradeTower(tower), false, 'scrap does not fund a permanent upgrade');
    assert.equal(world.scrap, 0); // untouched sibling fixture
  });

  test('a Market trade moves gold and iron, never scrap', () => {
    const { world, commandCore } = freshGame(100000);
    commandCore.placeStarterRoom('market', 4, 4);
    const scrapBefore = world.scrap;
    world.tradeGoldForIron();
    world.tradeIronForGold();
    assert.equal(world.scrap, scrapBefore, 'the Market is a prep-side room');
  });
});

describe('currency split: ore -> scrap conversion (§K1)', () => {
  test('iron converts 1:1', () => {
    const { world } = freshGame(100);
    const produced = world.convertOreToScrap('iron', 10);
    assert.equal(produced, 10);
    assert.equal(world.scrap, 10);
    assert.equal(world.iron, 90, 'the iron was spent');
  });

  test('platinum converts 1:10 — rarer ore pays more', () => {
    const { world } = freshGame(0);
    world.inventory.ore.platinum = 3;
    const produced = world.convertOreToScrap('platinum', 2);
    assert.equal(produced, 20);
    assert.equal(world.scrap, 20);
    assert.equal(world.inventory.ore.platinum, 1);
  });

  test('every ore in the ratio table can actually convert', () => {
    for (const [ore, ratio] of Object.entries(CONFIG.ORE_SCRAP_RATIOS)) {
      const { world } = freshGame(100);
      if (ore !== 'iron') world.inventory.ore[ore] = 5;
      assert.equal(world.convertOreToScrap(ore, 1), ratio, `${ore} should yield ${ratio}`);
    }
  });

  test('conversion is refused — and charges nothing — when you are short', () => {
    const { world } = freshGame(0);
    world.inventory.ore.platinum = 1;
    assert.equal(world.convertOreToScrap('platinum', 5), 0, 'refused: not enough platinum');
    assert.equal(world.scrap, 0);
    assert.equal(world.inventory.ore.platinum, 1, 'the ore is still there');

    assert.equal(world.convertOreToScrap('iron', 1), 0, 'refused: no iron either');
    assert.equal(world.iron, 0);
  });

  test('an unknown or non-convertible ore is refused rather than crashing', () => {
    const { world } = freshGame(100);
    assert.equal(world.convertOreToScrap('unobtainium', 1), 0);
    assert.equal(world.convertOreToScrap('iron', 0), 0, 'zero amount is a no-op');
    assert.equal(world.convertOreToScrap('iron', -5), 0, 'negative amount cannot mint scrap');
    assert.equal(world.scrap, 0);
    assert.equal(world.iron, 100, 'and none of it spent anything');
  });

  test('conversion is ONE-WAY — there is no scrap-to-ore path anywhere', () => {
    // The structural guarantee, asserted against the API surface rather than a
    // behaviour: if someone adds a reverse conversion later, this fails and makes
    // them justify it.
    const { world } = freshGame(100);
    const reverse = Object.getOwnPropertyNames(Object.getPrototypeOf(world))
      .filter(m => /scrapToOre|scrapToIron|convertScrap/i.test(m));
    assert.deepEqual(reverse, [], `found a reverse conversion: ${reverse.join(', ')}`);
  });
});
