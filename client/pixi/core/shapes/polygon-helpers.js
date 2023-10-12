/**
 * An internal data structure for polygon vertices
 * @private
 * @ignore
 */
class PolygonVertex {
  constructor(x, y, {distance, index}={}) {
    this.x = Math.round(x);
    this.y = Math.round(y);
    this.key = PolygonVertex.#getSortKey(this.x, this.y);
    this._distance = distance;
    this._d2 = undefined;
    this._index = index;

    /**
     * The set of edges which connect to this vertex.
     * This set is initially empty and populated later after vertices are de-duplicated.
     * @type {EdgeSet}
     */
    this.edges = new Set();

    /**
     * The subset of edges which continue clockwise from this vertex.
     * @type {EdgeSet}
     */
    this.cwEdges = new Set();

    /**
     * The subset of edges which continue counter-clockwise from this vertex.
     * @type {EdgeSet}
     */
    this.ccwEdges = new Set();

    /**
     * The set of vertices collinear to this vertex
     * @type {Set<PolygonVertex>}
     */
    this.collinearVertices = new Set();

    /**
     * The maximum restriction type of this vertex
     * @type {number|null}
     */
    this.type = null;
  }

  /**
   * The effective maximum texture size that Foundry VTT "ever" has to worry about.
   * @type {number}
   */
  static #MAX_TEXTURE_SIZE = Math.pow(2, 16);

  /**
   * Determine the sort key to use for this vertex, arranging points from north-west to south-east.
   * @param {number} x    The x-coordinate
   * @param {number} y    The y-coordinate
   */
  static #getSortKey(x, y) {
    return (this.#MAX_TEXTURE_SIZE * x) + y;
  }

  /**
   * Is this vertex an endpoint of one or more edges?
   * @type {boolean}
   */
  isEndpoint;

  /**
   * Does this vertex have a single counterclockwise limiting edge?
   * @type {boolean}
   */
  isLimitingCCW;

  /**
   * Does this vertex have a single clockwise limiting edge?
   * @type {boolean}
   */
  isLimitingCW;

  /**
   * Does this vertex have non-limited edges or 2+ limited edges counterclockwise?
   * @type {boolean}
   */
  isBlockingCCW;

  /**
   * Does this vertex have non-limited edges or 2+ limited edges clockwise?
   * @type {boolean}
   */
  isBlockingCW;

  /**
   * Associate an edge with this vertex.
   * @param {PolygonEdge} edge      The edge being attached
   * @param {number} orientation    The orientation of the edge with respect to the origin
   */
  attachEdge(edge, orientation=0) {
    this.edges.add(edge);
    this.type = Math.max(this.type ?? 0, edge.type);
    if ( orientation <= 0 ) this.cwEdges.add(edge);
    if ( orientation >= 0 ) this.ccwEdges.add(edge);
    this.#updateFlags();
  }

  /**
   * Is this vertex limited in type?
   * @returns {boolean}
   */
  get isLimited() {
    return this.type === CONST.WALL_SENSE_TYPES.LIMITED;
  }

  /**
   * Is this vertex terminal (at the maximum radius)
   * @returns {boolean}
   */
  get isTerminal() {
    return this._distance === 1;
  }

  /**
   * Update flags for whether this vertex is limiting or blocking in certain direction.
   */
  #updateFlags() {
    const classify = edges => {
      const s = edges.size;
      if ( s === 0 ) return {isLimiting: false, isBlocking: false};
      if ( s > 1 ) return {isLimiting: false, isBlocking: true};
      else {
        const isLimiting = edges.first().isLimited;
        return {isLimiting, isBlocking: !isLimiting};
      }
    };

    // Flag endpoint
    this.isEndpoint = this.edges.some(edge => edge.A.equals(this) || edge.B.equals(this));

    // Flag CCW edges
    const ccwFlags = classify(this.ccwEdges);
    this.isLimitingCCW = ccwFlags.isLimiting;
    this.isBlockingCCW = ccwFlags.isBlocking;

    // Flag CW edges
    const cwFlags = classify(this.cwEdges);
    this.isLimitingCW = cwFlags.isLimiting;
    this.isBlockingCW = cwFlags.isBlocking;
  }

  /**
   * Is this vertex the same point as some other vertex?
   * @param {PolygonVertex} other   Some other vertex
   * @returns {boolean}             Are they the same point?
   */
  equals(other) {
    return this.key === other.key;
  }

  /**
   * Construct a PolygonVertex instance from some other Point structure.
   * @param {Point} point           The point
   * @param {object} [options]      Additional options that apply to this vertex
   * @returns {PolygonVertex}       The constructed vertex
   */
  static fromPoint(point, options) {
    return new this(point.x, point.y, options);
  }
}

/* -------------------------------------------- */

/**
 * An internal data structure for polygon edges
 * @private
 * @ignore
 */
class PolygonEdge {
  constructor(a, b, type=CONST.WALL_SENSE_TYPES.NORMAL, wall) {
    this.A = new PolygonVertex(a.x, a.y);
    this.B = new PolygonVertex(b.x, b.y);
    this.type = type;
    this.wall = wall;
  }

  /**
   * An internal flag used to record whether an Edge represents a canvas boundary.
   * @type {boolean}
   * @internal
   */
  _isBoundary = false;

  /**
   * Is this edge limited in type?
   * @returns {boolean}
   */
  get isLimited() {
    return this.type === CONST.WALL_SENSE_TYPES.LIMITED;
  }

  /**
   * Construct a PolygonEdge instance from a Wall placeable object.
   * @param {Wall|WallDocument} wall  The Wall from which to construct an edge
   * @param {string} type             The type of polygon being constructed
   * @returns {PolygonEdge}
   */
  static fromWall(wall, type) {
    const c = wall.document.c;
    return new this({x: c[0], y: c[1]}, {x: c[2], y: c[3]}, wall.document[type], wall);
  }
}

/* -------------------------------------------- */

/**
 * An object containing the result of a collision test.
 * @private
 * @ignore
 */
class CollisionResult {
  constructor({target=null, collisions=[], cwEdges, ccwEdges, isBehind, isLimited, wasLimited}={}) {

    /**
     * The vertex that was the target of this result
     * @type {PolygonVertex}
     */
    this.target = target;

    /**
     * The array of collision points which apply to this result
     * @type {PolygonVertex[]}
     */
    this.collisions = collisions;

    /**
     * The set of edges connected to the target vertex that continue clockwise
     * @type {EdgeSet}
     */
    this.cwEdges = cwEdges || new Set();

    /**
     * The set of edges connected to the target vertex that continue counter-clockwise
     * @type {EdgeSet}
     */
    this.ccwEdges = ccwEdges || new Set();

    /**
     * Is the target vertex for this result behind some closer active edge?
     * @type {boolean}
     */
    this.isBehind = isBehind;

    /**
     * Does the target vertex for this result impose a limited collision?
     * @type {boolean}
     */
    this.isLimited = isLimited;

    /**
     * Has the set of collisions for this result encountered a limited edge?
     * @type {boolean}
     */
    this.wasLimited = wasLimited;
  }

  /**
   * Is this result limited in the clockwise direction?
   * @type {boolean}
   */
  limitedCW = false;

  /**
   * Is this result limited in the counter-clockwise direction?
   * @type {boolean}
   */
  limitedCCW = false;

  /**
   * Is this result blocking in the clockwise direction?
   * @type {boolean}
   */
  blockedCW = false;

  /**
   * Is this result blocking in the counter-clockwise direction?
   * @type {boolean}
   */
  blockedCCW = false;

  /**
   * Previously blocking in the clockwise direction?
   * @type {boolean}
   */
  blockedCWPrev = false;

  /**
   * Previously blocking in the counter-clockwise direction?
   */
  blockedCCWPrev = false;
}
