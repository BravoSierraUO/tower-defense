// Player Menu Shell (Phase 5b): owns the tab bar + shared close chrome for the
// modal hosting Account/Settings/Inventory/About. Doesn't own any tab's content
// (ProfilePanel/SettingsPanel/InventoryPanel/AboutPanel still do, unchanged) —
// just which one is visible, driven by Game.menuModalTab via setActiveTab().
// "Base" isn't a real tab: Command Core is a full interactive canvas view, not
// a static panel, so its button just hands off to onOpenCore (same callback
// the avatar menu's Command Core item already used) instead of switching tabs.
export class MenuModal {
  constructor({ onToggleProfile, onToggleSettings, onOpenInventoryMenu, onToggleAbout, onOpenCore, onClose } = {}) {
    this.overlay = document.getElementById('menu-modal-overlay');
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) onClose?.(); });
    document.getElementById('menu-modal-close-btn').addEventListener('click', () => onClose?.());

    this.tabButtons = {
      account: document.getElementById('menu-modal-tab-account'),
      settings: document.getElementById('menu-modal-tab-settings'),
      inventory: document.getElementById('menu-modal-tab-inventory'),
      about: document.getElementById('menu-modal-tab-about')
    };
    this.tabButtons.account.addEventListener('click', () => onToggleProfile?.());
    this.tabButtons.settings.addEventListener('click', () => onToggleSettings?.());
    this.tabButtons.inventory.addEventListener('click', () => onOpenInventoryMenu?.());
    this.tabButtons.about.addEventListener('click', () => onToggleAbout?.());
    document.getElementById('menu-modal-tab-base').addEventListener('click', () => onOpenCore?.());
  }

  setActiveTab(tab) {
    for (const [t, btn] of Object.entries(this.tabButtons)) {
      btn.classList.toggle('menu-modal-tab-active', t === tab);
    }
  }
}
