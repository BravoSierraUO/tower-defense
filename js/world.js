import { CONFIG } from './config.js';
import { Tower } from './tower.js';
import { ScavengerTurret } from './scavenger.js';
import { Enemy } from './enemy.js';
import { Base } from './base.js';
import { Spawner } from './spawner.js';
import { Profile } from './profile.js';
import { Inventory, rollDroppedOre } from './inventory.js';

export class World {
  // `profile` defaults to a fresh Profile so every existing caller (tests
  // included) keeps working unmodified — Game wires in the real persistent
  // one (see game.js) so its skill-tree bonuses (goldMult/buildMult) apply.
  constructor(commandCore, profile = new Profile()) {
    this.width = CONFIG.WORLD_WIDTH;
    this.height = CONFIG.WORLD_HEIGHT;
    this.towers = [];
    this.scavengers = []; // Phase 4c: passive metal-mining exterior placeables
    this.enemies = [];
    this.projectiles = [];
    this.score = 0;
    this.kills = 0;
    this.towersPlaced = 0;
    this.gold = CONFIG.STARTING_GOLD;
    this.metal = CONFIG.STARTING_METAL; // Phase 4c: funds Tower/Scavenger Turret cost, not gold
    this.moduleCharges = 0;     // Phase 8a: wave-clear salvage — spends as a free module install
    this.productionParts = 0;  // Phase 8a: wave-clear salvage — spends as a free build-timer rush
    this.inventory = new Inventory(); // Phase 11 skeleton: ore/refined/components, see js/inventory.js
    this.commandCore = commandCore;
    this.profile = profile;
    this.base = new Base();
    this.spawner = new Spawner();
    this.spawnRadius = Math.hypot(this.width / 2, this.height / 2) + CONFIG.SPAWN_MARGIN;
    this.comboStreak = 0; // Phase 4b: consecutive kills within COMBO_WINDOW of each other
    this.comboTimer = 0;
    // Phase 6: one cooldown-remaining timer per CONFIG.ABILITIES entry, all starting
    // ready (0) — commsAccess (not this) is what actually gates first use.
    this.abilityCooldowns = {};
    for (const ability of CONFIG.ABILITIES) this.abilityCooldowns[ability.id] = 0;
  }

  // Command Core output feeds the economy: Reactor(power) now supplies the Phase 4d
  // Energy System (see powerSupply/powerConsumption/powerFactor below), AI
  // Core(cyclesPerMin) drives the metal Cycle Budget, Storage(storageCap) raises
  // the gold cap.
  goldCap() {
    return CONFIG.GOLD_CAP_BASE + this.commandCore.totals().storageCap;
  }

  // Phase 4d: flat metal cost — Reactor's power no longer discounts this (it's a
  // live supply pool now, not a one-time discount; see powerFactor()).
  towerCost() {
    return CONFIG.TOWER_COST;
  }

  scavengerCost() {
    return CONFIG.SCAVENGER_COST;
  }

  // Phase 4d: Energy System. Same fixed-supply/split-across-consumers shape as
  // Phase 4c's AI Cycle Budget, but an instantaneous ratio rather than an accruing
  // resource — no update(dt) needed, just a pure derived getter.
  powerSupply() {
    return this.commandCore.totals().power;
  }

  powerConsumption() {
    return this.towers.reduce((sum, t) => sum + CONFIG.TOWER_POWER_CONSUMPTION[t.tier - 1], 0);
  }

  // 1 = every tower fires at full rate. Below 1 = brownout — supply can't cover
  // consumption, so combat.js throttles fire rate proportionally, floored at
  // BROWNOUT_MIN_FIRE_RATE_MULT so towers slow down but never fully stop.
  powerFactor() {
    const consumption = this.powerConsumption();
    if (consumption <= 0) return 1;
    const supply = this.powerSupply();
    if (supply >= consumption) return 1;
    return Math.max(CONFIG.BROWNOUT_MIN_FIRE_RATE_MULT, supply / consumption);
  }

  // Phase 4: the prestige skill tree's Gold Mastery node stacks on top of the combo bonus.
  // Phase 4c: AI Core's compute bonus is gone — it's the Cycle Budget engine now, see below.
  rewardMultiplier() {
    const combo = 1 + Math.min(this.comboStreak, CONFIG.COMBO_MAX_STACKS) * CONFIG.COMBO_BONUS_PER_STACK;
    return this.profile.goldMult() * combo;
  }

  addGold(amount) {
    this.gold = Math.min(this.goldCap(), this.gold + amount);
  }

  // Phase 4c: metal is a separate pool from gold — funds Tower/Scavenger cost only.
  metalCap() {
    return CONFIG.METAL_CAP_BASE;
  }

  addMetal(amount) {
    this.metal = Math.min(this.metalCap(), this.metal + amount);
  }

  // Phase 8a: wave-clear salvage tokens. No cap — these are small discrete counts,
  // not an accruing rate like gold/metal.
  addModuleCharges(amount) {
    this.moduleCharges += amount;
  }

  addProductionParts(amount) {
    this.productionParts += amount;
  }

  // AI Cycle Budget scheduler (Phase 4c): a continuous fair-share rate, not
  // literal discrete cycles — mathematically the same long-run average, but
  // deterministic and dt-driven like every other rate in this game
  // (researchRate, dronePower, passive income). BASE_CYCLES_PER_MIN is an
  // always-on floor so metal production doesn't depend on AI Core existing.
  activeMetalProducers() {
    // Phase 11: effectiveMetalPerCycle() folds in a Scavenger's equipped-item
    // metalYieldMult affix, if any — Mine has no equip slot, stays as-is.
    const producers = this.scavengers.map(s => s.effectiveMetalPerCycle());
    const mine = this.commandCore.rooms.find(r => r.type === 'mine' && r.isActive());
    if (mine) producers.push(mine.stats.metalPerCycle);
    return producers;
  }

  cyclesPerSecond() {
    return (CONFIG.BASE_CYCLES_PER_MIN + this.commandCore.totals().cyclesPerMin) / 60;
  }

  // Total metal/sec the Cycle Budget scheduler is currently paying out —
  // exposed as its own method so the HUD can show live throughput, not just
  // World's internal accrual.
  metalPerSecond() {
    const producers = this.activeMetalProducers();
    if (producers.length === 0) return 0;
    const share = this.cyclesPerSecond() / producers.length;
    return producers.reduce((sum, perCycle) => sum + share * perCycle, 0);
  }

  updateCycleBudget(dt) {
    this.addMetal(this.metalPerSecond() * dt);
  }

  // Phase 11 skeleton: rare-ore mining is a bonus stream layered on top of the
  // metal accrual above, not carved out of it — reuses the same Cycle Budget
  // share (cyclesPerSecond() split across active Scavengers) metalPerSecond()
  // already uses, scaled by each Scavenger's own tier odds (CONFIG.ORE_LOOT_TABLE).
  // Scoped to Scavenger Turret only this pass — Mine stays metal-only, same
  // "one thing at a time" caution the rest of this system carries.
  orePerSecond(type) {
    if (this.scavengers.length === 0) return 0;
    const share = this.cyclesPerSecond() / this.scavengers.length;
    return this.scavengers.reduce((sum, s) => {
      const odds = CONFIG.ORE_LOOT_TABLE[s.tier - 1][type] || 0;
      // Phase 11: effectiveMetalPerCycle() folds in metalYieldMult; rareOreFindMult()
      // is a second, independent multiplier scoped to non-Metal ore only (the only
      // callers of orePerSecond() ever pass a rare type — see updateOreAccrual()).
      return sum + share * s.effectiveMetalPerCycle() * (odds / 100) * s.rareOreFindMult();
    }, 0);
  }

  updateOreAccrual(dt) {
    for (const type of Object.keys(this.inventory.ore)) {
      this.inventory.addOre(type, this.orePerSecond(type) * dt);
    }
  }

  // Combat's own material path (tower-defensish, distinct from mining's
  // continuous accrual above) — a kill is already a discrete event, so this
  // rolls real RNG once per kill rather than a derived rate. Called from
  // updateEnemies() on every kill.
  rollKillDrops() {
    if (Math.random() < CONFIG.ENEMY_ORE_DROP_CHANCE) {
      this.inventory.addSalvagedOre(rollDroppedOre());
    }
    if (Math.random() < CONFIG.ENEMY_COMPONENT_DROP_CHANCE) {
      const recipeIds = Object.keys(CONFIG.COMPONENT_RECIPES);
      const recipeId = recipeIds[Math.floor(Math.random() * recipeIds.length)];
      this.inventory.addCraftedItem(recipeId);
    }
  }

  // Factory does double duty as of Phase 11 (refine ore -> refined, assemble
  // refined -> component, on top of its original buildTimeReduction job)
  // rather than a dedicated Foundry room — both gated on Factory being built,
  // same "World checks the gating room, then delegates" shape tradeAtDock/
  // tradeGoldForMetal already use for Dock/Market.
  craftingRoom() {
    return this.commandCore.rooms.find(r => r.type === 'factory' && r.isActive()) || null;
  }

  refineMaterial(recipeId) {
    if (!this.craftingRoom()) return false;
    return this.inventory.refine(recipeId);
  }

  craftComponent(recipeId) {
    const factory = this.craftingRoom();
    if (!factory) return null;
    return this.inventory.craft(recipeId, factory.stats.rarityBonusPct);
  }

  // Moves an item between the loose Inventory.items list and a Tower/Scavenger's
  // single equip slot — never both at once, so no separate uniqueness check is
  // needed (an equipped item physically isn't in the loose list to re-equip
  // elsewhere). Re-equipping over an existing item unequips it back to the list
  // first, same "swap, don't stack" convention CommandCore's one-room-per-type
  // and Tower's own single-turret-per-cell already set elsewhere in this codebase.
  equipItem(entity, itemId) {
    if (!entity) return false;
    const idx = this.inventory.items.findIndex(i => i.id === itemId);
    if (idx === -1) return false;
    const [item] = this.inventory.items.splice(idx, 1);
    this.unequipItem(entity);
    entity.equippedItem = item;
    return true;
  }

  unequipItem(entity) {
    if (!entity || !entity.equippedItem) return false;
    this.inventory.items.push(entity.equippedItem);
    entity.equippedItem = null;
    return true;
  }

  // Phase 4b: base passive income, scaled by the player's persistent profile level.
  updatePassiveIncome(dt, level) {
    this.addGold(level * CONFIG.BASE_PASSIVE_INCOME_PER_LEVEL * dt);
  }

  // Spawns an enemy at a random angle on a ring outside the world, aimed at the base
  // — or, since Phase 7d, at a live Tower/Scavenger instead (see pickAggroTarget()).
  // Returns the enemy so Spawner can tally its maxHealth into the wave's value total.
  // Phase 7a: armorType defaults to null (neutral) here too — Spawner.pickArmorType()
  // is what actually assigns a real type for live-game spawns.
  spawnEnemy(healthMultiplier = 1, speedMultiplier = 1, armorType = null) {
    const angle = Math.random() * Math.PI * 2;
    const x = this.base.x + Math.cos(angle) * this.spawnRadius;
    const y = this.base.y + Math.sin(angle) * this.spawnRadius;

    const aggroTarget = this.pickAggroTarget(x, y);
    const targetX = aggroTarget ? aggroTarget.x : this.base.x;
    const targetY = aggroTarget ? aggroTarget.y : this.base.y;

    const enemy = new Enemy(x, y, targetX, targetY, healthMultiplier, speedMultiplier, armorType, aggroTarget);
    this.enemies.push(enemy);
    return enemy;
  }

  // Phase 7d: rolls CONFIG.ENEMY_AGGRO_CHANCE per spawn. A hit aggroes the nearest live
  // Tower/Scavenger to the spawn point (distance-based, not a coin flip among all of
  // them — placing turrets closer to the spawn ring draws more aggro, a real strategic
  // choice) instead of the base; an empty field (or a miss) falls back to null, the
  // base-bound behavior every phase before this one had.
  pickAggroTarget(spawnX, spawnY) {
    if (Math.random() >= CONFIG.ENEMY_AGGRO_CHANCE) return null;
    const candidates = [...this.towers, ...this.scavengers];
    if (candidates.length === 0) return null;

    let nearest = null;
    let nearestDist = Infinity;
    for (const candidate of candidates) {
      const dist = Math.hypot(candidate.x - spawnX, candidate.y - spawnY);
      if (dist < nearestDist) {
        nearest = candidate;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  updateSpawning(dt) {
    this.spawner.update(dt, this);
  }

  // Phase 4b: streak decays on its own clock, independent of enemy count, so
  // it also winds down between waves rather than only on the next kill.
  updateCombo(dt) {
    if (this.comboTimer <= 0) return;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) {
      this.comboTimer = 0;
      this.comboStreak = 0;
    }
  }

  updateEnemies(dt) {
    this.updateCombo(dt);
    for (const enemy of this.enemies) {
      enemy.update(dt);
      if (enemy.isDead()) {
        this.comboStreak++;
        this.comboTimer = CONFIG.COMBO_WINDOW;
        this.score += Math.round(enemy.maxHealth);
        this.kills++;
        this.addGold(Math.round(enemy.maxHealth * CONFIG.GOLD_PER_ENEMY_HEALTH * this.rewardMultiplier()));
        // Phase 7d: a defender's bonus — this enemy was still aggro'd on a turret (shot
        // down before it ever arrived) rather than base-bound. Extra gold on top of the
        // normal per-kill payout, plus the game's first per-kill metal.
        if (enemy.attackTarget) {
          this.addGold(Math.round(enemy.maxHealth * CONFIG.GOLD_PER_ENEMY_HEALTH * CONFIG.DEFENDER_BONUS_GOLD_MULT * this.rewardMultiplier()));
          this.addMetal(Math.round(enemy.maxHealth * CONFIG.DEFENDER_BONUS_METAL_PER_ENEMY_HEALTH));
        }
        this.spawner.waveValueKilled += enemy.maxHealth; // Phase 8a: raw value, feeds finalizeWave()'s chest-tier %
        this.rollKillDrops(); // Phase 11 skeleton: tower-defensish material path
      }
    }
    // Frame order is spawning -> combat (resolveBaseHits/resolveTurretHits) -> here. An
    // enemy that just arrived this frame has reachedTarget=true but hasHitTarget=false —
    // filtering on reachedTarget alone would remove it before combat.js's next pass ever
    // sees it, so base/turret damage would never actually apply. Keep it one extra frame
    // until hasHitTarget flips.
    this.enemies = this.enemies.filter(e => !e.isDead() && !(e.reachedTarget && e.hasHitTarget));
  }

  // Phase 6: ticks every ability's cooldown down, independent of whether commsAccess
  // is even unlocked yet — harmless since they all start at 0 and useAbility() is the
  // only thing that ever sets one above 0.
  updateAbilities(dt) {
    for (const id in this.abilityCooldowns) {
      if (this.abilityCooldowns[id] > 0) this.abilityCooldowns[id] = Math.max(0, this.abilityCooldowns[id] - dt);
    }
  }

  abilityDef(id) {
    return CONFIG.ABILITIES.find(a => a.id === id) || null;
  }

  canUseAbility(id) {
    const def = this.abilityDef(id);
    if (!def) return false;
    return this.commandCore.unlockedTech.has('commsAccess') && this.abilityCooldowns[id] <= 0;
  }

  // All 5 are global/no-target effects — see CONFIG.ABILITIES' note on why a
  // click-to-aim version stays unscoped. Returns false (no cooldown spent) if
  // still locked or on cooldown, true once the effect actually applied.
  useAbility(id) {
    const def = this.abilityDef(id);
    if (!this.canUseAbility(id)) return false;

    if (id === 'emp') {
      for (const enemy of this.enemies) {
        if (enemy.reachedTarget) continue;
        enemy.slowTimer = def.duration;
        enemy.slowMult = def.slowMult;
      }
    } else if (id === 'orbitalLaser') {
      for (const enemy of this.enemies) enemy.health = Math.max(0, enemy.health - def.damage);
    } else if (id === 'supplyDrop') {
      this.addGold(def.gold);
      this.addMetal(def.metal);
    } else if (id === 'droneRepair') {
      for (const unit of [...this.towers, ...this.scavengers]) {
        unit.health = Math.min(unit.maxHealth, unit.health + unit.maxHealth * def.healPct);
      }
    } else if (id === 'satelliteRecall') {
      // Pulls every aggro'd enemy off its Tower/Scavenger and back onto the base path —
      // a panic button for a turret about to die, same base-bound shape World.spawnEnemy()
      // already gives an enemy that never aggroed in the first place.
      for (const enemy of this.enemies) {
        if (enemy.attackTarget) {
          enemy.attackTarget = null;
          enemy.targetX = this.base.x;
          enemy.targetY = this.base.y;
        }
      }
    }

    this.abilityCooldowns[id] = def.cooldown;
    return true;
  }

  snapToGrid(x, y) {
    const size = CONFIG.GRID_SIZE;
    return {
      x: Math.floor(x / size) * size + size / 2,
      y: Math.floor(y / size) * size + size / 2
    };
  }

  isInsideWorld(x, y) {
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    return x >= -halfW && x <= halfW && y >= -halfH && y <= halfH;
  }

  // Phase 4c: Tower and Scavenger Turret share the same exterior grid — neither
  // can be placed on a cell the other already occupies.
  exteriorOccupiedAt(x, y) {
    return this.towers.some(t => t.x === x && t.y === y) || this.scavengers.some(s => s.x === x && s.y === y);
  }

  placeTower(x, y, damageType = 'kinetic') {
	if (this.towers.length >= CONFIG.TOWER_MAX_COUNT) return null;

	const snapped = this.snapToGrid(x, y);
	if (!this.isInsideWorld(snapped.x, snapped.y)) return null;

	const distToBase = Math.hypot(snapped.x - this.base.x, snapped.y - this.base.y);
	if (distToBase < CONFIG.TOWER_MIN_BASE_DISTANCE) return null;

	if (this.exteriorOccupiedAt(snapped.x, snapped.y)) return null;

	const cost = this.towerCost();
	if (this.metal < cost) return null;
	this.metal -= cost;

	const tower = new Tower(snapped.x, snapped.y, cost, damageType);
	this.towers.push(tower);
	this.towersPlaced++;
	return tower;
  }

  // Right-click a placed tower to sell it back for a % refund of what was paid (metal).
  sellTowerAt(x, y) {
    const snapped = this.snapToGrid(x, y);
    const idx = this.towers.findIndex(t => t.x === snapped.x && t.y === snapped.y);
    if (idx === -1) return false;
    const [tower] = this.towers.splice(idx, 1);
    this.addMetal(Math.round(tower.cost * CONFIG.TOWER_SELL_REFUND_PCT));
    return true;
  }

  towerAt(x, y) {
    const snapped = this.snapToGrid(x, y);
    return this.towers.find(t => t.x === snapped.x && t.y === snapped.y) || null;
  }

  // Phase 4c: gate-bypassing placement for the free onboarding-guarantee starter
  // Scavenger Turret — used only by Game at world init/restart.
  placeStarterScavenger(x, y) {
    const snapped = this.snapToGrid(x, y);
    const scavenger = new ScavengerTurret(snapped.x, snapped.y, 0);
    this.scavengers.push(scavenger);
    return scavenger;
  }

  placeScavenger(x, y) {
    if (this.scavengers.length >= CONFIG.SCAVENGER_MAX_COUNT) return null;

    const snapped = this.snapToGrid(x, y);
    if (!this.isInsideWorld(snapped.x, snapped.y)) return null;

    const distToBase = Math.hypot(snapped.x - this.base.x, snapped.y - this.base.y);
    if (distToBase < CONFIG.TOWER_MIN_BASE_DISTANCE) return null;

    if (this.exteriorOccupiedAt(snapped.x, snapped.y)) return null;

    const cost = this.scavengerCost();
    if (this.metal < cost) return null;
    this.metal -= cost;

    const scavenger = new ScavengerTurret(snapped.x, snapped.y, cost);
    this.scavengers.push(scavenger);
    return scavenger;
  }

  sellScavengerAt(x, y) {
    const snapped = this.snapToGrid(x, y);
    const idx = this.scavengers.findIndex(s => s.x === snapped.x && s.y === snapped.y);
    if (idx === -1) return false;
    const [scavenger] = this.scavengers.splice(idx, 1);
    this.addMetal(Math.round(scavenger.cost * CONFIG.TOWER_SELL_REFUND_PCT));
    return true;
  }

  scavengerAt(x, y) {
    const snapped = this.snapToGrid(x, y);
    return this.scavengers.find(s => s.x === snapped.x && s.y === snapped.y) || null;
  }

  scavengerUpgradeCost(scavenger) {
    return Math.round(CONFIG.SCAVENGER_UPGRADE_COST_BASE * Math.pow(CONFIG.SCAVENGER_UPGRADE_COST_GROWTH, scavenger.tier - 1));
  }

  upgradeScavenger(scavenger) {
    if (!scavenger || !scavenger.canUpgrade()) return false;
    const cost = this.scavengerUpgradeCost(scavenger);
    if (this.metal < cost) return false;
    this.metal -= cost;
    scavenger.upgrade();
    return true;
  }

  // Phase 4b: same cost-growth shape as CommandCore.upgradeCost().
  towerUpgradeCost(tower) {
    return Math.round(CONFIG.TOWER_UPGRADE_COST_BASE * Math.pow(CONFIG.TOWER_UPGRADE_COST_GROWTH, tower.tier - 1));
  }

  upgradeTower(tower) {
    if (!tower || !tower.canUpgrade()) return false;
    const cost = this.towerUpgradeCost(tower);
    if (this.metal < cost) return false;
    this.metal -= cost;
    tower.upgrade();
    return true;
  }

  // Phase 4b: pay gold to zero out a room's remaining build timer early.
  rushBuildCost(room) {
    return Math.ceil(room.buildTimeRemaining * CONFIG.FAST_BUILD_GOLD_PER_SECOND);
  }

  rushBuildRoom(gx, gy) {
    const room = this.commandCore.getRoomAt(gx, gy);
    if (!room || room.isActive()) return null;
    // Phase 8a: a production part (wave-clear salvage) rushes it for free before gold is touched.
    if (this.productionParts > 0) {
      this.productionParts--;
      room.buildTimeRemaining = 0;
      return room;
    }
    const cost = this.rushBuildCost(room);
    if (this.gold < cost) return null;
    this.gold -= cost;
    room.buildTimeRemaining = 0;
    return room;
  }

  // Phase 4b: heal the base for gold, clamped to missing HP.
  repairBaseCost(amount) {
    return Math.ceil(amount * CONFIG.BASE_REPAIR_GOLD_PER_HP);
  }

  repairBase(amount) {
    const missing = this.base.maxHealth - this.base.health;
    if (missing <= 0) return false;
    const heal = Math.min(amount, missing);
    const cost = this.repairBaseCost(heal);
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.base.health += heal;
    return true;
  }

  // Phase 3: Command Core rooms now cost gold to build/upgrade/mod — these
  // wrap CommandCore's validity checks with the gold gate (same split as
  // towerCost()/placeTower() above: CommandCore owns state, World owns gold).
  buildRoom(type, gx, gy) {
    const cost = this.commandCore.buildCost(type);
    if (this.gold < cost) return null;
    const room = this.commandCore.placeRoom(type, gx, gy);
    if (!room) return null;
    this.gold -= cost;
    // Phase 4: Build Mastery skill shortens the timer CommandCore already set, floored the same way.
    room.buildTimeTotal = Math.max(1, room.buildTimeTotal / this.profile.buildMult());
    room.buildTimeRemaining = room.buildTimeTotal;
    return room;
  }

  upgradeRoom(gx, gy) {
    const room = this.commandCore.getRoomAt(gx, gy);
    if (!room || !room.isActive() || !room.canUpgrade()) return null;
    const cost = this.commandCore.upgradeCost(room);
    if (this.gold < cost) return null;
    this.gold -= cost;
    return this.commandCore.upgradeRoomAt(gx, gy);
  }

  installModuleAt(gx, gy) {
    const room = this.commandCore.getRoomAt(gx, gy);
    if (!this.commandCore.canInstallModule(room)) return null;
    // Phase 8a: a module charge (wave-clear salvage) installs for free before gold is touched.
    if (this.moduleCharges > 0) {
      this.moduleCharges--;
      return this.commandCore.installModuleAt(gx, gy);
    }
    const cost = this.commandCore.moduleCost(room);
    if (this.gold < cost) return null;
    this.gold -= cost;
    return this.commandCore.installModuleAt(gx, gy);
  }

  // Dock: manually convert gold into research. Ratio improves with Dock's tier.
  tradeAtDock() {
    const dockRoom = this.commandCore.rooms.find(r => r.type === 'dock' && r.isActive());
    if (!dockRoom) return false;
    const cost = CONFIG.DOCK_TRADE_GOLD_COST;
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.commandCore.research += cost * (CONFIG.DOCK_TRADE_BASE_RATIO + dockRoom.stats.tradeBonus);
    return true;
  }

  // Market: manual gold<->metal trading, both directions. Ratio improves with Market's tier.
  tradeGoldForMetal() {
    const marketRoom = this.commandCore.rooms.find(r => r.type === 'market' && r.isActive());
    if (!marketRoom) return false;
    const cost = CONFIG.MARKET_TRADE_GOLD_COST;
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.addMetal(cost * (CONFIG.MARKET_TRADE_BASE_RATIO + marketRoom.stats.marketBonus));
    return true;
  }

  tradeMetalForGold() {
    const marketRoom = this.commandCore.rooms.find(r => r.type === 'market' && r.isActive());
    if (!marketRoom) return false;
    const cost = CONFIG.MARKET_TRADE_METAL_COST;
    if (this.metal < cost) return false;
    this.metal -= cost;
    this.addGold(cost * (CONFIG.MARKET_TRADE_BASE_RATIO + marketRoom.stats.marketBonus));
    return true;
  }
}
