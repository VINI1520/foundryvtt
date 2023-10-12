/**
 * The base grid class.
 * This double-dips to implement the "gridless" option
 */
class BaseGrid extends PIXI.Container {
  constructor(options) {
    super();
    this.options = options;

    /**
     * Grid Unit Width
     */
    this.w = options.dimensions.size;

    /**
     * Grid Unit Height
     */
    this.h = options.dimensions.size;
  }

  /* -------------------------------------------- */

  /**
   * Returns the class responsible for the implementation of a given grid type.
   * @param {number} gridType  The grid type. {@see CONST.GRID_TYPES}
   * @returns {Function}  (typeof BaseGrid) A constructor for a grid of the given type.
   */
  static implementationFor(gridType) {
    const types = CONST.GRID_TYPES;
    if ( gridType === types.SQUARE ) return SquareGrid;
    else if ( [types.HEXEVENR, types.HEXODDR, types.HEXEVENQ, types.HEXODDQ].includes(gridType) ) return HexagonalGrid;
    return BaseGrid;
  }

  /* -------------------------------------------- */

  /**
   * Calculate the total size of the canvas with padding applied, as well as the top-left co-ordinates of the inner
   * rectangle that houses the scene.
   * @param {number} gridType           The grid type to calculate padding for. {@see CONST.GRID_TYPES}
   * @param {number} width              The width of the scene.
   * @param {number} height             The height of the scene.
   * @param {number} size               The grid size.
   * @param {number} padding            The percentage of padding.
   * @param {object} [options]          Options to configure the padding calculation.
   * @param {boolean} [options.legacy]  Are we computing padding for a legacy scene?
   * @returns {{width: number, height: number, x: number, y: number}}
   */
  static calculatePadding(gridType, width, height, size, padding, options={}) {
    const x = (padding * width).toNearest(size, "ceil");
    const y = (padding * height).toNearest(size, "ceil");
    return {
      width: width + (2 * x),
      height: height + (2 * y),
      x, y
    };
  }

  /* -------------------------------------------- */

  /**
   * Draw the grid. Subclasses are expected to override this method to perform their type-specific drawing logic.
   * @param {object} [options]                  Override settings used in place of those saved to the scene data.
   * @param {string|null} [options.color=null]  The grid color.
   * @param {number|null} [options.alpha=null]  The grid transparency.
   * @returns {BaseGrid}
   */
  draw(options={}) {
    const {color, alpha, gridColor, gridAlpha} = options;
    /** @deprecated since v10 */
    if ( gridColor !== undefined ) {
      foundry.utils.logCompatibilityWarning("You are passing the gridColor parameter to SquareGrid#draw which is "
        + "deprecated in favor of the color parameter.", {since: 10, until: 12});
      if ( color === undefined ) options.color = gridColor;
    }
    /** @deprecated since v10 */
    if ( gridAlpha !== undefined ) {
      foundry.utils.logCompatibilityWarning("You are passing the gridAlpha parameter to SquareGrid#draw which is "
        + "deprecate in favor of the alpha parameter.", {since: 10, until: 12});
      if ( alpha === undefined ) options.alpha = gridAlpha;
    }
    this.removeChildren().forEach(c => c.destroy(true));
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Highlight a grid position for a certain coordinate
   * @param {GridHighlight} layer                The highlight layer to use
   * @param {object} [options]                   Additional options to configure behaviour.
   * @param {number} [options.x]                 The x-coordinate of the highlighted position
   * @param {number} [options.y]                 The y-coordinate of the highlighted position
   * @param {number} [options.color=0x33BBFF]    The hex fill color of the highlight
   * @param {number|null} [options.border=null]  The hex border color of the highlight
   * @param {number} [options.alpha=0.25]        The opacity of the highlight
   * @param {PIXI.Polygon} [options.shape=null]  A predefined shape to highlight
   */
  highlightGridPosition(layer, {x, y, color=0x33BBFF, border=null, alpha=0.25, shape=null}={}) {
    if ( !shape ) return;
    layer.beginFill(color, alpha);
    if ( Number.isFinite(border) ) layer.lineStyle(2, border, Math.min(alpha*1.5, 1.0));
    layer.drawShape(shape).endFill();
  }

  /* -------------------------------------------- */

  /**
   * Tests whether the given co-ordinates at the center of a grid space are contained within a given shape.
   * @param {number} x            The X co-ordinate.
   * @param {number} y            The Y co-ordinate.
   * @param {PIXI.Polygon} shape  The shape.
   * @returns {boolean}
   * @private
   */
  _testShape(x, y, shape) {
    for ( let dx = -0.5; dx <= 0.5; dx += 0.5 ) {
      for ( let dy = -0.5; dy <= 0.5; dy += 0.5 ) {
        if ( shape.contains(x + dx, y + dy) ) return true;
      }
    }
    return false;
  }

  /* -------------------------------------------- */
  /*  Grid Measurement Methods
  /* -------------------------------------------- */

  /**
   * Given a pair of coordinates (x, y) - return the top-left of the grid square which contains that point
   * @return {number[]}    An Array [x, y] of the top-left coordinate of the square which contains (x, y)
   */
  getTopLeft(x, y) {
    let [row, col] = this.getGridPositionFromPixels(x,y);
    return this.getPixelsFromGridPosition(row, col);
  }

  /* -------------------------------------------- */

  /**
   * Given a pair of coordinates (x, y), return the center of the grid square which contains that point
   * @param {number} x          The x-coordinate
   * @param {number} y          The y-coordinate
   * @return {number[]}         An array [cx, cy] of the central point of the grid space which contains (x, y)
   */
  getCenter(x, y) {
    return [x, y];
  }

  /* -------------------------------------------- */

  /**
   * Given a pair of coordinates (x1,y1), return the grid coordinates (x2,y2) which represent the snapped position
   * Under a "gridless" system, every pixel position is a valid snapping position
   *
   * @param {number} x                The exact target location x
   * @param {number} y                The exact target location y
   * @param {number|null} [interval]  An interval of grid spaces at which to snap.
   *                                  At interval=1, snapping occurs at pixel intervals defined by the grid size
   *                                  At interval=2, snapping would occur at the center-points of each grid size
   *                                  At interval=null, no snapping occurs
   * @param {object} [options]        Additional options to configure snapping behaviour.
   * @param {Token} [options.token]   The token that is being moved.
   * @returns {{x, y}}                An object containing the coordinates of the snapped location
   */
  getSnappedPosition(x, y, interval=null, options={}) {
    interval = interval ?? 1;
    return {
      x: x.toNearest(this.w / interval),
      y: y.toNearest(this.h / interval)
    };
  }

  /* -------------------------------------------- */

  /**
   * Given a pair of pixel coordinates, return the grid position as an Array.
   * Always round down to the nearest grid position so the pixels are within the grid space (from top-left).
   * @param {number} x    The x-coordinate pixel position
   * @param {number} y    The y-coordinate pixel position
   * @returns {number[]}  An array representing the position in grid units
   */
  getGridPositionFromPixels(x, y) {
    return [x, y].map(Math.round);
  }

  /* -------------------------------------------- */

  /**
   * Given a pair of grid coordinates, return the pixel position as an Array.
   * Always round up to a whole pixel so the pixel is within the grid space (from top-left).
   * @param {number} x    The x-coordinate grid position
   * @param {number} y    The y-coordinate grid position
   * @returns {number[]}  An array representing the position in pixels
   */
  getPixelsFromGridPosition(x, y) {
    return [x, y].map(Math.round);
  }

  /* -------------------------------------------- */

  /**
   * Shift a pixel position [x,y] by some number of grid units dx and dy
   * @param {number} x               The starting x-coordinate in pixels
   * @param {number} y               The starting y-coordinate in pixels
   * @param {number} dx              The number of grid positions to shift horizontally
   * @param {number} dy              The number of grid positions to shift vertically
   * @param {object} [options]       Additional options to configure shift behaviour.
   * @param {Token} [options.token]  The token that is being shifted.
   */
  shiftPosition(x, y, dx, dy, options={}) {
    let s = canvas.dimensions.size;
    return [x + (dx*s), y + (dy*s)];
  }

  /* -------------------------------------------- */

  /**
   * Measure the distance traversed over an array of measured segments
   * @param {object[]} segments                An Array of measured movement segments
   * @param {MeasureDistancesOptions} options  Additional options which modify the measurement
   * @returns {number[]}                       An Array of distance measurements for each segment
   */
  measureDistances(segments, options={}) {
    const d = canvas.dimensions;
    return segments.map(s => {
      return (s.ray.distance / d.size) * d.distance;
    });
  }

  /* -------------------------------------------- */

  /**
   * Get the grid row and column positions which are neighbors of a certain position
   * @param {number} row  The grid row coordinate against which to test for neighbors
   * @param {number} col  The grid column coordinate against which to test for neighbors
   * @returns {Array<[number, number]>} An array of grid positions which are neighbors of the row and column
   */
  getNeighbors(row, col) {
    return [];
  }

  /* -------------------------------------------- */

  /**
   * Determine a placeable's bounding box based on the size of the grid.
   * @param {number} w  The width in grid spaces.
   * @param {number} h  The height in grid spaces.
   * @returns {PIXI.Rectangle}
   */
  getRect(w, h) {
    return new PIXI.Rectangle(0, 0, w * this.w, h * this.h);
  }

  /* -------------------------------------------- */

  /**
   * Calculate the resulting token position after moving along a ruler segment.
   * @param {Ray} ray       The ray being moved along.
   * @param {Point} offset  The offset of the ruler's origin relative to the token's position.
   * @param {Token} token   The token placeable being moved.
   * @internal
   */
  _getRulerDestination(ray, offset, token) {
    const [x, y] = this.getTopLeft(ray.B.x + offset.x, ray.B.y + offset.y);
    return {x, y};
  }
}
