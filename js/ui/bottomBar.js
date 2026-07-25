// Phase 18a: the bottom action bar — five fixed slots across the bottom of the
// screen, and the default build surface on every device. The click-to-open radial
// (js/ui/radialMenu.js, Phase 9b) survives as a Settings option; `menuStyle`
// picks between them. Nothing was deleted to make room for this, which is the
// whole point of the card — this is the first surface that treats "which menu"
// as a player preference.
//
// Shape settled against two independently-generated mockups (docs/mockups/,
// analysis in docs/mobile-audit.md §E). Both landed on: five slots with Build
// centred and dominant, the active slot FILLED rather than outlined, and the
// submenu in a drawer anchored above the bar with a caret pointing down at the
// slot that opened it. That anchoring is doing real work — an open drawer visibly
// belongs to a lit slot, which is the armed-state feedback this card requires,
// nearly for free.
//
// The drawer is a VERTICAL LIST, deliberately, against the more attractive
// horizontal card row: it has to serve both views, and Field build has 4 leaves
// while Core build has 9 (CONFIG.ROOM_TYPES). Three wide cards don't extend to
// nine without a second row, a scroll, or a different component per view — and a
// different component per view would defeat the shared js/menuConfig.js seam that
// makes this cheap. A list takes nine as readily as three and survives 375px.
//
// Contents come from js/menuConfig.js unchanged — the same array the radial
// renders. `flyoutRadius`/`flyoutArc` are radial-only and simply ignored here.
//
// Two hazards this file has to respect, both already paid for elsewhere in the
// codebase (see docs/mobile-audit.md D1/D2):
//   - `.ui-overlay` is `pointer-events:none` with children opting in. The bar sets
//     `pointer-events:auto` in CSS. Without it, the bar swallows canvas clicks
//     across the whole bottom strip while being unclickable itself.
//   - A global `[hidden]{display:none !important}` exists because author
//     `display:flex` rules kept beating the UA default. Don't add a local
//     `[hidden]` override; toggling `.hidden` via the `hidden` property is enough.

// Per-tap zoom step for the two zoom slots. Multiplicative, and the two buttons
// are exact reciprocals so tap-in-then-out returns you to where you were
// (Camera#zoomBy is the clamp; see tests/camera.test.mjs).
const ZOOM_STEP = 1.3;

// The five slots, left to right, exactly as both mockups drew them. `action` is
// either a menuConfig level-1 id (dispatched through onAction) or a bar-local
// concern (zoom). Missions is deliberately NOT here: five slots minus two zooms
// leaves no room, and Phase 8f built three entry points for it on purpose — the
// mission banner and its "?" button both still open the Mission Menu, so the
// menu leaf was the redundant one. A real removal, not an oversight.
// `dynamicLabel` marks the one slot whose text legitimately changes at runtime:
// Base reads "Base" in the field and "Field" in the Core. The others keep their
// short bar label rather than the menuConfig one — "Items" fits a 54px slot on a
// 375px phone where "Inventory" does not, and a slot label is not the same
// affordance as a menu-leaf label even when they name the same action.
const SLOTS = [
  { key: 'zoomOut', kind: 'zoom', factor: 1 / ZOOM_STEP, icon: '−', label: 'Zoom' },
  { key: 'inventory', kind: 'action', icon: '▤', label: 'Items' },
  { key: 'build', kind: 'action', icon: '+', label: 'Build', primary: true },
  { key: 'base', kind: 'action', icon: '⌂', label: 'Base', dynamicLabel: true },
  { key: 'zoomIn', kind: 'zoom', factor: ZOOM_STEP, icon: '+', label: 'Zoom' }
];

export class BottomBar {
  // onAction(id) is the same callback the radial gets (Game#handleMenuAction).
  // onZoom(factor) goes to Camera#zoomBy. onCancelArmed() disarms whatever build
  // type is selected — the tap-to-cancel affordance this card requires, because
  // Escape is otherwise the only universal cancel and touch has no Escape.
  constructor({ onAction, onZoom, onCancelArmed } = {}) {
    this.onAction = onAction;
    this.onZoom = onZoom;
    this.onCancelArmed = onCancelArmed;

    this.el = document.getElementById('bottom-bar');
    this.slotsEl = document.getElementById('bar-slots');
    this.drawerEl = document.getElementById('bar-drawer');
    this.drawerTitleEl = document.getElementById('bar-drawer-title');
    this.drawerListEl = document.getElementById('bar-drawer-list');
    this.caretEl = document.getElementById('bar-drawer-caret');
    this.armedEl = document.getElementById('bar-armed');
    this.armedLabelEl = document.getElementById('bar-armed-label');

    // Which slot's drawer is open, by key — null when closed. The bar itself is
    // persistent (unlike the radial, which is rebuilt per open), so this is the
    // one piece of state it keeps between frames.
    this.openSlotKey = null;
    this._lastSignature = null;
    this._config = null;

    // Slots are built once, not per frame — same "fixed list, build once"
    // precedent WavePanel/MissionPanel already set. Only their labels and
    // lit/disabled state change per frame.
    this.slotEls = {};
    for (const slot of SLOTS) {
      const btn = document.createElement('button');
      btn.className = 'bar-slot' + (slot.primary ? ' bar-slot-primary' : '');
      btn.dataset.slot = slot.key;
      btn.innerHTML = `<span class="bar-slot-icon">${slot.icon}</span><span class="bar-slot-label">${slot.label}</span>`;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.handleSlotClick(slot);
      });
      this.slotsEl.appendChild(btn);
      this.slotEls[slot.key] = btn;
    }

    document.getElementById('bar-armed-cancel').addEventListener('click', e => {
      e.stopPropagation();
      this.onCancelArmed?.();
    });

    this.el.hidden = true;
  }

  get isOpen() {
    return this.openSlotKey !== null;
  }

  handleSlotClick(slot) {
    if (slot.kind === 'zoom') {
      this.onZoom?.(slot.factor);
      return;
    }
    const leaf = this._config?.level1.find(l => l.id === slot.key);
    // A slot with a submenu toggles its drawer; a plain slot dispatches straight
    // through, same as the radial's activateLevel1.
    if (leaf?.flyout) {
      this.toggleDrawer(slot.key);
      return;
    }
    this.closeDrawer();
    this.onAction?.(slot.key);
  }

  toggleDrawer(key) {
    if (this.openSlotKey === key) this.closeDrawer();
    else {
      this.openSlotKey = key;
      this._lastSignature = null; // force a rebuild on the next update()
    }
  }

  closeDrawer() {
    this.openSlotKey = null;
    this._lastSignature = null;
  }

  // Cheap change-detector so the drawer's rows aren't rebuilt 60×/second. Costs
  // and lock state are the only things that move while it's open (metal ticks up
  // from salvage, gold from rooms), and a row's whole appearance derives from
  // them — so this covers everything the DOM actually shows.
  signature(leaves) {
    return leaves.map(l => `${l.id}:${l.locked ? 1 : 0}:${l.cost || ''}:${l.reason || ''}`).join('|');
  }

  renderDrawer(slotKey, leaves) {
    this.drawerListEl.innerHTML = '';
    const parent = this._config.level1.find(l => l.id === slotKey);
    this.drawerTitleEl.textContent = parent?.label || '';

    for (const leaf of leaves) {
      const row = document.createElement('button');
      row.className = 'bar-row' + (leaf.locked ? ' locked' : '');
      if (leaf.color) row.style.setProperty('--leaf-color', leaf.color);
      // On a locked row the reason REPLACES the description — "why can't I build
      // this" is strictly more useful than what it would have done. Same data the
      // radial surfaces as a stub/tooltip, just always visible here because a
      // list row has somewhere to put it.
      const sub = leaf.locked ? (leaf.reason || '') : (leaf.desc || '');
      row.innerHTML = [
        '<span class="bar-row-swatch"></span>',
        '<span class="bar-row-text">',
        `<span class="bar-row-label">${leaf.label}</span>`,
        sub ? `<span class="bar-row-sub">${sub}</span>` : '',
        '</span>',
        leaf.cost ? `<span class="bar-row-cost">${leaf.cost}</span>` : '',
        // Kept on touch as well as desktop: the badge teaches the keyboard
        // shortcut, and hiding it would mean detecting input type just to remove
        // information. docs/mobile-audit.md B6 left this an open call; this is the
        // call. It costs nothing to leave and it's how a player learns the fast path.
        leaf.digit != null ? `<span class="bar-row-digit">${leaf.digit}</span>` : ''
      ].join('');
      row.addEventListener('click', e => {
        e.stopPropagation();
        if (leaf.locked) return; // the reason is already on the row — nothing to flash
        this.onAction?.(leaf.id);
        this.closeDrawer();
        this.syncDrawer();
      });
      this.drawerListEl.appendChild(row);
    }
  }

  // The caret points down at the slot that opened the drawer — the detail both
  // mockups drew, and what makes the drawer read as belonging to a slot rather
  // than floating over the screen. Measured from live layout rather than computed
  // from slot widths so it stays correct at every breakpoint.
  positionCaret(slotKey) {
    const btn = this.slotEls[slotKey];
    if (!btn) return;
    // Offset must be relative to the DRAWER, since that's the caret's positioned
    // ancestor — measuring against .bar-slots instead put it ~33px off, because
    // the drawer and the slot strip are different widths and so start at
    // different x. Caught by a live click-through, not by reading the CSS.
    const drawerRect = this.drawerEl.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const center = btnRect.left + btnRect.width / 2 - drawerRect.left;
    // Keep the caret inside the drawer's rounded corners even when its slot sits
    // near the screen edge (the outer slots at the phone breakpoint).
    const inset = 14;
    const clamped = Math.min(Math.max(center, inset), drawerRect.width - inset);
    this.caretEl.style.left = `${clamped}px`;
  }

  syncDrawer() {
    const open = this.openSlotKey !== null;
    this.drawerEl.hidden = !open;
    for (const slot of SLOTS) {
      this.slotEls[slot.key].classList.toggle('open', this.openSlotKey === slot.key);
    }
    // Positioned here rather than in renderDrawer() because the caret needs its
    // ancestor's real geometry, and the drawer is still `hidden` (so every rect
    // reads 0) at render time — that ordering put the caret 183px off. Re-measured
    // each frame while open, which also keeps it aimed across a window resize.
    if (open) this.positionCaret(this.openSlotKey);
  }

  // Called every frame by ui.js while menuStyle === 'bar'. `config` is
  // js/menuConfig.js's output; `armedLabel` is the human name of whatever build
  // type is currently armed (null if none), which Game derives from
  // fieldBuildType/selectedRoomType.
  update(config, view, armedLabel) {
    this._config = config;

    // Relabel only the slots that change by view — see `dynamicLabel` above.
    // Base reads "Base" in the field (recentre + enter Core) and "Field" in the
    // Core (leave): one id, one meaning per view, which is what let the fixed
    // slot work at all.
    for (const slot of SLOTS) {
      if (!slot.dynamicLabel) continue;
      const leaf = config.level1.find(l => l.id === slot.key);
      if (!leaf) continue;
      const labelEl = this.slotEls[slot.key].querySelector('.bar-slot-label');
      if (labelEl.textContent !== leaf.label) labelEl.textContent = leaf.label;
    }

    // The Core view has no camera at all — game.js gates camera.update() on
    // field view, so zoom would silently do nothing here. Disabled rather than
    // hidden: the bar keeping a stable five-slot shape between views matters more
    // than reclaiming two slots, and a dead-looking button that does nothing is
    // worse than one that says it's unavailable. (The Core's own reachability is
    // fixed differently — a responsive cell size, see renderer.coreLayout().)
    const zoomable = view === 'field';
    for (const slot of SLOTS) {
      if (slot.kind !== 'zoom') continue;
      const btn = this.slotEls[slot.key];
      btn.disabled = !zoomable;
      btn.title = zoomable ? `${slot.label} (${slot.factor > 1 ? 'in' : 'out'})` : 'Zoom is field-view only';
    }

    // An armed build type gets an explicit indicator with a cancel button, per
    // this card's requirements: Escape (game.js) is otherwise the only universal
    // cancel and there's no Escape on a phone.
    this.armedEl.hidden = !armedLabel;
    if (armedLabel && this.armedLabelEl.textContent !== armedLabel) {
      this.armedLabelEl.textContent = armedLabel;
    }

    if (this.openSlotKey !== null) {
      const parent = config.level1.find(l => l.id === this.openSlotKey);
      const leaves = parent?.flyout;
      if (!leaves) this.closeDrawer(); // the open slot lost its submenu (view switch)
      else {
        const sig = this.signature(leaves);
        if (sig !== this._lastSignature) {
          this._lastSignature = sig;
          this.renderDrawer(this.openSlotKey, leaves);
        }
      }
    }
    this.syncDrawer();
  }

  // Mirrors RadialMenu#close so Game's universal-cancel path can treat the two
  // menu styles identically without branching.
  close() {
    this.closeDrawer();
    this.syncDrawer();
  }
}
