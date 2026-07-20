import { HudPanel } from './ui/hudPanel.js';
import { CorePanel } from './ui/corePanel.js';
import { FieldPanel } from './ui/fieldPanel.js';
import { ProfilePanel } from './ui/profilePanel.js';
import { AboutPanel } from './ui/aboutPanel.js';
import { SettingsPanel } from './ui/settingsPanel.js';
import { AvatarMenu } from './ui/avatarMenu.js';
import { MenuModal } from './ui/menuModal.js';
import { ConfirmModal } from './ui/confirmModal.js';
import { MissionBanner } from './ui/missionBanner.js';
import { RadialMenu } from './ui/radialMenu.js';
import { WavePanel } from './ui/wavePanel.js';
import { MissionPanel } from './ui/missionPanel.js';
import { InventoryPanel } from './ui/inventoryPanel.js';
import { UpgradeModal } from './ui/upgradeModal.js';

// UI reads world state and writes to the DOM overlay. It never mutates
// gameplay state and is never zoomed/panned by the camera (plain HTML,
// sits above the canvas via CSS).
//
// This class is a thin composition shell: it owns the view switch (field vs.
// the interactive Core canvas) plus the Player Menu Shell modal (Account/
// Settings/Inventory/About tabs — see js/ui/menuModal.js) and forwards
// per-frame updates to whichever panel owns each concern. Each panel builds
// its own DOM refs/listeners in its own constructor (see js/ui/*.js) and
// exposes an update() that's only called while that panel's tab is active.
export class UI {
  // callbacks: { onUnlockTech(id), onDockTrade(), onPrestige(), onBuySkill(id),
  // onRestart(), onRepairBase(), onMarketBuyMetal(), onMarketBuyGold(), onToggleAbout(),
  // onToggleCore(), onReportBug(), onRadialAction(id), onOpenWaveMenu(), onSelectWave(n, isReplay),
  // onOpenMissionMenu(), onTrackMission(id), onOpenInventoryMenu(), onRefine(id), onCraft(id),
  // onCloseUpgradeModal(), onUpgradeSelected(), onEquipItem(id), onUnequipItem(), onCloseMenuModal() } —
  // UI only translates DOM clicks into these; it never mutates gameplay state directly (Game/World/Profile do).
  constructor({ onUnlockTech, onDockTrade, onPrestige, onBuySkill, onRestart, onRepairBase, onMarketBuyMetal, onMarketBuyGold, onToggleAbout, onToggleCore, onToggleProfile, onToggleSettings, onResetProgress, onReportBug, onOpenWaveMenu, onSelectWave, onOpenMissionMenu, onTrackMission, onOpenInventoryMenu, onRefine, onCraft, onCloseUpgradeModal, onUpgradeSelected, onEquipItem, onUnequipItem, onRadialAction, onCloseMenuModal } = {}) {
    this.modeHint = document.getElementById('ui-mode-hint');

    this.hud = new HudPanel({ onRestart, onRepairBase, onOpenWaveMenu });
    this.core = new CorePanel({ onUnlockTech, onDockTrade, onMarketBuyMetal, onMarketBuyGold });
    this.field = new FieldPanel();
    this.profile = new ProfilePanel({ onPrestige, onBuySkill });
    this.about = new AboutPanel({ onToggleAbout });
    this.mission = new MissionBanner({ onOpenMenu: onOpenMissionMenu });
    this.radialMenu = new RadialMenu({ onAction: onRadialAction });
    this.waves = new WavePanel({ onSelectWave, onClose: onOpenWaveMenu });
    this.missionPanel = new MissionPanel({ onTrack: onTrackMission, onClose: onOpenMissionMenu });
    this.inventoryPanel = new InventoryPanel({ onRefine, onCraft });
    this.upgradeModal = new UpgradeModal({ onUpgrade: onUpgradeSelected, onEquip: onEquipItem, onUnequip: onUnequipItem, onClose: onCloseUpgradeModal });
    this.menuModal = new MenuModal({ onToggleProfile, onToggleSettings, onOpenInventoryMenu, onToggleAbout, onOpenCore: onToggleCore, onClose: onCloseMenuModal });

    // afterConfirm closes the JSON viewer regardless of which reset entry point
    // was used — settingsPanel isn't constructed yet at this point, but the
    // closure only runs later (on click), by which point it is.
    this.confirmModal = new ConfirmModal({ afterConfirm: () => this.settings.hideJsonViewer() });
    const onOpenResetConfirm = () => this.confirmModal.open(onResetProgress);
    this.settings = new SettingsPanel({ onOpenResetConfirm });
    this.avatarMenu = new AvatarMenu({ onToggleCore, onToggleProfile, onToggleAbout, onToggleSettings, onReportBug, onOpenResetConfirm });
  }

  update(world, fps, state, view, commandCore, profile, selectedTower, selectedScavenger, missions, waveMenuOpen, missionMenuOpen, menuModalOpen, menuModalTab, upgradeModalOpen) {
    const spawner = world.spawner;
    const base = world.base;

    this.waves.overlay.hidden = !waveMenuOpen;
    if (waveMenuOpen) this.waves.update(spawner, world);

    this.missionPanel.overlay.hidden = !missionMenuOpen;
    if (missionMenuOpen) this.missionPanel.update(missions);

    this.upgradeModal.overlay.hidden = !upgradeModalOpen;
    if (upgradeModalOpen) this.upgradeModal.update(world, selectedTower, selectedScavenger);

    const inCore = view === 'core';
    const inAccount = menuModalOpen && menuModalTab === 'account';
    const inSettings = menuModalOpen && menuModalTab === 'settings';
    const inInventory = menuModalOpen && menuModalTab === 'inventory';
    const inAbout = menuModalOpen && menuModalTab === 'about';
    // Phase 5b: the avatar menu's Profile/Settings/Inventory/About items and the
    // radial menu's Inventory leaf all open the same Player Menu Shell modal now,
    // just on different tabs — one path instead of four independent ones.
    this.modeHint.textContent = 'Avatar menu (top right) → Account · Settings · Inventory · Base · About';

    this.core.el.hidden = !inCore;
    if (inCore) this.core.update(world, commandCore);

    this.menuModal.overlay.hidden = !menuModalOpen;
    if (menuModalOpen) this.menuModal.setActiveTab(menuModalTab);
    this.profile.el.hidden = !inAccount;
    this.settings.el.hidden = !inSettings;
    this.inventoryPanel.overlay.hidden = !inInventory;
    this.about.el.hidden = !inAbout;

    this.settings.update(inSettings, profile);
    if (inInventory) this.inventoryPanel.update(world);

    const snap = profile.snapshot();
    if (inAccount) this.profile.update(snap, profile, world.inventory);

    this.hud.update({ world, spawner, base, fps, state, level: snap.level, profile });
    this.field.update(view, world, profile, selectedTower, selectedScavenger);
    this.mission.update(missions);
  }
}
