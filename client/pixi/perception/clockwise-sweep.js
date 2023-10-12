/**
 * @typedef {Map<number,PolygonVertex>} VertexMap
 */

/**
 * @typedef {Set<PolygonEdge>} EdgeSet
 */

/**
 * @typedef {Ray} PolygonRay
 * @property {CollisionResult} result
 */

/**
 * A PointSourcePolygon implementation that uses CCW (counter-clockwise) geometry orientation.
 * Sweep around the origin, accumulating collision points based on the set of active walls.
 * This algorithm was created with valuable contributions from https://github.com/caewok
 *
 * @extends PointSourcePolygon
 */
class ClockwiseSweepPolygon extends PointSourcePolygon {

  /**
   * A mapping of vertices which define potential collision points
   * @type {VertexMap}
   */
  vertices = new Map();

  /**
   * The set of edges which define potential boundaries of the polygon
   * @type {EdgeSet}
   */
  edges = new Set();

  /**
   * A collection of rays which are fired at vertices
   * @type {PolygonRay[]}
   */
  rays = [];

  /**
   * The squared maximum distance of a ray that is needed for this Scene.
   * @type {number}
   */
  #rayDistance2;

  /* -------------------------------------------- */
  /*  Initialization                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  initialize(origin, config) {
    super.initialize(origin, config);
    this.#rayDistance2 = Math.pow(canvas.dimensions.maxR, 2);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  clone() {
    const poly = super.clone();
    for ( const attr of ["vertices", "edges", "rays", "#rayDistance2"] ) { // Shallow clone only
      poly[attr] = this[attr];
    }
    return poly;
  }

  /* -------------------------------------------- */
  /*  Computation                                 */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _compute() {

    // Clear prior data
    this.points = [];
    this.rays = [];
    this.vertices.clear();
    this.edges.clear();

    // Step 1 - Identify candidate edges
    this._identifyEdges();

    // Step 2 - Construct vertex mapping
    this._identifyVertices();

    // Step 3 - Radial sweep over endpoints
    this._executeSweep();

    // Step 4 - Constrain with boundary shapes
    this._constrainBoundaryShapes();
  }

  /* -------------------------------------------- */
  /*  Edge Configuration                          */
  /* -------------------------------------------- */

  /**
   * Translate walls and other obstacles into edges which limit visibility
   * @private
   */
  _identifyEdges() {

    // Add edges for placed Wall objects
    const walls = this._getWalls();
    for ( let wall of walls ) {
      const edge = PolygonEdge.fromWall(wall, this.config.type);
      this.edges.add(edge);
    }

    // Add edges for the canvas boundaries
    const boundaries = this.config.useInnerBounds ? canvas.walls.innerBounds : canvas.walls.outerBounds;
    for ( let boundary of boundaries ) {
      const edge = PolygonEdge.fromWall(boundary, this.config.type);
      edge._isBoundary = true;
      this.edges.add(edge);
    }
  }

  /* -------------------------------------------- */
  /*  Vertex Identification                       */
  /* -------------------------------------------- */

  /**
   * Consolidate all vertices from identified edges and register them as part of the vertex mapping.
   * @private
   */
  _identifyVertices() {
    const wallEdgeMap = new Map();

    // Register vertices for all edges
    for ( let edge of this.edges ) {

      // Get unique vertices A and B
      const ak = edge.A.key;
      if ( this.vertices.has(ak) ) edge.A = this.vertices.get(ak);
      else this.vertices.set(ak, edge.A);
      const bk = edge.B.key;
      if ( this.vertices.has(bk) ) edge.B = this.vertices.get(bk);
      else this.vertices.set(bk, edge.B);

      // Learn edge orientation with respect to the origin
      const o = foundry.utils.orient2dFast(this.origin, edge.A, edge.B);

      // Ensure B is clockwise of A
      if ( o > 0 ) {
        let a = edge.A;
        edge.A = edge.B;
        edge.B = a;
      }

      // Attach edges to each vertex
      edge.A.attachEdge(edge, -1);
      edge.B.attachEdge(edge, 1);

      // Record the wall->edge mapping
      if ( edge.wall ) wallEdgeMap.set(edge.wall.id, edge);
    }

    // Add edge intersections
    this._identifyIntersections(wallEdgeMap);
  }

  /* -------------------------------------------- */

  /**
   * Add additional vertices for intersections between edges.
   * @param {Map<string,PolygonEdge>} wallEdgeMap    A mapping of wall IDs to PolygonEdge instances
   * @private
   */
  _identifyIntersections(wallEdgeMap) {
    const processed = new Set();
    for ( let edge of this.edges ) {

      // If the edge has no intersections, skip it
      if ( !edge.wall?.intersectsWith.size ) continue;

      // Check each intersecting wall
      for ( let [wall, i] of edge.wall.intersectsWith.entries() ) {

        // Some other walls may not be included in this polygon
        const other = wallEdgeMap.get(wall.id);
        if ( !other || processed.has(other) ) continue;

        // Register the intersection point as a vertex
        let v = PolygonVertex.fromPoint(i);
        v._intersectionCoordinates = i;
        if ( this.vertices.has(v.key) ) v = this.vertices.get(v.key);
        else this.vertices.set(v.key, v);

        // Attach edges to the intersection vertex
        // Due to rounding, it is possible for an edge to be completely cw or ccw or only one of the two
        // We know from _identifyVertices that vertex B is clockwise of vertex A for every edge
        if ( !v.edges.has(edge) ) {
          const dir = foundry.utils.orient2dFast(this.origin, edge.B, v) < 0 ? 1    // Edge is fully CCW of v
            : (foundry.utils.orient2dFast(this.origin, edge.A, v) > 0 ? -1 : 0);    // Edge is fully CW of v
          v.attachEdge(edge, dir);
        }
        if ( !v.edges.has(other) ) {
          const dir = foundry.utils.orient2dFast(this.origin, other.B, v) < 0 ? 1   // Other is fully CCW of v
            : (foundry.utils.orient2dFast(this.origin, other.A, v) > 0 ? -1 : 0);   // Other is fully CW of v
          v.attachEdge(other, dir);
        }
      }
      processed.add(edge);
    }
  }

  /* -------------------------------------------- */
  /*  Radial Sweep                                */
  /* -------------------------------------------- */

  /**
   * Execute the sweep over wall vertices
   * @private
   */
  _executeSweep() {

    // Initialize the set of active walls
    let activeEdges = this._initializeActiveEdges();

    // Sort vertices from clockwise to counter-clockwise and begin the sweep
    const vertices = this._sortVertices();

    // Iterate through the vertices, adding polygon points
    const ln = vertices.length;
    for ( let i=0; i<ln; i++ ) {
      const vertex = vertices[i];
      vertex._index = i+1;
      const hasCollinear = vertex.collinearVertices.size > 0;

      this._updateActiveEdges(vertex, activeEdges);
      this.#includeCollinearVertices(vertex, vertex.collinearVertices);

      // Look ahead and add any cw walls for vertices collinear with this one
      for ( const cv of vertex.collinearVertices ) this._updateActiveEdges(cv, activeEdges);
      i += vertex.collinearVertices.size; // Skip processing collinear vertices next loop iteration

      // Determine the result of the sweep for the given vertex
      this._determineSweepResult(vertex, activeEdges, hasCollinear);
    }
  }

  /**
   * Include collinear vertices until they have all been added.
   * Do not include the original vertex in the set.
   * @param {PolygonVertex} vertex  The current vertex
   * @param {PolygonVertexSet} collinearVertices
   */
  #includeCollinearVertices(vertex, collinearVertices) {
    for ( const cv of collinearVertices) {
      for ( const ccv of cv.collinearVertices ) {
        collinearVertices.add(ccv);
      }
    }
    collinearVertices.delete(vertex);
  }

  /* -------------------------------------------- */

  /**
   * Update active edges at a given vertex
   * Must delete first, in case the edge is in both sets.
   * @param {PolygonVertex} vertex   The current vertex
   * @param {EdgeSet} activeEdges    A set of currently active edges
   * @private
   */
  _updateActiveEdges(vertex, activeEdges) {
    for ( const ccw of vertex.ccwEdges ) activeEdges.delete(ccw);
    for ( const cw of vertex.cwEdges ) activeEdges.add(cw);
  }

  /* -------------------------------------------- */

  /**
   * Determine the initial set of active edges as those which intersect with the initial ray
   * @returns {EdgeSet}             A set of initially active edges
   * @private
   */
  _initializeActiveEdges() {
    const initial = {x: Math.round(this.origin.x - this.#rayDistance2), y: this.origin.y};
    const edges = new Set();
    for ( let edge of this.edges ) {
      const x = foundry.utils.lineSegmentIntersects(this.origin, initial, edge.A, edge.B);
      if ( x ) edges.add(edge);
    }
    return edges;
  }

  /* -------------------------------------------- */

  /**
   * Sort vertices clockwise from the initial ray (due west).
   * @returns {PolygonVertex[]}             The array of sorted vertices
   * @private
   */
  _sortVertices() {
    if ( !this.vertices.size ) return [];
    let vertices = Array.from(this.vertices.values());
    const o = this.origin;

    // Sort vertices
    vertices.sort((a, b) => {

      // Use true intersection coordinates if they are defined
      let pA = a._intersectionCoordinates || a;
      let pB = b._intersectionCoordinates || b;

      // Sort by hemisphere
      const ya = pA.y > o.y ? 1 : -1;
      const yb = pB.y > o.y ? 1 : -1;
      if ( ya !== yb ) return ya;       // Sort N, S

      // Sort by quadrant
      const qa = pA.x < o.x ? -1 : 1;
      const qb = pB.x < o.x ? -1 : 1;
      if ( qa !== qb ) {                // Sort NW, NE, SE, SW
        if ( ya === -1 ) return qa;
        else return -qa;
      }

      // Sort clockwise within quadrant
      const orientation = foundry.utils.orient2dFast(o, pA, pB);
      if ( orientation !== 0 ) return orientation;

      // At this point, we know points are collinear; track for later processing.
      a.collinearVertices.add(b);
      b.collinearVertices.add(a);

      // Otherwise, sort closer points first
      a._d2 ||= Math.pow(pA.x - o.x, 2) + Math.pow(pA.y - o.y, 2);
      b._d2 ||= Math.pow(pB.x - o.x, 2) + Math.pow(pB.y - o.y, 2);
      return a._d2 - b._d2;
    });
    return vertices;
  }

  /* -------------------------------------------- */

  /**
   * Test whether a target vertex is behind some closer active edge.
   * If the vertex is to the left of the edge, is must be behind the edge relative to origin.
   * If the vertex is collinear with the edge, it should be considered "behind" and ignored.
   * We know edge.A is ccw to edge.B because of the logic in _identifyVertices.
   * @param {PolygonVertex} vertex      The target vertex
   * @param {EdgeSet} activeEdges       The set of active edges
   * @returns {{isBehind: boolean, wasLimited: boolean}} Is the target vertex behind some closer edge?
   * @private
   */
  _isVertexBehindActiveEdges(vertex, activeEdges) {
    let wasLimited = false;
    for ( let edge of activeEdges ) {
      if ( vertex.edges.has(edge) ) continue;
      if ( foundry.utils.orient2dFast(edge.A, edge.B, vertex) > 0 ) {
        if ( ( edge.isLimited ) && !wasLimited ) wasLimited = true;
        else return {isBehind: true, wasLimited};
      }
    }
    return {isBehind: false, wasLimited};
  }

  /* -------------------------------------------- */

  /**
   * Determine the result for the sweep at a given vertex
   * @param {PolygonVertex} vertex      The target vertex
   * @param {EdgeSet} activeEdges       The set of active edges
   * @param {boolean} hasCollinear      Are there collinear vertices behind the target vertex?
   * @private
   */
  _determineSweepResult(vertex, activeEdges, hasCollinear=false) {

    // Determine whether the target vertex is behind some other active edge
    const {isBehind, wasLimited} = this._isVertexBehindActiveEdges(vertex, activeEdges);

    // Case 1 - Some vertices can be ignored because they are behind other active edges
    if ( isBehind ) return;

    // Construct the CollisionResult object
    const result = new CollisionResult({
      target: vertex,
      cwEdges: vertex.cwEdges,
      ccwEdges: vertex.ccwEdges,
      isLimited: vertex.isLimited,
      isBehind,
      wasLimited
    });

    // Case 2 - No counter-clockwise edge, so begin a new edge
    // Note: activeEdges always contain the vertex edge, so never empty
    const nccw = vertex.ccwEdges.size;
    if ( !nccw ) {
      this._switchEdge(result, activeEdges);
      result.collisions.forEach(pt => this.addPoint(pt));
      return;
    }

    // Case 3 - Limited edges in both directions
    // We can only guarantee this case if we don't have collinear endpoints
    const ccwLimited = !result.wasLimited && vertex.isLimitingCCW;
    const cwLimited = !result.wasLimited && vertex.isLimitingCW;
    if ( !hasCollinear && cwLimited && ccwLimited ) return;

    // Case 4 - Non-limited edges in both directions
    if ( !ccwLimited && !cwLimited && nccw && vertex.cwEdges.size ) {
      result.collisions.push(result.target);
      this.addPoint(result.target);
      return;
    }

    // Case 5 - Otherwise switching edges or edge types
    this._switchEdge(result, activeEdges);
    result.collisions.forEach(pt => this.addPoint(pt));
  }

  /* -------------------------------------------- */

  /**
   * Switch to a new active edge.
   * Moving from the origin, a collision that first blocks a side must be stored as a polygon point.
   * Subsequent collisions blocking that side are ignored. Once both sides are blocked, we are done.
   *
   * Collisions that limit a side will block if that side was previously limited.
   *
   * If neither side is blocked and the ray internally collides with a non-limited edge, n skip without adding polygon
   * endpoints. Sight is unaffected before this edge, and the internal collision can be ignored.
   * @private
   *
   * @param {CollisionResult} result    The pending collision result
   * @param {EdgeSet} activeEdges       The set of currently active edges
   */
  _switchEdge(result, activeEdges) {
    const origin = this.origin;

    // Construct the ray from the origin
    const ray = Ray.towardsPointSquared(origin, result.target, this.#rayDistance2);
    ray.result = result;
    this.rays.push(ray); // For visualization and debugging

    // Construct sorted array of collisions, moving away from origin
    // Collisions are either a collinear vertex or an internal collision to an edge.
    const vertices = [result.target, ...result.target.collinearVertices];

    // Set vertex distances for sorting
    vertices.forEach(v => v._d2 ??= Math.pow(v.x - origin.x, 2) + Math.pow(v.y - origin.y, 2));

    // Get all edge collisions for edges not already represented by a collinear vertex
    const internalEdges = activeEdges.filter(e => {
      return !vertices.some(v => v.equals(e.A) || v.equals(e.B));
    });
    let xs = this._getInternalEdgeCollisions(ray, internalEdges);

    // Combine the collisions and vertices
    xs.push(...vertices);

    // Sort collisions on proximity to the origin
    xs.sort((a, b) => a._d2 - b._d2);

    // As we iterate over intersection points we will define the insertion method
    let insert = undefined;
    const c = result.collisions;
    for ( const x of xs ) {

      if ( x.isInternal ) {  // Handle internal collisions
        // If neither side yet blocked and this is a non-limited edge, return
        if ( !result.blockedCW && !result.blockedCCW && !x.isLimited ) return;

        // Assume any edge is either limited or normal, so if not limited, must block. If already limited, must block
        result.blockedCW ||= !x.isLimited || result.limitedCW;
        result.blockedCCW ||= !x.isLimited || result.limitedCCW;
        result.limitedCW = true;
        result.limitedCCW = true;

      } else { // Handle true endpoints
        result.blockedCW ||= (result.limitedCW && x.isLimitingCW) || x.isBlockingCW;
        result.blockedCCW ||= (result.limitedCCW && x.isLimitingCCW) || x.isBlockingCCW;
        result.limitedCW ||= x.isLimitingCW;
        result.limitedCCW ||= x.isLimitingCCW;
      }

      // Define the insertion method and record a collision point
      if ( result.blockedCW ) {
        insert ||= c.unshift;
        if ( !result.blockedCWPrev ) insert.call(c, x);
      }
      if ( result.blockedCCW ) {
        insert ||= c.push;
        if ( !result.blockedCCWPrev ) insert.call(c, x);
      }

      // Update blocking flags
      if ( result.blockedCW && result.blockedCCW ) return;
      result.blockedCWPrev ||= result.blockedCW;
      result.blockedCCWPrev ||= result.blockedCCW;
    }
  }

  /* -------------------------------------------- */

  /**
   * Identify the collision points between an emitted Ray and a set of active edges.
   * @param {PolygonRay} ray            The candidate ray to test
   * @param {EdgeSet} internalEdges     The set of edges to check for collisions against the ray
   * @returns {PolygonVertex[]}         A sorted array of collision points
   * @private
   */
  _getInternalEdgeCollisions(ray, internalEdges) {
    const collisions = [];
    const A = ray.A;
    const B = ray.B;

    for ( let edge of internalEdges ) {
      const x = foundry.utils.lineLineIntersection(A, B, edge.A, edge.B);
      if ( !x ) continue;

      const c = PolygonVertex.fromPoint(x);
      c.attachEdge(edge, 0);
      c.isInternal = true;

      // Use the true distance so that collisions can be distinguished from nearby vertices.
      c._d2 = Math.pow(x.x - A.x, 2) + Math.pow(x.y - A.y, 2);
      collisions.push(c);
    }

    return collisions;
  }

  /* -------------------------------------------- */
  /*  Collision Testing                           */
  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  static getRayCollisions(ray, config={}) {
    const msg = "ClockwiseSweepPolygon.getRayCollisions has been renamed to ClockwiseSweepPolygon.testCollision";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return this.testCollision(ray.A, ray.B, config);
  }

  /** @override */
  _testCollision(ray, mode) {

    // Identify candidate edges
    this._identifyEdges();

    // Identify collision points
    let collisions = new Map();
    for ( const edge of this.edges ) {
      const x = foundry.utils.lineSegmentIntersection(this.origin, ray.B, edge.A, edge.B);
      if ( !x || (x.t0 <= 0) ) continue;
      if ( (mode === "any") && (!edge.isLimited || collisions.size) ) return true;
      let c = PolygonVertex.fromPoint(x, {distance: x.t0});
      if ( collisions.has(c.key) ) c = collisions.get(c.key);
      else collisions.set(c.key, c);
      c.attachEdge(edge);
    }
    if ( mode === "any" ) return false;

    // Sort collisions
    collisions = Array.from(collisions.values()).sort((a, b) => a._distance - b._distance);
    if ( collisions[0]?.type === CONST.WALL_SENSE_TYPES.LIMITED ) collisions.shift();

    // Visualize result
    if ( this.config.debug ) this._visualizeCollision(ray, collisions);

    // Return collision result
    if ( mode === "all" ) return collisions;
    else return collisions[0] || null;
  }

  /* -------------------------------------------- */
  /*  Visualization                               */
  /* -------------------------------------------- */

  /** @override */
  visualize() {
    let dg = canvas.controls.debug;
    dg.clear();

    // Text debugging
    if ( !canvas.controls.debug.debugText ) {
      canvas.controls.debug.debugText = canvas.controls.addChild(new PIXI.Container());
    }
    const text = canvas.controls.debug.debugText;
    text.removeChildren().forEach(c => c.destroy({children: true}));

    // Define limitation colors
    const limitColors = {
      [CONST.WALL_SENSE_TYPES.NONE]: 0x77E7E8,
      [CONST.WALL_SENSE_TYPES.NORMAL]: 0xFFFFBB,
      [CONST.WALL_SENSE_TYPES.LIMITED]: 0x81B90C,
      [CONST.WALL_SENSE_TYPES.PROXIMITY]: 0xFFFFBB,
      [CONST.WALL_SENSE_TYPES.DISTANCE]: 0xFFFFBB
    };

    // Draw boundary shapes
    for ( const constraint of this.config.boundaryShapes ) {
      dg.lineStyle(2, 0xFF4444, 1.0).beginFill(0xFF4444, 0.10).drawShape(constraint).endFill();
    }

    // Draw the final polygon shape
    dg.beginFill(0x00AAFF, 0.25).drawShape(this).endFill();

    // Draw candidate edges
    for ( let edge of this.edges ) {
      dg.lineStyle(4, limitColors[edge.type]).moveTo(edge.A.x, edge.A.y).lineTo(edge.B.x, edge.B.y);
    }

    // Draw vertices
    for ( let vertex of this.vertices.values() ) {
      if ( vertex.type ) {
        dg.lineStyle(1, 0x000000).beginFill(limitColors[vertex.type]).drawCircle(vertex.x, vertex.y, 8).endFill();
      }
      if ( vertex._index ) {
        let t = text.addChild(new PIXI.Text(String(vertex._index), CONFIG.canvasTextStyle));
        t.position.set(vertex.x, vertex.y);
      }
    }

    // Draw emitted rays
    for ( let ray of this.rays ) {
      const r = ray.result;
      if ( r ) {
        dg.lineStyle(2, 0x00FF00, r.collisions.length ? 1.0 : 0.33).moveTo(ray.A.x, ray.A.y).lineTo(ray.B.x, ray.B.y);
        for ( let c of r.collisions ) {
          dg.lineStyle(1, 0x000000).beginFill(0xFF0000).drawCircle(c.x, c.y, 6).endFill();
        }
      }
    }
    return dg;
  }

  /* -------------------------------------------- */

  /**
   * Visualize the polygon, displaying its computed area, rays, and collision points
   * @param {Ray} ray
   * @param {PolygonVertex[]} collisions
   * @private
   */
  _visualizeCollision(ray, collisions) {
    let dg = canvas.controls.debug;
    dg.clear();
    const limitColors = {
      [CONST.WALL_SENSE_TYPES.NONE]: 0x77E7E8,
      [CONST.WALL_SENSE_TYPES.NORMAL]: 0xFFFFBB,
      [CONST.WALL_SENSE_TYPES.LIMITED]: 0x81B90C,
      [CONST.WALL_SENSE_TYPES.PROXIMITY]: 0xFFFFBB,
      [CONST.WALL_SENSE_TYPES.DISTANCE]: 0xFFFFBB
    };

    // Draw edges
    for ( let edge of this.edges.values() ) {
      dg.lineStyle(4, limitColors[edge.type]).moveTo(edge.A.x, edge.A.y).lineTo(edge.B.x, edge.B.y);
    }

    // Draw the attempted ray
    dg.lineStyle(4, 0x0066CC).moveTo(ray.A.x, ray.A.y).lineTo(ray.B.x, ray.B.y);

    // Draw collision points
    for ( let x of collisions ) {
      dg.lineStyle(1, 0x000000).beginFill(0xFF0000).drawCircle(x.x, x.y, 6).endFill();
    }
  }
}
