// Field view: the Tower/Scavenger build-mode picker slots (shown when nothing is
// selected) and the inspector card for whichever tower/scavenger was last clicked
// (Phase 4b/4c). Grouped together because both only apply in view === 'field'.
import { layoutRadial } from './radialLayout.js';

export class FieldPanel {
  constructor({ onSelectFieldBuild } = {}) {
    this.towerBuildBar = document.getElementById('tower-build-bar');

    this.fieldSlotTower = document.getElementById('field-slot-tower');
    this.fieldSlotScavenger = document.getElementById('field-slot-scavenger');
    this.fieldSlotTowerCost = document.getElementById('field-slot-tower-cost');
    this.fieldSlotScavengerCost = document.getElementById('field-slot-scavenger-cost');

    this.fieldSlotTower.addEventListener('click', () => onSelectFieldBuild?.('tower'));
    this.fieldSlotScavenger.addEventListener('click', () => onSelectFieldBuild?.('scavenger'));

    layoutRadial([this.fieldSlotTower, this.fieldSlotScavenger], { radius: 110, arcDegrees: 80 });

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

  update(view, world, profile, selectedTower, selectedScavenger, fieldBuildType) {
    if (view === 'field') {
      this.fieldSlotTower.classList.toggle('selected', fieldBuildType === 'tower');
      this.fieldSlotScavenger.classList.toggle('selected', fieldBuildType === 'scavenger');
      this.fieldSlotTowerCost.textContent = `${world.towerCost()}m`;
      this.fieldSlotScavengerCost.textContent = `${world.scavengerCost()}m`;
    }

    // Tower/scavenger inspector — shown for whichever entity was last clicked,
    // hidden once it's no longer live (sold, or a restart wiped the World).
    const showTowerCard = view === 'field' && selectedTower && world.towers.includes(selectedTower);
    const showScavengerCard = view === 'field' && selectedScavenger && world.scavengers.includes(selectedScavenger);
    this.towerCard.hidden = !(showTowerCard || showScavengerCard);
    this.towerCombatStatsEl.hidden = !showTowerCard;
    this.towerMetalStatEl.hidden = !showScavengerCard;
    if (showTowerCard) {
      this.towerNameEl.textContent = 'Tower';
      this.towerTierEl.textContent = `Tier ${['I', 'II', 'III'][selectedTower.tier - 1]}`;
      this.towerDamageEl.textContent = Math.round(selectedTower.damage * profile.damageMult());
      this.towerRangeEl.textContent = Math.round(selectedTower.range);
      this.towerSpeedEl.textContent = selectedTower.fireRate.toFixed(2);
      this.towerUpgradeCostEl.textContent = selectedTower.canUpgrade()
        ? `${world.towerUpgradeCost(selectedTower)}m`
        : 'MAX';
    } else if (showScavengerCard) {
      this.towerNameEl.textContent = 'Scavenger Turret';
      this.towerTierEl.textContent = `Tier ${['I', 'II', 'III'][selectedScavenger.tier - 1]}`;
      this.towerMetalPerCycleEl.textContent = selectedScavenger.metalPerCycle;
      this.towerUpgradeCostEl.textContent = selectedScavenger.canUpgrade()
        ? `${world.scavengerUpgradeCost(selectedScavenger)}m`
        : 'MAX';
    }
  }
}
