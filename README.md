# Deterministic 2D Simulation Engine & Graph Observability Framework

A zero-dependency, fully client-side simulation engine and self-documenting
observability toolchain. **12,000+ lines** of native Vanilla JS + Canvas 2D —
no framework, no build step, no runtime dependencies. Rendered as a
real-time siege simulation, but engineered as a testbed for deterministic
state machines, high-throughput agent routing, and docs-as-data tooling.

> **203 passing tests · 0 dependencies · 0 failures**

**Live:** https://bravosierrauo.github.io/tower-defense/ · **Play the sim:** [`game.html`](https://bravosierrauo.github.io/tower-defense/game.html)

---

## ⚡ At a Glance

| Metric | Value |
|--------|-------|
| **Runtime dependencies** | `0` (native JS + Canvas 2D only) |
| **Automated tests** | `203` passing via `node --test`, zero failures |
| **Engine source** | `4,995` lines |
| **Test coverage density** | `49%` test lines per engine line |
| **Total codebase** | `12,000+` lines |
| **Commits** | `55` across `5` focused build sessions |
| **Build velocity** | full engine + tooling in `~26` active engineering hours |

---

## 🧠 Engine Architecture

A deterministic, tick-based simulation core. Given identical seed + input,
the engine reproduces identical state every run — the property that makes
the whole system testable without mocks or a DOM.

- **Deterministic tick loop** — fixed-step state advancement; every frame is
  reproducible from the same inputs.
- **Autonomous agent system** — hundreds of concurrent agents with independent
  lifecycle, targeting, and state transitions, resolved per tick.
- **Custom pathfinding & routing** — hand-rolled routing over a static grid
  with no external graph libraries.
- **Real-time state mutation** — high-frequency state changes applied against a
  single authoritative store, with zero framework overhead in the hot path.
- **Persistent nested subsystems** — a second interior grid (the "Command Core")
  runs its own state machine, layered economy, tech tree, achievements, and
  prestige/reset loop on top of the primary simulation.

## 📊 Data-Driven Documentation Pipeline

Architecture docs are **data, not diagrams**. Flows, logic lanes, state
machines, and dependency graphs are declared as structured arrays (`FLOWS`)
and auto-rendered by a single lightweight internal engine — so the docs never
drift from the system, and adding a new flow is one array entry, not a redraw.
This observability page is the site's landing page ([`index.html`](https://bravosierrauo.github.io/tower-defense/)).

- Docs-as-data: architectural truth lives in code, rendered on demand.
- Single rendering engine → consistent visual language across every diagram.
- Zero manual diagram maintenance.

## 🔬 Automated Git Analytics Engine (`scripts/gen-stats.mjs`)

A standalone telemetry pipeline that parses raw `git` history to compute
real engineering metrics — no third-party analytics.

- Reconstructs **active development sessions** by clustering commit timestamps.
- Computes **time-tracking offsets**, LOC deltas, and commit cadence.
- Derives the **test-to-engine line-density ratio** used in this README.
- Emits `stats.json` and hot-refreshes the observability page in one pass.

```bash
node scripts/gen-stats.mjs
# → wrote stats.json + refreshed index.html
#   (55 commits, 12,864 lines, ~25.9h across 5 sessions/5 days)
```

## ✅ Test Fidelity

`203` tests run natively on `node --test` — no Jest, no Vitest, no config.

```bash
node --test tests/
# tests 203
# pass  203
# fail  0
```

Coverage spans combat resolution, economy, spawner logic, inventory,
mission state, command-core interior, balance invariants, and profile
persistence — the volatile subsystems where determinism matters most.

## 🚀 Run It

```bash
git clone https://github.com/BravoSierraUO/tower-defense
cd tower-defense
# No install step. Open index.html for the observability page, game.html to play, or:
node --test tests/          # run the suite
node scripts/gen-stats.mjs  # regenerate telemetry
```

## 🧱 Design Philosophy

1. **Zero dependencies** — every line is auditable; nothing rots in a lockfile.
2. **Determinism first** — reproducible state is what makes 203 tests possible.
3. **Docs as data** — documentation that can't drift from the code.
4. **Measure everything** — the repo reports its own build telemetry.

---

*Built by Bruce Smith · [bravosierra2017@gmail.com](mailto:bravosierra2017@gmail.com)*
