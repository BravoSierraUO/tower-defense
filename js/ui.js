import { CONFIG } from './config.js';
import { ACHIEVEMENTS } from './achievements.js';

// UI reads world state and writes to the DOM overlay. It never mutates
// gameplay state and is never zoomed/panned by the camera (plain HTML,
// sits above the canvas via CSS).
export class UI {
  // callbacks: { onUnlockTech(id), onDockTrade(), onPrestige(), onBuySkill(id),
  // onRestart() } — UI only translates DOM clicks into these; it never mutates
  // gameplay state directly (Game/World/Profile do).
  constructor({ onUnlockTech, onDockTrade, onPrestige, onBuySkill, onRestart } = {}) {
    this.scoreEl = document.getElementById('ui-score');
    this.goldEl = document.getElementById('ui-gold');
    this.waveEl = document.getElementById('ui-wave');
    this.tierEl = document.getElementById('ui-tier');
    this.levelEl = document.getElementById('ui-level');
    this.fpsEl = document.getElementById('ui-fps');
    this.baseFill = document.getElementById('ui-base-fill');
    this.baseText = document.getElementById('ui-base-text');
    this.banner = document.getElementById('ui-banner');
    this.restartBtn = document.getElementById('restart-btn');
    this.restartBtn.addEventListener('click', () => onRestart?.());

    this.modeHint = document.getElementById('ui-mode-hint');
    this.corePanel = document.getElementById('core-panel');
    this.corePower = document.getElementById('core-power');
    this.coreCompute = document.getElementById('core-compute');
    this.coreStorage = document.getElementById('core-storage');
    this.coreResearch = document.getElementById('core-research');
    this.coreTowerCost = document.getElementById('core-tower-cost');
    this.coreRewardBonus = document.getElementById('core-reward-bonus');
    this.towerBuildBar = document.getElementById('tower-build-bar');
    this.coreBuildBar = document.getElementById('core-build-bar');

    this.lockedSlotEls = {
      factory: document.getElementById('core-slot-factory'),
      hangar: document.getElementById('core-slot-hangar'),
      shield: document.getElementById('core-slot-shield'),
      dock: document.getElementById('core-slot-dock')
    };

    this.techTreeList = document.getElementById('tech-tree-list');
    this.techNodeButtons = {};
    for (const node of CONFIG.TECH_TREE) {
      const btn = document.createElement('button');
      btn.className = 'tech-node-btn';
      btn.addEventListener('click', () => onUnlockTech?.(node.id));
      this.techTreeList.appendChild(btn);
      this.techNodeButtons[node.id] = btn;
    }

    this.dockTradeBtn = document.getElementById('dock-trade-btn');
    this.dockTradeBtn.textContent = `Trade ${CONFIG.DOCK_TRADE_GOLD_COST} Gold → Research`;
    this.dockTradeBtn.addEventListener('click', () => onDockTrade?.());

    // ---- Phase 4: profile panel (level/XP, prestige, skill tree, achievements) ----
    this.profilePanel = document.getElementById('profile-panel');
    this.profileLevelEl = document.getElementById('profile-level');
    this.profileCpEl = document.getElementById('profile-cp');
    this.profileXpFill = document.getElementById('profile-xp-fill');
    this.profilePrestigeEl = document.getElementById('profile-prestige');
    this.profilePointsEl = document.getElementById('profile-points');
    this.profileStatsEl = document.getElementById('profile-stats');

    this.prestigeBtn = document.getElementById('prestige-btn');
    this.prestigeBtn.addEventListener('click', () => onPrestige?.());

    this.skillList = document.getElementById('skill-list');
    this.skillButtons = {};
    for (const s of CONFIG.SKILLS) {
      const btn = document.createElement('button');
      btn.className = 'skill-btn';
      btn.addEventListener('click', () => onBuySkill?.(s.id));
      this.skillList.appendChild(btn);
      this.skillButtons[s.id] = btn;
    }

    // Achievement tiles are built once (matches the tech-tree-button pattern
    // above) and just have their text/classes updated per frame in update() —
    // rebuilding ~20 DOM nodes every frame would be wasteful.
    this.achievementList = document.getElementById('achievement-list');
    this.achievementEls = {};
    for (const a of ACHIEVEMENTS) {
      const el = document.createElement('div');
      el.className = `achievement-item tier-${a.tier}`;
      el.innerHTML = '<span class="achievement-icon"></span><span class="achievement-name"></span><span class="achievement-hint"></span>';
      this.achievementList.appendChild(el);
      this.achievementEls[a.id] = el;
    }

    this.toastEl = document.getElementById('achievement-toast');
    this.toastQueue = [];
    this.toastUntil = 0;
  }

  currentTierName(waveNumber) {
    const entries = Object.entries(CONFIG.DIFFICULTY_TIERS)
      .filter(([, t]) => waveNumber >= t.unlockWave)
      .sort((a, b) => b[1].unlockWave - a[1].unlockWave);
    return entries.length ? entries[0][0] : '-';
  }

  update(world, fps, state, view, commandCore, profile) {
    const spawner = world.spawner;
    const base = world.base;

    const inCore = view === 'core';
    const inProfile = view === 'profile';
    this.modeHint.textContent = (inCore ? 'B — Tower Field' : 'B — Command Core') + ' · P — Profile';
    this.corePanel.hidden = !inCore;
    this.coreBuildBar.hidden = !inCore;
    this.towerBuildBar.hidden = inCore || inProfile;
    this.profilePanel.hidden = !inProfile;
    if (inCore) {
      const totals = commandCore.totals();
      this.corePower.textContent = totals.power;
      this.coreCompute.textContent = totals.compute;
      this.coreStorage.textContent = totals.storageCap;
      this.coreResearch.textContent = `${Math.floor(commandCore.research)} (+${totals.researchRate.toFixed(1)}/s)`;
      this.coreTowerCost.textContent = world.towerCost();
      this.coreRewardBonus.textContent = `+${Math.round((world.rewardMultiplier() - 1) * 100)}%`;

      for (const [type, el] of Object.entries(this.lockedSlotEls)) {
        if (el) el.classList.toggle('locked', !commandCore.isRoomUnlocked(type));
      }

      for (const node of CONFIG.TECH_TREE) {
        const btn = this.techNodeButtons[node.id];
        const unlocked = commandCore.unlockedTech.has(node.id);
        btn.textContent = unlocked ? `${node.label} (unlocked)` : `${node.label} — ${node.cost} research`;
        btn.disabled = unlocked || !commandCore.canUnlockTech(node.id);
        btn.classList.toggle('unlocked', unlocked);
      }

      const dockBuilt = commandCore.isBuilt('dock');
      this.dockTradeBtn.hidden = !dockBuilt;
      if (dockBuilt) this.dockTradeBtn.disabled = world.gold < CONFIG.DOCK_TRADE_GOLD_COST;
    }

    const snap = profile.snapshot();
    this.levelEl.textContent = snap.level;

    if (inProfile) {
      this.profileLevelEl.textContent = snap.level;
      this.profileCpEl.textContent = `${snap.cp} CP  (${snap.levelCp} → ${snap.nextCp})`;
      this.profileXpFill.style.width = `${Math.round(Math.max(0, Math.min(1, snap.progress)) * 100)}%`;
      this.profilePrestigeEl.textContent = snap.prestige;
      this.profilePointsEl.textContent = snap.prestigePoints;
      this.profileStatsEl.textContent =
        `${snap.life.kills} kills · ${snap.life.wavesCleared} waves cleared · ` +
        `${snap.life.towersPlaced} towers · ${snap.life.roomsBuilt} rooms · ` +
        `${snap.life.runsWon}W-${snap.life.runsLost}L`;

      this.prestigeBtn.textContent = snap.canPrestige
        ? `Prestige now (+${snap.prestigePayout} pts)`
        : `Reach Level ${snap.prestigeGate} to prestige`;
      this.prestigeBtn.disabled = !snap.canPrestige;

      for (const s of profile.skillsView()) {
        const btn = this.skillButtons[s.id];
        btn.textContent = s.maxed
          ? `${s.icon} ${s.name} — MAX (+${s.bonusPct}%)`
          : `${s.icon} ${s.name} Lv.${s.level} (+${s.bonusPct}%) — ${s.nextCost} pt${s.nextCost === 1 ? '' : 's'}`;
        btn.disabled = !s.canBuy;
        btn.classList.toggle('maxed', s.maxed);
      }

      for (const a of profile.achievements()) {
        const el = this.achievementEls[a.id];
        el.classList.toggle('earned', a.earned);
        el.querySelector('.achievement-icon').textContent = a.earned ? a.icon : '❔';
        el.querySelector('.achievement-name').textContent = a.earned ? a.name : '???';
        el.querySelector('.achievement-hint').textContent = a.earned ? a.hint : '';
      }
    }

    // Achievement-unlock toast: queued so a fixpoint burst of unlocks shows one at a time.
    for (const a of profile.drainUnlocks()) this.toastQueue.push(a);
    if (!this.toastEl.hidden && performance.now() > this.toastUntil) this.toastEl.hidden = true;
    if (this.toastEl.hidden && this.toastQueue.length) {
      const a = this.toastQueue.shift();
      this.toastEl.textContent = `${a.icon} Achievement Unlocked: ${a.name}`;
      this.toastEl.className = `achievement-toast tier-${a.tier}`;
      this.toastEl.hidden = false;
      this.toastUntil = performance.now() + 3000;
    }

    this.scoreEl.textContent = world.score;
    this.goldEl.textContent = `${Math.floor(world.gold)} / ${world.goldCap()}`;
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
      this.restartBtn.hidden = false;
    } else if (state === 'lost') {
      this.banner.textContent = `DEFEAT — wave ${spawner.waveNumber}`;
      this.banner.className = 'ui-banner lose';
      this.banner.hidden = false;
      this.restartBtn.hidden = false;
    } else {
      this.banner.hidden = true;
      this.restartBtn.hidden = true;
    }
  }
}
