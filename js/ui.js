import { HudPanel } from './ui/hudPanel.js';
import { CorePanel } from './ui/corePanel.js';
import { FieldPanel } from './ui/fieldPanel.js';
import { ProfilePanel } from './ui/profilePanel.js';
import { AboutPanel } from './ui/aboutPanel.js';
import { SettingsPanel } from './ui/settingsPanel.js';
import { AvatarMenu } from './ui/avatarMenu.js';
import { ConfirmModal } from './ui/confirmModal.js';
import { MissionBanner } from './ui/missionBanner.js';
import { RadialMenu } from './ui/radialMenu.js';
import { WavePanel } from './ui/wavePanel.js';
import { MissionPanel } from './ui/missionPanel.js';

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
  // onToggleCore(), onReportBug(), onRadialAction(id), onOpenWaveMenu(), onSelectWave(n, isReplay),
  // onOpenMissionMenu(), onTrackMission(id) } — UI only translates DOM clicks into
  // these; it never mutates gameplay state directly (Game/World/Profile do).
  constructor({ onUnlockTech, onDockTrade, onPrestige, onBuySkill, onRestart, onRepairBase, onMarketBuyMetal, onMarketBuyGold, onToggleAbout, onToggleCore, onToggleProfile, onToggleSettings, onResetProgress, onReportBug, onOpenWaveMenu, onSelectWave, onOpenMissionMenu, onTrackMission, onRadialAction } = {}) {
    this.modeHint = document.getElementById('ui-mode-hint');

    this.hud = new HudPanel({ onRestart, onRepairBase, onOpenWaveMenu });
    this.core = new CorePanel({ onUnlockTech, onDockTrade, onMarketBuyMetal, onMarketBuyGold });
    this.field = new FieldPanel();
    this.profile = new ProfilePanel({ onPrestige, onBuySkill, onClose: onToggleProfile });
    this.about = new AboutPanel({ onToggleAbout });
    this.mission = new MissionBanner({ onOpenMenu: onOpenMissionMenu });
    this.radialMenu = new RadialMenu({ onAction: onRadialAction });
    this.waves = new WavePanel({ onSelectWave, onClose: onOpenWaveMenu });
    this.missionPanel = new MissionPanel({ onTrack: onTrackMission, onClose: onOpenMissionMenu });

    // afterConfirm closes the JSON viewer regardless of which reset entry point
    // was used — settingsPanel isn't constructed yet at this point, but the
    // closure only runs later (on click), by which point it is.
    this.confirmModal = new ConfirmModal({ afterConfirm: () => this.settings.hideJsonViewer() });
    const onOpenResetConfirm = () => this.confirmModal.open(onResetProgress);
    this.settings = new SettingsPanel({ onOpenResetConfirm, onClose: onToggleSettings });
    this.avatarMenu = new AvatarMenu({ onToggleCore, onToggleProfile, onToggleAbout, onToggleSettings, onReportBug, onOpenResetConfirm });
  }

  update(world, fps, state, view, commandCore, profile, selectedTower, selectedScavenger, missions, waveMenuOpen, missionMenuOpen) {
    const spawner = world.spawner;
    const base = world.base;

    this.waves.overlay.hidden = !waveMenuOpen;
    if (waveMenuOpen) this.waves.update(spawner, world);

    this.missionPanel.overlay.hidden = !missionMenuOpen;
    if (missionMenuOpen) this.missionPanel.update(missions);

    const inCore = view === 'core';
    const inProfile = view === 'profile';
    const inAbout = view === 'about';
    const inSettings = view === 'settings';
    // Phase 8g: B/P/O/S hotkeys are gone (S collided with WASD panning) — Command
    // Core/Profile/About/Settings are all avatar-menu items now, one path instead
    // of two redundant ones.
    this.modeHint.textContent = 'Avatar menu (top right) → Command Core · Profile · About · Settings';

    this.core.el.hidden = !inCore;
    this.profile.el.hidden = !inProfile;
    this.about.el.hidden = !inAbout;
    this.settings.el.hidden = !inSettings;

    this.settings.update(inSettings, profile);
    if (inCore) this.core.update(world, commandCore);

    const snap = profile.snapshot();
    if (inProfile) this.profile.update(snap, profile);

    this.hud.update({ world, spawner, base, fps, state, level: snap.level, profile });
    this.field.update(view, world, profile, selectedTower, selectedScavenger);
    this.mission.update(missions);
  }
}
