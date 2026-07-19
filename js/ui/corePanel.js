// Command Core view: room build slots, tech tree, power/compute/storage/research
// readouts, and the dock/market trade buttons. update() is only meaningful while
// view === 'core' — see ui.js for the panel-visibility toggle that gates the call.
import { CONFIG } from '../config.js';
import { layoutRadial } from './radialLayout.js';

export class CorePanel {
  constructor({ onUnlockTech, onDockTrade, onMarketBuyMetal, onMarketBuyGold, onSelectRoomType } = {}) {
    this.el = document.getElementById('core-panel');
    this.coreBuildBar = document.getElementById('core-build-bar');
    this.corePower = document.getElementById('core-power');
    this.coreCompute = document.getElementById('core-compute');
    this.coreStorage = document.getElementById('core-storage');
    this.coreResearch = document.getElementById('core-research');
    this.coreTowerCost = document.getElementById('core-tower-cost');
    this.coreScavengerCost = document.getElementById('core-scavenger-cost');
    this.coreMetalRate = document.getElementById('core-metal-rate');
    this.corePowerDraw = document.getElementById('core-power-draw');

    // Every room-type slot, keyed by the same CONFIG.ROOM_TYPES keys the
    // keyboard shortcut already indexes into (see game.js selectRoomType).
    this.slotEls = {
      reactor: document.getElementById('core-slot-reactor'),
      aiCore: document.getElementById('core-slot-aiCore'),
      storage: document.getElementById('core-slot-storage'),
      lab: document.getElementById('core-slot-lab'),
      mine: document.getElementById('core-slot-mine'),
      factory: document.getElementById('core-slot-factory'),
      hangar: document.getElementById('core-slot-hangar'),
      shield: document.getElementById('core-slot-shield'),
      dock: document.getElementById('core-slot-dock'),
      market: document.getElementById('core-slot-market')
    };
    this.lockedSlotEls = {
      factory: this.slotEls.factory,
      hangar: this.slotEls.hangar,
      shield: this.slotEls.shield,
      dock: this.slotEls.dock
    };
    for (const [type, el] of Object.entries(this.slotEls)) {
      el.addEventListener('click', () => onSelectRoomType?.(type));
    }
    layoutRadial(Object.values(this.slotEls), { radius: 210, arcDegrees: 170 });

    this.techTreeList = document.getElementById('tech-tree-list');
    this.techNodeButtons = {};
    for (const node of CONFIG.TECH_TREE) {
      const btn = document.createElement('button');
      btn.className = 'tech-node-btn';
      btn.addEventListener('click', () => onUnlockTech?.(node.id));
      this.techTreeList.appendChild(btn);
      this.techNodeButtons[node.id] = btn;
    }

    this.dockTradeBtn = document.getElementById('dock-trade-btn');
    this.dockTradeBtn.textContent = `Trade ${CONFIG.DOCK_TRADE_GOLD_COST} Gold → Research`;
    this.dockTradeBtn.addEventListener('click', () => onDockTrade?.());

    this.marketBuyMetalBtn = document.getElementById('market-buy-metal-btn');
    this.marketBuyMetalBtn.textContent = `Trade ${CONFIG.MARKET_TRADE_GOLD_COST} Gold → Metal`;
    this.marketBuyMetalBtn.addEventListener('click', () => onMarketBuyMetal?.());

    this.marketBuyGoldBtn = document.getElementById('market-buy-gold-btn');
    this.marketBuyGoldBtn.textContent = `Trade ${CONFIG.MARKET_TRADE_METAL_COST} Metal → Gold`;
    this.marketBuyGoldBtn.addEventListener('click', () => onMarketBuyGold?.());
  }

  update(world, commandCore, selectedRoomType) {
    const totals = commandCore.totals();
    this.corePower.textContent = totals.power;
    this.coreCompute.textContent = `${totals.cyclesPerMin}/min`;
    this.coreStorage.textContent = totals.storageCap;
    this.coreResearch.textContent = `${Math.floor(commandCore.research)} (+${totals.researchRate.toFixed(1)}/s)`;
    this.coreTowerCost.textContent = `${world.towerCost()}m`;
    this.coreScavengerCost.textContent = `${world.scavengerCost()}m`;
    this.coreMetalRate.textContent = `${world.metalPerSecond().toFixed(1)}/s`;
    this.corePowerDraw.textContent = `${world.powerConsumption()} / ${world.powerSupply()}`;

    for (const [type, el] of Object.entries(this.lockedSlotEls)) {
      if (el) el.classList.toggle('locked', !commandCore.isRoomUnlocked(type));
    }
    for (const [type, el] of Object.entries(this.slotEls)) {
      el.classList.toggle('selected', selectedRoomType === type);
    }

    for (const node of CONFIG.TECH_TREE) {
      const btn = this.techNodeButtons[node.id];
      const unlocked = commandCore.unlockedTech.has(node.id);
      btn.textContent = unlocked ? `${node.label} (unlocked)` : `${node.label} — ${node.cost} research`;
      btn.disabled = unlocked || !commandCore.canUnlockTech(node.id);
      btn.classList.toggle('unlocked', unlocked);
    }

    const dockBuilt = commandCore.isBuilt('dock');
    this.dockTradeBtn.hidden = !dockBuilt;
    if (dockBuilt) this.dockTradeBtn.disabled = world.gold < CONFIG.DOCK_TRADE_GOLD_COST;

    const marketBuilt = commandCore.isBuilt('market');
    this.marketBuyMetalBtn.hidden = !marketBuilt;
    this.marketBuyGoldBtn.hidden = !marketBuilt;
    if (marketBuilt) {
      this.marketBuyMetalBtn.disabled = world.gold < CONFIG.MARKET_TRADE_GOLD_COST;
      this.marketBuyGoldBtn.disabled = world.metal < CONFIG.MARKET_TRADE_METAL_COST;
    }
  }
}
