/**
 * @typedef {Object} PointSourcePolygonConfig
 * @property {string} [type]        The type of polygon being computed
 * @property {number} [angle=360]   The angle of emission, if limited
 * @property {number} [density]     The desired density of padding rays, a number per PI
 * @property {number} [radius]      A limited radius of the resulting polygon
 * @property {number} [rotation]    The direction of facing, required if the angle is limited
 * @property {boolean} [debug]      Display debugging visualization and logging for the polygon
 * @property {boolean} [walls]      Is this polygon constrained by any walls?
 * @property {PointSource} [source] The object (if any) that spawned this polygon.
 * @property {Array<PIXI.Rectangle|PIXI.Circle|PIXI.Polygon>} [boundaryShapes] Limiting polygon boundary shapes
 */

/**
 * An extension of the default PIXI.Polygon which is used to represent the line of sight for a point source.
 * @extends {PIXI.Polygon}
 */
class PointSourcePolygon extends PIXI.Polygon {

  /**
   * The rectangular bounds of this polygon
   * @type {PIXI.Rectangle}
   */
  bounds;

  /**
   * The origin point of the source polygon.
   * @type {Point}
   */
  origin;

  /**
   * The configuration of this polygon.
   * @type {PointSourcePolygonConfig}
   */
  config = {};

  /**
   * A cached array of SightRay objects used to compute the polygon.
   * @type {PolygonRay[]}
   */
  rays = [];

  /* -------------------------------------------- */

  /**
   * An indicator for whether this polygon is constrained by some boundary shape?
   * @type {boolean}
   */
  get isConstrained() {
    return this.config.boundaryShapes.length > 0;
  }

  /* -------------------------------------------- */

  /**
   * Benchmark the performance of polygon computation for this source
   * @param {number} iterations                 The number of test iterations to perform
   * @param {Point} origin                      The origin point to benchmark
   * @param {PointSourcePolygonConfig} config   The polygon configuration to benchmark
   */
  static benchmark(iterations, origin, config) {
    const f = () => this.create(foundry.utils.deepClone(origin), foundry.utils.deepClone(config));
    Object.defineProperty(f, "name", {value: `${this.name}.construct`, configurable: true});
    return foundry.utils.benchmark(f, iterations);
  }

  /* -------------------------------------------- */

  /**
   * Compute the polygon given a point origin and radius
   * @param {Point} origin                          The origin source point
   * @param {PointSourcePolygonConfig} [config={}]  Configuration options which customize the polygon computation
   * @returns {PointSourcePolygon}                  The computed polygon instance
   */
  static create(origin, config={}) {
    const poly = new this();
    poly.initialize(origin, config);
    return poly.compute();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  contains(x, y) {
    return this.bounds.contains(x, y) && super.contains(x, y);
  }

  /* -------------------------------------------- */
  /*  Polygon Computation                         */
  /* -------------------------------------------- */

  /**
   * Compute the polygon using the origin and configuration options.
   * @returns {PointSourcePolygon}    The computed polygon
   */
  compute() {
    let t0 = performance.now();
    const {angle, debug, radius} = this.config;

    // Skip zero-angle or zero-radius polygons
    if ( (radius === 0) || (angle === 0) ) {
      this.points.length = 0;
      this.bounds = new PIXI.Rectangle(0, 0, 0, 0);
      return this;
    }

    // Delegate computation to the implementation
    this._compute();

    // Cache the new polygon bounds
    this.bounds = this.getBounds();

    // Debugging and performance metrics
    if ( debug ) {
      let t1 = performance.now();
      console.log(`Created ${this.constructor.name} in ${Math.round(t1 - t0)}ms`);
      this.visualize();
    }
    return this;
  }

  /**
   * Perform the implementation-specific computation
   * @protected
   */
  _compute() {
    throw new Error("Each subclass of PointSourcePolygon must define its own _compute method");
  }

  /* -------------------------------------------- */

  /**
   * Customize the provided configuration object for this polygon type.
   * @param {Point} origin                        The provided polygon origin
   * @param {PointSourcePolygonConfig} config     The provided configuration object
   */
  initialize(origin, config) {
    this.origin = origin;
    this.config = config;
    if ( CONFIG.debug.polygons ) this.config.debug = true;
  }

  /* -------------------------------------------- */

  /**
   * Apply a constraining boundary shape to an existing PointSourcePolygon.
   * Return a new instance of the polygon with the constraint applied.
   * The new instance is only a "shallow clone", as it shares references to component properties with the original.
   * @param {PIXI.Circle|PIXI.Rectangle|PIXI.Polygon} constraint      The constraining boundary shape
   * @param {object} [intersectionOptions]                            Options passed to the shape intersection method
   * @returns {PointSourcePolygon}                                    A new constrained polygon
   */
  applyConstraint(constraint, intersectionOptions={}) {

    // Shallow-clone the polygon
    let poly = new this.constructor(Array.from(this.points));
    poly.config = foundry.utils.deepClone(this.config);
    for ( const attr of ["origin", "edges", "rays", "vertices"] ) {
      poly[attr] = this[attr];
    }
    poly.config.boundaryShapes.push(constraint);
    if ( "density" in intersectionOptions ) poly.config.density = intersectionOptions.density;

    // Apply constraint
    const c = constraint.intersectPolygon(poly, intersectionOptions);
    poly.points = c.points;

    // Re-compute bounds and return
    poly.bounds = poly.getBounds();
    return poly;
  }

  /* -------------------------------------------- */
  /*  Collision Testing                           */
  /* -------------------------------------------- */

  /**
   * Test whether a Ray between the origin and destination points would collide with a boundary of this Polygon.
   * A valid wall restriction type is compulsory and must be passed into the config options.
   * @param {Point} origin                          An origin point
   * @param {Point} destination                     A destination point
   * @param {PointSourcePolygonConfig} config       The configuration that defines a certain Polygon type
   * @param {string} [config.mode]                  The collision mode to test: "any", "all", or "closest"
   * @returns {boolean|PolygonVertex|PolygonVertex[]|null} The collision result depends on the mode of the test:
   *                                                * any: returns a boolean for whether any collision occurred
   *                                                * all: returns a sorted array of PolygonVertex instances
   *                                                * closest: returns a PolygonVertex instance or null
   */
  static testCollision(origin, destination, {mode="all", ...config}={}) {
    if ( !CONST.WALL_RESTRICTION_TYPES.includes(config.type) ) {
      throw new Error("A valid wall restriction type is required for testCollision.");
    }
    const poly = new this();
    const ray = new Ray(origin, destination);
    config.boundaryShapes ||= [];
    config.boundaryShapes.push(ray.bounds);
    poly.initialize(origin, config);
    return poly._testCollision(ray, mode);
  }

  /* -------------------------------------------- */

  /**
   * Determine the set of collisions which occurs for a Ray.
   * @param {Ray} ray                           The Ray to test
   * @param {string} mode                       The collision mode being tested
   * @returns {boolean|PolygonVertex|PolygonVertex[]|null} The collision test result
   * @protected
   * @abstract
   */
  _testCollision(ray, mode) {
    throw new Error(`The ${this.constructor.name} class must implement the _testCollision method`);
  }

  /* -------------------------------------------- */
  /*  Visualization and Debugging                 */
  /* -------------------------------------------- */

  /**
   * Visualize the polygon, displaying its computed area, rays, and collision points
   */
  visualize() {
    if ( !this.points.length ) return;
    let dg = canvas.controls.debug;
    dg.clear();

    // Draw boundary shapes
    for ( const constraint of this.config.boundaryShapes ) {
      dg.lineStyle(2, 0xFFFFFF, 1.0).beginFill(0xAAFF00).drawShape(constraint).endFill();
    }

    // Draw the resulting polygons
    dg.lineStyle(2, 0xFFFFFF, 1.0).beginFill(0xFFAA99, 0.25).drawShape(this).endFill();

    // Draw the rays
    dg.lineStyle(1, 0x00FF00, 1.0);
    for ( let r of this.rays ) {
      if ( !r.collisions.length ) continue;
      if ( !r.endpoint ) dg.lineStyle(1, 0x00AAFF, 1.0).moveTo(r.A.x, r.A.y).lineTo(r.B.x, r.B.y);
      else dg.lineStyle(1, 0x00FF00, 1.0).moveTo(r.A.x, r.A.y).lineTo(r.B.x, r.B.y);
    }

    // Draw target endpoints
    dg.lineStyle(1, 0x00FFFF, 1.0).beginFill(0x00FFFF, 0.5);
    for ( let r of this.rays ) {
      if ( r.endpoint ) dg.drawCircle(r.endpoint.x, r.endpoint.y, 4);
    }
    dg.endFill();

    // Draw collision points
    dg.lineStyle(1, 0xFF0000, 1.0);
    for ( let r of this.rays ) {
      for ( let [i, c] of r.collisions.entries() ) {
        if ( i === r.collisions.length-1 ) dg.beginFill(0xFF0000, 1.0).drawCircle(c.x, c.y, 3);
        else dg.endFill().drawCircle(c.x, c.y, 3);
      }
    }
    dg.endFill();
  }
}
