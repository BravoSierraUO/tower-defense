import { CONFIG } from './config.js';

// States: 'countdown' (between waves) -> 'spawning' (emitting enemies) -> 'active' (waiting for clear)
export class Spawner {
  constructor() {
    this.waveNumber = 0;
    this.state = 'countdown';
    this.timer = CONFIG.WAVE_START_DELAY;
    this.enemiesToSpawn = 0;
    this.spawnTimer = 0;
    this.complete = false;
    this.wavesCleared = 0;
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

  startNextWave() {
    this.waveNumber++;
    this.enemiesToSpawn = CONFIG.WAVE_BASE_ENEMIES + (this.waveNumber - 1) * CONFIG.WAVE_ENEMY_GROWTH;
    this.spawnTimer = 0;
    this.state = 'spawning';
  }

  update(dt, world) {
    if (this.complete) return;

    if (this.state === 'countdown') {
      this.timer -= dt;
      if (this.timer <= 0) this.startNextWave();
      return;
    }

    if (this.state === 'spawning') {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.enemiesToSpawn > 0) {
        const tier = this.pickTier();
        world.spawnEnemy(tier.healthMult, tier.speedMult);
        this.enemiesToSpawn--;
        this.spawnTimer = CONFIG.ENEMY_SPAWN_INTERVAL;
      }
      if (this.enemiesToSpawn <= 0) this.state = 'active';
      return;
    }

    if (this.state === 'active') {
      if (world.enemies.length === 0) {
        const bonus = CONFIG.WAVE_CLEAR_BONUS_BASE + (this.waveNumber - 1) * CONFIG.WAVE_CLEAR_BONUS_GROWTH;
        world.addGold(Math.round(bonus * world.rewardMultiplier()));
        this.wavesCleared++;

        if (this.waveNumber >= CONFIG.MAX_WAVES) {
          this.complete = true;
        } else {
          this.state = 'countdown';
          this.timer = CONFIG.WAVE_INTERVAL;
        }
      }
    }
  }
}
