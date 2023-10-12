/**
 * A class responsible for managing defined game keybinding.
 * Each keybinding is a string key/value pair belonging to a certain namespace and a certain store scope.
 *
 * When Foundry Virtual Tabletop is initialized, a singleton instance of this class is constructed within the global
 * Game object as as game.keybindings.
 *
 * @see {@link Game#keybindings}
 * @see {@link SettingKeybindingConfig}
 * @see {@link KeybindingsConfig}
 */
class ClientKeybindings {
  constructor() {

    /**
     * Registered Keybinding actions
     * @type {Map<string, KeybindingActionConfig>}
     */
    this.actions = new Map();

    /**
     * A mapping of a string key to possible Actions that might execute off it
     * @type {Map<string, KeybindingAction[]>}
     */
    this.activeKeys = new Map();

    /**
     * A stored cache of Keybind Actions Ids to Bindings
     * @type {Map<string, KeybindingActionBinding[]>}
     */
    this.bindings = undefined;

    /**
     * A count of how many registered keybindings there are
     * @type {number}
     * @private
     */
    this._registered = 0;

    /**
     * A timestamp which tracks the last time a pan operation was performed
     * @type {number}
     * @private
     */
    this._moveTime = 0;
  }

  static MOVEMENT_DIRECTIONS = {
    UP: "up",
    LEFT: "left",
    DOWN: "down",
    RIGHT: "right"
  };

  static ZOOM_DIRECTIONS = {
    IN: "in",
    OUT: "out"
  };

  /**
   * An alias of the movement key set tracked by the keyboard
   * @returns {Set<string>}>
   */
  get moveKeys() {
    return game.keyboard.moveKeys;
  }

  /* -------------------------------------------- */

  /**
   * Initializes the keybinding values for all registered actions
   */
  initialize() {

    // Create the bindings mapping for all actions which have been registered
    this.bindings = new Map(Object.entries(game.settings.get("core", "keybindings")));
    for ( let k of Array.from(this.bindings.keys()) ) {
      if ( !this.actions.has(k) ) this.bindings.delete(k);
    }

    // Register bindings for all actions
    for ( let [action, config] of this.actions) {
      let bindings = config.uneditable;
      bindings = config.uneditable.concat(this.bindings.get(action) ?? config.editable);
      this.bindings.set(action, bindings);
    }

    // Create a mapping of keys which trigger actions
    this.activeKeys = new Map();
    for ( let [key, action] of this.actions ) {
      let bindings = this.bindings.get(key);
      for ( let binding of bindings ) {
        if ( !binding ) continue;
        if ( !this.activeKeys.has(binding.key) ) this.activeKeys.set(binding.key, []);
        let actions = this.activeKeys.get(binding.key);
        actions.push({
          action: key,
          key: binding.key,
          name: action.name,
          requiredModifiers: binding.modifiers,
          optionalModifiers: action.reservedModifiers,
          onDown: action.onDown,
          onUp: action.onUp,
          precedence: action.precedence,
          order: action.order,
          repeat: action.repeat,
          restricted: action.restricted
        });
        this.activeKeys.set(binding.key, actions.sort(this.constructor._compareActions));
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Register a new keybinding
   *
   * @param {string} namespace                  The namespace the Keybinding Action belongs to
   * @param {string} action                     A unique machine-readable id for the Keybinding Action
   * @param {KeybindingActionConfig} data       Configuration for keybinding data
   *
   * @example Define a keybinding which shows a notification
   * ```js
   * game.keybindings.register("myModule", "showNotification", {
   *   name: "My Settings Keybinding",
   *   hint: "A description of what will occur when the Keybinding is executed.",
   *   uneditable: [
   *     {
   *       key: "Digit1",
   *       modifiers: ["Control"]
   *     }
   *   ],
   *   editable: [
   *     {
   *       key: "F1"
   *     }
   *   ],
   *   onDown: () => { ui.notifications.info("Pressed!") },
   *   onUp: () => {},
   *   restricted: true,             // Restrict this Keybinding to gamemaster only?
   *   reservedModifiers: ["Alt""],  // On ALT, the notification is permanent instead of temporary
   *   precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
   * }
   * ```
   */
  register(namespace, action, data) {
    if ( this.bindings ) throw new Error("You cannot register a Keybinding after the init hook");
    if ( !namespace || !action ) throw new Error("You must specify both the namespace and action portion of the Keybinding action");
    action = `${namespace}.${action}`;
    data.namespace = namespace;
    data.precedence = data.precedence ?? CONST.KEYBINDING_PRECEDENCE.NORMAL;
    data.order = this._registered++;
    data.uneditable = this.constructor._validateBindings(data.uneditable ?? []);
    data.editable = this.constructor._validateBindings(data.editable ?? []);
    data.repeat = data.repeat ?? false;
    data.reservedModifiers = this.constructor._validateModifiers(data.reservedModifiers ?? []);
    this.actions.set(action, data);
  }

  /* -------------------------------------------- */

  /**
   * Get the current Bindings of a given namespace's Keybinding Action
   *
   * @param {string} namespace   The namespace under which the setting is registered
   * @param {string} action      The keybind action to retrieve
   * @returns {KeybindingActionBinding[]}
   *
   * @example Retrieve the current Keybinding Action Bindings
   * ```js
   * game.keybindings.get("myModule", "showNotification");
   * ```
   */
  get(namespace, action) {
    if ( !namespace || !action ) throw new Error("You must specify both namespace and key portions of the keybind");
    action = `${namespace}.${action}`;
    const keybind = this.actions.get(action);
    if ( !keybind ) throw new Error("This is not a registered keybind action");
    return this.bindings.get(action) || [];
  }

  /* -------------------------------------------- */

  /**
   * Set the editable Bindings of a Keybinding Action for a certain namespace and Action
   *
   * @param {string} namespace                    The namespace under which the Keybinding is registered
   * @param {string} action                       The Keybinding action to set
   * @param {KeybindingActionBinding[]} bindings  The Bindings to assign to the Keybinding
   *
   * @example Update the current value of a keybinding
   * ```js
   * game.keybindings.set("myModule", "showNotification", [
   *     {
   *       key: "F2",
   *       modifiers: [ "CONTROL" ]
   *     }
   * ]);
   * ```
   */
  async set(namespace, action, bindings) {
    if ( !namespace || !action ) throw new Error("You must specify both namespace and action portions of the Keybind");
    action = `${namespace}.${action}`;
    const keybind = this.actions.get(action);
    if ( !keybind ) throw new Error("This is not a registered keybind");
    if ( keybind.restricted && !game.user.isGM ) throw new Error("Only a GM can edit this keybind");
    const mapping = game.settings.get("core", "keybindings");

    // Set to default if value is undefined and return
    if ( bindings === undefined ) {
      delete mapping[action];
      return game.settings.set("core", "keybindings", mapping);
    }
    bindings = this.constructor._validateBindings(bindings);

    // Verify no reserved Modifiers were set as Keys
    for ( let binding of bindings ) {
      if ( keybind.reservedModifiers.includes(binding.key) ) {
        throw new Error(game.i18n.format("KEYBINDINGS.ErrorReservedModifier", {key: binding.key}));
      }
    }

    // Save editable bindings to setting
    mapping[action] = bindings;
    await game.settings.set("core", "keybindings", mapping);
  }

  /* ---------------------------------------- */

  /**
   * Reset all client keybindings back to their default configuration.
   */
  async resetDefaults() {
    const setting = game.settings.settings.get("core.keybindings");
    return game.settings.set("core", "keybindings", setting.default);
  }

  /* -------------------------------------------- */

  /**
   * A helper method that, when given a value, ensures that the returned value is a standardized Binding array
   * @param {KeybindingActionBinding[]} values  An array of keybinding assignments to be validated
   * @returns {KeybindingActionBinding[]}       An array of keybinding assignments confirmed as valid
   * @private
   */
  static _validateBindings(values) {
    if ( !(values instanceof Array) ) throw new Error(game.i18n.localize("KEYBINDINGS.MustBeArray"));
    for ( let binding of values ) {
      if ( !binding.key ) throw new Error("Each KeybindingActionBinding must contain a valid key designation");
      if ( KeyboardManager.PROTECTED_KEYS.includes(binding.key) ) {
        throw new Error(game.i18n.format("KEYBINDINGS.ErrorProtectedKey", { key: binding.key }));
      }
      binding.modifiers = this._validateModifiers(binding.modifiers ?? []);
    }
    return values;
  }

  /* -------------------------------------------- */

  /**
   * Validate that assigned modifiers are allowed
   * @param {string[]} keys           An array of modifiers which may be valid
   * @returns {string[]}              An array of modifiers which are confirmed as valid
   * @private
   */
  static _validateModifiers(keys) {
    const modifiers = [];
    for ( let key of keys ) {
      if ( key in KeyboardManager.MODIFIER_KEYS ) key = KeyboardManager.MODIFIER_KEYS[key]; // backwards-compat
      if ( !Object.values(KeyboardManager.MODIFIER_KEYS).includes(key) ) {
        throw new Error(game.i18n.format("KEYBINDINGS.ErrorIllegalModifier", { key, allowed: modifiers.join(",") }));
      }
      modifiers.push(key);
    }
    return modifiers;
  }

  /* -------------------------------------------- */

  /**
   * Compares two Keybinding Actions based on their Order
   * @param {KeybindingAction} a   The first Keybinding Action
   * @param {KeybindingAction} b   the second Keybinding Action
   * @returns {number}
   * @internal
   */
  static _compareActions(a, b) {
    if (a.precedence === b.precedence) return a.order - b.order;
    return a.precedence - b.precedence;
  }

  /* ---------------------------------------- */
  /*  Core Keybinding Actions                 */
  /* ---------------------------------------- */

  /**
   * Register core keybindings
   */
  _registerCoreKeybindings() {
    const {SHIFT, CONTROL, ALT} = KeyboardManager.MODIFIER_KEYS;
    game.keybindings.register("core", "cycleView", {
      name: "KEYBINDINGS.CycleView",
      editable: [
        {key: "Tab"}
      ],
      onDown: ClientKeybindings._onCycleView,
      reservedModifiers: [SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "dismiss", {
      name: "KEYBINDINGS.Dismiss",
      uneditable: [
        {key: "Escape"}
      ],
      onDown: ClientKeybindings._onDismiss,
      precedence: CONST.KEYBINDING_PRECEDENCE.DEFERRED
    });
    game.keybindings.register("core", "measuredRulerMovement", {
      name: "KEYBINDINGS.MoveAlongMeasuredRuler",
      editable: [
        {key: "Space"}
      ],
      onDown: ClientKeybindings._onMeasuredRulerMovement,
      precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
      reservedModifiers: [CONTROL]
    });
    game.keybindings.register("core", "pause", {
      name: "KEYBINDINGS.Pause",
      restricted: true,
      editable: [
        {key: "Space"}
      ],
      onDown: ClientKeybindings._onPause,
      precedence: CONST.KEYBINDING_PRECEDENCE.DEFERRED
    });
    game.keybindings.register("core", "delete", {
      name: "KEYBINDINGS.Delete",
      uneditable: [
        {key: "Delete"}
      ],
      editable: [
        {key: "Backspace"}
      ],
      onDown: ClientKeybindings._onDelete
    });
    game.keybindings.register("core", "highlight", {
      name: "KEYBINDINGS.Highlight",
      editable: [
        {key: "AltLeft"},
        {key: "AltRight"}
      ],
      onUp: ClientKeybindings._onHighlight,
      onDown: ClientKeybindings._onHighlight
    });
    game.keybindings.register("core", "selectAll", {
      name: "KEYBINDINGS.SelectAll",
      uneditable: [
        {key: "KeyA", modifiers: [CONTROL]}
      ],
      onDown: ClientKeybindings._onSelectAllObjects
    });
    game.keybindings.register("core", "undo", {
      name: "KEYBINDINGS.Undo",
      uneditable: [
        {key: "KeyZ", modifiers: [CONTROL]}
      ],
      onDown: ClientKeybindings._onUndo
    });
    game.keybindings.register("core", "copy", {
      name: "KEYBINDINGS.Copy",
      uneditable: [
        {key: "KeyC", modifiers: [CONTROL]}
      ],
      onDown: ClientKeybindings._onCopy
    });
    game.keybindings.register("core", "paste", {
      name: "KEYBINDINGS.Paste",
      uneditable: [
        {key: "KeyV", modifiers: [CONTROL]}
      ],
      onDown: ClientKeybindings._onPaste,
      reservedModifiers: [ALT, SHIFT]
    });
    game.keybindings.register("core", "target", {
      name: "KEYBINDINGS.Target",
      editable: [
        {key: "KeyT"}
      ],
      onDown: ClientKeybindings._onTarget,
      reservedModifiers: [SHIFT]
    });
    game.keybindings.register("core", "characterSheet", {
      name: "KEYBINDINGS.ToggleCharacterSheet",
      editable: [
        {key: "KeyC"}
      ],
      onDown: ClientKeybindings._onToggleCharacterSheet,
      precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY
    });
    game.keybindings.register("core", "panUp", {
      name: "KEYBINDINGS.PanUp",
      uneditable: [
        {key: "ArrowUp"},
        {key: "Numpad8"}
      ],
      editable: [
        {key: "KeyW"}
      ],
      onUp: context => this._onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.UP]),
      onDown: context => this._onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.UP]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "panLeft", {
      name: "KEYBINDINGS.PanLeft",
      uneditable: [
        {key: "ArrowLeft"},
        {key: "Numpad4"}
      ],
      editable: [
        {key: "KeyA"}
      ],
      onUp: context => this._onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT]),
      onDown: context => this._onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "panDown", {
      name: "KEYBINDINGS.PanDown",
      uneditable: [
        {key: "ArrowDown"},
        {key: "Numpad2"}
      ],
      editable: [
        {key: "KeyS"}
      ],
      onUp: context => this._onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.DOWN]),
      onDown: context => this._onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.DOWN]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "panRight", {
      name: "KEYBINDINGS.PanRight",
      uneditable: [
        {key: "ArrowRight"},
        {key: "Numpad6"}
      ],
      editable: [
        {key: "KeyD"}
      ],
      onUp: context => this._onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT]),
      onDown: context => this._onPan(context, [ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "panUpLeft", {
      name: "KEYBINDINGS.PanUpLeft",
      uneditable: [
        {key: "Numpad7"}
      ],
      onUp: context => this._onPan(context,
        [ClientKeybindings.MOVEMENT_DIRECTIONS.UP, ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT]),
      onDown: context => this._onPan(context,
        [ClientKeybindings.MOVEMENT_DIRECTIONS.UP, ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "panUpRight", {
      name: "KEYBINDINGS.PanUpRight",
      uneditable: [
        {key: "Numpad9"}
      ],
      onUp: context => this._onPan(context,
        [ClientKeybindings.MOVEMENT_DIRECTIONS.UP, ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT]),
      onDown: context => this._onPan(context,
        [ClientKeybindings.MOVEMENT_DIRECTIONS.UP, ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "panDownLeft", {
      name: "KEYBINDINGS.PanDownLeft",
      uneditable: [
        {key: "Numpad1"}
      ],
      onUp: context => this._onPan(context,
        [ClientKeybindings.MOVEMENT_DIRECTIONS.DOWN, ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT]),
      onDown: context => this._onPan(context,
        [ClientKeybindings.MOVEMENT_DIRECTIONS.DOWN, ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "panDownRight", {
      name: "KEYBINDINGS.PanDownRight",
      uneditable: [
        {key: "Numpad3"}
      ],
      onUp: context => this._onPan(context,
        [ClientKeybindings.MOVEMENT_DIRECTIONS.DOWN, ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT]),
      onDown: context => this._onPan(context,
        [ClientKeybindings.MOVEMENT_DIRECTIONS.DOWN, ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT]),
      reservedModifiers: [CONTROL, SHIFT],
      repeat: true
    });
    game.keybindings.register("core", "zoomIn", {
      name: "KEYBINDINGS.ZoomIn",
      uneditable: [
        {key: "NumpadAdd"}
      ],
      editable: [
        {key: "PageUp"}
      ],
      onDown: context => { ClientKeybindings._onZoom(context, ClientKeybindings.ZOOM_DIRECTIONS.IN); },
      repeat: true
    });
    game.keybindings.register("core", "zoomOut", {
      name: "KEYBINDINGS.ZoomOut",
      uneditable: [
        {key: "NumpadSubtract"}
      ],
      editable: [
        {key: "PageDown"}
      ],
      onDown: context => { ClientKeybindings._onZoom(context, ClientKeybindings.ZOOM_DIRECTIONS.OUT); },
      repeat: true
    });
    for ( const number of Array.fromRange(9, 1).concat([0]) ) {
      game.keybindings.register("core", `executeMacro${number}`, {
        name: game.i18n.format("KEYBINDINGS.ExecuteMacro", { number }),
        editable: [{key: `Digit${number}`}],
        onDown: context => ClientKeybindings._onMacroExecute(context, number),
        precedence: CONST.KEYBINDING_PRECEDENCE.DEFERRED
      });
    }
    for ( const page of Array.fromRange(5, 1) ) {
      game.keybindings.register("core", `swapMacroPage${page}`, {
        name: game.i18n.format("KEYBINDINGS.SwapMacroPage", { page }),
        editable: [{key: `Digit${page}`, modifiers: [ALT]}],
        onDown: context => ClientKeybindings._onMacroPageSwap(context, page),
        precedence: CONST.KEYBINDING_PRECEDENCE.DEFERRED
      });
    }
    game.keybindings.register("core", "pushToTalk", {
      name: "KEYBINDINGS.PTTKey",
      editable: [{key: "Backquote"}],
      onDown: game.webrtc._onPTTStart.bind(game.webrtc),
      onUp: game.webrtc._onPTTEnd.bind(game.webrtc),
      precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
      repeat: false
    });
    game.keybindings.register("core", "focusChat", {
      name: "KEYBINDINGS.FocusChat",
      editable: [{key: "KeyC", modifiers: [SHIFT]}],
      onDown: ClientKeybindings._onFocusChat,
      precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
      repeat: false
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle Select all action
   * @param {KeyboardEvent} event             The originating keyboard event
   * @param {KeyboardEventContext} context    The context data of the event
   * @private
   */
  static _onSelectAllObjects(event, context) {
    if ( !canvas.ready) return false;
    canvas.activeLayer.controlAll();
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle Cycle View actions
   * @param {KeyboardEventContext} context    The context data of the event
   * @private
   */
  static _onCycleView(context) {
    if ( !canvas.ready ) return false;

    // Attempt to cycle tokens, otherwise re-center the canvas
    if ( canvas.tokens.active ) {
      let cycled = canvas.tokens.cycleTokens(!context.isShift, false);
      if ( !cycled ) canvas.recenter();
    }
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle Dismiss actions
   * @param {KeyboardEventContext} context    The context data of the event
   * @private
   */
  static _onDismiss(context) {

    // Save fog of war if there are pending changes
    if ( canvas.ready ) canvas.fog.commit();

    // Case 1 - dismiss an open context menu
    if (ui.context && ui.context.menu.length) {
      ui.context.close();
      return true;
    }

    // Case 2 - dismiss an open Tour
    if (Tour.tourInProgress) {
      Tour.activeTour.exit();
      return true;
    }

    // Case 3 - close open UI windows
    if (Object.keys(ui.windows).length) {
      Object.values(ui.windows).forEach(app => app.close());
      return true;
    }

    // Case 4 (GM) - release controlled objects (if not in a preview)
    if (game.user.isGM && (canvas.activeLayer instanceof PlaceablesLayer) && canvas.activeLayer.controlled.length) {
      if ( !canvas.activeLayer.preview?.children.length ) canvas.activeLayer.releaseAll();
      return true;
    }

    // Case 5 - toggle the main menu
    ui.menu.toggle();
    // Save the fog immediately rather than waiting for the 3s debounced save as part of commitFog.
    if ( canvas.ready ) canvas.fog.save();
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Open Character sheet for current token or controlled actor
   * @param {KeyboardEvent} event             The initiating keyboard event
   * @param {KeyboardEventContext} context    The context data of the event
   * @private
   */
  static _onToggleCharacterSheet(event, context) {
    return game.toggleCharacterSheet();
  }

  /* -------------------------------------------- */

  /**
   * Handle action to target the currently hovered token.
   * @param {KeyboardEventContext} context    The context data of the event
   * @private
   */
  static _onTarget(context) {
    if ( !canvas.ready ) return false;
    const layer = canvas.activeLayer;
    if ( !(layer instanceof TokenLayer) ) return false;
    const hovered = layer.hover;
    if ( !hovered ) return false;
    hovered.setTarget(!hovered.isTargeted, {releaseOthers: !context.isShift});
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle DELETE Keypress Events
   * @param {KeyboardEvent} event             The originating keyboard event
   * @param {KeyboardEventContext} context    The context data of the event
   * @private
   */
  static _onDelete(event, context) {
    // Remove hotbar Macro
    if ( ui.hotbar._hover ) {
      game.user.assignHotbarMacro(null, ui.hotbar._hover);
      return true;
    }

    // Delete placeables from Canvas layer
    else if ( canvas.ready && ( canvas.activeLayer instanceof PlaceablesLayer ) ) {
      canvas.activeLayer._onDeleteKey(event);
      return true;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle keyboard movement once a small delay has elapsed to allow for multiple simultaneous key-presses.
   * @param {KeyboardEventContext} context        The context data of the event
   * @param {InteractionLayer} layer              The active InteractionLayer instance
   * @private
   */
  _handleMovement(context, layer) {
    if ( !this.moveKeys.size ) return;

    // Get controlled objects
    let objects = layer.placeables.filter(o => o.controlled);
    if ( objects.length === 0 ) return;

    // Define movement offsets and get moved directions
    const directions = this.moveKeys;
    let dx = 0;
    let dy = 0;

    // Assign movement offsets
    if ( directions.has(ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT) ) dx -= 1;
    else if ( directions.has(ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT) ) dx += 1;
    if ( directions.has(ClientKeybindings.MOVEMENT_DIRECTIONS.UP) ) dy -= 1;
    else if ( directions.has(ClientKeybindings.MOVEMENT_DIRECTIONS.DOWN) ) dy += 1;

    // Perform the shift or rotation
    layer.moveMany({dx, dy, rotate: context.isShift});
  }

  /* -------------------------------------------- */

  /**
   * Handle panning the canvas using CTRL + directional keys
   */
  _handleCanvasPan() {

    // Determine movement offsets
    let dx = 0;
    let dy = 0;
    if (this.moveKeys.has(ClientKeybindings.MOVEMENT_DIRECTIONS.LEFT)) dx -= 1;
    if (this.moveKeys.has(ClientKeybindings.MOVEMENT_DIRECTIONS.UP)) dy -= 1;
    if (this.moveKeys.has(ClientKeybindings.MOVEMENT_DIRECTIONS.RIGHT)) dx += 1;
    if (this.moveKeys.has(ClientKeybindings.MOVEMENT_DIRECTIONS.DOWN)) dy += 1;

    // Clear the pending set
    this.moveKeys.clear();

    // Pan by the grid size
    const s = canvas.dimensions.size;
    return canvas.animatePan({
      x: canvas.stage.pivot.x + (dx * s),
      y: canvas.stage.pivot.y + (dy * s),
      duration: 100
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle Measured Ruler Movement Action
   * @param {KeyboardEventContext} context    The context data of the event
   * @private
   */
  static _onMeasuredRulerMovement(context) {

    // Move along a measured ruler
    const ruler = canvas.controls?.ruler;
    if ( canvas.ready && ruler.active ) {
      ruler.moveToken();
      return true;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle Pause Action
   * @param {KeyboardEventContext} context    The context data of the event
   * @private
   */
  static _onPause(context) {
    game.togglePause(undefined, true);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle Highlight action
   * @param {KeyboardEventContext} context    The context data of the event
   * @private
   */
  static _onHighlight(context) {
    if ( !canvas.ready ) return false;
    canvas.highlightObjects(!context.up);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle Pan action
   * @param {KeyboardEventContext} context          The context data of the event
   * @param {string[]} movementDirections           The Directions being panned in
   * @private
   */
  _onPan(context, movementDirections) {

    // Case 1: Check for Tour
    if ( (Tour.tourInProgress) && (!context.repeat) && (!context.up) ) {
      Tour.onMovementAction(movementDirections);
      return true;
    }

    // Case 2: Check for Canvas
    if ( !canvas.ready ) return false;

    // Remove Keys on Up
    if ( context.up ) {
      for ( let d of movementDirections ) {
        this.moveKeys.delete(d);
      }
      return true;
    }

    // Keep track of when we last moved
    const now = Date.now();
    const delta = now - this._moveTime;

    // Track the movement set
    for ( let d of movementDirections ) {
      this.moveKeys.add(d);
    }

    // Handle canvas pan using CTRL
    if ( context.isControl ) {
      if ( ["KeyW", "KeyA", "KeyS", "KeyD"].includes(context.key) ) return false;
      this._handleCanvasPan();
      return true;
    }

    // Delay 50ms before shifting tokens in order to capture diagonal movements
    const layer = canvas.activeLayer;
    if ( (layer === canvas.tokens) || (layer === canvas.tiles) ) {
      if ( delta < 100 ) return true; // Throttle keyboard movement once per 100ms
      setTimeout(() => this._handleMovement(context, layer), 50);
    }
    this._moveTime = now;
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle Macro executions
   * @param {KeyboardEventContext} context  The context data of the event
   * @param {number} number                 The numbered macro slot to execute
   * @private
   */
  static _onMacroExecute(context, number) {
    const slot = ui.hotbar.macros.find(m => m.key === number);
    if ( slot.macro ) {
      slot.macro.execute();
      return true;
    }
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Handle Macro page swaps
   * @param {KeyboardEventContext} context    The context data of the event
   * @param {number} page                     The numbered macro page to activate
   * @private
   */
  static _onMacroPageSwap(context, page) {
    ui.hotbar.changePage(page);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle action to copy data to clipboard
   * @param {KeyboardEventContext} context    The context data of the event
   * @private
   */
  static _onCopy(context) {
    // Case 1 - attempt a copy operation on the PlaceablesLayer
    if (window.getSelection().toString() !== "") return false;
    if ( !canvas.ready ) return false;
    let layer = canvas.activeLayer;
    if ( layer instanceof PlaceablesLayer ) layer.copyObjects();
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle Paste action
   * @param {KeyboardEventContext} context    The context data of the event
   * @private
   */
  static _onPaste(context ) {
    if ( !canvas.ready ) return false;
    let layer = canvas.activeLayer;
    if ( (layer instanceof PlaceablesLayer) && layer._copy.length ) {
      const pos = canvas.mousePosition;
      layer.pasteObjects(pos, {hidden: context.isAlt, snap: !context.isShift});
      return true;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle Undo action
   * @param {KeyboardEventContext} context    The context data of the event
   * @private
   */
  static _onUndo(context) {
    if ( !canvas.ready ) return false;

    // Undo history for a PlaceablesLayer
    const layer = canvas.activeLayer;
    if ( !(layer instanceof PlaceablesLayer) ) return false;
    if ( layer.history.length ) {
      layer.undoHistory();
      return true;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle presses to keyboard zoom keys
   * @param {KeyboardEventContext} context                    The context data of the event
   * @param {ClientKeybindings.ZOOM_DIRECTIONS} zoomDirection The direction to zoom
   * @private
   */
  static _onZoom(context, zoomDirection ) {
    if ( !canvas.ready ) return false;
    const delta = zoomDirection === ClientKeybindings.ZOOM_DIRECTIONS.IN ? 1.05 : 0.95;
    canvas.animatePan({scale: delta * canvas.stage.scale.x, duration: 100});
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Bring the chat window into view and focus the input
   * @param {KeyboardEventContext} context    The context data of the event
   * @returns {boolean}
   * @private
   */
  static _onFocusChat(context) {
    const sidebar = ui.sidebar._element[0];
    ui.sidebar.activateTab(ui.chat.tabName);

    // If the sidebar is collapsed and the chat popover is not visible, open it
    if ( sidebar.classList.contains("collapsed") && !ui.chat._popout ) {
      const popout = ui.chat.createPopout();
      popout._render(true).then(() => {
        popout.element.find("#chat-message").focus();
      });
    }
    else {
      ui.chat.element.find("#chat-message").focus();
    }
    return true;
  }
}
