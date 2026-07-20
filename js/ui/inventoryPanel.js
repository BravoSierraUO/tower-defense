// Inventory Menu (Phase 11 UI layer): structurally lifted from missionPanel.js/
// wavePanel.js — same .wave-panel shell, same "build every row once at
// construction, only update() touches live values" pattern (recipes are fixed
// at import time just like MISSIONS was). The one thing that ISN'T fixed —
// crafted/dropped item instances — gets its own list, rebuilt each update()
// call instead of built once, since it grows at runtime.
import { CONFIG } from '../config.js';

// Ordered raw -> refined -> component, matching the production-line fiction.
const REFINE_ORDER = Object.keys(CONFIG.REFINED_RECIPES);
const CRAFT_ORDER = Object.keys(CONFIG.COMPONENT_RECIPES);
const MAX_ITEMS_SHOWN = 20; // newest first — the items list has no cap otherwise

function costsOf(recipe) {
  const costs = { ...recipe };
  delete costs.label;
  return costs;
}

function materialLabel(key) {
  return CONFIG.ORE_TYPES[key]?.label || CONFIG.REFINED_RECIPES[key]?.label || key;
}

export class InventoryPanel {
  constructor({ onRefine, onCraft, onClose } = {}) {
    this.overlay = document.getElementById('inventory-panel-overlay');
    this.sub = document.getElementById('inventory-panel-sub');
    this.recipeList = document.getElementById('inventory-panel-recipes');
    this.itemList = document.getElementById('inventory-panel-items');
    document.getElementById('inventory-panel-close-btn').addEventListener('click', () => onClose?.());
    document.getElementById('inventory-panel-footer-close-btn').addEventListener('click', () => onClose?.());
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) onClose?.(); });

    this.rows = {};
    for (const id of REFINE_ORDER) this.buildRow(id, CONFIG.REFINED_RECIPES[id], 'ore', 'Refine', () => onRefine?.(id));
    for (const id of CRAFT_ORDER) this.buildRow(id, CONFIG.COMPONENT_RECIPES[id], 'refined', 'Craft', () => onCraft?.(id));
  }

  // Same accordion row shape (.mission-row/-header/-status/-text/-chevron/-body/-hint)
  // Phase 8f's Mission Menu already established — a recipe here plays exactly
  // the role a mission did there (fixed id, expandable detail, one action button).
  buildRow(id, recipe, poolKey, actionLabel, onAction) {
    const row = document.createElement('div');
    row.className = 'mission-row';

    const header = document.createElement('button');
    header.className = 'mission-row-header';
    header.innerHTML =
      '<span class="mission-row-status"></span>' +
      `<span class="mission-row-text">${recipe.label}</span>` +
      '<span class="mission-row-chevron">▾</span>';
    header.addEventListener('click', () => row.classList.toggle('open'));

    const body = document.createElement('div');
    body.className = 'mission-row-body';
    const hint = document.createElement('div');
    hint.className = 'mission-row-hint';
    body.appendChild(hint);
    const btn = document.createElement('button');
    btn.className = 'settings-btn-sm';
    btn.textContent = actionLabel;
    btn.addEventListener('click', e => { e.stopPropagation(); onAction(); });
    body.appendChild(btn);

    row.appendChild(header);
    row.appendChild(body);
    this.recipeList.appendChild(row);
    this.rows[id] = { status: header.querySelector('.mission-row-status'), hint, btn, costs: costsOf(recipe), poolKey };
  }

  update(world) {
    const factory = world.craftingRoom();
    this.sub.textContent = factory
      ? 'Refine ore into materials, then assemble materials into components at the Factory.'
      : 'Build a Factory (Command Core) to refine ore and craft components.';

    for (const r of Object.values(this.rows)) {
      const pool = r.poolKey === 'ore' ? world.inventory.ore : world.inventory.refined;
      const lines = Object.entries(r.costs).map(([key, amount]) => `${materialLabel(key)}: ${Math.floor(pool[key] || 0)}/${amount}`);
      const affordable = Object.entries(r.costs).every(([key, amount]) => (pool[key] || 0) >= amount);
      const ready = affordable && !!factory;
      r.status.textContent = ready ? '✅' : '⬜';
      r.hint.textContent = lines.join(' · ');
      r.btn.disabled = !ready;
    }

    // Reuses the Wave Menu's read-only .wave-row/-info/-label/-meta shape
    // (label + meta line, no button) — an item card needs no action, unlike
    // a recipe row above.
    this.itemList.innerHTML = '';
    const items = world.inventory.items.slice(-MAX_ITEMS_SHOWN).reverse();
    for (const item of items) {
      const recipe = CONFIG.COMPONENT_RECIPES[item.recipeId];
      const rarity = CONFIG.RARITY_TIERS.find(t => t.id === item.rarity);
      const row = document.createElement('div');
      row.className = 'wave-row';
      row.innerHTML = '<div class="wave-row-info"><span class="wave-row-label"></span><span class="wave-row-meta"></span></div>';
      const label = row.querySelector('.wave-row-label');
      label.textContent = `${recipe.label} `;
      const rarityTag = document.createElement('span');
      rarityTag.textContent = rarity.label;
      rarityTag.style.color = rarity.color;
      label.appendChild(rarityTag);
      row.querySelector('.wave-row-meta').textContent = item.affixes.length
        ? item.affixes.map(a => `${a.label} ${a.value >= 0 ? '+' : ''}${Math.round(a.value * 100)}%`).join(' · ')
        : 'No affixes';
      this.itemList.appendChild(row);
    }
  }
}
