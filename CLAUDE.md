# CLAUDE.md

Context for Claude Code (or any agent) working in this repo. See
`docs/architecture.md` for the full module map and `docs/CONTRIBUTING.md` for
the complete contributor checklist — this file is the short version an agent
should read first.

## What this is

A zero-dependency, client-side 2D simulation engine (tower-defense siege sim)
built as a testbed for deterministic state machines and docs-as-data tooling.
Native JS + Canvas 2D — no framework, no bundler, no build step, no runtime
dependencies. `npm run stats` regenerates real git-derived metrics (commits,
active hours, LOC, test density) into `stats.json` — the numbers in README.md
and the in-game About panel are computed from git history, not hand-maintained.

## Setup

No `npm install` needed for the game itself (zero deps). One-time:
```bash
npm run hooks:install   # copies scripts/hooks/pre-commit into .git/hooks/ — git doesn't version hooks
```
Serve with any static server (index.html uses `<script type="module">`, which
Chrome refuses over a bare `file://` URL):
```bash
python3 -m http.server 8000
```

## Commands

```bash
npm test                 # node --test tests/ — 226 tests, zero deps, a few seconds
npm run stats            # regenerate stats.json + index.html's inline STATS block
npm run check-roadmap    # advisory: cross-check changelog.md phases vs index.html's ROADMAP array
```

The pre-commit hook runs `gen-stats.mjs` and `check-roadmap-sync.mjs`
automatically on every commit — the latter is advisory only and never blocks.

## Before committing

- `npm test` passes, all tests, no skips.
- `game.js`, `ui.js`, `renderer.js`, and `index.html` have zero automated
  coverage (DOM/canvas-dependent). If you touch them, manually cross-check
  every `document.getElementById(...)` call still resolves against
  `index.html`'s actual ids.
- If you shipped a phase or a meaningful chunk of one, add a `changelog.md`
  entry in the existing voice: what shipped, why (if a design call was made),
  files touched. `git log` doesn't carry the "why" — changelog.md does.

## Conventions that matter

- **`config.js` is the single source of truth for tunable numbers.** Never
  hardcode a cost/rate/tier elsewhere — `balance.test.mjs` and the Command
  Core/World cost formulas all assume `CONFIG` is authoritative.
- **One-way observation, not two-way coupling.** Engine files (`world.js`,
  `combat.js`, `spawner.js`, etc.) don't know about `Profile`. `ui.js` never
  mutates gameplay state — it only translates DOM events into callbacks
  passed in by `game.js`. This is what keeps the engine importable and
  testable with zero DOM. See architecture.md's Orchestration section before
  reaching around it.
- **New "free starter" content follows `Game.placeStarters()`'s
  gate-bypassing pattern, not the constructors.** `CommandCore`/`World`
  constructors and `tests/helpers.mjs`'s `freshGame()` must stay pristine —
  dozens of tests build a fresh instance directly as a known-empty fixture.
- **No new one-off hex colors for game UI.** One shared accent (`#7ED9FF`)
  and one glass recipe across every panel. Reuse the accent at different
  opacities instead.
- **A roadmap idea not being built yet still gets filed** — a card in
  index.html's `ROADMAP` array (status `BACKLOG`/`LATER`) and a line in
  changelog.md's "Next up" section, not just discussed and dropped.

## How this repo has actually been built

Solo project, built paired with Claude Code as a daily driver rather than an
occasional assist — most commits in `git log` are `Co-Authored-By: Claude`.
The docs-as-data pages, the git-telemetry pipeline, and the roadmap/changelog
sync check were all written the same way: agent proposes, human verifies
against real repo state (`node --test`, `node scripts/gen-stats.mjs`) before
it ships. That verify-before-ship loop is the one convention that matters
more than any single rule above.
