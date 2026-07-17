export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.wheelDelta = 0;
    this.mouse = { x: 0, y: 0 };
    this.clicks = [];

    window.addEventListener('keydown', e => this.keys.add(e.key.toLowerCase()));
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
  }
}
