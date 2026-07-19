// Reusable timed-toast queue. Used for both the achievement-unlock toast and the
// wave-end chest/clear toast, which had near-identical queue/timeout logic
// duplicated inline before this was factored out.
export class Toast {
  constructor(el, durationMs = 3000) {
    this.el = el;
    this.durationMs = durationMs;
    this.queue = [];
    this.until = 0;
  }

  push(item) {
    this.queue.push(item);
  }

  // Call once per frame: hides the toast once its time is up, then pops the next
  // queued item into view (via `render(item, el)`) if the toast is currently empty.
  update(now, render) {
    if (!this.el.hidden && now > this.until) this.el.hidden = true;
    if (this.el.hidden && this.queue.length) {
      render(this.queue.shift(), this.el);
      this.el.hidden = false;
      this.until = now + this.durationMs;
    }
  }
}
