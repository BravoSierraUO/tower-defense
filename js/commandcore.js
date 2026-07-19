import { CONFIG } from './config.js';
import { Room } from './room.js';

// The interior base grid (Phase 2a). One of each starter room type can be
// placed on the 8x8 grid, then upgraded through 3 tiers. Output totals are
// exposed for Phase 2b's economy to read — they don't affect gameplay yet.
export class CommandCore {
  constructor() {
    this.gridSize = CONFIG.CORE_GRID_SIZE;
    this.rooms = [];
  }

  getRoomAt(gx, gy) {
    return this.rooms.find(r => r.gx === gx && r.gy === gy) || null;
  }

  isBuilt(type) {
    return this.rooms.some(r => r.type === type);
  }

  isInsideGrid(gx, gy) {
    return gx >= 0 && gx < this.gridSize && gy >= 0 && gy < this.gridSize;
  }

  placeRoom(type, gx, gy) {
    if (!CONFIG.ROOM_TYPES[type]) return null;
    if (this.isBuilt(type)) return null;
    if (!this.isInsideGrid(gx, gy)) return null;
    if (this.getRoomAt(gx, gy)) return null;

    const room = new Room(type, gx, gy);
    this.rooms.push(room);
    return room;
  }

  upgradeRoomAt(gx, gy) {
    const room = this.getRoomAt(gx, gy);
    if (room) room.upgrade();
    return room;
  }

  totals() {
    const out = { power: 0, compute: 0, storageCap: 0 };
    for (const room of this.rooms) {
      const stats = room.stats;
      for (const key in stats) out[key] += stats[key];
    }
    return out;
  }
}
