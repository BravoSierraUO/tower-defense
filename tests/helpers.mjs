import { CommandCore } from '../js/commandcore.js';
import { World } from '../js/world.js';
import { Profile } from '../js/profile.js';

// Only config.js/room.js/commandcore.js/world.js/combat.js/base.js/enemy.js/
// tower.js/spawner.js/profile.js have no DOM dependency — camera/renderer/ui/
// input/game touch `document`/canvas and aren't unit-testable outside a browser.
// `profile` defaults to a fresh (unskilled) one — pass one in to test how
// prestige skill bonuses feed into World's gold/build formulas.
export function freshGame(startingGold, profile = new Profile()) {
  const commandCore = new CommandCore();
  const world = new World(commandCore, profile);
  if (startingGold !== undefined) world.gold = startingGold;
  return { commandCore, world, profile };
}

// Ticks commandCore.update AND world's own systems together, the same
// pairing game.js does each frame once `state === 'playing'`.
export function tick(world, commandCore, dt, steps = 1) {
  for (let i = 0; i < steps; i++) commandCore.update(dt);
}

// Fast-forward a room past its build timer without needing real seconds.
export function finishBuild(room) {
  room.buildTimeRemaining = 0;
}
