import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { World } from './world.js';
import { updateCombat } from './combat.js';
import { UI } from './ui.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.camera = new Camera(canvas);
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.world = new World();
    this.ui = new UI();
    this.lastTime = 0;
    this.fps = 0;
    this.state = 'playing'; // 'playing' | 'won' | 'lost'
  }

  handleInput() {
    for (const click of this.input.clicks) {
      const worldPos = this.camera.screenToWorld(click.x, click.y);
      this.world.placeTower(worldPos.x, worldPos.y);
    }
    this.input.clicks.length = 0;
  }

  update(dt) {
    this.camera.update(this.input, dt);
    this.handleInput();

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
    this.renderer.draw(this.world, this.camera);
    this.ui.update(this.world, this.fps, this.state);
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
