// Phase 8b: tutorial mission banner + reusable glow highlight that points at the
// mission's current target UI element.
export class MissionBanner {
  constructor() {
    this.el = document.getElementById('mission-banner');
    this.textEl = document.getElementById('mission-text');
    this.hintEl = document.getElementById('mission-hint');
    this.glowTargetEl = null; // the HUD element currently wearing .mission-glow, if any
    document.getElementById('mission-help-btn').addEventListener('click', () => this.flash());
  }

  // Re-triggers the glow-flash on whatever's currently glowing. Public so the
  // radial menu's Missions slot (Phase 9b — see game.js handleRadialAction)
  // can reuse the same "show me" nudge instead of duplicating it.
  flash() {
    // Re-trigger the flash by removing then re-adding the class next frame —
    // an already-present animation class won't restart just by re-adding it.
    if (!this.glowTargetEl) return;
    this.glowTargetEl.classList.remove('mission-glow-flash');
    void this.glowTargetEl.offsetWidth; // force reflow so the browser sees the removal
    this.glowTargetEl.classList.add('mission-glow-flash');
  }

  // Moves the .mission-glow pulse onto `selector`'s element, off whatever wore it
  // before. Only touches the DOM when the target actually changes (called every
  // frame from update()), same "don't rebuild what didn't change" convention as
  // the tech-tree/skill buttons elsewhere in the UI layer.
  setGlowTarget(selector) {
    const el = selector ? document.querySelector(selector) : null;
    if (el === this.glowTargetEl) return;
    if (this.glowTargetEl) this.glowTargetEl.classList.remove('mission-glow', 'mission-glow-flash');
    this.glowTargetEl = el;
    if (el) el.classList.add('mission-glow');
  }

  update(missions) {
    const mission = missions?.current();
    this.el.hidden = !mission;
    if (mission) {
      this.textEl.textContent = mission.text;
      this.hintEl.textContent = mission.hint;
      this.setGlowTarget(mission.target);
    } else {
      this.setGlowTarget(null);
    }
  }
}
