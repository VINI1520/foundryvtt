/**
 * The Drawing object is an implementation of the PlaceableObject container.
 * Each Drawing is a placeable object in the DrawingsLayer.
 *
 * @category - Canvas
 * @property {DrawingsLayer} layer                Each Drawing object belongs to the DrawingsLayer
 * @property {DrawingDocument} document           Each Drawing object provides an interface for a DrawingDocument
 */
class Drawing extends PlaceableObject {

  /**
   * The border frame and resizing handles for the drawing.
   * @type {PIXI.Container}
   */
  frame;

  /**
   * A text label that may be displayed as part of the interface layer for the Drawing.
   * @type {PreciseText|null}
   */
  text = null;

  /**
   * The drawing shape which is rendered as a PIXI.Graphics subclass in the PrimaryCanvasGroup.
   * @type {DrawingShape}
   */
  shape;

  /**
   * An internal timestamp for the previous freehand draw time, to limit sampling.
   * @type {number}
   */
  #drawTime = 0;

  /**
   * An internal flag for the permanent points of the polygon.
   * @type {number[]}
   */
  #fixedPoints = foundry.utils.deepClone(this.document.shape.points);

  /**
   * The computed bounds of the Drawing.
   * @type {PIXI.Rectangle}
   */
  #bounds;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static embeddedName = "Drawing";

  /** @override */
  static RENDER_FLAGS = {
    redraw: {propagate: ["refresh"]},
    refresh: {propagate: ["refreshState", "refreshShape"], alias: true},
    refreshState: {propagate: ["refreshFrame"]},
    refreshShape: {propagate: ["refreshFrame", "refreshText", "refreshMesh"]},
    refreshFrame: {},
    refreshText: {},
    refreshMesh: {}
  };

  /**
   * The rate at which points are sampled (in milliseconds) during a freehand drawing workflow
   * @type {number}
   */
  static FREEHAND_SAMPLE_RATE = 75;

  /**
   * A convenience reference to the possible shape types.
   * @enum {string}
   */
  static SHAPE_TYPES = foundry.data.ShapeData.TYPES;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @override */
  get bounds() {
    const {x, y, shape, rotation} = this.document;
    return rotation === 0
      ? new PIXI.Rectangle(x, y, shape.width, shape.height).normalize()
      : PIXI.Rectangle.fromRotation(x, y, shape.width, shape.height, Math.toRadians(rotation)).normalize();
  }

  /* -------------------------------------------- */

  /** @override */
  get center() {
    const {x, y, shape} = this.document;
    return new PIXI.Point(x + (shape.width / 2), y + (shape.height / 2));
  }

  /* -------------------------------------------- */

  /**
   * A Boolean flag for whether the Drawing utilizes a tiled texture background?
   * @type {boolean}
   */
  get isTiled() {
    return this.document.fillType === CONST.DRAWING_FILL_TYPES.PATTERN;
  }

  /* -------------------------------------------- */

  /**
   * A Boolean flag for whether the Drawing is a Polygon type (either linear or freehand)?
   * @type {boolean}
   */
  get isPolygon() {
    return this.type === Drawing.SHAPE_TYPES.POLYGON;
  }

  /* -------------------------------------------- */

  /**
   * Does the Drawing have text that is displayed?
   * @type {boolean}
   */
  get hasText() {
    return !!this.document.text && (this.document.fontSize > 0);
  }

  /* -------------------------------------------- */

  /**
   * The shape type that this Drawing represents. A value in Drawing.SHAPE_TYPES.
   * @see {@link Drawing.SHAPE_TYPES}
   * @type {string}
   */
  get type() {
    return this.document.shape.type;
  }

  /* -------------------------------------------- */
  /*  Initial Rendering                           */
  /* -------------------------------------------- */

  /** @inheritdoc */
  clear() {
    this._pendingText = this.document.text ?? "";
    this.text = undefined;
    return super.clear();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _destroy(options) {
    canvas.primary.removeDrawing(this);
    this.texture?.destroy();
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {

    // Load the background texture, if one is defined
    const texture = this.document.texture;
    if ( this._original ) this.texture = this._original.texture?.clone();
    else this.texture = texture ? await loadTexture(texture, {fallback: "icons/svg/hazard.svg"}) : null;

    // Create the primary group drawing container
    this.shape = canvas.primary.addDrawing(this);

    // Control Border
    this.frame = this.addChild(this.#drawFrame());

    // Drawing text
    this.text = this.hasText ? this.addChild(this.#drawText()) : null;

    // Interactivity
    this.cursor = this.document.isOwner ? "pointer" : null;
  }

  /* -------------------------------------------- */

  /**
   * Create elements for the Drawing border and handles
   * @returns {PIXI.Container}
   */
  #drawFrame() {
    const frame = new PIXI.Container();
    frame.border = frame.addChild(new PIXI.Graphics());
    frame.handle = frame.addChild(new ResizeHandle([1, 1]));
    return frame;
  }

  /* -------------------------------------------- */

  /**
   * Create a PreciseText element to be displayed as part of this drawing.
   * @returns {PreciseText}
   */
  #drawText() {
    const textStyle = this._getTextStyle();
    return new PreciseText(this.document.text || undefined, textStyle);
  }

  /* -------------------------------------------- */

  /**
   * Prepare the text style used to instantiate a PIXI.Text or PreciseText instance for this Drawing document.
   * @returns {PIXI.TextStyle}
   * @protected
   */
  _getTextStyle() {
    const {fontSize, fontFamily, textColor, shape} = this.document;
    const stroke = Math.max(Math.round(fontSize / 32), 2);
    return PreciseText.getTextStyle({
      fontFamily: fontFamily,
      fontSize: fontSize,
      fill: textColor || 0xFFFFFF,
      strokeThickness: stroke,
      dropShadowBlur: Math.max(Math.round(fontSize / 16), 2),
      align: "center",
      wordWrap: true,
      wordWrapWidth: shape.width,
      padding: stroke * 4
    });
  }

  /* -------------------------------------------- */
  /*  Incremental Refresh                         */
  /* -------------------------------------------- */

  /** @override */
  _applyRenderFlags(flags) {
    if ( flags.refreshShape ) this.#refreshShape();
    if ( flags.refreshFrame ) this.#refreshFrame();
    if ( flags.refreshText ) this.#refreshText();
    if ( flags.refreshState ) this.#refreshState();
    if ( flags.refreshMesh ) this.#refreshMesh();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the primary canvas object bound to this drawing.
   */
  #refreshMesh() {
    if ( !this.shape ) return;
    this.shape.initialize(this.document);
    this.shape.alpha = Math.min(this.shape.alpha, this.alpha);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the displayed state of the Drawing.
   * Used to update aspects of the Drawing which change based on the user interaction state.
   */
  #refreshState() {
    const {hidden, locked} = this.document;
    this.visible = !hidden || game.user.isGM;
    this.frame.border.visible = this.controlled || this.hover || this.layer.highlightObjects;
    this.frame.handle.visible = this.controlled && !locked;

    // Update the alpha of the text (if any) according to the hidden state
    if ( !this.text ) return;
    const textAlpha = this.document.textAlpha;
    this.text.alpha = hidden ? Math.min(0.5, textAlpha) : (textAlpha ?? 1.0);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the displayed shape of the Drawing.
   * This refresh occurs when the underlying shape of the drawing has been modified.
   */
  #refreshShape() {
    const {x, y, shape, rotation, sort} = this.document;

    // Compute drawing bounds
    this.#bounds = rotation === 0
      ? new PIXI.Rectangle(0, 0, shape.width, shape.height).normalize()
      : PIXI.Rectangle.fromRotation(0, 0, shape.width, shape.height, Math.toRadians(rotation)).normalize();

    // Refresh hit area
    this.hitArea = this.#bounds.clone().pad(20);

    // Set Position, zIndex, alpha
    this.position.set(x, y);
    this.zIndex = sort;
    this.alpha = this._getTargetAlpha();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the border frame that encloses the Drawing.
   */
  #refreshFrame() {

    // Determine the border color
    const colors = CONFIG.Canvas.dispositionColors;
    let bc = colors.INACTIVE;
    if ( this.controlled ) {
      bc = this.document.locked ? colors.HOSTILE : colors.CONTROLLED;
    }

    // Draw the padded border
    const pad = 6;
    const t = CONFIG.Canvas.objectBorderThickness;
    const h = Math.round(t/2);
    const o = Math.round(h/2) + pad;
    const border = this.#bounds.clone().pad(o);
    this.frame.border.clear().lineStyle(t, 0x000000).drawShape(border).lineStyle(h, bc).drawShape(border);

    // Draw the handle
    this.frame.handle.refresh(border);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the appearance of text displayed above the drawing.
   * This refresh occurs when the shape is refreshed or the position or opacity of drawing text has changed.
   */
  #refreshText() {
    if ( !this.text ) return;
    this.text.style = this._getTextStyle();
    const {rotation, shape, hidden} = this.document;
    this.text.pivot.set(this.text.width / 2, this.text.height / 2);
    this.text.position.set(
      (this.text.width / 2) + ((shape.width - this.text.width) / 2),
      (this.text.height / 2) + ((shape.height - this.text.height) / 2)
    );
    this.text.angle = rotation;
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /**
   * Add a new polygon point to the drawing, ensuring it differs from the last one
   * @param {Point} position            The drawing point to add
   * @param {object} [options]          Options which configure how the point is added
   * @param {boolean} [options.round=false]     Should the point be rounded to integer coordinates?
   * @param {boolean} [options.snap=false]      Should the point be snapped to grid precision?
   * @param {boolean} [options.temporary=false] Is this a temporary control point?
   * @internal
   */
  _addPoint(position, {round=false, snap=false, temporary=false}={}) {
    if ( snap ) position = canvas.grid.getSnappedPosition(position.x, position.y, this.layer.gridPrecision);
    else if ( round ) {
      position.x = Math.round(position.x);
      position.y = Math.round(position.y);
    }

    // Avoid adding duplicate points
    const last = this.#fixedPoints.slice(-2);
    const next = [position.x - this.document.x, position.y - this.document.y];
    if ( next.equals(last) ) return;

    // Append the new point and update the shape
    const points = this.#fixedPoints.concat(next);
    this.document.shape.updateSource({points});
    if ( !temporary ) {
      this.#fixedPoints = points;
      this.#drawTime = Date.now();
    }
  }

  /* -------------------------------------------- */

  /**
   * Remove the last fixed point from the polygon
   * @internal
   */
  _removePoint() {
    this.#fixedPoints.splice(-2);
    this.document.shape.updateSource({points: this.#fixedPoints});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onControl(options) {
    super._onControl(options);
    this.enableTextEditing(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onRelease(options) {
    super._onRelease(options);
    if ( this._onkeydown ) {
      document.removeEventListener("keydown", this._onkeydown);
      this._onkeydown = null;
    }
    if ( game.activeTool === "text" ) {
      if ( !canvas.scene.drawings.has(this.id) ) return;
      let text = this._pendingText ?? this.document.text;
      if ( text === "" ) return this.document.delete();
      if ( this._pendingText ) {    // Submit pending text
        this.document.update({
          text: this._pendingText,
          width: this.document.shape.width,
          height: this.document.shape.height
        });
        this._pendingText = "";
      }
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( this._onkeydown ) document.removeEventListener("keydown", this._onkeydown);
  }

  /* -------------------------------------------- */

  /**
   * Enable text editing for this drawing.
   * @param {object} [options]
   */
  enableTextEditing(options={}) {
    if ( (game.activeTool === "text") || options.forceTextEditing ) {
      if ( this.text === null ) this.text = this.addChild(this.#drawText());
      this._onkeydown = this.#onDrawingTextKeydown.bind(this);
      if ( !options.isNew ) this._pendingText = this.document.text;
      document.addEventListener("keydown", this._onkeydown);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle text entry in an active text tool
   * @param {KeyboardEvent} event
   */
  #onDrawingTextKeydown(event) {

    // Ignore events when an input is focused, or when ALT or CTRL modifiers are applied
    if ( event.altKey || event.ctrlKey || event.metaKey ) return;
    if ( game.keyboard.hasFocus ) return;

    // Track refresh or conclusion conditions
    let conclude = ["Escape", "Enter"].includes(event.key);
    let refresh = false;

    // Submitting the change, update or delete
    if ( event.key === "Enter" ) {
      if ( this._pendingText ) {
        return this.document.update({
          text: this._pendingText,
          width: this.document.shape.width,
          height: this.document.shape.height
        }).then(() => this.release());
      }
      else return this.document.delete();
    }

    // Cancelling the change
    else if ( event.key === "Escape" ) {
      this._pendingText = this.document.text;
      refresh = true;
    }

    // Deleting a character
    else if ( event.key === "Backspace" ) {
      this._pendingText = this._pendingText.slice(0, -1);
      refresh = true;
    }

    // Typing text (any single char)
    else if ( /^.$/.test(event.key) ) {
      this._pendingText += event.key;
      refresh = true;
    }

    // Stop propagation if the event was handled
    if ( refresh || conclude ) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Refresh the display
    if ( refresh ) {
      this.text.text = this._pendingText;
      this.document.shape.width = this.text.width + 100;
      this.document.shape.height = this.text.height + 50;
      this.renderFlags.set({refreshShape: true});
    }

    // Conclude the workflow
    if ( conclude ) {
      this.release();
    }
  }

  /* -------------------------------------------- */
  /*  Document Event Handlers                     */
  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data, options, userId) {
    super._onUpdate(data, options, userId);

    // Full re-draw
    const redraw = ("type" in (data.shape || {})) || ("texture" in data) || ("text" in data)
      || (!!this.document.text && ["fontFamily", "fontSize", "textColor"].some(k => k in data));
    if ( redraw ) return this.renderFlags.set({redraw: true});

    const refreshHUD = ((this.layer.hud.object === this) && ["z", "hidden", "locked"].some(k => k in data));
    const refreshShape = ["x", "y", "elevation", "z", "shape", "rotation", "strokeWidth", "strokeColor",
      "strokeAlpha", "bezierFactor", "fillType", "fillAlpha"].some(k => k in data);

    // Incremental refresh
    this.renderFlags.set({
      refreshState: ["hidden", "locked", "textAlpha"].some(k => k in data),
      refreshMesh: "hidden" in data,
      refreshShape
    });

    if ( refreshHUD ) this.layer.hud.render();
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /** @inheritDoc */
  activateListeners() {
    super.activateListeners();
    this.frame.handle.off("pointerover").off("pointerout").off("pointerdown")
      .on("pointerover", this._onHandleHoverIn.bind(this))
      .on("pointerout", this._onHandleHoverOut.bind(this))
      .on("pointerdown", this._onHandleMouseDown.bind(this));
    this.frame.handle.eventMode = "static";
  }

  /* -------------------------------------------- */

  /** @override */
  _canControl(user, event) {
    if ( !this.layer.active || this.isPreview ) return false;
    if ( this._creating ) {  // Allow one-time control immediately following creation
      delete this._creating;
      return true;
    }
    if ( this.controlled ) return true;
    if ( game.activeTool !== "select" ) return false;
    return user.isGM || (user === this.document.author);
  }

  /* -------------------------------------------- */

  /** @override */
  _canConfigure(user, event) {
    return this.controlled;
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse movement which modifies the dimensions of the drawn shape.
   * @param {PIXI.FederatedEvent} event
   * @protected
   */
  _onMouseDraw(event) {
    const {destination, origin} = event.interactionData;
    const isShift = event.shiftKey;
    const isAlt = event.altKey;
    let position = destination;

    // Drag differently depending on shape type
    switch ( this.type ) {

      // Polygon Shapes
      case Drawing.SHAPE_TYPES.POLYGON:
        const isFreehand = game.activeTool === "freehand";
        let temporary = true;
        if ( isFreehand ) {
          const now = Date.now();
          temporary = (now - this.#drawTime) < this.constructor.FREEHAND_SAMPLE_RATE;
        }
        const snap = !(isShift || isFreehand);
        this._addPoint(position, {snap, temporary});
        break;

      // Other Shapes
      default:
        const shape = this.shape;
        const minSize = canvas.dimensions.size * 0.5;
        let dx = position.x - origin.x;
        let dy = position.y - origin.y;
        if ( Math.abs(dx) < minSize ) dx = minSize * Math.sign(shape.width);
        if ( Math.abs(dy) < minSize ) dy = minSize * Math.sign(shape.height);
        if ( isAlt ) {
          dx = Math.abs(dy) < Math.abs(dx) ? Math.abs(dy) * Math.sign(dx) : dx;
          dy = Math.abs(dx) < Math.abs(dy) ? Math.abs(dx) * Math.sign(dy) : dy;
        }
        const r = new PIXI.Rectangle(origin.x, origin.y, dx, dy).normalize();
        this.document.updateSource({
          x: r.x,
          y: r.y,
          shape: {
            width: r.width,
            height: r.height
          }
        });
        break;
    }

    // Refresh the display
    this.renderFlags.set({refreshShape: true});
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /** @override */
  _onDragLeftStart(event) {
    if ( this._dragHandle ) return this._onHandleDragStart(event);
    if ( this._pendingText ) this.document.text = this._pendingText;
    return super._onDragLeftStart(event);
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftMove(event) {
    if ( this._dragHandle ) return this._onHandleDragMove(event);
    return super._onDragLeftMove(event);
  }

  /* -------------------------------------------- */

  /** @override */
  async _onDragLeftDrop(event) {
    if ( this._dragHandle ) return this._onHandleDragDrop(event);
    if ( this._dragPassthrough ) return canvas._onDragLeftDrop(event);

    event.interactionData.clearPreviewContainer = false;
    // Update each dragged Drawing, confirming pending text
    const clones = event.interactionData.clones || [];
    const updates = clones.map(c => {
      let dest = {x: c.document.x, y: c.document.y};
      if ( !event.shiftKey ) dest = canvas.grid.getSnappedPosition(dest.x, dest.y, this.layer.gridPrecision);
      // Define the update
      const update = {
        _id: c._original.id,
        x: dest.x,
        y: dest.y,
        rotation: c.document.rotation,
        text: c._original._pendingText ? c._original._pendingText : c.document.text
      };

      // Commit pending text
      if ( c._original._pendingText ) {
        update.text = c._original._pendingText;
      }
      c.visible = false;
      c._original.visible = false;
      return update;
    });
    try {
      return await canvas.scene.updateEmbeddedDocuments("Drawing", updates, {diff: false});
    } finally {
      this.layer.clearPreviewContainer();
    }
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragLeftCancel(event) {
    if ( this._dragHandle ) return this._onHandleDragCancel(event);
    return super._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */
  /*  Resize Handling                             */
  /* -------------------------------------------- */

  /**
   * Handle mouse-over event on a control handle
   * @param {PIXI.FederatedEvent} event   The mouseover event
   * @protected
   */
  _onHandleHoverIn(event) {
    const handle = event.target;
    handle?.scale.set(1.5, 1.5);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-out event on a control handle
   * @param {PIXI.FederatedEvent} event   The mouseout event
   * @protected
   */
  _onHandleHoverOut(event) {
    const handle = event.target;
    handle?.scale.set(1.0, 1.0);
  }

  /* -------------------------------------------- */

  /**
   * When clicking the resize handle, initialize the drag property.
   * @param {PIXI.FederatedEvent} event   The mousedown event
   * @protected
   */
  _onHandleMouseDown(event) {
    if ( !this.document.locked ) this._dragHandle = true;
  }

  /* -------------------------------------------- */

  /**
   * Starting the resize handle drag event, initialize the original data.
   * @param {PIXI.FederatedEvent} event   The mouse interaction event
   * @protected
   */
  _onHandleDragStart(event) {
    event.interactionData.originalData = this.document.toObject();
    event.interactionData.drawingOrigin = {x: this.#bounds.right, y: this.#bounds.bottom};
  }

  /* -------------------------------------------- */

  /**
   * Handle mousemove while dragging a tile scale handler
   * @param {PIXI.FederatedEvent} event   The mouse interaction event
   * @protected
   */
  _onHandleDragMove(event) {

    // Pan the canvas if the drag event approaches the edge
    canvas._onDragCanvasPan(event);

    // Update Drawing dimensions
    const {destination, origin, originalData} = event.interactionData;
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    const normalized = Drawing.rescaleDimensions(originalData, dx, dy);

    // Update the drawing, catching any validation failures
    this.document.updateSource(normalized);
    this.renderFlags.set({refreshShape: true});
  }

  /* -------------------------------------------- */

  /**
   * Handle mouseup after dragging a tile scale handler
   * @param {PIXI.FederatedEvent} event   The mouseup event
   * @protected
   */
  _onHandleDragDrop(event) {
    event.interactionData.restoreOriginalData = false;
    const {destination, origin, originalData, drawingOrigin} = event.interactionData;
    let drawingDestination = {
      x: drawingOrigin.x + (destination.x - origin.x),
      y: drawingOrigin.y + (destination.y - origin.y)
    };
    if ( !event.shiftKey ) {
      drawingDestination = canvas.grid.getSnappedPosition(
        drawingDestination.x, drawingDestination.y, this.layer.gridPrecision);
    }
    const dx = drawingDestination.x - drawingOrigin.x;
    const dy = drawingDestination.y - drawingOrigin.y;
    const update = Drawing.rescaleDimensions(originalData, dx, dy);
    return this.document.update(update, {diff: false});
  }

  /* -------------------------------------------- */

  /**
   * Handle cancellation of a drag event for one of the resizing handles
   * @param {PointerEvent} event            The drag cancellation event
   * @protected
   */
  _onHandleDragCancel(event) {
    this._dragHandle = false;
    if ( event.interactionData.restoreOriginalData !== false ) {
      this.document.updateSource(event.interactionData.originalData);
      this.renderFlags.set({refreshShape: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Get a vectorized rescaling transformation for drawing data and dimensions passed in parameter
   * @param {Object} original     The original drawing data
   * @param {number} dx           The pixel distance dragged in the horizontal direction
   * @param {number} dy           The pixel distance dragged in the vertical direction
   * @returns {object}            The adjusted shape data
   */
  static rescaleDimensions(original, dx, dy) {
    let {type, points, width, height} = original.shape;
    width += dx;
    height += dy;
    points = points || [];

    // Rescale polygon points
    if ( type === Drawing.SHAPE_TYPES.POLYGON ) {
      const scaleX = 1 + (dx / original.shape.width);
      const scaleY = 1 + (dy / original.shape.height);
      points = points.map((p, i) => p * (i % 2 ? scaleY : scaleX));
    }

    // Normalize the shape
    return this.normalizeShape({
      x: original.x,
      y: original.y,
      shape: {width: Math.round(width), height: Math.round(height), points}
    });
  }

  /* -------------------------------------------- */

  /**
   * Adjust the location, dimensions, and points of the Drawing before committing the change.
   * @param {object} data   The DrawingData pending update
   * @returns {object}      The adjusted data
   */
  static normalizeShape(data) {

    // Adjust shapes with an explicit points array
    const rawPoints = data.shape.points;
    if ( rawPoints?.length ) {

      // Organize raw points and de-dupe any points which repeated in sequence
      const xs = [];
      const ys = [];
      for ( let i=1; i<rawPoints.length; i+=2 ) {
        const x0 = rawPoints[i-3];
        const y0 = rawPoints[i-2];
        const x1 = rawPoints[i-1];
        const y1 = rawPoints[i];
        if ( (x1 === x0) && (y1 === y0) ) {
          continue;
        }
        xs.push(x1);
        ys.push(y1);
      }

      // Determine minimal and maximal points
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      // Normalize points relative to minX and minY
      const points = [];
      for ( let i=0; i<xs.length; i++ ) {
        points.push(xs[i] - minX, ys[i] - minY);
      }

      // Update data
      data.x += minX;
      data.y += minY;
      data.shape.width = maxX - minX;
      data.shape.height = maxY - minY;
      data.shape.points = points;
    }

    // Adjust rectangles
    else {
      const normalized = new PIXI.Rectangle(data.x, data.y, data.shape.width, data.shape.height).normalize();
      data.x = normalized.x;
      data.y = normalized.y;
      data.shape.width = normalized.width;
      data.shape.height = normalized.height;
    }
    return data;
  }
}
