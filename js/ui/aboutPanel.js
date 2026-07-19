// About/Analytics panel (Phase 5): renders the pre-commit-hook-generated stats.json
// snapshot once on load — it's a static snapshot for the session, not live, so
// there's nothing to redo per frame (see js/stats.js for the fetch).
import { loadStats } from '../stats.js';

// Reuses the game's one real accent color (#7ED9FF) at descending opacity per category
// instead of inventing a 4-hue palette — same "one accent color" primitive every other
// panel follows (see whatever.html's Primitives section).
const CATEGORY_BAR_OPACITIES = [1, 0.75, 0.55, 0.4];

export class AboutPanel {
  constructor({ onToggleAbout } = {}) {
    this.el = document.getElementById('about-panel');
    this.aboutBtn = document.getElementById('about-btn');
    this.aboutBtn.addEventListener('click', () => onToggleAbout?.());
    this.generatedEl = document.getElementById('about-generated');
    this.totalLinesEl = document.getElementById('about-total-lines');
    this.categoriesEl = document.getElementById('about-categories');
    this.commitListEl = document.getElementById('about-commit-list');
    loadStats()
      .then(stats => this.render(stats))
      .catch(err => { this.generatedEl.textContent = `Couldn't load stats.json (${err.message})`; });
  }

  render(stats) {
    this.generatedEl.textContent = `Generated ${stats.generatedAt} · ${stats.growth.length} commits`;

    const total = stats.categories.reduce((s, c) => s + c.value, 0);
    this.totalLinesEl.textContent = total.toLocaleString();

    this.categoriesEl.innerHTML = stats.categories.map((c, i) => `
      <div class="about-category-row">
        <div class="about-category-label"><span>${c.label}</span><span>${c.value.toLocaleString()}</span></div>
        <div class="about-category-track">
          <div class="about-category-fill" style="width:${Math.round(c.value / total * 100)}%;background:rgba(126,217,255,${CATEGORY_BAR_OPACITIES[i] ?? 0.5})"></div>
        </div>
      </div>`).join('');

    this.commitListEl.innerHTML = stats.growth.slice().reverse().slice(0, 12).map((p, i) => {
      const idx = stats.growth.length - 1 - i;
      const prev = idx > 0 ? stats.growth[idx - 1].cum : 0;
      const delta = p.cum - prev;
      return `<div class="about-commit-row"><span class="h">${p.hash}</span><span class="d">${p.date}</span><span class="s">${p.subject}</span><span class="n">${delta >= 0 ? '+' : ''}${delta}</span></div>`;
    }).join('');
  }
}
