import { HudPanel } from './ui/hudPanel.js';
import { CorePanel } from './ui/corePanel.js';
import { FieldPanel } from './ui/fieldPanel.js';
import { ProfilePanel } from './ui/profilePanel.js';
import { AboutPanel } from './ui/aboutPanel.js';
import { SettingsPanel } from './ui/settingsPanel.js';
import { AvatarMenu } from './ui/avatarMenu.js';
import { ConfirmModal } from './ui/confirmModal.js';
import { MissionBanner } from './ui/missionBanner.js';

// UI reads world state and writes to the DOM overlay. It never mutates
// gameplay state and is never zoomed/panned by the camera (plain HTML,
// sits above the canvas via CSS).
//
// This class is a thin composition shell: it owns the view switch (which side
// panel is visible — core/profile/about/settings/field) and forwards per-frame
// updates to whichever panel owns each concern. Each panel builds its own DOM
// refs/listeners in its own constructor (see js/ui/*.js) and exposes an
// update() that's only called while that panel is the active view.
export class UI {
  // callbacks: { onUnlockTech(id), onDockTrade(), onPrestige(), onBuySkill(id),
  // onRestart(), onRepairBase(), onMarketBuyMetal(), onMarketBuyGold(), onToggleAbout(),
  // onReportBug(), onSelectFieldBuild(type), onSelectRoomType(type) } —
  // UI only translates DOM clicks into these; it never mutates gameplay state
  // directly (Game/World/Profile do).
  constructor({ onUnlockTech, onDockTrade, onPrestige, onBuySkill, onRestart, onRepairBase, onMarketBuyMetal, onMarketBuyGold, onToggleAbout, onToggleProfile, onToggleSettings, onResetProgress, onReportBug, onTriggerWave, onSelectFieldBuild, onSelectRoomType } = {}) {
    this.modeHint = document.getElementById('ui-mode-hint');

    this.hud = new HudPanel({ onRestart, onRepairBase, onTriggerWave });
    this.core = new CorePanel({ onUnlockTech, onDockTrade, onMarketBuyMetal, onMarketBuyGold, onSelectRoomType });
    this.field = new FieldPanel({ onSelectFieldBuild });
    this.profile = new ProfilePanel({ onPrestige, onBuySkill, onClose: onToggleProfile });
    this.about = new AboutPanel({ onToggleAbout });
    this.mission = new MissionBanner();

    // afterConfirm closes the JSON viewer regardless of which reset entry point
    // was used — settingsPanel isn't constructed yet at this point, but the
    // closure only runs later (on click), by which point it is.
    this.confirmModal = new ConfirmModal({ afterConfirm: () => this.settings.hideJsonViewer() });
    const onOpenResetConfirm = () => this.confirmModal.open(onResetProgress);
    this.settings = new SettingsPanel({ onOpenResetConfirm, onClose: onToggleSettings });
    this.avatarMenu = new AvatarMenu({ onToggleProfile, onToggleAbout, onToggleSettings, onReportBug, onOpenResetConfirm });
  }

  update(world, fps, state, view, commandCore, profile, selectedTower, selectedScavenger, fieldBuildType, missions, selectedRoomType) {
    const spawner = world.spawner;
    const base = world.base;

    const inCore = view === 'core';
    const inProfile = view === 'profile';
    const inAbout = view === 'about';
    const inSettings = view === 'settings';
    this.modeHint.textContent = (inCore ? 'B — Tower Field' : 'B — Command Core') + ' · P — Profile · O — About · S — Settings';

    this.core.el.hidden = !inCore;
    this.core.coreBuildBar.hidden = !inCore;
    this.field.towerBuildBar.hidden = inCore || inProfile || inAbout || inSettings;
    this.profile.el.hidden = !inProfile;
    this.about.el.hidden = !inAbout;
    this.settings.el.hidden = !inSettings;

    this.settings.update(inSettings, profile);
    if (inCore) this.core.update(world, commandCore, selectedRoomType);

    const snap = profile.snapshot();
    if (inProfile) this.profile.update(snap, profile);

    this.hud.update({ world, spawner, base, fps, state, level: snap.level, profile });
    this.field.update(view, world, profile, selectedTower, selectedScavenger, fieldBuildType);
    this.mission.update(missions);
  }
}
