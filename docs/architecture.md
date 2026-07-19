# Architecture

Vanilla JS + Canvas 2D, no bundler, no framework, no build step. `index.html` loads
`js/main.js` as an ES module (`<script type="module">`), which is why the game needs to be
served over HTTP — Chrome refuses `import`/`fetch` from a bare `file://` URL. `python3 -m
http.server` (or any static server) from the repo root is enough.

## Module map

| File | Responsibility |
|---|---|
| `game.js` | Orchestrator. Owns every other system, runs the `requestAnimationFrame` loop, holds the view state machine, routes input to the right subsystem. The only file that knows about all the others. |
| `config.js` | Every tunable constant (costs, rates, tiers, colors) in one object, `CONFIG`. No logic. |
| `camera.js` | Pan/zoom, screen↔world coordinate conversion for the field view. |
| `renderer.js` | Canvas drawing only — field view, Command Core grid view. Never mutates state. |
| `grid.js` | Grid-line drawing helper used by `renderer.js`. |
| `input.js` | Raw DOM listeners → an edge-triggered `keyPresses` array + click/right-click queues, drained once per frame by `game.js`. |
| `world.js` | The field-view simulation: towers, scavenger turrets, enemies, base, gold/metal economy, power system. The biggest file — see [Economy layers](#economy-layers) below. |
| `tower.js` / `scavenger.js` / `enemy.js` / `base.js` | Entity classes placed/owned by `World`. |
| `combat.js` | Targeting, firing, projectiles, damage resolution — a free function (`updateCombat`) rather than a method, since it needs both `World` and `dt`. |
| `spawner.js` | Wave state machine (`countdown` → `spawning` → `active`), weighted difficulty-tier picks. |
| `commandcore.js` / `room.js` | The interior base-building grid: room placement, tiers, build timers, tech tree, module slots. Exposes `totals()` — the one aggregate object `world.js` reads to apply Core bonuses to the field economy. |
| `profile.js` | Persistent player progression: level/CP, prestige, skill tree, lifetime stats, save/load. Survives `Game.restart()` — everything else doesn't. |
| `achievements.js` | Pure data: 21 badges, each a `test(profile, event)` predicate. Evaluated by `profile.js`'s fixpoint loop. |
| `ui.js` | Thin composition shell: owns the view switch (which side panel is visible) and forwards per-frame updates to whichever `js/ui/*.js` panel owns each concern. Never mutates gameplay state directly — only translates DOM clicks into callbacks passed in by `game.js`. |
| `ui/hudPanel.js` | Persistent top-bar stats, base health bar, repair/trigger-wave buttons, win banner, and the two toast queues (achievement unlock, wave-end chest). |
| `ui/corePanel.js` | Command Core view: room slots, tech tree, power/compute/storage/research readouts, dock/market trade. |
| `ui/fieldPanel.js` | Field view: build-mode picker slots + the tower/scavenger inspector card. |
| `ui/profilePanel.js` | Level/XP, prestige, skill tree, achievement list. |
| `ui/aboutPanel.js` | Renders the `stats.json` snapshot once on load (see Docs tooling below). |
| `ui/settingsPanel.js` | Theme toggle, raw-save-data JSON viewer, storage-size readout, delete-save entry point. |
| `ui/avatarMenu.js` | Top-right avatar dropdown — routes to Profile/About/Settings/Report-bug/Reset. |
| `ui/confirmModal.js` | Shared yes/no confirmation modal used by both reset-progress entry points. |
| `ui/missionBanner.js` | Tutorial mission banner + the reusable `.mission-glow` highlight. |
| `ui/toast.js` | Reusable timed-toast queue, used by `hudPanel.js` for both toast types. |
| `stats.js` | Fetches and caches `stats.json` for the in-game About panel. |
| `utils.js` | Grab-bag of small pure helpers. |

## Orchestration

`Game.loop(timestamp)` does the same three things every frame:

1. `update(dt)` — `handleInput()` drains the input queues, then (if `state === 'playing'`)
   ticks towers, spawner, combat, enemies, the Command Core, passive income, and the AI
   Cycle Budget, in that fixed order. `watchProfileEvents()` diffs a handful of monotonic
   counters (`world.kills`, `commandCore.rooms.length`, etc.) against last frame's values and
   translates increases into `profile.emit()` calls — the engine files never import `Profile`
   directly, the same way `ui.js` never mutates gameplay state directly. One-way observation
   in both directions.
2. `render()` — draws the canvas for whichever view is active, then calls `ui.update(...)`
   with a long positional-argument list (world, fps, state, view, commandCore, profile,
   selection state) — `Ui` forwards this to whichever `js/ui/*.js` panel is active; the
   `UI` class itself holds no gameplay state, just DOM refs and per-panel instances.
3. Schedules the next `requestAnimationFrame`.

## View state machine

`Game.view` is one of `'field' | 'core' | 'profile' | 'about'`, toggled by hotkeys
(`B`/`P`/`O`) or, for `about`, also a HUD button. Exactly one top-level `<aside>` in
`index.html` is un-hidden at a time (`core-panel` / `profile-panel` / `about-panel`); the
field view has no panel of its own, just the always-visible HUD. Camera panning and
tower/room placement clicks are both gated on `view === 'field'` — nothing happens
underneath a panel. There is currently no single click-to-open menu; each view is its own
hotkey (see the Roadmap's Phase 5b card in `whatever.html` for the "menu shell" idea this
would consolidate into, deliberately filed and not built).

## Economy layers

Three resources, three different accrual shapes, all read from `CommandCore.totals()`:

- **Gold** — the Command-Core-room currency. Reward-based (kills, wave clears, combo
  streak) plus a passive trickle scaled by profile level. Spent on rooms/upgrades/modules.
- **Metal** — the exterior-grid currency (towers, scavenger turrets). Accrues continuously
  via the **AI Cycle Budget**: a fixed `cyclesPerMin` bandwidth (from AI Core + a
  no-AI-Core-needed base floor) split evenly across every active metal producer
  (`world.metalPerSecond()`, ticked by `updateCycleBudget(dt)`). More producers dilutes
  everyone's share — a fair-share scheduler, not a queue.
- **Power** — not a currency, a live ratio. `powerSupply()` (Reactor output) vs.
  `powerConsumption()` (every placed Tower's fixed draw) yields `powerFactor()`. When
  consumption exceeds supply, `combat.js` stretches every Tower's fire-rate cooldown by the
  shortfall, floored at `BROWNOUT_MIN_FIRE_RATE_MULT` so towers slow down but never fully
  stop. No `update(dt)` needed — it's a pure derived ratio, unlike metal's accrual.

The Cycle Budget and the power system share the same "fixed supply split across active
consumers" shape by design (Phase 4d reused Phase 4c's pattern) but differ in one way:
metal accrues over time, power is instantaneous.

## Persistence

`profile.js` writes to `localStorage['td.profile.v1']` after every mutating call — no
explicit save action. `defaultStorage()` falls back to a fresh **per-instance** in-memory
store when `localStorage` doesn't exist (Node, i.e. the entire test suite) — not a shared
module singleton, which an earlier draft got wrong and which leaked state between test
files. `load()` merges the saved blob onto a fresh `blank()` field by field, so new schema
fields added later just take their default on an old save instead of crashing; a corrupt or
missing save falls back to `blank()` inside a try/catch, same as a brand-new player.

**Gate-bypassing starters:** `CommandCore.placeStarterRoom` / `World.placeStarterScavenger`
force-place a free, already-active Reactor + Scavenger Turret at world init, called only
from `Game`'s constructor/`restart()` — deliberately kept out of `CommandCore`'s/`World`'s
own constructors, because ~30 unit tests construct those directly for a pristine fixture and
would break if a starter room silently appeared in every one of them. If a future phase adds
another "free starter X," follow this same pattern rather than touching the constructors.

## Testing

`node --test tests/` (`npm test` is the same command aliased) — Node's built-in test
runner, zero dependencies, zero `npm install`. `commandcore/economy/combat/spawner/profile`
test files cover "does the code do what it does"; `balance.test.mjs` asks a different
question — does a tuning pass in `config.js` silently break the economy (costs must never
decrease as you buy more, floors must never hit zero, the tech tree must stay reachable in
bounded time). Passing tests mean the code is *structurally sane*, not *fun* — no
playtesting has happened yet; see `changelog.md`'s "Later" notes.

`game.js`, `renderer.js`, `input.js`, and `ui.js`/`ui/*.js` have **no test coverage** —
they're DOM/canvas-dependent and were verified by code trace + manual `getElementById`
cross-checks instead (see `changelog.md`'s per-version notes for specifics). Every other module is
plain JS with no DOM dependency and can be imported directly under Node, which is what makes
the zero-dependency test harness possible at all.

## Docs tooling (Phase 5)

`whatever.html` is a single doc page (merged from two, see `changelog.md` v1.2) rendered by
one generic flow-diagram engine off two plain data arrays, `FLOWS` (shipped-only "what
happens when" walkthroughs) and `ROADMAP` (phase status/items/notes, including in-progress
and backlog work — kept separate from `FLOWS` on purpose, see its own header comment).
Adding a new documented flow is adding data, not drawing a new diagram.

Its Velocity section and the in-game About panel (`O` key) both read the same
`stats.json`, generated by `scripts/gen-stats.mjs` (walks full git history via
`git ls-tree`/`git cat-file`, cached by blob SHA) and re-inlined into `whatever.html`'s
`STATS` block. A pre-commit hook (`scripts/hooks/pre-commit`, install via
`npm run hooks:install` — git doesn't version `.git/hooks` itself) runs the generator plus
an advisory `scripts/check-roadmap-sync.mjs` (cross-checks "Phase N" mentions between
`changelog.md` and `whatever.html`'s `ROADMAP`, warns on drift, never blocks) before every
commit.

## Known non-goals (as of this writing)

- Still one generic `Tower` class — no per-tower XP/evolution/module loadout (see
  `whatever.html`'s Phase 7b card, deliberately unscoped pending a playtest pass). Phase 7a
  added a `damageType` tag (kinetic/plasma/energy) and a rock-paper-scissors matchup
  multiplier against enemy `armorType`, but stats (damage/range/fire rate/cost) are still
  identical across all three — that differentiation is Phase 7b's job.
- Towers have no health and can't be damaged — enemies walk straight through them to the
  base (deliberately cut from Phase 4b, filed as an unscoped backlog item).
- Single base, single player, world-center-fixed — no multiplayer/multi-base yet.
- No difficulty-curve tuning pass — the balance test suite guards structure, not fun.
