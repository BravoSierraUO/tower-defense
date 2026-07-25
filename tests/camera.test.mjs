// Phase 18 (B1): coverage for Camera#zoomBy — the clamp that used to live inline
// in update()'s wheel branch, where nothing could reach it and no test could see
// it. docs/mobile-audit.md D3 names it as one of two genuinely testable pieces
// this phase creates.
//
// Camera's constructor only stores the canvas reference; zoomBy and the keyboard
// path never touch it, so a null canvas is a legitimate fixture here. The
// projection methods (worldToScreen/screenToWorld/getViewBounds) DO read
// canvas.width/height and are deliberately not covered — they need a real canvas.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../js/camera.js';
import { CONFIG } from '../js/config.js';

const camera = () => new Camera(null);

// Minimal stand-in for js/input.js — update() reads only these three fields.
const input = (keys = [], wheelDelta = 0) => ({ keys: new Set(keys), wheelDelta });
const BINDS = CONFIG.DEFAULT_KEYBINDINGS;

describe('Camera#zoomBy', () => {
  test('starts at 1x', () => {
    assert.equal(camera().zoom, 1);
  });

  test('multiplies rather than adds', () => {
    const c = camera();
    c.zoomBy(2);
    assert.equal(c.zoom, 2);
    c.zoomBy(1.5);
    assert.equal(c.zoom, 3);
  });

  test('a factor and its reciprocal round-trip back to the start', () => {
    // What makes zoom-in/zoom-out symmetric: the bar's two buttons are exact
    // inverses, so tapping each once must land back where you were.
    const c = camera();
    c.zoomBy(1.25);
    c.zoomBy(1 / 1.25);
    assert.ok(Math.abs(c.zoom - 1) < 1e-9, `expected ~1, got ${c.zoom}`);
  });

  test('clamps at ZOOM_MAX however far past it you push', () => {
    const c = camera();
    c.zoomBy(1000);
    assert.equal(c.zoom, CONFIG.ZOOM_MAX);
    c.zoomBy(1000);
    assert.equal(c.zoom, CONFIG.ZOOM_MAX, 'stays pinned, does not drift past');
  });

  test('clamps at ZOOM_MIN however far past it you push', () => {
    const c = camera();
    c.zoomBy(0.0001);
    assert.equal(c.zoom, CONFIG.ZOOM_MIN);
    c.zoomBy(0.0001);
    assert.equal(c.zoom, CONFIG.ZOOM_MIN);
  });

  test('returns the clamped value, so a caller can detect hitting the rail', () => {
    const c = camera();
    assert.equal(c.zoomBy(1000), CONFIG.ZOOM_MAX);
    assert.equal(c.zoomBy(1.5), CONFIG.ZOOM_MAX, 'already at max — unchanged');
  });

  test('is reversible off a clamp rail', () => {
    // Regression guard for the classic clamp bug: pinning at a bound and then
    // refusing to come back because the pre-clamp value was cached.
    const c = camera();
    c.zoomBy(1000);
    c.zoomBy(0.5);
    assert.equal(c.zoom, CONFIG.ZOOM_MAX * 0.5);
  });

  test('a factor of 1 is a no-op', () => {
    const c = camera();
    c.zoomBy(1);
    assert.equal(c.zoom, 1);
  });
});

describe('Camera#update: keyboard zoom (the reported bug)', () => {
  test('the zoom-in binding zooms in', () => {
    const c = camera();
    c.update(input([BINDS.zoomIn]), 0.1, BINDS);
    assert.ok(c.zoom > 1, `expected >1, got ${c.zoom}`);
  });

  test('the zoom-out binding zooms out', () => {
    const c = camera();
    c.update(input([BINDS.zoomOut]), 0.1, BINDS);
    assert.ok(c.zoom < 1, `expected <1, got ${c.zoom}`);
  });

  test('holding both cancels out', () => {
    const c = camera();
    c.update(input([BINDS.zoomIn, BINDS.zoomOut]), 0.1, BINDS);
    assert.ok(Math.abs(c.zoom - 1) < 1e-9, `expected ~1, got ${c.zoom}`);
  });

  test('zoom is rate-based: a longer frame zooms further', () => {
    const slow = camera();
    const fast = camera();
    slow.update(input([BINDS.zoomIn]), 0.05, BINDS);
    fast.update(input([BINDS.zoomIn]), 0.2, BINDS);
    assert.ok(fast.zoom > slow.zoom);
  });

  test('a zero-dt frame does not change zoom', () => {
    const c = camera();
    c.update(input([BINDS.zoomIn]), 0, BINDS);
    assert.equal(c.zoom, 1);
  });

  test('held keys respect the clamp', () => {
    const c = camera();
    for (let i = 0; i < 200; i++) c.update(input([BINDS.zoomIn]), 0.1, BINDS);
    assert.equal(c.zoom, CONFIG.ZOOM_MAX);
    for (let i = 0; i < 400; i++) c.update(input([BINDS.zoomOut]), 0.1, BINDS);
    assert.equal(c.zoom, CONFIG.ZOOM_MIN);
  });

  test('pan keys still work and do not touch zoom', () => {
    const c = camera();
    c.update(input([BINDS.panLeft]), 0.1, BINDS);
    assert.ok(c.x < 0);
    assert.equal(c.zoom, 1);
  });

  test('rebinding zoom to another key is honoured', () => {
    // The whole point of routing through the keybindings map rather than
    // hardcoding '=' — Settings > Hotkeys can move it.
    const c = camera();
    const custom = { ...BINDS, zoomIn: 'q' };
    c.update(input(['q']), 0.1, custom);
    assert.ok(c.zoom > 1);
    const c2 = camera();
    c2.update(input([BINDS.zoomIn]), 0.1, custom);
    assert.equal(c2.zoom, 1, 'the old default should no longer zoom');
  });
});

describe('Camera#update: wheel zoom still works', () => {
  test('a negative wheel delta zooms in and drains the accumulator', () => {
    // Phase 18 rerouted the wheel through zoomBy; this is the regression guard
    // that the pre-existing mouse path behaves exactly as it did.
    const c = camera();
    const i = input([], -100);
    c.update(i, 0.016, BINDS);
    assert.equal(c.zoom, 1 * (1 - -100 * CONFIG.ZOOM_SPEED));
    assert.equal(i.wheelDelta, 0, 'wheelDelta must be consumed, not reapplied next frame');
  });

  test('a positive wheel delta zooms out', () => {
    const c = camera();
    c.update(input([], 100), 0.016, BINDS);
    assert.ok(c.zoom < 1);
  });

  test('wheel zoom respects the clamp', () => {
    const c = camera();
    c.update(input([], -100000), 0.016, BINDS);
    assert.equal(c.zoom, CONFIG.ZOOM_MAX);
  });

  test('a zero wheel delta leaves zoom alone', () => {
    const c = camera();
    c.update(input([], 0), 0.016, BINDS);
    assert.equal(c.zoom, 1);
  });
});

describe('keybinding defaults', () => {
  test('every KEYBIND_ACTIONS entry has a default binding', () => {
    // loadKeybindings() merges saved values over CONFIG.DEFAULT_KEYBINDINGS, so
    // an action listed without a default would render an undefined key in the
    // Settings row and silently never fire.
    return import('../js/keybindings.js').then(({ KEYBIND_ACTIONS }) => {
      for (const action of KEYBIND_ACTIONS) {
        assert.ok(CONFIG.DEFAULT_KEYBINDINGS[action.id], `${action.id} has no default`);
      }
    });
  });

  test('no two actions share a default key', () => {
    const keys = Object.values(CONFIG.DEFAULT_KEYBINDINGS);
    assert.equal(new Set(keys).size, keys.length, `duplicate default binding in ${keys.join(',')}`);
  });
});
