// Top-right avatar menu: entry point for Profile/About/Settings/Report-bug/Reset-progress.
// Closes on any outside click via the document-level listener below.
export class AvatarMenu {
  constructor({ onToggleProfile, onToggleAbout, onToggleSettings, onReportBug, onOpenResetConfirm } = {}) {
    this.btn = document.getElementById('avatar-btn');
    this.menu = document.getElementById('avatar-menu');
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setOpen(this.menu.hidden);
    });
    document.addEventListener('click', () => this.setOpen(false));

    document.getElementById('menu-profile').addEventListener('click', () => { this.setOpen(false); onToggleProfile?.(); });
    document.getElementById('menu-about').addEventListener('click', () => { this.setOpen(false); onToggleAbout?.(); });
    document.getElementById('menu-settings').addEventListener('click', () => { this.setOpen(false); onToggleSettings?.(); });
    document.getElementById('menu-report-bug').addEventListener('click', () => { this.setOpen(false); onReportBug?.(); });
    document.getElementById('menu-reset').addEventListener('click', () => { this.setOpen(false); onOpenResetConfirm?.(); });
  }

  setOpen(open) {
    this.menu.hidden = !open;
    this.btn.setAttribute('aria-expanded', String(open));
  }
}
