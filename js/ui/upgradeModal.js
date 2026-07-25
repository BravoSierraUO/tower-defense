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
  constructor({ onUpgrade, onEquip, onUnequip, onClose, onUpgradeStat, onBoostStat } = {}) {
    this.overlay = document.getElementById('upgrade-modal-overlay');
    this.title = document.getElementById('upgrade-modal-title');
    this.sub = document.getElementById('upgrade-modal-sub');
    this.costLine = document.getElementById('upgrade-modal-cost-line');
    this.upgradeBtn = document.getElementById('upgrade-modal-upgrade-btn');
    this.equippedEl = document.getElementById('upgrade-modal-equipped');
    this.statsEl = document.getElementById('upgrade-modal-stats');
    this.statsHeading = document.getElementById('upgrade-modal-stats-heading');
    this.itemsEl = document.getElementById('upgrade-modal-items');
    document.getElementById('upgrade-modal-close-btn').addEventListener('click', () => onClose?.());
    document.getElementById('upgrade-modal-footer-close-btn').addEventListener('click', () => onClose?.());
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) onClose?.(); });
    this.upgradeBtn.addEventListener('click', () => onUpgrade?.());
    this.onEquip = onEquip;
    this.onUnequip = onUnequip;
    this.onUpgradeStat = onUpgradeStat;
    this.onBoostStat = onBoostStat;
    this._lastSig = null;
  }

  // Change-detector, and it fixes a real bug rather than saving cycles. update() runs
  // EVERY FRAME while the modal is open, and the three innerHTML rebuilds below were
  // therefore destroying and recreating every button 60x/second. A browser only fires
  // `click` when mousedown and mouseup land on the same element, so a button replaced
  // mid-press swallows the click — which made the new stat buttons essentially
  // unclickable, and had been quietly doing the same to the shipped Equip/Unequip
  // buttons since Phase 11. Caught by a live click-through timing out with
  // "element was detached from the DOM, retrying" 59 times, not by reading the file.
  //
  // Same shape as js/ui/bottomBar.js's signature(): cover everything the DOM below
  // actually displays, rebuild only when one of those changes. Plain text assignments
  // (title/sub/costLine) are left unconditional — they don't detach anything.
  signature(world, entity, isTower) {
    const ladders = isTower
      ? CONFIG.UPGRADABLE_STATS.map(s => `${entity.permUpgrades[s]}/${entity.runUpgrades[s]}`).join(',')
      : '';
    return [
      entity.x, entity.y, isTower ? 'T' : 'S', entity.tier,
      ladders,
      world.tdRunActive ? 'run' : 'prep',
      Math.floor(world.iron), Math.floor(world.scrap),
      entity.equippedItem?.id ?? '-',
      world.inventory.items.map(i => i.id).join('.')
    ].join('|');
  }

  // Phase 20: one row per upgradable stat, showing what each ladder has bought and a
  // single button whose meaning follows the stage. In prep it buys a PERMANENT step
  // with iron; during a run it buys a TEMPORARY one with scrap. Rebuilt per update()
  // like the rest of this modal — nothing here is a fixed list.
  renderStats(world, tower) {
    this.statsEl.innerHTML = '';
    const inRun = world.tdRunActive;

    for (const stat of CONFIG.UPGRADABLE_STATS) {
      const row = document.createElement('div');
      row.className = 'bar-row';

      const perm = tower.permUpgrades[stat] || 0;
      const run = tower.runUpgrades[stat] || 0;
      // Show the two ladders separately rather than as one combined number: the whole
      // point is that one survives the run and the other doesn't, and a single
      // "x1.21" would hide which half is about to disappear.
      const parts = [`perm x${tower.permMult(stat).toFixed(2)}`];
      if (run > 0) parts.push(`run x${tower.runMult(stat).toFixed(2)}`);

      const label = document.createElement('span');
      label.className = 'bar-row-text';
      label.innerHTML = `<span class="bar-row-label">${this.statLabel(stat)}</span>`
        + `<span class="bar-row-sub">${parts.join(' · ')}</span>`;

      const btn = document.createElement('button');
      btn.className = 'settings-btn-sm';
      if (inRun) {
        const cost = world.towerStatBoostCost();
        btn.textContent = `+10% · ${cost} scrap`;
        btn.disabled = !world.canBoostTowerStat(tower, stat);
        btn.title = run >= CONFIG.STAT_BOOST_MAX_STACKS
          ? 'Boost cap reached for this run'
          : 'Temporary — lost when this run ends';
        btn.addEventListener('click', () => this.onBoostStat?.(stat));
      } else {
        const cost = world.towerStatUpgradeCost(tower, stat);
        btn.textContent = `+10% · ${cost} iron`;
        btn.disabled = world.iron < cost;
        btn.title = 'Permanent';
        btn.addEventListener('click', () => this.onUpgradeStat?.(stat));
      }

      row.append(label, btn);
      this.statsEl.appendChild(row);
    }
  }

  statLabel(stat) {
    return { damage: 'Damage', fireRate: 'Fire Rate', range: 'Range' }[stat] || stat;
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
      this.costLine.textContent = `Upgrade cost: ${cost} iron (have ${Math.floor(world.iron)})`;
      this.upgradeBtn.textContent = 'Upgrade';
      this.upgradeBtn.disabled = world.iron < cost;
    } else {
      this.costLine.textContent = 'Max tier reached.';
      this.upgradeBtn.textContent = 'MAX';
      this.upgradeBtn.disabled = true;
    }

    // Everything below replaces DOM, so it only runs when something visible changed —
    // see signature() above for why that matters.
    const sig = this.signature(world, entity, isTower);
    if (sig === this._lastSig) return;
    this._lastSig = sig;

    // Towers only — a Scavenger's stats are yield and reach, not damage/fireRate/range.
    this.statsHeading.hidden = !isTower;
    this.statsEl.hidden = !isTower;
    if (isTower) this.renderStats(world, entity);

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
