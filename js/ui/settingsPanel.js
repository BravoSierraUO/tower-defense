// Settings panel: theme toggle, a field-grid debug checkbox, raw-save-data JSON
// viewer, storage-size readout, and the "Delete Save Data" entry point (routed
// through the shared ConfirmModal). Theme is independent of gameplay state
// entirely (no Game/Profile involvement) — just a data-theme attribute + a
// localStorage flag read back on load. The grid checkbox is similar (this panel
// owns it end to end, localStorage-backed) but unlike theme it can't be a pure
// CSS re-skin — it has to reach Renderer.draw(), a canvas draw call, not a DOM
// style — so `game.js` reads `ui.settings.showGrid` directly each frame, the
// same "Game peeks at a public field on a ui.js panel" precedent radialMenu.isOpen
// already set. Hotkeys work the same way — `ui.settings.keybindings` is what
// camera.update() actually reads each frame (see js/keybindings.js and game.js).
import { CONFIG } from '../config.js';
import { KEYBIND_ACTIONS, loadKeybindings, saveKeybindings } from '../keybindings.js';
import { Sound } from '../sound.js';

export class SettingsPanel {
  constructor({ onOpenResetConfirm } = {}) {
    this.el = document.getElementById('settings-panel');
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

    // Phase 13: mute toggle for the new synth SFX engine (js/sound.js) — same
    // localStorage-backed on/off shape as the theme toggle above, reusing its
    // exact `.theme-toggle` markup/CSS rather than inventing a second switch style.
    this.soundToggle = document.getElementById('sound-toggle');
    this.soundToggleLabel = document.getElementById('sound-toggle-label');
    this.applySoundToggleUI(Sound.enabled);
    this.soundToggle.addEventListener('click', () => {
      Sound.toggle();
      this.applySoundToggleUI(Sound.enabled);
    });

    // Phase 8g: rebindable hotkeys. Single physical keys only, no modifier chords
    // (Ctrl/Shift/Alt) — deliberately out of scope for an action set this small in
    // a non-RTS. Rows built once (same "fixed list, build once" precedent as
    // WavePanel/MissionPanel), a "Press a key…" capture on click, swap-on-conflict
    // so two actions can never land on the same key.
    this.keybindings = loadKeybindings();
    this.keybindListenerActionId = null;
    this.keybindRows = {};
    const keybindList = document.getElementById('keybind-list');
    for (const action of KEYBIND_ACTIONS) {
      const row = document.createElement('div');
      row.className = 'settings-row';
      const label = document.createElement('span');
      label.textContent = action.label;
      const btn = document.createElement('button');
      btn.className = 'settings-btn-sm keybind-btn';
      btn.addEventListener('click', () => this.startListeningForKeybind(action.id));
      row.appendChild(label);
      row.appendChild(btn);
      keybindList.appendChild(row);
      this.keybindRows[action.id] = btn;
    }
    this.refreshKeybindLabels();

    document.getElementById('keybind-reset-btn').addEventListener('click', () => {
      this.keybindings = { ...CONFIG.DEFAULT_KEYBINDINGS };
      saveKeybindings(this.keybindings);
      this.stopListeningForKeybind();
    });

    // Only acts while a rebind is actually pending (startListeningForKeybind sets
    // keybindListenerActionId) — otherwise every keydown falls through untouched,
    // same as before this existed.
    window.addEventListener('keydown', e => {
      if (!this.keybindListenerActionId) return;
      e.preventDefault();
      const key = e.key.toLowerCase();
      if (key === 'escape') { this.stopListeningForKeybind(); return; } // cancel, keep the old binding
      this.rebindKey(this.keybindListenerActionId, key);
      this.stopListeningForKeybind();
    });

    // Default OFF on purpose (unset localStorage reads as false) — a debug aid,
    // not something a new player should see turned on.
    this.gridCheckbox = document.getElementById('grid-checkbox');
    this.showGrid = localStorage.getItem('td.showGrid') === '1';
    this.gridCheckbox.checked = this.showGrid;
    this.gridCheckbox.addEventListener('change', () => {
      this.showGrid = this.gridCheckbox.checked;
      try { localStorage.setItem('td.showGrid', this.showGrid ? '1' : '0'); } catch (e) {}
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

  applySoundToggleUI(on) {
    this.soundToggle.setAttribute('aria-checked', String(on));
    this.soundToggleLabel.textContent = on ? 'On' : 'Off';
  }

  hideJsonViewer() {
    this.jsonViewer.hidden = true;
  }

  startListeningForKeybind(actionId) {
    this.keybindListenerActionId = actionId;
    this.keybindRows[actionId].textContent = 'Press a key…';
    this.keybindRows[actionId].classList.add('keybind-listening');
  }

  stopListeningForKeybind() {
    this.keybindListenerActionId = null;
    this.refreshKeybindLabels();
  }

  // Swaps on conflict rather than rejecting — if the pressed key is already bound
  // to a different action, that action takes over whatever key `actionId` used to
  // have, so two actions can never end up sharing one key.
  rebindKey(actionId, key) {
    const conflictId = Object.keys(this.keybindings).find(id => id !== actionId && this.keybindings[id] === key);
    if (conflictId) this.keybindings[conflictId] = this.keybindings[actionId];
    this.keybindings[actionId] = key;
    saveKeybindings(this.keybindings);
  }

  refreshKeybindLabels() {
    for (const action of KEYBIND_ACTIONS) {
      const btn = this.keybindRows[action.id];
      btn.textContent = this.keybindings[action.id].toUpperCase();
      btn.classList.remove('keybind-listening');
    }
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
