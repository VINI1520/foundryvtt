/**
 * Management class for Gamepad events
 */
class GamepadManager {
  constructor() {
    this._gamepadPoller = null;

    /**
     * The connected Gamepads
     * @type {Map<string, ConnectedGamepad>}
     * @private
     */
    this._connectedGamepads = new Map();
  }

  /**
   * How often Gamepad polling should check for button presses
   * @type {number}
   */
  static GAMEPAD_POLLER_INTERVAL_MS = 100;

  /* -------------------------------------------- */

  /**
   * Begin listening to gamepad events.
   * @internal
   */
  _activateListeners() {
    window.addEventListener("gamepadconnected", this._onGamepadConnect.bind(this));
    window.addEventListener("gamepaddisconnected", this._onGamepadDisconnect.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handles a Gamepad Connection event, adding its info to the poll list
   * @param {GamepadEvent} event The originating Event
   * @private
   */
  _onGamepadConnect(event) {
    if ( CONFIG.debug.gamepad ) console.log(`Gamepad ${event.gamepad.id} connected`);
    this._connectedGamepads.set(event.gamepad.id, {
      axes: new Map(),
      activeButtons: new Set()
    });
    if ( !this._gamepadPoller ) this._gamepadPoller = setInterval(() => {
      this._pollGamepads()
    }, GamepadManager.GAMEPAD_POLLER_INTERVAL_MS);
    // Immediately poll to try and capture the action that connected the Gamepad
    this._pollGamepads();
  }

  /* -------------------------------------------- */

  /**
   * Handles a Gamepad Disconnect event, removing it from consideration for polling
   * @param {GamepadEvent} event The originating Event
   * @private
   */
  _onGamepadDisconnect(event) {
    if ( CONFIG.debug.gamepad ) console.log(`Gamepad ${event.gamepad.id} disconnected`);
    this._connectedGamepads.delete(event.gamepad.id);
    if ( this._connectedGamepads.length === 0 ) {
      clearInterval(this._gamepadPoller);
      this._gamepadPoller = null;
    }
  }

  /* -------------------------------------------- */

  /**
   * Polls all Connected Gamepads for updates. If they have been updated, checks status of Axis and Buttons,
   * firing off Keybinding Contexts as appropriate
   * @private
   */
  _pollGamepads() {
    // Joysticks are not very precise and range from -1 to 1, so we need to ensure we avoid drift due to low (but not zero) values
    const AXIS_PRECISION = 0.15;
    const MAX_AXIS = 1;
    for ( let gamepad of navigator.getGamepads() ) {
      if ( !gamepad || !this._connectedGamepads.has(gamepad?.id) ) continue;
      const id = gamepad.id;
      let gamepadData = this._connectedGamepads.get(id);

      // Check Active Axis
      for ( let x = 0; x < gamepad.axes.length; x++ ) {
        let axisValue = gamepad.axes[x];

        // Verify valid input and handle inprecise values
        if ( Math.abs(axisValue) > MAX_AXIS ) continue;
        if ( Math.abs(axisValue) <= AXIS_PRECISION ) axisValue = 0;

        // Store Axis data per Joystick as Numbers
        const joystickId = `${id}_AXIS${x}`;
        const priorValue = gamepadData.axes.get(joystickId) ?? 0;

        // An Axis exists from -1 to 1, with 0 being the center.
        // We split an Axis into Negative and Positive zones to differentiate pressing it left / right and up / down
        if ( axisValue !== 0 ) {
          const sign = Math.sign(axisValue);
          const repeat = sign === Math.sign(priorValue);
          const emulatedKey = `${joystickId}_${sign > 0 ? "POSITIVE" : "NEGATIVE"}`;
          this._handleGamepadInput(emulatedKey, false, repeat);
        }
        else if ( priorValue !== 0 ) {
          const sign = Math.sign(priorValue);
          const emulatedKey = `${joystickId}_${sign > 0 ? "POSITIVE" : "NEGATIVE"}`;
          this._handleGamepadInput(emulatedKey, true);
        }

        // Update value
        gamepadData.axes.set(joystickId, axisValue);
      }

      // Check Pressed Buttons
      for ( let x = 0; x < gamepad.buttons.length; x++ ) {
        const button = gamepad.buttons[x];
        const buttonId = `${id}_BUTTON${x}_PRESSED`;
        if ( button.pressed ) {
          const repeat = gamepadData.activeButtons.has(buttonId);
          if ( !repeat ) gamepadData.activeButtons.add(buttonId);
          this._handleGamepadInput(buttonId, false, repeat);
        }
        else if ( gamepadData.activeButtons.has(buttonId) ) {
          gamepadData.activeButtons.delete(buttonId);
          this._handleGamepadInput(buttonId, true);
        }
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Converts a Gamepad Input event into a KeyboardEvent, then fires it
   * @param {string} gamepadId  The string representation of the Gamepad Input
   * @param {boolean} up        True if the Input is pressed or active
   * @param {boolean} repeat    True if the Input is being held
   * @private
   */
  _handleGamepadInput(gamepadId, up, repeat = false) {
    const key = gamepadId.replaceAll(" ", "").toUpperCase().trim();
    const event = new KeyboardEvent(`key${up ? "up" : "down"}`, {code: key, bubbles: true});
    window.dispatchEvent(event);
    $(".binding-input:focus").get(0)?.dispatchEvent(event);
  }
}
