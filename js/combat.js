import { CONFIG } from './config.js';

// Phase 7a: Damage Triangle. Each type's own `beats` field in
// CONFIG.DAMAGE_TYPES is the single source of truth — attacker wins if it
// beats the defender's type, loses if the defender's type beats it, neutral
// otherwise (same type, or either side untyped/null — e.g. hand-built test
// fixtures that never pass a type).
export function damageTypeMultiplier(attackerType, defenderType) {
  if (!attackerType || !defenderType || attackerType === defenderType) return 1;
  if (CONFIG.DAMAGE_TYPES[attackerType]?.beats === defenderType) return CONFIG.DAMAGE_TYPE_ADVANTAGE_MULT;
  if (CONFIG.DAMAGE_TYPES[defenderType]?.beats === attackerType) return CONFIG.DAMAGE_TYPE_DISADVANTAGE_MULT;
  return 1;
}

export class Projectile {
  constructor(x, y, target, damage, damageType = null) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.damage = damage;
    this.damageType = damageType; // the firing tower's damageType, see CONFIG.DAMAGE_TYPES
    this.speed = CONFIG.PROJECTILE_SPEED;
    this.dead = false;
  }

  update(dt) {
    if (this.target.isDead() || this.target.reachedTarget) {
      this.dead = true;
      return;
    }

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;

    if (step >= dist) {
      this.target.health -= this.damage * damageTypeMultiplier(this.damageType, this.target.armorType);
      this.dead = true;
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }
}

// Exported for renderer.js's Phase 7c flavor-shot animation — it needs the
// same "closest enemy in range" pick for its cosmetic-only potshots, and
// reusing this avoids a second, drifting copy of the same targeting logic.
export function findTarget(tower, enemies) {
  let closest = null;
  let closestDist = tower.effectiveRange();
  for (const enemy of enemies) {
    if (enemy.isDead() || enemy.reachedTarget) continue;
    const dist = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
    if (dist <= closestDist) {
      closest = enemy;
      closestDist = dist;
    }
  }
  return closest;
}

// Enemies that reached the base deal damage once, then become eligible for
// cleanup. Phase 3: Shield room reduces the damage by its shieldPct. Phase 4:
// the Fortification skill stacks on top, combined reduction capped well under
// 100% so a maxed-out Core + maxed skill can never zero out base damage.
// Phase 7d: only the still-base-bound enemies (attackTarget null) — an
// aggro'd enemy is resolved by resolveTurretHits() below instead.
function resolveBaseHits(world) {
  const reduction = Math.min(0.95, world.commandCore.totals().shieldPct + world.profile.fortifyMult());
  for (const enemy of world.enemies) {
    if (enemy.reachedTarget && !enemy.hasHitTarget && !enemy.attackTarget) {
      world.base.takeDamage(CONFIG.ENEMY_BASE_DAMAGE * (1 - reduction));
      enemy.hasHitTarget = true;
    }
  }
}

// Phase 7d: an aggro'd enemy (enemy.attackTarget set by World.pickAggroTarget)
// hits its Tower/Scavenger instead of the base on arrival — same one-shot-then-
// eligible-for-cleanup contact damage as resolveBaseHits, but no Shield/Fortify
// reduction: those defend the base specifically, not exterior turrets. A turret
// destroyed this way is a real loss, not sellTowerAt's refund — filtered out of
// world.towers/world.scavengers right here rather than left for a caller to notice.
function resolveTurretHits(world) {
  for (const enemy of world.enemies) {
    if (enemy.reachedTarget && !enemy.hasHitTarget && enemy.attackTarget) {
      enemy.attackTarget.takeDamage(CONFIG.ENEMY_BASE_DAMAGE);
      enemy.hasHitTarget = true;
    }
  }
  world.towers = world.towers.filter(t => !t.isDestroyed());
  world.scavengers = world.scavengers.filter(s => !s.isDestroyed());
}

// The live enemy closest to the base — shared by every passive base-side DPS
// source below so world.enemies gets walked once per frame, not once per source.
function nearestEnemyToBase(world) {
  let closest = null;
  let closestDist = Infinity;
  for (const enemy of world.enemies) {
    if (enemy.isDead() || enemy.reachedTarget) continue;
    const dist = Math.hypot(enemy.x - world.base.x, enemy.y - world.base.y);
    if (dist < closestDist) {
      closest = enemy;
      closestDist = dist;
    }
  }
  return closest;
}

// The two passive, no-projectile/no-visual DPS sources — the Hangar's interceptor
// drones (Phase 3, tower-independent) and the Base's own self-defense (Phase 12) —
// both hit the single live enemy closest to the base each frame, i.e. the identical
// pick. Summed and applied once here rather than each re-scanning world.enemies.
// Base damage scales off Profile.stationTier() — Prestige (Phase 6) is already the
// one lever that visibly grows the station, so it's also the lever that grows its
// self-defense rather than a second currency/gate. Tier 0 (Outpost) is 0, same
// "nothing extra yet" precedent drawStationRings() already set. dps<=0 short-circuits
// before the scan, preserving the old "no Hangar + Outpost tier = free frame" case.
function applyPassiveBaseDefense(world, dt) {
  const dronePower = Math.max(0, world.commandCore.totals().dronePower);
  const baseDamage = Math.max(0, CONFIG.STATION_TIERS[world.profile.stationTier()].baseDamage);
  const dps = dronePower + baseDamage;
  if (dps <= 0) return;

  const closest = nearestEnemyToBase(world);
  if (closest) closest.health -= dps * dt;
}

export function updateCombat(world, dt) {
  for (const tower of world.towers) {
    if (tower.cooldown > 0) continue;
    const target = findTarget(tower, world.enemies);
    if (target) {
      // Phase 4: Damage Mastery skill multiplies every shot. Phase 11: an equipped
      // item's damage affix (if any) does too — Tower's own base damage stays untouched.
      world.projectiles.push(new Projectile(tower.x, tower.y, target, tower.effectiveDamage() * world.profile.damageMult(), tower.damageType));
      // Phase 4d: a power brownout stretches the cooldown (slower firing) instead of
      // stopping it. Phase 11: an equipped item's fireRate affix (effectiveFireRate())
      // and its cooldown affix (cooldownAffixMult(), a direct multiplier on the
      // duration itself) both shorten it further, independently.
      tower.cooldown = (1 / (tower.effectiveFireRate() * world.powerFactor())) * tower.cooldownAffixMult();
    }
  }

  for (const projectile of world.projectiles) {
    projectile.update(dt);
  }
  world.projectiles = world.projectiles.filter(p => !p.dead);

  applyPassiveBaseDefense(world, dt);
  resolveBaseHits(world);
  resolveTurretHits(world);
}
