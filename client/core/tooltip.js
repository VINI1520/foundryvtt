/**
 * A singleton Tooltip Manager class responsible for rendering and positioning a dynamic tooltip element which is
 * accessible as `game.tooltip`.
 *
 * @see {@link Game.tooltip}
 *
 * @example API Usage
 * ```js
 * game.tooltip.activate(htmlElement, {text: "Some tooltip text", direction: "UP"});
 * game.tooltip.deactivate();
 * ```
 *
 * @example HTML Usage
 * ```html
 * <span data-tooltip="Some Tooltip" data-tooltip-direction="LEFT">I have a tooltip</span>
 * <ol data-tooltip-direction="RIGHT">
 *   <li data-tooltip="The First One">One</li>
 *   <li data-tooltip="The Second One">Two</li>
 *   <li data-tooltip="The Third One">Three</li>
 * </ol>
 * ```
 */
class TooltipManager {

  /**
   * A cached reference to the global tooltip element
   * @type {HTMLElement}
   */
  tooltip = document.getElementById("tooltip");

  /**
   * A reference to the HTML element which is currently tool-tipped, if any.
   * @type {HTMLElement|null}
   */
  element = null;

  /**
   * An amount of margin which is used to offset tooltips from their anchored element.
   * @type {number}
   */
  static TOOLTIP_MARGIN_PX = 5;

  /**
   * The number of milliseconds delay which activates a tooltip on a "long hover".
   * @type {number}
   */
  static TOOLTIP_ACTIVATION_MS = 500;

  /**
   * The directions in which a tooltip can extend, relative to its tool-tipped element.
   * @enum {string}
   */
  static TOOLTIP_DIRECTIONS = {
    UP: "UP",
    DOWN: "DOWN",
    LEFT: "LEFT",
    RIGHT: "RIGHT",
    CENTER: "CENTER"
  };

  /**
   * Is the tooltip currently active?
   * @type {boolean}
   */
  #active = false;

  /**
   * A reference to a window timeout function when an element is activated.
   * @private
   */
  #activationTimeout;

  /**
   * A reference to a window timeout function when an element is deactivated.
   * @private
   */
  #deactivationTimeout;

  /**
   * An element which is pending tooltip activation if hover is sustained
   * @type {HTMLElement|null}
   */
  #pending;

  /* -------------------------------------------- */

  /**
   * Activate interactivity by listening for hover events on HTML elements which have a data-tooltip defined.
   */
  activateEventListeners() {
    document.body.addEventListener("pointerenter", this.#onActivate.bind(this), true);
    document.body.addEventListener("pointerleave", this.#onDeactivate.bind(this), true);
  }

  /* -------------------------------------------- */

  /**
   * Handle hover events which activate a tooltipped element.
   * @param {PointerEvent} event    The initiating pointerenter event
   */
  #onActivate(event) {
    if ( Tour.tourInProgress ) return; // Don't activate tooltips during a tour
    const element = event.target;
    if ( !element.dataset.tooltip ) {
      // Check if the element has moved out from underneath the cursor and pointerenter has fired on a non-child of the
      // tooltipped element.
      if ( this.#active && !this.element.contains(element) ) this.#startDeactivation();
      return;
    }

    // Don't activate tooltips if the element contains an active context menu
    if ( element.matches("#context-menu") || element.querySelector("#context-menu") ) return;

    // If the tooltip is currently active, we can move it to a new element immediately
    if ( this.#active ) this.activate(element);
    else this.#clearDeactivation();

    // Otherwise, delay activation to determine user intent
    this.#pending = element;
    this.#activationTimeout = window.setTimeout(() => {
      this.activate(element);
    }, this.constructor.TOOLTIP_ACTIVATION_MS);
  }

  /* -------------------------------------------- */

  /**
   * Handle hover events which deactivate a tooltipped element.
   * @param {PointerEvent} event    The initiating pointerleave event
   */
  #onDeactivate(event) {
    if ( event.target !== (this.element ?? this.#pending) ) return;
    this.#startDeactivation();
  }

  /* -------------------------------------------- */

  /**
   * Start the deactivation process.
   */
  #startDeactivation() {
    // Clear any existing activation workflow
    window.clearTimeout(this.#activationTimeout);
    this.#pending = this.#activationTimeout = null;

    // Delay deactivation to confirm whether some new element is now pending
    window.clearTimeout(this.#deactivationTimeout);
    this.#deactivationTimeout = window.setTimeout(() => {
      if ( !this.#pending ) this.deactivate();
    }, this.constructor.TOOLTIP_ACTIVATION_MS);
  }

  /* -------------------------------------------- */

  /**
   * Clear any existing deactivation workflow.
   */
  #clearDeactivation() {
    window.clearTimeout(this.#deactivationTimeout);
    this.#pending = this.#deactivationTimeout = null;
  }

  /* -------------------------------------------- */

  /**
   * Activate the tooltip for a hovered HTML element which defines a tooltip localization key.
   * @param {HTMLElement} element     The HTML element being hovered.
   * @param {object} [options={}]     Additional options which can override tooltip behavior.
   * @param {string} [options.text]       Explicit tooltip text to display. If this is not provided the tooltip text is
   *                                      acquired from the elements data-tooltip attribute. This text will be
   *                                      automatically localized
   * @param {TooltipManager.TOOLTIP_DIRECTIONS} [options.direction]  An explicit tooltip expansion direction. If this
   *                                      is not provided the direction is acquired from the data-tooltip-direction
   *                                      attribute of the element or one of its parents.
   * @param {string} [options.cssClass]   An optional CSS class to apply to the activated tooltip.
   */
  activate(element, {text, direction, cssClass}={}) {
    // Check if the element still exists in the DOM.
    if ( !document.body.contains(element) ) return;
    this.#clearDeactivation();

    // Mark the element as active
    this.#active = true;
    this.element = element;
    element.setAttribute("aria-describedby", "tooltip");
    this.tooltip.innerHTML = text || game.i18n.localize(element.dataset.tooltip);

    // Activate display of the tooltip
    this.tooltip.removeAttribute("class");
    this.tooltip.classList.add("active");
    if ( cssClass ) this.tooltip.classList.add(cssClass);

    // Set tooltip position
    direction = direction || element.closest("[data-tooltip-direction]")?.dataset.tooltipDirection;
    if ( !direction ) direction = this._determineDirection();
    this._setAnchor(direction);
  }

  /* -------------------------------------------- */

  /**
   * Deactivate the tooltip from a previously hovered HTML element.
   * @private
   */
  deactivate() {

    // Deactivate display of the tooltip
    this.#active = false;
    this.tooltip.classList.remove("active");

    // Update the tooltipped element
    if ( !this.element ) return;
    this.element.removeAttribute("aria-describedby");
    this.element = null;
  }

  /* -------------------------------------------- */

  /**
   * Clear any pending activation workflow.
   * @internal
   */
  clearPending() {
    window.clearTimeout(this.#activationTimeout);
    this.#pending = this.#activationTimeout = null;
  }

  /* -------------------------------------------- */

  /**
   * If an explicit tooltip expansion direction was not specified, figure out a valid direction based on the bounds
   * of the target element and the screen.
   * @private
   */
  _determineDirection() {
    const pos = this.element.getBoundingClientRect();
    const dirs = this.constructor.TOOLTIP_DIRECTIONS;
    return dirs[pos.y + this.tooltip.offsetHeight > window.innerHeight ? "UP" : "DOWN"];
  }

  /* -------------------------------------------- */

  /**
   * Set tooltip position relative to an HTML element using an explicitly provided data-tooltip-direction.
   * @param {TooltipManager.TOOLTIP_DIRECTIONS} direction  The tooltip expansion direction specified by the element
   *                                                        or a parent element.
   * @private
   */
  _setAnchor(direction) {
    const directions = this.constructor.TOOLTIP_DIRECTIONS;
    const pad = this.constructor.TOOLTIP_MARGIN_PX;
    const pos = this.element.getBoundingClientRect();
    let style = {};
    switch ( direction ) {
      case directions.DOWN:
        style.textAlign = "center";
        style.left = pos.left - (this.tooltip.offsetWidth / 2) + (pos.width / 2);
        style.top = pos.bottom + pad;
        break;
      case directions.LEFT:
        style.textAlign = "left";
        style.right = window.innerWidth - pos.left + pad;
        style.top = pos.top + (pos.height / 2) - (this.tooltip.offsetHeight / 2);
        break;
      case directions.RIGHT:
        style.textAlign = "right";
        style.left = pos.right + pad;
        style.top = pos.top + (pos.height / 2) - (this.tooltip.offsetHeight / 2);
        break;
      case directions.UP:
        style.textAlign = "center";
        style.left = pos.left - (this.tooltip.offsetWidth / 2) + (pos.width / 2);
        style.bottom = window.innerHeight - pos.top + pad;
        break;
      case directions.CENTER:
        style.textAlign = "center";
        style.left = pos.left - (this.tooltip.offsetWidth / 2) + (pos.width / 2);
        style.top = pos.top + (pos.height / 2) - (this.tooltip.offsetHeight / 2);
        break;
    }
    return this._setStyle(style);
  }

  /* -------------------------------------------- */

  /**
   * Apply inline styling rules to the tooltip for positioning and text alignment.
   * @param {object} [position={}]  An object of positioning data, supporting top, right, bottom, left, and textAlign
   * @private
   */
  _setStyle(position={}) {
    const pad = this.constructor.TOOLTIP_MARGIN_PX;
    position = Object.assign({top: null, right: null, bottom: null, left: null, textAlign: "left"}, position);
    const style = this.tooltip.style;

    // Left or Right
    const maxW = window.innerWidth - this.tooltip.offsetWidth;
    if ( position.left ) position.left = Math.clamped(position.left, pad, maxW - pad);
    if ( position.right ) position.right = Math.clamped(position.right, pad, maxW - pad);

    // Top or Bottom
    const maxH = window.innerHeight - this.tooltip.offsetHeight;
    if ( position.top ) position.top = Math.clamped(position.top, pad, maxH - pad);
    if ( position.bottom ) position.bottom = Math.clamped(position.bottom, pad, maxH - pad);

    // Assign styles
    for ( let k of ["top", "right", "bottom", "left"] ) {
      const v = position[k];
      style[k] = v ? `${v}px` : null;
    }
    style.textAlign = position.textAlign;
  }
}
