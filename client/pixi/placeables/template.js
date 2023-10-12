/**
 * A type of Placeable Object which highlights an area of the grid as covered by some area of effect.
 * @category - Canvas
 * @see {@link MeasuredTemplateDocument}
 * @see {@link TemplateLayer}
 */
class MeasuredTemplate extends PlaceableObject {

  /**
   * The geometry shape used for testing point intersection
   * @type {PIXI.Circle | PIXI.Ellipse | PIXI.Polygon | PIXI.Rectangle | PIXI.RoundedRectangle}
   */
  shape;

  /**
   * The tiling texture used for this template, if any
   * @type {PIXI.Texture}
   */
  texture;

  /**
   * The template graphics
   * @type {PIXI.Graphics}
   */
  template;


  /**
   * The template control icon
   * @type {ControlIcon}
   */
  controlIcon;

  /**
   * The measurement ruler label
   * @type {PreciseText}
   */
  ruler;

  /**
   * Internal property used to configure the control border thickness
   * @type {number}
   * @private
   */
  _borderThickness = 3;

  /** @inheritdoc */
  static embeddedName = "MeasuredTemplate";

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @inheritdoc */
  get bounds() {
    const {x, y} = this.document;
    const d = canvas.dimensions;
    const r = this.document.distance * (d.size / d.distance);
    return new PIXI.Rectangle(x-r, y-r, 2*r, 2*r);
  }

  /* -------------------------------------------- */

  /**
   * A convenience accessor for the border color as a numeric hex code
   * @returns {number}
   */
  get borderColor() {
    return this.document.borderColor ? this.document.borderColor.replace("#", "0x") : 0x000000;
  }

  /* -------------------------------------------- */

  /**
   * A convenience accessor for the fill color as a numeric hex code
   * @returns {number}
   */
  get fillColor() {
    return this.document.fillColor ? this.document.fillColor.replace("#", "0x") : 0x000000;
  }

  /* -------------------------------------------- */

  /**
   * A flag for whether the current User has full ownership over the MeasuredTemplate document.
   * @type {boolean}
   */
  get owner() {
    return this.document.isOwner;
  }

  /* -------------------------------------------- */

  /**
   * Is this MeasuredTemplate currently visible on the Canvas?
   * @type {boolean}
   */
  get isVisible() {
    return this.owner || !this.document.hidden;
  }

  /* -------------------------------------------- */

  /**
   * A unique identifier which is used to uniquely identify related objects like a template effect or grid highlight.
   * @type {string}
   */
  get highlightId() {
    return `${this.document.documentName}.${this.document.id}`;
  }

  /* -------------------------------------------- */
  /*  Rendering
  /* -------------------------------------------- */

  /** @override */
  async _draw() {

    // Load the texture
    if ( this.document.texture ) {
      this.texture = await loadTexture(this.document.texture, {fallback: "icons/svg/hazard.svg"});
    } else {
      this.texture = null;
    }

    // Draw template components
    this.template = this.addChild(new PIXI.Graphics());
    this.controlIcon = this.addChild(this._drawControlIcon());
    this.ruler = this.addChild(this._drawRulerText());

    // Enable highlighting for this template
    canvas.grid.addHighlightLayer(this.highlightId);
  }

  /* -------------------------------------------- */

  /** @override */
  _destroy(options) {
    if ( !this.isPreview ) canvas.grid.destroyHighlightLayer(this.highlightId);
    this.texture?.destroy();
  }

  /* -------------------------------------------- */

  /**
   * Draw the ControlIcon for the MeasuredTemplate
   * @returns {ControlIcon}
   * @private
   */
  _drawControlIcon() {
    const size = Math.max(Math.round((canvas.dimensions.size * 0.5) / 20) * 20, 40);
    let icon = new ControlIcon({texture: CONFIG.controlIcons.template, size: size});
    icon.x -= (size * 0.5);
    icon.y -= (size * 0.5);
    return icon;
  }

  /* -------------------------------------------- */

  /**
   * Draw the Text label used for the MeasuredTemplate
   * @returns {PreciseText}
   * @private
   */
  _drawRulerText() {
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = Math.max(Math.round(canvas.dimensions.size * 0.36 * 12) / 12, 36);
    const text = new PreciseText(null, style);
    text.anchor.set(0, 1);
    return text;
  }

  /* -------------------------------------------- */

  /** @override */
  _refresh(options) {
    let {x, y, direction, distance, angle, width} = this.document;
    let d = canvas.dimensions;
    distance *= (d.size / d.distance);
    width *= (d.size / d.distance);
    direction = Math.toRadians(direction);

    // Template position
    this.position.set(x, y);

    // Create ray and bounding rectangle
    this.ray = Ray.fromAngle(x, y, direction, distance);

    // Get the Template shape
    switch ( this.document.t ) {
      case "circle":
        this.shape = this._getCircleShape(distance);
        break;
      case "cone":
        this.shape = this._getConeShape(direction, angle, distance);
        break;
      case "rect":
        this.shape = this._getRectShape(direction, distance);
        break;
      case "ray":
        this.shape = this._getRayShape(direction, distance, width);
    }

    // Draw the template shape and highlight the grid
    this._refreshTemplate();
    this.highlightGrid();

    // Update the HUD
    this._refreshControlIcon();
    this._refreshRulerText();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of the template outline and shape.
   * @protected
   */
  _refreshTemplate() {
    const t = this.template.clear();
    if ( !this.isVisible ) return;

    // Draw the Template outline
    t.lineStyle(this._borderThickness, this.borderColor, 0.75).beginFill(0x000000, 0.0);

    // Fill Color or Texture
    if ( this.texture ) t.beginTextureFill({texture: this.texture});
    else t.beginFill(0x000000, 0.0);

    // Draw the shape
    t.drawShape(this.shape);

    // Draw origin and destination points
    t.lineStyle(this._borderThickness, 0x000000)
      .beginFill(0x000000, 0.5)
      .drawCircle(0, 0, 6)
      .drawCircle(this.ray.dx, this.ray.dy, 6)
      .endFill();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of the ControlIcon for this MeasuredTemplate object.
   * @protected
   */
  _refreshControlIcon() {
    const ci = this.controlIcon;
    const isHidden = this.document.hidden;
    this.controlIcon.tintColor = isHidden ? 0xFF3300 : 0xFFFFFF;
    this.controlIcon.borderColor = isHidden ? 0xFF3300 : 0xFF5500;
    ci.draw();
    ci.visible = this.layer.active && this.isVisible;
    ci.border.visible = this.hover;
  }

  /* -------------------------------------------- */

  /**
   * Get a Circular area of effect given a radius of effect
   * @param {number} distance
   * @private
   */
  _getCircleShape(distance) {
    return new PIXI.Circle(0, 0, distance);
  }

  /* -------------------------------------------- */

  /**
   * Get a Conical area of effect given a direction, angle, and distance
   * @param {number} direction
   * @param {number} angle
   * @param {number} distance
   * @private
   */
  _getConeShape(direction, angle, distance) {
    angle = angle || 90;
    const coneType = game.settings.get("core", "coneTemplateType");

    // For round cones - approximate the shape with a ray every 3 degrees
    let angles;
    if ( coneType === "round" ) {
      const da = Math.min(angle, 3);
      angles = Array.fromRange(Math.floor(angle/da)).map(a => (angle/-2) + (a*da)).concat([angle/2]);
    }

    // For flat cones, direct point-to-point
    else {
      angles = [(angle/-2), (angle/2)];
      distance /= Math.cos(Math.toRadians(angle/2));
    }

    // Get the cone shape as a polygon
    const rays = angles.map(a => Ray.fromAngle(0, 0, direction + Math.toRadians(a), distance+1));
    const points = rays.reduce((arr, r) => {
      return arr.concat([r.B.x, r.B.y]);
    }, [0, 0]).concat([0, 0]);
    return new PIXI.Polygon(points);
  }

  /* -------------------------------------------- */

  /**
   * Get a Rectangular area of effect given a width and height
   * @param {number} direction
   * @param {number} distance
   * @private
   */
  _getRectShape(direction, distance) {
    let d = canvas.dimensions;
    let r = Ray.fromAngle(0, 0, direction, distance);
    let dx = Math.round(r.dx / (d.size / 2)) * (d.size / 2);
    let dy = Math.round(r.dy / (d.size / 2)) * (d.size / 2);
    return new PIXI.Rectangle(0, 0, dx + Math.sign(dx), dy + Math.sign(dy)).normalize();
  }

  /* -------------------------------------------- */

  /**
   * Get a rotated Rectangular area of effect given a width, height, and direction
   * @param {number} direction
   * @param {number} distance
   * @param {number} width
   * @private
   */
  _getRayShape(direction, distance, width) {
    let up = Ray.fromAngle(0, 0, direction - Math.toRadians(90), (width / 2)+1);
    let down = Ray.fromAngle(0, 0, direction + Math.toRadians(90), (width / 2)+1);
    let l1 = Ray.fromAngle(up.B.x, up.B.y, direction, distance+1);
    let l2 = Ray.fromAngle(down.B.x, down.B.y, direction, distance+1);

    // Create Polygon shape and draw
    const points = [down.B.x, down.B.y, up.B.x, up.B.y, l1.B.x, l1.B.y, l2.B.x, l2.B.y, down.B.x, down.B.y];
    return new PIXI.Polygon(points);
  }

  /* -------------------------------------------- */

  /**
   * Update the displayed ruler tooltip text
   * @private
   */
  _refreshRulerText() {
    let text;
    let u = canvas.scene.grid.units;
    if ( this.document.t === "rect" ) {
      let d = canvas.dimensions;
      let dx = Math.round(this.ray.dx) * (d.distance / d.size);
      let dy = Math.round(this.ray.dy) * (d.distance / d.size);
      let w = Math.round(dx * 10) / 10;
      let h = Math.round(dy * 10) / 10;
      text = `${w}${u} x ${h}${u}`;
    } else {
      let d = Math.round(this.document.distance * 10) / 10;
      text = `${d}${u}`;
    }
    this.ruler.text = text;
    this.ruler.position.set(this.ray.dx + 10, this.ray.dy + 5);
    this.ruler.visible = this.layer.active && this.isVisible;
  }

  /* -------------------------------------------- */

  /**
   * Highlight the grid squares which should be shown under the area of effect
   */
  highlightGrid() {
    if ( !this.id || !this.shape ) return;

    // Clear the existing highlight layer
    const grid = canvas.grid;
    const hl = grid.getHighlightLayer(this.highlightId);
    hl.clear();
    if ( !this.isVisible ) return;

    // Highlight colors
    const border = this.borderColor;
    const color = this.fillColor;

    // If we are in grid-less mode, highlight the shape directly
    if ( grid.type === CONST.GRID_TYPES.GRIDLESS ) {
      const shape = this._getGridHighlightShape();
      grid.grid.highlightGridPosition(hl, {border, color, shape});
    }

    // Otherwise, highlight specific grid positions
    else {
      const positions = this._getGridHighlightPositions();
      for ( const {x, y} of positions ) {
        grid.grid.highlightGridPosition(hl, {x, y, border, color});
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Get the shape to highlight on a Scene which uses grid-less mode.
   * @returns {PIXI.Polygon|PIXI.Circle|PIXI.Rectangle}
   * @protected
   */
  _getGridHighlightShape() {
    const shape = this.shape.clone();
    if ( "points" in shape ) {
      shape.points = shape.points.map((p, i) => {
        if ( i % 2 ) return this.y + p;
        else return this.x + p;
      });
    } else {
      shape.x += this.x;
      shape.y += this.y;
    }
    return shape;
  }

  /* -------------------------------------------- */

  /**
   * Get an array of points which define top-left grid spaces to highlight for square or hexagonal grids.
   * @returns {Point[]}
   * @protected
   */
  _getGridHighlightPositions() {
    const grid = canvas.grid.grid;
    const d = canvas.dimensions;
    const {x, y, distance} = this.document;

    // Get number of rows and columns
    const [maxRow, maxCol] = grid.getGridPositionFromPixels(d.width, d.height);
    let nRows = Math.ceil(((distance * 1.5) / d.distance) / (d.size / grid.h));
    let nCols = Math.ceil(((distance * 1.5) / d.distance) / (d.size / grid.w));
    [nRows, nCols] = [Math.min(nRows, maxRow), Math.min(nCols, maxCol)];

    // Get the offset of the template origin relative to the top-left grid space
    const [tx, ty] = grid.getTopLeft(x, y);
    const [row0, col0] = grid.getGridPositionFromPixels(tx, ty);
    const [hx, hy] = [Math.ceil(grid.w / 2), Math.ceil(grid.h / 2)];
    const isCenter = (x - tx === hx) && (y - ty === hy);

    // Identify grid coordinates covered by the template Graphics
    const positions = [];
    for ( let r = -nRows; r < nRows; r++ ) {
      for ( let c = -nCols; c < nCols; c++ ) {
        const [gx, gy] = grid.getPixelsFromGridPosition(row0 + r, col0 + c);
        const [testX, testY] = [(gx+hx) - x, (gy+hy) - y];
        const contains = ((r === 0) && (c === 0) && isCenter ) || grid._testShape(testX, testY, this.shape);
        if ( !contains ) continue;
        positions.push({x: gx, y: gy});
      }
    }
    return positions;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @override */
  async rotate(angle, snap) {
    const direction = this._updateRotation({angle, snap});
    return this.document.update({direction});
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /** @override */
  _canControl(user, event) {
    return user.isGM || (user === this.document.user);
  }

  /** @inheritdoc */
  _canHUD(user, event) {
    return this.owner; // Allow template owners to right-click
  }

  /** @inheritdoc */
  _canConfigure(user, event) {
    return false; // Double-right does nothing
  }

  /** @override */
  _canView(user, event) {
    return this._canControl(user, event);
  }

  /** @inheritdoc */
  _onClickRight(event) {
    this.document.update({hidden: !this.document.hidden});
  }

  /** @inheritDoc */
  _onDragStart() {
    super._onDragStart();
    if ( this.isPreview ) this._original.renderable = false;
  }

  /** @inheritDoc */
  _onDragEnd() {
    super._onDragEnd();
    if ( this.isPreview ) this._original.renderable = true;
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data, options, userId) {
    const changed = new Set(Object.keys(data));
    if ( changed.has("texture") ) {
      this.draw();
      options.skipRefresh = true;
    }
    super._onUpdate(data, options, userId);
  }
}

