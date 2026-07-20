// Profile panel: level/XP, prestige, skill tree, and the achievement list.
import { CONFIG } from '../config.js';
import { ACHIEVEMENTS } from '../achievements.js';

export class ProfilePanel {
  constructor({ onPrestige, onBuySkill } = {}) {
    this.el = document.getElementById('profile-panel');
    this.levelEl = document.getElementById('profile-level');
    this.cpEl = document.getElementById('profile-cp');
    this.xpFill = document.getElementById('profile-xp-fill');
    this.prestigeEl = document.getElementById('profile-prestige');
    this.pointsEl = document.getElementById('profile-points');
    this.statsEl = document.getElementById('profile-stats');
    this.stationTierEl = document.getElementById('profile-station-tier');

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

    // Achievement tiles are built once (matches the tech-tree-button pattern in
    // corePanel.js) and just have their text/classes updated per frame in update()
    // — rebuilding ~20 DOM nodes every frame would be wasteful.
    this.achievementList = document.getElementById('achievement-list');
    this.achievementEls = {};
    for (const a of ACHIEVEMENTS) {
      const el = document.createElement('div');
      el.className = `achievement-item tier-${a.tier}`;
      el.innerHTML = '<span class="achievement-icon"></span><span class="achievement-name"></span><span class="achievement-hint"></span>';
      this.achievementList.appendChild(el);
      this.achievementEls[a.id] = el;
    }

    // Loot Odds — the "metal chance 80%, diamonds 0.01%" stats-screen flex
    // Phase 11 filed and parked (its lifetimeOreMined/lifetimeOreSalvaged
    // counters existed since v2.17 with nothing displaying them). Only the 3
    // ore types Inventory actually tracks lifetime totals for get a row —
    // plain Metal isn't one of them (World.metal owns that pool directly,
    // see inventory.js's addOre() comment).
    this.lootOddsList = document.getElementById('loot-odds-list');
    this.lootOddsRows = {};
    for (const type of Object.keys(CONFIG.ORE_TYPES)) {
      if (type === 'metal') continue;
      const row = document.createElement('div');
      row.className = 'wave-row';
      row.innerHTML =
        '<div class="wave-row-info">' +
          `<span class="wave-row-label">${CONFIG.ORE_TYPES[type].label}</span>` +
          '<span class="wave-row-meta"></span>' +
        '</div>';
      this.lootOddsList.appendChild(row);
      this.lootOddsRows[type] = row.querySelector('.wave-row-meta');
    }
  }

  // Trims to 2 decimals for sub-1% odds (so "0.01%" survives) and to a whole
  // number above that — matches the precision CONFIG.ORE_LOOT_TABLE/
  // ENEMY_ORE_DROP_TABLE's own comments already use.
  formatPct(n) {
    return `${(n < 1 ? n.toFixed(2) : Math.round(n))}%`;
  }

  updateLootOdds(inventory) {
    for (const [type, meta] of Object.entries(this.lootOddsRows)) {
      const t1 = CONFIG.ORE_LOOT_TABLE[0][type] || 0;
      const t3 = CONFIG.ORE_LOOT_TABLE[CONFIG.ORE_LOOT_TABLE.length - 1][type] || 0;
      const salvageWeight = CONFIG.ENEMY_ORE_DROP_TABLE[type] || 0;
      const salvagePct = (salvageWeight / 100) * CONFIG.ENEMY_ORE_DROP_CHANCE * 100;
      const mined = Math.round(inventory.lifetimeOreMined[type] || 0);
      const salvaged = inventory.lifetimeOreSalvaged[type] || 0;
      meta.textContent =
        `Mining ${this.formatPct(t1)} (T1) → ${this.formatPct(t3)} (T3) · ` +
        `Salvage ${this.formatPct(salvagePct)}/kill  —  ` +
        `Lifetime: ${mined.toLocaleString()} mined, ${salvaged.toLocaleString()} salvaged`;
    }
  }

  update(snap, profile, inventory) {
    this.levelEl.textContent = snap.level;
    this.cpEl.textContent = `${snap.cp} CP  (${snap.levelCp} → ${snap.nextCp})`;
    this.xpFill.style.width = `${Math.round(Math.max(0, Math.min(1, snap.progress)) * 100)}%`;
    this.prestigeEl.textContent = snap.prestige;
    this.pointsEl.textContent = snap.prestigePoints;
    this.stationTierEl.textContent = snap.stationTierName;
    this.statsEl.textContent =
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

    this.updateLootOdds(inventory);
  }
}
