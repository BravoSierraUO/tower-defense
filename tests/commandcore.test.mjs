import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { CommandCore } from '../js/commandcore.js';
import { finishBuild } from './helpers.mjs';

describe('CommandCore: room placement & tiers', () => {
  test('starter rooms (reactor/aiCore/storage) and lab are unlocked with no tech', () => {
    const core = new CommandCore();
    assert.equal(core.isRoomUnlocked('reactor'), true);
    assert.equal(core.isRoomUnlocked('aiCore'), true);
    assert.equal(core.isRoomUnlocked('storage'), true);
    assert.equal(core.isRoomUnlocked('lab'), true);
  });

  test('factory/hangar/shield/dock are locked until their tech node unlocks', () => {
    const core = new CommandCore();
    for (const type of ['factory', 'hangar', 'shield', 'dock']) {
      assert.equal(core.isRoomUnlocked(type), false, `${type} should start locked`);
    }
  });

  test('placeRoom refuses a locked type, a duplicate non-stackable type, and out-of-grid/occupied cells', () => {
    const core = new CommandCore();
    assert.equal(core.placeRoom('factory', 0, 0), null, 'locked type refused');
    const reactor = core.placeRoom('reactor', 0, 0);
    assert.ok(reactor, 'first reactor placement succeeds');
    assert.equal(core.placeRoom('aiCore', 0, 0), null, 'occupied cell refused');
    const aiCore = core.placeRoom('aiCore', 2, 0);
    assert.ok(aiCore, 'a different (unlocked) type places fine');
    assert.equal(core.placeRoom('aiCore', 3, 0), null, 'second AI Core refused — non-stackable, one of each');
    assert.equal(core.placeRoom('aiCore', CONFIG.CORE_GRID_SIZE, 0), null, 'out-of-grid refused');
  });

  test('a stackable type (Reactor) can be built more than once, and each adds its power', () => {
    const core = new CommandCore();
    core.placeStarterRoom('reactor', 0, 0); // active immediately
    const onePower = core.totals().power;
    assert.ok(onePower > 0);
    const second = core.placeStarterRoom('reactor', 1, 0);
    assert.ok(second, 'a second reactor is allowed');
    assert.equal(core.totals().power, onePower * 2, 'two same-tier reactors supply double the power');
  });

  test('a newly placed room is inactive until its build timer elapses, and contributes 0 to totals()', () => {
    const core = new CommandCore();
    const room = core.placeRoom('reactor', 0, 0);
    assert.equal(room.isActive(), false);
    assert.equal(core.totals().power, 0, 'inactive room does not contribute yet');
    finishBuild(room);
    assert.equal(room.isActive(), true);
    assert.equal(core.totals().power, CONFIG.ROOM_TYPES.reactor.tiers[0].power);
  });

  test('upgradeRoomAt advances tier up to the tier cap, no further', () => {
    const core = new CommandCore();
    const room = core.placeRoom('reactor', 0, 0);
    finishBuild(room);
    const maxTier = CONFIG.ROOM_TYPES.reactor.tiers.length;
    for (let i = 1; i < maxTier; i++) core.upgradeRoomAt(0, 0);
    assert.equal(room.tier, maxTier);
    core.upgradeRoomAt(0, 0); // one more past the cap
    assert.equal(room.tier, maxTier, 'tier does not exceed the room def\'s tier count');
  });
});

describe('CommandCore: tech tree', () => {
  test('canUnlockTech requires enough research AND all prereqs met', () => {
    const core = new CommandCore();
    core.research = 1000;
    assert.equal(core.canUnlockTech('hangarAccess'), false, 'blocked: factoryAccess prereq missing');
    core.unlockTech('factoryAccess');
    assert.equal(core.canUnlockTech('hangarAccess'), true);
    assert.equal(core.canUnlockTech('dockAccess'), false, 'blocked: hangarAccess+shieldAccess prereq missing');
  });

  test('unlockTech deducts research exactly once and is idempotent on a second call', () => {
    const core = new CommandCore();
    const node = CONFIG.TECH_TREE.find(n => n.id === 'factoryAccess');
    core.research = node.cost + 5;
    assert.equal(core.unlockTech('factoryAccess'), true);
    assert.equal(core.research, 5);
    assert.equal(core.unlockTech('factoryAccess'), false, 'already unlocked — refuses and does not double-charge');
    assert.equal(core.research, 5);
  });

  test('unlockTech refuses when research is short, and does not partially deduct', () => {
    const core = new CommandCore();
    const node = CONFIG.TECH_TREE.find(n => n.id === 'factoryAccess');
    core.research = node.cost - 1;
    assert.equal(core.unlockTech('factoryAccess'), false);
    assert.equal(core.research, node.cost - 1, 'research untouched on refusal');
  });

  test('the tech tree has no cycles and every prereq id actually exists', () => {
    const byId = new Map(CONFIG.TECH_TREE.map(n => [n.id, n]));
    for (const node of CONFIG.TECH_TREE) {
      for (const p of node.prereq) assert.ok(byId.has(p), `${node.id} references unknown prereq ${p}`);
    }
    // DFS per node tracking the current path only — shared ancestors reached
    // via two different branches (a diamond, e.g. dockAccess depending on
    // both hangarAccess and shieldAccess which both depend on factoryAccess)
    // are fine; only a node reappearing on its OWN path is an actual cycle.
    function walk(id, path) {
      assert.ok(!path.has(id), `cycle detected: ${[...path, id].join(' -> ')}`);
      const nextPath = new Set(path).add(id);
      for (const p of byId.get(id).prereq) walk(p, nextPath);
    }
    for (const node of CONFIG.TECH_TREE) walk(node.id, new Set());
  });
});

describe('CommandCore: module slots', () => {
  test('moduleSlotCount follows CONFIG.ROOM_MODULE_SLOTS_PER_TIER by tier', () => {
    const core = new CommandCore();
    const room = core.placeRoom('reactor', 0, 0);
    finishBuild(room);
    for (let tier = 1; tier <= CONFIG.ROOM_TYPES.reactor.tiers.length; tier++) {
      room.tier = tier;
      assert.equal(room.moduleSlotCount(), CONFIG.ROOM_MODULE_SLOTS_PER_TIER[tier - 1]);
    }
  });

  test('canInstallModule is false without the moduleSlots tech, even on a tier-2+ room with a free slot', () => {
    const core = new CommandCore();
    const room = core.placeRoom('reactor', 0, 0);
    finishBuild(room);
    room.tier = 2;
    assert.equal(core.canInstallModule(room), false);
  });

  test('installModuleAt fills slots up to moduleSlotCount and no further', () => {
    const core = new CommandCore();
    core.research = 1000;
    core.unlockTech('moduleSlots');
    const room = core.placeRoom('reactor', 0, 0);
    finishBuild(room);
    room.tier = CONFIG.ROOM_TYPES.reactor.tiers.length; // max tier, max slots
    const slots = room.moduleSlotCount();
    assert.ok(slots > 0, 'test assumes max tier has at least 1 slot');
    for (let i = 0; i < slots; i++) assert.ok(core.installModuleAt(0, 0), `slot ${i} install should succeed`);
    assert.equal(core.installModuleAt(0, 0), null, 'install beyond slot count refused');
    assert.equal(room.modules.length, slots);
  });

  test('each installed module multiplies the room\'s output stat by (1 + MODULE_BONUS_PCT)', () => {
    const core = new CommandCore();
    core.research = 1000;
    core.unlockTech('moduleSlots');
    const room = core.placeRoom('reactor', 0, 0);
    finishBuild(room);
    room.tier = 2;
    const base = room.stats.power;
    core.installModuleAt(0, 0);
    assert.ok(Math.abs(room.stats.power - base * (1 + CONFIG.MODULE_BONUS_PCT)) < 1e-9);
  });
});
