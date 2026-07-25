# Two-Stage Economy — Design Spec

Design pass, 2026-07-25, from a working session with the user. **Nothing here is
built.** This is the spec for Phase 20 (see `index.html`'s `ROADMAP`, card
`p20`), written the same way `docs/mobile-audit.md` was written for Phase 18 —
so the build session starts from a decision record instead of re-deriving the
argument.

Sections A–E are the design, with the current code it collides with cited by
file and line. [Section F](#f-open-decisions) is the list of things that are
genuinely undecided and need the user's call before code starts. Keep the
distinction: A–E are settled, F is not.

**Origin:** the question "which currency does the HUD promote?" from Phase 18b
turned out to be unanswerable, because the two currencies aren't cleanly scoped.
Chasing that produced this, which is a bigger change than a HUD arrangement.

---

## The model

The game splits into two stages with two separate economies. This is the whole
idea; everything below follows from it.

(Called **stages**, not phases, deliberately: "Phase N" already means a
development phase everywhere else in this repo — including in this document —
and `scripts/check-roadmap-sync.mjs` scans for that exact string.)

| | Stage 1 — Idle / prep | Stage 2 — Tower defense |
|---|---|---|
| entered by | logging back in | pressing "Wave 1" |
| duration | however long you were away (battery-gated) | wave after wave until you die or flee |
| currency | **a new third resource**, accumulated offline | **salvage metal**, pulled by scavengers |
| lifetime | **persists** across sessions | **run-only** — does not survive the session |
| spent on | turrets, turret upgrade pieces | in-combat spending |
| ends with | you choosing to start a wave | death, or a voluntary flee/cancel |

Constant across both: **XP is global.** Kills pay XP into the persistent
profile, not into a per-run pool.

Gold is untouched — it stays the Command Core room currency. (The user
considers the room mechanic itself due for improvement, but explicitly ruled
that out of scope for this pass.)

### Why two economies rather than one

The prep currency is a *store* — it survives, so spending it is a real decision
you keep. Salvage metal is a *flow* — it appears during a wave and dies with it,
so spending it is a tactical decision with no opportunity cost across sessions.
Those want to be different resources because they reward different thinking, and
merging them (which is what the code does today) means neither reads clearly.

---

## A. What the codebase already supports

Worth knowing before scoping: three of the load-bearing pieces exist.

**XP is already global and persistent.** `js/profile.js` writes to
localStorage (`save()`, `:74`) and survives `Game.restart()` — `game.js`'s
constructor comment says so explicitly: the profile is the one thing that
survives restart, everything else is per-run. No work needed. The CP curve is
`LEVEL_CP_FACTOR * (n-1)^2` (`config.js:472`), so **level 2 begins at 40 CP** —
a concrete number for Section E's tutorial gate.

**One-time-unlock machinery exists, in the right shape.** `js/achievements.js`
is a sticky registry evaluated by a fixpoint loop in `profile.js`, so one unlock
can cascade into another the same tick, and `profile.js:181` persists
`badgeAt[id]` timestamps. The chest ladder in Section C is achievement-shaped,
not reward-shaped — it should follow this precedent rather than invent state.

**Completion percentage is already an honest skill signal.** `config.js:289-291`
carries a deliberate note that chest-tier `minPct` is computed from raw
`enemy.maxHealth` sums and is **never** passed through
`rewardMultiplier()`/combo/prestige, specifically so a future "+XP%" upgrade
inflates payout but never completion. That property is exactly what makes
"better prep → better chest" mean something instead of being gameable. **Keep
it.**

---

## B. Collisions — what has to change

### B1 — Salvage metal and turret-purchase metal are the same variable · BLOCKER

The central one. `world.metal` is fed by salvage (`world.js:350`,
`updateSalvage` → `addMetal`) **and** is what `placeTower()` spends. So the
currency scavengers pull in during a wave is the currency you buy turrets with.
The design needs these separate; today they are one field.

`addMetal()` has **eight** callers, not seven — an earlier draft of this document
said seven because it only grepped `world.js`. The eighth is in `spawner.js`.
Correcting it here because an undercount is exactly what bites mid-refactor:

| # | caller | what it is | routes to |
|---|---|---|---|
| 1 | `world.js:146` | idle mining / Cycle Budget accrual | **prep** — it's idle income |
| 2 | `world.js:308` | defender bonus (kill reward) | **salvage** — earned in combat |
| 3 | `world.js:350` | tractor-beam salvage | **salvage** — the definitional case |
| 4 | `world.js:396` | tutorial mission rewards | **prep** — meta/onboarding, not in-run |
| 5 | `world.js:482` | tower sell refund | **prep** — user's call, and selling is prep-only anyway |
| 6 | `world.js:534` | scavenger sell refund | **prep** — same |
| 7 | `world.js:684` | Market trade (gold→metal) | **prep** — gold-side, a Core room |
| 8 | `spawner.js:121` | wave-clear reward metal | **open** — see F6; may be replaced by chests entirely |

Seven of eight are settled. Only the wave-clear payout is open, and it's already
F6. The sell-refund answer costs nothing in exploit terms **because selling is
prep-only** (Section H) — there's no round-trip across the stage boundary to
abuse.

### B2 — Neither currency persists · BLOCKER

`world.gold` and `world.metal` are both initialised in the `World` constructor
(`world.js:27-28`), and `restart()` builds a new `World`. Both die on restart.
The prep currency has to survive, which means it lives on **`Profile`**, the only
thing that persists.

This is a structural move, not a rename, and it has to respect the existing
one-way-observation rule (`CLAUDE.md`, and architecture.md's Orchestration
section): engine files don't know about `Profile`. Today `game.js` diff-watches
counters and translates deltas into `profile.emit()` calls rather than threading
Profile through `World`. A persistent currency that `World` must *spend* pushes
against that boundary harder than anything so far, and the right seam needs
deciding before code — probably the same direction: `World` asks, `Game`
reconciles.

### B3 — No offline accrual exists at all · greenfield

There is no last-seen timestamp, no elapsed-time catch-up, nothing. The only
`Date.now()` in the engine is an achievement timestamp (`profile.js:181`). What
the code calls "idle mining" (`world.js:144`) is per-frame accrual while the tab
is open — not idle in the offline sense at all.

So "log back in with 2 hours banked" is entirely new: a persisted timestamp, an
elapsed-time computation on load, a cap, and the battery mechanic that gates how
much time counts. **Batteries are not in yet** and are a prerequisite for the
cap to mean anything.

### B4 — Mission rewards pay resources, not XP

All five tutorial missions pay `{ metal }` or `{ gold }` (`missions.js:17-28`),
routed through `world.addMetal`/gold. None pay CP. The profile gains CP only
from *events* that `game.js` diff-watches (kills, wave clears, towers placed,
rooms built, tech unlocked — `config.js:473-478`). Section E's "finish tutorial
mission 1 → reach level 2" therefore needs a new wiring: missions must be able to
grant CP.

For scale: `CP_PER_TOWER_PLACED` is 2, and level 2 needs 40 CP. So the tutorial
gate needs a deliberate CP grant, not a side effect of normal play.

---

## C. Chests — from consolation prize to progression ladder

### C1 — What chests are today

The inverse of the design, on three axes. `chestTier` is non-null **only on a
wipe** (`spawner.js:101`); a full clear returns `chestTier: null` and pays the
full bundle. Tier is set by how much of the wave you killed *before the base
went down* (bronze 0%, silver 34%, gold 67% — `config.js:296-300`), and the
multipliers scale payout **down** (0.25 / 0.5 / 0.75), so a chest is always
worse than clearing. And it repeats forever: every wipe pays again, with no
memory of what you've already earned. `spawner.lastChestTier` (`:19`) is
transient and rebuilt with the Spawner each run.

| axis | today | designed |
|---|---|---|
| trigger | failure only (wipe) | success, graded by performance |
| repeatability | every time, forever | **one-time per (wave, tier)** |
| role | softens a loss; always < a clear | progression ladder rewarding prep |

### C2 — The designed behaviour

- A chest is awarded for **completing** a wave, at a tier set by performance.
- Each tier is a **one-time unlock**. Already have bronze on wave 1? Clearing
  wave 1 at bronze again pays **nothing**. Beating it at silver pays the silver
  unlock.
- **Losing pays nothing.** That is the punishment: no chest, back to idle mode,
  build and upgrade, try again. The run does not end in a game-over sense —
  it returns you to Stage 1.
- Unlock state persists on `Profile`, following the achievements precedent
  (A above).

### C3 — What this does to wave replay, and the way out

`triggerReplay(n)` exists explicitly as reward-only farming — replays
deliberately don't feed `wavesCleared` (`spawner.js:129-132`), which is what
drives progression. Under one-time chests, replaying a wave whose tiers you've
already unlocked pays **nothing**, so replay loses its entire purpose.

The clean resolution falls out of the two-phase model: **replay still pays
run-scoped salvage metal; chests stay one-time.** Salvage is use-it-or-lose-it,
so farming it can't inflate anything persistent. Replay stays useful for the
combat economy without touching progression. The user's own read — "no point in
repeating cleared missions unless you just HAVE to have that little bit of XP" —
is correct about XP, and this keeps a second, non-corrosive reason.

---

## D. Base health becomes per-session

Because TD is now a discrete phase, base health stops being a persistent run
resource:

- Base **starts every TD session at 100%**.
- When the session ends, base health **regenerates back up**.
- Max base HP becomes **upgradeable via base parts** — a Stage 1 prep purchase.
  **Not in yet.**

`js/base.js` already sets `health = maxHealth = CONFIG.BASE_HEALTH` (100) in its
constructor, and a fresh `Base` is built with each `World` — so a *fresh* base at
100% already happens on restart. What's new is the reset happening per TD session
rather than per run, and `maxHealth` coming from an upgradeable value rather than
the constant.

**Consequence worth deciding on:** this largely retires the base-repair button.
`world.repairBase()` with `BASE_REPAIR_GOLD_PER_HP: 2` / `BASE_REPAIR_AMOUNT: 20`
(`config.js:326-327`) exists to spend gold recovering HP mid-run. If HP resets
free every session, paying gold for 20 HP is close to pointless. Either it goes,
or it becomes an *in-session* emergency heal paid for in salvage metal — which
would actually give salvage a second sink and fits the flow-vs-store split.
Listed in F.

---

## E. XP gates — giving level a job

The user's note that there are currently no XP gates is exactly right, and it's
stronger than it sounds: **nothing in the game is level-gated at all.** A grep
for level comparisons finds two hits, both in `achievements.js` (`:10` Reach
Level 3, `:35` Reach Level 20) — those are *rewards for* leveling, not gates
*on* content. Level's only mechanical effect anywhere is
`BASE_PASSIVE_INCOME_PER_LEVEL: 0.05` gold/sec (`config.js:313`).

So player level is currently near-inert, and XP gates would give it its first
real job.

Designed shape, centred on the tutorial: **finish tutorial mission 1 → enough XP
to reach player level 2 → that unlocks "the next thing."** Level 2 is 40 CP
(`LEVEL_CP_FACTOR * (2-1)^2`), so mission 1's CP grant should be tuned to land
there deliberately — see B4, missions can't grant CP yet.

What "the next thing" is per gate is not specified and is the interesting part;
it's the first item in F.

---

## F. Open decisions

Needs the user's call. Listed roughly in the order they block work.

1. ~~**What does each XP gate unlock?**~~ **PARTIALLY ANSWERED 2026-07-25.** The
   full ladder waits on the tutorial spec — the user's read is that the gates
   "will be more clear" once gameplay is correct and the tutorial gets its own
   pass, which is right; a gate ladder designed before the thing it gates is
   guesswork. Two illustrative examples given, neither built: **"market exchange"
   available to build at level 5**, **"hero hangar upgrade" not available until
   level 25**. Enough to fix the *shape* — gates are level thresholds on
   buildable/upgradeable content, spread from early (5) to long-tail (25) — so
   the mechanism can be built against real examples. The list itself is
   downstream of the tutorial work.
2. ~~**Is a "TD session" one wave, or a run of several?**~~ **ANSWERED
   2026-07-25: a run of several.** A TD session is **wave after wave until you
   die, or flee/cancel.** See [Section G](#g-the-td-session-answered) — this has
   more consequences than it looks, including one new mechanic and one direct
   conflict with `MAX_WAVES`.
3. **Name of the third resource**, and what the HUD calls it. This is what
   unblocks Phase 18b's promoted-stat question, which is where this all started.
   Also the last thing blocking the currency half of the `addMetal()` split —
   routing is decided (B1's table), but the destination pool has no name. And it
   is now bigger than a label: [J3](#j3--three-different-things-would-be-called-metal)
   found **three distinct things that would all be called "metal"** (the existing
   currency, `ORE_LOOT_TABLE`'s common-roll key, and the new run-only salvage),
   plus the design's own "idle gets metal" which actually maps to the rare-ore
   stream. Cheap to rename now; expensive once the HUD, chest table and upgrade
   costs all reference them.
9. ~~**Does salvage carry into prep?**~~ **RESOLVED 2026-07-25 — neither reading
   was right.** The in-run spend is salvage (temporary ×1.10); the *prep* spend is
   **gold / manufactured parts** and raises the permanent base. So salvage never
   leaves the run, and "same rule spend 10 salvage" describes the ×1.10 shape
   *recurring each run on a higher base* — not prep paying in salvage. See
   [Section I](#i-the-multiplicative-stat-chain). One qualification: starting
   salvage can be seeded per-run by a room or base upgrade (J4), which is a
   capped, gold-bought head start rather than salvage persisting.
4. **Does the base-repair button survive?** See D — retire it, or repoint it at
   salvage metal as an in-session emergency heal.
5. ~~**What do chests actually contain?**~~ **ANSWERED 2026-07-25:** components
   and materials, with a tier-scaled chance of a fully assembled engine —
   bronze 90/10, silver 75/25, gold 50/50. See [J2](#j2--gaps-and-theyre-small).
   Not a currency lump, which was the right instinct: a one-time unlock paying
   currency would be strictly worse than paying something otherwise
   unobtainable.
6. **Where do the existing wave-clear rewards go?** `computeRewards()` pays gold
   *and* metal on a full clear (`spawner.js:92-99`), plus module charges and
   production parts. Under the split, which pool receives them, and does a clear
   still pay a currency at all if the chest is the reward?
7. **How is idle time capped, and how do batteries gate it?** Batteries are the
   prerequisite (B3) and don't exist. Without a cap, offline accrual is
   unbounded.
8. **Does the prep currency have a cap** like `goldCap()`/`metalCap()` do, and
   is it Command-Core-upgradeable the way Storage raises the gold cap?

---

## G. The TD session (answered)

F2's answer — a session is waves 1..N until death or a voluntary exit — settles
several things that were left hanging, and opens two new ones.

### What it settles

- **Base health resets at SESSION start, not per wave.** Damage accumulates
  across waves within a session; that accumulation is the pressure that makes a
  long run tense and eventually ends it. Regen happens when the session ends.
  (Section D said "per session" already; this confirms which meaning.)
- **Salvage metal persists across waves within a session** and dies at session
  end. So it's a within-session flow: it compounds while you survive, which is
  what makes an emergency spend mid-session a real decision.
- **Chests are per WAVE, banked as you go.** Clearing waves 1-4 then dying on 5
  means you keep the four chests already earned. "Lose and you get no chest"
  applies to *the wave you died on*, not the session — which makes the punishment
  proportionate rather than all-or-nothing, and matters a lot for how a long run
  feels. Worth stating because the one-line version ("you lose, you don't get the
  chest") reads harsher than the model actually is.
- **Fleeing keeps what you banked.** You completed those waves; the chests are
  already unlocked. Salvage still dies — it always dies.

### G1 — Flee/cancel is a new mechanic · greenfield

There is no way to voluntarily end a run today. A grep for flee/abandon/retreat
finds nothing. The only exits are the base being destroyed and hitting
`MAX_WAVES`. So "or flee/cancel" is new work: a player-facing exit, presumably
confirmed (`js/ui/confirmModal.js` already exists and is the right component),
that ends the session, banks the chests, discards the salvage, and returns to
Stage 1.

It also needs a decision on *when* it's allowed — mid-wave, or only between
waves? Mid-wave flee is a get-out-of-death-free card if it's unrestricted: you'd
flee the instant a wave looks unwinnable and lose only the salvage you were going
to lose anyway. Between-waves-only makes committing to a wave meaningful. Leaning
between-waves-only, but it's a real call.

### G2 — `MAX_WAVES: 20` and the `'won'` state now conflict · needs a decision

"Wave after wave until you die" is an endless framing. The code is not endless:
`MAX_WAVES: 20` (`config.js:120`), and `spawner.js:137` checks
`!this.isReplay && this.waveNumber >= CONFIG.MAX_WAVES` to end the run — which
sets `Game.state = 'won'`, the win banner, and the "Play Again" flow.

Three ways out, not decided:
1. **Endless.** Retire `MAX_WAVES` and the `'won'` state; the session ends only
   by death or flee. Cleanest fit with the stated model, but it deletes the only
   win condition the game has, and Phase 8a already retired `'lost'` — retiring
   `'won'` too means the game has no terminal state at all, which is a real
   design position (idle games often don't) but should be chosen, not drifted
   into.
2. **Keep 20 as a milestone**, not a terminus — clearing it awards something
   notable and the session continues.
3. **Keep the win**, and accept that "until you die" has an implicit "or until
   wave 20".

This is the one item in Section G that blocks code: whether `finalizeWave()`
still has a terminal branch changes its shape.

---

## H. Stage separation — you touch nothing during a run

Added 2026-07-25 from the user: **during a TD run there is no building and no
selling.** The flow is prep → run → die/flee → prep. Their framing: "we're
sneaking two games into one — idle has its own life, TD has its own life, but the
variables for that life come from idle life."

This is the constraint that makes the two economies real rather than cosmetic. It
also does most of the work of preventing exploits: with no mid-run sell, a
persistent-currency refund can't be laundered into a run, which is why F5's
sell-refund answer is safe.

### H1 — Built 2026-07-25 (`0.1.65`)

`World.tdRunActive`, with `beginTdRun()` / `endTdRun()` and a single
`canModifyDefenses()` predicate that `placeTower`, `placeScavenger`,
`sellTowerAt` and `sellScavengerAt` all check. On `World`, not `Game`, so the
gate is enforced where the mutation happens and no UI or input path can route
around it. 14 tests (`tests/stageGate.test.mjs`).

Deliberately **not** the same thing as `spawner.state`: a run spans many waves, so
the spawner sitting at `'idle'` between wave 3 and wave 4 is still mid-run — the
exact case a `spawner.state === 'idle'` check would get wrong. There's a test
pinning that.

Three things it deliberately does **not** gate, each with a test recording why:
`placeStarterScavenger` (Game's onboarding guarantee, bypasses every gate by
design), turret upgrades (pending H2's two-ladder model), and metal accrual —
scavengers must keep pulling salvage in while you're locked out of building, or
the run has no economy at all.

### H2 — Turret upgrades are two separate ladders

From the user, and explicitly *not* required immediately:

- **In-run**, spend salvage → raise DPS / range / fire rate for **this run only**.
  You die, they're gone.
- **In prep**, upgrade individual stats (DPS, fire rate) **permanently**, to
  prepare for the next run.

`Tower` currently has a single `tier` (1-3, `CONFIG.TOWER_TIERS`) that
`upgradeTower` bumps by spending metal (`world.js:564`). This model needs it split
into a **persistent base** and a **run-scoped modifier that resets** — two tracks,
not one ladder with a different price. That's the structural piece, and it's why
upgrades are currently left ungated: gating them without the split would just
disable in-run upgrading rather than make it temporary.

### H3 — Death has to be reintroduced · blocks H1's wiring

"Wave after wave until you die" requires dying, and **you currently cannot.**
Phase 8a removed it deliberately: `spawner.finalizeWave()` heals a destroyed base
back to full (`spawner.js:137`) and pays a lesser chest, and `game.js:449-454`
states outright that the only run end is `MAX_WAVES`, always a win — `'lost'` is
dead as a `Game.state` value.

So Phase 20 reverses a Phase 8a design decision. Worth recording as a reversal
rather than letting it look like a fix, and it resolves a dangling side effect
that card already admits: `achievements.js`'s `lessons-learned` badge ("lose a
run") has been **unearnable since Phase 8a** for exactly this reason. Putting
death back makes it earnable again.

This is why H1 ships unwired. Gating builds before a run can end would leave a
player permanently unable to build after wave 1 — a hard regression. The gate,
death, and flee all land together.

---

## I. The multiplicative stat chain

The upgrade model (H2) needs one new factor in a chain the codebase **already
has**, not a new mechanism. That's the maintainability answer.

`CONFIG.TOWER_TIERS` is already multiplicative — `damageMult`, `rangeMult`,
`fireRateMult`, `healthMult` — applied in `Tower.applyTier()` as
`damage = CONFIG.TOWER_DAMAGE * t.damageMult`. Phase 11 then added a *second*
multiplicative factor: `affixMultiplier(item, stat)`, consumed by
`Tower.effectiveDamage()` / `effectiveFireRate()` / `effectiveRange()` and read by
`combat.js` (`:52`, `:139`, `:144`).

So the designed chain is:

```
effective(stat) = BASE × persistentMult × itemAffixMult × runMult
                         ↑ prep-bought    ↑ Phase 11,     ↑ NEW — salvage-bought,
                           (gold/parts)     already live     resets every run
```

The user's own example resolves cleanly: base 5, spend salvage → `runMult` 1.10 →
5.5 for that run. Die, `runMult` resets to 1. Prep-upgrade the persistent factor so
base reads 6 → next run, 6 × 1.10 = 6.6.

**Why a multiplier and not a stat edit:** resetting is a one-liner — set every
turret's `runMult` back to 1 at run end. No snapshot, no restore, no path by which
a temporary buff leaks into permanence. That property is the entire reason to
model the temporary thing this way.

### I1 — The one real refactor here

The persistent factor is currently a **discrete 3-entry tier table**, but the
design wants per-stat upgrades (raise DPS specifically, or fire rate
specifically). So `Tower.tier` → per-stat persistent multipliers. Contained to
`applyTier()` and `upgrade()`/`canUpgrade()`, but it does touch
`CONFIG.TOWER_TIERS`, `TOWER_POWER_CONSUMPTION` (indexed by tier), the upgrade
modal, and `world.towerUpgradeCost()`. Not hard; not a one-liner either.

---

## J. Itemization and the chest loot table

The user's loop: idle collects raw material → processing turns it into components
("gears", "wiring", "anything else") → a mission chest pays either components or,
at some chance, a **fully assembled "engine"** that improves DPS → back at base you
can build an engine yourself, and either path rolls a green/blue/gold rarity.

### J1 — Phase 11 already built almost all of this

Checked against source, not assumed:

| designed | already in code |
|---|---|
| raw material from idle | `inventory.ore` = `fancyMetal`/`platinum`/`diamonds`, fed by `orePerSecond()` |
| "processing" into gears/wiring | `REFINED_RECIPES`: `alloy` ← fancyMetal, plus `circuitWire`, `prismaticCoil` |
| assembled "engine" | `COMPONENT_RECIPES.motor` — **the recipe already exists** |
| "engine improves DPS" | `AFFIX_POOL` has `damage` → `damageMult` 0.03–0.08, and `Tower.effectiveDamage()` **already applies it** in combat |
| green/blue/gold rarity | `RARITY_TIERS` — grey/green/**gold** (see J2) |
| rarity chance at craft time | `rollItemRarity()`, with Foundry's `rarityBonusPct` already shifting weight out of grey |

So "an engine that improves DPS" is a `motor` with a `damage` affix, and it is
**functional today** — nothing needs wiring for the stat to bite. The affix pool's
own comment says it "only rolls and stores" affixes pending a consumer, but that's
stale for the combat stats: damage, fireRate, range and cooldown are all consumed.

### J2 — Gaps, and they're small

1. **No blue rarity.** `RARITY_TIERS` is grey (70) / green (25) / gold (5). The
   design says green/blue/gold. One entry plus a weight rebalance — but note the
   config comment claims the current three are "exactly the language the user
   asked for," so this is a *change of mind*, worth recording as one rather than
   looking like a bug.
2. **Chests don't drop items at all.** `computeRewards()` pays scaled gold + metal
   (`spawner.js:92-109`). The tier-scaled materials-vs-engine split is new — but
   `ORE_LOOT_TABLE` is already a tier-indexed weighted table, so it's a pattern to
   copy, not invent:

   | chest | components | assembled engine |
   |---|---|---|
   | bronze | 90% | 10% |
   | silver | 75% | 25% |
   | gold | 50% | 50% |

   This also **answers F5** (what one-time chests contain): items and materials,
   not a currency lump. Which is the right shape — a one-time unlock paying a
   currency lump would be strictly worse than paying something you can't get
   another way.

### J3 — ⚠️ Three different things would be called "metal"

The naming collision that has to be resolved, and it's why F3 matters more than a
label:

1. **`world.metal`** — the existing currency that buys turrets.
2. **`ORE_LOOT_TABLE`'s `metal` key** (80/72/65 weight) — the common roll, meaning
   "nothing rare this tick." Never enters `inventory.ore`, which only holds
   `fancyMetal`/`platinum`/`diamonds`.
3. **"salvage metal"** — the new run-only currency.

Plus the design's own "idle gets metal", which from J1 maps to the *rare ore*
stream (`fancyMetal` etc.), not to `world.metal`. Four uses, three meanings. Any
one of them can be renamed cheaply right now; none can be renamed cheaply once the
HUD, the chest table and the upgrade costs all reference them.

### J4 — Starting salvage: room vs. base upgrade

The design offers both: a "salvage room" holding e.g. 50 salvage to start a run
with, or a base upgrade granting 10/20/30.

**The room version needs zero new machinery** — `ROOM_TYPES` entries already carry
`{ output, tiers: [...] }` and `commandCore.totals()` sums them generically, so a
Salvage Bay with `tiers: [{startingSalvage:10}, {…20}, {…30}]` would work, gold-gated
and tier-scaled like every other room.

**But `ROOM_TYPES` is at a hard cap of 10 and `tests/balance.test.mjs:229` enforces
it**, because `game.js`'s number-key selector addresses exactly `'1'`–`'9'`,`'0'`.
That guard exists because the bug already happened once (v1.5: inserting `mine`
shifted every later room and left Dock unreachable). An 11th room breaks a tested
invariant.

So the **base-upgrade route is cheaper**, and it pairs naturally with the base-parts
max-HP upgrade Section D already wants — one "base upgrades" surface covering HP
and starting salvage.

Worth noting the cap is softer than it was: Phase 18a's drawer is a scrollable
list, so displaying 10+ entries no longer depends on digit keys. The limit is now
only about keyboard shortcuts. Raising it is a deliberate decision with a test to
update, not a silent break.

---

## Explicitly out of scope

- **The Command Core room mechanic.** The user considers it due for improvement
  and ruled it out of this pass by name. Gold and rooms are untouched here.
- **Phase 19 (Core as a modal).** Separate concern, separate card — though if
  both land, they touch the same view/phase structure and should be sequenced
  together rather than in parallel.
- **Rebalancing.** Every number in this document is a current value being cited,
  not a proposed one. The difficulty curve has been waiting on a playtest pass
  since Phase 4c and this doesn't jump that queue.
- **The v2.36 dev stash.** `STARTING_GOLD`/`STARTING_METAL` are still at 10000
  with 100k caps for play-testing (`config.js:276`, `:341`, both flagged REVERT).
  Any economy work has to revert those first or it's tuning against a fiction.

---

## Suggested build order

Dependency-ordered, not by size.

| # | Work | Why here |
|---|---|---|
| 0 | Revert the v2.36 dev stash | Everything below is meaningless against a 10k stash |
| 1 | Answer F3 (resource name) and G2 (`MAX_WAVES`/`'won'`) | Both structural; guessing means rework. F2 is now answered — see Section G |
| 2 | Audit `addMetal()`'s seven callers, split into two pools (B1) | The blocker. Pure engine work, fully unit-testable |
| 3 | Move the prep currency onto `Profile` (B2) | Needs the seam decision; touches the observation boundary |
| 4 | Base health per-session + upgradeable max (D) | Small, self-contained, needs F4 answered |
| 5 | Chest ladder → one-time unlocks on `Profile` (C) | Follows the achievements precedent; needs F5 |
| 6 | Missions grant CP + the first XP gate (B4, E) | Needs F1's unlock list to be worth anything |
| 7 | Flee/cancel exit + session boundaries (G1) | Needs the mid-wave-vs-between-waves call; ConfirmModal already exists |
| 8 | Offline accrual + batteries (B3) | Largest greenfield piece; nothing else depends on it |

Steps 2 and 3 are where the risk is: they touch `world.js` (696 lines, the
biggest file) and the `Profile` boundary. Both are also the most testable work in
the phase — `world.js` has real coverage, unlike the UI layer Phase 18 lived in.
