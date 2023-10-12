/**
 * Handle mouse interaction events for a Canvas object.
 * There are three phases of events: hover, click, and drag
 *
 * Hover Events:
 * _handleMouseOver
 *  action: hoverIn
 * _handleMouseOut
 *  action: hoverOut
 *
 * Left Click and Double-Click
 * _handleMouseDown
 *  action: clickLeft
 *  action: clickLeft2
 *
 * Right Click and Double-Click
 * _handleRightDown
 *  action: clickRight
 *  action: clickRight2
 *
 * Drag and Drop
 * _handleMouseMove
 *  action: dragLeftStart
 *  action: dragLeftMove
 *  action: dragRightStart
 *  action: dragLeftMove
 * _handleMouseUp
 *  action: dragLeftDrop
 *  action: dragRightDrop
 * _handleDragCancel
 *  action: dragLeftCancel
 *  action: dragRightCancel
 */
class MouseInteractionManager {
  constructor(object, layer, permissions={}, callbacks={}, options={}) {
    this.object = object;
    this.layer = layer;
    this.permissions = permissions;
    this.callbacks = callbacks;

    /**
     * Interaction options which configure handling workflows
     * @type {{target: PIXI.DisplayObject, dragResistance: number}}
     */
    this.options = options;

    /**
     * The current interaction state
     * @type {number}
     */
    this.state = this.states.NONE;

    /**
     * Bound handlers which can be added and removed
     * @type {Object<Function>}
     */
    this.handlers = {};

    /**
     * The drag handling time
     * @type {number}
     */
    this.dragTime = 0;

    /**
     * The throttling time below which a mouse move event will not be handled
     * @type {number}
     * @private
     */
    this._dragThrottleMS = Math.ceil(1000 / (canvas.app.ticker.maxFPS || 60));

    /**
     * The time of the last left-click event
     * @type {number}
     */
    this.lcTime = 0;

    /**
     * The time of the last right-click event
     * @type {number}
     */
    this.rcTime = 0;

    /**
     * A flag for whether we are right-click dragging
     * @type {boolean}
     */
    this._dragRight = false;

    /**
     * An optional ControlIcon instance for the object
     * @type {ControlIcon}
     */
    this.controlIcon = this.options.target ? this.object[this.options.target] : undefined;
  }

  /**
   * Enumerate the states of a mouse interaction workflow.
   * 0: NONE - the object is inactive
   * 1: HOVER - the mouse is hovered over the object
   * 2: CLICKED - the object is clicked
   * 3: DRAG - the object is being dragged
   * 4: DROP - the object is being dropped
   * @enum {number}
   */
  static INTERACTION_STATES = {
    NONE: 0,
    HOVER: 1,
    CLICKED: 2,
    DRAG: 3,
    DROP: 4
  };

  /**
   * The number of milliseconds of mouse click depression to consider it a long press.
   * @type {number}
   */
  static LONG_PRESS_DURATION_MS = 500;

  /**
   * Global timeout for the long-press event.
   * @type {number|null}
   */
  static longPressTimeout = null;

  /* -------------------------------------------- */

  /**
   * Get the target
   * @return {*}
   */
  get target() {
    return this.options.target ? this.object[this.options.target] : this.object;
  }

  /* -------------------------------------------- */

  /**
   * Activate interactivity for the handled object
   */
  activate() {

    // Remove existing listeners
    this.state = this.states.NONE;
    this.target.removeAllListeners();

    // Create bindings for all handler functions
    this.handlers = {
      mouseover: this._handleMouseOver.bind(this),
      mouseout: this._handleMouseOut.bind(this),
      mousedown: this._handleMouseDown.bind(this),
      rightdown: this._handleRightDown.bind(this),
      mousemove: this._handleMouseMove.bind(this),
      mouseup: this._handleMouseUp.bind(this),
      contextmenu: this._handleDragCancel.bind(this)
    };

    // Activate hover events to start the workflow
    this._activateHoverEvents();

    // Set the target as interactive
    this.target.interactive = true;
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Test whether the current user has permission to perform a step of the workflow
   * @param {string} action     The action being attempted
   * @param {Event} event       The event being handled
   * @returns {boolean}         Can the action be performed?
   */
  can(action, event) {
    const fn = this.permissions[action];
    if ( typeof fn === "boolean" ) return fn;
    if ( fn instanceof Function ) return fn.call(this.object, game.user, event);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Execute a callback function associated with a certain action in the workflow
   * @param {string} action     The action being attempted
   * @param {Event} event       The event being handled
   * @param {...*} args         Additional callback arguments.
   */
  callback(action, event, ...args) {
    const fn = this.callbacks[action];
    if ( fn instanceof Function ) return fn.call(this.object, event, ...args);
  }

  /* -------------------------------------------- */

  /**
   * A reference to the possible interaction states which can be observed
   * @return {Object<string, number>}
   */
  get states() {
    return this.constructor.INTERACTION_STATES;
  }

  /* -------------------------------------------- */
  /*  Listener Activation and Deactivation        */
  /* -------------------------------------------- */

  /**
   * Activate a set of listeners which handle hover events on the target object
   * @private
   */
  _activateHoverEvents() {

    // Disable and re-register mouseover and mouseout handlers
    this.target.off("mouseover", this.handlers.mouseover).on("mouseover", this.handlers.mouseover);
    this.target.off("mouseout", this.handlers.mouseout).on("mouseout", this.handlers.mouseout);

    // Add a one-time mousemove event in case our cursor is already over the target element
    this.target.once("mousemove", this.handlers.mouseover);
  }

  /* -------------------------------------------- */

  /**
   * Activate a new set of listeners for click events on the target object
   * @private
   */
  _activateClickEvents() {
    this._deactivateClickEvents();
    this.target.on("mousedown", this.handlers.mousedown);
    this.target.on("mouseup", this.handlers.mouseup);
    this.target.on("mouseupoutside", this.handlers.mouseup);
    this.target.on("rightdown", this.handlers.rightdown);
    this.target.on("rightup", this.handlers.mouseup);
    this.target.on("rightupoutside", this.handlers.mouseup);
  }

  /* -------------------------------------------- */

  /**
   * Deactivate event listeners for click events on the target object
   * @private
   */
  _deactivateClickEvents() {
    this.target.off("mousedown", this.handlers.mousedown);
    this.target.off("mouseup", this.handlers.mouseup);
    this.target.off("mouseupoutside", this.handlers.mouseup);
    this.target.off("rightdown", this.handlers.rightdown);
    this.target.off("rightup", this.handlers.mouseup);
    this.target.off("rightupoutside", this.handlers.mouseup);
  }

  /* -------------------------------------------- */

  /**
   * Activate events required for handling a drag-and-drop workflow
   * @private
   */
  _activateDragEvents() {
    this._deactivateDragEvents();
    if ( CONFIG.debug.mouseInteraction ) console.log(`${this.object.constructor.name} | activateDragEvents`);
    this.layer.on("mousemove", this.handlers.mousemove);
    if ( !this._dragRight ) {
      canvas.app.view.addEventListener("contextmenu", this.handlers.contextmenu, {capture: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Deactivate events required for handling drag-and-drop workflow.
   * @private
   */
  _deactivateDragEvents() {
    if ( CONFIG.debug.mouseInteraction ) console.log(`${this.object.constructor.name} | deactivateDragEvents`);
    this.layer.off("mousemove", this.handlers.mousemove);
    canvas.app.view.removeEventListener("contextmenu", this.handlers.contextmenu, {capture: true});
  }

  /* -------------------------------------------- */
  /*  Hover In and Hover Out                      */
  /* -------------------------------------------- */

  /**
   * Handle mouse-over events which activate downstream listeners and do not stop propagation.
   * @private
   */
  _handleMouseOver(event) {

    // Ignore hover events during a drag workflow
    if ( this.state >= this.states.DRAG ) return;

    // Handle new hover events
    const action = "hoverIn";
    if ( !this.object.controlled) this.state = this.states.NONE;
    if ( this.state !== this.states.NONE ) return;
    if ( !this.can(action, event) ) return;
    if ( CONFIG.debug.mouseInteraction ) console.log(`${this.object.constructor.name} | ${action}`);

    // Activate click event listeners
    this._activateClickEvents();

    // Assign event data and call the provided handler
    event.data.object = this.object;
    this.state = Math.max(this.state || 0, this.states.HOVER);

    // Callback
    return this.callback(action, event);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-out events which terminate hover workflows and do not stop propagation.
   * @private
   */
  _handleMouseOut(event) {
    const action = "hoverOut";
    if ( (this.state === this.states.NONE) || (this.state >= this.states.DRAG) )  return;

    // Downgrade hovers by deactivating events
    if ( this.state === this.states.HOVER ) {
      this.state = this.states.NONE;
      this._deactivateClickEvents();
    }

    // Handle callback actions if permitted
    if ( !this.can(action, event) ) return;
    if ( CONFIG.debug.mouseInteraction ) console.log(`${this.object.constructor.name} | ${action}`);
    return this.callback(action, event);
  }

  /* -------------------------------------------- */
  /*  Left Click and Double Click                 */
  /* -------------------------------------------- */

  /**
   * Handle mouse-down events which activate downstream listeners.
   * Stop further propagation only if the event is allowed by either single or double-click.
   * @private
   */
  _handleMouseDown(event) {
    if ( ![this.states.HOVER, this.states.CLICKED, this.states.DRAG].includes(this.state) ) return;
    if ( event.data.originalEvent.button !== 0 ) return; // Only support standard left-click
    canvas.currentMouseManager = this;

    // Determine double vs single click
    const now = Date.now();
    const isDouble = (now - this.lcTime) <= 250;
    this.lcTime = now;

    // Update event data
    event.data.object = this.object;
    // We store the origin in a separate variable from the event here so that the setTimeout below can close around it.
    // This is a workaround for what looks like a strange PIXI bug, where any interaction with an HTML <select> element
    // causes events to be eagerly reset once the current execution thread yields.
    const origin = event.data.origin = event.data.getLocalPosition(this.layer);

    if ( !isDouble ) {
      clearTimeout(this.constructor.longPressTimeout);
      this.constructor.longPressTimeout = setTimeout(() => {
        this._handleLongPress(event, origin);
      }, MouseInteractionManager.LONG_PRESS_DURATION_MS);
    }

    // Dispatch to double and single-click handlers
    if ( isDouble && this.can("clickLeft2", event) ) return this._handleClickLeft2(event);
    else return this._handleClickLeft(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-down which trigger a single left-click workflow.
   * @private
   */
  _handleClickLeft(event) {
    const action = "clickLeft";
    if ( !this.can(action, event) ) return;
    event.stopPropagation();
    this._dragRight = false;

    // Upgrade hover to clicked
    if ( this.state === this.states.HOVER ) this.state = this.states.CLICKED;
    if ( CONFIG.debug.mouseInteraction ) console.log(`${this.object.constructor.name} | ${action}`);

    // Trigger callback functions
    this.callback(action, event);

    // Activate drag handlers
    if ( (this.state < this.states.DRAG) && this.can("dragStart", event) ) {
      this._activateDragEvents();
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-down which trigger a single left-click workflow.
   * @private
   */
  _handleClickLeft2(event) {
    event.stopPropagation();
    if ( CONFIG.debug.mouseInteraction ) console.log(`${this.object.constructor.name} | clickLeft2`);
    return this.callback("clickLeft2", event);
  }

  /* -------------------------------------------- */

  /**
   * Handle a long mouse depression to trigger a long-press workflow.
   * @param {PIXI.InteractionEvent} event   The mousedown event.
   * @param {PIXI.Point}            origin  The local canvas co-ordinates of the mousepress.
   * @returns {*}
   * @private
   */
  _handleLongPress(event, origin) {
    event.stopPropagation();
    if ( CONFIG.debug.mouseInteraction ) console.log(`${this.object.constructor.name} | longPress`);
    return this.callback("longPress", event, origin);
  }

  /* -------------------------------------------- */
  /*  Right Click and Double Click                */
  /* -------------------------------------------- */

  /**
   * Handle right-click mouse-down events.
   * Stop further propagation only if the event is allowed by either single or double-click.
   * @private
   */
  _handleRightDown(event) {
    if ( ![this.states.HOVER, this.states.CLICKED, this.states.DRAG].includes(this.state) ) return;
    if ( event.data.originalEvent.button !== 2 ) return; // Only support standard left-click
    canvas.currentMouseManager = this;

    // Determine double vs single click
    const now = Date.now();
    const isDouble = (now - this.rcTime) <= 250;
    this.rcTime = now;

    // Update event data
    event.data.object = this.object;
    event.data.origin = event.data.getLocalPosition(this.layer);

    // Dispatch to double and single-click handlers
    if ( isDouble && this.can("clickRight2", event) ) return this._handleClickRight2(event);
    else return this._handleClickRight(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle single right-click actions.
   * @private
   */
  _handleClickRight(event) {
    const action = "clickRight";
    if ( !this.can(action, event) ) return;
    event.stopPropagation();
    this._dragRight = true;

    // Upgrade hover to clicked
    if ( this.state === this.states.HOVER ) this.state = this.states.CLICKED;
    if ( CONFIG.debug.mouseInteraction ) console.log(`${this.object.constructor.name} | ${action}`);

    // Trigger callback function
    this.callback(action, event);

    // Activate drag handlers
    if ( (this.state < this.states.DRAG) && this.can("dragRight", event) ) {
      this._activateDragEvents();
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle double right-click actions.
   * @private
   */
  _handleClickRight2(event) {
    event.stopPropagation();
    if ( CONFIG.debug.mouseInteraction ) console.log(`${this.object.constructor.name} | clickRight2`);
    return this.callback("clickRight2", event);
  }

  /* -------------------------------------------- */
  /*  Drag and Drop                               */
  /* -------------------------------------------- */

  /**
   * Handle mouse movement during a drag workflow
   * @private
   */
  _handleMouseMove(event) {
    if ( ![this.states.CLICKED, this.states.DRAG].includes(this.state) ) return;

    // Limit dragging to 60 updates per second
    const now = Date.now();
    if ( (now - this.dragTime) < this._dragThrottleMS ) return;
    this.dragTime = now;

    // Get the new destination
    event.data.destination = event.data.getLocalPosition(this.layer);

    // Begin a new drag event
    if ( this.state === this.states.CLICKED ) {
      const dx = event.data.destination.x - event.data.origin.x;
      const dy = event.data.destination.y - event.data.origin.y;
      const dz = Math.hypot(dx, dy);
      const r = this.options.dragResistance || (canvas.dimensions.size / 4);
      if ( dz >= r ) {
        this.state = this.states.DRAG;
        return this._handleDragStart(event);
      }
    }

    // Continue a drag event
    else return this._handleDragMove(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle the beginning of a new drag start workflow, moving all controlled objects on the layer
   * @private
   */
  _handleDragStart(event) {
    clearTimeout(this.constructor.longPressTimeout);
    const action = this._dragRight ? "dragRightStart" : "dragLeftStart";
    if ( !this.can(action, event) ) return;
    if ( CONFIG.debug.mouseInteraction ) console.log(`${this.object.constructor.name} | ${action}`);
    return this.callback(action, event);
  }

  /* -------------------------------------------- */

  /**
   * Handle the continuation of a drag workflow, moving all controlled objects on the layer
   * @private
   */
  _handleDragMove(event) {
    clearTimeout(this.constructor.longPressTimeout);
    const action = this._dragRight ? "dragRightMove" : "dragLeftMove";
    this.state = this.states.DRAG;
    if ( !this.can(action, event) ) return;
    return this.callback(action, event);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse up events which may optionally conclude a drag workflow
   * @private
   */
  _handleMouseUp(event) {
    clearTimeout(this.constructor.longPressTimeout);
    if ( this.state >= this.states.DRAG ) {
      event.stopPropagation();
      if ( event.type.startsWith("right") && !this._dragRight ) return;
      this._handleDragDrop(event);
    }

    // Continue a multi-click drag workflow
    if ( event.data.originalEvent.defaultPrevented ) {
      this.state = this.states.DRAG;
      return;
    }

    // Cancel the workflow
    return this._handleDragCancel(event.data.originalEvent);
  }

  /* -------------------------------------------- */

  /**
   * Handle the conclusion of a drag workflow, placing all dragged objects back on the layer
   * @private
   */
  _handleDragDrop(event) {
    const action = this._dragRight ? "dragRightDrop" : "dragLeftDrop";
    if (!this.can(action, event)) return;
    if ( CONFIG.debug.mouseInteraction ) console.log(`${this.object.constructor.name} | ${action}`);

    // Update event data
    event.data.object = this.object;
    event.data.destination = event.data.getLocalPosition(this.layer);
    this.state = this.states.DROP;

    // Callback
    this.callback(action, event);
  }

  /* -------------------------------------------- */

  /**
   * Handle the cancellation of a drag workflow, resetting back to the original state
   * @param {PointerEvent} event
   * @private
   */
  _handleDragCancel(event) {
    this.cancel(event);
  }

  /* -------------------------------------------- */

  /**
   * A public method to cancel a current interaction workflow from this manager.
   * @param {Event} event     The event that initiates the cancellation
   */
  cancel(event) {
    const endState = this.state;
    canvas.currentMouseManager = null;
    if ( endState <= this.states.HOVER ) return;

    // Dispatch a cancellation callback
    if ( endState >= this.states.DRAG ) {
      const action = this._dragRight ? "dragRightCancel" : "dragLeftCancel";
      if (CONFIG.debug.mouseInteraction) console.log(`${this.object.constructor.name} | ${action}`);
      this.callback(action, event);
    }

    // Continue a multi-click drag workflow if the default event was prevented in the callback
    if ( event.defaultPrevented ) {
      this.state = this.states.DRAG;
      return;
    }

    // Deactivate the drag workflow
    this._deactivateDragEvents();
    this.state = this.states.HOVER;
  }
}
