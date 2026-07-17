# Changelog

Format: `vX.X - one line - files touched`

- v0.1 - Camera, infinite grid, zoom/pan - `camera.js`, `grid.js`, `renderer.js`, `input.js`, `world.js`, `game.js`
- v0.2 - Tower placement (click to place, snapped to grid) - `tower.js`, `world.js`, `renderer.js`, `game.js`
- v0.3 - Enemy movement (waypoint-following, temporary hardcoded path + spawn timer) - `enemy.js` (new), `config.js`, `world.js`, `game.js`, `renderer.js`
- v0.4 - Combat (towers target/fire at enemies, damage, death events) - `combat.js` (new), `game.js`
- v0.5 - **Direction change: static-world multiplayer TD, not a path TD.** Removed `CONFIG.PATH`. Enemies now spawn at a random angle on a ring outside the world and walk straight at a central Base. New `base.js` (health/position) and `spawner.js` (replaces the planned `wave.js` — owns spawn timing, wave number, and weighted easy/medium/hard difficulty tiers). `combat.js` now also resolves base damage when an enemy reaches it. `renderer.js` draws the base instead of a path. - `base.js` (new), `spawner.js` (new), `enemy.js`, `world.js`, `combat.js`, `renderer.js`, `config.js`

## Next up

- v0.6 - UI (score, wave/tier indicator, base health bar, FPS)
- Later - real difficulty curve tuning for `DIFFICULTY_TIERS`; multiple simultaneous bases/players for the multiplayer goal

## Notes for next step

- `spawner.js` picks difficulty tiers by weighted random from `CONFIG.DIFFICULTY_TIERS`, gated by `unlockWave`. This is deliberately simple — replace with real curve design once balance passes start (v0.9).
- Base is currently single, at world center (0,0). Multiplayer/multi-base is out of scope until the single-base loop is fully working.
- No UI yet — base health, wave number, and tier are all readable off `world.base` / `world.spawner` but nothing renders them.

