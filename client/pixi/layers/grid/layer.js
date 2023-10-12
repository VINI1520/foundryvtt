/**
 * A CanvasLayer responsible for drawing a square grid
 */
class GridLayer extends CanvasLayer {

  /**
   * The Grid container
   * @type {BaseGrid}
   */
  grid;

  /**
   * The Grid Highlight container
   * @type {PIXI.Container}
   */
  highlight;

  /**
   * Map named highlight layers
   * @type {Object<GridHighlight>}
   */
  highlightLayers = {};

  /**
   * Placeable Object borders which are drawn overtop of the Grid
   * @type {PIXI.Container}
   */
  borders;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {name: "grid"});
  }

  /* -------------------------------------------- */

  /**
   * The grid type rendered in this Scene
   * @type {number}
   */
  get type() {
    return canvas.scene.grid.type;
  }

  /**
   * A convenient reference to the pixel grid size used throughout this layer
   * @type {number}
   */
  get size() {
    return canvas.dimensions.size;
  }

  /**
   * Get grid unit width
   */
  get w() {
    return this.grid.w;
  }

  /**
   * Get grid unit height
   */
  get h() {
    return this.grid.h;
  }

  /**
   * A boolean flag for whether the current grid is hexagonal
   * @type {boolean}
   */
  get isHex() {
    const gt = CONST.GRID_TYPES;
    return [gt.HEXODDQ, gt.HEXEVENQ, gt.HEXODDR, gt.HEXEVENR].includes(this.type);
  }

  /* -------------------------------------------- */

  /**
   * Draw the grid
   * @param {Object} preview    Override settings used in place of those saved to the Scene data
   * @param {number|null} [preview.type]
   * @param {object|null} [preview.dimensions]
   * @param {number} preview.color
   * @param {number} preview.alpha
   * @param {number} preview.gridColor
   * @param {number} preview.gridAlpha
   */
  async _draw({type=null, dimensions=null, color, alpha, gridColor, gridAlpha}={}) {

    /** @deprecated since v10 */
    if ( gridColor !== undefined ) {
      foundry.utils.logCompatibilityWarning("You are passing the gridColor parameter to GridLayer#draw which is "
        + "deprecated in favor of the color parameter.", {since: 10, until: 12});
      if ( color === undefined ) color = gridColor;
    }

    /** @deprecated since v10 */
    if ( gridAlpha !== undefined ) {
      foundry.utils.logCompatibilityWarning("You are passing the gridAlpha parameter to GridLayer#draw which is "
        + "deprecated in favor of the alpha parameter instead.", {since: 10, until: 12});
      if ( alpha === undefined ) alpha = gridAlpha;
    }

    // Get grid data
    const gt = type !== null ? type : this.type;

    // Create the grid class
    let gridOptions = {
      dimensions: dimensions || canvas.dimensions,
      color: color || canvas.scene.grid.color.replace("#", "0x") || "0x000000",
      alpha: alpha ?? canvas.scene.grid.alpha,
      legacy: canvas.scene.flags.core?.legacyHex
    };
    const gridCls = BaseGrid.implementationFor(gt);
    if ( gridCls.getConfig ) Object.assign(gridOptions, gridCls.getConfig(gt, dimensions?.size ?? this.size));
    const grid = new gridCls(gridOptions);

    // Draw the highlight layer
    this.highlightLayers = {};
    this.highlight = this.addChild(new PIXI.Container());

    // Draw the grid
    this.grid = this.addChild(grid.draw());

    // Draw object borders container
    this.borders = this.addChild(new PIXI.Container());

    // Add the reverse mask filter
    this.filterArea = canvas.app.renderer.screen;
    this.filters = [ReverseMaskFilter.create({
      uMaskSampler: canvas.primary.tokensRenderTexture,
      channel: "a"
    })];
  }

  /* -------------------------------------------- */

  /**
   * Given a pair of coordinates (x1,y1), return the grid coordinates (x2,y2) which represent the snapped position
   * @param {number} x          The exact target location x
   * @param {number} y          The exact target location y
   * @param {number} [interval=1]  An interval of grid spaces at which to snap, default is 1.
   *                               If the interval is zero, no snapping occurs.
   * @param {object} [options]  Additional options to configure snapping behaviour.
   * @param {Token} [options.token]  The token.
   */
  getSnappedPosition(x, y, interval=1, options={}) {
    if ( interval === 0 ) return {x, y};
    return this.grid.getSnappedPosition(x, y, interval, options);
  }

  /* -------------------------------------------- */

  /**
   * Given a pair of coordinates (x, y) - return the top-left of the grid square which contains that point
   * @param {number} x      Coordinate X.
   * @param {number} y      Coordinate Y.
   * @returns {number[]}    An Array [x, y] of the top-left coordinate of the square which contains (x, y)
   */
  getTopLeft(x, y) {
    return this.grid.getTopLeft(x, y);
  }

  /* -------------------------------------------- */

  /**
   * Given a pair of coordinates (x, y), return the center of the grid square which contains that point
   * @param {number} x      Coordinate X.
   * @param {number} y      Coordinate Y.
   * @returns {number[]}    An Array [x, y] of the central point of the square which contains (x, y)
   */
  getCenter(x, y) {
    return this.grid.getCenter(x, y);
  }

  /* -------------------------------------------- */

  /**
   * @typedef {object} MeasureDistancesOptions
   * @property {boolean} [gridSpaces]  Return the distance in grid increments rather than the co-ordinate distance.
   */

  /**
   * Measure the distance between two point coordinates.
   * @param {{x: number, y: number}} origin    The origin point
   * @param {{x: number, y: number}} target    The target point
   * @param {MeasureDistancesOptions} options  Additional options which modify the measurement
   * @returns {number}                         The measured distance between these points
   *
   * @example Measure grid distance between two points
   * ```js
   * let distance = canvas.grid.measureDistance({x: 1000, y: 1000}, {x: 2000, y: 2000});
   * ```
   */
  measureDistance(origin, target, options={}) {
    const ray = new Ray(origin, target);
    const segments = [{ray}];
    return this.grid.measureDistances(segments, options)[0];
  }

  /* -------------------------------------------- */

  /**
   * Measure the distance traveled over an array of distance segments.
   * @param {object[]} segments                An array of measured segments
   * @param {MeasureDistancesOptions} options  Additional options which modify the measurement
   */
  measureDistances(segments, options={}) {
    return this.grid.measureDistances(segments, options);
  }

  /* -------------------------------------------- */
  /*  Grid Highlighting Methods
  /* -------------------------------------------- */

  /**
   * Define a new Highlight graphic
   * @param {string} name     The name for the referenced highlight layer
   */
  addHighlightLayer(name) {
    const layer = this.highlightLayers[name];
    if ( !layer || layer._destroyed ) {
      this.highlightLayers[name] = this.highlight.addChild(new GridHighlight(name));
    }
    return this.highlightLayers[name];
  }

  /* -------------------------------------------- */

  /**
   * Clear a specific Highlight graphic
   * @param {string} name     The name for the referenced highlight layer
   */
  clearHighlightLayer(name) {
    const layer = this.highlightLayers[name];
    if ( layer ) layer.clear();
  }

  /* -------------------------------------------- */

  /**
   * Destroy a specific Highlight graphic
   * @param {string} name     The name for the referenced highlight layer
   */
  destroyHighlightLayer(name) {
    const layer = this.highlightLayers[name];
    if ( layer ) {
      this.highlight.removeChild(layer);
      layer.destroy();
    }
  }

  /* -------------------------------------------- */

  /**
   * Obtain the highlight layer graphic by name
   * @param {string} name     The name for the referenced highlight layer
   */
  getHighlightLayer(name) {
    return this.highlightLayers[name];
  }

  /* -------------------------------------------- */

  /**
   * Add highlighting for a specific grid position to a named highlight graphic
   * @param {string} name       The name for the referenced highlight layer
   * @param {object} options    Options for the grid position that should be highlighted
   */
  highlightPosition(name, options) {
    const layer = this.highlightLayers[name];
    if ( !layer ) return false;
    this.grid.highlightGridPosition(layer, options);
  }

  /* -------------------------------------------- */

  /**
   * Test if a specific row and column position is a neighboring location to another row and column coordinate
   * @param {number} r0     The original row position
   * @param {number} c0     The original column position
   * @param {number} r1     The candidate row position
   * @param {number} c1     The candidate column position
   */
  isNeighbor(r0, c0, r1, c1) {
    let neighbors = this.grid.getNeighbors(r0, c0);
    return neighbors.some(n => (n[0] === r1) && (n[1] === c1));
  }
}
