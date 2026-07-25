# Mobile / Small-Screen Audit

Findings pass 2026-07-24; **partially built 2026-07-25** — see
[Build status](#build-status-2026-07-25) for exactly what shipped and what
didn't. This is the working reference for Phase 18 (see `index.html`'s
`ROADMAP`, cards 18a/18b/18c).

The findings below are left in their original present tense even where the item
has since been fixed, rather than rewritten into the past — the same convention
Phase 5b's roadmap card already sets for stale-but-honest historical records.
The build-status table is the current-state answer; sections A–E are what was
found on the 24th.

Sections A–D are the audit proper: what is broken, read out of the source.
[Section E](#e-design-reference--the-2026-07-24-mockups) was added the same day
and is a different kind of thing — design intent, worked out against two
external mockups in `docs/mockups/`. Keep the distinction: A–D are findings,
E is a proposal.

**Trigger:** a laptop player with no scroll wheel had no way to zoom. That
turned out to be the visible tip of a broader thing: the game has never been
laid out for anything but a wide desktop window with a three-button mouse.

## Method, and what it's worth

Every finding below is read out of the source — file and line are cited, and
the line numbers were checked at the time of writing. Where a number is
computed rather than observed (minimum layout widths especially) it says so
and shows the arithmetic. **Nothing here was measured in a real browser at a
real viewport size.** The Chromium path this repo uses for live verification
(`require('playwright').chromium.launch()` + `python3 -m http.server`, per
changelog's v2.4 correction) is the right way to confirm the layout numbers,
and it hasn't been run for this pass. Treat severities as reasoned, not
observed.

> **Update, 2026-07-25 — the browser pass has now been run.** Playwright was
> already a devDependency; only the Chromium binary was missing. 51 live checks
> across a 1440×900 desktop, a 375×667 DPR-3 phone and an 820×1180 DPR-2 tablet.
> Two audit numbers came back different, and one bug existed that no amount of
> source-reading would have found:
>
> | claim | computed | measured | verdict |
> |---|---|---|---|
> | `.hud-top` minimum width (C1) | ~1600px | **~1690px** | worse than estimated; still the right diagnosis |
> | mode-hint contribution (C2) | ~465px | see C2 note | the arithmetic was right about the string, wrong about which string |
>
> The measured `.hud-top` breakdown at 1920px: `.hud-left` 905px + `.hud-center`
> 420px + `.hud-right` 261px = 1586px of content, plus 56px padding and 48px
> margins ≈ **1690px minimum**. So C1 *understated* the problem by ~90px, and
> its conclusion — wider than a 1366×768 or 1440×900 laptop — holds with more
> room to spare than claimed. `.hud-right` measured only 261px *after* the dead
> mode hint was deleted, which is consistent with C2's ~465px estimate for the
> element itself.
>
> The bug source-reading missed: `.bar-slot-primary:hover:not(:disabled)` is
> specificity (0,3,0) and beat the new `.bar-slot.open` (0,2,0), so an open
> drawer's own slot kept a translucent wash while taking the filled state's
> `--page-bg` text — dark-on-pale in dark mode, light-on-pale in light. Since
> opening a drawer means clicking the slot, the pointer was always hovering it:
> **the broken state was the only state.** Found by asserting computed
> `backgroundColor`, not by reading CSS and not by looking at a screenshot. That
> is the argument for this section's own recommendation, made concrete.

## Severity key

| | meaning |
|---|---|
| **BREAKS** | a feature is unreachable or unusable — not cosmetic |
| **DEGRADES** | works, but badly enough to be the reason someone quits |
| **ROUGH** | noticeably unpolished, no functional loss |

---

## A. Foundations

### A1 — No viewport meta tag · BREAKS
`game.html` has no `<meta name="viewport">`. `index.html:5` has one; the game
page never got it.

Without it, mobile Safari/Chrome render at a **980px assumed CSS width** and
scale the whole page down to fit. Every fix elsewhere in this document is
invisible until this exists, because the browser never tells the page it's
narrow — media queries would evaluate against 980px and pass.

**Fix:** one line in `game.html`'s `<head>`:
`<meta name="viewport" content="width=device-width, initial-scale=1">`.
Do this first; it's the precondition for testing anything else.

Worth pairing with `user-scalable` left *enabled* — browser pinch-zoom is a
real accessibility affordance, and the game's own zoom is camera zoom, not
page zoom. They don't conflict.

### A2 — Zero media queries · DEGRADES
`css/style.css` is 1710 lines with **no `@media` blocks at all**. Every
dimension in it is a fixed pixel value chosen for a wide window.

`index.html` (the docs page) has four (`:103`, `:150`, `:167`, `:195`) — so
the pattern exists in this repo, just never in the game's stylesheet.

**Fix:** not a single change — this is the vehicle for most of section C. Pick
two breakpoints and commit to them rather than adding one-off queries per
component. Suggested, matching what the layout actually needs:
- `≤900px` — HUD restructure, panels go full-width
- `≤600px` — phone layout, single column

### A3 — No devicePixelRatio handling · DEGRADES
`js/main.js:5-8`:
```js
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
```
The canvas bitmap is sized in CSS pixels, and no CSS rule sets a separate
layout size, so bitmap and layout size are 1:1. On a DPR-2 phone every drawn
pixel is upscaled 2×; on DPR-3, 3×. All the canvas text (`11px monospace` room
labels, `9px monospace` rush hints in `renderer.js:96`) turns to mush.

**Fix:** the standard shape — set `canvas.width/height` to
`innerWidth * dpr`, pin `canvas.style.width/height` to the CSS px values, and
`ctx.scale(dpr, dpr)` once per resize.

⚠️ **This one has teeth.** `camera.js` (`:29-30`, `:38-39`, `:48`) and
`renderer.js` (`:37`, `:46-47`, `:132`) and `starfield.js` (`:23-24`, `:37-38`)
all read `canvas.width`/`canvas.height` directly and assume it means CSS
pixels. If the bitmap grows by `dpr` and those aren't updated in lockstep,
`screenToWorld` / `screenToCoreCell` desync from what's drawn and **every
click lands in the wrong place.** Either route all of them through a
`Renderer#viewportSize()` that returns CSS px, or scale the context and leave
the reads alone. Don't half-do it — this is the highest-risk item in the
document and deserves its own commit plus a click-accuracy check.

### A4 — No resize debounce, and resize loses nothing but also fixes nothing
`js/main.js:9` rebinds on every `resize` event. That's fine functionally
(canvas resize is cheap here), but note mobile browsers fire `resize`
constantly during URL-bar show/hide scroll. Worth knowing before adding
layout recalculation to that handler. Low priority — flagged so it isn't a
surprise later.

---

## B. Input

### B1 — Zoom is wheel-only · BREAKS (this is the reported bug)
`js/camera.js:22-26` is the only code in the repo that changes `this.zoom`,
and its sole trigger is `input.wheelDelta`. There is no keyboard zoom:
`KEYBIND_ACTIONS` (`js/keybindings.js:12-17`) has exactly four entries, all
pan. No `+`/`-`. No pinch. No buttons.

A trackpad *does* emit `wheel` events, so it isn't literally unreachable on a
laptop — but `ZOOM_SPEED: 0.001` (`js/config.js:7`) is tuned for discrete
mouse-wheel notches, and trackpad deltas arrive with very different magnitude
and momentum. Whichever of those the player actually hit, they had no
alternative path.

**Fix, three parts, all cheap:**
1. `Camera#zoomBy(factor)` — extract the existing clamp
   (`ZOOM_MIN 0.3` … `ZOOM_MAX 3`) so something other than `update()` can
   drive zoom. This is the prerequisite for the bottom-bar zoom buttons.
2. Two entries in `KEYBIND_ACTIONS` (`zoomIn`/`zoomOut`, defaults `=`/`-`)
   plus `CONFIG.DEFAULT_KEYBINDINGS`. The merge-over-defaults in
   `loadKeybindings()` already handles players with saved bindings from
   before the actions existed — that's exactly the case its comment
   (`keybindings.js:19-21`) was written for, so this costs nothing.
3. Pinch-to-zoom for touch — see B2.

### B2 — Input layer is mouse-only · BREAKS on touch
`js/input.js` is 45 lines and binds exactly four events: `wheel`, `mousemove`,
`click`, `contextmenu`.

`click` does fire on touch (browsers synthesize it, ~300ms delayed without a
viewport meta — see A1), so tapping *mostly* works by accident. But:
- **No pinch-zoom** — no `touchstart`/`touchmove`, so no gesture handling.
- **No touch pan.** Panning is WASD only (`camera.js:15-18`). There is no
  drag-to-pan on any device, mouse included. On a phone with no keyboard, the
  field view **cannot be panned at all.**
- **`input.mouse` never updates on touch** — it's only written by `mousemove`
  (`input.js:22-26`).

**Fix:** a pointer-events pass. `pointerdown`/`pointermove`/`pointerup`
supersede the mouse trio and unify mouse+touch+pen. Drag-to-pan and
two-finger-pinch-to-zoom both fall out of it. Keep the existing `wheel`
handler as-is.

⚠️ Drag-to-pan and tap-to-place **compete for the same gesture.** Needs a
movement threshold (~10px) plus a time threshold before a pointerdown counts
as a drag rather than a tap, or every attempted pan places a tower. Design
this deliberately; it's the part most likely to feel bad if rushed.

### B3 — Right-click features are unreachable on touch · BREAKS
`js/game.js:413-429`. Three actions exist **only** behind `contextmenu`:

| action | line | touch equivalent |
|---|---|---|
| Sell tower / scavenger (60% refund) | `game.js:417` | none |
| Rush an unfinished room build for gold | `game.js:425` | none |
| Install a module on a finished room | `game.js:426` | none |

Selling is the worst of the three — it's the only way to undo a misplacement,
and misplacement is *more* likely on touch, not less.

Note also that "right-click: rush {n}g" is **drawn into the canvas**
(`renderer.js:96`) as instructional text. On a touch device that's an
instruction for an input that doesn't exist.

**Fix:** these all need a non-right-click path regardless of the menu work.
Cleanest is to route them through the Upgrade Modal that already opens on
tower click (`game.js:369-371`, Phase 11) — it's the natural home for "sell
this", and rooms need an equivalent tap-target panel. Long-press is the other
option but it's less discoverable and fights B2's drag threshold.

### B4 — The Build flyout opens on hover · DEGRADES
`js/ui/radialMenu.js:62` binds `mouseenter` to fan out the Build submenu.
Click is wired as the fallback (`:57-60` → `activateLevel1` → `showFlyout`),
and the code comment at `game.js`-adjacent docs calls this the touch path — so
this one was actually thought about. It works.

It's listed because hover-as-primary is why the radial reads as
desktop-native, and because the replacement bottom bar shouldn't inherit it.

### B5 — Ghost placement preview is hover-dependent · DEGRADES
`renderer.js:472-473` (`drawFieldGhost`) and `renderer.js:110-124` (Core
hover-cell outline) both early-return without `mouse`, and `input.mouse` only
moves on `mousemove` (B2).

On touch, arming a build type gives **no preview at all** — no ghost, no
range circle, no red-tint invalid-placement feedback (`renderer.js:480-483`),
no dashed cell outline. You tap blind, and Phase 16 deliberately built that
red-tint feedback because placement zones are non-obvious.

**Fix:** on touch, the model has to change from hover-preview to
tap-to-preview-then-confirm, or drag-to-position-then-release. Not a
one-liner — this is a genuine interaction redesign and probably the second
hardest item here after A3.

### B6 — Number-key shortcuts have no touch equivalent · ROUGH
`game.js:325-337`. Keys 1–4 (field) and 1–9/0 (Core) arm build types
directly. No keyboard, no shortcuts. Not a break — the menu covers the same
ground — but it means touch users lose the fast path entirely, and the digit
badges rendered in each menu leaf (`radialMenu.js:101`) become meaningless
decoration.

Worth deciding: hide the digit badges when the input is touch, or leave them.
Leaving them is defensible (they teach the desktop shortcut). Just be
deliberate.

> **Decided 2026-07-25: the badges stay, on every input.** Hiding them would mean
> sniffing input type purely to *remove* information, and a touch player who
> later picks up a keyboard has then never been shown the shortcut exists. They
> cost one 21px chip per row. `tests/menuConfig.test.mjs` also now asserts the
> badge order matches `game.js`'s `fieldKeyOrder`/`keyOrder`, so the two can't
> drift into the badge telling a player the wrong key — which was the real risk
> here, not the badge's presence.

### B7 — Escape is the only universal cancel · ROUGH
`game.js:308-318` — Escape closes every menu and disarms every build type.
It's the documented universal-cancel and it has no touch equivalent.

The bottom bar helps here implicitly (a visible armed-state indicator with a
tap-to-cancel affordance), but it should be an explicit requirement of 18a,
not a hoped-for side effect.

---

## C. Layout

### C1 — `.hud-top` cannot fit a laptop, let alone a phone · DEGRADES (badly)
`css/style.css:136-147`:
```css
.hud-top{ position:absolute; left:24px; right:24px; top:24px; height:92px;
          display:flex; align-items:center; justify-content:space-between;
          padding:0 28px; }
```
No `flex-wrap`. It holds three groups (`game.html:24-148`):

- **`.hud-left`** — 9 stat blocks (SCORE, GOLD, METAL, MODS, PARTS, POWER,
  WAVE, TECH, LEVEL; MODS and PARTS start `hidden` but unhide during play),
  5 dividers, plus the combo and brownout badges.
- **`.hud-center`** — fixed `width:420px` (`style.css:205-206`), no
  `flex-shrink:0`.
- **`.hud-right`** — mode hint, ABOUT, DOCS, FPS, avatar.

**Estimated minimum width ≈ 1600px** — 9 stats at ~60px plus dividers ≈ 600,
center 420, right ≈ 650 (see C2), plus 56px padding and 48px margins. That is
**wider than a 1366×768 or 1440×900 laptop.** Since nothing sets
`flex-shrink:0`, the failure mode isn't clean overflow — it's every child
squeezing at once into overlapping, truncated text.

This is the "I don't like the top menu" instinct being correct for a
measurable reason, not just taste. *(Estimate, not measured — confirm in a
browser before quoting the number anywhere public.)*

**Fix direction (Phase 18b):** this is a restructure, not a media query. The
honest framing is that nine always-visible stats is a desktop-dashboard
decision. Candidates: promote 3–4 stats to always-visible and move the rest
behind a tap-to-expand tray; or split into a compact top strip (resources)
and fold WAVE/TECH/LEVEL into the existing panels that already show them.
Not decided here — 18b is filed unscoped on purpose.

### C2 — The mode hint is a dead 460px element · ROUGH
`game.html:119` renders a hardcoded 62-character string:
`"Avatar menu (top right) → Command Core · Profile · About · Settings"`
at `font-size:12px; letter-spacing:1px` (`style.css:369-373`) ≈ **~465px wide**,
the single largest contributor to `.hud-right`.

`js/ui.js:37` assigns `this.modeHint = document.getElementById('ui-mode-hint')`
and **nothing ever writes to it.** It's a dead reference to a static string.

> **Correction, 2026-07-25.** That last claim was wrong, and wrong in an
> interesting way. `ui.js:83` *did* write to it — every frame, inside `update()`:
>
> ```js
> this.modeHint.textContent = 'Avatar menu (top right) → Account · Settings · Inventory · Base · About';
> ```
>
> So it wasn't an unwritten reference; it was a constant reassigned 60×/second.
> And note the string differs from the one hardcoded in `game.html:119`
> ("Command Core · Profile · About · Settings"), so the markup's version never
> rendered at all — the JS overwrote it on the first frame. The element was
> displaying a *different* dead string than the audit quoted.
>
> This mattered for the fix: deleting the markup alone would have left
> `ui.js:37`'s `getElementById` returning `null` and `ui.js:83` throwing on the
> first frame — taking the whole game down. Three sites, not one. Verdict:
> conclusion right (delete it), reasoning wrong, and the wrong reasoning would
> have produced a crash. **Shipped 2026-07-25** — all three sites plus the now-dead
> `.hud-mode-hint` CSS rule.

**Fix:** free win. Deleting it reclaims ~30% of the top bar's width for
nothing. It reads like a leftover from before the avatar menu was
discoverable on its own. Do this in 18b — or honestly, sooner; it's
independent of everything else.

### C3 — Command Core grid is unreachable on narrow screens · BREAKS
`js/config.js:118-119`: `CORE_GRID_SIZE: 8`, `CORE_CELL_SIZE: 64` → a fixed
**512px** grid. `renderer.js:46-47` centers it:
```js
const originX = (this.canvas.width - cell * gridSize) / 2;
```
On a 375px-wide phone that's `(375 - 512) / 2 = -68.5`. The grid hangs 68px
off **both** edges.

And there is no recovery: `game.js:434` gates the camera on field view —
```js
if (this.view === 'field') this.camera.update(...);
```
— so the Core view has **no pan and no zoom, on any device.** Columns 0 and 7
are permanently unreachable below ~520px of viewport width. `screenToCoreCell`
(`:51-57`) will happily return those cells; you just can't tap them.

**Fix:** make `cell` responsive in `coreLayout()` — derive it from
`min(canvas.width, canvas.height) / (gridSize + margin)`, clamped to a
touch-usable floor (~44px). Because `coreLayout()` is *already* the shared
source for both `drawCore()` and `screenToCoreCell()` (its comment at `:41-42`
says exactly why), fixing it in one place keeps draw and hit-test in sync
automatically. That's a genuinely well-placed seam — this fix is much smaller
than it looks.

### C4 — Radial menu clamps itself into a useless middle · DEGRADES
`js/ui/radialMenu.js:46-48`:
```js
const margin = LEVEL1_RADIUS + (config.flyoutRadius || 0) + 40;
```
Core view: `85 + 260 + 40 = 385px` of required margin **on each side**. Below
~770px viewport width the clamp collapses to a single point and the menu
opens dead-center regardless of where you tapped; below ~520px the fan
extends off-screen anyway.

Field view is better but not good: `85 + 190 + 40 = 315px`, so ~630px.

Largely mooted by the bottom bar becoming the default — but the radial
survives as a setting, so it still wants a small-screen answer (shrink radii
below a breakpoint, or refuse to be the default when the viewport can't hold
it).

### C5 — Side panels have no max-width · DEGRADES
Both `.tower-card` (`style.css:521-528`) and `.core-panel` (`:568-575`) are
`position:absolute; right:24px; bottom:130px; width:260px` with **no
`max-width`**. At 375px wide, a 260px panel plus 24px offset leaves 91px of
visible game. Both are `pointer-events:none`, so they can't be dismissed —
they just sit there.

`.mission-banner` (`:1635-1645`) is the same shape: `left:24px; top:132px;
width:300px`, no max-width, and `top:132px` assumes `.hud-top` ends at 116px
(`top:24` + `height:92`) — an assumption C1's restructure will invalidate.

Note the modals **already do this right** — `.menu-modal` (`:685-687`),
`.confirm-modal` (`:1433-1435`) and `.wave-panel` (`:1466-1468`) all carry
`max-width:calc(100% - 48px)`. So the convention exists in this file; these
three surfaces just predate it. Cheap, consistent fix.

### C6 — Bottom 130px is already reserved dead space · *opportunity, not a bug*
`.tower-card` and `.core-panel` both sit at `bottom:130px`. That clearance is
a leftover from the Phase 9 build bar that Phase 9b deleted — nothing has
occupied it since.

**The new bottom action bar drops into it without moving a single existing
panel.** Worth knowing before anyone budgets time for layout reshuffling in
18a.

### C7 — Sub-11px type throughout · ROUGH
~20 rules at `font-size:11px`, plus `10px` (`:757`, `:910`), `9px` (`:1160`,
avatar level badge) and `8px` (`:330`, `.ability-label`). Canvas text goes
down to `9px monospace` (`renderer.js:96`).

Under 12px is below most mobile legibility guidance, and it compounds with A3
(no DPR scaling) — small *and* upscaled-blurry. Phase 8b's card explicitly
calls itself "an accessibility build, not polish… the user flagged difficulty
seeing small sleek upgrade buttons," so this is a known-and-stated concern
that the type scale never got.

**Fix:** a minimum-size floor at the narrow breakpoint rather than a global
bump — the desktop density is deliberate and worth keeping.

### C8 — Win/lose banner will overflow · ROUGH
`.ui-banner` (`style.css:595-604`): `font-size:40px; letter-spacing:3px;
padding:24px 44px`, centered, no max-width. "VICTORY"/"DEFEAT" at that size
plus 88px horizontal padding overflows a 375px screen. Cosmetic, trivial,
listed for completeness.

### C9 — `.hud-avatar-menu` is right-anchored at fixed width · ROUGH
`style.css:1166-1177`: `width:190px`, `right:0`, `top:calc(100% + 10px)`.
Fine as long as the avatar stays top-right; will need revisiting if 18b moves
it. Flagged as a dependency of C1, not a standalone problem.

---

## D. Cross-cutting

### D1 — `.ui-overlay` is `pointer-events:none` with children opting in
`style.css:66-70`. Every interactive child must set `pointer-events:auto`
itself — `.radial-slot` does (`:448`), `.hud-center` does (`:207`, and its
comment records that this was caught by a real Playwright click-through, not
code review: *"without this, nothing in here is clickable"*).

**The new bottom bar must set it too**, or it swallows canvas clicks across
the entire bottom strip while being unclickable itself. Cheap to get wrong,
annoying to debug — the codebase has already paid for this lesson once.

### D2 — `[hidden]` cascade trap
`style.css:7-16` — a global `[hidden]{display:none !important}` exists
specifically because author `display:flex` rules kept beating the UA default.
The comment lists four separate elements this bit before it was fixed
globally, and notes the rule **must stay early in the file**.

Any new component with `display:flex` inherits this hazard. Don't add a local
`[hidden]` override; the global one already handles it.

### D3 — Zero automated coverage on everything this touches
Per `CLAUDE.md`: `game.js`, `ui.js`, `renderer.js` and the HTML have no tests.
Phase 18 touches all of them plus `input.js`, `camera.js`, `main.js`.

Two things are genuinely testable and currently aren't:
- **`buildRadialConfig()`** (`game.js:175-246`) returns pure data with zero
  DOM — locked/reason correctness across afford gates, tech gates, and the
  `stackable` Reactor exemption. This is the one piece of menu logic that can
  regress silently, and it's the piece both menu renderers will share.
- **`Camera#zoomBy()`** (once B1 extracts it) — clamp behaviour at both ends.

Adding these *before* the menu work makes 18a's refactor safe rather than
hopeful. Recommended as the actual first commit.

> **Update, 2026-07-25 — done, but the first item needed more than a rename.**
> The audit called `buildRadialConfig()` "pure data with zero DOM", which is true
> of the *function body* and misleading about the *call*: it was a method on
> `Game`, and `Game`'s constructor builds Camera/Renderer/Input/UI, all of which
> touch `document`. `new Game()` throws under `node --test`, so no test could
> reach the method however pure its body was.
>
> Fixed by extracting it to `js/menuConfig.js` as a free function over
> `(view, world, commandCore)` — the three objects `tests/helpers.mjs`'s
> `freshGame()` already builds with zero DOM. `Game#buildMenuConfig()` is now a
> one-line delegation. That's a better seam than the rename the roadmap card
> proposed, and it's the reason **22 tests** exist here now instead of none.
> `Camera#zoomBy()` got **22 more** (`tests/camera.test.mjs`), including that the
> wheel path still behaves exactly as it did. Suite: 226 → **270**, all passing.

### D4 — Docs that go stale the moment this ships
- `index.html:367` — the Primitives lede counts "twelve different surfaces"
  and names "the radial build menu" explicitly. A thirteenth surface makes
  that copy wrong on a portfolio-facing page.
- `index.html:984-1012` — the `radialbuild` WhatHow flow documents the
  current path end to end. That page's stated rule is shipped-only, no
  maybes, so it needs updating in the same pass, not after.
- `renderer.js:96` — canvas-drawn "right-click: rush {n}g" text (B3).
- `game.html:119` — the dead mode hint (C2).

---

## E. Design reference — the 2026-07-24 mockups

Added after the audit above was written. Two bottom-bar layouts, generated
independently by GPT and Gemini (`docs/mockups/`, provenance and caveats in
that directory's README). They are illustrations, not specs — read them for
layout and information architecture, and for nothing else. Everything in
section E is still design intent, not built.

### E1 — What the convergence is worth

The two were produced independently and landed on the same structure:

- a **five-slot bottom bar**, exactly the slots 18a already specified from the
  user's own description — zoom · inventory · **build** · base · zoom, with
  build centred and visually dominant;
- the **active slot filled/highlighted** rather than outlined;
- a **drawer anchored above the bar**, with a caret pointing down at the slot
  that opened it — not a modal, not a centred overlay;
- a **top HUD reduced to three stats**, each a pill with icon, value, and a
  progress bar underneath;
- everything else — about, docs, settings — **folded behind an avatar or
  hamburger** at the edge of the top bar.

Two independent generators reaching for the same shape is weak evidence that
the shape is conventional, which is the point: this layout is what players
already know. It is not evidence that it is right *for this game*, and section
E3 lists where it plainly isn't.

Note also that the three turret names in both mockups (Laser / Missile /
Railgun) match `CONFIG.DAMAGE_TYPES`' three labels exactly. That is coincidence
— they are the genre-standard three — but it does mean the images read as this
game more than they should be trusted to.

### E2 — What they settle

**The drawer is a vertical list.** Decided against GPT's horizontal card row,
on a constraint the mockups could not have known: the drawer has to serve
**both views**. Field build has four leaves (three damage types + Scavenger),
but Core build has **nine** (`CONFIG.ROOM_TYPES`). Three wide stat cards do not
extend to nine without a second row, a scroll, or a different component — and
needing a different component per view defeats the shared-`buildMenuConfig()`
seam that makes 18a cheap. A vertical list of rows takes nine as readily as
three and survives a 375px screen. Gemini's row shape — icon with a cost badge
overlaid, label, one-line description — also maps cleanly onto the leaf data
that already exists (`{ id, label, digit, cost, color, locked, reason }`), with
`reason` as the natural subtitle on a locked row. That is the strongest
argument of the lot: the list wants exactly the fields the config already
returns.

**The drawer anchors to its slot, not to the screen.** Both mockups draw the
caret. It gives the armed-state feedback 18a requires almost for free — an open
drawer visibly belongs to a lit slot — and it means the same component can
later hang off Inventory or Base without redesign.

**The top three stats are POWER, GOLD, BASE HP** — as a starting hierarchy for
18b, not a final answer, and with one correction in E3. Two of the three are
already bar-shaped in the DOM: `#ui-power-fill` in `.hud-left` and
`#ui-base-fill` in `.hud-center` both already render a `.ui-bar-track` +
`.ui-bar-fill` pair. The mockups' "pill with a bar underneath" is close to what
POWER already looks like, so this is less new construction than it appears.

**The overflow destination already exists.** Both mockups fold the secondary
chrome behind a single edge control. This repo already has that control and
that menu: `#avatar-btn` opens `#avatar-menu` with Command Core / Profile /
About / Settings / Report a Bug / Reset. So ABOUT (`game.html:122`), DOCS
(`:124`) and the FPS readout (`:126-128`) have somewhere to go that needs no
new component — ABOUT is *already duplicated* there (`#menu-about`), so that
one is a straight deletion of the top-bar copy.

### E3 — Where they are wrong about this game

Recorded so the build session does not import them by accident. The full list
is in `docs/mockups/README.md`; these are the two that change design decisions
rather than just visuals.

**Single currency.** Both HUDs show one gold resource. This game has two, and
they are not interchangeable: towers cost **metal** (`CONFIG.TOWER_COST` 40,
`SCAVENGER_COST` 25), rooms cost **gold**. A three-stat HUD built literally
from the mockups would hide the currency the field build menu spends, which is
worse than the nine-stat bar it replaces. Either METAL joins the promoted set
(making it four) or the promoted set becomes view-sensitive — metal in field
view, gold in Core view. The second is more interesting and matches how the
drawer already changes contents by view, but it is an open call.

**Per-turret stat blocks.** GPT's cards show distinct DAMAGE and RANGE per
turret. Phase 7a's comment (`game.js:186-188`) is explicit that the three
attackers have "same cost/stats as each other this phase, differing only in
damageType." Building that card today prints the same two numbers three times
and advertises a differentiation the game does not have. The one-line
description Gemini uses ("Rapid, energy beam") is the honest version — it can
describe the type-advantage triangle (`DAMAGE_TYPE_ADVANTAGE_MULT`), which *is*
real and *is* the actual difference, without implying stat variance that isn't.

### E4 — What they still don't answer

The three decisions 18a flagged as forced by the five-slot shape survive the
mockups untouched:

1. **"Base" means two different things.** Both mockups show a fixed BASE label
   with an HQ-ish icon, which reads as the enter/exit-Core toggle — but neither
   was aware the leaf currently flips label by view (`game.js:181`, Field
   "Home" = recentre camera, Core "Field" = exit). They illustrate the toggle
   reading without arguing for it, and camera-recentre stays homeless either
   way.
2. **Missions is gone from the bar** in both. Consistent with 18a's own
   conclusion, still a real removal rather than an oversight — Phase 8f's other
   two entry points (banner click, "?" button) have to carry it.
3. **Empty-canvas click in bar mode** is not something a still image can show.
   Unresolved.

> **Resolved 2026-07-25, by the user, in the build session:**
>
> 1. **Base = recentre AND enter the Core.** The user's call, and it dissolves
>    the "camera-recentre is homeless" problem instead of accepting it: the two
>    actions are *combined* rather than one being dropped. Entering the Core
>    recentres on the way in, so leaving it puts you back at the base rather than
>    wherever you'd panned off to. In the Core the slot reads "Field" and exits.
>    One id (`base`), one meaning per view.
> 2. **Missions stays off the bar** — unchanged, as filed.
> 3. **Deselect only**, with the radial's click-to-open preserved in radial mode.
>    So Phase 9b's thesis isn't overwritten, it's scoped to the setting that
>    still wants it.
>
> The user also raised a **fourth** point the mockups couldn't: that the Core
> being a whole second *view* is itself the problem, and it likely wants to be a
> modal instead — "I feel like the 'secondary view' creates problems in our UI."
> Deliberately not acted on this session; filed as its own roadmap card
> (`p19`, BACKLOG · NOT SCOPED) rather than folded into 18a, because it's an
> architectural change to `Game#view`, not a menu change.

Add one more the mockups create: Gemini puts the avatar **top-left** with a
level ring, GPT keeps it **top-right** inside the stat pod. The repo's
`.hud-avatar-menu` is `width:190px; right:0` (`style.css:1166-1177`) and
`#avatar-level-badge` already exists, so top-right is materially cheaper and
top-left would require the C9 fix. Not a reason to rule it out — a reason to
price it.

---

## Build status (2026-07-25)

Steps 0–4 of the order below shipped in one session. Steps 5–9 did not.

| item | severity | status |
|---|---|---|
| A1 viewport meta | BREAKS | **shipped** |
| B1 wheel-only zoom | BREAKS | **shipped** — `Camera#zoomBy()`, `=`/`-` keybindings, and two bar buttons |
| C3 Core grid unreachable | BREAKS | **shipped** — responsive cell in `coreLayout()`, 44px floor; measured reachable at 375px |
| C2 dead mode hint | ROUGH | **shipped** (three sites — see the C2 correction) |
| C5 panel max-widths | DEGRADES | **shipped** |
| C7 sub-11px type | ROUGH | **shipped at the ≤600px breakpoint only** — desktop density deliberately unchanged |
| C8 banner overflow | ROUGH | **shipped** |
| A2 zero media queries | DEGRADES | **shipped** — the two breakpoints (≤900px, ≤600px) now exist and are committed to |
| D1 pointer-events on new chrome | — | **respected** — verified by live hit-test, not by reading CSS |
| D3 untested menu logic | — | **shipped** — 44 new tests, see the D3 update |
| 18a bottom bar + `menuStyle` | — | **shipped** |
| B3 right-click-only sell/rush/module | BREAKS | **NOT DONE** — still no touch path |
| B2 pointer events / drag-pan / pinch | BREAKS on touch | **NOT DONE** |
| B5 touch placement preview | DEGRADES | **NOT DONE** |
| A3 devicePixelRatio | DEGRADES | **NOT DONE** — still the highest-risk item |
| C1 / 18b HUD restructure | DEGRADES (badly) | **NOT DONE** — and now measured at ~1690px, worse than estimated |
| C4 radial clamp on small screens | DEGRADES | **NOT DONE** — mooted in bar mode (the default), still real in radial mode |
| B6 digit badges on touch | ROUGH | **decided, not removed** — badges stay; see B6 |
| A4 resize debounce | — | not done, still just flagged |
| C9 avatar menu anchoring | ROUGH | not needed yet — avatar stayed top-right |

**What this means for a phone player today:** the build menu, zoom, Core-grid
reachability and panel layout all work. The field still **cannot be panned**
(B2), towers still **cannot be sold** (B3), and arming a build type still gives
**no placement preview** (B5). So the game is navigable on a phone but not yet
really playable on one. That's three BREAKS-or-worse items away, all of them
deliberately sequenced after this session because two of them need interaction
design calls rather than code.

## F. Found in play-testing v2.38 (2026-07-25)

Not part of the original audit — things the user hit actually playing the build,
recorded here because they are the evidence base for 18b.

### F1 — `.hud-center` overflows its panel vertically · DEGRADES
Distinct from C1's horizontal squeeze, and it happens *even with horizontal room
to spare.* `.hud-top` is a fixed `height:92px`; `.hud-center` stacks a
"BASE INTEGRITY" label, the bar, a "100/100" readout and the "Wave 1 ▾" button,
which together exceed 92px. Result in a real screenshot: the label is clipped off
the **top** edge and the button hangs out below the **bottom** border.

Fixing C1's flex behaviour will not fix this on its own — the height is the
constraint.

### F2 — GOLD/METAL values wrap mid-number at ~1100px · DEGRADES
Reproduction width for C1's "every child squeezes at once" failure mode: at
~1100px the values break to three lines ("10000 /" / "100000"), overflowing the
panel top and bottom. C1 estimated the minimum at ~1600px and it measured at
~1690px, so this is consistent — this is just what it looks like below it.

### F3 — ABOUT is duplicated · ROUGH
Confirmed as C2/E2 predicted: the top-bar `#about-btn` and the avatar menu's
`#menu-about` do the same thing. Straight deletion of the top-bar copy.

### F4 — the FPS readout should be a debug *setting*, not HUD furniture · ROUGH
The user's framing is broader than relocating it: a debug affordance shouldn't be
attached to the HUD at all. There is already a **Settings > Debug** section
holding the show-field-grid checkbox (`#grid-checkbox`, localStorage
`td.showGrid`), so this needs no new component and no new pattern — an `fps` flag
beside it, read the same "Game peeks at a public field on a ui.js panel" way,
with `#ui-fps` hidden unless it's on. Removes one more item from the top bar and
puts both debug aids in one place.

### F5 — the base compound was a square · fixed same session
Not a small-screen issue, listed for completeness because it shipped in the same
version. The Phase 16 base ring was built as a square from a literal reading of
"+/- 5 in each direction"; the intended model is radial. Now a true annulus —
see changelog v2.38 item (8). The inner edge was already circular, so the square
was the inconsistent half.

---

## Suggested build order

Ordered by dependency, not by severity — each step unblocks the next.
Steps 0–4 are done (2026-07-25); 5–9 remain.

| # | Work | Why here |
|---|---|---|
| 0 | Viewport meta (A1) + delete dead mode hint (C2) | Two lines, zero risk, and A1 gates all testing |
| 1 | Tests for `buildRadialConfig()` (D3) | Makes step 3's refactor safe |
| 2 | `Camera#zoomBy()` + zoom keybindings (B1) | Fixes the actual reported bug, standalone |
| 3 | Rename to `buildMenuConfig()`/`handleMenuAction()`, bottom bar, `menuStyle` setting (18a) | The headline — build it to section E's vertical-list drawer |
| 4 | Panel max-widths (C5) + Core grid responsive cell (C3) | Both small, both self-contained |
| 5 | Pointer events: drag-pan + pinch-zoom (B2) | Bigger; needs the gesture-threshold design call |
| 6 | Non-right-click paths for sell/rush/module (B3) | Depends on 5's threshold work |
| 7 | DPR handling (A3) | Highest risk — isolate it, verify click accuracy |
| 8 | HUD restructure (18b) | Has a starting hierarchy now (E2) but not a decision — see E3's two-currency problem |
| 9 | Touch placement preview (B5) | Genuine redesign, deliberately last |

Steps 0–2 are ~an hour and deliver the reported fix. Step 3 is the session's
real target.

## Explicitly out of scope

- **Phase 10 (Mobile Companion)** is a *different thing* and its card
  (`index.html:818-824`) rules this out by name: it is "explicitly NOT a
  mobile port of the real-time build/combat loop." Phase 18 is that port.
  They don't overlap and neither supersedes the other.
- **PWA / installability** — mentioned in passing in Phase 10's note, still
  has no card of its own. Not part of 18.
- **Landscape/portrait orientation lock** — no opinion formed yet.
- **Rebalancing for touch** (bigger placement tolerances, slower waves). Real
  question, but downstream of the difficulty-curve work that's been blocked
  on a playtest pass since Phase 4c.
