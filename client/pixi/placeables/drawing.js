/**
 * The Drawing object is an implementation of the PlaceableObject container.
 * Each Drawing is a placeable object in the DrawingsLayer.
 * @category - Canvas
 * @see {@link DrawingDocument}
 * @see {@link DrawingsLayer}
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
   * @private
   */
  _drawTime = 0;

  /**
   * An internal flag for the permanent points of the polygon.
   * @type {number[]}
   * @private
   */
  _fixedPoints = foundry.utils.deepClone(this.document.shape.points);

  /* -------------------------------------------- */

  /** @inheritdoc */
  static embeddedName = "Drawing";

  /* -------------------------------------------- */

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
    if ( rotation !== 0 ) {
      return new PIXI.Rectangle.fromRotation(x, y, shape.width, shape.height, Math.toRadians(rotation)).normalize();
    }
    return new PIXI.Rectangle(x, y, shape.width, shape.height).normalize();
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
    return this.document.text && (this.document.fontSize > 0);
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
  /* Rendering                                    */
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
  async _draw() {

    // Load the background texture, if one is defined
    const texture = this.document.texture;
    if ( this.isPreview ) this.texture = this._original.texture?.clone();
    else this.texture = texture ? await loadTexture(texture, {fallback: "icons/svg/hazard.svg"}) : null;

    // Create the primary group drawing container
    this.shape = canvas.primary.addDrawing(this);

    // Control Border
    this.frame = this.addChild(this.#drawFrame());

    // Drawing text
    this.text = this.hasText ? this.addChild(this.#drawText()) : null;
  }

  /* -------------------------------------------- */

  /**
   * Create elements for the Drawing border and handles
   * @returns {PIXI.Container}
   * @private
   */
  #drawFrame() {
    const frame = new PIXI.Container();
    frame.border = frame.addChild(new PIXI.Graphics());
    frame.handle = frame.addChild(new ResizeHandle([1, 1]));
    return frame;
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
      fill: textColor,
      strokeThickness: stroke,
      dropShadowBlur: Math.max(Math.round(fontSize / 16), 2),
      align: "left",
      wordWrap: true,
      wordWrapWidth: shape.width,
      padding: stroke * 4
    });
  }

  /* -------------------------------------------- */

  /**
   * Create a PreciseText element to be displayed as part of this drawing.
   * @returns {PreciseText}
   * @private
   */
  #drawText() {
    const textStyle = this._getTextStyle();
    return new PreciseText(this.document.text || undefined, textStyle);
  }

  /* -------------------------------------------- */

  /** @override */
  _refresh(options) {

    // Refresh the primary drawing container
    this.shape.refresh();

    // Refresh the shape bounds and the displayed frame
    const {x, y, z, hidden, shape, rotation} = this.document;
    const bounds = PIXI.Rectangle.fromRotation(0, 0, shape.width, shape.height, Math.toRadians(rotation)).normalize();
    this.hitArea = this.controlled ? bounds.clone().pad(50) : bounds; // Pad to include resize handle
    this.buttonMode = true;
    if ( this.id && this.controlled ) this.#refreshFrame(bounds);
    else this.frame.visible = false;

    // Refresh the display of text
    this.#refreshText();

    // Set position and visibility
    this.position.set(x, y);
    this.zIndex = z;
    this.visible = !hidden || game.user.isGM;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the boundary frame which outlines the Drawing shape
   * @param {Rectangle} rect      The rectangular bounds of the drawing
   * @private
   */
  #refreshFrame(rect) {

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
    const border = rect.clone().pad(o);
    this.frame.border.clear().lineStyle(t, 0x000000).drawShape(border).lineStyle(h, bc).drawShape(border);

    // Draw the handle
    this.frame.handle.refresh(border);
    this.frame.visible = true;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the appearance of text displayed above the drawing.
   * @private
   */
  #refreshText() {
    if ( !this.text ) return;
    const {rotation, textAlpha, shape, hidden} = this.document;
    this.text.alpha = hidden ? Math.min(0.5, textAlpha) : (textAlpha ?? 1.0);
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
      position.x = Math.roundFast(position.x);
      position.y = Math.roundFast(position.y);
    }

    // Avoid adding duplicate points
    const last = this._fixedPoints.slice(-2);
    const next = [position.x - this.document.x, position.y - this.document.y];
    if ( next.equals(last) ) return;

    // Append the new point and update the shape
    const points = this._fixedPoints.concat(next);
    this.document.shape.updateSource({points});
    if ( !temporary ) {
      this._fixedPoints = points;
      this._drawTime = Date.now();
    }
  }

  /* -------------------------------------------- */

  /**
   * Remove the last fixed point from the polygon
   * @private
   */
  _removePoint() {
    this._fixedPoints.splice(-2);
    this.document.shape.updateSource({points: this._fixedPoints});
  }

  /* -------------------------------------------- */

  /** @override */
  _onControl(options) {
    super._onControl(options);
    if ( game.activeTool === "text" ) {
      this._onkeydown = this._onDrawingTextKeydown.bind(this);
      if ( !options.isNew ) this._pendingText = this.document.text;
      document.addEventListener("keydown", this._onkeydown);
    }
  }

  /* -------------------------------------------- */

  /** @override */
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
  _onDelete(...args) {
    super._onDelete(...args);
    if ( this._onkeydown ) document.removeEventListener("keydown", this._onkeydown);
  }

  /* -------------------------------------------- */

  /**
   * Handle text entry in an active text tool
   * @param {KeyboardEvent} event
   * @private
   */
  _onDrawingTextKeydown(event) {

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
      this.refresh();
    }

    // Conclude the workflow
    if ( conclude ) {
      this.release();
    }
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  /** @override */
  _onUpdate(changed, options, userId) {
    // Update elevation?
    if ( "z" in changed ) this.document.elevation = changed.z;

    // Fully re-draw when some drawing elements have changed
    const textChanged = ("text" in changed)
      || (this.document.text && ["fontFamily", "fontSize", "textColor", "width"].some(k => k in changed));
    if ( changed.shape?.type || ("texture" in changed) || textChanged ) {
      this.draw().then(() => super._onUpdate(changed, options, userId));
    }
    // Otherwise, simply refresh the existing drawing
    else super._onUpdate(changed, options, userId);
  }

  /* -------------------------------------------- */
  /*  Permission Controls                         */
  /* -------------------------------------------- */

  /** @override */
  _canControl(user, event) {
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
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  activateListeners() {
    super.activateListeners();
    this.frame.handle.off("mouseover").off("mouseout").off("mousedown")
      .on("mouseover", this._onHandleHoverIn.bind(this))
      .on("mouseout", this._onHandleHoverOut.bind(this))
      .on("mousedown", this._onHandleMouseDown.bind(this));
    this.frame.handle.interactive = true;
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse movement which modifies the dimensions of the drawn shape
   * @param {PIXI.InteractionEvent} event
   * @private
   */
  _onMouseDraw(event) {
    const {destination, origin, originalEvent} = event.data;
    const isShift = originalEvent.shiftKey;
    const isAlt = originalEvent.altKey;
    let position = destination;

    // Drag differently depending on shape type
    switch ( this.type ) {

      // Polygon Shapes
      case Drawing.SHAPE_TYPES.POLYGON:
        const isFreehand = game.activeTool === "freehand";
        let temporary = true;
        if ( isFreehand ) {
          const now = Date.now();
          temporary = (now - this._drawTime) < this.constructor.FREEHAND_SAMPLE_RATE;
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
    this.refresh();
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

    // Update each dragged Drawing, confirming pending text
    const clones = event.data.clones || [];
    const updates = clones.map(c => {
      let dest = {x: c.document.x, y: c.document.y};
      if ( !event.data.originalEvent.shiftKey ) {
        dest = canvas.grid.getSnappedPosition(dest.x, dest.y, this.layer.gridPrecision);
      }

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
    return canvas.scene.updateEmbeddedDocuments("Drawing", updates, {diff: false});
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftCancel(event) {
    if ( this._dragHandle ) return this._onHandleDragCancel(event);
    return super._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragStart() {
    super._onDragStart();
    const o = this._original;
    o.shape.alpha = o.alpha;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragEnd() {
    super._onDragEnd();
    if ( this.isPreview ) this._original.shape.alpha = 1.0;
  }

  /* -------------------------------------------- */
  /*  Resize Handling                             */
  /* -------------------------------------------- */

  /**
   * Handle mouse-over event on a control handle
   * @param {PIXI.InteractionEvent} event   The mouseover event
   * @private
   */
  _onHandleHoverIn(event) {
    const handle = event.target;
    handle.scale.set(1.5, 1.5);
    event.data.handle = event.target;
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-out event on a control handle
   * @param {PIXI.InteractionEvent} event   The mouseout event
   * @private
   */
  _onHandleHoverOut(event) {
    event.data.handle.scale.set(1.0, 1.0);
    if ( this.interactionState < MouseInteractionManager.INTERACTION_STATES.CLICKED ) {
      this._dragHandle = false;
    }
  }

  /* -------------------------------------------- */

  /**
   * When we start a drag event - create a preview copy of the Tile for re-positioning
   * @param {PIXI.InteractionEvent} event   The mousedown event
   * @private
   */
  _onHandleMouseDown(event) {
    if ( !this.document.locked ) {
      this._dragHandle = true;
      this._original = this.document.toObject();
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle the beginning of a drag event on a resize handle
   * @param {PIXI.InteractionEvent} event   The mouse interaction event
   * @private
   */
  _onHandleDragStart(event) {
    event.data.origin = {x: this.bounds.right, y: this.bounds.bottom};
  }

  /* -------------------------------------------- */

  /**
   * Handle mousemove while dragging a tile scale handler
   * @param {PIXI.InteractionEvent} event   The mouse interaction event
   * @private
   */
  _onHandleDragMove(event) {
    const {destination, origin, originalEvent} = event.data;

    // Pan the canvas if the drag event approaches the edge
    canvas._onDragCanvasPan(originalEvent);

    // Update Drawing dimensions
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    const normalized = this._rescaleDimensions(this._original, dx, dy);
    try {
      this.document.updateSource(normalized);
      this.refresh();
    } catch(err) {}
  }

  /* -------------------------------------------- */

  /**
   * Handle mouseup after dragging a tile scale handler
   * @param {PIXI.InteractionEvent} event   The mouseup event
   * @private
   */
  _onHandleDragDrop(event) {
    let {destination, origin, originalEvent} = event.data;
    if ( !originalEvent.shiftKey ) {
      destination = canvas.grid.getSnappedPosition(destination.x, destination.y, this.layer.gridPrecision);
    }
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    const update = this._rescaleDimensions(this._original, dx, dy);
    return this.document.update(update, {diff: false});
  }

  /* -------------------------------------------- */

  /**
   * Handle cancellation of a drag event for one of the resizing handles
   * @param {PointerEvent} event            The drag cancellation event
   * @private
   */
  _onHandleDragCancel(event) {
    this.document.updateSource(this._original);
    this._dragHandle = false;
    delete this._original;
    this.refresh();
  }

  /* -------------------------------------------- */

  /**
   * Apply a vectorized rescaling transformation for the drawing data
   * @param {Object} original     The original drawing data
   * @param {number} dx           The pixel distance dragged in the horizontal direction
   * @param {number} dy           The pixel distance dragged in the vertical direction
   * @private
   */
  _rescaleDimensions(original, dx, dy) {
    let {points, width, height} = original.shape;
    width += dx;
    height += dy;
    points = points || [];

    // Rescale polygon points
    if ( this.isPolygon ) {
      const scaleX = 1 + (dx / original.shape.width);
      const scaleY = 1 + (dy / original.shape.height);
      points = points.map((p, i) => p * (i % 2 ? scaleY : scaleX));
    }

    // Constrain drawing bounds by the contained text size
    if ( this.document.text ) {
      const textBounds = this.text.getLocalBounds();
      width = Math.max(textBounds.width + 16, width);
      height = Math.max(textBounds.height + 8, height);
    }

    // Normalize the shape
    return this.constructor.normalizeShape({
      x: original.x,
      y: original.y,
      shape: {width: Math.roundFast(width), height: Math.roundFast(height), points}
    });
  }

  /* -------------------------------------------- */

  /**
   * Adjust the location, dimensions, and points of the Drawing before committing the change
   * @param {object} data   The DrawingData pending update
   * @returns {object}      The adjusted data
   * @private
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
