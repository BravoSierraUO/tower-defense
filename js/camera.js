import { CONFIG } from './config.js';
import { clamp } from './utils.js';

export class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
  }

  // `keybindings` is the live { panUp, panDown, panLeft, panRight } map from
  // Settings > Hotkeys (js/keybindings.js) — defaults to WASD, rebindable.
  update(input, dt, keybindings) {
    const speed = CONFIG.PAN_SPEED * dt / this.zoom;
    if (input.keys.has(keybindings.panUp)) this.y -= speed;
    if (input.keys.has(keybindings.panDown)) this.y += speed;
    if (input.keys.has(keybindings.panLeft)) this.x -= speed;
    if (input.keys.has(keybindings.panRight)) this.x += speed;

    if (input.wheelDelta !== 0) {
      const zoomFactor = 1 - input.wheelDelta * CONFIG.ZOOM_SPEED;
      this.zoom = clamp(this.zoom * zoomFactor, CONFIG.ZOOM_MIN, CONFIG.ZOOM_MAX);
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
