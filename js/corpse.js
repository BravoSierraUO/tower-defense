import { CONFIG } from './config.js';

// Phase 16: what a killed enemy leaves behind — a metal husk a Scavenger Turret's
// tractor beam reels in during a fight (World.updateSalvage). Decays on its own timer
// if no Scavenger reaches it: the active-salvage loop rewards positioning, it isn't
// free money that piles up forever. Pure data + a decay tick; World owns the pull/
// collect logic (it's the thing that knows about scavengers), same split Enemy/combat
// already use.
export class Corpse {
  constructor(x, y, metalValue) {
    this.x = x;
    this.y = y;
    this.metalValue = metalValue;
    this.life = CONFIG.CORPSE_DECAY_SECONDS; // seconds until it fades unsalvaged
    this.collected = false;                  // World flips this the frame a Scavenger reels it in
    this.pulledBy = null;                    // the Scavenger currently tractoring it (renderer draws the beam); null = drifting/decaying
  }

  update(dt) {
    this.life = Math.max(0, this.life - dt);
  }

  isExpired() {
    return this.life <= 0;
  }
}
