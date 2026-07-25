// Phase 20: the two per-stat upgrade ladders (docs/economy-redesign.md §I).
//
//   PERMANENT — bought in prep with iron, survives runs.
//   TEMPORARY — bought during a run with scrap, wiped when the run ends.
//
// The chain under test:
//   effective = BASE x tierMult x permMult x runMult x itemAffixMult
//
// The invariant these defend is the same one the currency split defends from the
// other side: **a scrap-bought boost can never become permanent power.** The
// currency tests prove scrap dies; these prove what scrap BOUGHT dies too. Both
// halves are needed — a temporary buff that outlived its pool would be the same
// leak by a different route.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { freshGame } from './helpers.mjs';

const SPOT = { x: CONFIG.BASE_RING_RADIUS + CONFIG.GRID_SIZE * 2, y: 0 };
const M = CONFIG.STAT_UPGRADE_MULT;

// A funded world with one placed tower, already in prep.
function withTower(iron = 100000) {
  const { world } = freshGame(iron);
  const tower = world.placeTower(SPOT.x, SPOT.y, 'kinetic');
  assert.ok(tower, 'fixture: tower placed');
  return { world, tower };
}

describe('upgrade ladders: a fresh tower starts neutral', () => {
  test('both ladders start at zero and multiply to 1', () => {
    const { tower } = withTower();
    for (const stat of CONFIG.UPGRADABLE_STATS) {
      assert.equal(tower.permUpgrades[stat], 0);
      assert.equal(tower.runUpgrades[stat], 0);
      assert.equal(tower.permMult(stat), 1);
      assert.equal(tower.runMult(stat), 1);
      assert.equal(tower.statMult(stat), 1);
    }
  });

  test('with no upgrades, effective stats equal the tier-derived base', () => {
    const { tower } = withTower();
    assert.equal(tower.effectiveDamage(), tower.damage);
    assert.equal(tower.effectiveFireRate(), tower.fireRate);
    assert.equal(tower.effectiveRange(), tower.range);
  });

  test('health is deliberately NOT an upgradable stat', () => {
    // It belongs to the bundled `tier` ladder (which also full-heals). Two systems
    // with a claim on the same number is the bug this avoids.
    assert.ok(!CONFIG.UPGRADABLE_STATS.includes('health'));
    assert.ok(!CONFIG.UPGRADABLE_STATS.includes('maxHealth'));
  });
});

describe('upgrade ladders: the permanent ladder (prep, iron)', () => {
  test('one step multiplies the stat by STAT_UPGRADE_MULT', () => {
    const { world, tower } = withTower();
    const before = tower.effectiveDamage();
    assert.equal(world.upgradeTowerStat(tower, 'damage'), true);
    assert.ok(Math.abs(tower.effectiveDamage() - before * M) < 1e-9,
      `expected ${before * M}, got ${tower.effectiveDamage()}`);
  });

  test('steps compound rather than adding', () => {
    const { world, tower } = withTower();
    const base = tower.effectiveDamage();
    for (let i = 0; i < 3; i++) assert.equal(world.upgradeTowerStat(tower, 'damage'), true);
    assert.ok(Math.abs(tower.effectiveDamage() - base * Math.pow(M, 3)) < 1e-9);
  });

  test('it spends iron, and the cost escalates per purchase', () => {
    // Monotonic cost is a convention balance.test.mjs enforces across this codebase —
    // stacking one stat forever must get more expensive, not stay flat.
    const { world, tower } = withTower();
    let last = 0;
    for (let i = 0; i < 4; i++) {
      const cost = world.towerStatUpgradeCost(tower, 'damage');
      assert.ok(cost > last, `cost ${cost} should exceed the previous ${last}`);
      const ironBefore = world.iron;
      assert.equal(world.upgradeTowerStat(tower, 'damage'), true);
      assert.equal(ironBefore - world.iron, cost, 'charged exactly the quoted cost');
      last = cost;
    }
  });

  test('it does NOT spend scrap', () => {
    const { world, tower } = withTower();
    world.scrap = 500;
    world.upgradeTowerStat(tower, 'damage');
    assert.equal(world.scrap, 500, 'the permanent ladder is iron-funded only');
  });

  test('refused — and charges nothing — when iron is short', () => {
    const { world, tower } = withTower();
    world.iron = 0;
    assert.equal(world.upgradeTowerStat(tower, 'damage'), false);
    assert.equal(tower.permUpgrades.damage, 0, 'no free step');
    assert.equal(world.iron, 0);
  });

  test('refused for an unknown stat, without crashing', () => {
    const { world, tower } = withTower();
    assert.equal(world.towerStatUpgradeCost(tower, 'luck'), null);
    assert.equal(world.upgradeTowerStat(tower, 'luck'), false);
    assert.equal(world.upgradeTowerStat(null, 'damage'), false);
  });

  test('each stat has its own independent ladder', () => {
    const { world, tower } = withTower();
    world.upgradeTowerStat(tower, 'damage');
    world.upgradeTowerStat(tower, 'damage');
    world.upgradeTowerStat(tower, 'range');
    assert.equal(tower.permUpgrades.damage, 2);
    assert.equal(tower.permUpgrades.range, 1);
    assert.equal(tower.permUpgrades.fireRate, 0);
    assert.equal(tower.effectiveFireRate(), tower.fireRate, 'fireRate untouched');
  });

  test('it is PREP-only — refused mid-run', () => {
    const { world, tower } = withTower();
    world.beginTdRun();
    const ironBefore = world.iron;
    assert.equal(world.upgradeTowerStat(tower, 'damage'), false, 'permanent power is not bought mid-run');
    assert.equal(tower.permUpgrades.damage, 0);
    assert.equal(world.iron, ironBefore);
  });
});

describe('upgrade ladders: the temporary ladder (run, scrap)', () => {
  test('one step multiplies the stat, same as the permanent one', () => {
    const { world, tower } = withTower();
    world.beginTdRun();
    world.addScrap(1000);
    const before = tower.effectiveDamage();
    assert.equal(world.boostTowerStat(tower, 'damage'), true);
    assert.ok(Math.abs(tower.effectiveDamage() - before * M) < 1e-9);
  });

  test('it spends scrap at a flat cost and does NOT spend iron', () => {
    const { world, tower } = withTower();
    world.beginTdRun();
    world.addScrap(1000);
    const ironBefore = world.iron;
    const scrapBefore = world.scrap;
    assert.equal(world.boostTowerStat(tower, 'damage'), true);
    assert.equal(scrapBefore - world.scrap, CONFIG.STAT_BOOST_SCRAP_COST);
    assert.equal(world.iron, ironBefore, 'the temporary ladder is scrap-funded only');
    // Flat, unlike the permanent ladder — safe because scrap is wiped at run end.
    assert.equal(world.towerStatBoostCost(), CONFIG.STAT_BOOST_SCRAP_COST);
  });

  test('it is RUN-only — refused in prep', () => {
    const { world, tower } = withTower();
    world.scrap = 1000; // even with scrap somehow in hand
    assert.equal(world.boostTowerStat(tower, 'damage'), false);
    assert.equal(tower.runUpgrades.damage, 0);
    assert.equal(world.scrap, 1000, 'and nothing was charged');
  });

  test('refused — and charges nothing — when scrap is short', () => {
    const { world, tower } = withTower();
    world.beginTdRun();
    world.scrap = CONFIG.STAT_BOOST_SCRAP_COST - 1;
    assert.equal(world.boostTowerStat(tower, 'damage'), false);
    assert.equal(tower.runUpgrades.damage, 0);
    assert.equal(world.scrap, CONFIG.STAT_BOOST_SCRAP_COST - 1);
  });

  test('stacking is capped per stat, so a long run cannot compound without limit', () => {
    const { world, tower } = withTower();
    world.beginTdRun();
    world.addScrap(100000);
    for (let i = 0; i < CONFIG.STAT_BOOST_MAX_STACKS; i++) {
      assert.equal(world.boostTowerStat(tower, 'damage'), true, `stack ${i + 1} allowed`);
    }
    assert.equal(world.boostTowerStat(tower, 'damage'), false, 'the cap holds');
    assert.equal(tower.runUpgrades.damage, CONFIG.STAT_BOOST_MAX_STACKS);
    // The cap is per stat, not per tower.
    assert.equal(world.boostTowerStat(tower, 'range'), true, 'a different stat is unaffected');
  });
});

describe('upgrade ladders: the temporary ladder really is temporary', () => {
  test('endTdRun clears run upgrades and leaves permanent ones intact', () => {
    // The headline behaviour, and the user's worked example in miniature.
    const { world, tower } = withTower();
    assert.equal(world.upgradeTowerStat(tower, 'damage'), true); // permanent step, in prep
    const afterPerm = tower.effectiveDamage();

    world.beginTdRun();
    world.addScrap(1000);
    assert.equal(world.boostTowerStat(tower, 'damage'), true);
    assert.ok(tower.effectiveDamage() > afterPerm, 'boosted during the run');

    world.endTdRun();
    assert.equal(tower.runUpgrades.damage, 0, 'the boost is gone');
    assert.equal(tower.permUpgrades.damage, 1, 'the permanent step survives');
    assert.ok(Math.abs(tower.effectiveDamage() - afterPerm) < 1e-9,
      'damage falls back to exactly the permanent level');
  });

  test('every tower is reset, not just a selected one', () => {
    const { world, tower } = withTower();
    const second = world.placeTower(SPOT.x + CONFIG.GRID_SIZE * 4, SPOT.y, 'energy');
    assert.ok(second);
    world.beginTdRun();
    world.addScrap(1000);
    world.boostTowerStat(tower, 'damage');
    world.boostTowerStat(second, 'range');
    world.endTdRun();
    assert.equal(tower.runUpgrades.damage, 0);
    assert.equal(second.runUpgrades.range, 0);
  });

  test("the user's worked example: 5 -> 5.5, die, permanent step, 6 -> 6.6", () => {
    // Verbatim from the design session, expressed as ratios so it holds whatever
    // CONFIG.TOWER_DAMAGE happens to be.
    const { world, tower } = withTower();
    const base = tower.effectiveDamage();

    world.beginTdRun();
    world.addScrap(1000);
    world.boostTowerStat(tower, 'damage');
    assert.ok(Math.abs(tower.effectiveDamage() - base * 1.10) < 1e-9, 'in-run: base x 1.10');

    world.endTdRun();
    assert.ok(Math.abs(tower.effectiveDamage() - base) < 1e-9, 'back to base after dying');

    assert.equal(world.upgradeTowerStat(tower, 'damage'), true);
    const raised = tower.effectiveDamage();
    assert.ok(Math.abs(raised - base * 1.10) < 1e-9, 'prep: the base itself is now higher');

    world.beginTdRun();
    world.addScrap(1000);
    world.boostTowerStat(tower, 'damage');
    assert.ok(Math.abs(tower.effectiveDamage() - raised * 1.10) < 1e-9,
      'the temporary step multiplies the RAISED base, not the original');
  });

  test('a run boost cannot survive by being bought repeatedly across runs', () => {
    // The leak this whole design guards against, stated directly.
    const { world, tower } = withTower();
    const base = tower.effectiveDamage();
    for (let run = 0; run < 5; run++) {
      world.beginTdRun();
      world.addScrap(1000);
      world.boostTowerStat(tower, 'damage');
      world.boostTowerStat(tower, 'damage');
      world.endTdRun();
    }
    assert.ok(Math.abs(tower.effectiveDamage() - base) < 1e-9,
      'five runs of boosting left exactly zero permanent gain');
  });
});

describe('upgrade ladders: composition with tier and item affixes', () => {
  test('the full chain multiplies all four factors', () => {
    const { world, tower } = withTower();
    // tier: bundled upgrade raises this.damage
    assert.equal(world.upgradeTower(tower), true);
    const tierBase = tower.damage;
    // permanent + run ladders
    world.upgradeTowerStat(tower, 'damage');
    world.beginTdRun();
    world.addScrap(1000);
    world.boostTowerStat(tower, 'damage');
    // item affix
    tower.equippedItem = { affixes: [{ stat: 'damageMult', value: 0.5 }] }; // +50%
    const expected = tierBase * M * M * 1.5;
    assert.ok(Math.abs(tower.effectiveDamage() - expected) < 1e-9,
      `expected ${expected}, got ${tower.effectiveDamage()}`);
  });

  test('the ladders do not disturb tier, health or power draw', () => {
    // tier owns those; the per-stat ladders deliberately don't touch them, which is
    // why tier was layered under rather than replaced.
    const { world, tower } = withTower();
    const powerBefore = world.powerConsumption();
    const healthBefore = tower.maxHealth;
    world.upgradeTowerStat(tower, 'damage');
    world.upgradeTowerStat(tower, 'range');
    assert.equal(tower.tier, 1, 'tier untouched');
    assert.equal(tower.maxHealth, healthBefore, 'health untouched');
    assert.equal(world.powerConsumption(), powerBefore, 'power draw untouched');
  });

  test('a tier upgrade does not wipe either per-stat ladder', () => {
    // applyTier() recomputes this.damage from BASE x tierMult; the ladders live in
    // separate fields precisely so a tier upgrade can't clobber them.
    const { world, tower } = withTower();
    world.upgradeTowerStat(tower, 'damage');
    world.beginTdRun();
    world.addScrap(1000);
    world.boostTowerStat(tower, 'damage');
    world.endTdRun();
    world.upgradeTower(tower);
    assert.equal(tower.permUpgrades.damage, 1, 'permanent ladder survived a tier upgrade');
  });
});
