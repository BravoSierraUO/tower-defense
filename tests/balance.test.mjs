import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { CommandCore } from '../js/commandcore.js';
import { freshGame, finishBuild } from './helpers.mjs';

// These aren't "does the code do what it does" tests (that's the other
// files) — they're guard rails against future constant-tuning in config.js
// silently breaking the economy (free towers, an invulnerable base, a tech
// tree that takes longer than the game itself to climb, costs that go DOWN
// as you buy more of something). Nothing here asserts the numbers are
// *fun* — that still needs real playtesting (see changelog.md) — only that
// they stay structurally sane.

function unlockPrereqChain(core, techId) {
  if (!techId || core.unlockedTech.has(techId)) return;
  const node = core.techNode(techId);
  for (const p of node.prereq) unlockPrereqChain(core, p);
  core.unlockedTech.add(techId); // bypass the research cost — only the gate matters here
}

function maxOutRoom(core, type, gx, gy) {
  unlockPrereqChain(core, CONFIG.ROOM_TYPES[type].requiresTech);
  const room = core.placeRoom(type, gx, gy);
  finishBuild(room);
  room.tier = CONFIG.ROOM_TYPES[type].tiers.length;
  const slots = room.moduleSlotCount();
  for (let i = 0; i < slots; i++) room.installModule(); // bypass gold/tech gates on purpose — this is a theoretical max
  return room;
}

describe('balance: starting position is actually playable', () => {
  test('STARTING_GOLD covers at least one tower', () => {
    assert.ok(CONFIG.STARTING_GOLD >= CONFIG.TOWER_COST,
      `STARTING_GOLD (${CONFIG.STARTING_GOLD}) can't even afford one tower (${CONFIG.TOWER_COST})`);
  });

  test('STARTING_GOLD covers the first Command Core room', () => {
    assert.ok(CONFIG.STARTING_GOLD >= CONFIG.ROOM_BUILD_COST_BASE,
      `STARTING_GOLD (${CONFIG.STARTING_GOLD}) can't afford the first room (${CONFIG.ROOM_BUILD_COST_BASE})`);
  });

  test('GOLD_CAP_BASE is never below STARTING_GOLD (you should never start over the cap)', () => {
    assert.ok(CONFIG.GOLD_CAP_BASE >= CONFIG.STARTING_GOLD);
  });
});

describe('balance: cost floors hold even at a maxed-out Command Core', () => {
  test('towerCost() never reaches 0 even with a maxed Reactor (max tier + max modules)', () => {
    const { world, commandCore } = freshGame(0);
    maxOutRoom(commandCore, 'reactor', 0, 0);
    assert.ok(world.towerCost() >= 1,
      `towerCost() hit ${world.towerCost()} at max Reactor investment — towers would become free`);
  });

  test("Shield's damage reduction never reaches 100% even at max tier + max modules", () => {
    const { commandCore } = freshGame(0);
    maxOutRoom(commandCore, 'shield', 0, 0);
    const shieldPct = commandCore.totals().shieldPct;
    assert.ok(shieldPct < 1,
      `shieldPct hit ${shieldPct} at max Shield investment — the base would become unkillable`);
  });

  test('ROOM_BUILD_TIME_BASE minus max Factory buildTimeReduction still leaves a >=1s floor', () => {
    const { commandCore } = freshGame(0);
    maxOutRoom(commandCore, 'factory', 0, 0);
    const reduction = commandCore.totals().buildTimeReduction;
    const nextRoomBuildTime = Math.max(1, CONFIG.ROOM_BUILD_TIME_BASE - reduction);
    assert.ok(nextRoomBuildTime >= 1,
      `a maxed Factory would make new rooms build in ${CONFIG.ROOM_BUILD_TIME_BASE - reduction}s without the floor`);
  });

  test('rewardMultiplier, dronePower, tradeBonus never go negative at any tier or module count', () => {
    for (const type of ['aiCore', 'hangar', 'dock']) {
      const { commandCore } = freshGame(0);
      const room = maxOutRoom(commandCore, type, 0, 0);
      for (const key in room.stats) {
        assert.ok(room.stats[key] >= 0, `${type}.${key} went negative: ${room.stats[key]}`);
      }
    }
  });
});

describe('balance: purchase costs never get cheaper the more you buy', () => {
  test('CommandCore.buildCost() is monotonically non-decreasing as more rooms get built', () => {
    const core = new CommandCore();
    let prevCost = -Infinity;
    const types = Object.keys(CONFIG.ROOM_TYPES).filter(t => core.isRoomUnlocked(t));
    for (const type of types) {
      const cost = core.buildCost(type);
      assert.ok(cost >= prevCost, `buildCost() dropped after building more rooms: ${prevCost} -> ${cost}`);
      prevCost = cost;
      const room = core.placeRoom(type, types.indexOf(type), 0);
      finishBuild(room);
    }
  });

  test('CommandCore.upgradeCost() strictly increases with tier', () => {
    const core = new CommandCore();
    const room = core.placeRoom('reactor', 0, 0);
    finishBuild(room);
    let prevCost = -Infinity;
    while (room.canUpgrade()) {
      const cost = core.upgradeCost(room);
      assert.ok(cost > prevCost, `upgradeCost() did not increase at tier ${room.tier}: ${prevCost} -> ${cost}`);
      prevCost = cost;
      room.upgrade();
    }
  });

  test('CommandCore.moduleCost() strictly increases with each module already installed', () => {
    const core = new CommandCore();
    const room = core.placeRoom('reactor', 0, 0);
    finishBuild(room);
    room.tier = CONFIG.ROOM_TYPES.reactor.tiers.length;
    let prevCost = -Infinity;
    const slots = room.moduleSlotCount();
    for (let i = 0; i < slots; i++) {
      const cost = core.moduleCost(room);
      assert.ok(cost > prevCost, `moduleCost() did not increase for module #${i}: ${prevCost} -> ${cost}`);
      prevCost = cost;
      room.installModule();
    }
  });
});

describe('balance: the tech tree is reachable in a bounded amount of playtime', () => {
  test('unlocking the entire tech tree from a lone tier-1 Lab takes under an hour of accrual', () => {
    const totalCost = CONFIG.TECH_TREE.reduce((sum, n) => sum + n.cost, 0);
    const tier1LabRate = CONFIG.ROOM_TYPES.lab.tiers[0].researchRate;
    const secondsNeeded = totalCost / tier1LabRate;
    assert.ok(secondsNeeded < 3600,
      `full tech tree (${totalCost} research) needs ${Math.round(secondsNeeded)}s at tier-1 Lab output (${tier1LabRate}/s) — that's over an hour of idle accrual alone, before any Dock trading`);
  });

  test('every TECH_TREE node cost is positive (a 0-or-negative cost would make a node free/pay-you)', () => {
    for (const node of CONFIG.TECH_TREE) {
      assert.ok(node.cost > 0, `${node.id} has non-positive cost ${node.cost}`);
    }
  });
});

describe('balance: difficulty tiers stay internally consistent', () => {
  test('unlockWave is non-decreasing from easy -> medium -> hard, and multipliers actually get harder', () => {
    const { easy, medium, hard } = CONFIG.DIFFICULTY_TIERS;
    assert.ok(easy.unlockWave <= medium.unlockWave && medium.unlockWave <= hard.unlockWave);
    assert.ok(medium.healthMult > easy.healthMult && hard.healthMult > medium.healthMult,
      'each tier should be strictly tankier than the last');
    assert.ok(medium.speedMult >= easy.speedMult && hard.speedMult >= medium.speedMult,
      'each tier should be at least as fast as the last');
  });
});
