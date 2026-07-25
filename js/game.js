import { CONFIG } from './config.js';
import { buildMenuConfig } from './menuConfig.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { World } from './world.js';
import { updateCombat } from './combat.js';
import { UI } from './ui.js';
import { CommandCore } from './commandcore.js';
import { Profile } from './profile.js';
import { MissionTracker } from './missions.js';
import { Sound } from './sound.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.camera = new Camera(canvas);
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    // Phase 4: the profile is the one thing that survives restart() — everything
    // else (commandCore, world) is per-run and gets rebuilt from scratch.
    this.profile = new Profile();
    this.commandCore = new CommandCore();
    this.world = new World(this.commandCore, this.profile);
    this.placeStarters();
    // Phase 8b: session-scoped, deliberately NOT rebuilt in restart()/prestige — a
    // one-time onboarding chain, not something a run should have to re-earn.
    this.missions = new MissionTracker();
    this.ui = new UI({
      onUnlockTech: id => this.commandCore.unlockTech(id),
      onDockTrade: () => this.world.tradeAtDock(),
      onPrestige: () => this.doPrestige(),
      onBuySkill: id => this.profile.buySkill(id),
      onRestart: () => this.restart(),
      onRepairBase: () => this.world.repairBase(CONFIG.BASE_REPAIR_AMOUNT),
      onMarketBuyIron: () => this.world.tradeGoldForIron(),
      onMarketBuyGold: () => this.world.tradeIronForGold(),
      onOpenWaveMenu: () => { this.waveMenuOpen = !this.waveMenuOpen; },
      onSelectWave: (n, isReplay) => {
        const started = isReplay ? this.world.spawner.triggerReplay(n) : this.world.spawner.triggerWave();
        if (started) { Sound.play('tap'); this.waveMenuOpen = false; }
      },
      onOpenMissionMenu: () => { this.missionMenuOpen = !this.missionMenuOpen; },
      onTrackMission: id => this.missions.track(id),
      onOpenInventoryMenu: () => this.openMenuTab('inventory'),
      onRefine: id => this.world.refineMaterial(id),
      onCraft: id => this.world.craftComponent(id),
      onCloseUpgradeModal: () => { this.upgradeModalOpen = false; },
      onUpgradeSelected: () => {
        if (this.selectedTower) this.world.upgradeTower(this.selectedTower);
        else if (this.selectedScavenger) this.world.upgradeScavenger(this.selectedScavenger);
      },
      onEquipItem: itemId => this.world.equipItem(this.selectedTower || this.selectedScavenger, itemId),
      onUnequipItem: () => this.world.unequipItem(this.selectedTower || this.selectedScavenger),
      onMenuAction: id => this.handleMenuAction(id),
      // Phase 18a: the bottom bar's two zoom slots. Routed through
      // Camera#zoomBy so the ZOOM_MIN/ZOOM_MAX clamp is applied in exactly one
      // place, shared with the wheel and the new keyboard bindings.
      onZoom: factor => this.camera.zoomBy(factor),
      // The bar's tap-to-cancel affordance. Same disarm the Escape branch of
      // handleInput() does, minus the menu-closing — this is a deliberate
      // "cancel what's armed" rather than a universal dismiss.
      onCancelArmed: () => { this.fieldBuildType = null; this.selectedRoomType = null; },
      // Phase 8g: the only mouse-driven way into Core now that the B hotkey is
      // gone — same toggle semantics the old key handler had (anywhere else -> field).
      // Phase 5b: also closes the Player Menu Shell modal if it happened to be
      // open — the "Base" tab button routes here (see js/ui/menuModal.js).
      onToggleCore: () => { this.menuModalOpen = false; this.view = this.view === 'field' ? 'core' : 'field'; this.selectedRoomType = null; },
      onToggleAbout: () => this.openMenuTab('about'),
      onToggleProfile: () => this.openMenuTab('account'),
      onToggleSettings: () => this.openMenuTab('settings'),
      onCloseMenuModal: () => { this.menuModalOpen = false; },
      onResetProgress: () => { this.profile.hardReset(); this.restart(); },
      onReportBug: () => this.reportBug(),
      onUseAbility: id => { const used = this.world.useAbility(id); if (used) Sound.play('ability'); return used; }
    });
    this.lastTime = 0;
    this.fps = 0;
    this.state = 'playing'; // 'playing' | 'won' — 'lost' retired in Phase 8a, see update() below
    this.view = 'field'; // 'field' | 'core' — Account/Settings/Inventory/About live in the menuModal* state below instead, not view
    this.selectedRoomType = null;
    this.selectedTower = null; // Phase 4b: tower the tower-card is showing
    this.selectedScavenger = null; // Phase 4c: scavenger the tower-card is showing
    // Phase 9b: null until armed via the radial menu's Build flyout (or a number
    // key) — no more "Tower" armed by default now that there's no persistent
    // build bar reminding you what's selected.
    this.fieldBuildType = null; // null | 'tower' | 'scavenger' — field-view placement mode
    // Wave Menu overlay — independent of `view` (like radialMenu/confirmModal) so it
    // can open from either Field or Core without disturbing the view switch.
    this.waveMenuOpen = false;
    // Same independent-overlay treatment as waveMenuOpen above.
    this.missionMenuOpen = false;
    // Phase 5b: the Player Menu Shell — one modal, Account/Settings/Inventory/
    // About as tabs (menuModalTab), replacing the old profile/about/settings
    // view values and Phase 11's standalone inventoryMenuOpen. Same
    // independent-of-`view` overlay treatment as waveMenuOpen/missionMenuOpen.
    this.menuModalOpen = false;
    this.menuModalTab = 'account'; // 'account' | 'settings' | 'inventory' | 'about'
    this.upgradeModalOpen = false;
    this.resetRunTrackers();
  }

  // Shared by the avatar menu's Profile/Settings/About items, the radial menu's
  // Inventory leaf, and the modal's own tab bar (js/ui/menuModal.js) — one path
  // to open (or, clicking the already-active tab again, close) the Player Menu
  // Shell on a given tab. "Base" isn't a tab here — see onToggleCore above.
  openMenuTab(tab) {
    if (this.menuModalOpen && this.menuModalTab === tab) this.menuModalOpen = false;
    else { this.menuModalOpen = true; this.menuModalTab = tab; }
  }

  // Phase 4c: onboarding guarantee — a free, already-active starter Reactor and
  // Scavenger Turret so the base produces power/metal from minute one, no
  // build-a-throwaway-then-rebuild-it step. Gate-bypassing placement only —
  // never routed through the normal buildRoom/placeTower gold/metal gates.
  placeStarters() {
    this.commandCore.placeStarterRoom('reactor', 0, 0);
    // Phase 16: the starter Scavenger now sits *inside* the base ring (where scavengers
    // live) rather than out in the tower field — same zone the player will place theirs.
    this.world.placeStarterScavenger(CONFIG.BASE_X + CONFIG.SCAVENGER_MIN_BASE_DISTANCE + CONFIG.GRID_SIZE, CONFIG.BASE_Y);
  }

  // Diff-watch markers for the profile-event observer in update() — reset
  // whenever a fresh World/CommandCore replaces the old one (restart()). Reads
  // live counts rather than hardcoding 0 so the pre-placed starter Reactor
  // doesn't award a free "room built" CP tick on every restart/prestige.
  resetRunTrackers() {
    this.lastKills = this.world.kills;
    this.lastWavesCleared = this.world.spawner.wavesCleared;
    this.lastTowersPlaced = this.world.towersPlaced;
    this.lastRoomsBuilt = this.commandCore.rooms.length;
    this.lastTechUnlocked = this.commandCore.unlockedTech.size;
  }

  // Starts a fresh run (new World/CommandCore) without touching the persistent
  // profile — used both by the win/lose "Play Again" button and by prestige.
  restart() {
    this.commandCore = new CommandCore();
    this.world = new World(this.commandCore, this.profile);
    this.placeStarters();
    this.state = 'playing';
    this.view = 'field';
    this.selectedRoomType = null;
    this.selectedTower = null;
    this.selectedScavenger = null;
    this.fieldBuildType = null;
    this.waveMenuOpen = false;
    this.missionMenuOpen = false;
    this.menuModalOpen = false;
    this.upgradeModalOpen = false;
    this.resetRunTrackers();
  }

  doPrestige() {
    if (this.profile.prestige()) this.restart();   // banked the payout — start the next climb fresh
  }

  // Shared by the '1'/'2' keyboard shortcut and the radial menu's Build
  // flyout (js/ui/radialMenu.js) — one code path for field-view placement
  // mode. Armed here, the ghost preview (renderer.drawFieldGhost) follows the
  // mouse until a click places it or Escape cancels.
  selectFieldBuild(type) {
    this.fieldBuildType = type;
  }

  // Shared by the '1'-'9'/'0' keyboard shortcut and the radial menu's Build
  // flyout — same toggle-off-if-already-selected-or-built convention the Core
  // view has used since Phase 4b.
  selectRoomType(type) {
    if (!type || !this.commandCore.isRoomUnlocked(type)) return;
    // A stackable type (Reactor) stays armable even once one exists — you can place more.
    const stackable = !!CONFIG.ROOM_TYPES[type]?.stackable;
    this.selectedRoomType = (this.commandCore.isBuilt(type) && !stackable) ? null : type;
  }

  // Phase 9b: click-to-open radial context menu, replacing the old always-on
  // build bar. Opens fresh at the clicked screen point with a config built
  // from whatever's true right now (room locks, current costs) — see
  // js/ui/radialMenu.js for why the menu itself needs no per-frame update().
  // Phase 18a: only reachable when ui.settings.menuStyle === 'radial'; in 'bar'
  // mode the bottom bar is the build surface and an empty click deselects.
  openRadialMenu(screenX, screenY) {
    this.ui.radialMenu.open(screenX, screenY, this.buildMenuConfig());
  }

  // What an empty-space click does, which is the one behaviour `menuStyle` has to
  // fork. In radial mode it opens the menu at the click point (Phase 9b's thesis,
  // preserved rather than quietly overwritten — its own card records the user
  // correction that produced it: "no bar at the bottom... click the empty space...
  // 1st level radial pops up"). In bar mode it deselects only.
  emptyFieldClick(screenX, screenY) {
    if (this.ui.settings.menuStyle === 'radial') {
      this.openRadialMenu(screenX, screenY);
      return;
    }
    this.fieldBuildType = null;
    this.selectedRoomType = null;
    this.selectedTower = null;
    this.selectedScavenger = null;
  }

  // Phase 18a: the contents themselves live in js/menuConfig.js as a pure
  // function so both menu renderers share one definition of what's buildable and
  // why something's locked, and so it can be unit-tested without a DOM (Game
  // can't be constructed outside a browser). This stays as a thin accessor
  // because callers already have a Game, not a (view, world, commandCore) triple.
  buildMenuConfig() {
    return buildMenuConfig(this.view, this.world, this.commandCore);
  }

  // Dispatches a leaf pick from whichever menu renderer is active (the radial
  // closes itself before this runs; the bar keeps its drawer state). Room-type
  // ids are checked against CONFIG.ROOM_TYPES rather than hardcoded, so a future
  // room type needs no change here.
  handleMenuAction(id) {
    if (id === 'base') {
      // Phase 18a: was two actions behind one view-flipping label ('home' —
      // Field recentred the camera, Core exited). A fixed bar slot can't mean
      // both, so entering the Core now *also* recentres: the camera work isn't
      // dropped, it rides along, and leaving the Core puts you back at the base
      // rather than wherever you'd panned off to.
      if (this.view === 'field') {
        this.camera.x = CONFIG.BASE_X;
        this.camera.y = CONFIG.BASE_Y;
        this.camera.zoom = 1;
        this.view = 'core';
      } else {
        this.view = 'field';
      }
      this.selectedRoomType = null;
    } else if (id === 'missions') {
      this.missionMenuOpen = true;
    } else if (id === 'inventory') {
      this.menuModalOpen = true;
      this.menuModalTab = 'inventory';
    } else if (id === 'scavenger' || CONFIG.DAMAGE_TYPES[id]) {
      this.selectFieldBuild(id);
    } else if (CONFIG.ROOM_TYPES[id]) {
      this.selectRoomType(id);
    }
  }

  // Phase 5c, smallest safe slice: no backend, no embedded token (a static client-side
  // game has nowhere safe to hold one) — just GitHub's own pre-filled "new issue" URL
  // scheme, auto-populated with enough run context to be useful, opened in a new tab.
  // The "never leaves the game" fuller version stays unscoped (see the Roadmap card)
  // until the token/auth question it depends on actually gets answered.
  reportBug() {
    const snap = this.profile.snapshot();
    const body = [
      '**Steps to reproduce:**',
      '_(please fill in)_',
      '',
      '**What happened:**',
      '_(please fill in)_',
      '',
      '**Context (auto-filled):**',
      `- Run state: ${this.state}`,
      `- View: ${this.view}`,
      `- Wave: ${this.world.spawner.waveNumber}`,
      `- Profile level: ${snap.level} (prestige ${snap.prestige})`,
      `- Browser: ${navigator.userAgent}`
    ].join('\n');
    const url = 'https://github.com/BravoSierraUO/tower-defense/issues/new'
      + `?title=${encodeURIComponent('[Bug] ')}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank', 'noopener');
  }

  handleInput() {
    for (const key of this.input.keyPresses) {
      // Phase 8g: the B/P/O/S view-toggle hotkeys are gone — B and S both
      // collided with WASD panning (holding S to pan south also flipped
      // Settings open, which then stopped camera.update() from running at all
      // since it's gated on view === 'field'). Profile/About/Settings/Command
      // Core are all reachable from the avatar menu now instead (see
      // js/ui/avatarMenu.js) — one mouse-driven path, not two redundant ones.
      if (key === 'escape') {
        // Phase 9b: universal cancel — closes an open radial menu and disarms
        // whatever build type was armed, so a fresh click reopens the menu
        // instead of placing/building immediately. Phase 18a: closes the bottom
        // bar's drawer on the same key, so the two menu styles cancel
        // identically. (The bar also carries a tap-to-cancel button, because
        // touch has no Escape — see js/ui/bottomBar.js.)
        this.ui.radialMenu.close();
        this.ui.bottomBar.close();
        this.fieldBuildType = null;
        this.selectedRoomType = null;
        this.waveMenuOpen = false;
        this.missionMenuOpen = false;
        this.menuModalOpen = false;
        this.upgradeModalOpen = false;
      } else if (this.view === 'core') {
        // Still positional (index into Object.keys(CONFIG.ROOM_TYPES)) — the
        // build menu's Build submenu (js/menuConfig.js) must be kept
        // in the same order by hand. Explicit keyOrder (not Number(key)-1)
        // just supports all 10 current room types, with '0' as the 10th slot
        // instead of computing to -1.
        const keyOrder = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
        const idx = keyOrder.indexOf(key);
        if (idx !== -1) this.selectRoomType(Object.keys(CONFIG.ROOM_TYPES)[idx]);
      } else if (this.view === 'field') {
        // Phase 4c: same number-key-selects-buildable-type convention the Core
        // view already uses for its 10 room slots. Phase 7a: 1-3 are now the 3
        // typed attackers (kinetic/energy/plasma, in CONFIG.DAMAGE_TYPES'
        // declared order — Railgun/Missile/Laser), 4 is Scavenger; must stay in
        // the same order as js/menuConfig.js's Field submenu.
        const fieldKeyOrder = ['1', '2', '3', '4'];
        const fieldTypes = [...Object.keys(CONFIG.DAMAGE_TYPES), 'scavenger'];
        const idx = fieldKeyOrder.indexOf(key);
        if (idx !== -1) this.selectFieldBuild(fieldTypes[idx]);
      }
    }
    this.input.keyPresses.length = 0;

    for (const click of this.input.clicks) {
      // Phase 9b: the radial menu's own slots are separate DOM elements above
      // the canvas, so a click that reaches here while the menu is open is by
      // definition a click "outside" it — dismiss only, no placement/upgrade
      // underneath, same convention as any other context menu.
      if (this.ui.radialMenu.isOpen) {
        this.ui.radialMenu.close();
        continue;
      }
      // Phase 18a: same convention for the bar's drawer — its rows are DOM
      // elements above the canvas, so a click arriving here while it's open is by
      // definition outside it. Dismiss only, no placement underneath, exactly as
      // the radial behaves above.
      if (this.ui.bottomBar.isOpen) {
        this.ui.bottomBar.close();
        continue;
      }
      if (this.view === 'field') {
        const worldPos = this.camera.screenToWorld(click.x, click.y);
        const distToBase = Math.hypot(worldPos.x - this.world.base.x, worldPos.y - this.world.base.y);
        const existingTower = this.world.towerAt(worldPos.x, worldPos.y);
        const existingScavenger = this.world.scavengerAt(worldPos.x, worldPos.y);
        if (distToBase <= this.world.base.radius) {
          // Phase 8g follow-up: clicking the base itself opens the Command Core —
          // now that the B hotkey is gone, this (plus the avatar menu) is the way
          // in. Wins over anything armed; nothing else meaningful happens from a
          // click on the base tile, and towers/scavengers can never occupy this
          // spot anyway (the base ring keeps towers/scavengers off it).
          this.view = 'core';
          this.selectedRoomType = null;
        } else if (existingTower) {
          // Phase 4b originally: click your own tower to attempt an upgrade,
          // silently, same no-op-if-you-can't-afford-it convention as upgradeRoom
          // below. Phase 11: opens the Upgrade Modal instead — it now has real
          // content a silent click never could (equip/unequip a crafted item).
          this.selectedTower = existingTower;
          this.selectedScavenger = null;
          this.upgradeModalOpen = true;
        } else if (existingScavenger) {
          this.selectedScavenger = existingScavenger;
          this.selectedTower = null;
          this.upgradeModalOpen = true;
        } else if (this.fieldBuildType === 'scavenger') {
          this.selectedScavenger = this.world.placeScavenger(worldPos.x, worldPos.y);
          this.selectedTower = null;
          // Phase 16 UX: a successful drop disarms the cursor (place one, then you're back
          // to neutral) instead of staying armed for repeat placement — re-arm to place
          // another. A failed drop keeps it armed so you can just click a legal spot.
          if (this.selectedScavenger) { Sound.play('build'); this.fieldBuildType = null; }
          else Sound.play('nope');
        } else if (CONFIG.DAMAGE_TYPES[this.fieldBuildType]) {
          this.selectedTower = this.world.placeTower(worldPos.x, worldPos.y, this.fieldBuildType);
          this.selectedScavenger = null;
          if (this.selectedTower) { Sound.play('build'); this.fieldBuildType = null; }
          else Sound.play('nope');
        } else {
          // Nothing armed and nothing to interact with. Phase 9b popped the
          // radial open right here (replacing an older default-to-Tower
          // placement) — Phase 18a keeps that, but only in radial mode. In bar
          // mode the bar IS the build surface, so an empty click deselects and
          // nothing else; opening a radial on top of a permanent bar would give
          // two competing build menus and make `menuStyle` a half-setting.
          this.emptyFieldClick(click.x, click.y);
        }
      } else if (this.view === 'core') {
        const cell = this.renderer.screenToCoreCell(click.x, click.y);
        if (cell && this.selectedRoomType) {
          if (this.world.buildRoom(this.selectedRoomType, cell.gx, cell.gy)) {
            Sound.play('build');
            this.selectedRoomType = null;
          } else {
            Sound.play('nope');
          }
        } else if (cell && this.commandCore.getRoomAt(cell.gx, cell.gy)) {
          this.world.upgradeRoom(cell.gx, cell.gy);
        } else {
          // Empty cell (or missed the grid entirely) and nothing armed.
          this.emptyFieldClick(click.x, click.y);
        }
      }
    }
    this.input.clicks.length = 0;

    for (const click of this.input.rightClicks) {
      if (this.view === 'field') {
        const worldPos = this.camera.screenToWorld(click.x, click.y);
        // Phase 4c: try Tower first, fall back to Scavenger Turret — whichever's actually there.
        if (this.world.sellTowerAt(worldPos.x, worldPos.y) || this.world.sellScavengerAt(worldPos.x, worldPos.y)) Sound.play('sell');
      } else {
        const cell = this.renderer.screenToCoreCell(click.x, click.y);
        if (cell) {
          // Phase 4b: right-click an unfinished room to rush its build timer
          // for gold; right-click a finished one keeps installing a module.
          const room = this.commandCore.getRoomAt(cell.gx, cell.gy);
          if (room && !room.isActive()) this.world.rushBuildRoom(cell.gx, cell.gy);
          else this.world.installModuleAt(cell.gx, cell.gy);
        }
      }
    }
    this.input.rightClicks.length = 0;
  }

  update(dt) {
    this.handleInput();
    if (this.view === 'field') this.camera.update(this.input, dt, this.ui.settings.keybindings);

    if (this.state === 'playing') {
      for (const tower of this.world.towers) {
        tower.update(dt);
      }
      this.world.updateSpawning(dt);
      updateCombat(this.world, dt);
      this.world.updateEnemies(dt);
      this.world.updateSalvage(dt); // Phase 16: after updateEnemies, so this frame's corpses are already dropped
      this.world.updateAbilities(dt);
      this.commandCore.update(dt);
      this.world.updatePassiveIncome(dt, this.profile.level());
      this.world.updateCycleBudget(dt);
      this.world.updateOreAccrual(dt); // Phase 11 skeleton
      this.watchProfileEvents();
      // A mission's `reward` (see missions.js) pays out exactly once, the instant it
      // newly completes — same "diff-watch and translate into a world mutation" shape
      // watchProfileEvents() above already uses for other run events.
      for (const m of this.missions.update({
        towersPlaced: this.world.towersPlaced,
        scavengersPlaced: this.world.scavengersPlaced,
        waveNumber: this.world.spawner.waveNumber,
        roomsBuilt: this.commandCore.rooms.length,
        view: this.view
      })) {
        if (m.reward?.gold) this.world.addGold(m.reward.gold);
        if (m.reward?.iron) this.world.addIron(m.reward.iron);
      }

      // Phase 8a: a base wipe no longer ends the run — Spawner.finalizeWave() heals it back
      // up and pays a lesser chest instead (see spawner.js). The only way a run now ends is
      // MAX_WAVES, always a win. 'lost' is dead as a Game.state value; runEnd is only ever
      // emitted won:true. Known side effect, not fixed here: achievements.js's
      // 'lessons-learned' badge (lose a run) is unearnable until Phase 8d's Patrol mode
      // brings back a real loss condition.
      if (this.world.spawner.complete) {
        this.state = 'won';
        this.profile.emit('runEnd', { won: true, wave: this.world.spawner.waveNumber, baseHealthPct: this.world.base.health / this.world.base.maxHealth });
      }
    }
  }

  // Phase 4: the profile observes run state from the outside (like ui.js
  // already does) rather than the engine files knowing it exists — cheap
  // monotonic-counter diffs each frame, translated into profile.emit() calls.
  watchProfileEvents() {
    const { world, commandCore } = this;
    if (world.kills > this.lastKills) {
      this.profile.emit('kill', { count: world.kills - this.lastKills });
      this.lastKills = world.kills;
      Sound.play('explode');
    }
    if (world.spawner.wavesCleared > this.lastWavesCleared) {
      this.profile.emit('waveClear', { wave: world.spawner.waveNumber });
      this.lastWavesCleared = world.spawner.wavesCleared;
    }
    if (world.towersPlaced > this.lastTowersPlaced) {
      this.profile.emit('towerPlaced', {});
      this.lastTowersPlaced = world.towersPlaced;
    }
    if (commandCore.rooms.length > this.lastRoomsBuilt) {
      this.profile.emit('roomBuilt', {});
      this.lastRoomsBuilt = commandCore.rooms.length;
    }
    if (commandCore.unlockedTech.size > this.lastTechUnlocked) {
      this.profile.emit('techUnlocked', {});
      this.lastTechUnlocked = commandCore.unlockedTech.size;
    }
  }

  render() {
    if (this.view === 'field') {
      this.renderer.draw(this.world, this.camera, this.fieldBuildType, this.input.mouse, this.ui.settings.showGrid, this.selectedTower, this.selectedScavenger);
    } else if (this.view === 'core') {
      this.renderer.drawCore(this.commandCore, this.selectedRoomType, this.input.mouse);
    }
    this.ui.update(this.world, this.fps, this.state, this.view, this.commandCore, this.profile, this.selectedTower, this.selectedScavenger, this.missions, this.waveMenuOpen, this.missionMenuOpen, this.menuModalOpen, this.menuModalTab, this.upgradeModalOpen, this.buildMenuConfig(), this.armedLabel());
  }

  // Human name of whatever build type is armed, for the bottom bar's armed-state
  // indicator — null when nothing is. Reads the same CONFIG labels the menu does
  // rather than a second copy of the names.
  armedLabel() {
    if (this.view === 'field' && this.fieldBuildType) {
      if (this.fieldBuildType === 'scavenger') return 'Scavenger';
      return CONFIG.DAMAGE_TYPES[this.fieldBuildType]?.label || null;
    }
    if (this.view === 'core' && this.selectedRoomType) {
      return CONFIG.ROOM_TYPES[this.selectedRoomType]?.label || null;
    }
    return null;
  }

  loop(timestamp) {
    const dt = (timestamp - this.lastTime) / 1000 || 0;
    this.lastTime = timestamp;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.1; // smoothed
    // A thrown error inside update()/render() used to kill the rAF chain outright,
    // freezing the canvas and DOM mid-frame in whatever half-updated state they were
    // in — silently, with nothing in the console pointing at why. Logging and
    // continuing keeps the loop alive and puts the real error on screen instead.
    try {
      this.update(dt);
      this.render();
    } catch (err) {
      console.error('Game loop error (frame skipped):', err);
    }
    requestAnimationFrame(t => this.loop(t));
  }

  start() {
    requestAnimationFrame(t => this.loop(t));
  }
}
