/**
 * An abstract base class for displaying a heads-up-display interface bound to a Placeable Object on the canvas
 * @type {Application}
 * @abstract
 * @interface
 * @param {PlaceableObject} object        The {@link PlaceableObject} this HUD is bound to.
 * @param {ApplicationOptions} [options]  Application configuration options.
 */
class BasePlaceableHUD extends Application {

  /**
   * Reference a PlaceableObject this HUD is currently bound to
   * @type {PlaceableObject}
   */
  object = undefined;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["placeable-hud"],
      popOut: false
    });
  }

  /* -------------------------------------------- */

  /**
   * Convenience access for the canvas layer which this HUD modifies
   * @type {PlaceablesLayer}
   */
  get layer() {
    return this.object?.layer;
  }

  /* -------------------------------------------- */

  /*  Methods
  /* -------------------------------------------- */

  /**
   * Bind the HUD to a new PlaceableObject and display it
   * @param {PlaceableObject} object    A PlaceableObject instance to which the HUD should be bound
   */
  bind(object) {
    const states = this.constructor.RENDER_STATES;
    if ( [states.CLOSING, states.RENDERING].includes(this._state) ) return;
    if ( this.object ) this.clear();

    // Record the new object
    if ( !(object instanceof PlaceableObject) || (object.scene !== canvas.scene) ) {
      throw new Error("You may only bind a HUD instance to a PlaceableObject in the currently viewed Scene.");
    }
    this.object = object;

    // Render the HUD
    this.render(true);
    this.element.hide().fadeIn(200);
  }

  /* -------------------------------------------- */

  /**
   * Clear the HUD by fading out it's active HTML and recording the new display state
   */
  clear() {
    let states = this.constructor.RENDER_STATES;
    if ( this._state <= states.NONE ) return;
    this._state = states.CLOSING;

    // Unbind
    this.object = null;
    this.element.hide();
    this._element = null;
    this._state = states.NONE;
  }

  /* -------------------------------------------- */

  /** @override */
  async _render(...args) {
    await super._render(...args);
    this.setPosition();
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options = {}) {
    const data = this.object.document.toObject();
    return foundry.utils.mergeObject(data, {
      id: this.id,
      classes: this.options.classes.join(" "),
      appId: this.appId,
      isGM: game.user.isGM,
      icons: CONFIG.controlIcons
    });
  }

  /* -------------------------------------------- */

  /** @override */
  setPosition({left, top, width, height, scale} = {}) {
    const position = {
      width: width || this.object.width,
      height: height || this.object.height,
      left: left ?? this.object.x,
      top: top ?? this.object.y
    };
    this.element.css(position);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    html.find(".control-icon").click(this._onClickControl.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse clicks to control a HUD control button
   * @param {PointerEvent} event    The originating click event
   * @protected
   */
  _onClickControl(event) {
    const button = event.currentTarget;
    switch ( button.dataset.action ) {
      case "visibility":
        return this._onToggleVisibility(event);
      case "locked":
        return this._onToggleLocked(event);
      case "sort-up":
        return this._onSort(event, true);
      case "sort-down":
        return this._onSort(event, false);
    }
  }

  /* -------------------------------------------- */

  /**
   * Toggle the visible state of all controlled objects in the Layer
   * @param {PointerEvent} event    The originating click event
   * @private
   */
  async _onToggleVisibility(event) {
    event.preventDefault();

    // Toggle the visible state
    const isHidden = this.object.document.hidden;
    const updates = this.layer.controlled.map(o => {
      return {_id: o.id, hidden: !isHidden};
    });

    // Update all objects
    return canvas.scene.updateEmbeddedDocuments(this.object.document.documentName, updates);
  }

  /* -------------------------------------------- */

  /**
   * Toggle locked state of all controlled objects in the Layer
   * @param {PointerEvent} event    The originating click event
   * @private
   */
  async _onToggleLocked(event) {
    event.preventDefault();

    // Toggle the visible state
    const isLocked = this.object.document.locked;
    const updates = this.layer.controlled.map(o => {
      return {_id: o.id, locked: !isLocked};
    });

    // Update all objects
    event.currentTarget.classList.toggle("active", !isLocked);
    return canvas.scene.updateEmbeddedDocuments(this.object.document.documentName, updates);
  }

  /* -------------------------------------------- */

  /**
   * Handle sorting the z-order of the object
   * @param {boolean} up            Move the object upwards in the vertical stack?
   * @param {PointerEvent} event    The originating mouse click event
   * @returns {Promise}
   * @protected
   */
  async _onSort(event, up) {
    event.preventDefault();
    const siblings = this.layer.placeables;
    const controlled = this.layer.controlled.filter(o => !o.document.locked);

    // Determine target sort index
    let z = 0;
    if ( up ) {
      controlled.sort((a, b) => a.document.z - b.document.z);
      z = siblings.length ? Math.max(...siblings.map(o => o.document.z)) + 1 : 1;
    } else {
      controlled.sort((a, b) => b.document.z - a.document.z);
      z = siblings.length ? Math.min(...siblings.map(o => o.document.z)) - 1 : -1;
    }

    // Update all controlled objects
    const updates = controlled.map((o, i) => {
      let d = up ? i : i * -1;
      return {_id: o.id, z: z + d};
    });
    return canvas.scene.updateEmbeddedDocuments(this.object.document.documentName, updates);
  }
}
