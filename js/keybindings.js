// Rebindable single-key actions (Settings > Hotkeys). Browser-only, same as
// SettingsPanel's theme handling — reads/writes localStorage directly, no
// Node-safe fallback, because it's never instantiated outside a real page (see
// docs/architecture.md's note on which UI modules have zero test coverage on purpose).
import { CONFIG } from './config.js';

const STORAGE_KEY = 'td.keybindings';

export const KEYBIND_ACTIONS = [
  { id: 'panUp', label: 'Move Up' },
  { id: 'panDown', label: 'Move Down' },
  { id: 'panLeft', label: 'Move Left' },
  { id: 'panRight', label: 'Move Right' }
];

// Merges over the defaults rather than trusting the saved blob wholesale, so a
// future new action added to DEFAULT_KEYBINDINGS shows up with a sane default
// for players who saved bindings before it existed.
export function loadKeybindings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) {}
  return { ...CONFIG.DEFAULT_KEYBINDINGS, ...saved };
}

export function saveKeybindings(bindings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings)); } catch (e) {}
}
