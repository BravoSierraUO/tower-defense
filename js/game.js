import { CONFIG } from './config.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { World } from './world.js';
import { updateCombat } from './combat.js';
import { UI } from './ui.js';
import { CommandCore } from './commandcore.js';
import { Profile } from './profile.js';
import { MissionTracker } from './missions.js';

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
      onMarketBuyMetal: () => this.world.tradeGoldForMetal(),
      onMarketBuyGold: () => this.world.tradeMetalForGold(),
      onTriggerWave: () => this.world.spawner.triggerWave(),
      onSelectFieldBuild: type => this.selectFieldBuild(type),
      onSelectRoomType: type => this.selectRoomType(type),
      onToggleAbout: () => { this.view = this.view === 'about' ? 'field' : 'about'; this.selectedRoomType = null; },
      onToggleProfile: () => { this.view = this.view === 'profile' ? 'field' : 'profile'; this.selectedRoomType = null; },
      onToggleSettings: () => { this.view = this.view === 'settings' ? 'field' : 'settings'; this.selectedRoomType = null; },
      onResetProgress: () => { this.profile.hardReset(); this.restart(); },
      onReportBug: () => this.reportBug()
    });
    this.lastTime = 0;
    this.fps = 0;
    this.state = 'playing'; // 'playing' | 'won' — 'lost' retired in Phase 8a, see update() below
    this.view = 'field'; // 'field' | 'core' | 'profile' | 'about' | 'settings'
    this.selectedRoomType = null;
    this.selectedTower = null; // Phase 4b: tower the tower-card is showing
    this.selectedScavenger = null; // Phase 4c: scavenger the tower-card is showing
    this.fieldBuildType = 'tower'; // Phase 4c: 'tower' | 'scavenger' — field-view placement mode
    this.resetRunTrackers();
  }

  // Phase 4c: onboarding guarantee — a free, already-active starter Reactor and
  // Scavenger Turret so the base produces power/metal from minute one, no
  // build-a-throwaway-then-rebuild-it step. Gate-bypassing placement only —
  // never routed through the normal buildRoom/placeTower gold/metal gates.
  placeStarters() {
    this.commandCore.placeStarterRoom('reactor', 0, 0);
    this.world.placeStarterScavenger(CONFIG.BASE_X + CONFIG.TOWER_MIN_BASE_DISTANCE + CONFIG.GRID_SIZE, CONFIG.BASE_Y);
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
    this.fieldBuildType = 'tower';
    this.resetRunTrackers();
  }

  doPrestige() {
    if (this.profile.prestige()) this.restart();   // banked the payout — start the next climb fresh
  }

  // Shared by the '1'/'2' keyboard shortcut and the radial build-bar's click
  // handler — one code path for field-view placement mode.
  selectFieldBuild(type) {
    this.fieldBuildType = type;
  }

  // Shared by the '1'-'9'/'0' keyboard shortcut and the radial build-bar's
  // click handler — same toggle-off-if-already-selected-or-built convention
  // the Core view has used since Phase 4b.
  selectRoomType(type) {
    if (!type || !this.commandCore.isRoomUnlocked(type)) return;
    this.selectedRoomType = this.commandCore.isBuilt(type) ? null : type;
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
      if (key === 'b' || key === 'tab') {
        this.view = this.view === 'field' ? 'core' : 'field';
        this.selectedRoomType = null;
      } else if (key === 'p') {
        this.view = this.view === 'profile' ? 'field' : 'profile';
        this.selectedRoomType = null;
      } else if (key === 'o') {
        this.view = this.view === 'about' ? 'field' : 'about';
        this.selectedRoomType = null;
      } else if (key === 's') {
        this.view = this.view === 'settings' ? 'field' : 'settings';
        this.selectedRoomType = null;
      } else if (this.view === 'core') {
        // Still positional (index into Object.keys(CONFIG.ROOM_TYPES)) — index.html's
        // core-build-bar labels must be kept in the same order by hand. Explicit
        // keyOrder (not Number(key)-1) just supports all 10 current room types,
        // with '0' as the 10th slot instead of computing to -1.
        const keyOrder = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
        const idx = keyOrder.indexOf(key);
        if (idx !== -1) this.selectRoomType(Object.keys(CONFIG.ROOM_TYPES)[idx]);
      } else if (this.view === 'field' && (key === '1' || key === '2')) {
        // Phase 4c: same number-key-selects-buildable-type convention the Core
        // view already uses for its 10 room slots.
        this.selectFieldBuild(key === '1' ? 'tower' : 'scavenger');
      }
    }
    this.input.keyPresses.length = 0;

    for (const click of this.input.clicks) {
      if (this.view === 'field') {
        const worldPos = this.camera.screenToWorld(click.x, click.y);
        const existingTower = this.world.towerAt(worldPos.x, worldPos.y);
        const existingScavenger = this.world.scavengerAt(worldPos.x, worldPos.y);
        if (existingTower) {
          // Phase 4b: click your own tower to attempt an upgrade — same
          // silent-no-op-if-you-can't-afford-it convention as upgradeRoom below.
          this.world.upgradeTower(existingTower);
          this.selectedTower = existingTower;
          this.selectedScavenger = null;
        } else if (existingScavenger) {
          this.world.upgradeScavenger(existingScavenger);
          this.selectedScavenger = existingScavenger;
          this.selectedTower = null;
        } else if (this.fieldBuildType === 'scavenger') {
          this.selectedScavenger = this.world.placeScavenger(worldPos.x, worldPos.y);
          this.selectedTower = null;
        } else {
          this.selectedTower = this.world.placeTower(worldPos.x, worldPos.y);
          this.selectedScavenger = null;
        }
      } else {
        const cell = this.renderer.screenToCoreCell(click.x, click.y);
        if (cell && this.selectedRoomType) {
          if (this.world.buildRoom(this.selectedRoomType, cell.gx, cell.gy)) {
            this.selectedRoomType = null;
          }
        } else if (cell) {
          this.world.upgradeRoom(cell.gx, cell.gy);
        }
      }
    }
    this.input.clicks.length = 0;

    for (const click of this.input.rightClicks) {
      if (this.view === 'field') {
        const worldPos = this.camera.screenToWorld(click.x, click.y);
        // Phase 4c: try Tower first, fall back to Scavenger Turret — whichever's actually there.
        if (!this.world.sellTowerAt(worldPos.x, worldPos.y)) this.world.sellScavengerAt(worldPos.x, worldPos.y);
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
    if (this.view === 'field') this.camera.update(this.input, dt);

    if (this.state === 'playing') {
      for (const tower of this.world.towers) {
        tower.update(dt);
      }
      this.world.updateSpawning(dt);
      updateCombat(this.world, dt);
      this.world.updateEnemies(dt);
      this.commandCore.update(dt);
      this.world.updatePassiveIncome(dt, this.profile.level());
      this.world.updateCycleBudget(dt);
      this.watchProfileEvents();
      this.missions.update({
        towersPlaced: this.world.towersPlaced,
        waveNumber: this.world.spawner.waveNumber,
        roomsBuilt: this.commandCore.rooms.length,
        view: this.view
      });

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
      this.renderer.draw(this.world, this.camera);
    } else if (this.view === 'core') {
      this.renderer.drawCore(this.commandCore, this.selectedRoomType);
    }
    this.ui.update(this.world, this.fps, this.state, this.view, this.commandCore, this.profile, this.selectedTower, this.selectedScavenger, this.fieldBuildType, this.missions, this.selectedRoomType);
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
