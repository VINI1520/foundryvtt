/**
 * A set of helpers and management functions for dealing with user input from keyboard events.
 * {@link https://keycode.info/}
 */
class KeyboardManager {
  constructor() {
    this._reset();
  }

  /* -------------------------------------------- */

  /**
   * Begin listening to keyboard events.
   * @internal
   */
  _activateListeners() {
    window.addEventListener("keydown", event => this._handleKeyboardEvent(event, false));
    window.addEventListener("keyup", event => this._handleKeyboardEvent(event, true));
    window.addEventListener("visibilitychange", this._reset.bind(this));
    window.addEventListener("compositionend", this._onCompositionEnd.bind(this));
    window.addEventListener("focusin", this._onFocusIn.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * The set of key codes which are currently depressed (down)
   * @type {Set<string>}
   */
  downKeys = new Set();

  /* -------------------------------------------- */

  /**
   * The set of movement keys which were recently pressed
   * @type {Set<string>}
   */
  moveKeys = new Set();

  /* -------------------------------------------- */

  /**
   * Allowed modifier keys
   * @enum {string}
   */
  static MODIFIER_KEYS = {
    CONTROL: "Control",
    SHIFT: "Shift",
    ALT: "Alt"
  };

  /* -------------------------------------------- */

  /**
   * Track which KeyboardEvent#code presses associate with each modifier
   * @enum {string[]}
   */
  static MODIFIER_CODES = {
    [this.MODIFIER_KEYS.ALT]: ["AltLeft", "AltRight"],
    [this.MODIFIER_KEYS.CONTROL]: ["ControlLeft", "ControlRight", "MetaLeft", "MetaRight", "Meta", "OsLeft", "OsRight"],
    [this.MODIFIER_KEYS.SHIFT]: ["ShiftLeft", "ShiftRight"]
  };

  /* -------------------------------------------- */

  /**
   * Key codes which are "protected" and should not be used because they are reserved for browser-level actions.
   * @type {string[]}
   */
  static PROTECTED_KEYS = ["F5", "F11", "F12", "PrintScreen", "ScrollLock", "NumLock", "CapsLock"];

  /* -------------------------------------------- */

  /**
   * The OS-specific string display for what their Command key is
   * @type {string}
   */
  static CONTROL_KEY_STRING = navigator.appVersion.includes("Mac") ? "⌘" : "Control";

  /* -------------------------------------------- */

  /**
   * An special mapping of how special KeyboardEvent#code values should map to displayed strings or symbols.
   * Values in this configuration object override any other display formatting rules which may be applied.
   * @type {Object<string, string>}
   */
  static KEYCODE_DISPLAY_MAPPING = (() => {
    const isMac = navigator.appVersion.includes("Mac");
    return {
      ArrowLeft: isMac ? "←" : "🡸",
      ArrowRight: isMac ? "→" : "🡺",
      ArrowUp: isMac ? "↑" : "🡹",
      ArrowDown: isMac ? "↓" : "🡻",
      Backquote: "`",
      Backslash: "\\",
      BracketLeft: "[",
      BracketRight: "]",
      Comma: ",",
      Control: this.CONTROL_KEY_STRING,
      Equal: "=",
      Meta: isMac ? "⌘" : "⊞",
      MetaLeft: isMac ? "⌘" : "⊞",
      MetaRight: isMac ? "⌘" : "⊞",
      OsLeft: isMac ? "⌘" : "⊞",
      OsRight: isMac ? "⌘" : "⊞",
      Minus: "-",
      NumpadAdd: "Numpad+",
      NumpadSubtract: "Numpad-",
      Period: ".",
      Quote: "'",
      Semicolon: ";",
      Slash: "/"
    };
  })();

  /* -------------------------------------------- */

  /**
   * Test whether an HTMLElement currently has focus.
   * If so we normally don't want to process keybinding actions.
   * @type {boolean}
   */
  get hasFocus() {
    return document.querySelector(":focus") instanceof HTMLElement;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Emulates a key being pressed, triggering the Keyboard event workflow.
   * @param {boolean} up                        If True, emulates the `keyup` Event. Else, the `keydown` event
   * @param {string} code                       The KeyboardEvent#code which is being pressed
   * @param {object} [options]                  Additional options to configure behavior.
   * @param {boolean} [options.altKey=false]    Emulate the ALT modifier as pressed
   * @param {boolean} [options.ctrlKey=false]   Emulate the CONTROL modifier as pressed
   * @param {boolean} [options.shiftKey=false]  Emulate the SHIFT modifier as pressed
   * @param {boolean} [options.repeat=false]    Emulate this as a repeat event
   * @param {boolean} [options.force=false]     Force the event to be handled.
   * @returns {KeyboardEventContext}
   */
  static emulateKeypress(up, code, {altKey=false, ctrlKey=false, shiftKey=false, repeat=false, force=false}={}) {
    const event = new KeyboardEvent(`key${up ? "up" : "down"}`, {code, altKey, ctrlKey, shiftKey, repeat});
    const context = this.getKeyboardEventContext(event, up);
    game.keyboard._processKeyboardContext(context, {force});
    game.keyboard.downKeys.delete(context.key);
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Format a KeyboardEvent#code into a displayed string.
   * @param {string} code       The input code
   * @returns {string}          The displayed string for this code
   */
  static getKeycodeDisplayString(code) {
    if ( code in this.KEYCODE_DISPLAY_MAPPING ) return this.KEYCODE_DISPLAY_MAPPING[code];
    if ( code.startsWith("Digit") ) return code.replace("Digit", "");
    if ( code.startsWith("Key") ) return code.replace("Key", "");
    return code;
  }

  /* -------------------------------------------- */

  /**
   * Get a standardized keyboard context for a given event.
   * Every individual keypress is uniquely identified using the KeyboardEvent#code property.
   * A list of possible key codes is documented here: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code/code_values
   *
   * @param {KeyboardEvent} event   The originating keypress event
   * @param {boolean} up            A flag for whether the key is down or up
   * @return {KeyboardEventContext} The standardized context of the event
   */
  static getKeyboardEventContext(event, up=false) {
    let context = {
      event: event,
      key: event.code,
      isShift: event.shiftKey,
      isControl: event.ctrlKey || event.metaKey,
      isAlt: event.altKey,
      hasModifier: event.shiftKey || event.ctrlKey || event.metaKey || event.altKey,
      modifiers: [],
      up: up,
      repeat: event.repeat
    };
    if ( context.isShift ) context.modifiers.push(this.MODIFIER_KEYS.SHIFT);
    if ( context.isControl ) context.modifiers.push(this.MODIFIER_KEYS.CONTROL);
    if ( context.isAlt ) context.modifiers.push(this.MODIFIER_KEYS.ALT);
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Report whether a modifier in KeyboardManager.MODIFIER_KEYS is currently actively depressed.
   * @param {string} modifier     A modifier in MODIFIER_KEYS
   * @returns {boolean}           Is this modifier key currently down (active)?
   */
  isModifierActive(modifier) {
    return this.constructor.MODIFIER_CODES[modifier].some(k => this.downKeys.has(k));
  }

  /* -------------------------------------------- */

  /**
   * Converts a Keyboard Context event into a string representation, such as "C" or "Control+C"
   * @param {KeyboardEventContext} context  The standardized context of the event
   * @param {boolean} includeModifiers      If True, includes modifiers in the string representation
   * @return {string}
   * @private
   */
  static _getContextDisplayString(context, includeModifiers = true) {
    const parts = [this.getKeycodeDisplayString(context.key)];
    if ( includeModifiers && context.hasModifier ) {
      if ( context.isShift && context.event.key !== "Shift" ) parts.unshift(this.MODIFIER_KEYS.SHIFT);
      if ( context.isControl && context.event.key !== "Control" ) parts.unshift(this.MODIFIER_KEYS.CONTROL);
      if ( context.isAlt && context.event.key !== "Alt" ) parts.unshift(this.MODIFIER_KEYS.ALT);
    }
    return parts.join("+");
  }

  /* ----------------------------------------- */

  /**
   * Given a standardized pressed key, find all matching registered Keybind Actions.
   * @param {KeyboardEventContext} context  A standardized keyboard event context
   * @return {KeybindingAction[]}           The matched Keybind Actions. May be empty.
   * @internal
   */
  static _getMatchingActions(context) {
    let possibleMatches = game.keybindings.activeKeys.get(context.key) ?? [];
    if ( CONFIG.debug.keybindings ) console.dir(possibleMatches);
    return possibleMatches.filter(action => KeyboardManager._testContext(action, context));
  }

  /* -------------------------------------------- */

  /**
   * Test whether a keypress context matches the registration for a keybinding action
   * @param {KeybindingAction} action             The keybinding action
   * @param {KeyboardEventContext} context        The keyboard event context
   * @returns {boolean}                           Does the context match the action requirements?
   * @private
   */
  static _testContext(action, context) {
    if ( context.repeat && !action.repeat ) return false;
    if ( action.restricted && !game.user.isGM ) return false;

    // If the context includes no modifiers, we match if the binding has none
    if ( !context.hasModifier ) return action.requiredModifiers.length === 0;

    // Test that modifiers match expectation
    const modifiers = this.MODIFIER_KEYS;
    const activeModifiers = {
      [modifiers.CONTROL]: context.isControl,
      [modifiers.SHIFT]: context.isShift,
      [modifiers.ALT]: context.isAlt
    };
    for (let [k, v] of Object.entries(activeModifiers)) {

      // Ignore exact matches to a modifier key
      if ( this.MODIFIER_CODES[k].includes(context.key) ) continue;

      // Verify that required modifiers are present
      if ( action.requiredModifiers.includes(k) ) {
        if ( !v ) return false;
      }

      // No unsupported modifiers can be present for a "down" event
      else if ( !context.up && !action.optionalModifiers.includes(k) && v ) return false;
    }
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Given a registered Keybinding Action, executes the action with a given event and context
   *
   * @param {KeybindingAction} keybind         The registered Keybinding action to execute
   * @param {KeyboardEventContext} context     The gathered context of the event
   * @return {boolean}                         Returns true if the keybind was consumed
   * @private
   */
  static _executeKeybind(keybind, context) {
    if ( CONFIG.debug.keybindings ) console.log("Executing " + game.i18n.localize(keybind.name));
    context.action = keybind.action;
    let consumed = false;
    if ( context.up && keybind.onUp ) consumed = keybind.onUp(context);
    else if ( !context.up && keybind.onDown ) consumed = keybind.onDown(context);
    return consumed;
  }

  /* -------------------------------------------- */

  /**
   * Processes a keyboard event context, checking it against registered keybinding actions
   * @param {KeyboardEventContext} context   The keyboard event context
   * @param {object} [options]               Additional options to configure behavior.
   * @param {boolean} [options.force=false]  Force the event to be handled.
   * @protected
   */
  _processKeyboardContext(context, {force=false}={}) {

    // Track the current set of pressed keys
    if ( context.up ) this.downKeys.delete(context.key);
    else this.downKeys.add(context.key);

    // If an input field has focus, don't process Keybinding Actions
    if ( this.hasFocus && !force ) return;

    // Open debugging group
    if ( CONFIG.debug.keybindings ) {
      console.group(`[${context.up ? 'UP' : 'DOWN'}] Checking for keybinds that respond to ${context.modifiers}+${context.key}`);
      console.dir(context);
    }

    // Check against registered Keybindings
    const actions = KeyboardManager._getMatchingActions(context);
    if (actions.length === 0) {
      if ( CONFIG.debug.keybindings ) {
        console.log("No matching keybinds");
        console.groupEnd();
      }
      return;
    }

    // Execute matching Keybinding Actions to see if any consume the event
    let handled;
    for ( const action of actions ) {
      handled = KeyboardManager._executeKeybind(action, context);
      if ( handled ) break;
    }

    // Cancel event since we handled it
    if ( handled && context.event ) {
      if ( CONFIG.debug.keybindings ) console.log("Event was consumed");
      context.event?.preventDefault();
      context.event?.stopPropagation();
    }
    if ( CONFIG.debug.keybindings ) console.groupEnd();
  }

  /* -------------------------------------------- */

  /**
   * Reset tracking for which keys are in the down and released states
   * @private
   */
  _reset() {
    this.downKeys = new Set();
    this.moveKeys = new Set();
  }

  /* -------------------------------------------- */

  /**
   * Emulate a key-up event for any currently down keys. When emulating, we go backwards such that combinations such as
   * "CONTROL + S" emulate the "S" first in order to capture modifiers.
   * @param {object} [options]              Options to configure behavior.
   * @param {boolean} [options.force=true]  Force the keyup events to be handled.
   */
  releaseKeys({force=true}={}) {
    const reverseKeys = Array.from(this.downKeys).reverse();
    for ( const key of reverseKeys ) {
      this.constructor.emulateKeypress(true, key, {
        force,
        ctrlKey: this.isModifierActive(this.constructor.MODIFIER_KEYS.CONTROL),
        shiftKey: this.isModifierActive(this.constructor.MODIFIER_KEYS.SHIFT),
        altKey: this.isModifierActive(this.constructor.MODIFIER_KEYS.ALT)
      });
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle a key press into the down position
   * @param {KeyboardEvent} event   The originating keyboard event
   * @param {boolean} up            A flag for whether the key is down or up
   * @private
   */
  _handleKeyboardEvent(event, up) {
    if ( event.isComposing ) return; // Ignore IME composition
    if ( !event.key && !event.code ) return; // Some browsers fire keyup and keydown events when autocompleting values.
    let context = KeyboardManager.getKeyboardEventContext(event, up);
    this._processKeyboardContext(context);
  }

  /* -------------------------------------------- */

  /**
   * Input events do not fire with isComposing = false at the end of a composition event in Chrome
   * See: https://github.com/w3c/uievents/issues/202
   * @param {CompositionEvent} event
   */
  _onCompositionEnd(event) {
    return this._handleKeyboardEvent(event, false);
  }

  /* -------------------------------------------- */

  /**
   * Release any down keys when focusing a form element.
   * @param {FocusEvent} event  The focus event.
   * @protected
   */
  _onFocusIn(event) {
    const formElements = [
      HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement, HTMLOptionElement, HTMLButtonElement
    ];
    if ( event.target.isContentEditable || formElements.some(cls => event.target instanceof cls) ) this.releaseKeys();
  }
}
