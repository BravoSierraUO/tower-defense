// Phase 15: enemy-class registry (pure data) — the seed of a future in-game/doc lookup
// page (not built yet, data only). One entry per CONFIG.DIFFICULTY_TIERS key, so `id`
// always matches a real tier's key exactly. `shape` drives renderer.js's drawEnemies();
// `description` is qualitative on purpose (no healthMult/speedMult numbers quoted) so it
// can't drift if balance numbers change later — CONFIG.DIFFICULTY_TIERS stays the one
// source of truth for actual stats, this file is descriptive/render data only.
export const ENEMY_CLASSES = [
  { id: 'easy', name: 'Scout', shape: 'circle',
    description: 'The backbone of every early wave — fast to spawn, quick to drop. Shows up from wave 1 and never really goes away.' },
  { id: 'medium', name: 'Marauder', shape: 'square',
    description: 'Tougher and a touch quicker than a Scout. Enough health to shrug off a stray shot or two before it drops.' },
  { id: 'hard', name: 'Juggernaut', shape: 'triangle',
    description: 'The heaviest hitter in the roster and the fastest of the three — worth focusing down before it reaches anything.' },
];
