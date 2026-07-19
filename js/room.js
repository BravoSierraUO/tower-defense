import { CONFIG } from './config.js';

export class Room {
  constructor(type, gx, gy) {
    this.type = type;
    this.gx = gx;
    this.gy = gy;
    this.tier = 1; // 1-3
    this.buildTimeRemaining = 0;
    this.buildTimeTotal = 0;
    this.modules = []; // Phase 3: each {bonusPct} — see CONFIG.MODULE_BONUS_PCT
  }

  get def() {
    return CONFIG.ROOM_TYPES[this.type];
  }

  // Base tier stats scaled by installed modules (each is +MODULE_BONUS_PCT).
  get stats() {
    const base = this.def.tiers[this.tier - 1];
    const mult = 1 + this.modules.length * CONFIG.MODULE_BONUS_PCT;
    const out = {};
    for (const key in base) out[key] = base[key] * mult;
    return out;
  }

  isActive() {
    return this.buildTimeRemaining <= 0;
  }

  moduleSlotCount() {
    return CONFIG.ROOM_MODULE_SLOTS_PER_TIER[this.tier - 1] || 0;
  }

  canUpgrade() {
    return this.tier < this.def.tiers.length;
  }

  upgrade() {
    if (this.canUpgrade()) this.tier++;
  }

  installModule() {
    this.modules.push({ bonusPct: CONFIG.MODULE_BONUS_PCT });
  }

  update(dt) {
    if (this.buildTimeRemaining > 0) this.buildTimeRemaining = Math.max(0, this.buildTimeRemaining - dt);
  }
}
