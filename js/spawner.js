import { CONFIG } from './config.js';

// States: 'idle' (player-paced, waiting on triggerWave()) -> 'spawning' (emitting
// enemies) -> 'active' (waiting for the wave to conclude) -> back to 'idle'.
// Phase 8a: no more auto-timers between waves — the old 'countdown' state is gone,
// the player idles/builds/spends at their own pace and triggers each wave explicitly.
export class Spawner {
  constructor() {
    this.waveNumber = 0;
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

  // Weighted pick among difficulty tiers unlocked at the current wave.
  pickTier() {
    const unlocked = Object.values(CONFIG.DIFFICULTY_TIERS)
      .filter(t => this.waveNumber >= t.unlockWave);
    const totalWeight = unlocked.reduce((sum, t) => sum + t.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const tier of unlocked) {
      roll -= tier.weight;
      if (roll <= 0) return tier;
    }
    return unlocked[unlocked.length - 1];
  }

  canTriggerWave() {
    return !this.complete && this.state === 'idle';
  }

  // The HUD's "Trigger Wave" button — the only way a wave starts now.
  triggerWave() {
    if (!this.canTriggerWave()) return false;
    this.startNextWave();
    return true;
  }

  startNextWave() {
    this.waveNumber++;
    this.enemiesToSpawn = CONFIG.WAVE_BASE_ENEMIES + (this.waveNumber - 1) * CONFIG.WAVE_ENEMY_GROWTH;
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
    if (pct >= 1) this.wavesCleared++;

    world.enemies.length = 0;
    if (world.base.isDestroyed()) world.base.health = world.base.maxHealth;

    if (this.waveNumber >= CONFIG.MAX_WAVES) {
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
        const enemy = world.spawnEnemy(tier.healthMult, tier.speedMult);
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
