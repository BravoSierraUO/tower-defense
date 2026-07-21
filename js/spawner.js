import { CONFIG } from './config.js';

// States: 'idle' (player-paced, waiting on triggerWave()) -> 'spawning' (emitting
// enemies) -> 'active' (waiting for the wave to conclude) -> back to 'idle'.
// Phase 8a: no more auto-timers between waves — the old 'countdown' state is gone,
// the player idles/builds/spends at their own pace and triggers each wave explicitly.
export class Spawner {
  constructor() {
    this.waveNumber = 0;   // the wave currently spawning/active/just-concluded — see startWave()
    this.maxWave = 0;      // real progress frontier: highest wave ever started as a NEW wave (never moved by a replay)
    this.isReplay = false; // true while waveNumber is an old wave being re-fought rather than progress
    this.state = 'idle';
    this.enemiesToSpawn = 0;
    this.spawnTimer = 0;
    this.complete = false;
    this.wavesCleared = 0;
    this.waveValueTotal = 0;   // sum of enemy.maxHealth spawned this wave (raw, unmultiplied)
    this.waveValueKilled = 0;  // sum of enemy.maxHealth actually killed this wave
    this.lastChestTier = null; // 'bronze'|'silver'|'gold' on the last wipe, null on a full clear
    this.lastWavePct = null;   // completion % of the last concluded wave, for UI/toast
    this.waveEndSeq = 0;       // bumped once per finalizeWave() — UI diffs this to know a new toast is due
  }

  // Weighted pick among difficulty tiers unlocked at the current wave. Returns the tier
  // object plus its own key (`id`, e.g. 'easy') — Phase 15 needs the id to look up
  // ENEMY_CLASSES' shape/name at render/spawn time; CONFIG.DIFFICULTY_TIERS itself stays
  // an id-keyed object rather than an array, so this is the one place that pairs them back up.
  pickTier() {
    const unlocked = Object.entries(CONFIG.DIFFICULTY_TIERS)
      .filter(([, t]) => this.waveNumber >= t.unlockWave);
    const totalWeight = unlocked.reduce((sum, [, t]) => sum + t.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const [id, tier] of unlocked) {
      roll -= tier.weight;
      if (roll <= 0) return { ...tier, id };
    }
    const [id, tier] = unlocked[unlocked.length - 1];
    return { ...tier, id };
  }

  // Phase 7a: equal-weight random pick, deliberately independent of pickTier()
  // above — armor type and difficulty tier are separate axes on purpose, so
  // the Damage Triangle stays a build-crafting choice rather than a disguised
  // tier-counter (a "hard" enemy isn't always the same type).
  pickArmorType() {
    const types = Object.keys(CONFIG.DAMAGE_TYPES);
    return types[Math.floor(Math.random() * types.length)];
  }

  canTriggerWave() {
    return !this.complete && this.state === 'idle';
  }

  // The Wave Menu's default action — starts the next new wave, advancing maxWave
  // (real progress). The only way `complete`/MAX_WAVES gets reached.
  triggerWave() {
    if (!this.canTriggerWave()) return false;
    this.startWave(this.maxWave + 1, false);
    return true;
  }

  // The Wave Menu's "Replay" action — re-fights any wave already reached (1..maxWave)
  // at that wave's own difficulty/enemy-count/reward scale, so an easier early wave
  // stays farmable even after progress has moved past it. Doesn't touch maxWave, so
  // it can never itself trip MAX_WAVES completion or count as forward progress.
  triggerReplay(n) {
    if (!this.canTriggerWave()) return false;
    if (n < 1 || n > this.maxWave) return false;
    this.startWave(n, true);
    return true;
  }

  startWave(n, isReplay) {
    this.waveNumber = n;
    this.isReplay = isReplay;
    if (!isReplay) this.maxWave = n;
    this.enemiesToSpawn = CONFIG.WAVE_BASE_ENEMIES + (n - 1) * CONFIG.WAVE_ENEMY_GROWTH;
    this.spawnTimer = 0;
    this.waveValueTotal = 0;
    this.waveValueKilled = 0;
    this.state = 'spawning';
  }

  // Full clear (pct >= 1) pays the full salvage bundle; a wipe pays a chest tier scaled by
  // how much of the wave's enemy value got killed before the base went down. Chest tiers are
  // found highest-first so a tie at a tier boundary rounds up.
  computeRewards(pct, world) {
    const baseGold = CONFIG.WAVE_CLEAR_BONUS_BASE + (this.waveNumber - 1) * CONFIG.WAVE_CLEAR_BONUS_GROWTH;
    const baseMetal = CONFIG.WAVE_CLEAR_METAL_BASE + (this.waveNumber - 1) * CONFIG.WAVE_CLEAR_METAL_GROWTH;

    if (pct >= 1) {
      return {
        gold: Math.round(baseGold * world.rewardMultiplier()),
        metal: Math.round(baseMetal),
        moduleCharges: CONFIG.WAVE_CLEAR_MODULE_CHARGE,
        productionParts: CONFIG.WAVE_CLEAR_PRODUCTION_PARTS,
        chestTier: null
      };
    }

    const tier = [...CONFIG.WIPE_CHEST_TIERS].reverse().find(t => pct >= t.minPct) || CONFIG.WIPE_CHEST_TIERS[0];
    return {
      gold: Math.round(baseGold * tier.mult * world.rewardMultiplier()),
      metal: Math.round(baseMetal * tier.mult),
      moduleCharges: 0,
      productionParts: 0,
      chestTier: tier.id
    };
  }

  // Called whenever a wave concludes, either because every enemy left the field
  // (killed or reached the base) or because the base was destroyed mid-wave. A
  // destroyed base heals back to full here — Phase 8a's design call: a wipe costs
  // you a worse chest, not the run. Partial (non-fatal) base damage is untouched,
  // still needs the existing gold repair mechanic.
  finalizeWave(world) {
    const pct = this.waveValueTotal > 0 ? Math.min(1, this.waveValueKilled / this.waveValueTotal) : 1;
    const rewards = this.computeRewards(pct, world);

    world.addGold(rewards.gold);
    world.addMetal(rewards.metal);
    if (rewards.moduleCharges) world.addModuleCharges(rewards.moduleCharges);
    if (rewards.productionParts) world.addProductionParts(rewards.productionParts);

    this.lastChestTier = rewards.chestTier;
    this.lastWavePct = pct;
    this.lastRewards = rewards;
    this.waveEndSeq++;
    // Replays are reward-only farming — they don't feed wavesCleared (which drives
    // profile CP/lifetime-stat/achievement progress) or MAX_WAVES completion, so
    // repeatedly re-clearing an easy early wave can't be used to grind real progress.
    if (pct >= 1 && !this.isReplay) this.wavesCleared++;

    world.enemies.length = 0;
    if (world.base.isDestroyed()) world.base.health = world.base.maxHealth;

    if (!this.isReplay && this.waveNumber >= CONFIG.MAX_WAVES) {
      this.complete = true;
    } else {
      this.state = 'idle';
    }
  }

  update(dt, world) {
    if (this.complete) return;
    if (this.state === 'idle') return; // waiting on triggerWave()

    // A base destroyed mid-wave ends the wave attempt right here, on whatever
    // pct has accrued so far — no point spawning/resolving the rest of it.
    if (world.base.isDestroyed()) {
      this.finalizeWave(world);
      return;
    }

    if (this.state === 'spawning') {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.enemiesToSpawn > 0) {
        const tier = this.pickTier();
        const enemy = world.spawnEnemy(tier.healthMult, tier.speedMult, this.pickArmorType(), tier.id);
        this.waveValueTotal += enemy.maxHealth;
        this.enemiesToSpawn--;
        this.spawnTimer = CONFIG.ENEMY_SPAWN_INTERVAL;
      }
      if (this.enemiesToSpawn <= 0) this.state = 'active';
      return;
    }

    if (this.state === 'active') {
      if (world.enemies.length === 0) this.finalizeWave(world);
    }
  }
}
