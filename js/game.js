import { CONFIG } from './config.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { World } from './world.js';
import { updateCombat } from './combat.js';
import { UI } from './ui.js';
import { CommandCore } from './commandcore.js';
import { Profile } from './profile.js';

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
    this.ui = new UI({
      onUnlockTech: id => this.commandCore.unlockTech(id),
      onDockTrade: () => this.world.tradeAtDock(),
      onPrestige: () => this.doPrestige(),
      onBuySkill: id => this.profile.buySkill(id),
      onRestart: () => this.restart(),
      onRepairBase: () => this.world.repairBase(CONFIG.BASE_REPAIR_AMOUNT)
    });
    this.lastTime = 0;
    this.fps = 0;
    this.state = 'playing'; // 'playing' | 'won' | 'lost'
    this.view = 'field'; // 'field' | 'core' | 'profile'
    this.selectedRoomType = null;
    this.selectedTower = null; // Phase 4b: tower the tower-card is showing
    this.resetRunTrackers();
  }

  // Diff-watch markers for the profile-event observer in update() — reset
  // whenever a fresh World/CommandCore replaces the old one (restart()).
  resetRunTrackers() {
    this.lastKills = 0;
    this.lastWavesCleared = 0;
    this.lastTowersPlaced = 0;
    this.lastRoomsBuilt = 0;
    this.lastTechUnlocked = 0;
  }

  // Starts a fresh run (new World/CommandCore) without touching the persistent
  // profile — used both by the win/lose "Play Again" button and by prestige.
  restart() {
    this.commandCore = new CommandCore();
    this.world = new World(this.commandCore, this.profile);
    this.state = 'playing';
    this.view = 'field';
    this.selectedRoomType = null;
    this.selectedTower = null;
    this.resetRunTrackers();
  }

  doPrestige() {
    if (this.profile.prestige()) this.restart();   // banked the payout — start the next climb fresh
  }

  handleInput() {
    for (const key of this.input.keyPresses) {
      if (key === 'b' || key === 'tab') {
        this.view = this.view === 'field' ? 'core' : 'field';
        this.selectedRoomType = null;
      } else if (key === 'p') {
        this.view = this.view === 'profile' ? 'field' : 'profile';
        this.selectedRoomType = null;
      } else if (this.view === 'core' && ['1', '2', '3', '4', '5', '6', '7', '8'].includes(key)) {
        const type = Object.keys(CONFIG.ROOM_TYPES)[Number(key) - 1];
        if (type && this.commandCore.isRoomUnlocked(type)) {
          this.selectedRoomType = this.commandCore.isBuilt(type) ? null : type;
        }
      }
    }
    this.input.keyPresses.length = 0;

    for (const click of this.input.clicks) {
      if (this.view === 'field') {
        const worldPos = this.camera.screenToWorld(click.x, click.y);
        const existing = this.world.towerAt(worldPos.x, worldPos.y);
        if (existing) {
          // Phase 4b: click your own tower to attempt an upgrade — same
          // silent-no-op-if-you-can't-afford-it convention as upgradeRoom below.
          this.world.upgradeTower(existing);
          this.selectedTower = existing;
        } else {
          this.selectedTower = this.world.placeTower(worldPos.x, worldPos.y);
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
        this.world.sellTowerAt(worldPos.x, worldPos.y);
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
      this.watchProfileEvents();

      if (this.world.base.isDestroyed()) {
        this.state = 'lost';
        this.profile.emit('runEnd', { won: false, wave: this.world.spawner.waveNumber, baseHealthPct: 0 });
      } else if (this.world.spawner.complete) {
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
    this.ui.update(this.world, this.fps, this.state, this.view, this.commandCore, this.profile, this.selectedTower);
  }

  loop(timestamp) {
    const dt = (timestamp - this.lastTime) / 1000 || 0;
    this.lastTime = timestamp;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.1; // smoothed
    this.update(dt);
    this.render();
    requestAnimationFrame(t => this.loop(t));
  }

  start() {
    requestAnimationFrame(t => this.loop(t));
  }
}
