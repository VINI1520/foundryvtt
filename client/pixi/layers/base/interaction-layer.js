/**
 * A subclass of CanvasLayer which provides support for user interaction with its contained objects.
 * @category - Canvas
 */
class InteractionLayer extends CanvasLayer {

  /**
   * Is this layer currently active
   * @type {boolean}
   */
  get active() {
    return this.#active;
  }

  /** @ignore */
  #active = false;

  /**
   * Customize behaviors of this CanvasLayer by modifying some behaviors at a class level.
   * @type {{name: string, sortActiveTop: boolean, zIndex: number}}
   */
  static get layerOptions() {
    return Object.assign(super.layerOptions, {
      baseClass: InteractionLayer,
      sortActiveTop: false,
      zIndex: 0
    });
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Activate the InteractionLayer, deactivating other layers and marking this layer's children as interactive.
   * @param {object} [options]      Options which configure layer activation
   * @param {string} [options.tool]   A specific tool in the control palette to set as active
   * @returns {InteractionLayer}    The layer instance, now activated
   */
  activate({tool}={}) {

    // Set this layer as active
    const wasActive = this.#active;
    this.#active = true;

    // Deactivate other layers
    for ( const name of Object.keys(Canvas.layers) ) {
      const layer = canvas[name];
      if ( (layer !== this) && (layer instanceof InteractionLayer) ) layer.deactivate();
    }
    if ( wasActive ) return this;

    // Reset the interaction manager
    canvas.mouseInteractionManager?.reset({state: false});

    // Assign interactivity for the active layer
    this.zIndex = this.getZIndex();
    this.eventMode = "static";
    this.interactiveChildren = true;

    // Re-render Scene controls
    if ( ui.controls ) ui.controls.initialize({layer: this.constructor.layerOptions.name, tool});

    // Call layer-specific activation procedures
    this._activate();
    Hooks.callAll(`activate${this.hookName}`, this);
    return this;
  }

  /**
   * The inner _activate method which may be defined by each InteractionLayer subclass.
   * @protected
   */
  _activate() {}

  /* -------------------------------------------- */

  /**
   * Deactivate the InteractionLayer, removing interactivity from its children.
   * @returns {InteractionLayer}    The layer instance, now inactive
   */
  deactivate() {
    canvas.highlightObjects(false);
    this.#active = false;
    this.eventMode = "passive";
    this.interactiveChildren = false;
    this.zIndex = this.getZIndex();
    this._deactivate();
    Hooks.callAll(`deactivate${this.hookName}`, this);
    return this;
  }

  /**
   * The inner _deactivate method which may be defined by each InteractionLayer subclass.
   * @protected
   */
  _deactivate() {}

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    this.hitArea = canvas.dimensions.rect;
    this.zIndex = this.getZIndex();
  }

  /* -------------------------------------------- */

  /**
   * Get the zIndex that should be used for ordering this layer vertically relative to others in the same Container.
   * @returns {number}
   */
  getZIndex() {
    const options = this.constructor.layerOptions;
    if ( this.#active && options.sortActiveTop ) {
      return canvas.layers.reduce((max, l) => {
        if ( l.zIndex > max ) max = l.zIndex;
        return max;
      }, 0);
    }
    return options.zIndex;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle left mouse-click events which originate from the Canvas stage.
   * @see {@link Canvas._onClickLeft}
   * @param {PIXI.FederatedEvent} event      The PIXI InteractionEvent which wraps a PointerEvent
   * @protected
   */
  _onClickLeft(event) {}

  /* -------------------------------------------- */

  /**
   * Handle double left-click events which originate from the Canvas stage.
   * @see {@link Canvas._onClickLeft2}
   * @param {PIXI.FederatedEvent} event      The PIXI InteractionEvent which wraps a PointerEvent
   * @protected
   */
  _onClickLeft2(event) {}

  /* -------------------------------------------- */

  /**
   * Start a left-click drag workflow originating from the Canvas stage.
   * @see {@link Canvas._onDragLeftStart}
   * @param {PIXI.FederatedEvent} event      The PIXI InteractionEvent which wraps a PointerEvent
   * @protected
   */
  async _onDragLeftStart(event) {}

  /* -------------------------------------------- */

  /**
   * Continue a left-click drag workflow originating from the Canvas stage.
   * @see {@link Canvas._onDragLeftMove}
   * @param {PIXI.FederatedEvent} event      The PIXI InteractionEvent which wraps a PointerEvent
   * @protected
   */
  _onDragLeftMove(event) {}

  /* -------------------------------------------- */

  /**
   * Conclude a left-click drag workflow originating from the Canvas stage.
   * @see {@link Canvas._onDragLeftDrop}
   * @param {PIXI.FederatedEvent} event      The PIXI InteractionEvent which wraps a PointerEvent
   * @protected
   */
  async _onDragLeftDrop(event) {}

  /* -------------------------------------------- */

  /**
   * Cancel a left-click drag workflow originating from the Canvas stage.
   * @see {@link Canvas._onDragLeftDrop}
   * @param {PointerEvent} event              A right-click pointer event on the document.
   * @protected
   */
  _onDragLeftCancel(event) {}

  /* -------------------------------------------- */

  /**
   * Handle right mouse-click events which originate from the Canvas stage.
   * @see {@link Canvas._onClickRight}
   * @param {PIXI.FederatedEvent} event      The PIXI InteractionEvent which wraps a PointerEvent
   * @protected
   */
  _onClickRight(event) {}

  /* -------------------------------------------- */

  /**
   * Handle mouse-wheel events which occur for this active layer.
   * @see {@link MouseManager._onWheel}
   * @param {WheelEvent} event                The WheelEvent initiated on the document
   * @protected
   */
  _onMouseWheel(event) {}

  /* -------------------------------------------- */

  /**
   * Handle a DELETE keypress while this layer is active.
   * @see {@link ClientKeybindings._onDelete}
   * @param {KeyboardEvent} event             The delete key press event
   * @protected
   */
  async _onDeleteKey(event) {}
}

/* -------------------------------------------- */
