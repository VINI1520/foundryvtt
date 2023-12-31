/**
 * @typedef {Object} GridHexCubeCoordinate
 * @property {number} q     Coordinate along the SW - NE axis
 * @property {number} r     Coordinate along the S - N axis
 * @property {number} s     Coordinate along the NW - SE axis
 */

/**
 * @typedef {Object} GridHexOffsetCoordinate
 * @property {number} row   The row coordinate
 * @property {number} col   The column coordinate
 */

/**
 * A helper class which represents a single hexagon as part of a HexagonalGrid.
 * This class relies on having an active canvas scene in order to know the configuration of the hexagonal grid.
 */
class GridHex {
  /**
   * Construct a GridHex instance by providing a hex coordinate.
   * @param {GridHexOffsetCoordinate|GridHexCubeCoordinate} coordinate The coordinates of the hex to construct
   */
  constructor(coordinate) {
    const g = canvas.grid.grid;

    // Cube coordinate provided
    if ( ["q", "r", "s"].every(k => k in coordinate) ) {
      this.cube = coordinate;
      this.offset = g.cubeToOffset(this.cube);
    }

    // Offset coordinate provided
    else if ( ["row", "col"].every(k => k in coordinate) ) {
      this.offset = coordinate;
      this.cube = g.offsetToCube(this.offset);
    }

    // Invalid input
    else throw new Error("The GridHex constructor must be passed a GridHexCubeCoordinate or a GridHexOffsetCoordinate");
  }

  /**
   * The cube coordinates representation of this Hexagon
   * @type {GridHexCubeCoordinate}
   */
  cube;

  /**
   * The offset coordinates representation of this Hexagon
   * @type {GridHexOffsetCoordinate}
   */
  offset;

  /* -------------------------------------------- */

  /**
   * Return a reference to the pixel point in the center of this hexagon.
   * @type {Point}
   */
  get center() {
    const g = canvas.grid.grid;
    const {x, y} = this.topLeft;
    return {x: x + (g.w / 2), y: y + (g.h / 2)};
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the pixel point of the top-left corner of this hexagon.
   * @type {Point}
   */
  get topLeft() {
    const [x, y] = canvas.grid.grid.getPixelsFromGridPosition(this.offset.row, this.offset.col);
    return new PIXI.Point(x, y);
  }

  /* -------------------------------------------- */

  /**
   * Return the array of hexagons which are neighbors of this one.
   * This result is un-bounded by the confines of the game canvas and may include hexes which are off-canvas.
   * @returns {GridHex[]}
   */
  getNeighbors() {
    const neighbors = [];
    const vectors = [[1, 0, -1], [1, -1, 0], [0, -1, 1], [-1, 0, 1], [-1, 1, 0], [0, 1, -1]];
    for ( const v of vectors ) {
      const n = this.shiftCube(...v);
      if ( n ) neighbors.push(n);
    }
    return neighbors;
  }

  /* -------------------------------------------- */

  /**
   * Get a neighboring hex by shifting along cube coordinates
   * @param {number} dq     A number of hexes to shift along the q axis
   * @param {number} dr     A number of hexes to shift along the r axis
   * @param {number} ds     A number of hexes to shift along the s axis
   * @returns {GridHex}     The shifted hex
   */
  shiftCube(dq, dr, ds) {
    const {q, r, s} = this.cube;
    return new this.constructor({q: q + dq, r: r + dr, s: s + ds});
  }

  /* -------------------------------------------- */

  /**
   * Return whether this GridHex equals the same position as some other GridHex instance.
   * @param {GridHex} other     Some other GridHex
   * @returns {boolean}         Are the positions equal?
   */
  equals(other) {
    return (this.offset.row === other.offset.row) && (this.offset.col === other.offset.col);
  }
}

/* -------------------------------------------- */

/**
 * Construct a hexagonal grid
 * @extends {BaseGrid}
 */
class HexagonalGrid extends BaseGrid {
  constructor(options) {
    super(options);

    /**
     * Is this hex grid column-based (flat-topped), or row-based (pointy-topped)?
     * @type {boolean}
     */
    this.columnar = !!options.columnar;

    /**
     * Is this hex grid even or odd?
     * @type {boolean}
     */
    this.even = !!options.even;

    /**
     * The legacy flag allows scenes created using the old hex measurements to be preserved. Newer hex scenes should
     * never use this flag.
     * @type {boolean}
     * @private
     */
    this._legacy = !!options.legacy;
  }

  /* -------------------------------------------- */

  /**
   * Legacy hex sizing set the 'size' of a hexagon (the distance from a hexagon's centre to a vertex) to be equal to
   * half the grid size. This created some measuring inaccuracies that added up over larger distances.
   * @param {number} s                  The grid size.
   * @param {boolean} columnar          Are the hexagons stacked in columns, or rows?
   * @returns {{w: number, h: number}}  The width and height of a single hexagon, in pixels.
   * @private
   */
  static _computeLegacySizing(s, columnar) {
    if ( columnar ) return { w: s, h: Math.sqrt(3) * 0.5 * s };
    return { w: Math.sqrt(3) * 0.5 * s, h: s };
  }

  /* -------------------------------------------- */

  /**
   * We set the 'size' of a hexagon (the distance from a hexagon's centre to a vertex) to be equal to the grid size
   * divided by √3. This makes the distance from top-to-bottom on a flat-topped hexagon, or left-to-right on a pointy-
   * topped hexagon equal to the grid size.
   * @param {number} s                  The grid size.
   * @param {boolean} columnar          Are the hexagons stacked in columns, or rows?
   * @returns {{w: number, h: number}}  The width and height of a single hexagon, in pixels.
   * @private
   */
  static _computeHexSizing(s, columnar) {
    if ( columnar ) return { w: (2 * s) / Math.sqrt(3), h: s };
    return { w: s, h: (2 * s) / Math.sqrt(3) };
  }

  /* -------------------------------------------- */

  /**
   * Special border polygons for different token sizes.
   * @type {Object<PointArray[]>}
   */
  static POINTY_HEX_BORDERS = {
    0.5: [[0, 0.25], [0.5, 0], [1, 0.25], [1, 0.75], [0.5, 1], [0, 0.75]],
    1: [[0, 0.25], [0.5, 0], [1, 0.25], [1, 0.75], [0.5, 1], [0, 0.75]],
    2: [
      [.5, 0], [.75, 1/7], [.75, 3/7], [1, 4/7], [1, 6/7], [.75, 1], [.5, 6/7], [.25, 1], [0, 6/7], [0, 4/7],
      [.25, 3/7], [.25, 1/7]
    ],
    3: [
      [.5, .1], [2/3, 0], [5/6, .1], [5/6, .3], [1, .4], [1, .6], [5/6, .7], [5/6, .9], [2/3, 1], [.5, .9], [1/3, 1],
      [1/6, .9], [1/6, .7], [0, .6], [0, .4], [1/6, .3], [1/6, .1], [1/3, 0]
    ],
    4: [
      [.5, 0], [5/8, 1/13], [.75, 0], [7/8, 1/13], [7/8, 3/13], [1, 4/13], [1, 6/13], [7/8, 7/13], [7/8, 9/13],
      [.75, 10/13], [.75, 12/13], [5/8, 1], [.5, 12/13], [3/8, 1], [.25, 12/13], [.25, 10/13], [1/8, 9/13],
      [1/8, 7/13], [0, 6/13], [0, 4/13], [1/8, 3/13], [1/8, 1/13], [.25, 0], [3/8, 1/13]
    ]
  };

  /* -------------------------------------------- */

  /**
   * Special border polygons for different token sizes.
   * @type {Object<PointArray[]>}
   */
  static FLAT_HEX_BORDERS = {
    0.5: [[0, 0.5], [0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1]],
    1: [[0, 0.5], [0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1]],
    2: [
      [3/7, .25], [4/7, 0], [6/7, 0], [1, .25], [6/7, .5], [1, .75], [6/7, 1], [4/7, 1], [3/7, .75], [1/7, .75],
      [0, .5], [1/7, .25]
    ],
    3: [
      [.4, 0], [.6, 0], [.7, 1/6], [.9, 1/6], [1, 1/3], [.9, .5], [1, 2/3], [.9, 5/6], [.7, 5/6], [.6, 1], [.4, 1],
      [.3, 5/6], [.1, 5/6], [0, 2/3], [.1, .5], [0, 1/3], [.1, 1/6], [.3, 1/6]
    ],
    4: [
      [6/13, 0], [7/13, 1/8], [9/13, 1/8], [10/13, .25], [12/13, .25], [1, 3/8], [12/13, .5], [1, 5/8], [12/13, .75],
      [10/13, .75], [9/13, 7/8], [7/13, 7/8], [6/13, 1], [4/13, 1], [3/13, 7/8], [1/13, 7/8], [0, .75], [1/13, 5/8],
      [0, .5], [1/13, 3/8], [0, .25], [1/13, 1/8], [3/13, 1/8], [4/13, 0]
    ]
  };

  /* -------------------------------------------- */

  /**
   * A matrix of x and y offsets which is multiplied by the width/height vector to get pointy-top polygon coordinates
   * @type {Array<number[]>}
   */
  static get pointyHexPoints() {
    return this.POINTY_HEX_BORDERS[1];
  }

  /* -------------------------------------------- */

  /**
   * A matrix of x and y offsets which is multiplied by the width/height vector to get flat-top polygon coordinates
   * @type {Array<number[]>}
   */
  static get flatHexPoints() {
    return this.FLAT_HEX_BORDERS[1];
  }

  /* -------------------------------------------- */

  /**
   * Compute hexagonal grid width and height.
   * @param {number} size                     Size of the hex.
   * @param {object} [options]
   * @param {boolean} [options.legacy]        If computation should be done using the legacy method.
   * @protected
   */
  _computeHexGridDimensions(size, {legacy}={}) {
    legacy ??= this._legacy;
    const { w, h } = legacy
      ? this.constructor._computeLegacySizing(size, this.columnar)
      : this.constructor._computeHexSizing(size, this.columnar);
    this.w = w;
    this.h = h;
  }

  /* -------------------------------------------- */

  /**
   * An array of the points which define a hexagon for this grid shape
   * @returns {PointArray[]}
   */
  get hexPoints() {
    return this.columnar ? this.constructor.flatHexPoints : this.constructor.pointyHexPoints;
  }

  /* -------------------------------------------- */
  /*  Grid Rendering
  /* -------------------------------------------- */

  /** @inheritdoc */
  draw(options={}) {
    super.draw(options);
    let {color, alpha, dimensions} = foundry.utils.mergeObject(this.options, options);

    // Set dimensions
    this.width = dimensions.width;
    this.height = dimensions.height;

    // Grid width and height
    this._computeHexGridDimensions(dimensions.size);

    // Need to draw the grid?
    if ( alpha === 0 ) return this;

    // Draw grid polygons
    this.addChild(this._drawGrid({color, alpha}));
    return this;
  }

  /* -------------------------------------------- */

  /**
   * A convenience method for getting all the polygon points relative to a top-left [x,y] coordinate pair
   * @param {number} x               The top-left x-coordinate
   * @param {number} y               The top-right y-coordinate
   * @param {number} [w]             An optional polygon width
   * @param {number} [h]             An optional polygon height
   * @param {PointArray[]} [points]  An optional list of polygon points.
   */
  getPolygon(x, y, w, h, points) {
    w = w ?? this.w;
    h = h ?? this.h;
    points ??= this.hexPoints;
    const poly = [];
    for ( let i=0; i < points.length; i++ ) {
      poly.push(x + (w * points[i][0]), y + (h * points[i][1]));
    }
    return poly;
  }

  /* -------------------------------------------- */

  /**
   * Get a border polygon based on the width and height of a given token.
   * @param {number} w  The width of the token in hexes.
   * @param {number} h  The height of the token in hexes.
   * @param {number} p  The padding size in pixels.
   * @returns {number[]|null}
   */
  getBorderPolygon(w, h, p) {
    const points = this.columnar ? this.constructor.FLAT_HEX_BORDERS[w] : this.constructor.POINTY_HEX_BORDERS[w];
    if ( (w !== h) || !points ) return null;
    const p2 = p / 2;
    const p4 = p / 4;
    ({width: w, height: h} = this.getRect(w, h));
    return this.getPolygon(-p4, -p4, w + p2, h + p2, points);
  }

  /* -------------------------------------------- */

  /**
   * Draw the grid lines.
   * @param {object} [preview]                  Override settings used in place of those saved to the scene data.
   * @param {string|null} [preview.color=null]  The grid color.
   * @param {number|null} [preview.alpha=null]  The grid transparency.
   * @returns {Graphics}
   * @private
   */
  _drawGrid({color=null, alpha=null}={}) {
    color = color ?? this.options.color;
    alpha = alpha ?? this.options.alpha;
    const columnar = this.columnar;
    const ncols = Math.ceil(canvas.dimensions.width / this.w);
    const nrows = Math.ceil(canvas.dimensions.height / this.h);

    // Draw Grid graphic
    const grid = new PIXI.Graphics();
    grid.lineStyle({width: 1, color, alpha});

    // Draw hex rows
    if ( columnar ) this._drawColumns(grid, nrows, ncols);
    else this._drawRows(grid, nrows, ncols);
    return grid;
  }

  /* -------------------------------------------- */

  /**
   * Compute and draw row style hexagons.
   * @param {PIXI.Graphics} grid    Reference to the grid graphics.
   * @param {number} nrows          Number of rows.
   * @param {number} ncols          Number of columns.
   * @protected
   */
  _drawRows(grid, nrows, ncols) {
    let shift = this.even ? 0 : 1;
    nrows /= 0.75;
    for ( let r=0; r<nrows; r++ ) {
      let sx = (r % 2) === shift ? 0 : -0.5;
      let y0 = r * this.h * 0.75;
      for ( let c=0; c<ncols; c++ ) {
        let x0 = (c+sx) * this.w;
        this._drawHexagon(grid, this.getPolygon(x0, y0));
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Compute and draw column style hexagons.
   * @param {PIXI.Graphics} grid    Reference to the grid graphics.
   * @param {number} nrows          Number of rows.
   * @param {number} ncols          Number of columns.
   * @protected
   */
  _drawColumns(grid, nrows, ncols) {
    let shift = this.even ? 0 : 1;
    ncols /= 0.75;
    for ( let c=0; c<ncols; c++ ) {
      let sy = (c % 2) === shift ? 0 : -0.5;
      let x0 = c * this.w * 0.75;
      for ( let r=0; r<nrows; r++ ) {
        let y0 = (r+sy) * this.h;
        this._drawHexagon(grid, this.getPolygon(x0, y0));
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Draw a hexagon from polygon points.
   * @param {PIXI.Graphics} grid    Reference to the grid graphics.
   * @param {number[]} poly         Array of points to draw the hexagon.
   * @protected
   */
  _drawHexagon(grid, poly) {
    grid.moveTo(poly[0], poly[1]);
    for ( let i = 2; i < poly.length; i+=2 ) {
      grid.lineTo(poly[i], poly[i+1]);
    }
    grid.lineTo(poly[0], poly[1]);
  }

  /* -------------------------------------------- */
  /*  Grid Measurement Methods
  /* -------------------------------------------- */

  /** @override */
  getGridPositionFromPixels(x, y) {
    return this._getGridPositionFromPixels(x, y, "floor");
  }

  /* -------------------------------------------- */

  /**
   * Get the position in grid space from a pixel coordinate.
   * @param {number} x        The origin x-coordinate
   * @param {number} y        The origin y-coordinate
   * @param {string} method   The rounding method applied
   * @returns {number[]}      The row, column combination
   * @private
   */
  _getGridPositionFromPixels(x, y, method="floor") {
    let row;
    let col;
    const fn = Math[method];
    if ( this.columnar ) {
      col = fn(x / (this.w*0.75));
      const isEven = (col+1) % 2 === 0;
      row = fn((y / this.h) + (this.options.even === isEven ? 0.5 : 0));
    } else {
      row = fn(y / (this.h*0.75));
      const isEven = (row+1) % 2 === 0;
      col = fn((x / this.w) + (this.options.even === isEven ? 0.5 : 0));
    }
    return [row, col];
  }

  /* -------------------------------------------- */

  /** @override */
  getPixelsFromGridPosition(row, col) {
    let x;
    let y;

    // Flat-topped hexes
    if ( this.columnar ) {
      x = Math.ceil(col * (this.w * 0.75));
      const isEven = (col + 1) % 2 === 0;
      y = Math.ceil((row - (this.options.even === isEven ? 0.5 : 0)) * this.h);
    }

    // Pointy-topped hexes
    else {
      y = Math.ceil(row * (this.h * 0.75));
      const isEven = (row + 1) % 2 === 0;
      x = Math.ceil((col - (this.options.even === isEven ? 0.5 : 0)) * this.w);
    }
    return [x, y];
  }

  /* -------------------------------------------- */

  /** @override */
  getCenter(x, y) {
    let [x0, y0] = this.getTopLeft(x, y);
    return [x0 + (this.w/2), y0 + (this.h/2)];
  }

  /* -------------------------------------------- */

  /** @override */
  getSnappedPosition(x, y, interval=1, {token}={}) {

    // At precision 5, return the center or nearest vertex
    if ( interval === 5) {
      const w4 = this.w / 4;
      const h4 = this.h / 4;

      // Distance relative to center
      let [xc, yc] = this.getCenter(x, y);
      let dx = x - xc;
      let dy = y - yc;
      let ox = dx.between(-w4, w4) ? 0 : Math.sign(dx);
      let oy = dy.between(-h4, h4) ? 0 : Math.sign(dy);

      // Closest to the center
      if ( (ox === 0) && (oy === 0) ) return {x: xc, y: yc};

      // Closest vertex based on offset
      if ( this.columnar && (ox === 0) ) ox = Math.sign(dx) ?? -1;
      if ( !this.columnar && (oy === 0) ) oy = Math.sign(dy) ?? -1;
      return this._getClosestVertex(xc, yc, ox, oy);
    }

    // Start with the closest top-left grid position
    if ( token ) {
      if ( this.columnar && (token.document.height > 1) ) y += this.h / 2;
      if ( !this.columnar && (token.document.width > 1) ) x += this.w / 2;
    }
    let [r0, c0] = this._getGridPositionFromPixels(x, y, "round");
    let [x0, y0] = this.getPixelsFromGridPosition(r0, c0);
    if ( token ) [x0, y0] = this._adjustSnapForTokenSize(x0, y0, token);
    if ( interval === 1 ) return {x: x0, y: y0};

    // Round the remainder
    const dx = (x - x0).toNearest(this.w / interval);
    const dy = (y - y0).toNearest(this.h / interval);
    return {x: x0 + dx, y: y0 + dy};
  }

  /* -------------------------------------------- */

  _getClosestVertex(xc, yc, ox, oy) {
    const b = ox + (oy << 2); // Bit shift to make a unique reference
    const vertices = this.columnar
      ? {"-1": 0, "-5": 1, "-3": 2, 1: 3, 5: 4, 3: 5}   // Flat hex vertices
      : {"-5": 0, "-4": 1, "-3": 2, 5: 3, 4: 4, 3: 5};  // Pointy hex vertices
    const idx = vertices[b];
    const pt = this.hexPoints[idx];
    return {
      x: (xc - (this.w/2)) + (pt[0]*this.w),
      y: (yc - (this.h/2)) + (pt[1]*this.h)
    };
  }

  /* -------------------------------------------- */

  /** @override */
  shiftPosition(x, y, dx, dy, {token}={}) {
    let [row, col] = this.getGridPositionFromPixels(x, y);
    if ( token ) [row, col] = this._adjustPositionForTokenSize(row, col, token);

    // Adjust diagonal moves for offset
    let isDiagonal = (dx !== 0) && (dy !== 0);
    if ( isDiagonal ) {

      // Column orientation
      if ( this.columnar ) {
        let isEven = ((col+1) % 2 === 0) === this.options.even;
        if ( isEven && (dy > 0)) dy--;
        else if ( !isEven && (dy < 0)) dy++;
      }

      // Row orientation
      else {
        let isEven = ((row + 1) % 2 === 0) === this.options.even;
        if ( isEven && (dx > 0) ) dx--;
        else if ( !isEven && (dx < 0 ) ) dx++;
      }
    }
    const [shiftX, shiftY] = this.getPixelsFromGridPosition(row+dy, col+dx);
    if ( token ) return this._adjustSnapForTokenSize(shiftX, shiftY, token);
    return [shiftX, shiftY];
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getRulerDestination(ray, offset, token) {
    // Determine the number of hexes the ruler segment spans.
    const from = this.getGridPositionFromPixels(ray.A.x, ray.A.y);
    const to = this.getGridPositionFromPixels(ray.B.x, ray.B.y);
    let [drow, dcol] = [to[0] - from[0], to[1] - from[1]];

    // Adjust the token's position as though it had been shifted by that amount of hexes.
    let [r, c] = this.getGridPositionFromPixels(token.x, token.y);
    [r, c] = this._adjustPositionForTokenSize(r, c, token);

    // Account for the alternating row/column pattern.
    if ( this.columnar && ((c - from[1]) % 2) && (dcol % 2) ) {
      const shift = this.even ? 1 : -1;
      if ( from[1] % 2 ) drow += shift;
      else drow -= shift;
    }

    if ( !this.columnar && ((r - from[0]) % 2) && (drow % 2) ) {
      const shift = this.even ? 1 : -1;
      if ( from[0] % 2 ) dcol += shift;
      else dcol -= shift;
    }

    let [x, y] = this.getPixelsFromGridPosition(r + drow, c + dcol);
    [x, y] = this._adjustSnapForTokenSize(x, y, token);
    return {x, y};
  }

  /* -------------------------------------------- */

  /**
   * Implement special rules for snapping tokens of various sizes on a hex grid.
   * @param {number} x     The X co-ordinate of the hexagon's top-left bounding box.
   * @param {number} y     The Y co-ordinate of the hexagon's top-left bounding box.
   * @param {Token} token  The token.
   * @returns {[number, number]}
   * @protected
   */
  _adjustSnapForTokenSize(x, y, token) {
    if ( (token.document.width <= 1) && (token.document.height <= 1) ) {
      const [x0, y0] = this.getCenter(x, y);
      return [x0 - (token.w / 2), y0 - (token.h / 2)];
    }

    if ( this.columnar && (token.document.height > 1) ) y -= this.h / 2;
    if ( !this.columnar && (token.document.width > 1) ) x -= this.w / 2;
    return [x, y];
  }

  /* -------------------------------------------- */

  /**
   * Implement special rules for determining the grid position of tokens of various sizes on a hex grid.
   * @param {number} row          The row number.
   * @param {number} col          The column number.
   * @param {Token} token         The token.
   * @returns {[number, number]}  The adjusted row and column number.
   * @protected
   */
  _adjustPositionForTokenSize(row, col, token) {
    if ( this.columnar && (token.document.height > 1) ) row++;
    if ( !this.columnar && (token.document.width > 1) ) col++;
    return [row, col];
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getRect(w, h) {
    if ( !this.columnar || (w < 1) ) w *= this.w;
    else w = (this.w * .75 * (w - 1)) + this.w;
    if ( this.columnar || (h < 1) ) h *= this.h;
    else h = (this.h * .75 * (h - 1)) + this.h;
    return new PIXI.Rectangle(0, 0, w, h);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static calculatePadding(gridType, width, height, size, padding, {legacy}={}) {
    if ( legacy ) return super.calculatePadding(gridType, width, height, size, padding);
    if ( !padding ) return { width, height, x: 0, y: 0 };
    const columnar = [CONST.GRID_TYPES.HEXODDQ, CONST.GRID_TYPES.HEXEVENQ].includes(gridType);
    const { w, h } = this._computeHexSizing(size, columnar);
    // The grid size is equal to the short diagonal of the hexagon, so padding in that axis will divide evenly by the
    // grid size. In the cross-axis, however, the hexagons do not stack but instead interleave. Multiplying the long
    // diagonal by 75% gives us the amount of space each hexagon takes up in that axis without overlapping.
    const x = columnar ? w * .75 : h * .75;
    let offsetX = Math.round((padding * width).toNearest(columnar ? x : w, "ceil"));
    let offsetY = Math.round((padding * height).toNearest(columnar ? h : x, "ceil"));
    // Ensure that the top-left hexagon of the scene rectangle is always a full hexagon for even grids and always a
    // half hexagon for odd grids, by shifting the padding in the main axis by half a hex if the number of hexagons in
    // the cross-axis is odd.
    const crossEven = (Math.round((columnar ? offsetX : offsetY) / x) % 2) === 0;
    if ( !crossEven ) {
      if ( columnar ) offsetY += h * .5;
      else offsetX += w * .5;
    }
    width = (width + (2 * offsetX)).toNearest(columnar ? x : w);
    height = (height + (2 * offsetY)).toNearest(columnar ? h : x);
    if ( columnar ) width += w - x;
    else height += h - x;
    return {
      width, height,
      x: offsetX,
      y: offsetY
    };
  }

  /* -------------------------------------------- */
  /*  Grid Highlighting
  /* -------------------------------------------- */

  /** @override */
  highlightGridPosition(layer, options={}) {
    const {x, y} = options;
    if ( !layer.highlight(x, y) ) return;
    options.shape = new PIXI.Polygon(this.getPolygon(x, y, Math.ceil(this.w), Math.ceil(this.h)));
    return super.highlightGridPosition(layer, options);
  }

  /* -------------------------------------------- */

  /** @override */
  getNeighbors(row, col) {
    const hex = new GridHex({row, col});
    return hex.getNeighbors().map(n => [n.offset.row, n.offset.col]);
  }

  /* -------------------------------------------- */

  /** @override */
  measureDistances(segments, options={}) {
    if ( !options.gridSpaces ) return super.measureDistances(segments, options);
    return segments.map(s => {
      let r = s.ray;
      return this.measureDistance(r.A, r.B) * canvas.dimensions.distance;
    });
  }

  /* -------------------------------------------- */

  /**
   * Measure the distance in grid units between two pixel-based coordinates.
   * @param {Point} p0      The initial point
   * @param {Point} p1      The terminal point
   * @returns {number}      The measured distance in grid units
   */
  measureDistance(p0, p1) {
    const [r0, c0] = this.getGridPositionFromPixels(p0.x, p0.y);
    const [r1, c1] = this.getGridPositionFromPixels(p1.x, p1.y);
    let hex0 = this.offsetToCube({row: r0, col: c0});
    let hex1 = this.offsetToCube({row: r1, col: c1});
    return HexagonalGrid.cubeDistance(hex0, hex1);
  }

  /* -------------------------------------------- */

  /**
   * Compute the shortest path between two hexagons using the A-star algorithm.
   * See https://www.redblobgames.com/pathfinding/a-star/introduction.html for reference
   * @param {GridHex} start     The starting hexagon
   * @param {GridHex} goal      The objective hexagon
   * @returns {{cost: number, path: GridHex[]}} The optimal path of hexagons to traverse
   */
  getAStarPath(start, goal) {
    const costs = new Map();

    // Create a prioritized frontier sorted by increasing cost and heuristic distance
    const frontier = [];
    const {row, col} = goal.offset;
    const explore = (hex, from, cost) => {
      const dr = row - hex.offset.row;
      const dc = col - hex.offset.col;
      const heuristic = Math.pow(dr, 2) + Math.pow(dc, 2);
      const idx = frontier.findIndex(l => (l.cost > cost) && (l.heuristic > heuristic));
      if ( idx === -1 ) frontier.push({hex, cost, heuristic, from});
      else frontier.splice(idx, 0, {hex, cost, heuristic, from});
      costs.set(hex, cost);
    };
    explore(start, null, 0);

    // Expand the frontier, exploring towards the goal
    let current;
    let solution;
    while ( frontier.length ) {
      current = frontier.shift();
      if ( current.hex.equals(goal) ) {
        solution = current;
        if ( current.cost < Infinity ) break;
      }
      for ( const next of current.hex.getNeighbors() ) {
        const deltaCost = next.getTravelCost?.call(next, current.hex) ?? 1;
        const newCost = current.cost + deltaCost;     // Total cost of reaching this hex
        if ( costs.get(next) <= newCost ) continue;   // We already made it here in the lowest-cost way
        explore(next, current, newCost);
      }
    }

    // Ensure a path was achieved
    if ( !solution ) {
      throw new Error("No valid path between these positions exists");
    }

    // Return the optimal path and cost
    const path = [];
    let c = solution;
    while ( c.from ) {
      path.unshift(c.hex);
      c = c.from;
    }
    return {from: start, to: goal, cost: current.cost, path};
  }

  /* -------------------------------------------- */
  /*  Conversion Functions                        */
  /* -------------------------------------------- */

  /**
   * Convert an offset coordinate (row, col) into a cube coordinate (q, r, s).
   * See https://www.redblobgames.com/grids/hexagons/ for reference
   * Source code available https://www.redblobgames.com/grids/hexagons/codegen/output/lib-functions.js
   * @param {GridHexOffsetCoordinate} offset    The offset coordinate
   * @returns {GridHexCubeCoordinate}           The cube coordinate
   */
  offsetToCube({row, col}={}) {
    const offset = this.options.even ? 1 : -1;

    // Column orientation
    if ( this.columnar ) {
      const q = col;
      const r = row - ((col + (offset * (col & 1))) / 2);
      return {q, r, s: 0 - q - r};
    }

    // Row orientation
    else {
      const q = col - ((row + (offset * (row & 1))) / 2);
      const r = row;
      return {q, r, s: 0 - q - r};
    }
  }

  /* -------------------------------------------- */

  /**
   * Convert a cube coordinate (q, r, s) into an offset coordinate (row, col).
   * See https://www.redblobgames.com/grids/hexagons/ for reference
   * Source code available https://www.redblobgames.com/grids/hexagons/codegen/output/lib-functions.js
   * @param {GridHexCubeCoordinate} cube    The cube coordinate
   * @returns {GridHexOffsetCoordinate}     The offset coordinate
   */
  cubeToOffset({q, r, s}={}) {
    const offset = this.options.even ? 1 : -1;

    // Column orientation
    if ( this.columnar ) {
      const col = q;
      const row = r + ((q + (offset * (q & 1))) / 2);
      return {row, col};
    }

    // Row orientation
    else {
      const row = r;
      const col = q + ((r + (offset * (r & 1))) / 2);
      return {row, col};
    }
  }

  /* -------------------------------------------- */

  /**
   * Given a cursor position (x, y), obtain the cube coordinate hex (q, r, s) of the hex which contains it
   * http://justinpombrio.net/programming/2020/04/28/pixel-to-hex.html
   * @param {Point} point                 The pixel point
   * @returns {GridHexCubeCoordinate}     The cube coordinate
   */
  static pixelToCube({x, y}={}) {
    const size = canvas.dimensions.size / 2;
    const cx = x / size;
    const cy = y / size;

    // Fractional hex coordinates, might not satisfy (fx + fy + fz = 0) due to rounding
    const fr = (2/3) * cx;
    const fq = ((-1/3) * cx) + ((1 / Math.sqrt(3)) * cy);
    const fs = ((-1/3) * cx) - ((1 / Math.sqrt(3)) * cy);

    // Convert to integer triangle coordinates
    const a = Math.ceil(fr - fq);
    const b = Math.ceil(fq - fs);
    const c = Math.ceil(fs - fr);

    // Convert back to cube coordinates
    return {
      q: Math.round((a - c) / 3),
      r: Math.round((c - b) / 3),
      s: Math.round((b - a) / 3)
    };
  }

  /* -------------------------------------------- */

  /**
   * Measure the distance in hexagons between two cube coordinates.
   * @param {GridHexCubeCoordinate} a     The first cube coordinate
   * @param {GridHexCubeCoordinate} b     The second cube coordinate
   * @returns {number}                    The distance between the two cube coordinates in hexagons
   */
  static cubeDistance(a, b) {
    let diff = {q: a.q - b.q, r: a.r - b.r, s: a.s - b.s};
    return (Math.abs(diff.q) + Math.abs(diff.r) + Math.abs(diff.s)) / 2;
  }
}
