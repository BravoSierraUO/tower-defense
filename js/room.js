import { CONFIG } from './config.js';

export class Room {
  constructor(type, gx, gy) {
    this.type = type;
    this.gx = gx;
    this.gy = gy;
    this.tier = 1; // 1-3
  }

  get def() {
    return CONFIG.ROOM_TYPES[this.type];
  }

  get stats() {
    return this.def.tiers[this.tier - 1];
  }

  canUpgrade() {
    return this.tier < this.def.tiers.length;
  }

  upgrade() {
    if (this.canUpgrade()) this.tier++;
  }
}
