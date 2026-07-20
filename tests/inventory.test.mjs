import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { Inventory, rollOre, rollDroppedOre, rollItemRarity, rollAffixes } from '../js/inventory.js';
import { freshGame, finishBuild } from './helpers.mjs';

// Same statistical-testing convention tests/spawner.test.mjs already uses for
// Spawner#pickTier()/pickArmorType() — loop many rolls and assert on the
// resulting distribution/membership rather than mocking Math.random.

describe('inventory.js: weighted rolls', () => {
  test('rollOre(tier) only ever returns a key from that tier\'s ORE_LOOT_TABLE', () => {
    const validKeys = new Set(Object.keys(CONFIG.ORE_LOOT_TABLE[0]));
    for (let i = 0; i < 200; i++) {
      assert.ok(validKeys.has(rollOre(1)), 'tier 1 roll stays within tier 1\'s table');
    }
  });

  test('rollOre(3) turns up every ore type over enough rolls, including the ultra-rare diamonds', () => {
    const seen = new Set();
    for (let i = 0; i < 20000; i++) seen.add(rollOre(3));
    assert.deepEqual(seen, new Set(['metal', 'fancyMetal', 'platinum', 'diamonds']));
  });

  test('rollDroppedOre() never returns metal — combat salvage is a distinct table from mining', () => {
    for (let i = 0; i < 500; i++) {
      assert.notEqual(rollDroppedOre(), 'metal');
    }
  });

  test('rollItemRarity(0) mostly rolls grey, matching RARITY_TIERS weights', () => {
    let grey = 0;
    for (let i = 0; i < 2000; i++) if (rollItemRarity(0) === 'grey') grey++;
    assert.ok(grey > 1200, `grey should dominate at bonusPct 0 (got ${grey}/2000)`);
  });

  test('a positive rarityBonusPct shifts weight away from grey', () => {
    let greyAtZero = 0, greyAtBonus = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) if (rollItemRarity(0) === 'grey') greyAtZero++;
    for (let i = 0; i < N; i++) if (rollItemRarity(0.12) === 'grey') greyAtBonus++;
    assert.ok(greyAtBonus < greyAtZero, 'Foundry\'s rarityBonusPct should make grey less common, not more');
  });

  test('rollAffixes: grey rolls zero affixes, gold rolls affixCount unique affixes within range', () => {
    assert.deepEqual(rollAffixes('grey'), []);
    for (let i = 0; i < 50; i++) {
      const affixes = rollAffixes('gold');
      const goldTier = CONFIG.RARITY_TIERS.find(t => t.id === 'gold');
      assert.equal(affixes.length, goldTier.affixCount);
      const ids = new Set(affixes.map(a => a.id));
      assert.equal(ids.size, affixes.length, 'no duplicate affixes on one item');
      for (const affix of affixes) {
        const def = CONFIG.AFFIX_POOL.find(a => a.id === affix.id);
        assert.ok(affix.value >= Math.min(def.min, def.max) && affix.value <= Math.max(def.min, def.max));
      }
    }
  });
});

describe('inventory.js: Inventory class', () => {
  test('addOre accrues both current stock and the permanent lifetimeOreMined total', () => {
    const inv = new Inventory();
    inv.addOre('platinum', 2.5);
    inv.addOre('platinum', 1.5);
    assert.equal(inv.ore.platinum, 4);
    assert.equal(inv.lifetimeOreMined.platinum, 4);
  });

  test('addSalvagedOre adds exactly 1 unit and tracks a separate lifetime counter from mining', () => {
    const inv = new Inventory();
    inv.addSalvagedOre('diamonds');
    assert.equal(inv.ore.diamonds, 1);
    assert.equal(inv.lifetimeOreSalvaged.diamonds, 1);
    assert.equal(inv.lifetimeOreMined.diamonds, 0, 'salvage and mining track separately');
  });

  test('refine() charges exactly the recipe\'s ore cost and refuses (no-op) when short', () => {
    const inv = new Inventory();
    assert.equal(inv.refine('alloy'), false, 'refused: no fancyMetal at all');
    assert.deepEqual(inv.ore, { fancyMetal: 0, platinum: 0, diamonds: 0 });

    inv.addOre('fancyMetal', 3);
    assert.equal(inv.refine('alloy'), true);
    assert.equal(inv.ore.fancyMetal, 0);
    assert.equal(inv.refined.alloy, 1);
  });

  test('craft() charges refined materials and rolls a real item with a valid rarity', () => {
    const inv = new Inventory();
    assert.equal(inv.craft('armorPlate'), null, 'refused: no alloy at all');

    inv.addOre('fancyMetal', 9);
    inv.refine('alloy');
    inv.refine('alloy');
    inv.refine('alloy');
    assert.equal(inv.refined.alloy, 3);

    const item = inv.craft('armorPlate');
    assert.ok(item, 'craft succeeds with exactly enough alloy');
    assert.equal(inv.refined.alloy, 0);
    assert.equal(inv.items.length, 1);
    assert.equal(item.recipeId, 'armorPlate');
    assert.ok(CONFIG.RARITY_TIERS.some(t => t.id === item.rarity));
  });

  test('two crafts of the same recipe are not guaranteed identical — rarity/affixes roll independently', () => {
    const inv = new Inventory();
    inv.addOre('fancyMetal', 300); // 60 alloy (3 fancyMetal each) = exactly enough for 20 armorPlate (3 alloy each)
    for (let i = 0; i < 60; i++) inv.refine('alloy');
    for (let i = 0; i < 20; i++) inv.craft('armorPlate');
    const rarities = new Set(inv.items.map(i => i.rarity));
    assert.ok(rarities.size >= 1, 'sanity: at least one rarity landed');
    // Not asserting >1 distinct rarity (small N could legitimately land all-grey) —
    // just that ids are unique per item, proving each is its own rolled instance.
    const ids = new Set(inv.items.map(i => i.id));
    assert.equal(ids.size, 20);
  });
});

describe('World: Phase 11 skeleton wiring', () => {
  test('orePerSecond() is zero with no Scavengers, and scales with a placed Scavenger\'s tier odds', () => {
    const { world } = freshGame(100000);
    assert.equal(world.orePerSecond('fancyMetal'), 0);

    world.placeScavenger(200, 200);
    const scavenger = world.scavengers[0];
    const expected = world.cyclesPerSecond() * scavenger.metalPerCycle
      * (CONFIG.ORE_LOOT_TABLE[0].fancyMetal / 100);
    assert.ok(Math.abs(world.orePerSecond('fancyMetal') - expected) < 1e-9);
  });

  test('updateOreAccrual(dt) feeds Inventory.ore, never World.metal', () => {
    const { world } = freshGame(100000);
    world.placeScavenger(200, 200);
    const metalBefore = world.metal;
    world.updateOreAccrual(10);
    assert.equal(world.metal, metalBefore, 'metal is untouched by ore accrual');
    assert.ok(world.inventory.ore.fancyMetal > 0, 'fancyMetal accrued over 10 simulated seconds');
  });

  test('refineMaterial()/craftComponent() refuse without an active Factory, succeed once one is built', () => {
    const { world, commandCore } = freshGame(100000);
    world.inventory.addOre('fancyMetal', 10);
    assert.equal(world.refineMaterial('alloy'), false, 'no Factory built yet');
    assert.equal(world.inventory.ore.fancyMetal, 10, 'refused refine touches nothing');

    commandCore.research = 1000;
    commandCore.unlockTech('factoryAccess');
    const factory = world.buildRoom('factory', 0, 0);
    finishBuild(factory);

    assert.equal(world.refineMaterial('alloy'), true);
    assert.equal(world.inventory.refined.alloy, 1);

    world.inventory.refined.alloy = 3;
    const item = world.craftComponent('armorPlate');
    assert.ok(item, 'craft succeeds once Factory is active');
  });

  test('rollKillDrops(): over many calls, ore/component drops land roughly at the configured chances', () => {
    const { world } = freshGame(0);
    const N = 5000;
    for (let i = 0; i < N; i++) world.rollKillDrops();
    const oreDrops = Object.values(world.inventory.lifetimeOreSalvaged).reduce((a, b) => a + b, 0);
    const oreRate = oreDrops / N;
    assert.ok(Math.abs(oreRate - CONFIG.ENEMY_ORE_DROP_CHANCE) < 0.03,
      `ore drop rate ${oreRate} should track ENEMY_ORE_DROP_CHANCE ${CONFIG.ENEMY_ORE_DROP_CHANCE}`);

    const componentRate = world.inventory.items.length / N;
    assert.ok(Math.abs(componentRate - CONFIG.ENEMY_COMPONENT_DROP_CHANCE) < 0.02,
      `component drop rate ${componentRate} should track ENEMY_COMPONENT_DROP_CHANCE ${CONFIG.ENEMY_COMPONENT_DROP_CHANCE}`);
  });
});
