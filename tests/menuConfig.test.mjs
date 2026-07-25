// Phase 18a: coverage for js/menuConfig.js — the shared build-menu data both the
// radial (js/ui/radialMenu.js) and the bottom bar (js/ui/bottomBar.js) render.
//
// docs/mobile-audit.md D3 called this out as "the one piece of shared menu logic
// that can regress silently once two renderers consume it": the locked/reason
// matrix is what tells a player *why* they can't build something, and a wrong
// answer there is invisible to any test that only checks the menu renders.
// Before Phase 18 it lived on Game, which can't be constructed outside a browser,
// so none of this was reachable from node --test. It is now.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildMenuConfig } from '../js/menuConfig.js';
import { CONFIG } from '../js/config.js';
import { freshGame } from './helpers.mjs';

const leafById = (cfg, id) => cfg.level1.find(l => l.id === id);
const buildLeaves = cfg => leafById(cfg, 'build').flyout;
const flyoutLeaf = (cfg, id) => buildLeaves(cfg).find(l => l.id === id);

describe('menuConfig: shared shape', () => {
  test('both views return the same four level-1 slots in the same order', () => {
    const { world, commandCore } = freshGame(1000);
    const field = buildMenuConfig('field', world, commandCore);
    const core = buildMenuConfig('core', world, commandCore);
    const ids = cfg => cfg.level1.map(l => l.id);
    assert.deepEqual(ids(field), ['missions', 'inventory', 'base', 'build']);
    assert.deepEqual(ids(core), ['missions', 'inventory', 'base', 'build']);
  });

  test('the base leaf relabels by view but keeps one id', () => {
    // The bar needs a stable id to dispatch on; only the label moves. Phase 18a
    // folded camera-recentre into this action rather than dropping it.
    const { world, commandCore } = freshGame(1000);
    assert.equal(leafById(buildMenuConfig('field', world, commandCore), 'base').label, 'Base');
    assert.equal(leafById(buildMenuConfig('core', world, commandCore), 'base').label, 'Field');
  });

  test('only Build carries a submenu', () => {
    const { world, commandCore } = freshGame(1000);
    for (const view of ['field', 'core']) {
      const cfg = buildMenuConfig(view, world, commandCore);
      const withFlyout = cfg.level1.filter(l => l.flyout).map(l => l.id);
      assert.deepEqual(withFlyout, ['build']);
    }
  });

  test('does not mutate world or commandCore', () => {
    // It is called every time a menu opens, and in bar mode potentially per-frame.
    const { world, commandCore } = freshGame(500);
    const before = { gold: world.gold, iron: world.iron, scrap: world.scrap, rooms: commandCore.rooms.length };
    buildMenuConfig('field', world, commandCore);
    buildMenuConfig('core', world, commandCore);
    assert.equal(world.gold, before.gold);
    assert.equal(world.iron, before.iron);
    assert.equal(world.scrap, before.scrap);
    assert.equal(commandCore.rooms.length, before.rooms);
  });
});

describe('menuConfig: field view — iron affordability', () => {
  test('rich player has all four field leaves unlocked', () => {
    const { world, commandCore } = freshGame(1000);
    const leaves = buildLeaves(buildMenuConfig('field', world, commandCore));
    assert.equal(leaves.length, 4); // 3 damage types + scavenger
    assert.ok(leaves.every(l => !l.locked), 'nothing should be locked at 1000 iron');
  });

  test('the three attackers are the CONFIG.DAMAGE_TYPES keys, in declared order', () => {
    const { world, commandCore } = freshGame(1000);
    const leaves = buildLeaves(buildMenuConfig('field', world, commandCore));
    assert.deepEqual(leaves.slice(0, 3).map(l => l.id), Object.keys(CONFIG.DAMAGE_TYPES));
    assert.equal(leaves[3].id, 'scavenger');
  });

  test('digit badges match game.js\'s 1-4 field key order', () => {
    // game.js handleInput() indexes fieldKeyOrder against the same list; if these
    // drift, the badge tells the player the wrong key.
    const { world, commandCore } = freshGame(1000);
    const leaves = buildLeaves(buildMenuConfig('field', world, commandCore));
    assert.deepEqual(leaves.map(l => l.digit), ['1', '2', '3', '4']);
  });

  test('broke player has every field leaf locked, each with a reason', () => {
    const { world, commandCore } = freshGame(0);
    const leaves = buildLeaves(buildMenuConfig('field', world, commandCore));
    assert.ok(leaves.every(l => l.locked));
    assert.ok(leaves.every(l => typeof l.reason === 'string' && l.reason.length > 0));
  });

  test('scavenger unlocks before towers do — it is the cheaper one', () => {
    // SCAVENGER_COST 25 < TOWER_COST 40, so there is a band where exactly one is
    // affordable. This is the gate most likely to break silently on a cost change.
    const { world, commandCore } = freshGame(0);
    world.iron = CONFIG.SCAVENGER_COST;
    const cfg = buildMenuConfig('field', world, commandCore);
    assert.equal(flyoutLeaf(cfg, 'scavenger').locked, false);
    for (const type of Object.keys(CONFIG.DAMAGE_TYPES)) {
      assert.equal(flyoutLeaf(cfg, type).locked, true, `${type} should still be locked`);
    }
  });

  test('affordability is inclusive at exactly the cost', () => {
    const { world, commandCore } = freshGame(0);
    world.iron = world.towerCost();
    const cfg = buildMenuConfig('field', world, commandCore);
    assert.equal(flyoutLeaf(cfg, Object.keys(CONFIG.DAMAGE_TYPES)[0]).locked, false);
  });

  test('the unaffordable reason floors the displayed iron rather than showing a fraction', () => {
    const { world, commandCore } = freshGame(0);
    world.iron = 10.7;
    const cfg = buildMenuConfig('field', world, commandCore);
    const reason = flyoutLeaf(cfg, 'scavenger').reason;
    assert.match(reason, /have 10\)/);
    assert.doesNotMatch(reason, /10\.7/);
  });

  test('field costs are labelled iron, and gold does not unlock them', () => {
    // The currencies are not interchangeable — turrets cost iron, rooms cost gold —
    // and docs/mobile-audit.md E3 flags conflating them as the mockups' single worst
    // assumption. Nor does SCRAP unlock a build: it's run-only and prep is when you
    // buy, which is the whole point of the two-pool split.
    const { world, commandCore } = freshGame(0);
    world.gold = 99999;
    world.scrap = 99999;
    world.iron = 0;
    const cfg = buildMenuConfig('field', world, commandCore);
    assert.ok(buildLeaves(cfg).every(l => l.cost.endsWith('Fe')));
    assert.ok(buildLeaves(cfg).every(l => l.locked), 'neither gold nor scrap unlocks a field build');
  });
});

describe('menuConfig: core view — tech, build and gold gates', () => {
  test('one leaf per room type, digits matching the 1-9/0 key order', () => {
    const { world, commandCore } = freshGame(100000);
    const leaves = buildLeaves(buildMenuConfig('core', world, commandCore));
    assert.equal(leaves.length, Object.keys(CONFIG.ROOM_TYPES).length);
    assert.deepEqual(leaves.map(l => l.id), Object.keys(CONFIG.ROOM_TYPES));
    assert.deepEqual(leaves.map(l => l.digit), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
  });

  test('a tech-gated room reports which tech it needs, by label', () => {
    const { world, commandCore } = freshGame(100000);
    const gated = CONFIG.TECH_TREE.find(n => n.unlocksRoom);
    const cfg = buildMenuConfig('core', world, commandCore);
    const leaf = flyoutLeaf(cfg, gated.unlocksRoom);
    assert.equal(leaf.locked, true);
    assert.equal(leaf.reason, `Requires ${gated.label} tech`);
  });

  test('unlocking the tech clears that leaf when gold allows', () => {
    const { world, commandCore } = freshGame(100000);
    const gated = CONFIG.TECH_TREE.find(n => n.unlocksRoom && n.prereq.length === 0);
    commandCore.research = gated.cost; // unlockTech spends research; freshGame() starts with none
    assert.equal(commandCore.unlockTech(gated.id), true, 'fixture: tech should actually unlock');
    const leaf = flyoutLeaf(buildMenuConfig('core', world, commandCore), gated.unlocksRoom);
    assert.equal(leaf.locked, false);
    assert.equal(leaf.reason, null);
  });

  test('an affordable unlocked room is not locked and carries a gold cost', () => {
    const { world, commandCore } = freshGame(100000);
    const leaf = flyoutLeaf(buildMenuConfig('core', world, commandCore), 'reactor');
    assert.equal(leaf.locked, false);
    assert.equal(leaf.reason, null);
    assert.equal(leaf.cost, `${commandCore.buildCost('reactor')}g`);
  });

  test('gold shortfall locks an otherwise-available room', () => {
    const { world, commandCore } = freshGame(0);
    world.gold = commandCore.buildCost('reactor') - 1;
    const leaf = flyoutLeaf(buildMenuConfig('core', world, commandCore), 'reactor');
    assert.equal(leaf.locked, true);
    assert.match(leaf.reason, /Need \d+g gold/);
  });

  test('metal does not unlock rooms', () => {
    const { world, commandCore } = freshGame(0);
    world.iron = 99999;
    world.gold = 0;
    const leaf = flyoutLeaf(buildMenuConfig('core', world, commandCore), 'reactor');
    assert.equal(leaf.locked, true);
  });

  test('a built non-stackable room locks with the upgrade-instead hint and no cost', () => {
    const { world, commandCore } = freshGame(100000);
    const type = Object.keys(CONFIG.ROOM_TYPES).find(t => !CONFIG.ROOM_TYPES[t].stackable && commandCore.isRoomUnlocked(t));
    commandCore.placeStarterRoom(type, 3, 3);
    const leaf = flyoutLeaf(buildMenuConfig('core', world, commandCore), type);
    assert.equal(leaf.locked, true);
    assert.match(leaf.reason, /already built/);
    assert.equal(leaf.cost, null, 'a cost on an unbuildable leaf would be misleading');
  });

  test('the stackable Reactor stays buildable after one exists', () => {
    // The exemption docs/mobile-audit.md D3 names explicitly. An idle/additive
    // game has to let you keep adding power supply — Phase 16.x.
    assert.equal(CONFIG.ROOM_TYPES.reactor.stackable, true, 'fixture assumption');
    const { world, commandCore } = freshGame(100000);
    commandCore.placeStarterRoom('reactor', 0, 0);
    const leaf = flyoutLeaf(buildMenuConfig('core', world, commandCore), 'reactor');
    assert.equal(leaf.locked, false);
    assert.equal(leaf.reason, null);
    assert.ok(leaf.cost, 'a stackable room keeps showing its next cost');
  });

  test('built-lock beats affordability in the reason text', () => {
    // Both conditions true at once: the player should be told to upgrade, not
    // told to come back with more gold for something they cannot rebuild anyway.
    const { world, commandCore } = freshGame(100000);
    const type = Object.keys(CONFIG.ROOM_TYPES).find(t => !CONFIG.ROOM_TYPES[t].stackable && commandCore.isRoomUnlocked(t));
    commandCore.placeStarterRoom(type, 3, 3);
    world.gold = 0;
    const leaf = flyoutLeaf(buildMenuConfig('core', world, commandCore), type);
    assert.match(leaf.reason, /already built/);
  });

  test('every locked leaf has a reason, and every unlocked leaf has none', () => {
    // The invariant the renderers actually depend on: RadialMenu shows `reason`
    // as a stub/tooltip on a locked click, so a locked leaf without one is a
    // dead end for the player.
    for (const gold of [0, 50, 100000]) {
      const { world, commandCore } = freshGame(0);
      world.gold = gold;
      for (const leaf of buildLeaves(buildMenuConfig('core', world, commandCore))) {
        if (leaf.locked) assert.ok(leaf.reason, `locked ${leaf.id} at ${gold}g needs a reason`);
        else assert.equal(leaf.reason, null, `unlocked ${leaf.id} should have no reason`);
      }
    }
  });
});
