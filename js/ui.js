import { CONFIG } from './config.js';

// UI reads world state and writes to the DOM overlay. It never mutates
// gameplay state and is never zoomed/panned by the camera (plain HTML,
// sits above the canvas via CSS).
export class UI {
  constructor() {
    this.scoreEl = document.getElementById('ui-score');
    this.waveEl = document.getElementById('ui-wave');
    this.tierEl = document.getElementById('ui-tier');
    this.fpsEl = document.getElementById('ui-fps');
    this.baseFill = document.getElementById('ui-base-fill');
    this.baseText = document.getElementById('ui-base-text');
    this.banner = document.getElementById('ui-banner');
  }

  currentTierName(waveNumber) {
    const entries = Object.entries(CONFIG.DIFFICULTY_TIERS)
      .filter(([, t]) => waveNumber >= t.unlockWave)
      .sort((a, b) => b[1].unlockWave - a[1].unlockWave);
    return entries.length ? entries[0][0] : '-';
  }

  update(world, fps, state) {
    const spawner = world.spawner;
    const base = world.base;

    this.scoreEl.textContent = world.score;
    this.waveEl.textContent = `${spawner.waveNumber} / ${CONFIG.MAX_WAVES}`;
    this.tierEl.textContent = this.currentTierName(spawner.waveNumber);
    this.fpsEl.textContent = Math.round(fps);

    const pct = Math.max(0, (base.health / base.maxHealth) * 100);
    this.baseFill.style.width = `${pct}%`;
    this.baseFill.style.background = pct <= 30 ? CONFIG.BASE_DAMAGE_COLOR : CONFIG.BASE_COLOR;
    this.baseText.textContent = `${Math.ceil(base.health)} / ${base.maxHealth}`;

    if (state === 'won') {
      this.banner.textContent = 'VICTORY';
      this.banner.className = 'ui-banner win';
      this.banner.hidden = false;
    } else if (state === 'lost') {
      this.banner.textContent = `DEFEAT — wave ${spawner.waveNumber}`;
      this.banner.className = 'ui-banner lose';
      this.banner.hidden = false;
    } else {
      this.banner.hidden = true;
    }
  }
}
