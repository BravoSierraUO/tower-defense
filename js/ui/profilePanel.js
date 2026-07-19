// Profile panel: level/XP, prestige, skill tree, and the achievement list.
import { CONFIG } from '../config.js';
import { ACHIEVEMENTS } from '../achievements.js';

export class ProfilePanel {
  constructor({ onPrestige, onBuySkill, onClose } = {}) {
    this.el = document.getElementById('profile-panel');
    document.getElementById('profile-close-btn').addEventListener('click', () => onClose?.());
    document.getElementById('profile-footer-close-btn').addEventListener('click', () => onClose?.());
    this.levelEl = document.getElementById('profile-level');
    this.cpEl = document.getElementById('profile-cp');
    this.xpFill = document.getElementById('profile-xp-fill');
    this.prestigeEl = document.getElementById('profile-prestige');
    this.pointsEl = document.getElementById('profile-points');
    this.statsEl = document.getElementById('profile-stats');

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
  }

  update(snap, profile) {
    this.levelEl.textContent = snap.level;
    this.cpEl.textContent = `${snap.cp} CP  (${snap.levelCp} → ${snap.nextCp})`;
    this.xpFill.style.width = `${Math.round(Math.max(0, Math.min(1, snap.progress)) * 100)}%`;
    this.prestigeEl.textContent = snap.prestige;
    this.pointsEl.textContent = snap.prestigePoints;
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
  }
}
