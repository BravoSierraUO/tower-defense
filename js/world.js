import { CONFIG } from './config.js';

export class World {
  constructor() {
    this.width = CONFIG.WORLD_WIDTH;
    this.height = CONFIG.WORLD_HEIGHT;
    this.towers = [];
    this.enemies = [];
  }
}
