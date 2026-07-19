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
  test('powerFactor() never drops below BROWNOUT_MIN_FIRE_RATE_MULT no matter how many towers are placed with zero Reactor built', () => {
    // Phase 4d: towerCost() is a flat constant now (Reactor no longer discounts
    // it — see changelog v1.6), so the analogous floor to guard is powerFactor()'s
    // brownout clamp instead of a cost floor.
    const { world } = freshGame(100000);
    for (let i = 0; i < CONFIG.TOWER_MAX_COUNT; i++) world.placeTower(200 + i * 60, 200);
    assert.ok(world.powerFactor() >= CONFIG.BROWNOUT_MIN_FIRE_RATE_MULT,
      `powerFactor() hit ${world.powerFactor()} at max tower count with no Reactor — brownout floor failed`);
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

describe('balance: Phase 4b costs never get cheaper the more you buy', () => {
  test('World.towerUpgradeCost() strictly increases with tower tier', () => {
    const { world } = freshGame(100000);
    const tower = world.placeTower(200, 200);
    let prevCost = -Infinity;
    while (tower.canUpgrade()) {
      const cost = world.towerUpgradeCost(tower);
      assert.ok(cost > prevCost, `towerUpgradeCost() did not increase at tier ${tower.tier}: ${prevCost} -> ${cost}`);
      prevCost = cost;
      tower.upgrade();
    }
  });

  test('World.rushBuildCost() is always positive for any remaining build time > 0 (never a free rush)', () => {
    const { commandCore } = freshGame(0);
    const room = commandCore.placeRoom('reactor', 0, 0);
    for (const remaining of [0.01, 1, room.buildTimeTotal]) {
      room.buildTimeRemaining = remaining;
      const cost = Math.ceil(remaining * CONFIG.FAST_BUILD_GOLD_PER_SECOND);
      assert.ok(cost > 0, `rush cost for ${remaining}s remaining was ${cost}`);
    }
  });
});

describe('balance: Phase 4c metal economy stays structurally sane', () => {
  test('World.scavengerUpgradeCost() strictly increases with tier', () => {
    const { world } = freshGame(100000);
    const scavenger = world.placeScavenger(200, 200);
    let prevCost = -Infinity;
    while (scavenger.canUpgrade()) {
      const cost = world.scavengerUpgradeCost(scavenger);
      assert.ok(cost > prevCost, `scavengerUpgradeCost() did not increase at tier ${scavenger.tier}: ${prevCost} -> ${cost}`);
      prevCost = cost;
      scavenger.upgrade();
    }
  });

  test('metalPerSecond() is never negative at any producer count or Command Core investment', () => {
    const { world } = freshGame(100000);
    assert.ok(world.metalPerSecond() >= 0, 'no producers');
    for (let i = 0; i < 5; i++) world.placeScavenger(200 + i * 60, 200);
    assert.ok(world.metalPerSecond() >= 0, 'several scavengers');
    const mine = world.buildRoom('mine', 0, 0);
    finishBuild(mine);
    assert.ok(world.metalPerSecond() >= 0, 'plus an active mine');
  });

  test('a day-one starter Scavenger Turret earns enough metal for a second Scavenger Turret within a reasonable time', () => {
    const { world } = freshGame(0);
    world.placeStarterScavenger(200, 200);
    const secondsNeeded = CONFIG.SCAVENGER_COST / world.metalPerSecond();
    assert.ok(secondsNeeded < 300,
      `the starter Scavenger Turret alone needs ${Math.round(secondsNeeded)}s to afford a second one — that's a long stall this early`);
  });
});

describe('balance: combo streak bonus stays bounded no matter how long a run goes', () => {
  test("rewardMultiplier()'s combo contribution never exceeds 1 + COMBO_MAX_STACKS * COMBO_BONUS_PER_STACK", () => {
    const { world } = freshGame(0);
    const baseMult = world.rewardMultiplier(); // streak 0
    const maxComboFactor = 1 + CONFIG.COMBO_MAX_STACKS * CONFIG.COMBO_BONUS_PER_STACK;

    world.comboStreak = CONFIG.COMBO_MAX_STACKS;
    const cappedMult = world.rewardMultiplier();
    assert.ok(Math.abs(cappedMult - baseMult * maxComboFactor) < 1e-9);

    world.comboStreak = CONFIG.COMBO_MAX_STACKS * 100; // a run that never stops killing
    assert.equal(world.rewardMultiplier(), cappedMult, 'an unbounded streak must not unbound the multiplier');
  });
});

describe('balance: Market trading ratios stay sane', () => {
  test('MARKET_TRADE_BASE_RATIO is positive (a 0-or-negative ratio would make trading pointless or pay you)', () => {
    assert.ok(CONFIG.MARKET_TRADE_BASE_RATIO > 0);
  });
});

describe('balance: room-type key mapping (game.js number-key selector) stays sane', () => {
  // Regression guard for the Phase 4c bug where inserting `mine` into ROOM_TYPES
  // silently desynced game.js's number-key handler and index.html's build-bar
  // labels from the actual key order. game.js's keyOrder array supports exactly
  // 10 slots ('1'-'9' then '0') — if ROOM_TYPES ever grows past that, the same
  // class of bug (a room type with no reachable key) happens again silently.
  test('CONFIG.ROOM_TYPES has at most 10 entries — game.js\'s number-key selector only supports 10 slots', () => {
    const count = Object.keys(CONFIG.ROOM_TYPES).length;
    assert.ok(count <= 10,
      `ROOM_TYPES has ${count} entries — game.js's keyOrder ('1'-'9','0') can't address a room type past slot 10`);
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

describe('balance: Phase 7a Damage Triangle stays a well-formed 3-cycle', () => {
  test('every type beats exactly one other type, and no type beats itself', () => {
    const types = Object.keys(CONFIG.DAMAGE_TYPES);
    assert.equal(types.length, 3, 'the triangle is only well-formed at exactly 3 types');
    for (const type of types) {
      const beats = CONFIG.DAMAGE_TYPES[type].beats;
      assert.ok(types.includes(beats), `${type} beats '${beats}', which isn't a real damage type`);
      assert.notEqual(beats, type, `${type} can't beat itself`);
    }
  });

  test('the beats graph forms exactly one 3-cycle (each type is beaten by exactly one other)', () => {
    // A malformed table could have two types both beating the same third type,
    // leaving the last type unbeaten by anyone — still "3 beats entries" but
    // not a real rock-paper-scissors triangle. Count incoming edges per type.
    const types = Object.keys(CONFIG.DAMAGE_TYPES);
    const beatenCounts = Object.fromEntries(types.map(t => [t, 0]));
    for (const type of types) beatenCounts[CONFIG.DAMAGE_TYPES[type].beats]++;
    for (const type of types) {
      assert.equal(beatenCounts[type], 1, `${type} should be beaten by exactly one other type, got ${beatenCounts[type]}`);
    }
  });

  test('ADVANTAGE_MULT > 1, DISADVANTAGE_MULT is between 0 and 1 (never free/negative damage)', () => {
    assert.ok(CONFIG.DAMAGE_TYPE_ADVANTAGE_MULT > 1);
    assert.ok(CONFIG.DAMAGE_TYPE_DISADVANTAGE_MULT > 0 && CONFIG.DAMAGE_TYPE_DISADVANTAGE_MULT < 1);
  });
});
