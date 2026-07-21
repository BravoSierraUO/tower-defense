// Phase 13: synthesized SFX engine, ported from the sister project's RMUV_SFX/RMUV_SOUND
// pair (RMUV/rmuv-sound.js + RMUV/app.js) — same zero-asset approach: every sound is a
// short sequence of oscillator/noise "steps" rendered live on a lazy shared AudioContext,
// so there's nothing to host, cache, or add as a dependency. Palette trimmed to what this
// game actually needs (RMUV's board/card/dice/party groups don't apply here) plus one new
// `td` group authored for this game's own events.
//
// Node-safe by the same trick RMUV's engine already proved out: with no global
// AudioContext, play() is a silent no-op, so the registry and the mock-ctx render path
// stay unit-testable (see tests/sound.test.mjs, adapted from RMUV/test/sound.test.js).

const PALETTE = {
  // soft sine shell — menus, toggles, invalid actions
  ui: {
    tap:        [{ wave: 'sine', f: 520, f2: 470, d: 0.05, g: 0.16 }],
    open:       [{ wave: 'sine', f: 440, d: 0.06, g: 0.15 }, { wave: 'sine', f: 660, d: 0.09, g: 0.15, at: 0.05 }],
    back:       [{ wave: 'sine', f: 520, d: 0.06, g: 0.15 }, { wave: 'sine', f: 370, d: 0.10, g: 0.15, at: 0.05 }],
    toggle_on:  [{ wave: 'sine', f: 600, f2: 920, d: 0.11, g: 0.18 }],
    toggle_off: [{ wave: 'sine', f: 600, f2: 350, d: 0.11, g: 0.18 }],
    nope:       [{ wave: 'square', f: 200, f2: 130, d: 0.16, g: 0.15 }],
  },
  // impact family — combat resolution
  combat: {
    shoot:   [{ wave: 'sawtooth', f: 900, f2: 300, d: 0.08, g: 0.15 }],
    hit:     [{ wave: 'noise', d: 0.04, g: 0.16 }, { wave: 'square', f: 300, f2: 180, d: 0.06, g: 0.18, at: 0.01 }],
    explode: [{ wave: 'noise', d: 0.18, g: 0.10 }, { wave: 'sawtooth', f: 160, f2: 50, d: 0.20, g: 0.09 }],   // gain kept low: this fires per kill, potentially several a second
  },
  // reward ticks
  econ: {
    coin: [{ wave: 'square', f: 988, d: 0.06, g: 0.18 }, { wave: 'square', f: 1319, d: 0.14, g: 0.20, at: 0.05 }],
  },
  // this game's own events
  td: {
    build:   [{ wave: 'triangle', f: 300, f2: 520, d: 0.09, g: 0.18 }],
    sell:    [{ wave: 'triangle', f: 520, f2: 300, d: 0.09, g: 0.16 }],
    wave:    [{ wave: 'sawtooth', f: 220, f2: 440, d: 0.16, g: 0.16 }, { wave: 'square', f: 660, d: 0.10, g: 0.16, at: 0.14 }],
    ability: [{ wave: 'sine', f: 700, f2: 1100, d: 0.14, g: 0.20 }],
    badge:   [{ wave: 'triangle', f: 784, d: 0.10, g: 0.20 }, { wave: 'triangle', f: 1047, d: 0.10, g: 0.20, at: 0.10 }, { wave: 'triangle', f: 1319, d: 0.30, g: 0.24, at: 0.20 }],
  },
};

const GROUPS = Object.keys(PALETTE);
const SOUNDS = {};   // flat: name -> { group, steps }
GROUPS.forEach((grp) => { for (const name in PALETTE[grp]) SOUNDS[name] = { group: grp, steps: PALETTE[grp][name] }; });

const names = () => Object.keys(SOUNDS);
const has = (n) => !!SOUNDS[n];
const group = (n) => (SOUNDS[n] ? SOUNDS[n].group : null);
const describe = (n) => (SOUNDS[n] ? SOUNDS[n].steps.slice() : []);

// ---- audio context (lazy, shared) ----
let _ctx = null, _master = null, masterVol = 0.5;
const ACtor = () => (typeof globalThis.AudioContext === 'function' ? globalThis.AudioContext
  : (typeof globalThis.webkitAudioContext === 'function' ? globalThis.webkitAudioContext : null));
function getCtx() {
  if (_ctx) return _ctx;
  const AC = ACtor(); if (!AC) return null;
  try { _ctx = new AC(); } catch (e) { return null; }
  try { _master = _ctx.createGain(); _master.gain.value = masterVol; _master.connect(_ctx.destination); } catch (e) { _master = null; }
  return _ctx;
}
function _resetCtx() { _ctx = null; _master = null; }   // test seam: drop a cached (mock) ctx

function makeNoise(ctx, d) {
  const sr = ctx.sampleRate || 44100;
  const len = Math.max(1, Math.floor(sr * d));
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; return src;
}

function renderSteps(ctx, steps, rate, gMul) {
  const t = ctx.currentTime || 0;
  const dest = _master || ctx.destination;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const t0 = t + (s.at || 0), d = s.d;
    const peak = Math.max(0.0001, (s.g == null ? 0.25 : s.g) * gMul);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.012, d * 0.4));   // quick attack
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d);                   // exp decay → no click tail
    gain.connect(dest);
    if (s.wave === 'noise') {
      const src = makeNoise(ctx, d);
      src.playbackRate.setValueAtTime(rate, t0);
      src.connect(gain); src.start(t0); src.stop(t0 + d + 0.02);
    } else {
      const osc = ctx.createOscillator();
      osc.type = s.wave || 'sine';
      osc.frequency.setValueAtTime(s.f * rate, t0);
      if (s.f2) osc.frequency.linearRampToValueAtTime(s.f2 * rate, t0 + d);
      osc.connect(gain); osc.start(t0); osc.stop(t0 + d + 0.02);
    }
  }
}

// raw render — ignores the enabled/mute facade below. opts.rate multiplies every
// frequency, opts.gain scales output. Returns false (no-op) when the sound or a
// usable AudioContext is absent (always true in Node).
function rawPlay(name, opts) {
  const snd = SOUNDS[name]; if (!snd) return false;
  const ctx = getCtx(); if (!ctx) return false;
  try { if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); } catch (e) {}
  opts = opts || {};
  try { renderSteps(ctx, snd.steps, opts.rate || 1, opts.gain == null ? 1 : opts.gain); } catch (e) {}
  return true;
}

function setMasterNow(v) { if (!(_ctx && _master)) return; try { _master.gain.cancelScheduledValues(_ctx.currentTime || 0); } catch (e) {} try { _master.gain.value = v; } catch (e) {} }

// ---- mute facade: gates rawPlay() on a persisted on/off setting. Guarded behind a
// `typeof localStorage` check (not just a browser-only shrug like keybindings.js) so the
// gating logic itself — not just the render path — stays exercised by node --test. ----
const STORAGE_KEY = 'td.sound';
const hasStorage = () => typeof localStorage !== 'undefined';

function loadEnabled() {
  if (!hasStorage()) return true;
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch (e) { return true; }
}

export const Sound = {
  enabled: loadEnabled(),

  play(name, opts) {
    if (!this.enabled) return false;
    return rawPlay(name, opts);
  },

  setEnabled(on) {
    this.enabled = !!on;
    if (hasStorage()) { try { localStorage.setItem(STORAGE_KEY, this.enabled ? 'on' : 'off'); } catch (e) {} }
    if (this.enabled) { setMasterNow(masterVol); this.play('toggle_on'); }
    else { setMasterNow(0); }   // cut anything mid-flight, now — not just future play() calls
  },

  toggle() { this.setEnabled(!this.enabled); },

  // test seams / registry introspection
  names, has, group, describe, GROUPS, SOUNDS,
  _resetCtx,
  _masterGain: () => (_master ? _master.gain.value : null),
};

// ---- browser-only: unlock the context on the first real user gesture (autoplay
// policies suspend a freshly created AudioContext until one arrives) ----
if (typeof window !== 'undefined') {
  const unlock = () => { const ctx = getCtx(); try { if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume(); } catch (e) {} };
  ['pointerdown', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));
}
