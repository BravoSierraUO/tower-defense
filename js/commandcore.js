import { CONFIG } from './config.js';
import { Room } from './room.js';

// The interior base grid. One of each room type can be placed on the 8x8
// grid, then upgraded through 3 tiers. Phase 2a/2b: Reactor/AI Core/Storage
// are freely buildable and their totals() feed the field economy. Phase 3:
// 5 more room types, gold-gated construction with a build timer (see
// world.buildRoom), a research stockpile (Lab) that unlocks tech-tree nodes
// gating Factory/Hangar/Shield/Dock, and per-room module slots.
export class CommandCore {
  constructor() {
    this.gridSize = CONFIG.CORE_GRID_SIZE;
    this.rooms = [];
    this.research = 0;
    this.unlockedTech = new Set();
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

  isRoomUnlocked(type) {
    const def = CONFIG.ROOM_TYPES[type];
    if (!def) return false;
    return !def.requiresTech || this.unlockedTech.has(def.requiresTech);
  }

  // Validity + build-timer setup only — world.buildRoom is what charges gold.
  placeRoom(type, gx, gy) {
    if (!CONFIG.ROOM_TYPES[type]) return null;
    if (!this.isRoomUnlocked(type)) return null;
    if (this.isBuilt(type)) return null;
    if (!this.isInsideGrid(gx, gy)) return null;
    if (this.getRoomAt(gx, gy)) return null;

    const room = new Room(type, gx, gy);
    room.buildTimeTotal = Math.max(1, CONFIG.ROOM_BUILD_TIME_BASE - this.totals().buildTimeReduction);
    room.buildTimeRemaining = room.buildTimeTotal;
    this.rooms.push(room);
    return room;
  }

  upgradeRoomAt(gx, gy) {
    const room = this.getRoomAt(gx, gy);
    if (room) room.upgrade();
    return room;
  }

  buildCost(type) {
    return CONFIG.ROOM_BUILD_COST_BASE + this.rooms.length * CONFIG.ROOM_BUILD_COST_GROWTH;
  }

  upgradeCost(room) {
    return Math.round(CONFIG.ROOM_UPGRADE_COST_BASE * Math.pow(CONFIG.ROOM_UPGRADE_COST_GROWTH, room.tier - 1));
  }

  moduleCost(room) {
    return Math.round(CONFIG.MODULE_BASE_COST * room.tier * Math.pow(CONFIG.MODULE_COST_GROWTH, room.modules.length));
  }

  canInstallModule(room) {
    return !!room && this.unlockedTech.has('moduleSlots') && room.isActive() && room.modules.length < room.moduleSlotCount();
  }

  // Validity only — world.installModuleAt is what charges gold.
  installModuleAt(gx, gy) {
    const room = this.getRoomAt(gx, gy);
    if (!this.canInstallModule(room)) return null;
    room.installModule();
    return room;
  }

  techNode(id) {
    return CONFIG.TECH_TREE.find(n => n.id === id) || null;
  }

  canUnlockTech(id) {
    if (this.unlockedTech.has(id)) return false;
    const node = this.techNode(id);
    if (!node) return false;
    if (this.research < node.cost) return false;
    return node.prereq.every(p => this.unlockedTech.has(p));
  }

  unlockTech(id) {
    if (!this.canUnlockTech(id)) return false;
    const node = this.techNode(id);
    this.research -= node.cost;
    this.unlockedTech.add(id);
    return true;
  }

  update(dt) {
    this.research += this.totals().researchRate * dt;
    for (const room of this.rooms) room.update(dt);
  }

  // Phase 4c: gate-bypassing placement for the free onboarding-guarantee starter
  // Reactor — used only by Game at world init/restart, never the normal build flow.
  placeStarterRoom(type, gx, gy) {
    const room = new Room(type, gx, gy);
    room.buildTimeRemaining = 0;
    this.rooms.push(room);
    return room;
  }

  totals() {
    const out = {
      power: 0, cyclesPerMin: 0, storageCap: 0, metalPerCycle: 0,
      researchRate: 0, buildTimeReduction: 0, dronePower: 0, shieldPct: 0, tradeBonus: 0
    };
    for (const room of this.rooms) {
      if (!room.isActive()) continue;
      const stats = room.stats;
      for (const key in stats) out[key] += stats[key];
    }
    return out;
  }
}
