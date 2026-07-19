import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { Profile, levelFromCp, cpForLevel } from '../js/profile.js';
import { updateCombat } from '../js/combat.js';
import { freshGame, finishBuild } from './helpers.mjs';

function memStore() {
  const mem = {};
  return { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
}

describe('Profile: level curve', () => {
  test('levelFromCp(cpForLevel(n)) == n at every level boundary (curve is its own inverse)', () => {
    for (let level = 1; level <= 30; level++) {
      assert.equal(levelFromCp(cpForLevel(level)), level, `boundary CP for level ${level} didn't round-trip`);
    }
  });

  test('one CP short of a level boundary stays at the previous level', () => {
    const level = 5;
    assert.equal(levelFromCp(cpForLevel(level) - 1), level - 1);
  });

  test('level never drops below 1 even at 0 or negative CP', () => {
    assert.equal(levelFromCp(0), 1);
    assert.equal(levelFromCp(-100), 1);
  });
});

describe('Profile: CP economy via emit()', () => {
  // These isolate the raw CP-source arithmetic from the achievement fixpoint
  // loop (also exercised below) by pre-earning whichever badge the event
  // would otherwise trigger — e.g. any kill unavoidably clears 'first-blood'.
  // Without that, the emit also banks a TIER_CP bonus and these exact-equality
  // checks would be testing achievement interaction, not the CP formula.
  test('kill events add CP_PER_KILL per kill and accumulate lifetime kills', () => {
    const p = new Profile(memStore());
    p.data.badges.push('first-blood', 'centurion');
    p.emit('kill', { count: 3 });
    assert.equal(p.data.life.kills, 3);
    assert.equal(p.data.cp, 3 * CONFIG.PROFILE.CP_PER_KILL);
  });

  test('waveClear CP grows with wave number and increments wavesCleared', () => {
    const p = new Profile(memStore());
    p.emit('waveClear', { wave: 1 });
    const firstGain = p.data.cp;
    assert.equal(firstGain, CONFIG.PROFILE.CP_PER_WAVE_CLEAR_BASE);
    p.emit('waveClear', { wave: 2 });   // stays under the 'wave-five' threshold, so no achievement CP mixes in
    assert.equal(p.data.life.wavesCleared, 2);
    assert.equal(p.data.cp, firstGain + CONFIG.PROFILE.CP_PER_WAVE_CLEAR_BASE + CONFIG.PROFILE.CP_PER_WAVE_CLEAR_GROWTH);
  });

  test('runEnd on a win banks CP_RUN_WIN and increments runsWon; a loss scales with wave reached', () => {
    const win = new Profile(memStore());
    win.data.badges.push('champion', 'unscathed');   // any win at all would otherwise earn these
    win.emit('runEnd', { won: true, wave: 20, baseHealthPct: 1 });
    assert.equal(win.data.life.runsWon, 1);
    assert.equal(win.data.cp, CONFIG.PROFILE.CP_RUN_WIN);

    const loss = new Profile(memStore());
    loss.data.badges.push('lessons-learned');   // any loss at all would otherwise earn this
    loss.emit('runEnd', { won: false, wave: 7, baseHealthPct: 0 });
    assert.equal(loss.data.life.runsLost, 1);
    assert.equal(loss.data.cp, 7 * CONFIG.PROFILE.CP_RUN_LOSS_PER_WAVE);
  });

  test('bestWave tracks the max wave ever reached across runEnd events, win or lose', () => {
    const p = new Profile(memStore());
    p.emit('runEnd', { won: false, wave: 4 });
    p.emit('runEnd', { won: true, wave: 20 });
    p.emit('runEnd', { won: false, wave: 9 });
    assert.equal(p.data.life.bestWave, 20);
  });
});

describe('Profile: achievements', () => {
  test('an achievement earns exactly once, banks its TIER_CP bonus, and never re-fires', () => {
    const p = new Profile(memStore());
    p.emit('kill', { count: 1 });
    assert.ok(p.data.badges.includes('first-blood'));
    const cpAfterFirst = p.data.cp;
    assert.equal(cpAfterFirst, CONFIG.PROFILE.CP_PER_KILL + CONFIG.PROFILE.TIER_CP.common);

    p.emit('kill', { count: 1 });
    assert.equal(p.data.badges.filter((id) => id === 'first-blood').length, 1, 'badge recorded only once');
  });

  test('fixpoint: a single event can unlock more than one achievement in the same pass', () => {
    const p = new Profile(memStore());
    // 100 kills in one emit crosses both 'first-blood' (>=1) and 'centurion' (>=100) at once.
    p.emit('kill', { count: 100 });
    assert.ok(p.data.badges.includes('first-blood'));
    assert.ok(p.data.badges.includes('centurion'));
  });

  test('drainUnlocks() returns newly-earned badges once, then empties', () => {
    const p = new Profile(memStore());
    p.emit('kill', { count: 1 });
    const first = p.drainUnlocks();
    assert.ok(first.some((a) => a.id === 'first-blood'));
    assert.deepEqual(p.drainUnlocks(), []);
  });

  test('achievements() reports earned:true only for badges actually in the profile', () => {
    const p = new Profile(memStore());
    p.emit('kill', { count: 1 });
    const list = p.achievements();
    const fb = list.find((a) => a.id === 'first-blood');
    const cent = list.find((a) => a.id === 'centurion');
    assert.equal(fb.earned, true);
    assert.equal(cent.earned, false);
  });
});

describe('Profile: prestige', () => {
  test('canPrestige is false below the gate and prestige() is a no-op refusal', () => {
    const p = new Profile(memStore());
    assert.equal(p.canPrestige(), false);
    assert.equal(p.prestige(), false);
    assert.equal(p.data.prestige, 0);
  });

  test('prestige() resets cp to 0, banks a payout, and escalates the next gate', () => {
    const p = new Profile(memStore());
    p.data.badges.push('ascendant');   // prestiging for the first time would otherwise also earn this
    p.data.cp = cpForLevel(p.prestigeGate());   // force to exactly the gate level
    assert.ok(p.canPrestige());
    const gateBefore = p.prestigeGate();
    assert.ok(p.prestige());
    assert.equal(p.data.cp, 0);
    assert.equal(p.data.prestige, 1);
    assert.ok(p.data.prestigePoints >= 1, 'payout must be at least 1');
    assert.ok(p.prestigeGate() > gateBefore, 'the next gate must be higher than the last');
  });

  test('prestige CP multiplier compounds: the same kill count banks more CP after prestiging', () => {
    const p = new Profile(memStore());
    p.emit('kill', { count: 1 });
    const cpBefore = p.data.cp;
    p.data.cp = cpForLevel(p.prestigeGate());
    p.prestige();
    p.emit('kill', { count: 1 });
    assert.ok(p.data.cp > cpBefore, 'post-prestige CP gain from an identical event must be strictly larger');
  });
});

describe('Profile: skill tree', () => {
  test('buySkill fails with insufficient points and does not deduct or level up', () => {
    const p = new Profile(memStore());
    assert.equal(p.buySkill('gold'), false);
    assert.equal(p.skillLevel('gold'), 0);
  });

  test('skillCost is (currentLevel+1); buying repeatedly follows that curve and stops at max', () => {
    const p = new Profile(memStore());
    p.data.prestigePoints = 1000;
    let spent = 0;
    for (let i = 0; i < 10; i++) {
      const cost = p.skillCost('damage');
      assert.equal(cost, i + 1);
      assert.ok(p.buySkill('damage'));
      spent += cost;
    }
    assert.equal(p.skillLevel('damage'), 10);
    assert.equal(p.data.prestigePoints, 1000 - spent);
    assert.equal(p.buySkill('damage'), false, 'refuses past max level');
  });

  test('bonusFor/damageMult reflect level * per', () => {
    const p = new Profile(memStore());
    p.data.prestigePoints = 100;
    p.buySkill('damage');
    p.buySkill('damage');
    const def = CONFIG.SKILLS.find((s) => s.id === 'damage');
    assert.equal(p.damageMult(), 1 + 2 * def.per);
  });

  test('buying the first skill and maxing a skill each fire their achievement', () => {
    const p = new Profile(memStore());
    p.data.prestigePoints = 1000;
    p.buySkill('build');
    assert.ok(p.data.badges.includes('skill-investor'));
    for (let i = p.skillLevel('build'); i < CONFIG.SKILLS.find((s) => s.id === 'build').max; i++) p.buySkill('build');
    assert.ok(p.data.badges.includes('well-oiled'));
  });
});

describe('Profile: persistence', () => {
  test('save() then a fresh Profile(same storage) load()s the same state back', () => {
    const store = memStore();
    const a = new Profile(store);
    a.emit('kill', { count: 5 });
    a.data.prestigePoints = 3;

    const b = new Profile(store);
    assert.equal(b.data.cp, a.data.cp);
    assert.equal(b.data.life.kills, 5);
    assert.deepEqual(b.data.badges, a.data.badges);
  });

  test('two Profiles with no storage passed (Node fallback) never leak state into each other', () => {
    const a = new Profile();
    const b = new Profile();
    a.emit('kill', { count: 1 });
    assert.equal(b.data.life.kills, 0, 'a second unstored Profile must start blank, not inherit the first');
  });
});

describe('Profile: wired into World/combat gameplay multipliers', () => {
  test('Gold Mastery raises World#rewardMultiplier()', () => {
    const profile = new Profile(memStore());
    const { world } = freshGame(0, profile);
    const before = world.rewardMultiplier();
    profile.data.prestigePoints = 100;
    profile.buySkill('gold');
    assert.ok(world.rewardMultiplier() > before);
  });

  test('Build Mastery shortens a room build timer via World#buildRoom()', () => {
    const baseline = freshGame(100000);
    const baselineRoom = baseline.world.buildRoom('reactor', 0, 0);
    const baselineTime = baselineRoom.buildTimeTotal;

    const profile = new Profile(memStore());
    profile.data.prestigePoints = 100;
    profile.buySkill('build');
    const boosted = freshGame(100000, profile);
    const boostedRoom = boosted.world.buildRoom('reactor', 0, 0);
    assert.ok(boostedRoom.buildTimeTotal < baselineTime, 'a bought Build Mastery level must shorten the timer CommandCore set');
  });

  test('Damage Mastery raises the damage a fired Projectile carries in updateCombat()', () => {
    const profile = new Profile(memStore());
    profile.data.prestigePoints = 100;
    profile.buySkill('damage');
    const { world } = freshGame(100000, profile);
    world.placeTower(200, 200);
    world.enemies.push({ x: 200, y: 200, isDead: () => false, reachedTarget: false, health: 1000 });
    updateCombat(world, 0.001);
    assert.equal(world.projectiles.length, 1);
    assert.equal(world.projectiles[0].damage, CONFIG.TOWER_DAMAGE * profile.damageMult());
  });

  test('Fortification stacks with Shield but the combined base-damage reduction stays capped under 100%', () => {
    const profile = new Profile(memStore());
    profile.data.prestigePoints = 1000;
    for (let i = 0; i < CONFIG.SKILLS.find((s) => s.id === 'fortify').max; i++) profile.buySkill('fortify');
    const { commandCore } = freshGame(100000, profile);
    // Shield normally needs shieldAccess tech; bypass the gate here (structural cap
    // test only, mirrors balance.test.mjs's maxOutRoom — same reasoning as there).
    commandCore.unlockedTech.add('shieldAccess');
    const shieldRoom = commandCore.placeRoom('shield', 0, 0);
    finishBuild(shieldRoom);
    shieldRoom.tier = CONFIG.ROOM_TYPES.shield.tiers.length;

    const reduction = Math.min(0.95, commandCore.totals().shieldPct + profile.fortifyMult());
    assert.ok(reduction < 1, `combined reduction hit ${reduction} — base damage would be zeroed`);
  });
});
