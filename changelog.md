# Changelog

Format: `vX.X - one line - files touched`

- v0.1 - Camera, infinite grid, zoom/pan - `camera.js`, `grid.js`, `renderer.js`, `input.js`, `world.js`, `game.js`
- v0.2 - Tower placement (click to place, snapped to grid) - `tower.js`, `world.js`, `renderer.js`, `game.js`
- v0.3 - Enemy movement (waypoint-following, temporary hardcoded path + spawn timer) - `enemy.js` (new), `config.js`, `world.js`, `game.js`, `renderer.js`

## Next up

- v0.4 - Combat (towers target/fire at enemies, damage, death events) → new `combat.js`
- v0.5 - Waves (replace `world.updateSpawning` timer with real wave data/timing) → new `wave.js`

## Notes for next step

- `world.PATH` in `config.js` is a placeholder single path. Real level data will replace it later — don't over-build around it yet.
- `World.updateSpawning()` is explicitly temporary, marked in a comment, meant to be deleted once `wave.js` exists.
- No `path.js` file yet — path is just data on `CONFIG`/`World`, per "avoid hardcoded numbers elsewhere" but kept minimal until it needs real behavior.
