/**
 * An abstract base class which defines a framework for effect sources which originate radially from a specific point.
 * This abstraction is used by the LightSource, VisionSource, SoundSource, and MovementSource subclasses.
 *
 * @example A standard PointSource lifecycle:
 * ```js
 * const source = new PointSource({object}); // Create the point source
 * source.initialize(data);                  // Configure the point source with new data
 * source.refresh();                         // Refresh the point source
 * source.destroy();                         // Destroy the point source
 * ```
 *
 * @param {object} [options]
 * @param {object} [options.object]    Some other object which is responsible for this source
 * @abstract
 */
class PointSource {
  constructor(options) {
    if ( options instanceof PlaceableObject ) {
      const warning = "The constructor PointSource(PlaceableObject) is deprecated. "
        + "Use new PointSource({ object }) instead.";
      foundry.utils.logCompatibilityWarning(warning, {since: 11, until: 13});
      this.object = options;
    }
    else this.object = options?.object ?? null;
  }

  /**
   * The type of source represented by this data structure.
   * Each subclass must implement this attribute.
   * @type {string}
   */
  static sourceType;

  /* -------------------------------------------- */
  /*  Point Source Attributes                     */
  /* -------------------------------------------- */

  /**
   * @typedef {Object} PointSourceData
   * @property {number} x                   The x-coordinate of the source location
   * @property {number} y                   The y-coordinate of the source location
   * @property {number} elevation           The elevation of the point source
   * @property {number|null} z              An index for sorting the source relative to others at the same elevation
   * @property {number} radius              The radius of the source
   * @property {number} externalRadius      A secondary radius used for limited angles
   * @property {number} rotation            The angle of rotation for this point source
   * @property {number} angle               The angle of emission for this point source
   * @property {boolean} walls              Whether or not the source is constrained by walls
   * @property {boolean} disabled           Whether or not the source is disabled
   */

  /**
   * Some other object which is responsible for this source.
   * @type {object|null}
   */
  object;

  /**
   * The data of this source.
   * @type {PointSourceData}
   */
  data = {};

  /**
   * The polygonal shape of the point source, generated from its origin, radius, and other data.
   * @type {PointSourcePolygon|PIXI.Polygon}
   */
  shape;

  /**
   * A collection of boolean flags which control rendering and refresh behavior for the source.
   * @type {Object<string,boolean|number>}
   * @protected
   */
  _flags = {};

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Returns the update ID associated with this point source.
   * The update ID is increased whenever the source is initialized.
   * @type {number}
   */
  get updateId() {
    return this.#updateId;
  }

  #updateId = 0;

  /**
   * Is this point source currently active?
   * Returns false if the source is disabled, temporarily suppressed, or not initialized.
   * @type {boolean}
   */
  get active() {
    return this.#active;
  }

  #active = false;

  /**
   * Is this source currently disabled?
   * Returns false if the source hasn't been initialized yet.
   * @type {boolean}
   */
  get disabled() {
    return this.data.disabled ?? true;
  }

  /**
   * Has this point source been initialized?
   * @type {boolean}
   */
  get initialized() {
    return this.#initialized;
  }

  #initialized = false;

  /**
   * The x-coordinate of the point source origin.
   * @type {number}
   */
  get x() {
    return this.data.x;
  }

  /**
   * The y-coordinate of the point source origin.
   * @type {number}
   */
  get y() {
    return this.data.y;
  }

  /**
   * The elevation bound to this source.
   * @type {number}
   */
  get elevation() {
    return this.data.elevation;
  }

  /**
   * A convenience reference to the radius of the source.
   * @type {number}
   */
  get radius() {
    return this.data.radius ?? 0;
  }

  /* -------------------------------------------- */
  /*  Point Source Initialization                 */
  /* -------------------------------------------- */

  /**
   * Initialize and configure the PointSource using provided data.
   * @param {object} data         Provided data for configuration
   * @returns {PointSource}       The configured source
   */
  initialize(data={}) {
    // Initialize data and record changes
    const prior = foundry.utils.deepClone(this.data) || {};
    this._initialize(data);
    const changes = foundry.utils.flattenObject(foundry.utils.diffObject(prior, this.data));

    // Compute the new polygon shape
    this.shape = this._createPolygon();
    if ( !this.shape ) return this;

    // Configure the point source
    this._configure(changes);
    this.#updateId++;
    this.#initialized = true;
    this.#active = this._isActive();

    return this;
  }

  /**
   * Subclass specific data initialization steps.
   * This method is responsible for populating the instance data object.
   * @param {object} data         Provided data for configuration
   * @protected
   */
  _initialize(data) {
    this.data = {
      x: data.x ?? 0,
      y: data.y ?? 0,
      z: data.z ?? null,
      elevation: data.elevation ?? 0,
      radius: data.radius ?? 0,
      externalRadius: data.externalRadius ?? 0,
      rotation: data.rotation ?? 0,
      angle: data.angle ?? 360,
      walls: data.walls ?? true,
      disabled: data.disabled ?? false
    };
    if ( this.data.radius > 0 ) this.data.radius = Math.max(this.data.radius, this.data.externalRadius);
  }

  /**
   * Subclass specific configuration steps. Occurs after data initialization and shape computation.
   * @param {object} changes      The fields of data which changed during initialization
   * @protected
   */
  _configure(changes={}) {}

  /* -------------------------------------------- */
  /*  Point Source Refresh                        */
  /* -------------------------------------------- */

  /**
   * Refresh the state and uniforms of the PointSource.
   */
  refresh() {

    // Skip sources which have not been initialized
    if ( !this.#initialized ) return;

    // Subclass refresh steps
    this._refresh();

    // Update active state
    this.#active = this._isActive();
  }

  /* -------------------------------------------- */

  /**
   * Test whether this source should be active under current conditions?
   * @returns {boolean}
   * @protected
   */
  _isActive() {
    return !this.disabled;
  }

  /* -------------------------------------------- */

  /**
   * Subclass-specific refresh steps.
   * @protected
   * @abstract
   */
  _refresh() {}

  /* -------------------------------------------- */
  /*  Point Source Destruction                    */
  /* -------------------------------------------- */

  /**
   * Steps that must be performed when the base source is destroyed.
   */
  destroy() {
    this.#initialized = false;
    this._destroy();
  }

  /* -------------------------------------------- */

  /**
   * Subclass specific destruction steps.
   * @protected
   * @abstract
   */
  _destroy() {}

  /* -------------------------------------------- */
  /*  Point Source Geometry Methods               */
  /* -------------------------------------------- */

  /**
   * Configure the parameters of the polygon that is generated for this source.
   * @returns {PointSourcePolygonConfig}
   * @protected
   */
  _getPolygonConfiguration() {
    return {
      type: this.data.walls ? this.constructor.sourceType : "universal",
      radius: this.data.radius,
      externalRadius: this.data.externalRadius,
      angle: this.data.angle,
      rotation: this.data.rotation,
      source: this
    };
  }

  /* -------------------------------------------- */

  /**
   * Create the polygon shape for this source using configured data.
   * @returns {PointSourcePolygon}
   * @protected
   */
  _createPolygon() {
    const origin = {x: this.data.x, y: this.data.y};
    const config = this._getPolygonConfiguration();
    if ( this.disabled ) config.radius = 0;
    const polygonClass = CONFIG.Canvas.polygonBackends[this.constructor.sourceType];
    return polygonClass.create(origin, config);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  get sourceType() {
    const msg = "PointSource#sourceType is deprecated. Use PointSource#constructor.sourceType instead.";
    foundry.utils.logCompatibilityWarning(msg, { since: 11, until: 13});
    return this.constructor.sourceType;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  set radius(radius) {
    const msg = "The setter PointSource#radius is deprecated. "
      + "The radius should not be set anywhere except in PointSource#_initialize.";
    foundry.utils.logCompatibilityWarning(msg, { since: 11, until: 13});
    this.data.radius = radius;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  get los() {
    const msg = "PointSource#los is deprecated in favor of PointSource#shape.";
    foundry.utils.logCompatibilityWarning(msg, { since: 11, until: 13});
    return this.shape;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  set los(shape) {
    const msg = "PointSource#los is deprecated in favor of PointSource#shape.";
    foundry.utils.logCompatibilityWarning(msg, { since: 11, until: 13});
    this.shape = shape;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  refreshSource() {
    const msg = "PointSource#refreshSource is deprecated in favor of PointSource#refresh.";
    foundry.utils.logCompatibilityWarning(msg, { since: 10, until: 12});
    this.refresh();
  }
}
