// Persistent top-bar stats (score/gold/metal/wave/etc.), base health bar,
// repair/trigger-wave buttons, the win banner, and the two timed toast queues
// (achievement unlock, wave-end chest). This is what's on screen regardless of
// which side panel (core/profile/about/settings) is open.
import { CONFIG } from '../config.js';
import { Toast } from './toast.js';

export class HudPanel {
  constructor({ onRestart, onRepairBase, onOpenWaveMenu } = {}) {
    this.scoreEl = document.getElementById('ui-score');
    this.goldEl = document.getElementById('ui-gold');
    this.metalEl = document.getElementById('ui-metal');
    this.moduleChargesStat = document.getElementById('ui-module-charges-stat');
    this.moduleChargesEl = document.getElementById('ui-module-charges');
    this.productionPartsStat = document.getElementById('ui-production-parts-stat');
    this.productionPartsEl = document.getElementById('ui-production-parts');
    this.comboEl = document.getElementById('ui-combo');
    this.brownoutEl = document.getElementById('ui-brownout');
    this.waveEl = document.getElementById('ui-wave');
    this.tierEl = document.getElementById('ui-tier');
    this.levelEl = document.getElementById('ui-level');
    this.fpsEl = document.getElementById('ui-fps');
    this.baseFill = document.getElementById('ui-base-fill');
    this.baseText = document.getElementById('ui-base-text');
    this.banner = document.getElementById('ui-banner');
    this.restartBtn = document.getElementById('restart-btn');
    this.restartBtn.addEventListener('click', () => onRestart?.());

    this.repairBtn = document.getElementById('repair-btn');
    this.repairBtn.addEventListener('click', () => onRepairBase?.());

    // Opens the Wave Menu (js/ui/wavePanel.js) rather than triggering directly —
    // lets the player replay an already-reached wave to farm it instead of only
    // ever pushing forward. See Spawner.triggerWave()/triggerReplay().
    this.triggerWaveBtn = document.getElementById('trigger-wave-btn');
    this.triggerWaveBtn.addEventListener('click', () => onOpenWaveMenu?.());
    this.lastWaveEndSeq = 0;

    this.achievementToast = new Toast(document.getElementById('achievement-toast'));
    this.chestToast = new Toast(document.getElementById('chest-toast'));
  }

  currentTierName(waveNumber) {
    const entries = Object.entries(CONFIG.DIFFICULTY_TIERS)
      .filter(([, t]) => waveNumber >= t.unlockWave)
      .sort((a, b) => b[1].unlockWave - a[1].unlockWave);
    return entries.length ? entries[0][0] : '-';
  }

  update({ world, spawner, base, fps, state, level, profile }) {
    this.levelEl.textContent = level;

    // Achievement-unlock toast: queued so a fixpoint burst of unlocks shows one at a time.
    for (const a of profile.drainUnlocks()) this.achievementToast.push(a);
    this.achievementToast.update(performance.now(), (a, el) => {
      el.textContent = `${a.icon} Achievement Unlocked: ${a.name}`;
      el.className = `achievement-toast tier-${a.tier}`;
    });

    // Phase 8a: wave-conclusion toast — diffs Spawner.waveEndSeq to catch a fresh
    // full-clear or wipe-chest the instant finalizeWave() runs.
    if (spawner.waveEndSeq !== this.lastWaveEndSeq) {
      this.lastWaveEndSeq = spawner.waveEndSeq;
      const tier = spawner.lastChestTier;
      const pct = Math.round((spawner.lastWavePct ?? 1) * 100);
      this.chestToast.push(tier
        ? { text: `${{ bronze: '🥉', silver: '🥈', gold: '🥇' }[tier]} ${tier[0].toUpperCase()}${tier.slice(1)} Chest — wave ${spawner.waveNumber}, ${pct}% cleared`, tier }
        : { text: `✅ Wave ${spawner.waveNumber} Cleared — full salvage!`, tier: 'clear' });
    }
    this.chestToast.update(performance.now(), (t, el) => {
      el.textContent = t.text;
      el.className = `chest-toast tier-${t.tier}`;
    });

    this.scoreEl.textContent = world.score;
    this.goldEl.textContent = `${Math.floor(world.gold)} / ${world.goldCap()}`;
    this.metalEl.textContent = `${Math.floor(world.metal)} / ${world.metalCap()}`;
    this.moduleChargesStat.hidden = world.moduleCharges <= 0;
    this.moduleChargesEl.textContent = world.moduleCharges;
    this.productionPartsStat.hidden = world.productionParts <= 0;
    this.productionPartsEl.textContent = world.productionParts;
    this.comboEl.hidden = world.comboStreak < 2;
    if (!this.comboEl.hidden) this.comboEl.textContent = `🔥 x${world.comboStreak}`;
    this.brownoutEl.hidden = world.powerFactor() >= 1;
    // maxWave (real progress), not waveNumber (whichever wave is currently active) —
    // this stat should hold steady at your true frontier even mid-replay.
    this.waveEl.textContent = `${spawner.maxWave} / ${CONFIG.MAX_WAVES}`;
    this.tierEl.textContent = this.currentTierName(spawner.waveNumber);
    this.fpsEl.textContent = Math.round(fps);

    const pct = Math.max(0, (base.health / base.maxHealth) * 100);
    this.baseFill.style.width = `${pct}%`;
    this.baseFill.style.background = pct <= 30 ? CONFIG.BASE_DAMAGE_COLOR : CONFIG.BASE_COLOR;
    this.baseText.textContent = `${Math.ceil(base.health)} / ${base.maxHealth}`;

    const missingHealth = base.maxHealth - base.health;
    this.repairBtn.hidden = state !== 'playing' || missingHealth <= 0;
    if (!this.repairBtn.hidden) {
      const heal = Math.min(CONFIG.BASE_REPAIR_AMOUNT, missingHealth);
      const cost = world.repairBaseCost(heal);
      this.repairBtn.textContent = `Repair ${Math.round(heal)} (${cost}g)`;
      this.repairBtn.disabled = world.gold < cost;
    }

    // Opens the Wave Menu — visible only during the idle phase, same gating the
    // old direct-trigger button used.
    this.triggerWaveBtn.hidden = state !== 'playing' || !spawner.canTriggerWave();
    if (!this.triggerWaveBtn.hidden) {
      this.triggerWaveBtn.textContent = `Wave ${spawner.maxWave + 1} ▾`;
    }

    // Phase 8a: 'lost' is no longer a reachable Game.state — a base wipe now heals
    // and continues (see game.js/spawner.js). VICTORY at MAX_WAVES is the only banner left.
    if (state === 'won') {
      this.banner.textContent = 'VICTORY';
      this.banner.className = 'ui-banner win';
      this.banner.hidden = false;
      this.restartBtn.hidden = false;
    } else {
      this.banner.hidden = true;
      this.restartBtn.hidden = true;
    }
  }
}
