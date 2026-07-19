import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { Enemy } from '../js/enemy.js';
import { freshGame, finishBuild } from './helpers.mjs';

const AWAY_FROM_BASE = 200; // > TOWER_MIN_BASE_DISTANCE, inside world bounds

describe('World: tower economy', () => {
  test('placeTower charges exactly towerCost() (metal) and refuses when metal is short', () => {
    const { world } = freshGame(CONFIG.TOWER_COST - 1);
    assert.equal(world.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE), null, 'refused: not enough metal');
    assert.equal(world.metal, CONFIG.TOWER_COST - 1, 'metal untouched on refusal');

    world.metal = CONFIG.TOWER_COST;
    const tower = world.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE);
    assert.ok(tower, 'placement succeeds with exact metal');
    assert.equal(world.metal, 0);
    assert.equal(tower.cost, CONFIG.TOWER_COST);
  });

  test('sellTowerAt refunds TOWER_SELL_REFUND_PCT of what was actually paid, in metal', () => {
    const { world } = freshGame(CONFIG.TOWER_COST);
    world.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE);
    assert.equal(world.metal, 0);
    assert.equal(world.sellTowerAt(AWAY_FROM_BASE, AWAY_FROM_BASE), true);
    assert.equal(world.metal, Math.round(CONFIG.TOWER_COST * CONFIG.TOWER_SELL_REFUND_PCT));
    assert.equal(world.towers.length, 0);
  });

  test('Reactor power discounts towerCost() and scavengerCost() (both metal-denominated)', () => {
    const { world } = freshGame(100000);
    const baseTowerCost = world.towerCost();
    const baseScavengerCost = world.scavengerCost();

    const reactor = world.buildRoom('reactor', 0, 0);
    finishBuild(reactor);
    assert.ok(world.towerCost() < baseTowerCost, 'active reactor cheapens towers');
    assert.ok(world.scavengerCost() < baseScavengerCost, 'active reactor cheapens scavenger turrets too');
  });

  test('Storage raises goldCap() and addGold() clamps to it', () => {
    const { world } = freshGame(0);
    const baseCap = world.goldCap();
    world.addGold(baseCap + 1000);
    assert.equal(world.gold, baseCap, 'gold clamped at the (unmodified) cap');

    const storage = world.buildRoom('storage', 0, 0);
    finishBuild(storage);
    const newCap = world.goldCap();
    assert.ok(newCap > baseCap, 'active storage raises the cap');
    world.addGold(newCap);
    assert.equal(world.gold, newCap);
  });
});

describe('World: Command Core room economy', () => {
  test('buildRoom charges buildCost() and cost grows with each room already built', () => {
    const { world, commandCore } = freshGame(100000);
    const firstCost = commandCore.buildCost('reactor');
    assert.equal(firstCost, CONFIG.ROOM_BUILD_COST_BASE, 'first room costs exactly the base');

    const goldBefore = world.gold;
    world.buildRoom('reactor', 0, 0);
    assert.equal(goldBefore - world.gold, firstCost);

    const secondCost = commandCore.buildCost('aiCore');
    assert.equal(secondCost, CONFIG.ROOM_BUILD_COST_BASE + CONFIG.ROOM_BUILD_COST_GROWTH, 'cost grows per room already built');
  });

  test('buildRoom refuses and does not deduct gold when short', () => {
    const { world } = freshGame(CONFIG.ROOM_BUILD_COST_BASE - 1);
    assert.equal(world.buildRoom('reactor', 0, 0), null);
    assert.equal(world.gold, CONFIG.ROOM_BUILD_COST_BASE - 1);
  });

  test('upgradeRoom refuses on an inactive (still-building) room, then succeeds once built, charging upgradeCost()', () => {
    const { world, commandCore } = freshGame(100000);
    const room = world.buildRoom('reactor', 0, 0);
    assert.equal(world.upgradeRoom(0, 0), null, 'refused: room still under construction');
    finishBuild(room);

    const cost = commandCore.upgradeCost(room);
    const goldBefore = world.gold;
    assert.ok(world.upgradeRoom(0, 0));
    assert.equal(goldBefore - world.gold, cost);
    assert.equal(room.tier, 2);
  });

  test('installModuleAt refuses without the moduleSlots tech and charges moduleCost() once unlocked', () => {
    const { world, commandCore } = freshGame(100000);
    const room = world.buildRoom('reactor', 0, 0);
    finishBuild(room);
    world.upgradeRoom(0, 0); // tier 2 -> has a slot once tech is unlocked

    assert.equal(world.installModuleAt(0, 0), null, 'refused: moduleSlots tech not unlocked');

    commandCore.research = 1000;
    commandCore.unlockTech('moduleSlots');
    const cost = commandCore.moduleCost(room);
    const goldBefore = world.gold;
    assert.ok(world.installModuleAt(0, 0));
    assert.equal(goldBefore - world.gold, cost);
  });

  test('tradeAtDock is unavailable with no active Dock, and converts gold to research at base+tier ratio once built', () => {
    const { world, commandCore } = freshGame(100000);
    assert.equal(world.tradeAtDock(), false, 'no dock built yet');

    commandCore.research = 1000;
    commandCore.unlockTech('factoryAccess');
    commandCore.unlockTech('hangarAccess');
    commandCore.unlockTech('shieldAccess');
    commandCore.unlockTech('dockAccess');
    const dock = world.buildRoom('dock', 0, 0);
    finishBuild(dock);

    const goldBefore = world.gold;
    const researchBefore = commandCore.research;
    assert.equal(world.tradeAtDock(), true);
    assert.equal(goldBefore - world.gold, CONFIG.DOCK_TRADE_GOLD_COST);
    const expectedGain = CONFIG.DOCK_TRADE_GOLD_COST * (CONFIG.DOCK_TRADE_BASE_RATIO + dock.stats.tradeBonus);
    assert.ok(Math.abs(commandCore.research - researchBefore - expectedGain) < 1e-9);
  });
});

describe('World: combo streak (Phase 4b)', () => {
  function killEnemies(world, count) {
    for (let i = 0; i < count; i++) {
      const e = new Enemy(0, 0, 0, 0);
      e.health = -1;
      world.enemies.push(e);
    }
    world.updateEnemies(0.01);
  }

  test('consecutive kills raise comboStreak and rewardMultiplier(); the streak decays after COMBO_WINDOW of no kills', () => {
    const { world } = freshGame(0);
    const baseMult = world.rewardMultiplier();

    killEnemies(world, 3);
    assert.equal(world.comboStreak, 3);
    assert.ok(world.rewardMultiplier() > baseMult, 'an active streak boosts rewardMultiplier()');

    world.updateEnemies(CONFIG.COMBO_WINDOW + 0.1); // no kills this tick — window expires
    assert.equal(world.comboStreak, 0);
    assert.equal(world.rewardMultiplier(), baseMult);
  });

  test('a kill within COMBO_WINDOW keeps the streak alive across ticks', () => {
    const { world } = freshGame(0);
    killEnemies(world, 1);
    world.updateEnemies(CONFIG.COMBO_WINDOW / 2); // still inside the window
    assert.equal(world.comboStreak, 1, 'streak should not have decayed yet');
    killEnemies(world, 1);
    assert.equal(world.comboStreak, 2);
  });
});

describe('World: base passive income (Phase 4b)', () => {
  test('updatePassiveIncome adds BASE_PASSIVE_INCOME_PER_LEVEL * level gold per second, clamped to goldCap()', () => {
    const { world } = freshGame(0);
    world.updatePassiveIncome(10, 5); // 10s at profile level 5
    assert.ok(Math.abs(world.gold - 5 * CONFIG.BASE_PASSIVE_INCOME_PER_LEVEL * 10) < 1e-9);

    world.gold = world.goldCap();
    world.updatePassiveIncome(10, 5);
    assert.equal(world.gold, world.goldCap(), 'clamped at the cap like any other gold gain');
  });
});

describe('World: Fast-Build rush (Phase 4b)', () => {
  test('rushBuildRoom charges rushBuildCost() and zeroes the remaining timer; refuses once active', () => {
    const { world } = freshGame(100000);
    const room = world.buildRoom('reactor', 0, 0);
    assert.ok(room.buildTimeRemaining > 0, 'sanity: room actually needs time to build');

    const cost = world.rushBuildCost(room);
    const goldBefore = world.gold;
    assert.ok(world.rushBuildRoom(0, 0));
    assert.equal(goldBefore - world.gold, cost);
    assert.equal(room.buildTimeRemaining, 0);
    assert.ok(room.isActive());

    assert.equal(world.rushBuildRoom(0, 0), null, 'refused: already active, nothing left to rush');
  });

  test('rushBuildRoom refuses when gold is short and leaves the timer untouched', () => {
    const { world } = freshGame(CONFIG.ROOM_BUILD_COST_BASE);
    world.buildRoom('reactor', 0, 0);
    assert.equal(world.gold, 0);
    const remainingBefore = world.commandCore.getRoomAt(0, 0).buildTimeRemaining;
    assert.equal(world.rushBuildRoom(0, 0), null);
    assert.equal(world.commandCore.getRoomAt(0, 0).buildTimeRemaining, remainingBefore);
  });
});

describe('World: tower upgrades (Phase 4b)', () => {
  test('towerUpgradeCost() starts at TOWER_UPGRADE_COST_BASE and grows by TOWER_UPGRADE_COST_GROWTH per tier', () => {
    const { world } = freshGame(100000);
    const tower = world.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE);
    assert.equal(world.towerUpgradeCost(tower), CONFIG.TOWER_UPGRADE_COST_BASE);
    assert.ok(world.upgradeTower(tower));
    assert.equal(tower.tier, 2);
    assert.equal(world.towerUpgradeCost(tower), Math.round(CONFIG.TOWER_UPGRADE_COST_BASE * CONFIG.TOWER_UPGRADE_COST_GROWTH));
  });

  test('upgradeTower charges metal, raises damage, and refuses past the max tier or when metal is short', () => {
    const { world } = freshGame(100000);
    const tower = world.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE);
    const baseDamage = tower.damage;
    while (tower.canUpgrade()) {
      const cost = world.towerUpgradeCost(tower);
      const metalBefore = world.metal;
      assert.ok(world.upgradeTower(tower));
      assert.equal(metalBefore - world.metal, cost);
    }
    assert.ok(tower.damage > baseDamage, 'fully upgraded tower deals more damage than tier 1');
    assert.equal(world.upgradeTower(tower), false, 'refused: already at max tier');

    const { world: poorWorld } = freshGame(CONFIG.TOWER_COST);
    const poorTower = poorWorld.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE);
    assert.equal(poorWorld.metal, 0);
    assert.equal(poorWorld.upgradeTower(poorTower), false, 'refused: not enough metal');
  });

  test('towerAt() finds a placed tower from any point inside its snapped grid cell', () => {
    const { world } = freshGame(CONFIG.TOWER_COST);
    const tower = world.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE);
    // AWAY_FROM_BASE lands exactly on a grid line, so nudge both points forward
    // to stay inside the same snapped cell as the tower instead of straddling it.
    assert.equal(world.towerAt(AWAY_FROM_BASE + 3, AWAY_FROM_BASE + 12), tower);
    assert.equal(world.towerAt(AWAY_FROM_BASE + 1000, AWAY_FROM_BASE), null);
  });
});

describe('World: Scavenger Turret economy (Phase 4c)', () => {
  test('placeScavenger charges exactly scavengerCost() (metal) and refuses when metal is short', () => {
    const { world } = freshGame(CONFIG.SCAVENGER_COST - 1);
    assert.equal(world.placeScavenger(AWAY_FROM_BASE, AWAY_FROM_BASE), null, 'refused: not enough metal');

    world.metal = CONFIG.SCAVENGER_COST;
    const scavenger = world.placeScavenger(AWAY_FROM_BASE, AWAY_FROM_BASE);
    assert.ok(scavenger, 'placement succeeds with exact metal');
    assert.equal(world.metal, 0);
    assert.equal(scavenger.cost, CONFIG.SCAVENGER_COST);
  });

  test('sellScavengerAt refunds TOWER_SELL_REFUND_PCT of what was actually paid', () => {
    const { world } = freshGame(CONFIG.SCAVENGER_COST);
    world.placeScavenger(AWAY_FROM_BASE, AWAY_FROM_BASE);
    assert.equal(world.sellScavengerAt(AWAY_FROM_BASE, AWAY_FROM_BASE), true);
    assert.equal(world.metal, Math.round(CONFIG.SCAVENGER_COST * CONFIG.TOWER_SELL_REFUND_PCT));
    assert.equal(world.scavengers.length, 0);
  });

  test('upgradeScavenger charges metal, raises metalPerCycle, and refuses past the max tier', () => {
    const { world } = freshGame(100000);
    const scavenger = world.placeScavenger(AWAY_FROM_BASE, AWAY_FROM_BASE);
    const baseOutput = scavenger.metalPerCycle;
    while (scavenger.canUpgrade()) {
      const cost = world.scavengerUpgradeCost(scavenger);
      const metalBefore = world.metal;
      assert.ok(world.upgradeScavenger(scavenger));
      assert.equal(metalBefore - world.metal, cost);
    }
    assert.ok(scavenger.metalPerCycle > baseOutput);
    assert.equal(world.upgradeScavenger(scavenger), false, 'refused: already at max tier');
  });

  test('Tower and Scavenger Turret share the exterior grid — neither can occupy the other\'s cell', () => {
    const { world } = freshGame(100000);
    world.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE);
    assert.equal(world.placeScavenger(AWAY_FROM_BASE, AWAY_FROM_BASE), null, 'refused: cell has a tower');

    world.placeScavenger(AWAY_FROM_BASE + 200, AWAY_FROM_BASE);
    assert.equal(world.placeTower(AWAY_FROM_BASE + 200, AWAY_FROM_BASE), null, 'refused: cell has a scavenger');
  });
});

describe('World: Mine room and the AI Cycle Budget scheduler (Phase 4c)', () => {
  test('metalPerSecond() is 0 with no metal producers built', () => {
    const { world } = freshGame(0);
    assert.equal(world.metalPerSecond(), 0);
  });

  test('BASE_CYCLES_PER_MIN gives a lone Scavenger Turret nonzero output with zero AI Core built', () => {
    const { world } = freshGame(CONFIG.SCAVENGER_COST);
    world.placeScavenger(AWAY_FROM_BASE, AWAY_FROM_BASE);
    assert.ok(world.metalPerSecond() > 0, 'the always-on cycle floor should feed a lone producer');
  });

  test('more active producers dilutes each one\'s share (fixed cycle budget, split evenly)', () => {
    const { world } = freshGame(100000);
    world.placeScavenger(AWAY_FROM_BASE, AWAY_FROM_BASE);
    const oneProducerTotal = world.metalPerSecond(); // one producer -> total IS its share

    world.placeScavenger(AWAY_FROM_BASE + 200, AWAY_FROM_BASE);
    const twoProducerTotal = world.metalPerSecond();
    const twoProducerShare = twoProducerTotal / 2; // same-tier scavengers split the budget evenly

    assert.ok(twoProducerShare < oneProducerTotal, 'a second producer dilutes each one\'s individual share');
    assert.ok(Math.abs(twoProducerTotal - oneProducerTotal) < 1e-9,
      'a fixed cycle budget split across equal-tier producers keeps TOTAL throughput flat, not additive — ' +
      'this is the "turret count and AI clock speed have to scale together" dilution the roadmap describes');
  });

  test('an active Mine room contributes to activeMetalProducers() and metalPerSecond()', () => {
    const { world } = freshGame(100000);
    const before = world.metalPerSecond();
    const mine = world.buildRoom('mine', 0, 0);
    finishBuild(mine);
    assert.ok(world.metalPerSecond() > before, 'an active Mine adds to the shared cycle budget throughput');
  });

  test('AI Core cyclesPerMin raises cyclesPerSecond() and therefore metalPerSecond()', () => {
    const { world } = freshGame(100000);
    world.placeScavenger(AWAY_FROM_BASE, AWAY_FROM_BASE);
    const baseRate = world.metalPerSecond();

    const aiCore = world.buildRoom('aiCore', 1, 0);
    finishBuild(aiCore);
    assert.ok(world.metalPerSecond() > baseRate, 'an active AI Core raises the shared cycle budget');
  });

  test('rewardMultiplier() no longer includes any AI Core contribution (Phase 4c reframe)', () => {
    const { world } = freshGame(100000);
    const before = world.rewardMultiplier();
    const aiCore = world.buildRoom('aiCore', 0, 0);
    finishBuild(aiCore);
    assert.equal(world.rewardMultiplier(), before, 'AI Core now feeds the Cycle Budget, not gold rewards');
  });
});

describe('World/CommandCore: onboarding-guarantee starters (Phase 4c)', () => {
  test('placeStarterRoom force-places an already-active room, bypassing cost/tech gates', () => {
    const { commandCore } = freshGame(0);
    const reactor = commandCore.placeStarterRoom('reactor', 0, 0);
    assert.ok(reactor.isActive(), 'starter room is active immediately, no build timer');
    assert.equal(commandCore.isBuilt('reactor'), true);
    assert.ok(commandCore.totals().power > 0);
  });

  test('placeStarterScavenger force-places a working, already-producing Scavenger Turret at zero cost', () => {
    const { world } = freshGame(0);
    const scavenger = world.placeStarterScavenger(AWAY_FROM_BASE, AWAY_FROM_BASE);
    assert.equal(scavenger.cost, 0);
    assert.equal(world.scavengers.length, 1);
    assert.ok(world.metalPerSecond() > 0, 'day-one guarantee: metal accrues before anything else is built');
  });

  test('day-one guarantee: a Game-shaped commandCore+world produces metal immediately, no player action needed', () => {
    const { commandCore, world } = freshGame(0);
    commandCore.placeStarterRoom('reactor', 0, 0);
    world.placeStarterScavenger(AWAY_FROM_BASE, AWAY_FROM_BASE);
    assert.ok(world.metalPerSecond() > 0);
    assert.ok(world.towerCost() < CONFIG.TOWER_COST, 'the starter Reactor\'s power discount is already live too');
  });
});

describe('World: base repair (Phase 4b)', () => {
  test('repairBase heals for gold, clamps to missing HP, and refuses once full', () => {
    const { world } = freshGame(100000);
    world.base.health = 50;
    const cost = world.repairBaseCost(20);
    const goldBefore = world.gold;
    assert.ok(world.repairBase(20));
    assert.equal(world.base.health, 70);
    assert.equal(goldBefore - world.gold, cost);

    assert.ok(world.repairBase(1000), 'succeeds even when requested amount overshoots missing HP');
    assert.equal(world.base.health, world.base.maxHealth, 'clamped to max, not overhealed');

    assert.equal(world.repairBase(10), false, 'refused: already at full health');
  });

  test('repairBase refuses when gold is short and leaves health untouched', () => {
    const { world } = freshGame(0);
    world.base.health = 50;
    assert.equal(world.repairBase(20), false);
    assert.equal(world.base.health, 50);
  });
});
