// Phase 8b: tutorial mission chain. Same data shape ROADMAP/FLOWS already use in
// whatever.html — {id, text, hint, target, check(state), reward}. `target` is a CSS
// selector for the HUD element the "glow" highlight attaches to (see ui.js#setGlowTarget);
// `check` reads a small live-state snapshot Game builds each frame. Missions don't
// unlock each other (no fixpoint loop needed like achievements.js) — a single pass
// per frame is enough, and once earned a mission stays earned for the session.
// Phase 8f: `reward` (gold/metal) is paid out once, the moment a mission newly
// completes — see MissionTracker.update()'s return value and Game.watchProfileEvents()-
// style call site in game.js. Small onboarding bumps, not a farmable income source
// (missions are session-scoped and each completes exactly once, same as achievements).
export const MISSIONS = [
  // Phase 9b: '#field-slot-tower' (the old always-on build-bar slot) no longer
  // exists — the glow target moved to the canvas itself, since the new flow's
  // first action is "click empty space" rather than a specific persistent button.
  // Phase 7a: the flyout no longer has a single "Tower" leaf — it's 3 typed
  // attackers (Railgun/Laser/Missile) plus Scavenger — hint updated to match.
  { id: 'place-tower', text: 'Place a Tower', hint: 'Click anywhere in the field (outside the base ring) to open the build menu, then pick Railgun, Laser, or Missile. Towers kill enemies — and every kill drops a metal corpse for a Scavenger to salvage.', target: '#game', check: s => s.towersPlaced >= 1, reward: { metal: 10 } },
  // Phase 16: the scavenger step, taught right after towers so the kill -> corpse ->
  // salvage loop lands as one idea. `scavengersPlaced` is player-placed only (the free
  // starter is excluded, so this never auto-completes at run start). Larger reach than a
  // tower, but locked inside the base ring — tuck it near where your towers are killing.
  { id: 'place-scavenger', text: 'Place a Scavenger Turret', hint: 'From the build menu pick Scavenger, then place it inside the base ring. It has a much larger reach — its tractor beam reels in enemy corpses out in the field and turns them into metal.', target: '#game', check: s => s.scavengersPlaced >= 1, reward: { metal: 10 } },
  { id: 'trigger-wave', text: 'Trigger a Wave', hint: 'Open the Wave Menu and start Wave 1 once your defenses are ready.', target: '#trigger-wave-btn', check: s => s.waveNumber >= 1, reward: { gold: 15 } },
  // Phase 8g: the B hotkey is gone (collided with WASD panning) — clicking the
  // base itself (or the avatar menu's Command Core item) opens it now, so the
  // glow target moved to the canvas, same as place-tower's click-anywhere hint.
  { id: 'open-core', text: 'Check the Command Core', hint: 'Click your base in the field, or your avatar (top right) and choose Command Core, to see what your starter Reactor is producing.', target: '#game', check: s => s.view === 'core', reward: { gold: 10 } },
  { id: 'build-room', text: 'Build a Command Core Room', hint: 'Inside the Core, pick an unlocked room slot, then click a grid cell to build it.', target: '#core-panel', check: s => s.roomsBuilt >= 2, reward: { metal: 20 } }
];

export class MissionTracker {
  constructor() {
    this.completed = new Set();
    this.trackedId = null; // player's explicit pick via the Mission Menu's "Track" button
  }

  // Returns the missions that newly completed this call (empty most frames) so the
  // caller can pay out `reward` exactly once, at the same call site game.js already
  // uses to translate other run events into world/profile mutations.
  update(state) {
    const newlyCompleted = [];
    for (const m of MISSIONS) {
      if (this.completed.has(m.id)) continue;
      let ok = false;
      try { ok = !!m.check(state); } catch (e) {}
      if (ok) {
        this.completed.add(m.id);
        newlyCompleted.push(m);
      }
    }
    return newlyCompleted;
  }

  // Explicit player pick from the Mission Menu — overrides the default earliest-unmet
  // pick below until it completes or the player tracks something else.
  track(id) {
    if (MISSIONS.some(m => m.id === id)) this.trackedId = id;
  }

  // The tracked mission if one's picked and still open; otherwise the first
  // not-yet-completed mission in list order — null once every mission is done.
  current() {
    if (this.trackedId) {
      const tracked = MISSIONS.find(m => m.id === this.trackedId);
      if (tracked && !this.completed.has(tracked.id)) return tracked;
    }
    return MISSIONS.find(m => !this.completed.has(m.id)) || null;
  }

  isDone() {
    return this.completed.size >= MISSIONS.length;
  }
}
