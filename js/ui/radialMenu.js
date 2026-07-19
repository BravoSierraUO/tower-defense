// Click-to-open context radial menu (replaces the old always-on build bar —
// see whatever.html Phase 9b). One instance is shared by both the Field and
// Core views; game.js calls open(x, y, config) fresh on every click with a
// config built from whatever's true at that moment (room-lock state, current
// costs), so this component itself stays stateless between opens — no
// per-frame update() needed, unlike the old persistent bars.
//
// config shape:
// { level1: [
//     { id, icon, label, action? }                 // plain leaf — click calls onAction(id)
//     { id, icon, label, stub: 'text' }             // stub leaf — click just flashes `text`, no callback
//     { id, icon, label, flyout: [ leaf, leaf... ] } // hover/click fans out a second arc of leaves
//   ],
//   flyoutRadius, flyoutArc }                        // shared by whichever level1 item has a flyout
//
// flyout leaf shape: { id, label, digit?, cost?, color?, locked? } — clicking
// a non-locked leaf calls onAction(leaf.id) and closes the whole menu.
import { layoutRadial, slotAngle } from './radialLayout.js';

const LEVEL1_RADIUS = 85;
const LEVEL1_ARC = 150;

export class RadialMenu {
  constructor({ onAction } = {}) {
    this.onAction = onAction;
    this.el = document.getElementById('radial-menu');
    this.hub = this.el.querySelector('.radial-hub');
    this.level1El = this.el.querySelector('.radial-level1');
    this.flyoutEl = this.el.querySelector('.radial-flyout');
    this.stubEl = this.el.querySelector('.radial-stub');
    this._stubTimer = null;
    this.el.hidden = true;
  }

  get isOpen() {
    return !this.el.hidden;
  }

  open(x, y, config) {
    this.close();
    this.config = config;

    // Keep the whole fan (level1 + flyout radius) on screen.
    const margin = LEVEL1_RADIUS + (config.flyoutRadius || 0) + 40;
    const cx = Math.min(Math.max(x, margin), window.innerWidth - margin);
    const cy = Math.min(Math.max(y, margin), window.innerHeight - margin);
    this.el.style.left = `${cx}px`;
    this.el.style.top = `${cy}px`;

    const items = config.level1;
    const els = items.map((item, i) => {
      const btn = document.createElement('button');
      btn.className = 'radial-slot radial-slot-l1';
      btn.innerHTML = `<span class="radial-icon">${item.icon}</span>${item.label}`;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.activateLevel1(item, i, items.length);
      });
      if (item.flyout) {
        btn.addEventListener('mouseenter', () => this.showFlyout(item, i, items.length));
      }
      this.level1El.appendChild(btn);
      return btn;
    });
    layoutRadial(els, { radius: LEVEL1_RADIUS, arcDegrees: LEVEL1_ARC });

    this.el.hidden = false;
  }

  activateLevel1(item, index, count) {
    if (item.flyout) {
      this.showFlyout(item, index, count);
      return;
    }
    if (item.stub) {
      this.showStub(item.stub);
      return;
    }
    this.onAction?.(item.id);
    this.close();
  }

  showFlyout(item, index, count) {
    if (this.flyoutEl.dataset.forId === item.id) return; // already showing this one
    this.flyoutEl.innerHTML = '';
    this.flyoutEl.dataset.forId = item.id;

    const centerDeg = slotAngle(index, count, LEVEL1_ARC);
    const radius = this.config.flyoutRadius || 190;
    const arc = this.config.flyoutArc ?? 90;

    const els = item.flyout.map(leaf => {
      const btn = document.createElement('button');
      btn.className = 'radial-slot radial-slot-leaf';
      if (leaf.locked) btn.classList.add('locked');
      if (leaf.color) btn.style.setProperty('--leaf-color', leaf.color);
      btn.innerHTML = [
        leaf.digit != null ? `<span>${leaf.digit}</span>` : '',
        leaf.label,
        leaf.cost ? `<div class="radial-leaf-cost">${leaf.cost}</div>` : ''
      ].join('');
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (leaf.locked) return;
        this.onAction?.(leaf.id);
        this.close();
      });
      this.flyoutEl.appendChild(btn);
      return btn;
    });
    layoutRadial(els, { radius, arcDegrees: arc, centerDeg });
    this.flyoutEl.hidden = false;
  }

  showStub(text) {
    clearTimeout(this._stubTimer);
    this.stubEl.textContent = text;
    this.stubEl.hidden = false;
    this._stubTimer = setTimeout(() => { this.stubEl.hidden = true; }, 1600);
  }

  close() {
    this.el.hidden = true;
    this.level1El.innerHTML = '';
    this.flyoutEl.innerHTML = '';
    this.flyoutEl.hidden = true;
    delete this.flyoutEl.dataset.forId;
    this.stubEl.hidden = true;
    clearTimeout(this._stubTimer);
  }
}
