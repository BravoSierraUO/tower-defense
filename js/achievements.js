// Phase 4: achievement registry (pure data), ported from the sister project's pattern. Each
// entry: {id, name, hint, icon, tier, test(profile, ev)}. tier drives the CP
// bonus on unlock (CONFIG.PROFILE.TIER_CP). `profile` is Profile#snapshot();
// `ev` is {type, data} — the event that just fired. Tested on every emit via
// Profile#checkAchievements's fixpoint loop; once earned it sticks for good
// (no sister-project-style prestige re-earn here — see profile.js's prestige() notes).
export const ACHIEVEMENTS = [
  // ---- common: you'll trip over these ----
  { id: 'first-blood', name: 'First Blood', hint: 'Land your first kill', icon: '🎯', tier: 'common', test: (p) => p.life.kills >= 1 },
  { id: 'getting-warm', name: 'Getting Warm', hint: 'Reach Level 3', icon: '🔥', tier: 'common', test: (p) => p.level >= 3 },
  { id: 'foothold', name: 'Foothold', hint: 'Build your first Command Core room', icon: '🏗️', tier: 'common', test: (p) => p.life.roomsBuilt >= 1 },
  { id: 'dug-in', name: 'Dug In', hint: 'Place 5 towers', icon: '🗼', tier: 'common', test: (p) => p.life.towersPlaced >= 5 },
  { id: 'wave-five', name: 'Getting Started', hint: 'Clear wave 5', icon: '🌊', tier: 'common', test: (p, e) => e.type === 'waveClear' && e.data.wave >= 5 },
  { id: 'centurion', name: 'Centurion', hint: 'Land 100 lifetime kills', icon: '💯', tier: 'common', test: (p) => p.life.kills >= 100 },
  { id: 'breakthrough', name: 'Breakthrough', hint: 'Unlock your first tech node', icon: '🔬', tier: 'common', test: (p) => p.life.techUnlocked >= 1 },

  // ---- special: a bit of effort ----
  { id: 'wave-ten', name: 'Halfway There', hint: 'Clear wave 10', icon: '🌊', tier: 'special', test: (p, e) => e.type === 'waveClear' && e.data.wave >= 10 },
  { id: 'sharpshooter', name: 'Sharpshooter', hint: 'Land 500 lifetime kills', icon: '🎯', tier: 'special', test: (p) => p.life.kills >= 500 },
  { id: 'fortress', name: 'Fortress', hint: 'Place 20 towers', icon: '🏰', tier: 'special', test: (p) => p.life.towersPlaced >= 20 },
  { id: 'full-house', name: 'Full House', hint: 'Build 5 Command Core rooms', icon: '🏭', tier: 'special', test: (p) => p.life.roomsBuilt >= 5 },
  { id: 'researcher', name: 'Researcher', hint: 'Unlock all 5 tech nodes', icon: '🧪', tier: 'special', test: (p) => p.life.techUnlocked >= 5 },
  { id: 'skill-investor', name: 'Skill Investor', hint: 'Buy your first skill', icon: '📈', tier: 'special', test: (p, e) => e.type === 'skillBought' },
  { id: 'survivor', name: 'Survivor', hint: 'Reach wave 15', icon: '🛡️', tier: 'special', test: (p, e) => e.type === 'waveClear' && e.data.wave >= 15 },
  { id: 'lessons-learned', name: 'Lessons Learned', hint: 'Lose a run — every fall teaches the next climb', icon: '💀', tier: 'special', test: (p, e) => e.type === 'runEnd' && !e.data.won },

  // ---- epic: real commitment ----
  { id: 'unscathed', name: 'Unscathed', hint: 'Win a run with the base above 90% health', icon: '✨', tier: 'epic', test: (p, e) => e.type === 'runEnd' && e.data.won && (e.data.baseHealthPct || 0) >= 0.9 },
  { id: 'champion', name: 'Champion', hint: 'Win a full run', icon: '🏆', tier: 'epic', test: (p, e) => e.type === 'runEnd' && !!e.data.won },
  { id: 'veteran', name: 'Veteran', hint: 'Land 1,000 lifetime kills', icon: '⚔️', tier: 'epic', test: (p) => p.life.kills >= 1000 },
  { id: 'well-oiled', name: 'Well-Oiled Machine', hint: 'Max out any skill node', icon: '⚙️', tier: 'epic', test: (p, e) => e.type === 'skillBought' && !!e.data.maxed },
  { id: 'ascendant', name: 'Ascendant', hint: 'Prestige for the first time', icon: '🌟', tier: 'epic', test: (p) => p.prestige >= 1 },

  // ---- legendary: the long game ----
  { id: 'grandmaster', name: 'Grandmaster', hint: 'Reach Level 20', icon: '👑', tier: 'legendary', test: (p) => p.level >= 20 },
  { id: 'reborn', name: 'Reborn', hint: 'Prestige 3 times', icon: '♾️', tier: 'legendary', test: (p) => p.prestige >= 3 },
  { id: 'eternal', name: 'Eternal', hint: 'Land 5,000 lifetime kills', icon: '💠', tier: 'legendary', test: (p) => p.life.kills >= 5000 }
];
