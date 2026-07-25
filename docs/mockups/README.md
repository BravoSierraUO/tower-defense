# UI Mockups — Phase 18

Reference images for the Phase 18 responsive/touch pass. Both were generated
2026-07-24 by asking GPT and Gemini, independently, for a bottom-action-bar
layout — a way to see the shape before building it instead of iterating in code.

| file | source |
|---|---|
| `2026-07-24-gpt-bottom-bar.jpg` | ChatGPT |
| `2026-07-24-gemini-bottom-bar.jpg` | Gemini |

Downscaled to 1200px / ~160KB each. The 4MB originals are not in the repo.

## What these are for

**Layout and information architecture only.** Read them for slot order, panel
anchoring, and stat hierarchy. Do not read them for art direction, numbers, or
colour — see below.

The analysis of what they settle and what they get wrong is
[mobile-audit.md § E](../mobile-audit.md#e-design-reference--the-2026-07-24-mockups).
That section, not this file, is the one the build session should work from.

## Do not copy from these

Both are illustrations of a *different, more conventional* tower-defense game
than this one. Specifically:

- **The art.** Rendered 3D turret portraits and painted terrain. This game draws
  geometric shapes on a 2D canvas with zero dependencies and no asset pipeline.
  There are no turret images and none are planned.
- **The numbers.** `$120`/`$150`/`$250`/`$400` are invented, and the two mockups
  disagree with each other on the laser. Real costs are `CONFIG.TOWER_COST` (40)
  and `CONFIG.SCAVENGER_COST` (25), and they are **metal, not gold**.
- **The per-turret stats.** All three attackers currently share `towerCost()`
  and differ *only* in `damageType` (Phase 7a). A card showing DAMAGE and RANGE
  per type would print three identical numbers.
- **The damage-type colours.** `CONFIG.DAMAGE_TYPES` already assigns them, and
  the mockups roughly invert it — plasma/Missile is violet `#B24BFF` here, not
  orange; kinetic/Railgun is grey-blue `#8FA6B8`, not violet. The existing
  values were chosen against real rendering constraints (the comment at
  `config.js:45-48` records a violet-over-red visibility check). Keep them.
- **The single currency.** Both show one gold-coin resource. Towers cost metal,
  rooms cost gold. A HUD that drops metal hides the currency the field build
  menu actually spends.
