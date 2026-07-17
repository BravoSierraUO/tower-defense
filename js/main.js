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
