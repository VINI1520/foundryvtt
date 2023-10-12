/**
 * An Abstract Base Class which defines a Placeable Object which represents a Document placed on the Canvas
 * @extends {PIXI.Container}
 * @abstract
 * @interface
 *
 * @param {abstract.Document} document      The Document instance which is represented by this object
 */
class PlaceableObject extends PIXI.Container {
  constructor(document) {
    super();
    if ( !(document instanceof foundry.abstract.Document) || !document.isEmbedded ) {
      throw new Error("You must provide an embedded Document instance as the input for a PlaceableObject");
    }

    /**
     * Retain a reference to the Scene within which this Placeable Object resides
     * @type {Scene}
     */
    this.scene = document.parent;

    /**
     * A reference to the Scene embedded Document instance which this object represents
     * @type {abstract.Document}
     */
    this.document = document;

    /**
     * The underlying data object which provides the basis for this placeable object
     * @type {abstract.DataModel}
     */
    Object.defineProperty(this, "data", {
      get: () => {
        const msg = "You are accessing PlaceableObject#data which is no longer used and instead the Document class "
          + "should be referenced directly as PlaceableObject#document.";
        foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
        return document;
      }
    });

    /**
     * Track the field of vision for the placeable object.
     * This is necessary to determine whether a player has line-of-sight towards a placeable object or vice-versa
     * @type {{fov: PIXI.Circle, los: PointSourcePolygon}}
     */
    this.vision = {fov: undefined, los: undefined};

    /**
     * A control icon for interacting with the object
     * @type {ControlIcon}
     */
    this.controlIcon = null;

    /**
     * A mouse interaction manager instance which handles mouse workflows related to this object.
     * @type {MouseInteractionManager}
     */
    this.mouseInteractionManager = null;

    // Allow objects to be culled when off-screen
    this.cullable = true;
  }

  /**
   * Identify the official Document name for this PlaceableObject class
   * @type {string}
   */
  static embeddedName;

  /**
   * Passthrough certain drag operations on locked objects.
   * @type {boolean}
   * @protected
   */
  _dragPassthrough = false;

  /**
   * Know if a placeable is in the hover-in state.
   * @type {boolean}
   * @internal
   */
  _isHoverIn = false;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The mouse interaction state of this placeable.
   * @type {MouseInteractionManager.INTERACTION_STATES}
   */
  get interactionState() {
    return this._original?.mouseInteractionManager?.state ?? this.mouseInteractionManager.state;
  }

  /* -------------------------------------------- */

  /**
   * The bounding box for this PlaceableObject.
   * This is required if the layer uses a Quadtree, otherwise it is optional
   * @returns {Rectangle}
   */
  get bounds() {
    throw new Error("Each subclass of PlaceableObject must define its own bounds rectangle");
  }

  /* -------------------------------------------- */

  /**
   * The central coordinate pair of the placeable object based on it's own width and height
   * @type {PIXI.Point}
   */
  get center() {
    const d = this.document;
    if ( ("width" in d) && ("height" in d) ) {
      return new PIXI.Point(d.x + (d.width / 2), d.y + (d.height / 2));
    }
    return new PIXI.Point(d.x, d.y);
  }

  /* -------------------------------------------- */

  /**
   * The id of the corresponding Document which this PlaceableObject represents.
   * @type {string}
   */
  get id() {
    return this.document.id;
  }

  /* -------------------------------------------- */

  /**
   * A unique identifier which is used to uniquely identify elements on the canvas related to this object.
   * @type {string}
   */
  get objectId() {
    let id = `${this.document.documentName}.${this.document.id}`;
    if ( this.isPreview ) id += ".preview";
    return id;
  }

  /* -------------------------------------------- */

  /**
   * The named identified for the source object associated with this PlaceableObject.
   * This differs from the objectId because the sourceId is the same for preview objects as for the original.
   * @type {string}
   */
  get sourceId() {
    return `${this.document.documentName}.${this._original?.id ?? this.document.id ?? "preview"}`;
  }

  /* -------------------------------------------- */

  /**
   * Is this placeable object a temporary preview?
   * @type {boolean}
   */
  get isPreview() {
    return !!this._original;
  }

  /* -------------------------------------------- */

  /**
   * The field-of-vision polygon for the object, if it has been computed
   * @type {PIXI.Circle}
   */
  get fov() {
    return this.vision.fov;
  }

  /* -------------------------------------------- */

  /**
   * Provide a reference to the CanvasLayer which contains this PlaceableObject.
   * @type {PlaceablesLayer}
   */
  get layer() {
    return this.document.layer;
  }

  /* -------------------------------------------- */

  /**
   * The line-of-sight polygon for the object, if it has been computed
   * @type {PointSourcePolygon|null}
   */
  get los() {
    return this.vision.los;
  }

  /* -------------------------------------------- */

  /**
   * A Form Application which is used to configure the properties of this Placeable Object or the Document it
   * represents.
   * @type {FormApplication}
   */
  get sheet() {
    return this.document.sheet;
  }

  /**
   * An indicator for whether the object is currently controlled
   * @type {boolean}
   */
  get controlled() {
    return this.#controlled;
  }

  #controlled = false;

  /* -------------------------------------------- */

  /**
   * An indicator for whether the object is currently a hover target
   * @type {boolean}
   */
  get hover() {
    return this.#hover;
  }

  set hover(state) {
    this.#hover = typeof state === "boolean" ? state : false;
  }

  #hover = false;

  /* -------------------------------------------- */
  /*  Permission Controls                         */
  /* -------------------------------------------- */

  /**
   * Test whether a user can perform a certain interaction regarding a Placeable Object
   * @param {User} user       The User performing the action
   * @param {string} action   The named action being attempted
   * @returns {boolean}       Does the User have rights to perform the action?
   */
  can(user, action) {
    const fn = this[`_can${action.titleCase()}`];
    return fn ? fn.call(this, user) : false;
  }

  /**
   * Can the User access the HUD for this Placeable Object?
   * @param {User} user       The User performing the action.
   * @param {object} event    The event object.
   * @returns {boolean}       The returned status.
   * @protected
   */
  _canHUD(user, event) {
    return this.controlled;
  }

  /**
   * Does the User have permission to configure the Placeable Object?
   * @param {User} user       The User performing the action.
   * @param {object} event    The event object.
   * @returns {boolean}       The returned status.
   * @protected
   */
  _canConfigure(user, event) {
    return this.document.canUserModify(user, "update");
  }

  /**
   * Does the User have permission to control the Placeable Object?
   * @param {User} user       The User performing the action.
   * @param {object} event    The event object.
   * @returns {boolean}       The returned status.
   * @protected
   */
  _canControl(user, event) {
    if ( !this.layer.active ) return false;
    return this.document.canUserModify(user, "update");
  }

  /**
   * Does the User have permission to view details of the Placeable Object?
   * @param {User} user       The User performing the action.
   * @param {object} event    The event object.
   * @returns {boolean}       The returned status.
   * @protected
   */
  _canView(user, event) {
    return this.document.testUserPermission(user, "LIMITED");
  }

  /**
   * Does the User have permission to create the underlying Document?
   * @param {User} user       The User performing the action.
   * @param {object} event    The event object.
   * @returns {boolean}       The returned status.
   * @protected
   */
  _canCreate(user, event) {
    return user.isGM;
  }

  /**
   * Does the User have permission to drag this Placeable Object?
   * @param {User} user       The User performing the action.
   * @param {object} event    The event object.
   * @returns {boolean}       The returned status.
   * @protected
   */
  _canDrag(user, event) {
    return this._canControl(user, event);
  }

  /**
   * Does the User have permission to hover on this Placeable Object?
   * @param {User} user       The User performing the action.
   * @param {object} event    The event object.
   * @returns {boolean}       The returned status.
   * @protected
   */
  _canHover(user, event) {
    return this._canControl(user, event);
  }

  /**
   * Does the User have permission to update the underlying Document?
   * @param {User} user       The User performing the action.
   * @param {object} event    The event object.
   * @returns {boolean}       The returned status.
   * @protected
   */
  _canUpdate(user, event) {
    return this._canControl(user, event);
  }

  /**
   * Does the User have permission to delete the underlying Document?
   * @param {User} user       The User performing the action.
   * @param {object} event    The event object.
   * @returns {boolean}       The returned status.
   * @protected
   */
  _canDelete(user, event) {
    return this._canControl(user, event);
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * Clear the display of the existing object.
   * @returns {PlaceableObject}    The cleared object
   */
  clear() {
    this.removeChildren().forEach(c => c.destroy({children: true}));
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Clone the placeable object, returning a new object with identical attributes.
   * The returned object is non-interactive, and has no assigned ID.
   * If you plan to use it permanently you should call the create method.
   * @returns {PlaceableObject}  A new object with identical data
   */
  clone() {
    const cloneDoc = this.document.clone({}, {keepId: true});
    const clone = new this.constructor(cloneDoc);
    cloneDoc._object = clone;
    clone._original = this;
    clone.interactive = false;
    clone.#controlled = this.#controlled;
    return clone;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  destroy(options) {
    this.document._object = null;
    this.document._destroyed = true;
    if ( this.controlIcon ) this.controlIcon.destroy();
    Hooks.callAll(`destroy${this.document.documentName}`, this);
    this._destroy(options);
    return super.destroy(options);
  }

  /**
   * The inner _destroy method which may optionally be defined by each PlaceableObject subclass.
   * @param {object} [options]    Options passed to the initial destroy call
   * @protected
   */
  _destroy(options) {}

  /* -------------------------------------------- */

  /**
   * Draw the placeable object into its parent container
   * @returns {Promise<PlaceableObject>}  The drawn object
   */
  async draw() {
    this.clear();
    await this._draw();
    Hooks.callAll(`draw${this.document.documentName}`, this);
    this.refresh();
    if ( this.id ) this.activateListeners();
    return this;
  }

  /**
   * The inner _draw method which must be defined by each PlaceableObject subclass.
   * @abstract
   * @protected
   */
  async _draw() {
    throw new Error(`The ${this.constructor.name} subclass of PlaceableObject must define the _draw method`);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the current display state of the Placeable Object
   * @param {object} [options]      Options which may modify the refresh workflow
   * @returns {PlaceableObject}     The refreshed object
   */
  refresh(options={}) {
    if ( this._destroyed ) return this;
    this._refresh(options);
    Hooks.callAll(`refresh${this.document.documentName}`, this, options);
    return this;
  }

  /**
   * The inner _refresh method which must be defined by each PlaceableObject subclass.
   * @param {object} options        Options which may modify the refresh workflow
   * @abstract
   * @protected
   */
  _refresh(options) {}

  /* -------------------------------------------- */

  /**
   * Register pending canvas operations which should occur after a new PlaceableObject of this type is created
   * @param {object} data
   * @param {object} options
   * @param {string} userId
   * @protected
   */
  _onCreate(data, options, userId) {
    this.draw();
  }

  /* -------------------------------------------- */

  /**
   * Define additional steps taken when an existing placeable object of this type is updated with new data
   * @param {object} changed
   * @param {object} options
   * @param {string} userId
   * @protected
   */
  _onUpdate(changed, options, userId) {
    const layer = this.layer;

    // Z-index sorting
    if ( "z" in changed ) {
      this.zIndex = parseInt(changed.z) || 0;
    }

    // Quadtree location update
    if ( layer.quadtree ) layer.quadtree.update({r: this.bounds, t: this});

    // Refresh display
    if ( !options?.skipRefresh ) this.refresh();
  }

  /* -------------------------------------------- */

  /**
   * Define additional steps taken when an existing placeable object of this type is deleted
   * @param {object} options
   * @param {string} userId
   * @protected
   */
  _onDelete(options, userId) {
    this.release({trigger: false});
    const layer = this.layer;
    if ( layer.hover === this ) layer.hover = null;
    if ( layer.quadtree ) layer.quadtree.remove(this);
    this.destroy({children: true});
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Assume control over a PlaceableObject, flagging it as controlled and enabling downstream behaviors
   * @param {Object} options                  Additional options which modify the control request
   * @param {boolean} options.releaseOthers   Release any other controlled objects first
   * @returns {boolean}                        A flag denoting whether control was successful
   */
  control(options={}) {
    if ( !this.layer.options.controllableObjects ) return false;

    // Release other controlled objects
    if ( options.releaseOthers !== false ) {
      for ( let o of this.layer.controlled ) {
        if ( o !== this ) o.release();
      }
    }

    // Bail out if this object is already controlled, or not controllable
    if ( this.#controlled || !this.id ) return true;
    if (!this.can(game.user, "control")) return false;

    // Toggle control status
    this.#controlled = true;
    this.layer.controlledObjects.set(this.id, this);

    // Trigger follow-up events and fire an on-control Hook
    this._onControl(options);
    /**
     * A hook event that fires when any PlaceableObject is selected or
     * deselected. Substitute the PlaceableObject name in the hook event to
     * target a specific PlaceableObject type, for example "controlToken".
     * @function controlPlaceableObject
     * @memberof hookEvents
     * @param {PlaceableObject} object The PlaceableObject
     * @param {boolean} controlled     Whether the PlaceableObject is selected or not
     */
    Hooks.callAll(`control${this.constructor.embeddedName}`, this, this.#controlled);
    canvas.triggerPendingOperations();
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Additional events which trigger once control of the object is established
   * @param {Object} options    Optional parameters which apply for specific implementations
   * @protected
   */
  _onControl(options) {
    this.refresh();
  }

  /* -------------------------------------------- */

  /**
   * Release control over a PlaceableObject, removing it from the controlled set
   * @param {object} options          Options which modify the releasing workflow
   * @returns {boolean}               A Boolean flag confirming the object was released.
   */
  release(options={}) {
    this.layer.controlledObjects.delete(this.id);
    if (!this.#controlled) return true;
    this.#controlled = false;

    // Trigger follow-up events
    this._onRelease(options);

    // Fire an on-release Hook
    Hooks.callAll(`control${this.constructor.embeddedName}`, this, this.#controlled);
    if ( options.trigger !== false ) canvas.triggerPendingOperations();
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Additional events which trigger once control of the object is released
   * @param {object} options          Options which modify the releasing workflow
   * @protected
   */
  _onRelease(options) {
    const layer = this.layer;
    this.hover = this._isHoverIn = false;
    if ( this === layer.hover ) layer.hover = null;
    if ( layer.hud && (layer.hud.object === this) ) layer.hud.clear();
    this.refresh();
  }

  /* -------------------------------------------- */

  /**
   * Rotate the PlaceableObject to a certain angle of facing
   * @param {number} angle        The desired angle of rotation
   * @param {number} snap         Snap the angle of rotation to a certain target degree increment
   * @returns {Promise<PlaceableObject>} The rotated object
   */
  async rotate(angle, snap) {
    if ( this.document.rotation === undefined ) return this;
    const rotation = this._updateRotation({angle, snap});
    this.layer.hud?.clear();
    await this.document.update({rotation});
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Determine a new angle of rotation for a PlaceableObject either from an explicit angle or from a delta offset.
   * @param {object} options    An object which defines the rotation update parameters
   * @param {number} [options.angle]    An explicit angle, either this or delta must be provided
   * @param {number} [options.delta=0]  A relative angle delta, either this or the angle must be provided
   * @param {number} [options.snap=0]   A precision (in degrees) to which the resulting angle should snap. Default is 0.
   * @returns {number}          The new rotation angle for the object
   */
  _updateRotation({angle, delta=0, snap=0}={}) {
    let degrees = Number.isNumeric(angle) ? angle : this.document.rotation + delta;
    if ( snap > 0 ) degrees = degrees.toNearest(snap);
    let isHexRow = [CONST.GRID_TYPES.HEXODDR, CONST.GRID_TYPES.HEXEVENR].includes(canvas.grid.type);
    const offset = isHexRow && (snap > 30) ? 30 : 0;
    return Math.normalizeDegrees(degrees - offset);
  }

  /* -------------------------------------------- */

  /**
   * Obtain a shifted position for the Placeable Object
   * @param {number} dx         The number of grid units to shift along the X-axis
   * @param {number} dy         The number of grid units to shift along the Y-axis
   * @returns {{x:number, y:number}} The shifted target coordinates
   */
  _getShiftedPosition(dx, dy) {
    let [x, y] = canvas.grid.grid.shiftPosition(this.document.x, this.document.y, dx, dy);
    return {x, y};
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /**
   * Activate interactivity for the Placeable Object
   */
  activateListeners() {
    const mgr = this._createInteractionManager();
    this.mouseInteractionManager = mgr.activate();
  }

  /* -------------------------------------------- */

  /**
   * Create a standard MouseInteractionManager for the PlaceableObject
   * @protected
   */
  _createInteractionManager() {

    // Handle permissions to perform various actions
    const permissions = {
      hoverIn: this._canHover,
      hoverOut: this._canHover,
      clickLeft: this._canControl,
      clickLeft2: this._canView,
      clickRight: this._canHUD,
      clickRight2: this._canConfigure,
      dragStart: this._canDrag
    };

    // Define callback functions for each workflow step
    const callbacks = {
      hoverIn: this._onHoverIn,
      hoverOut: this._onHoverOut,
      clickLeft: this._onClickLeft,
      clickLeft2: this._onClickLeft2,
      clickRight: this._onClickRight,
      clickRight2: this._onClickRight2,
      dragLeftStart: this._onDragLeftStart,
      dragLeftMove: this._onDragLeftMove,
      dragLeftDrop: this._onDragLeftDrop,
      dragLeftCancel: this._onDragLeftCancel,
      dragRightStart: null,
      dragRightMove: null,
      dragRightDrop: null,
      dragRightCancel: null,
      longPress: this._onLongPress
    };

    // Define options
    const options = { target: this.controlIcon ? "controlIcon" : null };

    // Create the interaction manager
    return new MouseInteractionManager(this, canvas.stage, permissions, callbacks, options);
  }

  /* -------------------------------------------- */

  /**
   * Actions that should be taken for this Placeable Object when a mouseover event occurs
   * @see MouseInteractionManager#_handleMouseOver
   * @param {PIXI.InteractionEvent} event   The triggering canvas interaction event
   * @param {object} options                Options which customize event handling
   * @param {boolean} [options.hoverOutOthers=true] Trigger hover-out behavior on sibling objects
   */
  _onHoverIn(event, {hoverOutOthers=true}={}) {
    const layer = this.layer;
    if ( !this.document.locked ) this._isHoverIn = true;
    if ( this.hover || this.document.locked || layer._highlight ) return false;
    layer.hover = this;
    if ( hoverOutOthers ) {
      for ( const o of layer.placeables ) {
        if ( o !== this ) o._onHoverOut(event);
      }
    }
    this.hover = true;
    this.refresh();
    /**
     * A hook event that fires when any PlaceableObject is hovered over or out.
     * Substitute the PlaceableObject name in the hook event to target a specific
     * PlaceableObject type, for example "hoverToken".
     * @function hoverPlaceableObject
     * @memberof hookEvents
     * @param {PlaceableObject} object The PlaceableObject
     * @param {boolean} hovered        Whether the PlaceableObject is hovered over or not
     */
    Hooks.callAll(`hover${this.constructor.embeddedName}`, this, this.hover);
  }

  /* -------------------------------------------- */

  /**
   * Actions that should be taken for this Placeable Object when a mouseout event occurs
   * @see MouseInteractionManager#_handleMouseOut
   * @param {PIXI.InteractionEvent} event  The triggering canvas interaction event
   */
  _onHoverOut(event) {
    const layer = this.layer;
    if ( !this.document.locked ) this._isHoverIn = false;
    if ( !this.hover || this.document.locked || layer._highlight ) return false;
    layer.hover = null;
    this.hover = false;
    this.refresh();
    Hooks.callAll(`hover${this.constructor.embeddedName}`, this, this.hover);
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a single left-click event to assume control of the object
   * @see MouseInteractionManager#_handleClickLeft
   * @param {PIXI.InteractionEvent} event  The triggering canvas interaction event
   */
  _onClickLeft(event) {
    const hud = this.layer.hud;
    if ( hud ) hud.clear();

    // Add or remove the Placeable Object from the currently controlled set
    const oe = event.data.originalEvent;
    if ( this.#controlled ) {
      if ( oe.shiftKey ) return this.release();
    } else {
      return this.control({releaseOthers: !oe.shiftKey});
    }
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a double left-click event to activate
   * @see MouseInteractionManager#_handleClickLeft2
   * @param {PIXI.InteractionEvent} event  The triggering canvas interaction event
   */
  _onClickLeft2(event) {
    const sheet = this.sheet;
    if ( sheet ) sheet.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a single right-click event to configure properties of the object
   * @see MouseInteractionManager#_handleClickRight
   * @param {PIXI.InteractionEvent} event  The triggering canvas interaction event
   */
  _onClickRight(event) {
    const hud = this.layer.hud;
    if ( hud ) {
      const releaseOthers = !this.#controlled && !event.data.originalEvent.shiftKey;
      this.control({releaseOthers});
      if ( hud.object === this) hud.clear();
      else hud.bind(this);
    }
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a double right-click event to configure properties of the object
   * @see MouseInteractionManager#_handleClickRight2
   * @param {PIXI.InteractionEvent} event  The triggering canvas interaction event
   */
  _onClickRight2(event) {
    const sheet = this.sheet;
    if ( sheet ) sheet.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur when a mouse-drag action is first begun.
   * @see MouseInteractionManager#_handleDragStart
   * @param {PIXI.InteractionEvent} event  The triggering canvas interaction event
   */
  _onDragLeftStart(event) {
    if ( this.document.locked ) {
      this._dragPassthrough = true;
      return canvas._onDragLeftStart(event);
    }
    const objects = this.layer.options.controllableObjects ? this.layer.controlled : [this];
    const clones = [];
    for ( let o of objects ) {
      if ( o.document.locked ) continue;
      o.document.locked = true;

      // Clone the object
      const c = o.clone();
      o._preview = c;
      clones.push(c);

      // Draw the clone
      c.draw().then(c => {
        this.layer.preview.addChild(c);
        c._onDragStart();
      });
    }
    event.data.clones = clones;
  }

  /* -------------------------------------------- */

  /**
   * Begin a drag operation from the perspective of the preview clone.
   * Modify the appearance of both the clone (this) and the original (_original) object.
   * @protected
   */
  _onDragStart() {
    const o = this._original;
    this.alpha = 0.8;
    o.alpha = 0.4;
    if ( "locked" in o.document ) o.document.locked = true;
    this.visible = true;
  }

  /**
   * Conclude a drag operation from the perspective of the preview clone.
   * Modify the appearance of both the clone (this) and the original (_original) object.
   * @protected
   */
  _onDragEnd() {
    this.visible = false;
    const o = this._original;
    if ( o ) {
      if ( o.document?.locked ) o.document.locked = false;
      o.alpha = 1.0;
    }
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a mouse-move operation.
   * @see MouseInteractionManager#_handleDragMove
   * @param {PIXI.InteractionEvent} event  The triggering canvas interaction event
   */
  _onDragLeftMove(event) {
    if ( this._dragPassthrough ) return canvas._onDragLeftMove(event);
    const {clones, destination, origin, originalEvent} = event.data;
    canvas._onDragCanvasPan(originalEvent);
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    for ( let c of clones || [] ) {
      c.document.x = c._original.document.x + dx;
      c.document.y = c._original.document.y + dy;
      c.refresh();
    }
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a mouse-move operation.
   * @see MouseInteractionManager#_handleDragDrop
   * @param {PIXI.InteractionEvent} event  The triggering canvas interaction event
   * @returns {Promise<*>}
   */
  async _onDragLeftDrop(event) {
    if ( this._dragPassthrough ) {
      this._dragPassthrough = false;
      return canvas._onDragLeftDrop(event);
    }
    const {clones, destination, originalEvent} = event.data;
    if ( !clones || !canvas.dimensions.rect.contains(destination.x, destination.y) ) return false;
    const updates = clones.map(c => {
      let dest = {x: c.document.x, y: c.document.y};
      if ( !originalEvent.shiftKey ) {
        dest = canvas.grid.getSnappedPosition(c.document.x, c.document.y, this.layer.gridPrecision);
      }
      return {_id: c._original.id, x: dest.x, y: dest.y, rotation: c.document.rotation};
    });
    return canvas.scene.updateEmbeddedDocuments(this.document.documentName, updates);
  }

  /* -------------------------------------------- */

  /**
   * Callback actions which occur on a mouse-move operation.
   * @see MouseInteractionManager#_handleDragCancel
   * @param {MouseEvent} event  The triggering mouse click event
   */
  _onDragLeftCancel(event) {
    if ( this._dragPassthrough ) {
      this._dragPassthrough = false;
      return canvas._onDragLeftCancel(event);
    }
    this.layer.clearPreviewContainer();
    this.refresh();
  }

  /* -------------------------------------------- */

  /**
   * Callback action which occurs on a long press.
   * @see MouseInteractionManager#_handleLongPress
   * @param {PIXI.InteractionEvent} event   The triggering canvas interaction event
   * @param {PIXI.Point}            origin  The local canvas coordinates of the mousepress.
   * @protected
   */
  _onLongPress(event, origin) {
    return canvas.controls._onLongPress(event, origin);
  }
}
