import { CONFIG } from './config.js';
import { ACHIEVEMENTS } from './achievements.js';

// Phase 4: persistent player profile (survives run restarts, lives across
// waves/runs in one JSON blob). Skeleton ported from a sister project (RMUV),
// stripped of everything that was really about RMUV's 40-game arcade catalog
// (avatars/wreaths/genre shelves/cross-game cascade normalization) — this
// game has one CP source (its own runs), so it needed none of that. What
// carried over: the sqrt level curve, the data-driven achievement registry
// tested via a fixpoint loop, and the prestige-for-permanent-bonus loop.
//
// Simplification vs. RMUV: prestige here only resets `cp` (the level climb).
// RMUV also wiped per-game play stats so achievements could re-earn across
// "lifetimes" (mastery stars). That's real design value but real added
// complexity (a parallel life/permanent stat split) — skipped for this pass;
// `life` stats and earned badges are permanent. Revisit if prestiging ever
// needs its own re-earn hook to feel meaningful past the first few times.

// Node has no global localStorage, so a headless/test Profile falls back to an
// in-memory store — a FRESH one per instance (not a shared module singleton),
// so two `new Profile()` calls in the same process (e.g. two tests, or
// World's default param) never see each other's state.
function createMemoryStore() {
  const mem = {};
  return {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); }
  };
}

function defaultStorage() {
  return (typeof localStorage !== 'undefined') ? localStorage : createMemoryStore();
}

function blank() {
  return {
    v: 1, cp: 0, prestige: 0, prestigePoints: 0, skills: {},
    badges: [], badgeAt: {},
    life: { kills: 0, wavesCleared: 0, towersPlaced: 0, roomsBuilt: 0, techUnlocked: 0, runsWon: 0, runsLost: 0, bestWave: 0 }
  };
}

// Gentle curve: level n begins at LEVEL_CP_FACTOR*(n-1)^2 CP. Fast early, eases off, never a wall.
export function levelFromCp(cp) {
  return 1 + Math.floor(Math.sqrt(Math.max(0, cp) / CONFIG.PROFILE.LEVEL_CP_FACTOR));
}
export function cpForLevel(level) {
  return CONFIG.PROFILE.LEVEL_CP_FACTOR * (level - 1) * (level - 1);
}

export class Profile {
  constructor(storage) {
    this.storage = storage || defaultStorage();
    this.data = this.load();
    this.unlockQueue = [];   // achievements earned since the UI last drained it (drainUnlocks())
  }

  load() {
    try {
      const raw = this.storage.getItem(CONFIG.PROFILE.STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.v) {
        const d = Object.assign(blank(), parsed);
        d.life = Object.assign(blank().life, parsed.life || {});
        d.skills = parsed.skills || {};
        d.badges = parsed.badges || [];
        d.badgeAt = parsed.badgeAt || {};
        return d;
      }
    } catch (e) {}
    return blank();
  }

  save() {
    try { this.storage.setItem(CONFIG.PROFILE.STORAGE_KEY, JSON.stringify(this.data)); } catch (e) {}
  }

  // Settings-panel "Delete Save Data": wipes the in-memory profile back to
  // blank() and immediately persists that blank state — functionally a
  // delete, but expressed as a save so it works through the same storage
  // interface (getItem/setItem) without needing a removeItem() the
  // Node-fallback memory store doesn't implement.
  hardReset() {
    this.data = blank();
    this.unlockQueue = [];
    this.save();
  }

  // Settings-panel "View Raw JSON" — the exact bytes save() would write.
  rawJSON() { return JSON.stringify(this.data, null, 2); }

  skillLevel(id) { return this.data.skills[id] || 0; }

  // Sum of per-level bonus for every skill tied to `stat` — currently one node
  // per stat, but written so a second node on the same stat folds in for free.
  bonusFor(stat) {
    return CONFIG.SKILLS.filter((s) => s.stat === stat).reduce((sum, s) => sum + this.skillLevel(s.id) * s.per, 0);
  }
  goldMult() { return 1 + this.bonusFor('gold'); }
  damageMult() { return 1 + this.bonusFor('damage'); }
  buildMult() { return 1 + this.bonusFor('build'); }             // divides build time, so >1 = faster
  fortifyMult() { return Math.min(0.9, this.bonusFor('fortify')); }   // fraction of base damage cut; capped well under 100%

  cpMult() { return 1 + CONFIG.PROFILE.PRESTIGE_FLAT_BONUS_PER * this.data.prestige; }
  gainCp(n) { this.data.cp += Math.round(n * this.cpMult()); }

  level() { return levelFromCp(this.data.cp); }
  prestigeGate() { return CONFIG.PROFILE.PRESTIGE_GATE_BASE + CONFIG.PROFILE.PRESTIGE_GATE_GROWTH * this.data.prestige; }
  canPrestige() { return this.level() >= this.prestigeGate(); }

  // Phase 6: station-tier reskin. Clamped so a run past CONFIG.STATION_TIERS'
  // length just sits at the last (Dyson Node) tier rather than indexing past it.
  stationTier() { return Math.min(this.data.prestige, CONFIG.STATION_TIERS.length - 1); }
  stationTierName() { return CONFIG.STATION_TIERS[this.stationTier()].name; }

  // Payout scales with the level reached AND lifetime breadth (kills/waves
  // cleared) — a deep run banks more than a shallow one, and prestiging late
  // isn't a waste of levels you already climbed past the gate.
  prestigePayout() {
    if (!this.canPrestige()) return 0;
    const level = this.level(), l = this.data.life;
    return Math.max(1, Math.floor(level / 5) + Math.floor(l.kills / 200) + Math.floor(l.wavesCleared / 20));
  }

  prestige() {
    if (!this.canPrestige()) return false;
    const earned = this.prestigePayout();   // computed BEFORE the reset (uses current level + stats)
    this.data.prestige += 1;
    this.data.prestigePoints += earned;
    this.data.cp = 0;
    this.checkAchievements({ type: 'prestige', data: { prestige: this.data.prestige } });
    this.save();
    return true;
  }

  skillCost(id) { return this.skillLevel(id) + 1; }   // next level costs (currentLevel+1) points
  buySkill(id) {
    const def = CONFIG.SKILLS.find((s) => s.id === id);
    if (!def) return false;
    const lvl = this.skillLevel(id);
    if (lvl >= def.max) return false;
    const cost = this.skillCost(id);
    if (this.data.prestigePoints < cost) return false;
    this.data.prestigePoints -= cost;
    this.data.skills[id] = lvl + 1;
    this.checkAchievements({ type: 'skillBought', data: { id, level: lvl + 1, maxed: lvl + 1 >= def.max } });
    this.save();
    return true;
  }

  // ---- events: the single entry point every gameplay hook calls into ----
  emit(type, d = {}) {
    const P = CONFIG.PROFILE, life = this.data.life;
    if (type === 'kill') { life.kills += d.count || 1; this.gainCp((d.count || 1) * P.CP_PER_KILL); }
    else if (type === 'waveClear') { life.wavesCleared++; this.gainCp(P.CP_PER_WAVE_CLEAR_BASE + (d.wave - 1) * P.CP_PER_WAVE_CLEAR_GROWTH); }
    else if (type === 'towerPlaced') { life.towersPlaced++; this.gainCp(P.CP_PER_TOWER_PLACED); }
    else if (type === 'roomBuilt') { life.roomsBuilt++; this.gainCp(P.CP_PER_ROOM_BUILT); }
    else if (type === 'techUnlocked') { life.techUnlocked++; this.gainCp(P.CP_PER_TECH_UNLOCKED); }
    else if (type === 'runEnd') {
      life.bestWave = Math.max(life.bestWave, d.wave || 0);
      if (d.won) { life.runsWon++; this.gainCp(P.CP_RUN_WIN); }
      else { life.runsLost++; this.gainCp((d.wave || 0) * P.CP_RUN_LOSS_PER_WAVE); }
    }
    this.checkAchievements({ type, data: d });
    this.save();
  }

  // Fixpoint: earning one badge can raise level/lifetime totals enough to
  // unlock another in the same event — loop until a pass earns nothing new.
  checkAchievements(ev) {
    let again = true;
    while (again) {
      again = false;
      const snap = this.snapshot();
      for (const a of ACHIEVEMENTS) {
        if (this.data.badges.indexOf(a.id) >= 0) continue;
        let ok = false;
        try { ok = !!a.test(snap, ev); } catch (e) {}
        if (ok) {
          this.data.badges.push(a.id);
          if (!this.data.badgeAt[a.id]) this.data.badgeAt[a.id] = Date.now();
          this.gainCp(CONFIG.PROFILE.TIER_CP[a.tier] || CONFIG.PROFILE.TIER_CP.common);
          this.unlockQueue.push(a);
          again = true;
        }
      }
    }
  }

  drainUnlocks() { const q = this.unlockQueue; this.unlockQueue = []; return q; }

  snapshot() {
    const level = this.level();
    const cur = cpForLevel(level), next = cpForLevel(level + 1);
    return {
      cp: this.data.cp, level, levelCp: cur, nextCp: next,
      progress: next > cur ? (this.data.cp - cur) / (next - cur) : 1,
      prestige: this.data.prestige, prestigePoints: this.data.prestigePoints,
      canPrestige: this.canPrestige(), prestigeGate: this.prestigeGate(), prestigePayout: this.prestigePayout(),
      stationTier: this.stationTier(), stationTierName: this.stationTierName(),
      life: Object.assign({}, this.data.life),
      badges: this.data.badges.slice(),
      skills: Object.assign({}, this.data.skills)
    };
  }

  achievements() {
    return ACHIEVEMENTS.map((a) => ({
      id: a.id, name: a.name, hint: a.hint, icon: a.icon, tier: a.tier,
      earned: this.data.badges.indexOf(a.id) >= 0, at: this.data.badgeAt[a.id] || 0
    }));
  }

  skillsView() {
    return CONFIG.SKILLS.map((s) => {
      const lvl = this.skillLevel(s.id), maxed = lvl >= s.max, cost = this.skillCost(s.id);
      return {
        id: s.id, name: s.name, icon: s.icon, level: lvl, max: s.max,
        bonusPct: Math.round(lvl * s.per * 100), nextCost: maxed ? null : cost,
        canBuy: !maxed && this.data.prestigePoints >= cost, maxed
      };
    });
  }
}
