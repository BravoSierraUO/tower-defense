import { Game } from './game.js';

const canvas = document.getElementById('game');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const game = new Game(canvas);
game.start();

// Debug/verification handle. This project verifies UI work by driving the real page
// with Playwright (`require('playwright').chromium.launch()` + a static server —
// see changelog v2.4's correction), and game.js/ui.js/renderer.js have no unit
// coverage by design because they need a DOM. Exposing the instance is what lets
// those live checks assert on real state (camera.zoom, view, coreLayout()) instead
// of inferring it from pixels. Read-only by convention; nothing in js/ reads this.
window.__game = game;
