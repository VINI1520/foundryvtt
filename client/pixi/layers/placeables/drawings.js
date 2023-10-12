/**
 * The DrawingsLayer subclass of PlaceablesLayer.
 * This layer implements a container for drawings.
 * @category - Canvas
 */
class DrawingsLayer extends PlaceablesLayer {

  /** @inheritdoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "drawings",
      canDragCreate: true,
      controllableObjects: true,
      rotatableObjects: true,
      elevationSorting: true,
      zIndex: 20
    });
  }

  /** @inheritdoc */
  static documentName = "Drawing";

  /**
   * The named game setting which persists default drawing configuration for the User
   * @type {string}
   */
  static DEFAULT_CONFIG_SETTING = "defaultDrawingConfig";

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Use an adaptive precision depending on the size of the grid
   * @type {number}
   */
  get gridPrecision() {
    if ( canvas.scene.grid.type === CONST.GRID_TYPES.GRIDLESS ) return 0;
    return canvas.dimensions.size >= 128 ? 16 : 8;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get hud() {
    return canvas.hud.drawing;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get hookName() {
    return DrawingsLayer.name;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Render a configuration sheet to configure the default Drawing settings
   */
  configureDefault() {
    const defaults = game.settings.get("core", DrawingsLayer.DEFAULT_CONFIG_SETTING);
    const d = DrawingDocument.fromSource(defaults);
    new DrawingConfig(d, {configureDefault: true}).render(true);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _deactivate() {
    super._deactivate();
    if (this.objects) this.objects.visible = true;
  }

  /* -------------------------------------------- */

  /**
   * Get initial data for a new drawing.
   * Start with some global defaults, apply user default config, then apply mandatory overrides per tool.
   * @param {Point} origin      The initial coordinate
   * @returns {object}          The new drawing data
   */
  _getNewDrawingData(origin) {
    const tool = game.activeTool;

    // Get saved user defaults
    const defaults = game.settings.get("core", this.constructor.DEFAULT_CONFIG_SETTING) || {};
    const data = foundry.utils.mergeObject(defaults, {
      fillColor: game.user.color,
      strokeColor: game.user.color,
      fontFamily: CONFIG.defaultFontFamily
    }, {overwrite: false, inplace: false});

    // Mandatory additions
    delete data._id;
    if ( tool !== "freehand" ) origin = canvas.grid.getSnappedPosition(origin.x, origin.y, this.gridPrecision);
    data.x = origin.x;
    data.y = origin.y;
    data.author = game.user.id;
    data.shape = {};

    // Tool-based settings
    switch ( tool ) {
      case "rect":
        data.shape.type = Drawing.SHAPE_TYPES.RECTANGLE;
        data.shape.width = 1;
        data.shape.height = 1;
        break;
      case "ellipse":
        data.shape.type = Drawing.SHAPE_TYPES.ELLIPSE;
        data.shape.width = 1;
        data.shape.height = 1;
        break;
      case "polygon":
        data.shape.type = Drawing.SHAPE_TYPES.POLYGON;
        data.shape.points = [0, 0];
        data.bezierFactor = 0;
        break;
      case "freehand":
        data.shape.type = Drawing.SHAPE_TYPES.POLYGON;
        data.shape.points = [0, 0];
        data.bezierFactor = data.bezierFactor ?? 0.5;
        break;
      case "text":
        data.shape.type = Drawing.SHAPE_TYPES.RECTANGLE;
        data.shape.width = 1;
        data.shape.height = 1;
        data.fillColor = "#FFFFFF";
        data.fillAlpha = 0.10;
        data.strokeColor = "#FFFFFF";
        data.text = data.text || "New Text";
        break;
    }

    // Return the cleaned data
    return DrawingDocument.cleanData(data);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickLeft(event) {
    const {preview, drawingsState, destination} = event.interactionData;

    // Continue polygon point placement
    if ( (drawingsState >= 1) && preview.isPolygon ) {
      let point = destination;
      const snap = !event.shiftKey;
      preview._addPoint(point, {snap, round: true});
      preview._chain = true; // Note that we are now in chain mode
      return preview.refresh();
    }

    // Standard left-click handling
    super._onClickLeft(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickLeft2(event) {
    const {drawingsState, preview} = event.interactionData;

    // Conclude polygon placement with double-click
    if ( (drawingsState >= 1) && preview.isPolygon ) {
      event.interactionData.drawingsState = 2;
      return this._onDragLeftDrop(event);
    }

    // Standard double-click handling
    super._onClickLeft2(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onDragLeftStart(event) {
    await super._onDragLeftStart(event);
    const interaction = event.interactionData;
    const cls = getDocumentClass("Drawing");
    const document = new cls(this._getNewDrawingData(interaction.origin), {parent: canvas.scene});
    const drawing = new this.constructor.placeableClass(document);
    interaction.preview = this.preview.addChild(drawing);
    interaction.drawingsState = 1;
    return drawing.draw();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftMove(event) {
    const {preview, drawingsState} = event.interactionData;
    if ( !preview || preview._destroyed ) return;
    if ( preview.parent === null ) { // In theory this should never happen, but rarely does
      this.preview.addChild(preview);
    }
    if ( drawingsState >= 1 ) {
      preview._onMouseDraw(event);
      const isFreehand = game.activeTool === "freehand";
      if ( !preview.isPolygon || isFreehand ) event.interactionData.drawingsState = 2;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handling of mouse-up events which conclude a new object creation after dragging
   * @param {PIXI.FederatedEvent} event       The drag drop event
   * @private
   */
  async _onDragLeftDrop(event) {
    const {drawingsState, destination, origin, preview} = event.interactionData;

    // Successful drawing completion
    if ( drawingsState === 2 ) {
      const distance = Math.hypot(Math.max(destination.x, origin.x) - preview.x,
        Math.max(destination.y, origin.x) - preview.y);
      const minDistance = distance >= (canvas.dimensions.size / 8);
      const completePolygon = preview.isPolygon && (preview.document.shape.points.length > 4);

      // Create a completed drawing
      if ( minDistance || completePolygon ) {
        event.interactionData.clearPreviewContainer = false;
        event.interactionData.drawingsState = 0;
        const data = preview.document.toObject(false);

        // Create the object
        preview._chain = false;
        const cls = getDocumentClass("Drawing");
        const createData = this.constructor.placeableClass.normalizeShape(data);
        let drawing;
        try {
          drawing = await cls.create(createData, {parent: canvas.scene});
        } finally {
          this.clearPreviewContainer();
        }
        const o = drawing.object;
        o._creating = true;
        o._pendingText = "";
        if ( game.activeTool !== "freehand" ) o.control({isNew: true});
      }

      // Cancel the preview
      return this._onDragLeftCancel(event);
    }

    // In-progress polygon
    if ( (drawingsState === 1) && preview.isPolygon ) {
      event.preventDefault();
      if ( preview._chain ) return;
      return this._onClickLeft(event);
    }

    // Incomplete drawing
    return this._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftCancel(event) {
    const preview = this.preview.children?.[0] || null;
    if ( preview?._chain ) {
      preview._removePoint();
      preview.refresh();
      if ( preview.document.shape.points.length ) return event.preventDefault();
    }
    event.interactionData.drawingsState = 0;
    super._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickRight(event) {
    const preview = this.preview.children?.[0] || null;
    if ( preview ) return canvas.mouseInteractionManager._dragRight = false;
    super._onClickRight(event);
  }
}
