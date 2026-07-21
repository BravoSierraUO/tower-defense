// Phase 13: sound.js smoke test, adapted from the sister project's own
// RMUV/test/sound.test.js — the actual audio is verified by ear in a browser;
// here we test the pure parts: the registry, name coverage for what's actually
// wired (see game.js/ui.js/ui/*.js), node-safety, the mute facade's gating, and
// that the real render path runs against a mock AudioContext (incl. opts.rate).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Sound } from '../js/sound.js';

describe('sound.js: registry', () => {
  test('exposes a non-trivial palette with no duplicate names', () => {
    assert.ok(Array.isArray(Sound.GROUPS) && Sound.GROUPS.length >= 4);
    const names = Sound.names();
    assert.ok(names.length >= 10, `expected a real palette, got ${names.length}`);
    assert.equal(new Set(names).size, names.length, 'no duplicate sound names');
  });

  test('every sound belongs to a known group and has at least one valid step', () => {
    for (const n of Sound.names()) {
      assert.ok(Sound.GROUPS.includes(Sound.group(n)), `${n} has a known group`);
      const steps = Sound.describe(n);
      assert.ok(Array.isArray(steps) && steps.length >= 1, `${n} has >=1 step`);
      for (const s of steps) {
        assert.ok(typeof s.d === 'number' && s.d > 0, `${n} step has a positive duration`);
        assert.ok(s.wave === 'noise' || typeof s.f === 'number', `${n} tone step has a frequency`);
      }
    }
  });

  test('every name actually wired from game.js/ui.js/ui/*.js exists in the palette', () => {
    const WIRED = [
      'tap', 'open', 'back', 'nope',           // wave-trigger tap, avatar/menu-modal open+close, failed placement
      'build', 'sell', 'ability', 'wave',      // tower/room build & sell, ability use, wave-end
      'explode', 'badge',                       // enemy kill, achievement unlock
    ];
    for (const n of WIRED) assert.ok(Sound.has(n), `wired sound missing from palette: ${n}`);
  });
});

describe('sound.js: node-safety (no AudioContext in scope)', () => {
  test('play() never throws and is a no-op without a usable AudioContext', () => {
    assert.doesNotThrow(() => { for (const n of Sound.names()) Sound.play(n); });
  });

  test('play() on an unknown name never throws and returns false', () => {
    assert.equal(Sound.play('totally-unknown-sound'), false);
  });
});

describe('sound.js: mute facade', () => {
  test('disabling gates play() (registry lookup never even runs)', () => {
    const wasEnabled = Sound.enabled;
    Sound.setEnabled(false);
    assert.equal(Sound.enabled, false);
    assert.equal(Sound.play('tap'), false, 'play() returns false while disabled, not the raw-render result');
    Sound.setEnabled(wasEnabled);
  });

  test('toggle() flips enabled', () => {
    const before = Sound.enabled;
    Sound.toggle();
    assert.equal(Sound.enabled, !before);
    Sound.toggle();
    assert.equal(Sound.enabled, before);
  });
});

describe('sound.js: mock AudioContext render path', () => {
  function mockCtx() {
    const ev = { freqs: [], started: 0, osc: 0, gain: 0, src: 0 };
    const freqParam = () => ({
      value: 0,
      setValueAtTime: (v) => ev.freqs.push(v),
      linearRampToValueAtTime: (v) => ev.freqs.push(v),
      exponentialRampToValueAtTime: (v) => ev.freqs.push(v),
    });
    const gainParam = () => ({ value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, cancelScheduledValues: () => {} });
    const ctx = {
      currentTime: 0, state: 'running', sampleRate: 44100, destination: {},
      resume() { return Promise.resolve(); },
      createOscillator() { ev.osc++; return { type: 'sine', frequency: freqParam(), connect() {}, start() { ev.started++; }, stop() {} }; },
      createGain() { ev.gain++; return { gain: gainParam(), connect() {} }; },
      createBuffer(ch, len) { return { getChannelData() { return new Float32Array(len); } }; },
      createBufferSource() { ev.src++; return { buffer: null, playbackRate: freqParam(), connect() {}, start() { ev.started++; }, stop() {} }; },
    };
    return { ctx, ev };
  }

  test('a tone sound builds an oscillator+gain and honors opts.rate', (t) => {
    const { ctx, ev } = mockCtx();
    globalThis.AudioContext = function () { return ctx; };
    t.after(() => { delete globalThis.AudioContext; Sound._resetCtx(); });
    Sound._resetCtx();
    Sound.setEnabled(true);

    assert.equal(Sound.play('tap', { rate: 2 }), true);
    assert.ok(ev.osc >= 1, 'created at least one oscillator');
    assert.ok(ev.gain >= 1, 'created at least one gain node');
    assert.ok(ev.started >= 1, 'started the oscillator');
    // 'tap' is { f: 520, f2: 470 } — at rate 2 the scheduled frequencies double.
    assert.ok(ev.freqs.some((f) => Math.abs(f - 1040) < 0.01), 'rate multiplies the base frequency');
  });

  test('a noise sound (explode) builds a buffer source, not an oscillator', (t) => {
    const { ctx, ev } = mockCtx();
    globalThis.AudioContext = function () { return ctx; };
    t.after(() => { delete globalThis.AudioContext; Sound._resetCtx(); });
    Sound._resetCtx();
    Sound.setEnabled(true);

    assert.equal(Sound.play('explode'), true);
    assert.ok(ev.src >= 1, 'created at least one buffer source for the noise step');
  });
});
