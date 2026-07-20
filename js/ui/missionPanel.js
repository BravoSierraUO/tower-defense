// Mission Menu (Phase 8f): the mission banner is glance-only — this is the real
// browse view. An accordion of every mission in `MISSIONS` (fixed at import time,
// so a future 5th/6th mission just adds a row, no code change here), each
// expandable to its hint + reward, with a "Track" button that picks which mission
// the banner/glow points at instead of always defaulting to the earliest unmet one.
import { MISSIONS } from '../missions.js';

export class MissionPanel {
  constructor({ onTrack, onClose } = {}) {
    this.overlay = document.getElementById('mission-panel-overlay');
    this.list = document.getElementById('mission-panel-list');
    document.getElementById('mission-panel-close-btn').addEventListener('click', () => onClose?.());
    document.getElementById('mission-panel-footer-close-btn').addEventListener('click', () => onClose?.());
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) onClose?.(); });

    this.rows = {};
    for (const m of MISSIONS) {
      const row = document.createElement('div');
      row.className = 'mission-row';

      const header = document.createElement('button');
      header.className = 'mission-row-header';
      header.innerHTML =
        '<span class="mission-row-status"></span>' +
        `<span class="mission-row-text">${m.text}</span>` +
        '<span class="mission-row-chevron">▾</span>';
      header.addEventListener('click', () => row.classList.toggle('open'));

      const body = document.createElement('div');
      body.className = 'mission-row-body';
      const rewardText = this.rewardText(m.reward);
      const hint = document.createElement('div');
      hint.className = 'mission-row-hint';
      hint.textContent = m.hint;
      body.appendChild(hint);
      if (rewardText) {
        const reward = document.createElement('div');
        reward.className = 'mission-row-reward';
        reward.textContent = `Reward: ${rewardText}`;
        body.appendChild(reward);
      }
      const trackBtn = document.createElement('button');
      trackBtn.className = 'settings-btn-sm mission-row-track-btn';
      trackBtn.addEventListener('click', e => { e.stopPropagation(); onTrack?.(m.id); });
      body.appendChild(trackBtn);

      row.appendChild(header);
      row.appendChild(body);
      this.list.appendChild(row);
      this.rows[m.id] = { row, status: header.querySelector('.mission-row-status'), trackBtn };
    }
  }

  rewardText(reward) {
    if (!reward) return '';
    const parts = [];
    if (reward.gold) parts.push(`${reward.gold}g`);
    if (reward.metal) parts.push(`${reward.metal}m`);
    return parts.join(' · ');
  }

  update(missions) {
    const tracked = missions.current();
    for (const m of MISSIONS) {
      const { row, status, trackBtn } = this.rows[m.id];
      const done = missions.completed.has(m.id);
      row.classList.toggle('mission-row-done', done);
      status.textContent = done ? '✅' : '⬜';
      if (done) {
        trackBtn.textContent = 'Done';
        trackBtn.disabled = true;
        trackBtn.classList.remove('mission-row-tracked');
      } else {
        const isTracked = tracked?.id === m.id;
        trackBtn.textContent = isTracked ? '★ Tracking' : 'Track';
        trackBtn.disabled = false;
        trackBtn.classList.toggle('mission-row-tracked', isTracked);
      }
    }
  }
}
