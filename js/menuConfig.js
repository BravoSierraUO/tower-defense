// Build-menu contents as pure data — no DOM, no arcs, no slots, no knowledge of
// which renderer consumes it. Extracted from Game#buildRadialConfig() in Phase 18
// for two reasons:
//
//   1. Two renderers now share it. js/ui/radialMenu.js (Phase 9b) and
//      js/ui/bottomBar.js (Phase 18a) both consume this same array unchanged —
//      the only radial-specific fields are `flyoutRadius`/`flyoutArc`, which the
//      bar simply ignores. Keeping the data here means neither renderer owns the
//      gate logic, so "why is this leaf locked" has exactly one answer.
//
//   2. It made the logic testable. `Game` can't be constructed outside a browser
//      (its constructor builds Camera/Renderer/Input/UI, all of which touch
//      `document`), so as a Game method this was permanently untestable — see
//      docs/mobile-audit.md D3, which flagged the locked/reason matrix as "the
//      one piece of shared menu logic that can regress silently." As a free
//      function over (view, world, commandCore) it needs none of that: all three
//      are the same zero-DOM objects tests/helpers.mjs already builds. Covered by
//      tests/menuConfig.test.mjs.
//
// This follows the engine/UI split docs/architecture.md already describes: the
// data layer doesn't know about presentation, and presentation doesn't re-derive
// the data.
//
// Returned shape:
// { level1: [
//     { id, icon, label }                            // plain leaf — click calls onAction(id)
//     { id, icon, label, flyout: [ leaf, leaf... ] }  // fans out a submenu of leaves
//   ],
//   flyoutRadius, flyoutArc }                        // radial-only; the bar ignores both
//
// flyout leaf shape: { id, label, digit?, cost?, color?, locked?, reason? }
import { CONFIG } from './config.js';

// 'cyclesPerMin' -> 'cycles per min'. Room outputs are camelCase config keys;
// the drawer shows them to a player.
function humanizeOutput(key) {
  return key.replace(/([A-Z])/g, ' $1').toLowerCase();
}

// One-line subtitle for a drawer row (js/ui/bottomBar.js). Every string here is
// DERIVED from config, never invented — docs/mobile-audit.md E3 is explicit that
// the mockups' per-turret DAMAGE/RANGE cards would print three identical numbers
// and advertise a differentiation this game doesn't have. What IS real is the
// type-advantage triangle (`beats` + DAMAGE_TYPE_ADVANTAGE_MULT), so that's what
// an attacker row says. Rooms describe their tier-1 output the same way.
function describeAttacker(def) {
  const beaten = CONFIG.DAMAGE_TYPES[def.beats];
  const mult = CONFIG.DAMAGE_TYPE_ADVANTAGE_MULT;
  return beaten ? `${mult}× vs ${beaten.label} armor` : null;
}

function describeRoom(def) {
  const tier1 = def.tiers?.[0];
  const value = tier1?.[def.output];
  return value == null ? null : `+${value} ${humanizeOutput(def.output)}`;
}

// `view` is Game's 'field' | 'core'. `world`/`commandCore` are read, never mutated.
export function buildMenuConfig(view, world, commandCore) {
  const missions = { id: 'missions', icon: '?', label: 'Missions' };
  // Phase 11 UI layer: promoted from Phase 9b's "coming soon" stub now that
  // a real item/inventory system exists — opens the Inventory Menu exactly
  // the way the Missions leaf above opens the Mission Menu.
  const inventory = { id: 'inventory', icon: '?', label: 'Inventory' };
  // Phase 18a: this leaf used to flip label by view — Field "Home" (recentre the
  // camera) vs Core "Field" (leave the view) — which a fixed bar slot can't
  // express, since the slot has to mean one thing under the player's finger.
  // Resolved by *combining* rather than dropping: from the field, Base recentres
  // the camera on the base AND enters the Core, so camera-recentre keeps a home
  // (it rides along) and exiting the Core leaves you centred where you started.
  const base = { id: 'base', icon: '⌂', label: view === 'field' ? 'Base' : 'Field' };

  if (view === 'field') {
    // Phase 7a: the old single "Tower" leaf is now 3 typed attackers
    // (Railgun/Laser/Missile — CONFIG.DAMAGE_TYPES' labels), same cost/
    // stats as each other this phase, differing only in damageType.
    const towerCostNum = world.towerCost();
    const scavengerCostNum = world.scavengerCost();
    // Phase 12: locked+reason on affordability so a click while too poor explains
    // itself (radial-stub) instead of silently no-op'ing once armed and clicked
    // on the field — see the reactor confusion this same gap caused in Core view.
    const attackerLeaves = Object.entries(CONFIG.DAMAGE_TYPES).map(([type, def], i) => ({
      id: type, digit: `${i + 1}`, label: def.label, color: def.color, cost: `${towerCostNum}m`,
      desc: describeAttacker(def),
      locked: world.metal < towerCostNum,
      reason: `Need ${towerCostNum}m metal (have ${Math.floor(world.metal)}m)`
    }));
    const build = {
      id: 'build', icon: '+', label: 'Build',
      flyout: [
        ...attackerLeaves,
        {
          id: 'scavenger', digit: '4', label: 'Scavenger', cost: `${scavengerCostNum}m`,
          desc: 'Reels in corpses for metal',
          locked: world.metal < scavengerCostNum,
          reason: `Need ${scavengerCostNum}m metal (have ${Math.floor(world.metal)}m)`
        }
      ]
    };
    return { level1: [missions, inventory, base, build], flyoutRadius: 190, flyoutArc: 90 };
  }

  // Core view: same keyOrder convention as game.js's '1'-'9'/'0' shortcuts, so the
  // digit badge in each leaf still matches its keyboard key.
  // Phase 12: each room leaf carries its build cost and, when locked, a `reason`
  // (already built — one of each room, upgrade instead; missing tech; or can't
  // afford it) so the renderer can surface it as a tooltip/stub instead of the
  // leaf just silently doing nothing on click.
  const keyOrder = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const roomFlyout = Object.keys(CONFIG.ROOM_TYPES).map((type, i) => {
    const def = CONFIG.ROOM_TYPES[type];
    const unlocked = commandCore.isRoomUnlocked(type);
    // A stackable type (Reactor) is never "already built"-locked — you can keep adding.
    const builtLock = commandCore.isBuilt(type) && !def.stackable;
    const cost = commandCore.buildCost(type);
    const afford = world.gold >= cost;
    let reason = null;
    if (builtLock) {
      reason = `${def.label} already built — click it on the grid to upgrade instead`;
    } else if (!unlocked) {
      const techNode = CONFIG.TECH_TREE.find(n => n.unlocksRoom === type);
      reason = techNode ? `Requires ${techNode.label} tech` : 'Locked';
    } else if (!afford) {
      reason = `Need ${cost}g gold (have ${Math.floor(world.gold)}g)`;
    }
    return {
      id: type,
      digit: keyOrder[i],
      label: def.label,
      color: def.color,
      desc: describeRoom(def),
      cost: builtLock ? null : `${cost}g`,
      locked: !unlocked || builtLock || !afford,
      reason
    };
  });
  const build = { id: 'build', icon: '+', label: 'Build', flyout: roomFlyout };
  return { level1: [missions, inventory, base, build], flyoutRadius: 260, flyoutArc: 170 };
}
