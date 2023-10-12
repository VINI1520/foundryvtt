/**
 * A special subclass of PIXI.Container used to represent a Drawing in the PrimaryCanvasGroup.
 */
class DrawingShape extends PrimaryCanvasObjectMixin(PIXI.Graphics) {

  /**
   * Sorting values to deal with ties.
   * @type {number}
   */
  static PRIMARY_SORT_ORDER = 500;

  /**
   * @typedef {Object} PrimaryCanvasObjectDrawingShapeData
   * @property {object} shape               The shape
   * @property {number} x                   The x-coordinate of the PCO location
   * @property {number} y                   The y-coordinate of the PCO location
   * @property {number} z                   The z-index of the PCO
   * @property {number} bezierFactor        The bezier factor
   * @property {number} fillType            The fill type
   * @property {number} fillColor           The fill color
   * @property {number} fillAlpha           The fill alpha
   * @property {number} strokeWidth         The stroke width
   * @property {number} strokeColor         The stroke color
   * @property {number} strokeAlpha         The stroke alpha
   * @property {string} text                The text
   * @property {string} fontFamily          The text font family
   * @property {number} fontSize            The font size
   * @property {number} textColor           The text color
   * @property {number} textAlpha           The text alpha
   * @property {number} rotation            The rotation of this PCO
   * @property {boolean} hidden             The PCO is hidden?
   * @property {number} elevation           The elevation of the PCO
   * @property {number} sort                The sort key that resolves ties among the same elevation
   * @property {boolean} roof               The PCO is considered as a roof?
   * @property {boolean} overhead           The PCO is considered as overhead?
   * @property {object} occlusion           The occlusion object for this PCO
   * @property {object} texture             The data texture values
   */
  static get defaultData() {
    return foundry.utils.mergeObject(super.defaultData, {
      shape: {
        type: "",
        width: 0,
        height: 0,
        radius: null,
        points: []
      },
      bezierFactor: 0,
      fillType: 0,
      fillColor: 0x7C7C7C,
      fillAlpha: 0.5,
      strokeWidth: 8,
      strokeColor: 0xFFFFFF,
      strokeAlpha: 1,
      text: "New Text",
      fontFamily: "Signika",
      fontSize: 48,
      textColor: 0xFFFFFF,
      textAlpha: 1
    });
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  refresh() {
    if ( this._destroyed || !this.data.shape ) return;
    const hidden = this.data.hidden;
    this.clear();

    // Alpha and visibility
    this.alpha = hidden ? 0.5 : 1.0;
    this.visible = !hidden || game.user.isGM;

    // Outer Stroke
    const {strokeWidth, strokeColor, strokeAlpha} = this.data;
    if ( strokeWidth ) {
      let sc = Color.from(strokeColor || "#FFFFFF");
      const sw = strokeWidth ?? 8;
      this.lineStyle(sw, sc, strokeAlpha ?? 1);
    }

    // Fill Color or Texture
    const {fillType, fillColor, fillAlpha} = this.data;
    if ( fillType ) {
      const fc = Color.from(fillColor || "#FFFFFF");
      if ( (fillType === CONST.DRAWING_FILL_TYPES.PATTERN) && this.texture ) {
        this.beginTextureFill({
          texture: this.texture,
          color: fc || 0xFFFFFF,
          alpha: fc ? fillAlpha : 1
        });
      }
      else this.beginFill(fc, fillAlpha);
    }

    // Draw the shape
    const {shape, bezierFactor} = this.data;
    switch ( shape.type ) {
      case Drawing.SHAPE_TYPES.RECTANGLE:
        this._drawRectangle();
        break;
      case Drawing.SHAPE_TYPES.ELLIPSE:
        this._drawEllipse();
        break;
      case Drawing.SHAPE_TYPES.POLYGON:
        if ( bezierFactor ) this._drawFreehand();
        else this._drawPolygon();
        break;
    }

    // Conclude fills
    this.lineStyle(0x000000, 0.0).closePath().endFill();

    // Set the drawing shape position
    this.setPosition();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  setPosition() {
    const {x, y, z, hidden, shape, rotation} = this.data;
    this.pivot.set(shape.width / 2, shape.height / 2);
    this.position.set(x + this.pivot.x, y + this.pivot.y);
    this.zIndex = z; // This is a temporary solution to ensure the sort order updates
    this.angle = rotation;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getCanvasDocumentData(data) {
    const dt = super._getCanvasDocumentData(data);
    dt.width = data.shape.width;
    dt.height = data.shape.height;
    return dt;
  }

  /* -------------------------------------------- */

  /**
   * Draw rectangular shapes.
   * @protected
   */
  _drawRectangle() {
    const {shape, strokeWidth} = this.data;
    const hs = strokeWidth / 2;
    this.drawRect(hs, hs, shape.width - (2*hs), shape.height - (2*hs));
  }

  /* -------------------------------------------- */

  /**
   * Draw ellipsoid shapes.
   * @protected
   */
  _drawEllipse() {
    const {shape, strokeWidth} = this.data;
    const hw = shape.width / 2;
    const hh = shape.height / 2;
    const hs = strokeWidth / 2;
    const width = Math.max(Math.abs(hw) - hs, 0);
    const height = Math.max(Math.abs(hh) - hs, 0);
    this.drawEllipse(hw, hh, width, height);
  }

  /* -------------------------------------------- */

  /**
   * Draw polygonal shapes.
   * @protected
   */
  _drawPolygon() {
    const {shape, fillType} = this.data;
    const points = shape.points;
    if ( points.length < 4 ) return;
    else if ( points.length === 4 ) this.endFill();

    // Get drawing points
    const first = points.slice(0, 2);
    const last = points.slice(-2);
    const isClosed = first.equals(last);

    // If the polygon is closed, or if we are filling it, we can shortcut using the drawPolygon helper
    if ( (points.length > 4) && (isClosed || fillType) ) return this.drawPolygon(points);

    // Otherwise, draw each line individually
    this.moveTo(...first);
    for ( let i=3; i<points.length; i+=2 ) {
      this.lineTo(points[i-1], points[i]);
    }
  }

  /* -------------------------------------------- */

  /**
   * Draw freehand shapes with bezier spline smoothing.
   * @protected
   */
  _drawFreehand() {
    const {bezierFactor, fillType, shape} = this.data;

    // Get drawing points
    let points = shape.points;
    const first = points.slice(0, 2);
    const last = points.slice(-2);
    const isClosed = first.equals(last);

    // Draw simple polygons if only 2 points are present
    if ( points.length <= 4 ) return this._drawPolygon();

    // Set initial conditions
    const factor = bezierFactor ?? 0.5;
    let previous = first;
    let point = points.slice(2, 4);
    points = points.concat(last);  // Repeat the final point so the bezier control points know how to finish
    let cp0 = DrawingShape.#getBezierControlPoints(factor, last, previous, point).nextCP;
    let cp1;
    let nextCP;

    // Begin iteration
    this.moveTo(first[0], first[1]);
    for ( let i=4; i<points.length-1; i+=2 ) {
      const next = [points[i], points[i+1]];
      if ( next ) {
        let bp = DrawingShape.#getBezierControlPoints(factor, previous, point, next);
        cp1 = bp.cp1;
        nextCP = bp.nextCP;
      }

      // First point
      if ( (i === 4) && !isClosed ) {
        this.quadraticCurveTo(cp1.x, cp1.y, point[0], point[1]);
      }

      // Last Point
      else if ( (i === points.length-2) && !isClosed ) {
        this.quadraticCurveTo(cp0.x, cp0.y, point[0], point[1]);
      }

      // Bezier points
      else {
        this.bezierCurveTo(cp0.x, cp0.y, cp1.x, cp1.y, point[0], point[1]);
      }

      // Increment
      previous = point;
      point = next;
      cp0 = nextCP;
    }

    // Close the figure if a fill is required
    if ( fillType && !isClosed ) this.lineTo(first[0], first[1]);
  }

  /* -------------------------------------------- */

  /**
   * Attribution: The equations for how to calculate the bezier control points are derived from Rob Spencer's article:
   * http://scaledinnovation.com/analytics/splines/aboutSplines.html
   * @param {number} factor       The smoothing factor
   * @param {number[]} previous   The prior point
   * @param {number[]} point      The current point
   * @param {number[]} next       The next point
   * @returns {{cp1: Point, nextCP: Point}} The bezier control points
   * @private
   */
  static #getBezierControlPoints(factor, previous, point, next) {

    // Calculate distance vectors
    const vector = {x: next[0] - previous[0], y: next[1] - previous[1]};
    const preDistance = Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    const postDistance = Math.hypot(next[0] - point[0], next[1] - point[1]);
    const distance = preDistance + postDistance;

    // Compute control point locations
    const cp0d = distance === 0 ? 0 : factor * (preDistance / distance);
    const cp1d = distance === 0 ? 0 : factor * (postDistance / distance);

    // Return points
    return {
      cp1: {
        x: point[0] - (vector.x * cp0d),
        y: point[1] - (vector.y * cp0d)
      },
      nextCP: {
        x: point[0] + (vector.x * cp1d),
        y: point[1] + (vector.y * cp1d)
      }
    };
  }
}
