
/**
 * Add a de-duplicated point to the Polygon.
 * @param {Point} point         The point to add to the Polygon
 * @returns {PIXI.Polygon}      A reference to the polygon for method chaining
 */
PIXI.Polygon.prototype.addPoint = function({x, y}={}) {
  const l = this.points.length;
  if ( (x === this.points[l-2]) && (y === this.points[l-1]) ) return;
  this.points.push(x, y);
  return this;
};

/**
 * Return the bounding box for a PIXI.Polygon.
 * The bounding rectangle is normalized such that the width and height are non-negative.
 * @returns {PIXI.Rectangle}    The bounding PIXI.Rectangle
 */
PIXI.Polygon.prototype.getBounds = function() {
  if ( this.points.length < 2 ) return new PIXI.Rectangle(0, 0, 0, 0);
  let maxX, maxY;
  let minX = maxX = this.points[0];
  let minY = maxY = this.points[1];
  for ( let i=3; i<this.points.length; i+=2 ) {
    const x = this.points[i-1];
    const y = this.points[i];
    if ( x < minX ) minX = x;
    else if ( x > maxX ) maxX = x;
    if ( y < minY ) minY = y;
    else if ( y > maxY ) maxY = y;
  }
  return new PIXI.Rectangle(minX, minY, maxX - minX, maxY - minY);
};

/* -------------------------------------------- */

/**
 * Construct a PIXI.Polygon instance from an array of clipper points [{X,Y}, ...].
 * @param {Array<{X: number, Y: number}>} points    An array of points returned by clipper
 * @param {object} [options]                        Options which affect how canvas points are generated
 * @param {number} [options.scalingFactor=1]            A scaling factor used to preserve floating point precision
 * @returns {PIXI.Polygon}                          The resulting PIXI.Polygon
 */
PIXI.Polygon.fromClipperPoints = function(points, {scalingFactor=1}={}) {
  const polygonPoints = [];
  for ( const point of points ) {
    polygonPoints.push(point.X / scalingFactor, point.Y / scalingFactor);
  }
  return new PIXI.Polygon(polygonPoints);
};

/* -------------------------------------------- */

/**
 * Convert a PIXI.Polygon into an array of clipper points [{X,Y}, ...].
 * Note that clipper points must be rounded to integers.
 * In order to preserve some amount of floating point precision, an optional scaling factor may be provided.
 * @param {object} [options]                        Options which affect how clipper points are generated
 * @param {number} [options.scalingFactor=1]            A scaling factor used to preserve floating point precision
 * @returns {Array<{X: number, Y: number}>}         An array of points to be used by clipper
 */
PIXI.Polygon.prototype.toClipperPoints = function({scalingFactor=1}={}) {
  const points = [];
  for ( let i = 1; i < this.points.length; i += 2 ) {
    points.push({
      X: Math.roundFast(this.points[i-1] * scalingFactor),
      Y: Math.roundFast(this.points[i] * scalingFactor)
    });
  }
  return points;
};

/* -------------------------------------------- */

/**
 * Determine whether the PIXI.Polygon is closed, defined by having the same starting and ending point.
 * @type {boolean}
 */
Object.defineProperty(PIXI.Polygon.prototype, "isClosed", {
  get: function() {
    const ln = this.points.length;
    if ( ln < 4 ) return false;
    return (this.points[0] === this.points[ln-2]) && (this.points[1] === this.points[ln-1]);
  },
  enumerable: false
});

/* -------------------------------------------- */
/*  Intersection Methods                        */
/* -------------------------------------------- */

/**
 * Intersect this PIXI.Polygon with another PIXI.Polygon using the clipper library.
 * @param {PIXI.Polygon} other        Another PIXI.Polygon
 * @param {object} [options]          Options which configure how the intersection is computed
 * @param {number} [options.clipType]       The clipper clip type
 * @param {number} [options.scalingFactor]  A scaling factor passed to Polygon#toClipperPoints to preserve precision
 * @returns {PIXI.Polygon|null}       The intersected polygon or null if no solution was present
 */
PIXI.Polygon.prototype.intersectPolygon = function(other, {clipType, scalingFactor}={}) {
  clipType ??= ClipperLib.ClipType.ctIntersection;
  const c = new ClipperLib.Clipper();
  c.AddPath(this.toClipperPoints({scalingFactor}), ClipperLib.PolyType.ptSubject, true);
  c.AddPath(other.toClipperPoints({scalingFactor}), ClipperLib.PolyType.ptClip, true);
  const solution = new ClipperLib.Paths();
  c.Execute(clipType, solution);
  return PIXI.Polygon.fromClipperPoints(solution.length ? solution[0] : [], {scalingFactor});
};

/* -------------------------------------------- */

/**
 * Intersect this PIXI.Polygon with a PIXI.Circle.
 * For now, convert the circle to a Polygon approximation and use intersectPolygon.
 * In the future we may replace this with more specialized logic which uses the line-circle intersection formula.
 * @param {PIXI.Circle} circle        A PIXI.Circle
 * @param {object} [options]          Options which configure how the intersection is computed
 * @param {number} [options.density]    The number of points which defines the density of approximation
 * @returns {PIXI.Polygon}            The intersected polygon
 */
PIXI.Polygon.prototype.intersectCircle = function(circle, options) {
  return circle.intersectPolygon(this, options);
};

/* -------------------------------------------- */

/**
 * Intersect this PIXI.Polygon with a PIXI.Rectangle.
 * For now, convert the rectangle to a Polygon and use intersectPolygon.
 * In the future we may replace this with more specialized logic which uses the line-line intersection formula.
 * @param {PIXI.Rectangle} rect       A PIXI.Rectangle
 * @param {object} [options]          Options which configure how the intersection is computed
 * @returns {PIXI.Polygon}            The intersected polygon
 */
PIXI.Polygon.prototype.intersectRectangle = function(rect, options) {
  return rect.intersectPolygon(this, options);
};

/* -------------------------------------------- */
