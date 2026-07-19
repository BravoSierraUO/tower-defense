import { CONFIG } from './config.js';
import { Tower } from './tower.js';
import { Enemy } from './enemy.js';
import { Base } from './base.js';
import { Spawner } from './spawner.js';
import { Profile } from './profile.js';

export class World {
  // `profile` defaults to a fresh Profile so every existing caller (tests
  // included) keeps working unmodified — Game wires in the real persistent
  // one (see game.js) so its skill-tree bonuses (goldMult/buildMult) apply.
  constructor(commandCore, profile = new Profile()) {
    this.width = CONFIG.WORLD_WIDTH;
    this.height = CONFIG.WORLD_HEIGHT;
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.score = 0;
    this.kills = 0;
    this.towersPlaced = 0;
    this.gold = CONFIG.STARTING_GOLD;
    this.commandCore = commandCore;
    this.profile = profile;
    this.base = new Base();
    this.spawner = new Spawner();
    this.spawnRadius = Math.hypot(this.width / 2, this.height / 2) + CONFIG.SPAWN_MARGIN;
  }

  // Command Core output feeds the economy: Reactor(power) cheapens towers,
  // AI Core(compute) boosts gold rewards, Storage(storageCap) raises the cap.
  goldCap() {
    return CONFIG.GOLD_CAP_BASE + this.commandCore.totals().storageCap;
  }

  towerCost() {
    const discount = this.commandCore.totals().power * CONFIG.CORE_POWER_COST_DISCOUNT_PER_POINT;
    return Math.round(CONFIG.TOWER_COST * (1 - discount));
  }

  // Phase 4: the prestige skill tree's Gold Mastery node stacks on top of AI Core's bonus.
  rewardMultiplier() {
    return (1 + this.commandCore.totals().compute * CONFIG.CORE_COMPUTE_REWARD_BONUS_PER_POINT) * this.profile.goldMult();
  }

  addGold(amount) {
    this.gold = Math.min(this.goldCap(), this.gold + amount);
  }

  // Spawns an enemy at a random angle on a ring outside the world, aimed at the base.
  spawnEnemy(healthMultiplier = 1, speedMultiplier = 1) {
    const angle = Math.random() * Math.PI * 2;
    const x = this.base.x + Math.cos(angle) * this.spawnRadius;
    const y = this.base.y + Math.sin(angle) * this.spawnRadius;
    this.enemies.push(new Enemy(x, y, this.base.x, this.base.y, healthMultiplier, speedMultiplier));
  }

  updateSpawning(dt) {
    this.spawner.update(dt, this);
  }

  updateEnemies(dt) {
    for (const enemy of this.enemies) {
      enemy.update(dt);
      if (enemy.isDead()) {
        this.score += Math.round(enemy.maxHealth);
        this.kills++;
        this.addGold(Math.round(enemy.maxHealth * CONFIG.GOLD_PER_ENEMY_HEALTH * this.rewardMultiplier()));
      }
    }
    this.enemies = this.enemies.filter(e => !e.reachedTarget && !e.isDead());
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

  placeTower(x, y) {
	if (this.towers.length >= CONFIG.TOWER_MAX_COUNT) return null;

	const snapped = this.snapToGrid(x, y);
	if (!this.isInsideWorld(snapped.x, snapped.y)) return null;

	const distToBase = Math.hypot(snapped.x - this.base.x, snapped.y - this.base.y);
	if (distToBase < CONFIG.TOWER_MIN_BASE_DISTANCE) return null;

	const occupied = this.towers.some(t => t.x === snapped.x && t.y === snapped.y);
	if (occupied) return null;

	const cost = this.towerCost();
	if (this.gold < cost) return null;
	this.gold -= cost;

	const tower = new Tower(snapped.x, snapped.y, cost);
	this.towers.push(tower);
	this.towersPlaced++;
	return tower;
  }

  // Right-click a placed tower to sell it back for a % refund of what was paid.
  sellTowerAt(x, y) {
    const snapped = this.snapToGrid(x, y);
    const idx = this.towers.findIndex(t => t.x === snapped.x && t.y === snapped.y);
    if (idx === -1) return false;
    const [tower] = this.towers.splice(idx, 1);
    this.addGold(Math.round(tower.cost * CONFIG.TOWER_SELL_REFUND_PCT));
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
}
