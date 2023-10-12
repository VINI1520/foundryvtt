/**
 * The global action bar displayed at the bottom of the game view.
 * The Hotbar is a UI element at the bottom of the screen which contains Macros as interactive buttons.
 * The Hotbar supports 5 pages of global macros which can be dragged and dropped to organize as you wish.
 *
 * Left-clicking a Macro button triggers its effect.
 * Right-clicking the button displays a context menu of Macro options.
 * The number keys 1 through 0 activate numbered hotbar slots.
 * Pressing the delete key while hovering over a Macro will remove it from the bar.
 *
 * @see {@link Macros}
 * @see {@link Macro}
 */
class Hotbar extends Application {
  constructor(options) {
    super(options);
    game.macros.apps.push(this);

    /**
     * The currently viewed macro page
     * @type {number}
     */
    this.page = 1;

    /**
     * The currently displayed set of macros
     * @type {Macro[]}
     */
    this.macros = [];

    /**
     * Track collapsed state
     * @type {boolean}
     */
    this._collapsed = false;

    /**
     * Track which hotbar slot is the current hover target, if any
     * @type {number|null}
     */
    this._hover = null;
  }

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "hotbar",
      template: "templates/hud/hotbar.html",
      popOut: false,
      dragDrop: [{ dragSelector: ".macro-icon", dropSelector: "#macro-list" }]
    });
  }

  /* -------------------------------------------- */

  /**
   * Whether the hotbar is locked.
   * @returns {boolean}
   */
  get locked() {
    return game.settings.get("core", "hotbarLock");
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options={}) {
    this.macros = this._getMacrosByPage(this.page);
    return {
      page: this.page,
      macros: this.macros,
      barClass: this._collapsed ? "collapsed" : "",
      locked: this.locked
    };
  }

  /* -------------------------------------------- */

  /**
   * Get the Array of Macro (or null) values that should be displayed on a numbered page of the bar
   * @param {number} page
   * @returns {Macro[]}
   * @private
   */
  _getMacrosByPage(page) {
    const macros = game.user.getHotbarMacros(page);
    for ( let [i, slot] of macros.entries() ) {
      slot.key = i<9 ? i+1 : 0;
      slot.icon = slot.macro ? slot.macro.img : null;
      slot.cssClass = slot.macro ? "active" : "inactive";
      slot.tooltip = slot.macro ? slot.macro.name : null;
    }
    return macros;
  }

  /* -------------------------------------------- */

  /**
   * Collapse the Hotbar, minimizing its display.
   * @returns {Promise}    A promise which resolves once the collapse animation completes
   */
  async collapse() {
    if ( this._collapsed ) return true;
    const toggle = this.element.find("#bar-toggle");
    const icon = toggle.children("i");
    const bar = this.element.find("#action-bar");
    return new Promise(resolve => {
      bar.slideUp(200, () => {
        bar.addClass("collapsed");
        icon.removeClass("fa-caret-down").addClass("fa-caret-up");
        this._collapsed = true;
        resolve(true);
      });
    });
  }

  /* -------------------------------------------- */

  /**
   * Expand the Hotbar, displaying it normally.
   * @returns {Promise}    A promise which resolves once the expand animation completes
   */
  async expand() {
    if ( !this._collapsed ) return true;
    const toggle = this.element.find("#bar-toggle");
    const icon = toggle.children("i");
    const bar = this.element.find("#action-bar");
    return new Promise(resolve => {
      bar.slideDown(200, () => {
        bar.css("display", "");
        bar.removeClass("collapsed");
        icon.removeClass("fa-caret-up").addClass("fa-caret-down");
        this._collapsed = false;
        resolve(true);
      });
    });
  }

  /* -------------------------------------------- */

  /**
   * Change to a specific numbered page from 1 to 5
   * @param {number} page     The page number to change to.
   */
  changePage(page) {
    this.page = Math.clamped(page ?? 1, 1, 5);
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Change the page of the hotbar by cycling up (positive) or down (negative)
   * @param {number} direction    The direction to cycle
   */
  cyclePage(direction) {
    direction = Number.isNumeric(direction) ? Math.sign(direction) : 1;
    if ( direction > 0 ) {
      this.page = this.page < 5 ? this.page+1 : 1;
    } else {
      this.page = this.page > 1 ? this.page-1 : 5;
    }
    this.render();
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Macro actions
    html.find("#bar-toggle").click(this._onToggleBar.bind(this));
    html.find("#macro-directory").click(ev => ui.macros.renderPopout(true));
    html.find(".macro").click(this._onClickMacro.bind(this));
    html.find(".page-control").click(this._onClickPageControl.bind(this));

    // Activate context menu
    this._contextMenu(html);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _contextMenu(html) {
    ContextMenu.create(this, html, ".macro", this._getEntryContextOptions());
  }

  /* -------------------------------------------- */

  /**
   * Get the Macro entry context options
   * @returns {object[]}  The Macro entry context options
   * @private
   */
  _getEntryContextOptions() {
    return [
      {
        name: "MACRO.Edit",
        icon: '<i class="fas fa-edit"></i>',
        condition: li => {
          const macro = game.macros.get(li.data("macro-id"));
          return macro ? macro.isOwner : false;
        },
        callback: li => {
          const macro = game.macros.get(li.data("macro-id"));
          macro.sheet.render(true);
        }
      },
      {
        name: "MACRO.Remove",
        icon: '<i class="fas fa-times"></i>',
        condition: li => !!li.data("macro-id"),
        callback: li => game.user.assignHotbarMacro(null, Number(li.data("slot")))
      },
      {
        name: "MACRO.Delete",
        icon: '<i class="fas fa-trash"></i>',
        condition: li => {
          const macro = game.macros.get(li.data("macro-id"));
          return macro ? macro.isOwner : false;
        },
        callback: li => {
          const macro = game.macros.get(li.data("macro-id"));
          return Dialog.confirm({
            title: `${game.i18n.localize("MACRO.Delete")} ${macro.name}`,
            content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("MACRO.DeleteWarning")}</p>`,
            yes: macro.delete.bind(macro)
          });
        }
      }
    ];
  }

  /* -------------------------------------------- */

  /**
   * Handle left-click events to
   * @param {MouseEvent} event    The originating click event
   * @protected
   */
  async _onClickMacro(event) {
    event.preventDefault();
    const li = event.currentTarget;

    // Case 1 - create a new Macro
    if ( li.classList.contains("inactive") ) {
      const macro = await Macro.create({name: "New Macro", type: "chat", scope: "global"});
      await game.user.assignHotbarMacro(macro, Number(li.dataset.slot));
      macro.sheet.render(true);
    }

    // Case 2 - trigger a Macro
    else {
      const macro = game.macros.get(li.dataset.macroId);
      return macro.execute();
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle pagination controls
   * @param {Event} event   The originating click event
   * @private
   */
  _onClickPageControl(event) {
    const action = event.currentTarget.dataset.action;
    switch ( action ) {
      case "page-up":
        this.cyclePage(1);
        break;

      case "page-down":
        this.cyclePage(-1);
        break;

      case "lock":
        this._toggleHotbarLock();
        break;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _canDragStart(selector) {
    return !this.locked;
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragStart(event) {
    const li = event.currentTarget.closest(".macro");
    const macro = game.macros.get(li.dataset.macroId);
    if ( !macro ) return false;
    const dragData = foundry.utils.mergeObject(macro.toDragData(), {slot: li.dataset.slot});
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  /* -------------------------------------------- */

  /** @override */
  _canDragDrop(selector) {
    return true;
  }

  /* -------------------------------------------- */

  /** @override */
  async _onDrop(event) {
    event.preventDefault();
    const li = event.target.closest(".macro");
    const slot = Number(li.dataset.slot);
    const data = TextEditor.getDragEventData(event);
    if ( Hooks.call("hotbarDrop", this, data, slot) === false ) return;

    // Forbid overwriting macros if the hotbar is locked.
    const existingMacro = game.macros.get(game.user.hotbar[slot]);
    if ( existingMacro && this.locked ) return ui.notifications.warn("MACRO.CannotOverwrite", { localize: true });

    // Get the dropped document
    const cls = getDocumentClass(data.type);
    const doc = await cls?.fromDropData(data);
    if ( !doc ) return;

    // Get the Macro to add to the bar
    let macro;
    if ( data.type === "Macro" ) macro = game.macros.has(doc.id) ? doc : await cls.create(doc.toObject());
    else if ( data.type === "RollTable" ) macro = await this._createRollTableRollMacro(doc);
    else macro = await this._createDocumentSheetToggle(doc);

    // Assign the macro to the hotbar
    if ( !macro ) return;
    return game.user.assignHotbarMacro(macro, slot, {fromSlot: data.slot});
  }

  /* -------------------------------------------- */

  /**
   * Create a Macro which rolls a RollTable when executed
   * @param {Document} table    The RollTable document
   * @returns {Promise<Macro>}  A created Macro document to add to the bar
   * @private
   */
  async _createRollTableRollMacro(table) {
    const command = `const table = await fromUuid("${table.uuid}");\nawait table.draw({roll: true, displayChat: true});`;
    return Macro.implementation.create({
      name: `${game.i18n.localize("TABLE.Roll")} ${table.name}`,
      type: "script",
      img: table.img,
      command
    });
  }

  /* -------------------------------------------- */

  /**
   * Create a Macro document which can be used to toggle display of a Journal Entry.
   * @param {Document} doc          A Document which should be toggled
   * @returns {Promise<Macro>}      A created Macro document to add to the bar
   * @protected
   */
  async _createDocumentSheetToggle(doc) {
    const name = doc.name || `${game.i18n.localize(doc.constructor.metadata.label)} ${doc.id}`;
    return Macro.implementation.create({
      name: `${game.i18n.localize("Display")} ${name}`,
      type: CONST.MACRO_TYPES.SCRIPT,
      img: "icons/svg/book.svg",
      command: `await Hotbar.toggleDocumentSheet("${doc.uuid}");`
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle click events to toggle display of the macro bar
   * @param {Event} event
   * @private
   */
  _onToggleBar(event) {
    event.preventDefault();
    if ( this._collapsed ) return this.expand();
    else return this.collapse();
  }

  /* -------------------------------------------- */

  /**
   * Toggle the hotbar's lock state.
   * @returns {Promise<Hotbar>}
   * @protected
   */
  async _toggleHotbarLock() {
    await game.settings.set("core", "hotbarLock", !this.locked);
    return this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling a document sheet.
   * @param {string} uuid     The Document UUID to display
   * @returns {Promise<void>|Application|*}
   */
  static async toggleDocumentSheet(uuid) {
    const doc = await fromUuid(uuid);
    if ( !doc ) {
      return ui.notifications.warn(game.i18n.format("WARNING.ObjectDoesNotExist", {
        name: game.i18n.localize("Document"),
        identifier: uuid
      }));
    }
    const sheet = doc.sheet;
    return sheet.rendered ? sheet.close() : sheet.render(true);
  }
}
