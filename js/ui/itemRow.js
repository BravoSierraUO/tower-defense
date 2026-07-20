import { CONFIG } from '../config.js';

// Shared by inventoryPanel.js's crafted-items list and upgradeModal.js's
// equipped/available-items lists — same .wave-row label+meta shape (Wave
// Menu, Phase 8e). Pass a falsy actionLabel to omit the button entirely
// (inventoryPanel.js's list is read-only; upgradeModal.js's Equip/Unequip
// rows need one).
export function buildItemRow(item, actionLabel, onAction) {
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

  if (actionLabel) {
    const btn = document.createElement('button');
    btn.className = 'settings-btn-sm';
    btn.textContent = actionLabel;
    btn.addEventListener('click', e => { e.stopPropagation(); onAction(); });
    row.appendChild(btn);
  }
  return row;
}
