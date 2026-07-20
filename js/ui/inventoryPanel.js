// Inventory Menu: recipe rows structurally lifted from missionPanel.js/
// wavePanel.js — same "build every row once at construction, only update()
// touches live values" pattern (recipes are fixed at import time just like
// MISSIONS was). The one thing that ISN'T fixed — crafted/dropped item
// instances — gets its own list, rebuilt each update() call instead of built
// once, since it grows at runtime. Phase 5b: no longer its own standalone
// overlay — this is now one tab body inside MenuModal's shared shell
// (js/ui/menuModal.js), same as Account/Settings/About.
import { CONFIG } from '../config.js';
import { buildItemRow } from './itemRow.js';

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
  constructor({ onRefine, onCraft } = {}) {
    this.overlay = document.getElementById('inventory-panel');
    this.sub = document.getElementById('inventory-panel-sub');
    this.recipeList = document.getElementById('inventory-panel-recipes');
    this.itemList = document.getElementById('inventory-panel-items');

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

    // Read-only — no actionLabel — since a crafted item just sits here until
    // it's equipped from the Upgrade Modal (Phase 7c/11) instead.
    this.itemList.innerHTML = '';
    const items = world.inventory.items.slice(-MAX_ITEMS_SHOWN).reverse();
    for (const item of items) this.itemList.appendChild(buildItemRow(item, null, null));
  }
}
