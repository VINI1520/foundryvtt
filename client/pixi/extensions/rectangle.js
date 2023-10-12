/**
 * Return the bounding box for a PIXI.Rectangle.
 * The bounding rectangle is normalized such that the width and height are non-negative.
 * @returns {PIXI.Rectangle}
 */
PIXI.Rectangle.prototype.getBounds = function() {
  let {x, y, width, height} = this;
  x = width > 0 ? x : x + width;
  y = height > 0 ? y : y + height;
  return new PIXI.Rectangle(x, y, Math.abs(width), Math.abs(height));
};

/* -------------------------------------------- */

/**
 * Compute the intersection of this Rectangle with some other Rectangle.
 * @param {PIXI.Rectangle} other      Some other rectangle which intersects this one
 * @returns {PIXI.Rectangle}
 */
PIXI.Rectangle.prototype.intersection = function(other) {
  const x0 = this.x < other.x ? other.x : this.x;
  const x1 = this.right > other.right ? other.right : this.right;
  const y0 = this.y < other.y ? other.y : this.y;
  const y1 = this.bottom > other.bottom ? other.bottom : this.bottom;
  return new PIXI.Rectangle(x0, y0, x1 - x0, y1 - y0);
};

/* -------------------------------------------- */

/**
 * Convert this PIXI.Rectangle into a PIXI.Polygon
 * @returns {PIXI.Polygon}      The Rectangle expressed as a PIXI.Polygon
 */
PIXI.Rectangle.prototype.toPolygon = function() {
  const points = [this.left, this.top, this.right, this.top, this.right, this.bottom, this.left, this.bottom];
  return new PIXI.Polygon(points);
};

/* -------------------------------------------- */

/**
 * Get the left edge of this rectangle.
 * The returned edge endpoints are oriented clockwise around the rectangle.
 * @type {{A: Point, B: Point}}
 */
Object.defineProperty(PIXI.Rectangle.prototype, "leftEdge", { get: function() {
  return { A: { x: this.left, y: this.bottom }, B: { x: this.left, y: this.top }};
}});

/**
 * Get the right edge of this rectangle.
 * The returned edge endpoints are oriented clockwise around the rectangle.
 * @type {{A: Point, B: Point}}
 */
Object.defineProperty(PIXI.Rectangle.prototype, "rightEdge", { get: function() {
  return { A: { x: this.right, y: this.top }, B: { x: this.right, y: this.bottom }};
}});

/**
 * Get the top edge of this rectangle.
 * The returned edge endpoints are oriented clockwise around the rectangle.
 * @type {{A: Point, B: Point}}
 */
Object.defineProperty(PIXI.Rectangle.prototype, "topEdge", { get: function() {
  return { A: { x: this.left, y: this.top }, B: { x: this.right, y: this.top }};
}});

/**
 * Get the bottom edge of this rectangle.
 * The returned edge endpoints are oriented clockwise around the rectangle.
 * @type {{A: Point, B: Point}}
 */
Object.defineProperty(PIXI.Rectangle.prototype, "bottomEdge", { get: function() {
  return { A: { x: this.right, y: this.bottom }, B: { x: this.left, y: this.bottom }};
}});

/* -------------------------------------------- */

/**
 * Bit code labels splitting a rectangle into zones, based on the Cohen-Sutherland algorithm.
 * See https://en.wikipedia.org/wiki/Cohen%E2%80%93Sutherland_algorithm
 *          left    central   right
 * top      1001    1000      1010
 * central  0001    0000      0010
 * bottom   0101    0100      0110
 * @enum {number}
 */
PIXI.Rectangle.CS_ZONES = {
  INSIDE: 0x0000,
  LEFT: 0x0001,
  RIGHT: 0x0010,
  TOP: 0x1000,
  BOTTOM: 0x0100,
  TOPLEFT: 0x1001,
  TOPRIGHT: 0x1010,
  BOTTOMRIGHT: 0x0110,
  BOTTOMLEFT: 0x0101
};

/**
 * Calculate the rectangle Zone for a given point located around or in the rectangle.
 * https://en.wikipedia.org/wiki/Cohen%E2%80%93Sutherland_algorithm
 *
 * @param {Point} p     Point to test for location relative to the rectangle
 * @returns {integer}
 */
PIXI.Rectangle.prototype._getZone = function(p) {
  const CSZ = PIXI.Rectangle.CS_ZONES;
  let code = CSZ.INSIDE;

  if ( p.x < this.x ) code |= CSZ.LEFT;
  else if ( p.x > this.right ) code |= CSZ.RIGHT;

  if ( p.y < this.y ) code |= CSZ.TOP;
  else if ( p.y > this.bottom ) code |= CSZ.BOTTOM;

  return code;
};

/**
 * Test whether a line segment AB intersects this rectangle.
 * @param {Point} a                       The first endpoint of segment AB
 * @param {Point} b                       The second endpoint of segment AB
 * @param {object} [options]              Options affecting the intersect test.
 * @param {boolean} [options.inside]      If true, a line contained within the rectangle will
 *                                        return true.
 * @returns {boolean} True if intersects.
 */
PIXI.Rectangle.prototype.lineSegmentIntersects = function(a, b, { inside = false } = {}) {
  const zoneA = this._getZone(a);
  const zoneB = this._getZone(b);

  if ( !(zoneA | zoneB) ) return inside; // Bitwise OR is 0: both points inside rectangle.
  if ( zoneA & zoneB ) return false; // Bitwise AND is not 0: both points share outside zone
  if ( !(zoneA && zoneB) ) return true; // Regular AND: one point inside, one outside

  // Line likely intersects, but some possibility that the line starts at, say, center left
  // and moves to center top which means it may or may not cross the rectangle
  const CSZ = PIXI.Rectangle.CS_ZONES;
  const lsi = foundry.utils.lineSegmentIntersects;

  // If the zone is a corner, like top left, test one side and then if not true, test
  // the other. If the zone is on a side, like left, just test that side.
  const leftEdge = this.leftEdge;
  if ( (zoneA & CSZ.LEFT) && lsi(leftEdge.A, leftEdge.B, a, b) ) return true;

  const rightEdge = this.rightEdge;
  if ( (zoneA & CSZ.RIGHT) && lsi(rightEdge.A, rightEdge.B, a, b) ) return true;

  const topEdge = this.topEdge;
  if ( (zoneA & CSZ.TOP) && lsi(topEdge.A, topEdge.B, a, b) ) return true;

  const bottomEdge = this.bottomEdge;
  if ( (zoneA & CSZ.BOTTOM ) && lsi(bottomEdge.A, bottomEdge.B, a, b) ) return true;

  return false;
};

/* -------------------------------------------- */

/**
 * Intersect this PIXI.Rectangle with a PIXI.Polygon.
 * Currently uses the clipper library.
 * In the future we may replace this with more specialized logic which uses the line-line intersection formula.
 * @param {PIXI.Polygon} polygon      A PIXI.Polygon
 * @param {object} [options]          Options which configure how the intersection is computed
 * @param {number} [options.clipType]       The clipper clip type
 * @param {number} [options.scalingFactor]  A scaling factor passed to Polygon#toClipperPoints to preserve precision
 * @returns {PIXI.Polygon|null}       The intersected polygon or null if no solution was present
 */
PIXI.Rectangle.prototype.intersectPolygon = function(polygon, {clipType, scalingFactor}={}) {
  if ( !this.width || !this.height ) return new PIXI.Polygon([]);
  return polygon.intersectPolygon(this.toPolygon(), {clipType, scalingFactor});
};

/* -------------------------------------------- */

/**
 * Determine whether some other Rectangle overlaps with this one.
 * This check differs from the parent class Rectangle#intersects test because it is true for adjacency (zero area).
 * @param {PIXI.Rectangle} other  Some other rectangle against which to compare
 * @returns {boolean}             Do the rectangles overlap?
 */
PIXI.Rectangle.prototype.overlaps = function(other) {
  return (other.right >= this.left)
    && (other.left <= this.right)
    && (other.bottom >= this.top)
    && (other.top <= this.bottom);
};

/* -------------------------------------------- */

/**
 * Normalize the width and height of the rectangle in-place, enforcing that those dimensions be positive.
 * @returns {PIXI.Rectangle}
 */
PIXI.Rectangle.prototype.normalize = function() {
  if ( this.width < 0 ) {
    this.x += this.width;
    this.width = Math.abs(this.width);
  }
  if ( this.height < 0 ) {
    this.y += this.height;
    this.height = Math.abs(this.height);
  }
  return this;
};

/* -------------------------------------------- */

/**
 * Generate a new rectangle by rotating this one clockwise about its center by a certain number of radians
 * @param {number} radians        The angle of rotation
 * @returns {PIXI.Rectangle}      A new rotated rectangle
 */
PIXI.Rectangle.prototyperotate = function(radians) {
  return this.constructor.fromRotation(this.x, this.y, this.width, this.height, radians);
};

/* -------------------------------------------- */

/**
 * Create normalized rectangular bounds given a rectangle shape and an angle of central rotation.
 * @param {number} x              The top-left x-coordinate of the un-rotated rectangle
 * @param {number} y              The top-left y-coordinate of the un-rotated rectangle
 * @param {number} width          The width of the un-rotated rectangle
 * @param {number} height         The height of the un-rotated rectangle
 * @param {number} radians        The angle of rotation about the center
 * @returns {PIXI.Rectangle}      The constructed rotated rectangle bounds
 */
PIXI.Rectangle.fromRotation = function(x, y, width, height, radians) {
  const rh = (height * Math.abs(Math.cos(radians))) + (width * Math.abs(Math.sin(radians)));
  const rw = (height * Math.abs(Math.sin(radians))) + (width * Math.abs(Math.cos(radians)));
  const rx = x + ((width - rw) / 2);
  const ry = y + ((height - rh) / 2);
  return new PIXI.Rectangle(rx, ry, rw, rh);
};

/* -------------------------------------------- */
/*  Deprecations and Compatibility              */
/* -------------------------------------------- */

/**
 * A PIXI.Rectangle where the width and height are always positive and the x and y are always the top-left
 * @extends {PIXI.Rectangle}
 */
class NormalizedRectangle extends PIXI.Rectangle {
  constructor(...args) {
    super(...args);
    foundry.utils.logCompatibilityWarning("You are using the NormalizedRectangle class which has been deprecated in"
      + " favor of PIXI.Rectangle.prototype.normalize", {since: 10, until: 12});
    this.normalize();
  }
}

