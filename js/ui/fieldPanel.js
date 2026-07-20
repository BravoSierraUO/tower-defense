// Field view: the inspector card for whichever tower/scavenger was last
// clicked (Phase 4b/4c). The Tower/Scavenger build picker itself moved to the
// click-to-open radial context menu (js/ui/radialMenu.js, Phase 9b) — this
// panel no longer owns any build-mode UI.
import { CONFIG } from '../config.js';

export class FieldPanel {
  constructor() {
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
  }

  update(view, world, profile, selectedTower, selectedScavenger) {
    // Tower/scavenger inspector — shown for whichever entity was last clicked,
    // hidden once it's no longer live (sold, or a restart wiped the World).
    const showTowerCard = view === 'field' && selectedTower && world.towers.includes(selectedTower);
    const showScavengerCard = view === 'field' && selectedScavenger && world.scavengers.includes(selectedScavenger);
    this.towerCard.hidden = !(showTowerCard || showScavengerCard);
    this.towerCombatStatsEl.hidden = !showTowerCard;
    this.towerMetalStatEl.hidden = !showScavengerCard;
    if (showTowerCard) {
      // Phase 7a: name the card by its damage type's class label
      // (Railgun/Missile/Laser) instead of a generic "Tower".
      this.towerNameEl.textContent = CONFIG.DAMAGE_TYPES[selectedTower.damageType]?.label ?? 'Tower';
      this.towerTierEl.textContent = `Tier ${['I', 'II', 'III'][selectedTower.tier - 1]}`;
      // Phase 11: reads effective*() rather than the raw base stat, so an
      // equipped item's affixes actually show up here instead of the card
      // silently going stale the moment one's equipped.
      this.towerDamageEl.textContent = Math.round(selectedTower.effectiveDamage() * profile.damageMult());
      this.towerRangeEl.textContent = Math.round(selectedTower.effectiveRange());
      this.towerSpeedEl.textContent = selectedTower.effectiveFireRate().toFixed(2);
      this.towerUpgradeCostEl.textContent = selectedTower.canUpgrade()
        ? `${world.towerUpgradeCost(selectedTower)}m`
        : 'MAX';
    } else if (showScavengerCard) {
      this.towerNameEl.textContent = 'Scavenger Turret';
      this.towerTierEl.textContent = `Tier ${['I', 'II', 'III'][selectedScavenger.tier - 1]}`;
      this.towerMetalPerCycleEl.textContent = selectedScavenger.effectiveMetalPerCycle();
      this.towerUpgradeCostEl.textContent = selectedScavenger.canUpgrade()
        ? `${world.scavengerUpgradeCost(selectedScavenger)}m`
        : 'MAX';
    }
  }
}
