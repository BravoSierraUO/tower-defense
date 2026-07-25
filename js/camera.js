import { CONFIG } from './config.js';
import { clamp } from './utils.js';

export class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
  }

  // The one place this.zoom is written. Phase 18 (B1) extracted it out of
  // update() so something other than the mouse wheel can drive zoom — the
  // keyboard path below, and the bottom bar's zoom buttons (js/ui/bottomBar.js),
  // which had no way in while the clamp lived inline in the wheel branch.
  // `factor` is multiplicative: >1 zooms in, <1 zooms out. Returns the new zoom
  // so a caller can tell whether it actually moved (i.e. hit a clamp).
  zoomBy(factor) {
    this.zoom = clamp(this.zoom * factor, CONFIG.ZOOM_MIN, CONFIG.ZOOM_MAX);
    return this.zoom;
  }

  // `keybindings` is the live { panUp, panDown, panLeft, panRight, zoomIn,
  // zoomOut } map from Settings > Hotkeys (js/keybindings.js) — defaults to
  // WASD + '='/'-', rebindable.
  update(input, dt, keybindings) {
    const speed = CONFIG.PAN_SPEED * dt / this.zoom;
    if (input.keys.has(keybindings.panUp)) this.y -= speed;
    if (input.keys.has(keybindings.panDown)) this.y += speed;
    if (input.keys.has(keybindings.panLeft)) this.x -= speed;
    if (input.keys.has(keybindings.panRight)) this.x += speed;

    // Held-key zoom, rate-per-second like pan rather than per-keypress, so
    // holding '=' ramps smoothly instead of stepping. Guarded on dt so a paused
    // or first frame can't apply a zero/NaN factor.
    if (dt > 0) {
      if (input.keys.has(keybindings.zoomIn)) this.zoomBy(1 + CONFIG.KEY_ZOOM_RATE * dt);
      if (input.keys.has(keybindings.zoomOut)) this.zoomBy(1 / (1 + CONFIG.KEY_ZOOM_RATE * dt));
    }

    if (input.wheelDelta !== 0) {
      this.zoomBy(1 - input.wheelDelta * CONFIG.ZOOM_SPEED);
      input.wheelDelta = 0;
    }
  }

  worldToScreen(wx, wy) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    return {
      x: cx + (wx - this.x) * this.zoom,
      y: cy + (wy - this.y) * this.zoom
    };
  }

  screenToWorld(sx, sy) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    return {
      x: (sx - cx) / this.zoom + this.x,
      y: (sy - cy) / this.zoom + this.y
    };
  }

  getViewBounds() {
    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(this.canvas.width, this.canvas.height);
    return { left: tl.x, top: tl.y, right: br.x, bottom: br.y };
  }
}
