export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.keyPresses = []; // edge-triggered: one entry per keydown, drained each frame
    this.wheelDelta = 0;
    this.mouse = { x: 0, y: 0 };
    this.clicks = [];
    this.rightClicks = [];

    window.addEventListener('keydown', e => {
      const key = e.key.toLowerCase();
      if (!this.keys.has(key)) this.keyPresses.push(key);
      this.keys.add(key);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.wheelDelta += e.deltaY;
    }, { passive: false });

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
    });

    canvas.addEventListener('click', e => {
      const rect = canvas.getBoundingClientRect();
      this.clicks.push({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    });

    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      this.rightClicks.push({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    });
  }
}
