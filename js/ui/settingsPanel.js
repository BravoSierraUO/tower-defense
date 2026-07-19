// Settings panel: theme toggle, raw-save-data JSON viewer, storage-size readout,
// and the "Delete Save Data" entry point (routed through the shared ConfirmModal).
// Theme is independent of gameplay state entirely (no Game/Profile involvement) —
// just a data-theme attribute + a localStorage flag read back on load.
import { CONFIG } from '../config.js';

export class SettingsPanel {
  constructor({ onOpenResetConfirm, onClose } = {}) {
    this.el = document.getElementById('settings-panel');
    document.getElementById('settings-close-btn').addEventListener('click', () => onClose?.());
    document.getElementById('settings-footer-close-btn').addEventListener('click', () => onClose?.());
    this.storageSize = document.getElementById('settings-storage-size');
    this.latestProfile = null; // updated every frame in update(); read on demand by the JSON viewer
    document.getElementById('settings-storage-key').textContent = CONFIG.PROFILE.STORAGE_KEY;
    document.getElementById('json-viewer-key').textContent = CONFIG.PROFILE.STORAGE_KEY;

    this.themeToggle = document.getElementById('theme-toggle');
    this.themeToggleLabel = document.getElementById('theme-toggle-label');
    this.applyTheme(localStorage.getItem('td.theme') || 'dark');
    this.themeToggle.addEventListener('click', () => {
      this.applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
    });

    this.jsonViewer = document.getElementById('json-viewer');
    this.jsonViewerContent = document.getElementById('json-viewer-content');
    document.getElementById('view-json-btn').addEventListener('click', () => {
      if (!this.latestProfile) return;
      this.jsonViewerContent.textContent = this.latestProfile.rawJSON();
      this.jsonViewer.hidden = false;
    });
    document.getElementById('json-close-btn').addEventListener('click', () => { this.jsonViewer.hidden = true; });
    document.getElementById('json-copy-btn').addEventListener('click', () => {
      navigator.clipboard?.writeText(this.jsonViewerContent.textContent).catch(() => {});
    });

    document.getElementById('menu-reset-progress').addEventListener('click', () => onOpenResetConfirm?.());
  }

  applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('td.theme', theme); } catch (e) {}
    const light = theme === 'light';
    this.themeToggle.setAttribute('aria-checked', String(light));
    this.themeToggleLabel.textContent = light ? 'Light' : 'Dark';
  }

  hideJsonViewer() {
    this.jsonViewer.hidden = true;
  }

  update(inSettings, profile) {
    this.latestProfile = profile;
    if (inSettings) {
      const bytes = new Blob([profile.rawJSON()]).size;
      this.storageSize.textContent = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      this.hideJsonViewer();
    }
  }
}
