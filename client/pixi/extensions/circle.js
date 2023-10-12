
/**
 * Approximate this PIXI.Circle as a PIXI.Polygon
 * @param {object} [options]      Options which affect how the circle is converted
 * @param {number} [options.density]    The number of points which defines the density of approximation
 * @returns {PIXI.Polygon}        The Circle expressed as a PIXI.Polygon
 */
PIXI.Circle.prototype.toPolygon = function({density}={}) {
  density ??= this.constructor.approximateVertexDensity(this.radius);
  const points = [];
  const delta = (2 * Math.PI) / density;
  for ( let i=0; i<density; i++ ) {
    const dx = Math.cos(i * delta);
    const dy = Math.sin(i * delta);
    points.push(this.x + (dx * this.radius), this.y + (dy * this.radius));
  }
  return new PIXI.Polygon(points);
};

/* -------------------------------------------- */

/**
 * The recommended vertex density for the regular polygon approximation of a circle of a given radius.
 * Small radius circles have fewer vertices. The returned value will be rounded up to the nearest integer.
 * See the formula described at:
 * https://math.stackexchange.com/questions/4132060/compute-number-of-regular-polgy-sides-to-approximate-circle-to-defined-precision
 * @param {number} radius     Circle radius
 * @param {number} [epsilon]  The maximum tolerable distance between an approximated line segment and the true radius.
 *                            A larger epsilon results in fewer points for a given radius.
 * @returns {number}          The number of points for the approximated polygon
 */
PIXI.Circle.approximateVertexDensity = function(radius, epsilon=1) {
  return Math.ceil(Math.PI / Math.sqrt(2 * (epsilon / radius)));
};

/* -------------------------------------------- */

/**
 * Intersect this PIXI.Circle with a PIXI.Polygon.
 * For now, convert the circle to a Polygon approximation and use intersectPolygon.
 * In the future we may replace this with more specialized logic which uses the line-circle intersection formula.
 * @param {PIXI.Polygon} polygon      A PIXI.Polygon
 * @param {object} [options]          Options which configure how the intersection is computed
 * @param {number} [options.density]  The number of points which defines the density of approximation
 * @returns {PIXI.Polygon}            The intersected polygon
 */
PIXI.Circle.prototype.intersectPolygon = function(polygon, {density, ...options}={}) {
  if ( !this.radius ) return new PIXI.Polygon([]);
  const approx = this.toPolygon({density});
  return polygon.intersectPolygon(approx, options);
};
