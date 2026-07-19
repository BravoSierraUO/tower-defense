// Command Core view: tech tree, power/compute/storage/research readouts, and
// the dock/market trade buttons. update() is only meaningful while
// view === 'core' — see ui.js for the panel-visibility toggle that gates the
// call. The room build picker moved to the click-to-open radial context menu
// (js/ui/radialMenu.js, Phase 9b) — this panel no longer owns it.
import { CONFIG } from '../config.js';

export class CorePanel {
  constructor({ onUnlockTech, onDockTrade, onMarketBuyMetal, onMarketBuyGold } = {}) {
    this.el = document.getElementById('core-panel');
    this.corePower = document.getElementById('core-power');
    this.coreCompute = document.getElementById('core-compute');
    this.coreStorage = document.getElementById('core-storage');
    this.coreResearch = document.getElementById('core-research');
    this.coreTowerCost = document.getElementById('core-tower-cost');
    this.coreScavengerCost = document.getElementById('core-scavenger-cost');
    this.coreMetalRate = document.getElementById('core-metal-rate');
    this.corePowerDraw = document.getElementById('core-power-draw');

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

  update(world, commandCore) {
    const totals = commandCore.totals();
    this.corePower.textContent = totals.power;
    this.coreCompute.textContent = `${totals.cyclesPerMin}/min`;
    this.coreStorage.textContent = totals.storageCap;
    this.coreResearch.textContent = `${Math.floor(commandCore.research)} (+${totals.researchRate.toFixed(1)}/s)`;
    this.coreTowerCost.textContent = `${world.towerCost()}m`;
    this.coreScavengerCost.textContent = `${world.scavengerCost()}m`;
    this.coreMetalRate.textContent = `${world.metalPerSecond().toFixed(1)}/s`;
    this.corePowerDraw.textContent = `${world.powerConsumption()} / ${world.powerSupply()}`;

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
