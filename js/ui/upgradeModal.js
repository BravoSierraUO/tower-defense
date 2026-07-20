import { CONFIG } from '../config.js';
import { buildItemRow } from './itemRow.js';

// Upgrade Modal — Phase 7c's parked idea, finally given real content by
// Phase 11's item system. Opens on clicking your own Tower/Scavenger,
// replacing the old silent-click-to-upgrade convention (game.js). Unlike
// missionPanel/wavePanel/inventoryPanel, nothing here is a fixed list — tier,
// cost, and equipped item all depend on whichever entity is currently
// selected — so the whole body is rebuilt each update() call, same
// "just re-render text content" shape fieldPanel.js's inspector card already
// uses for the exact same two entity types.
export class UpgradeModal {
  constructor({ onUpgrade, onEquip, onUnequip, onClose } = {}) {
    this.overlay = document.getElementById('upgrade-modal-overlay');
    this.title = document.getElementById('upgrade-modal-title');
    this.sub = document.getElementById('upgrade-modal-sub');
    this.costLine = document.getElementById('upgrade-modal-cost-line');
    this.upgradeBtn = document.getElementById('upgrade-modal-upgrade-btn');
    this.equippedEl = document.getElementById('upgrade-modal-equipped');
    this.itemsEl = document.getElementById('upgrade-modal-items');
    document.getElementById('upgrade-modal-close-btn').addEventListener('click', () => onClose?.());
    document.getElementById('upgrade-modal-footer-close-btn').addEventListener('click', () => onClose?.());
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) onClose?.(); });
    this.upgradeBtn.addEventListener('click', () => onUpgrade?.());
    this.onEquip = onEquip;
    this.onUnequip = onUnequip;
  }

  update(world, selectedTower, selectedScavenger) {
    const entity = selectedTower || selectedScavenger;
    if (!entity) return;

    const isTower = !!selectedTower;
    this.title.textContent = isTower
      ? (CONFIG.DAMAGE_TYPES[entity.damageType]?.label ?? 'Tower')
      : 'Scavenger Turret';
    this.sub.textContent = `Tier ${['I', 'II', 'III'][entity.tier - 1]}`;

    if (entity.canUpgrade()) {
      const cost = isTower ? world.towerUpgradeCost(entity) : world.scavengerUpgradeCost(entity);
      this.costLine.textContent = `Upgrade cost: ${cost}m (have ${Math.floor(world.metal)}m)`;
      this.upgradeBtn.textContent = 'Upgrade';
      this.upgradeBtn.disabled = world.metal < cost;
    } else {
      this.costLine.textContent = 'Max tier reached.';
      this.upgradeBtn.textContent = 'MAX';
      this.upgradeBtn.disabled = true;
    }

    this.equippedEl.innerHTML = '';
    this.equippedEl.appendChild(entity.equippedItem
      ? buildItemRow(entity.equippedItem, 'Unequip', () => this.onUnequip?.())
      : this.hint('No item equipped.'));

    this.itemsEl.innerHTML = '';
    for (const item of world.inventory.items) {
      this.itemsEl.appendChild(buildItemRow(item, 'Equip', () => this.onEquip?.(item.id)));
    }
    if (world.inventory.items.length === 0) {
      this.itemsEl.appendChild(this.hint('No unequipped items — craft one at the Factory.'));
    }
  }

  hint(text) {
    const el = document.createElement('div');
    el.className = 'mission-row-hint';
    el.textContent = text;
    return el;
  }
}
