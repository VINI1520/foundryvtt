/**
 * Construct a square grid container
 * @type {BaseGrid}
 */
class SquareGrid extends BaseGrid {

  /** @inheritdoc */
  draw(options={}) {
    super.draw(options);
    let {color, alpha, dimensions} = foundry.utils.mergeObject(this.options, options);

    // Set dimensions
    this.width = dimensions.width;
    this.height = dimensions.height;

    // Need to draw?
    if ( alpha === 0 ) return this;

    // Vertical lines
    let nx = Math.floor(dimensions.width / dimensions.size);
    const grid = new PIXI.Graphics();
    for ( let i = 1; i < nx; i++ ) {
      let x = i * dimensions.size;
      this.#drawLine(grid, [x, 0, x, dimensions.height], color, alpha);
    }

    // Horizontal lines
    let ny = Math.ceil(dimensions.height / dimensions.size);
    for ( let i = 1; i < ny; i++ ) {
      let y = i * dimensions.size;
      this.#drawLine(grid, [0, y, dimensions.width, y], color, alpha);
    }
    this.addChild(grid);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Draw a line on the square grid.
   * @param {PIXI.Graphics} grid      The grid on which to draw the line.
   * @param {number[]} points         A pair of points coordinates.
   * @param {number} lineColor        The line color.
   * @param {number} lineAlpha        The line alpha.
   */
  #drawLine(grid, points, lineColor, lineAlpha) {
    grid.lineStyle(1, lineColor, lineAlpha).moveTo(points[0], points[1]).lineTo(points[2], points[3]);
  }

  /* -------------------------------------------- */
  /*  Grid Measurement Methods
  /* -------------------------------------------- */

  /** @override */
  getCenter(x, y) {
    const gs = canvas.dimensions.size;
    return this.getTopLeft(x, y).map(c => c + (gs / 2));
  }

  /* -------------------------------------------- */

  /** @override */
  getGridPositionFromPixels(x, y) {
    let gs = canvas.dimensions.size;
    return [Math.floor(y / gs), Math.floor(x / gs)];
  }

  /* -------------------------------------------- */

  /** @override */
  getPixelsFromGridPosition(row, col) {
    let gs = canvas.dimensions.size;
    return [col*gs, row*gs];
  }

  /* -------------------------------------------- */

  /** @override */
  getSnappedPosition(x, y, interval=1, options={}) {
    let [x0, y0] = this._getNearestVertex(x, y);
    let dx = 0;
    let dy = 0;
    if ( interval !== 1 ) {
      let delta = canvas.dimensions.size / interval;
      dx = Math.round((x - x0) / delta) * delta;
      dy = Math.round((y - y0) / delta) * delta;
    }
    return {
      x: x0 + dx,
      y: y0 + dy
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  shiftPosition(x, y, dx, dy, options={}) {
    let [row, col] = canvas.grid.grid.getGridPositionFromPixels(x, y);
    return canvas.grid.grid.getPixelsFromGridPosition(row+dy, col+dx);
  }

  /* -------------------------------------------- */

  _getNearestVertex(x, y) {
    const gs = canvas.dimensions.size;
    return [Math.round(x / gs) * gs, Math.round(y / gs) * gs];
  }

  /* -------------------------------------------- */

  /** @override */
  highlightGridPosition(layer, options={}) {
    const {x, y} = options;
    if ( !layer.highlight(x, y) ) return;
    let s = canvas.dimensions.size;
    options.shape = new PIXI.Rectangle(x, y, s, s);
    return super.highlightGridPosition(layer, options);
  }

  /* -------------------------------------------- */

  /** @override */
  measureDistances(segments, options={}) {
    if ( !options.gridSpaces ) return super.measureDistances(segments, options);
    const d = canvas.dimensions;
    return segments.map(s => {
      let r = s.ray;
      let nx = Math.abs(Math.ceil(r.dx / d.size));
      let ny = Math.abs(Math.ceil(r.dy / d.size));

      // Determine the number of straight and diagonal moves
      let nd = Math.min(nx, ny);
      let ns = Math.abs(ny - nx);

      // Linear distance for all moves
      return (nd + ns) * d.distance;
    });
  }

  /* -------------------------------------------- */

  /** @override */
  getNeighbors(row, col) {
    let offsets = [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]];
    return offsets.map(o => [row+o[0], col+o[1]]);
  }
}
