// Wave Menu: replaces the old one-click "Trigger Wave N" button. Opens a modal
// listing every wave from 1 up to your real progress frontier (Spawner.maxWave)
// plus the next new one, each with a live reward preview, so a wave that's too
// hard to push past is still farmable by replaying an easier one you've already
// reached (see Spawner.triggerReplay). Rows for every wave up to CONFIG.MAX_WAVES
// are built once, descending, so the highest-reachable row (whichever is "Next")
// always sits at the top of the scroll without any DOM reordering as maxWave climbs.
import { CONFIG } from '../config.js';

export class WavePanel {
  constructor({ onSelectWave, onClose } = {}) {
    this.overlay = document.getElementById('wave-panel-overlay');
    this.list = document.getElementById('wave-panel-list');
    document.getElementById('wave-panel-close-btn').addEventListener('click', () => onClose?.());
    document.getElementById('wave-panel-footer-close-btn').addEventListener('click', () => onClose?.());
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) onClose?.(); });

    this.maxWave = 0; // kept current by update(); read by the row click handlers below

    this.rows = {};
    for (let n = CONFIG.MAX_WAVES; n >= 1; n--) {
      const row = document.createElement('div');
      row.className = 'wave-row';
      row.innerHTML =
        '<div class="wave-row-info">' +
          '<span class="wave-row-label"></span>' +
          '<span class="wave-row-meta"></span>' +
        '</div>';
      const btn = document.createElement('button');
      btn.className = 'settings-btn-sm';
      btn.addEventListener('click', () => onSelectWave?.(n, n <= this.maxWave));
      row.appendChild(btn);
      this.list.appendChild(row);
      this.rows[n] = { el: row, label: row.querySelector('.wave-row-label'), meta: row.querySelector('.wave-row-meta'), btn };
    }
  }

  tierName(n) {
    const entries = Object.entries(CONFIG.DIFFICULTY_TIERS)
      .filter(([, t]) => n >= t.unlockWave)
      .sort((a, b) => b[1].unlockWave - a[1].unlockWave);
    return entries.length ? entries[0][0] : '-';
  }

  // Same formulas Spawner.computeRewards() uses for a full clear at wave n —
  // kept as a preview only, never itself paid out.
  rewardPreview(n, world) {
    const gold = Math.round((CONFIG.WAVE_CLEAR_BONUS_BASE + (n - 1) * CONFIG.WAVE_CLEAR_BONUS_GROWTH) * world.rewardMultiplier());
    const metal = Math.round(CONFIG.WAVE_CLEAR_METAL_BASE + (n - 1) * CONFIG.WAVE_CLEAR_METAL_GROWTH);
    return `${gold}g · ${metal}m`;
  }

  update(spawner, world) {
    this.maxWave = spawner.maxWave;
    const canPlay = spawner.canTriggerWave();

    for (let n = 1; n <= CONFIG.MAX_WAVES; n++) {
      const row = this.rows[n];
      const isNext = n === spawner.maxWave + 1 && !spawner.complete;
      const reachable = n <= spawner.maxWave || isNext;
      row.el.hidden = !reachable;
      if (!reachable) continue;

      row.el.classList.toggle('wave-row-next', isNext);
      row.label.textContent = isNext ? `Wave ${n} — Next` : `Wave ${n}`;
      row.meta.textContent = `${this.tierName(n)} · ${this.rewardPreview(n, world)}`;
      row.btn.textContent = isNext ? 'Start' : 'Replay';
      row.btn.disabled = !canPlay;
    }
  }
}
