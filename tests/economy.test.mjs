import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { freshGame, finishBuild } from './helpers.mjs';

const AWAY_FROM_BASE = 200; // > TOWER_MIN_BASE_DISTANCE, inside world bounds

describe('World: tower economy', () => {
  test('placeTower charges exactly towerCost() and refuses when gold is short', () => {
    const { world } = freshGame(CONFIG.TOWER_COST - 1);
    assert.equal(world.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE), null, 'refused: not enough gold');
    assert.equal(world.gold, CONFIG.TOWER_COST - 1, 'gold untouched on refusal');

    world.gold = CONFIG.TOWER_COST;
    const tower = world.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE);
    assert.ok(tower, 'placement succeeds with exact gold');
    assert.equal(world.gold, 0);
    assert.equal(tower.cost, CONFIG.TOWER_COST);
  });

  test('sellTowerAt refunds TOWER_SELL_REFUND_PCT of what was actually paid', () => {
    const { world } = freshGame(CONFIG.TOWER_COST);
    world.placeTower(AWAY_FROM_BASE, AWAY_FROM_BASE);
    assert.equal(world.gold, 0);
    assert.equal(world.sellTowerAt(AWAY_FROM_BASE, AWAY_FROM_BASE), true);
    assert.equal(world.gold, Math.round(CONFIG.TOWER_COST * CONFIG.TOWER_SELL_REFUND_PCT));
    assert.equal(world.towers.length, 0);
  });

  test('Reactor power discounts towerCost(); AI Core compute boosts rewardMultiplier()', () => {
    const { world, commandCore } = freshGame(100000);
    const baseCost = world.towerCost();
    const baseMult = world.rewardMultiplier();

    const reactor = world.buildRoom('reactor', 0, 0);
    finishBuild(reactor);
    assert.ok(world.towerCost() < baseCost, 'active reactor cheapens towers');

    const aiCore = world.buildRoom('aiCore', 1, 0);
    finishBuild(aiCore);
    assert.ok(world.rewardMultiplier() > baseMult, 'active AI Core boosts reward multiplier');
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
