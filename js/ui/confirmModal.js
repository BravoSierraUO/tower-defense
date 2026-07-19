// Shared yes/no confirmation modal — both the avatar-menu and settings-panel
// "Reset Progress" entry points funnel through this one instance so there's only
// one confirm/cancel wiring to maintain.
export class ConfirmModal {
  constructor({ afterConfirm } = {}) {
    this.el = document.getElementById('confirm-modal');
    this.action = null;
    document.getElementById('confirm-cancel-btn').addEventListener('click', () => this.close());
    document.getElementById('confirm-ok-btn').addEventListener('click', () => {
      this.action?.();
      this.close();
      afterConfirm?.();
    });
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
  }

  open(action) {
    this.action = action;
    this.el.hidden = false;
  }

  close() {
    this.el.hidden = true;
    this.action = null;
  }
}
