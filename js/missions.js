// Phase 8b: tutorial mission chain. Same data shape ROADMAP/FLOWS already use in
// whatever.html — {id, text, hint, target, check(state)}. `target` is a CSS selector
// for the HUD element the "glow" highlight attaches to (see ui.js#setGlowTarget);
// `check` reads a small live-state snapshot Game builds each frame. Missions don't
// unlock each other (no fixpoint loop needed like achievements.js) — a single pass
// per frame is enough, and once earned a mission stays earned for the session.
export const MISSIONS = [
  // Phase 9b: '#field-slot-tower' (the old always-on build-bar slot) no longer
  // exists — the glow target moved to the canvas itself, since the new flow's
  // first action is "click empty space" rather than a specific persistent button.
  { id: 'place-tower', text: 'Place a Tower', hint: 'Click anywhere on the field to open the build menu, then pick Tower.', target: '#game', check: s => s.towersPlaced >= 1 },
  { id: 'trigger-wave', text: 'Trigger a Wave', hint: 'Hit Trigger Wave once your defenses are ready.', target: '#trigger-wave-btn', check: s => s.waveNumber >= 1 },
  { id: 'open-core', text: 'Check the Command Core', hint: 'Press B to see what your starter Reactor is producing.', target: '#ui-mode-hint', check: s => s.view === 'core' },
  { id: 'build-room', text: 'Build a Command Core Room', hint: 'Inside the Core, pick an unlocked room slot, then click a grid cell to build it.', target: '#core-panel', check: s => s.roomsBuilt >= 2 }
];

export class MissionTracker {
  constructor() {
    this.completed = new Set();
  }

  update(state) {
    for (const m of MISSIONS) {
      if (this.completed.has(m.id)) continue;
      let ok = false;
      try { ok = !!m.check(state); } catch (e) {}
      if (ok) this.completed.add(m.id);
    }
  }

  // First not-yet-completed mission, in list order — null once every mission is done.
  current() {
    return MISSIONS.find(m => !this.completed.has(m.id)) || null;
  }

  isDone() {
    return this.completed.size >= MISSIONS.length;
  }
}
