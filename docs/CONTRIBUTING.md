# Contributing

Solo project, but this is the checklist a second contributor (or future you) would need.
See [architecture.md](architecture.md) for how the codebase fits together.

## Setup

No `npm install` — there are no dependencies. Two one-time steps:

```bash
npm run hooks:install   # copies scripts/hooks/pre-commit into .git/hooks/ (git doesn't version hooks)
```

That's it. Node 20+ and a static file server (for the game itself) are the only
requirements.

## Running things

```bash
npm test                        # node --test tests/ — 114 tests, zero deps, a few seconds
npm run stats                   # manually regenerate stats.json + whatever.html's Velocity data
npm run check-roadmap           # manually check whatever.html's ROADMAP against changelog.md
python3 -m http.server 8000     # serve the game — index.html uses <script type="module">,
                                 # which Chrome refuses to load from a bare file:// URL
```

Then open `http://localhost:8000/` for the game, or `http://localhost:8000/whatever.html`
for the doc page.

## Before you commit

- `npm test` passes. All 114 tests, no skips.
- If you touched `js/game.js`, `js/ui.js`, `js/renderer.js`, or `index.html` — those have
  zero automated coverage (DOM/canvas-dependent). Manually cross-check every
  `document.getElementById(...)` call in the JS you touched still resolves against
  `index.html`'s actual ids (see `docs/architecture.md`'s Testing section for why this is
  the established fallback, not a shortcut).
- The pre-commit hook regenerates `stats.json` and re-inlines `whatever.html`'s `STATS`
  block automatically, and runs an advisory Roadmap/changelog drift check. If it warns
  about a phase mentioned in one file but not the other, reconcile it by hand before
  pushing — it won't block the commit, but an unreconciled drift will still be there next
  time.
- If you shipped a phase or a meaningful chunk of one, add a `changelog.md` entry in the
  same voice as the existing ones: what shipped, why (if a design call was made), and the
  files touched. This file is the actual history — `git log` alone doesn't carry the
  "why," and the Velocity/About panels only show line counts, not intent.

## Conventions worth knowing before you add code

- **`config.js` is the only place tunable numbers live.** Don't hardcode a cost/rate/tier
  value somewhere else — `balance.test.mjs` and the Command Core's/World's cost formulas
  all assume `CONFIG` is the single source of truth.
- **Engine files don't know about `Profile`, and `ui.js` doesn't mutate gameplay state.**
  Both directions are one-way observation from `game.js` (see architecture.md's
  Orchestration section). Don't reach around this to save a few lines — it's what keeps
  `world.js`/`combat.js`/`spawner.js` importable and testable with zero DOM.
- **New "free starter" content follows `Game.placeStarters()`'s gate-bypassing pattern**,
  not the constructors. `CommandCore`/`World`'s own constructors — and `tests/helpers.mjs`'s
  `freshGame()` — must stay pristine, since dozens of tests build a fresh instance directly
  for a known-empty fixture.
- **No new hex colors for game UI without a reason.** The Primitives section of
  `whatever.html` audits `css/style.css` for exactly one accent color (`#7ED9FF`) and one
  shared glass recipe across every panel — a new one-off color is a drift that section will
  (eventually, once someone reads it) flag. Reuse the accent at different opacities instead,
  the way the About panel's category bars do.
- **A phase/roadmap idea you're not building yet still gets filed**, not just discussed —
  add a card to `whatever.html`'s `ROADMAP` array (status `BACKLOG`/`LATER`, honest, not
  hidden) and a line in `changelog.md`'s "Next up" section. The Phase 5b (player menu shell)
  and Phase 7 (satellite classes) cards are both examples of "captured, explicitly not
  built yet."
