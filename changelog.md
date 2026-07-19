# Changelog

Format: `vX.X - one line - files touched`

- v0.1 - Camera, infinite grid, zoom/pan - `camera.js`, `grid.js`, `renderer.js`, `input.js`, `world.js`, `game.js`
- v0.2 - Tower placement (click to place, snapped to grid) - `tower.js`, `world.js`, `renderer.js`, `game.js`
- v0.3 - Enemy movement (waypoint-following, temporary hardcoded path + spawn timer) - `enemy.js` (new), `config.js`, `world.js`, `game.js`, `renderer.js`
- v0.4 - Combat (towers target/fire at enemies, damage, death events) - `combat.js` (new), `game.js`
- v0.5 - **Direction change: static-world multiplayer TD, not a path TD.** Removed `CONFIG.PATH`. Enemies now spawn at a random angle on a ring outside the world and walk straight at a central Base. New `base.js` (health/position) and `spawner.js` (replaces the planned `wave.js` — owns spawn timing, wave number, and weighted easy/medium/hard difficulty tiers). `combat.js` now also resolves base damage when an enemy reaches it. `renderer.js` draws the base instead of a path. - `base.js` (new), `spawner.js` (new), `enemy.js`, `world.js`, `combat.js`, `renderer.js`, `config.js`
- v0.6 - UI (score, wave/tier indicator, base health bar, FPS, win/lose banner) - `ui.js` (new), `index.html`, `css/style.css`, `game.js`
- v0.7 - **Phase 1 closeout + Phase 2a: Command Core MVP.** Fixed `world.score` (read by ui.js but never set/incremented — kills now add `enemy.maxHealth` to score). Added the interior base-building screen: 8x8 grid, 3 starter rooms (Reactor/AI Core/Storage) each with 3 upgrade tiers, toggled via `B` key. Rooms produce pooled `power`/`compute`/`storageCap` output (`commandCore.totals()`) — no direct combat effect yet, that's Phase 2b's job. World simulation (waves/combat) keeps running in the background while the Core screen is open. - `commandcore.js` (new), `room.js` (new), `config.js`, `game.js`, `input.js`, `renderer.js`, `ui.js`, `world.js`, `index.html`, `css/style.css`
- v0.7.1 - Moved the code-map/roadmap doc into the repo as `docs.html`, linked from the in-game HUD (`DOCS` button, top right). Added Phase 5 "Dev Tooling & Portfolio Polish" to the roadmap — commit-timeline/stats-chart About screen, self-syncing docs, test harness — filed as backlog, non-blocking. - `docs.html` (moved in), `index.html`, `css/style.css`
- v0.7.2 - Fix bug: `docs.html`'s tabs got stuck on Roadmap after the first visit — `renderRoadmap()` was wiping `.layout`'s entire innerHTML, permanently destroying the SVG/detail elements every other tab renders into. Swapped in a dedicated `#roadmap-slot` toggled by visibility instead of a destructive rebuild; also fixes phase-card detail clicks on the Roadmap tab, which had the same root cause. - `docs.html`
- v0.8 - **Phase 2b: Skeleton Economy.** Gold pool (`world.gold`, capped by `goldCap()`), kill rewards scaled by enemy tier, wave-clear bonuses, a tower build cost gate, and right-click sell/refund (60%). Command Core output is now a real modifier instead of a display-only number: Reactor(power) discounts tower cost, AI Core(compute) boosts gold rewards, Storage(storageCap) raises the gold cap — all read live via `commandCore.totals()`. `docs.html`'s Economy tab updated to mark the now-real nodes/edges. - `config.js`, `world.js`, `tower.js`, `spawner.js`, `input.js`, `game.js`, `ui.js`, `index.html`, `docs.html`

## Next up

- Phase 3 - Full Core + Room Variety: Lab/Factory/Hangar/Shield/Dock, module slots, tech-tree gates
- Phase 5 (parallel, whenever) - git-hook-baked `stats.json`, in-game About/Analytics screen (commit timeline + LOC chart), docs.html auto-sync script, test harness for combat/economy/spawner logic
- Later - real difficulty curve tuning for `DIFFICULTY_TIERS` (needs actual playtesting, now also needs to account for the new economy); multiple simultaneous bases/players for the multiplayer goal

## Notes for next step

- `spawner.js` picks difficulty tiers by weighted random from `CONFIG.DIFFICULTY_TIERS`, gated by `unlockWave`. This is deliberately simple — replace with real curve design once balance passes start (v0.9).
- Base is currently single, at world center (0,0). Multiplayer/multi-base is out of scope until the single-base loop is fully working.
- Command Core only allows one of each room type (`CommandCore.isBuilt`) — matches the roadmap's "3 starter rooms," not a build-many-of-each model. Revisit if Phase 3's room variety wants multiples.
- Couldn't screenshot-verify the new Core screen in this environment — the sandboxed Chrome binary crashes on launch (`ld.so` relocation failure) before it can render anything, unrelated to this change. Verified by code trace + serving the files and checking for JS console/module errors instead.
- `World` now takes `commandCore` in its constructor (`new World(commandCore)`) so it can read `commandCore.totals()` for cost/reward/cap formulas — if `World` is ever instantiated elsewhere (tests, etc.), it needs a `CommandCore` instance passed in.
- Tower sell is right-click on a placed tower (60% refund of what was actually paid, tracked per-tower as `tower.cost`) — no confirmation dialog, matches the no-friction feel of placement.

