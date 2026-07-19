import { CONFIG } from './config.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { World } from './world.js';
import { updateCombat } from './combat.js';
import { UI } from './ui.js';
import { CommandCore } from './commandcore.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.camera = new Camera(canvas);
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.commandCore = new CommandCore();
    this.world = new World(this.commandCore);
    this.ui = new UI();
    this.lastTime = 0;
    this.fps = 0;
    this.state = 'playing'; // 'playing' | 'won' | 'lost'
    this.view = 'field'; // 'field' | 'core'
    this.selectedRoomType = null;
  }

  handleInput() {
    for (const key of this.input.keyPresses) {
      if (key === 'b' || key === 'tab') {
        this.view = this.view === 'field' ? 'core' : 'field';
        this.selectedRoomType = null;
      } else if (this.view === 'core' && ['1', '2', '3'].includes(key)) {
        const type = Object.keys(CONFIG.ROOM_TYPES)[Number(key) - 1];
        if (type) this.selectedRoomType = this.commandCore.isBuilt(type) ? null : type;
      }
    }
    this.input.keyPresses.length = 0;

    for (const click of this.input.clicks) {
      if (this.view === 'field') {
        const worldPos = this.camera.screenToWorld(click.x, click.y);
        this.world.placeTower(worldPos.x, worldPos.y);
      } else {
        const cell = this.renderer.screenToCoreCell(click.x, click.y);
        if (cell && this.selectedRoomType) {
          if (this.commandCore.placeRoom(this.selectedRoomType, cell.gx, cell.gy)) {
            this.selectedRoomType = null;
          }
        } else if (cell) {
          this.commandCore.upgradeRoomAt(cell.gx, cell.gy);
        }
      }
    }
    this.input.clicks.length = 0;

    for (const click of this.input.rightClicks) {
      if (this.view === 'field') {
        const worldPos = this.camera.screenToWorld(click.x, click.y);
        this.world.sellTowerAt(worldPos.x, worldPos.y);
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

      if (this.world.base.isDestroyed()) {
        this.state = 'lost';
      } else if (this.world.spawner.complete) {
        this.state = 'won';
      }
    }
  }

  render() {
    if (this.view === 'field') {
      this.renderer.draw(this.world, this.camera);
    } else {
      this.renderer.drawCore(this.commandCore, this.selectedRoomType);
    }
    this.ui.update(this.world, this.fps, this.state, this.view, this.commandCore);
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
