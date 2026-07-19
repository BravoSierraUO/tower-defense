import { CONFIG } from './config.js';
import { ACHIEVEMENTS } from './achievements.js';
import { loadStats } from './stats.js';

// About panel category bars reuse the game's one real accent color (#7ED9FF) at descending
// opacity per category instead of inventing a 4-hue palette — same "one accent color" primitive
// every other panel follows (see whatever.html's Primitives section).
const CATEGORY_BAR_OPACITIES = [1, 0.75, 0.55, 0.4];

// UI reads world state and writes to the DOM overlay. It never mutates
// gameplay state and is never zoomed/panned by the camera (plain HTML,
// sits above the canvas via CSS).
export class UI {
  // callbacks: { onUnlockTech(id), onDockTrade(), onPrestige(), onBuySkill(id),
  // onRestart(), onRepairBase(), onMarketBuyMetal(), onMarketBuyGold(), onToggleAbout() } —
  // UI only translates DOM clicks into these; it never mutates gameplay state
  // directly (Game/World/Profile do).
  constructor({ onUnlockTech, onDockTrade, onPrestige, onBuySkill, onRestart, onRepairBase, onMarketBuyMetal, onMarketBuyGold, onToggleAbout, onToggleProfile, onToggleSettings, onResetProgress } = {}) {
    this.scoreEl = document.getElementById('ui-score');
    this.goldEl = document.getElementById('ui-gold');
    this.metalEl = document.getElementById('ui-metal');
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
    this.corePowerDraw = document.getElementById('core-power-draw');
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

    this.marketBuyMetalBtn = document.getElementById('market-buy-metal-btn');
    this.marketBuyMetalBtn.textContent = `Trade ${CONFIG.MARKET_TRADE_GOLD_COST} Gold → Metal`;
    this.marketBuyMetalBtn.addEventListener('click', () => onMarketBuyMetal?.());

    this.marketBuyGoldBtn = document.getElementById('market-buy-gold-btn');
    this.marketBuyGoldBtn.textContent = `Trade ${CONFIG.MARKET_TRADE_METAL_COST} Metal → Gold`;
    this.marketBuyGoldBtn.addEventListener('click', () => onMarketBuyGold?.());

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

    // ---- Phase 5: About/Analytics panel (reads stats.json, see js/stats.js) ----
    this.aboutBtn = document.getElementById('about-btn');
    this.aboutBtn.addEventListener('click', () => onToggleAbout?.());
    this.aboutPanel = document.getElementById('about-panel');
    this.aboutGeneratedEl = document.getElementById('about-generated');
    this.aboutTotalLinesEl = document.getElementById('about-total-lines');
    this.aboutCategoriesEl = document.getElementById('about-categories');
    this.aboutCommitListEl = document.getElementById('about-commit-list');
    loadStats()
      .then(stats => this.renderAbout(stats))
      .catch(err => { this.aboutGeneratedEl.textContent = `Couldn't load stats.json (${err.message})`; });

    // ---- avatar menu (top-right): Profile/About/Settings/Reset entry point ----
    this.avatarBtn = document.getElementById('avatar-btn');
    this.avatarMenu = document.getElementById('avatar-menu');
    this.avatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setAvatarMenuOpen(this.avatarMenu.hidden);
    });
    document.addEventListener('click', () => this.setAvatarMenuOpen(false));

    document.getElementById('menu-profile').addEventListener('click', () => { this.setAvatarMenuOpen(false); onToggleProfile?.(); });
    document.getElementById('menu-about').addEventListener('click', () => { this.setAvatarMenuOpen(false); onToggleAbout?.(); });
    document.getElementById('menu-settings').addEventListener('click', () => { this.setAvatarMenuOpen(false); onToggleSettings?.(); });
    document.getElementById('menu-reset').addEventListener('click', () => { this.setAvatarMenuOpen(false); this.openConfirmModal(onResetProgress); });

    // ---- Settings panel: theme toggle, raw-save-data JSON viewer, hard reset ----
    this.settingsPanel = document.getElementById('settings-panel');
    this.settingsStorageSize = document.getElementById('settings-storage-size');
    this.latestProfile = null; // updated every frame in update(); read on demand by the JSON viewer
    document.getElementById('settings-storage-key').textContent = CONFIG.PROFILE.STORAGE_KEY;
    document.getElementById('json-viewer-key').textContent = CONFIG.PROFILE.STORAGE_KEY;

    this.themeToggle = document.getElementById('theme-toggle');
    this.themeToggleLabel = document.getElementById('theme-toggle-label');
    this.applyTheme(localStorage.getItem('td.theme') || 'dark');
    this.themeToggle.addEventListener('click', () => {
      this.applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
    });

    this.jsonViewer = document.getElementById('json-viewer');
    this.jsonViewerContent = document.getElementById('json-viewer-content');
    document.getElementById('view-json-btn').addEventListener('click', () => {
      if (!this.latestProfile) return;
      this.jsonViewerContent.textContent = this.latestProfile.rawJSON();
      this.jsonViewer.hidden = false;
    });
    document.getElementById('json-close-btn').addEventListener('click', () => { this.jsonViewer.hidden = true; });
    document.getElementById('json-copy-btn').addEventListener('click', () => {
      navigator.clipboard?.writeText(this.jsonViewerContent.textContent).catch(() => {});
    });

    document.getElementById('menu-reset-progress').addEventListener('click', () => this.openConfirmModal(onResetProgress));

    // ---- confirm modal: shared by both reset-progress entry points above ----
    this.confirmModal = document.getElementById('confirm-modal');
    this.confirmAction = null;
    document.getElementById('confirm-cancel-btn').addEventListener('click', () => this.closeConfirmModal());
    document.getElementById('confirm-ok-btn').addEventListener('click', () => {
      this.confirmAction?.();
      this.closeConfirmModal();
      this.jsonViewer.hidden = true;
    });
    this.confirmModal.addEventListener('click', (e) => { if (e.target === this.confirmModal) this.closeConfirmModal(); });
  }

  setAvatarMenuOpen(open) {
    this.avatarMenu.hidden = !open;
    this.avatarBtn.setAttribute('aria-expanded', String(open));
  }

  openConfirmModal(action) {
    this.confirmAction = action;
    this.confirmModal.hidden = false;
  }

  closeConfirmModal() {
    this.confirmModal.hidden = true;
    this.confirmAction = null;
  }

  // Theme is independent of gameplay state (no Game/Profile involvement) —
  // just a data-theme attribute + a localStorage flag read back on load.
  applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('td.theme', theme); } catch (e) {}
    const light = theme === 'light';
    this.themeToggle.setAttribute('aria-checked', String(light));
    this.themeToggleLabel.textContent = light ? 'Light' : 'Dark';
  }

  // Stats are a static snapshot for the session (regenerated by the pre-commit hook, not
  // live), so the panel is built once when the fetch resolves rather than every frame.
  renderAbout(stats) {
    this.aboutGeneratedEl.textContent = `Generated ${stats.generatedAt} · ${stats.growth.length} commits`;

    const total = stats.categories.reduce((s, c) => s + c.value, 0);
    this.aboutTotalLinesEl.textContent = total.toLocaleString();

    this.aboutCategoriesEl.innerHTML = stats.categories.map((c, i) => `
      <div class="about-category-row">
        <div class="about-category-label"><span>${c.label}</span><span>${c.value.toLocaleString()}</span></div>
        <div class="about-category-track">
          <div class="about-category-fill" style="width:${Math.round(c.value / total * 100)}%;background:rgba(126,217,255,${CATEGORY_BAR_OPACITIES[i] ?? 0.5})"></div>
        </div>
      </div>`).join('');

    this.aboutCommitListEl.innerHTML = stats.growth.slice().reverse().slice(0, 12).map((p, i, arr) => {
      const idx = stats.growth.length - 1 - i;
      const prev = idx > 0 ? stats.growth[idx - 1].cum : 0;
      const delta = p.cum - prev;
      return `<div class="about-commit-row"><span class="h">${p.hash}</span><span class="d">${p.date}</span><span class="s">${p.subject}</span><span class="n">${delta >= 0 ? '+' : ''}${delta}</span></div>`;
    }).join('');
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
    const inAbout = view === 'about';
    const inSettings = view === 'settings';
    this.modeHint.textContent = (inCore ? 'B — Tower Field' : 'B — Command Core') + ' · P — Profile · O — About · S — Settings';
    this.corePanel.hidden = !inCore;
    this.coreBuildBar.hidden = !inCore;
    this.towerBuildBar.hidden = inCore || inProfile || inAbout || inSettings;
    this.profilePanel.hidden = !inProfile;
    this.aboutPanel.hidden = !inAbout;
    this.settingsPanel.hidden = !inSettings;

    this.latestProfile = profile;
    if (inSettings) {
      const bytes = new Blob([profile.rawJSON()]).size;
      this.settingsStorageSize.textContent = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      this.jsonViewer.hidden = true;
    }
    if (inCore) {
      const totals = commandCore.totals();
      this.corePower.textContent = totals.power;
      this.coreCompute.textContent = `${totals.cyclesPerMin}/min`;
      this.coreStorage.textContent = totals.storageCap;
      this.coreResearch.textContent = `${Math.floor(commandCore.research)} (+${totals.researchRate.toFixed(1)}/s)`;
      this.coreTowerCost.textContent = `${world.towerCost()}m`;
      this.coreScavengerCost.textContent = `${world.scavengerCost()}m`;
      this.coreMetalRate.textContent = `${world.metalPerSecond().toFixed(1)}/s`;
      this.corePowerDraw.textContent = `${world.powerConsumption()} / ${world.powerSupply()}`;

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

      const marketBuilt = commandCore.isBuilt('market');
      this.marketBuyMetalBtn.hidden = !marketBuilt;
      this.marketBuyGoldBtn.hidden = !marketBuilt;
      if (marketBuilt) {
        this.marketBuyMetalBtn.disabled = world.gold < CONFIG.MARKET_TRADE_GOLD_COST;
        this.marketBuyGoldBtn.disabled = world.metal < CONFIG.MARKET_TRADE_METAL_COST;
      }
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
    this.brownoutEl.hidden = world.powerFactor() >= 1;
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
