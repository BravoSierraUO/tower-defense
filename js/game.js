import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { World } from './world.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.camera = new Camera(canvas);
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.world = new World();
    this.lastTime = 0;
  }

  update(dt) {
    this.camera.update(this.input, dt);
  }

  render() {
    this.renderer.draw(this.world, this.camera);
  }

  loop(timestamp) {
    const dt = (timestamp - this.lastTime) / 1000 || 0;
    this.lastTime = timestamp;
    this.update(dt);
    this.render();
    requestAnimationFrame(t => this.loop(t));
  }

  start() {
    requestAnimationFrame(t => this.loop(t));
  }
}
