/**
 * Allows for viewing and editing of Keybinding Actions
 */
class KeybindingsConfig extends PackageConfiguration {

  /**
   * Categories present in the app. Within each category is an array of package data
   * @type {{categories: object[], total: number}}
   * @protected
   */
  #cachedData;

  /**
   * A Map of pending Edits. The Keys are bindingIds
   * @type {Map<string, KeybindingActionBinding[]>}
   * @private
   */
  #pendingEdits = new Map();

  /* -------------------------------------------- */

  /** @inheritDoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: game.i18n.localize("SETTINGS.Keybindings"),
      id: "keybindings",
      categoryTemplate: "templates/sidebar/apps/keybindings-config-category.html",
      scrollY: [".scrollable"]
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static get categoryOrder() {
    const categories = super.categoryOrder;
    categories.splice(2, 0, "core-mouse");
    return categories;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _categorizeEntry(namespace) {
    const category = super._categorizeEntry(namespace);
    if ( namespace === "core" ) category.title = game.i18n.localize("KEYBINDINGS.CoreKeybindings");
    return category;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareCategoryData() {
    if ( this.#cachedData ) return this.#cachedData;

    // Classify all Actions
    let categories = new Map();
    let totalActions = 0;
    const ctrlString = KeyboardManager.CONTROL_KEY_STRING;
    for ( let [actionId, action] of game.keybindings.actions ) {
      if ( action.restricted && !game.user.isGM ) continue;
      totalActions++;

      // Determine what category the action belongs to
      let category = this._categorizeEntry(action.namespace);

      // Carry over bindings for future rendering
      const actionData = foundry.utils.deepClone(action);
      actionData.category = category.title;
      actionData.id = actionId;
      actionData.name = game.i18n.localize(action.name);
      actionData.hint = game.i18n.localize(action.hint);
      actionData.cssClass = action.restricted ? "gm" : "";
      actionData.notes = [
        action.restricted ? game.i18n.localize("KEYBINDINGS.Restricted") : "",
        action.reservedModifiers.length > 0 ? game.i18n.format("KEYBINDINGS.ReservedModifiers", {
          modifiers: action.reservedModifiers.map(m => m === "Control" ? ctrlString : m.titleCase()).join(", ")
        }) : "",
        game.i18n.localize(action.hint)
      ].filterJoin("<br>");
      actionData.uneditable = action.uneditable;

      // Prepare binding-level data
      actionData.bindings = (game.keybindings.bindings.get(actionId) ?? []).map((b, i) => {
        const uneditable = action.uneditable.includes(b);
        const binding = foundry.utils.deepClone(b);
        binding.id = `${actionId}.binding.${i}`;
        binding.display = KeybindingsConfig._humanizeBinding(binding);
        binding.cssClasses = uneditable ? "uneditable" : "";
        binding.isEditable = !uneditable;
        binding.isFirst = i === 0;
        const conflicts = this._detectConflictingActions(actionId, action, binding);
        binding.conflicts = game.i18n.format("KEYBINDINGS.Conflict", {
          conflicts: conflicts.map(action => game.i18n.localize(action.name)).join(", ")
        });
        binding.hasConflicts = conflicts.length > 0;
        return binding;
      });
      actionData.noBindings = actionData.bindings.length === 0;

      // Register a category the first time it is seen, otherwise add to it
      if ( !categories.has(category.id) ) {
        categories.set(category.id, {
          id: category.id,
          title: category.title,
          actions: [actionData],
          count: 0
        });

      } else categories.get(category.id).actions.push(actionData);
    }

    // Add Mouse Controls
    totalActions += this._addMouseControlsReference(categories);

    // Sort Actions by priority and assign Counts
    for ( let category of categories.values() ) {
      category.actions = category.actions.sort(ClientKeybindings._compareActions);
      category.count = category.actions.length;
    }
    categories = Array.from(categories.values()).sort(this._sortCategories.bind(this));
    return this.#cachedData = {categories, total: totalActions};
  }

  /* -------------------------------------------- */

  /**
   * Add faux-keybind actions that represent the possible Mouse Controls
   * @param {Map} categories    The current Map of Categories to add to
   * @returns {number}           The number of Actions added
   * @private
   */
  _addMouseControlsReference(categories) {
    let coreMouseCategory = game.i18n.localize("KEYBINDINGS.CoreMouse");

    const defineMouseAction = (id, name, keys, gmOnly=false) => {
      return {
        category: coreMouseCategory,
        id: id,
        name: game.i18n.localize(name),
        notes: gmOnly ? game.i18n.localize("KEYBINDINGS.Restricted") : "",
        bindings: [
          {
            display: keys.map(k => game.i18n.localize(k)).join(" + "),
            cssClasses: "uneditable",
            isEditable: false,
            hasConflicts: false,
            isFirst: false
          }
        ]
      };
    };

    const actions = [
      ["canvas-select", "CONTROLS.CanvasSelect", ["CONTROLS.LeftClick"]],
      ["canvas-select-many", "CONTROLS.CanvasSelectMany", ["Shift", "CONTROLS.LeftClick"]],
      ["canvas-drag", "CONTROLS.CanvasLeftDrag", ["CONTROLS.LeftClick", "CONTROLS.Drag"]],
      ["canvas-select-cancel", "CONTROLS.CanvasSelectCancel", ["CONTROLS.RightClick"]],
      ["canvas-pan-mouse", "CONTROLS.CanvasPan", ["CONTROLS.RightClick", "CONTROLS.Drag"]],
      ["canvas-zoom", "CONTROLS.CanvasSelectCancel", ["CONTROLS.MouseWheel"]],
      ["ruler-measure", "CONTROLS.RulerMeasure", [KeyboardManager.CONTROL_KEY_STRING, "CONTROLS.LeftDrag"]],
      ["ruler-measure-waypoint", "CONTROLS.RulerWaypoint", [KeyboardManager.CONTROL_KEY_STRING, "CONTROLS.LeftClick"]],
      ["object-sheet", "CONTROLS.ObjectSheet", [`${game.i18n.localize("CONTROLS.Double")} ${game.i18n.localize("CONTROLS.LeftClick")}`]],
      ["object-hud", "CONTROLS.ObjectHUD", ["CONTROLS.RightClick"]],
      ["object-config", "CONTROLS.ObjectConfig", [`${game.i18n.localize("CONTROLS.Double")} ${game.i18n.localize("CONTROLS.RightClick")}`]],
      ["object-drag", "CONTROLS.ObjectDrag", ["CONTROLS.LeftClick", "CONTROLS.Drag"]],
      ["object-no-snap", "CONTROLS.ObjectNoSnap", ["CONTROLS.Drag", "Shift", "CONTROLS.Drop"]],
      ["object-drag-cancel", "CONTROLS.ObjectDragCancel", [`${game.i18n.localize("CONTROLS.RightClick")} ${game.i18n.localize("CONTROLS.During")} ${game.i18n.localize("CONTROLS.Drag")}`]],
      ["object-rotate-slow", "CONTROLS.ObjectRotateSlow", [KeyboardManager.CONTROL_KEY_STRING, "CONTROLS.MouseWheel"]],
      ["object-rotate-fast", "CONTROLS.ObjectRotateFast", ["Shift", "CONTROLS.MouseWheel"]],
      ["place-hidden-token", "CONTROLS.TokenPlaceHidden", ["Alt", "CONTROLS.Drop"], true],
      ["token-target-mouse", "CONTROLS.TokenTarget", [`${game.i18n.localize("CONTROLS.Double")} ${game.i18n.localize("CONTROLS.RightClick")}`]],
      ["canvas-ping", "CONTROLS.CanvasPing", ["CONTROLS.LongPress"]],
      ["canvas-ping-alert", "CONTROLS.CanvasPingAlert", ["Alt", "CONTROLS.LongPress"]],
      ["canvas-ping-pull", "CONTROLS.CanvasPingPull", ["Shift", "CONTROLS.LongPress"], true],
      ["tooltip-lock", "CONTROLS.TooltipLock", ["CONTROLS.MiddleClick"]],
      ["tooltip-dismiss", "CONTROLS.TooltipDismiss", ["CONTROLS.RightClick"]]
    ];

    let coreMouseCategoryData = {
      id: "core-mouse",
      title: coreMouseCategory,
      actions: actions.map(a => defineMouseAction(...a)),
      count: 0
    };
    coreMouseCategoryData.count = coreMouseCategoryData.actions.length;
    categories.set("core-mouse", coreMouseCategoryData);
    return coreMouseCategoryData.count;
  }

  /* -------------------------------------------- */

  /**
   * Given an Binding and its parent Action, detects other Actions that might conflict with that binding
   * @param {string} actionId                   The namespaced Action ID the Binding belongs to
   * @param {KeybindingActionConfig} action     The Action config
   * @param {KeybindingActionBinding} binding   The Binding
   * @returns {KeybindingAction[]}
   * @private
   */
  _detectConflictingActions(actionId, action, binding) {

    // Uneditable Core bindings are never wrong, they can never conflict with something
    if ( actionId.startsWith("core.") && action.uneditable.includes(binding) ) return [];

    // Build fake context
    /** @type KeyboardEventContext */
    const context = KeyboardManager.getKeyboardEventContext({
      code: binding.key,
      shiftKey: binding.modifiers.includes(KeyboardManager.MODIFIER_KEYS.SHIFT),
      ctrlKey: binding.modifiers.includes(KeyboardManager.MODIFIER_KEYS.CONTROL),
      altKey: binding.modifiers.includes(KeyboardManager.MODIFIER_KEYS.ALT),
      repeat: false
    });

    // Return matching keybinding actions (excluding this one)
    let matching = KeyboardManager._getMatchingActions(context);
    return matching.filter(a => a.action !== actionId);
  }

  /* -------------------------------------------- */

  /**
   * Transforms a Binding into a human-readable string representation
   * @param {KeybindingActionBinding} binding   The Binding
   * @returns {string}                           A human readable string
   * @private
   */
  static _humanizeBinding(binding) {
    const stringParts = binding.modifiers.reduce((parts, part) => {
      if ( KeyboardManager.MODIFIER_CODES[part]?.includes(binding.key) ) return parts;
      parts.unshift(KeyboardManager.getKeycodeDisplayString(part));
      return parts;
    }, [KeyboardManager.getKeycodeDisplayString(binding.key)]);
    return stringParts.join(" + ");
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    const actionBindings = html.find(".action-bindings");
    actionBindings.on("dblclick", ".editable-binding", this._onDoubleClickKey.bind(this));
    actionBindings.on("click", ".control", this._onClickBindingControl.bind(this));
    actionBindings.on("keydown", ".binding-input", this._onKeydownBindingInput.bind(this));
  }

  /* -------------------------------------------- */

  /** @override */
  async _onResetDefaults(event) {
    return Dialog.confirm({
      title: game.i18n.localize("KEYBINDINGS.ResetTitle"),
      content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("KEYBINDINGS.ResetWarning")}</p>`,
      yes: async () => {
        await game.keybindings.resetDefaults();
        this.#cachedData = undefined;
        this.#pendingEdits.clear();
        this.render();
        ui.notifications.info("KEYBINDINGS.ResetSuccess", {localize: true});
      },
      no: () => {},
      defaultYes: false
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle Control clicks
   * @param {MouseEvent} event
   * @private
   */
  _onClickBindingControl(event) {
    const button = event.currentTarget;
    switch ( button.dataset.action ) {
      case "add":
        this._onClickAdd(event); break;
      case "delete":
        this._onClickDelete(event); break;
      case "edit":
        return this._onClickEditableBinding(event);
      case "save":
        return this._onClickSaveBinding(event);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle left-click events to show / hide a certain category
   * @param {MouseEvent} event
   * @private
   */
  async _onClickAdd(event) {
    const {actionId, namespace, action} = this._getParentAction(event);
    const {bindingHtml, bindingId} = this._getParentBinding(event);
    const bindings = game.keybindings.bindings.get(actionId);
    const newBindingId = `${namespace}.${action}.binding.${bindings.length}`;
    const toInsert =
      `<li class="binding flexrow inserted" data-binding-id="${newBindingId}">
          <div class="editable-binding">
              <div class="form-fields binding-fields">
                  <input type="text" class="binding-input" name="${newBindingId}" id="${newBindingId}" placeholder="Control + 1">
                  <i class="far fa-keyboard binding-input-icon"></i>
              </div>
          </div>
          <div class="binding-controls flexrow">
            <a class="control save-edit" title="${game.i18n.localize("KEYBINDINGS.SaveBinding")}" data-action="save"><i class="fas fa-save"></i></a>
            <a class="control" title="${game.i18n.localize("KEYBINDINGS.DeleteBinding")}" data-action="delete"><i class="fas fa-trash-alt"></i></a>
          </div>
      </li>`;
    bindingHtml.closest(".action-bindings").insertAdjacentHTML("beforeend", toInsert);
    document.getElementById(newBindingId).focus();

    // If this is an empty binding, delete it
    if ( bindingId === "empty" ) {
      bindingHtml.remove();
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle left-click events to show / hide a certain category
   * @param {MouseEvent} event
   * @private
   */
  async _onClickDelete(event) {
    const {namespace, action} = this._getParentAction(event);
    const {bindingId} = this._getParentBinding(event);
    const bindingIndex = Number.parseInt(bindingId.split(".")[3]);
    this._addPendingEdit(namespace, action, bindingIndex, {index: bindingIndex, key: null});
    await this._savePendingEdits();
  }

  /* -------------------------------------------- */

  /**
   * Inserts a Binding into the Pending Edits object, creating a new Map entry as needed
   * @param {string} namespace
   * @param {string} action
   * @param {number} bindingIndex
   * @param {KeybindingActionBinding} binding
   * @private
   */
  _addPendingEdit(namespace, action, bindingIndex, binding) {
    // Save pending edits
    const pendingEditKey = `${namespace}.${action}`;
    if ( this.#pendingEdits.has(pendingEditKey) ) {
      // Filter out any existing pending edits for this Binding so we don't add each Key in "Shift + A"
      let currentBindings = this.#pendingEdits.get(pendingEditKey).filter(x => x.index !== bindingIndex);
      currentBindings.push(binding);
      this.#pendingEdits.set(pendingEditKey, currentBindings);
    } else {
      this.#pendingEdits.set(pendingEditKey, [binding]);
    }
  }

  /* -------------------------------------------- */

  /**
   * Toggle visibility of the Edit / Save UI
   * @param {MouseEvent} event
   * @private
   */
  _onClickEditableBinding(event) {
    const target = event.currentTarget;
    const bindingRow = target.closest("li.binding");
    target.classList.toggle("hidden");
    bindingRow.querySelector(".save-edit").classList.toggle("hidden");
    for ( let binding of bindingRow.querySelectorAll(".editable-binding") ) {
      binding.classList.toggle("hidden");
      binding.getElementsByClassName("binding-input")[0]?.focus();
    }
  }

  /* -------------------------------------------- */

  /**
   * Toggle visibility of the Edit UI
   * @param {MouseEvent} event
   * @private
   */
  _onDoubleClickKey(event) {
    const target = event.currentTarget;

    // If this is an inserted binding, don't try to swap to a non-edit mode
    if ( target.parentNode.parentNode.classList.contains("inserted") ) return;
    for ( let child of target.parentNode.getElementsByClassName("editable-binding") ) {
      child.classList.toggle("hidden");
      child.getElementsByClassName("binding-input")[0]?.focus();
    }
    const bindingRow = target.closest(".binding");
    for ( let child of bindingRow.getElementsByClassName("save-edit") ) {
      child.classList.toggle("hidden");
    }
  }

  /* -------------------------------------------- */

  /**
   * Save the new Binding value and update the display of the UI
   * @param {MouseEvent} event
   * @private
   */
  async _onClickSaveBinding(event) {
    await this._savePendingEdits();
  }

  /* -------------------------------------------- */

  /**
   * Given a clicked Action element, finds the parent Action
   * @param {MouseEvent|KeyboardEvent} event
   * @returns {{namespace: string, action: string, actionHtml: *}}
   * @private
   */
  _getParentAction(event) {
    const actionHtml = event.currentTarget.closest(".action");
    const actionId = actionHtml.dataset.actionId;
    let [namespace, ...action] = actionId.split(".");
    action = action.join(".");
    return {actionId, actionHtml, namespace, action};
  }

  /* -------------------------------------------- */

  /**
   * Given a Clicked binding control element, finds the parent Binding
   * @param {MouseEvent|KeyboardEvent} event
   * @returns {{bindingHtml: *, bindingId: string}}
   * @private
   */
  _getParentBinding(event) {
    const bindingHtml = event.currentTarget.closest(".binding");
    const bindingId = bindingHtml.dataset.bindingId;
    return {bindingHtml, bindingId};
  }

  /* -------------------------------------------- */

  /**
   * Iterates over all Pending edits, merging them in with unedited Bindings and then saving and resetting the UI
   * @returns {Promise<void>}
   * @private
   */
  async _savePendingEdits() {
    for ( let [id, pendingBindings] of this.#pendingEdits ) {
      let [namespace, ...action] = id.split(".");
      action = action.join(".");
      const bindingsData = game.keybindings.bindings.get(id);
      const actionData = game.keybindings.actions.get(id);

      // Identify the set of bindings which should be saved
      const toSet = [];
      for ( const [index, binding] of bindingsData.entries() ) {
        if ( actionData.uneditable.includes(binding) ) continue;
        const {key, modifiers} = binding;
        toSet[index] = {key, modifiers};
      }
      for ( const binding of pendingBindings ) {
        const {index, key, modifiers} = binding;
        toSet[index] = {key, modifiers};
      }

      // Try to save the binding, reporting any errors
      try {
        await game.keybindings.set(namespace, action, toSet.filter(b => !!b?.key));
      }
      catch(e) {
        ui.notifications.error(e);
      }
    }

    // Reset and rerender
    this.#cachedData = undefined;
    this.#pendingEdits.clear();
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Processes input from the keyboard to form a list of pending Binding edits
   * @param {KeyboardEvent} event   The keyboard event
   * @private
   */
  _onKeydownBindingInput(event) {
    const context = KeyboardManager.getKeyboardEventContext(event);

    // Stop propagation
    event.preventDefault();
    event.stopPropagation();

    const {bindingHtml, bindingId} = this._getParentBinding(event);
    const {namespace, action} = this._getParentAction(event);

    // Build pending Binding
    const bindingIdParts = bindingId.split(".");
    const bindingIndex = Number.parseInt(bindingIdParts[bindingIdParts.length - 1]);
    const {MODIFIER_KEYS, MODIFIER_CODES} = KeyboardManager;
    /** @typedef {KeybindingActionBinding} **/
    let binding = {
      index: bindingIndex,
      key: context.key,
      modifiers: []
    };
    if ( context.isAlt && !MODIFIER_CODES[MODIFIER_KEYS.ALT].includes(context.key) ) {
      binding.modifiers.push(MODIFIER_KEYS.ALT);
    }
    if ( context.isShift && !MODIFIER_CODES[MODIFIER_KEYS.SHIFT].includes(context.key) ) {
      binding.modifiers.push(MODIFIER_KEYS.SHIFT);
    }
    if ( context.isControl && !MODIFIER_CODES[MODIFIER_KEYS.CONTROL].includes(context.key) ) {
      binding.modifiers.push(MODIFIER_KEYS.CONTROL);
    }

    // Save pending edits
    this._addPendingEdit(namespace, action, bindingIndex, binding);

    // Predetect potential conflicts
    const conflicts = this._detectConflictingActions(`${namespace}.${action}`, game.keybindings.actions.get(`${namespace}.${action}`), binding);
    const conflictString = game.i18n.format("KEYBINDINGS.Conflict", {
      conflicts: conflicts.map(action => game.i18n.localize(action.name)).join(", ")
    });

    // Remove existing conflicts and add a new one
    for ( const conflict of bindingHtml.getElementsByClassName("conflicts") ) {
      conflict.remove();
    }
    if ( conflicts.length > 0 ) {
      const conflictHtml = `<div class="control conflicts" title="${conflictString}"><i class="fas fa-exclamation-triangle"></i></div>`;
      bindingHtml.getElementsByClassName("binding-controls")[0].insertAdjacentHTML("afterbegin", conflictHtml);
    }

    // Set value
    event.currentTarget.value = this.constructor._humanizeBinding(binding);
  }
}
