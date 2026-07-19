import { CONFIG } from './config.js';
import { ACHIEVEMENTS } from './achievements.js';

// UI reads world state and writes to the DOM overlay. It never mutates
// gameplay state and is never zoomed/panned by the camera (plain HTML,
// sits above the canvas via CSS).
export class UI {
  // callbacks: { onUnlockTech(id), onDockTrade(), onPrestige(), onBuySkill(id),
  // onRestart(), onRepairBase() } — UI only translates DOM clicks into these;
  // it never mutates gameplay state directly (Game/World/Profile do).
  constructor({ onUnlockTech, onDockTrade, onPrestige, onBuySkill, onRestart, onRepairBase } = {}) {
    this.scoreEl = document.getElementById('ui-score');
    this.goldEl = document.getElementById('ui-gold');
    this.metalEl = document.getElementById('ui-metal');
    this.comboEl = document.getElementById('ui-combo');
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

    // ---- Phase 4b/4c: tower/scavenger inspector & upgrade card ----
    this.towerCard = document.getElementById('tower-card');
    this.towerNameEl = document.getElementById('tower-name');
    this.towerTierEl = document.getElementById('tower-tier');
    this.towerCombatStatsEl = document.getElementById('tower-combat-stats');
    this.towerDamageEl = document.getElementById('tower-damage');
    this.towerRangeEl = document.getElementById('tower-range');
    this.towerSpeedEl = document.getElementById('tower-speed');
    this.towerMetalStatEl = document.getElementById('tower-metal-stat');
    this.towerMetalPerCycleEl = document.getElementById('tower-metal-per-cycle');
    this.towerUpgradeCostEl = document.getElementById('tower-upgrade-cost');

    this.modeHint = document.getElementById('ui-mode-hint');
    this.corePanel = document.getElementById('core-panel');
    this.corePower = document.getElementById('core-power');
    this.coreCompute = document.getElementById('core-compute');
    this.coreStorage = document.getElementById('core-storage');
    this.coreResearch = document.getElementById('core-research');
    this.coreTowerCost = document.getElementById('core-tower-cost');
    this.coreScavengerCost = document.getElementById('core-scavenger-cost');
    this.coreMetalRate = document.getElementById('core-metal-rate');
    this.towerBuildBar = document.getElementById('tower-build-bar');
    this.coreBuildBar = document.getElementById('core-build-bar');

    // Phase 4c: field-view Tower/Scavenger placement-mode slots.
    this.fieldSlotTower = document.getElementById('field-slot-tower');
    this.fieldSlotScavenger = document.getElementById('field-slot-scavenger');
    this.fieldSlotTowerCost = document.getElementById('field-slot-tower-cost');
    this.fieldSlotScavengerCost = document.getElementById('field-slot-scavenger-cost');

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

  update(world, fps, state, view, commandCore, profile, selectedTower, selectedScavenger, fieldBuildType) {
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
      this.coreCompute.textContent = `${totals.cyclesPerMin}/min`;
      this.coreStorage.textContent = totals.storageCap;
      this.coreResearch.textContent = `${Math.floor(commandCore.research)} (+${totals.researchRate.toFixed(1)}/s)`;
      this.coreTowerCost.textContent = `${world.towerCost()}m`;
      this.coreScavengerCost.textContent = `${world.scavengerCost()}m`;
      this.coreMetalRate.textContent = `${world.metalPerSecond().toFixed(1)}/s`;

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
    this.metalEl.textContent = `${Math.floor(world.metal)} / ${world.metalCap()}`;
    this.comboEl.hidden = world.comboStreak < 2;
    if (!this.comboEl.hidden) this.comboEl.textContent = `🔥 x${world.comboStreak}`;
    this.waveEl.textContent = `${spawner.waveNumber} / ${CONFIG.MAX_WAVES}`;
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

    // Phase 4c: field-view build-mode slots — live cost + which one's selected.
    if (view === 'field') {
      this.fieldSlotTower.classList.toggle('selected', fieldBuildType === 'tower');
      this.fieldSlotScavenger.classList.toggle('selected', fieldBuildType === 'scavenger');
      this.fieldSlotTowerCost.textContent = `${world.towerCost()}m`;
      this.fieldSlotScavengerCost.textContent = `${world.scavengerCost()}m`;
    }

    // Phase 4b/4c: tower/scavenger inspector — shown for whichever entity was
    // last clicked, hidden once it's no longer live (sold, or a restart wiped
    // the World).
    const showTowerCard = view === 'field' && selectedTower && world.towers.includes(selectedTower);
    const showScavengerCard = view === 'field' && selectedScavenger && world.scavengers.includes(selectedScavenger);
    this.towerCard.hidden = !(showTowerCard || showScavengerCard);
    this.towerCombatStatsEl.hidden = !showTowerCard;
    this.towerMetalStatEl.hidden = !showScavengerCard;
    if (showTowerCard) {
      this.towerNameEl.textContent = 'Tower';
      this.towerTierEl.textContent = `Tier ${['I', 'II', 'III'][selectedTower.tier - 1]}`;
      this.towerDamageEl.textContent = Math.round(selectedTower.damage * profile.damageMult());
      this.towerRangeEl.textContent = Math.round(selectedTower.range);
      this.towerSpeedEl.textContent = selectedTower.fireRate.toFixed(2);
      this.towerUpgradeCostEl.textContent = selectedTower.canUpgrade()
        ? `${world.towerUpgradeCost(selectedTower)}m`
        : 'MAX';
    } else if (showScavengerCard) {
      this.towerNameEl.textContent = 'Scavenger Turret';
      this.towerTierEl.textContent = `Tier ${['I', 'II', 'III'][selectedScavenger.tier - 1]}`;
      this.towerMetalPerCycleEl.textContent = selectedScavenger.metalPerCycle;
      this.towerUpgradeCostEl.textContent = selectedScavenger.canUpgrade()
        ? `${world.scavengerUpgradeCost(selectedScavenger)}m`
        : 'MAX';
    }

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
