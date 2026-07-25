# Deterministic 2D Simulation Engine & Graph Observability Framework

A zero-dependency, fully client-side simulation engine and self-documenting
observability toolchain. **<!--S:totalLines-->20,285<!--/S:totalLines--> lines** of native Vanilla JS + Canvas 2D —
no framework, no build step, no runtime dependencies. Rendered as a
real-time siege simulation, but engineered as a testbed for deterministic
state machines, high-throughput agent routing, and docs-as-data tooling.

> **<!--S:tests-->335<!--/S:tests--> passing tests · 0 dependencies · <!--S:testFails-->0<!--/S:testFails--> failures**

**Live:** https://bravosierrauo.github.io/tower-defense/ · **Play the sim:** [`game.html`](https://bravosierrauo.github.io/tower-defense/game.html)

---

## ⚡ At a Glance

| Metric | Value |
|--------|-------|
| **Runtime dependencies** | `0` (native JS + Canvas 2D only) |
| **Automated tests** | `<!--S:tests-->335<!--/S:tests-->` passing via `node --test`, zero failures |
| **Engine source** | `<!--S:engineLines-->6,273<!--/S:engineLines-->` lines |
| **Test coverage density** | `<!--S:density-->64%<!--/S:density-->` test lines per engine line |
| **Total codebase** | `<!--S:totalLines-->20,285<!--/S:totalLines-->` lines |
| **Commits** | `<!--S:commits-->71<!--/S:commits-->` across `<!--S:sessionCount-->8<!--/S:sessionCount-->` focused build sessions |
| **Build velocity** | full engine + tooling in `~<!--S:activeHours-->30.2<!--/S:activeHours-->` active engineering hours |

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
# → wrote stats.json + refreshed index.html/README.md
#   (build <!--S:build-->72<!--/S:build-->, <!--S:commits-->71<!--/S:commits--> commits, <!--S:totalLines-->20,285<!--/S:totalLines--> lines, <!--S:tests-->335<!--/S:tests--> tests,
#    ~<!--S:activeHours-->30.2<!--/S:activeHours-->h across <!--S:sessionCount-->8<!--/S:sessionCount--> sessions/<!--S:activeDays-->7<!--/S:activeDays--> days)
```

Every number in this README sits between `<!--S:key-->` markers and is rewritten
by that same command — including the numbers in this section. Nothing here is
hand-maintained, which is the point: it went stale at `203 tests / 55 commits`
while the repo was at more than half again that, because it used to be.

## ✅ Test Fidelity

`<!--S:tests-->335<!--/S:tests-->` tests across `<!--S:testFiles-->19<!--/S:testFiles-->` files run natively on
`node --test` — no Jest, no Vitest, no config.

```bash
node --test tests/
# tests <!--S:tests-->335<!--/S:tests-->
# pass  <!--S:pass-->335<!--/S:pass-->
# fail  <!--S:testFails-->0<!--/S:testFails-->
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
2. **Determinism first** — reproducible state is what makes <!--S:tests-->335<!--/S:tests--> tests possible.
3. **Docs as data** — documentation that can't drift from the code.
4. **Measure everything** — the repo reports its own build telemetry.

---

*Built by Bruce Smith · [bravosierra2017@gmail.com](mailto:bravosierra2017@gmail.com)*
