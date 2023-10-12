/**
 * @typedef {PointSourceData}             RenderedPointSourceData
 * @property {number|null} color          A color applied to the rendered effect
 * @property {number|null} seed           An integer seed to synchronize (or de-synchronize) animations
 * @property {boolean} preview            Is this source a temporary preview?
 */

/**
 * @typedef {Object} RenderedPointSourceAnimationConfig
 * @property {string} [label]                                   The human-readable (localized) label for the animation
 * @property {Function} [animation]                             The animation function that runs every frame
 * @property {AdaptiveIlluminationShader} [illuminationShader]  A custom illumination shader used by this animation
 * @property {AdaptiveColorationShader} [colorationShader]      A custom coloration shader used by this animation
 * @property {AdaptiveBackgroundShader} [backgroundShader]      A custom background shader used by this animation
 * @property {number} [seed]                                    The animation seed
 * @property {number} [time]                                    The animation time
 */

/**
 * An abstract class which extends the base PointSource to provide common functionality for rendering.
 * This class is extended by both the LightSource and VisionSource subclasses.
 */
class RenderedPointSource extends PointSource {

  /**
   * Keys of the data object which require shaders to be re-initialized.
   * @type {string[]}
   * @protected
   */
  static _initializeShaderKeys = [];

  /**
   * Keys of the data object which require uniforms to be refreshed.
   * @type {string[]}
   * @protected
   */
  static _refreshUniformsKeys = [];

  /**
   * The offset in pixels applied to create soft edges.
   * @type {number}
   */
  static EDGE_OFFSET = -8;

  /* -------------------------------------------- */
  /*  Rendered Source Attributes                  */
  /* -------------------------------------------- */

  /**
   * The animation configuration applied to this source
   * @type {RenderedPointSourceAnimationConfig}
   */
  animation = {};

  /**
   * The object of data which configures how the source is rendered
   * @type {RenderedPointSourceData}
   */
  data = this.data;

  /**
   * @typedef {Object} RenderedPointSourceLayer
   * @property {boolean} active             Is this layer actively rendered?
   * @property {boolean} reset              Do uniforms need to be reset?
   * @property {boolean} suppressed         Is this layer temporarily suppressed?
   * @property {PointSourceMesh} mesh       The rendered mesh for this layer
   * @property {AdaptiveLightingShader} shader  The shader instance used for the layer
   */

  /**
   * Track the status of rendering layers
   * @type {{background: RenderedPointSourceLayer, coloration: RenderedPointSourceLayer, illumination: RenderedPointSourceLayer}}
   */
  layers = {
    background: {active: true, reset: true, suppressed: false, mesh: undefined, shader: undefined, vmUniforms: undefined},
    coloration: {active: true, reset: true, suppressed: false, mesh: undefined, shader: undefined, vmUniforms: undefined},
    illumination: {active: true, reset: true, suppressed: false, mesh: undefined, shader: undefined, vmUniforms: undefined}
  };

  /**
   * The color of the source as a RGB vector.
   * @type {[number, number, number]|null}
   */
  colorRGB = null;

  /**
   * PIXI Geometry generated to draw meshes.
   * @type {PIXI.Geometry|null}
   */
  #geometry = null;

  /* -------------------------------------------- */
  /*  Rendered Source Properties                  */
  /* -------------------------------------------- */

  /**
   * A convenience accessor to the background layer mesh.
   * @type {PointSourceMesh}
   */
  get background() {
    return this.layers.background.mesh;
  }

  /**
   * A convenience accessor to the coloration layer mesh.
   * @type {PointSourceMesh}
   */
  get coloration() {
    return this.layers.coloration.mesh;
  }

  /**
   * A convenience accessor to the illumination layer mesh.
   * @type {PointSourceMesh}
   */
  get illumination() {
    return this.layers.illumination.mesh;
  }

  /**
   * Is the rendered source animated?
   * @type {boolean}
   */
  get isAnimated() {
    return this.active && !!this.animation.animation;
  }

  /**
   * Has the rendered source at least one active layer?
   * @type {boolean}
   */
  get hasActiveLayer() {
    return this.#hasActiveLayer;
  }

  #hasActiveLayer = false;

  /**
   * Is this RenderedPointSource a temporary preview?
   * @returns {boolean}
   */
  get isPreview() {
    return !!this.data.preview;
  }

  /* -------------------------------------------- */
  /*  Rendered Source Initialization              */
  /* -------------------------------------------- */


  /** @override */
  _initialize(data) {
    super._initialize(data);
    this.data.seed = data.seed ?? null;
    this.data.preview = data.preview ?? false;
    this.data.color = Color.from(data.color).valueOf();
    if ( Number.isNaN(this.data.color) ) this.data.color = null;
  }

  /* -------------------------------------------- */

  /** @override */
  _configure(changes) {
    // Configure the derived color attributes with main data color
    this._configureColorAttributes(this.data.color);

    // Initialize the soft edges flag
    this._configureSoftEdges();

    // Initialize meshes using the computed shape
    const initializeShaders = this.#initializeMeshes();

    // Initialize shaders
    if ( initializeShaders || this.constructor._initializeShaderKeys.some(k => k in changes) ) {
      this.#initializeShaders();
    }

    // Refresh uniforms
    else if ( this.constructor._refreshUniformsKeys.some(k => k in changes) ) {
      for ( const config of Object.values(this.layers) ) {
        config.reset = true;
      }
    }

    // Configure blend modes and sorting
    this._initializeBlending();

    // Update the visible state the layers
    this.#updateVisibleLayers();
  }

  /* -------------------------------------------- */

  /**
   * Decide whether to render soft edges with a blur.
   * @protected
   */
  _configureSoftEdges() {
    this._flags.renderSoftEdges = canvas.performance.lightSoftEdges && !this.isPreview
      && !((this.shape instanceof PointSourcePolygon) && this.shape.isCompleteCircle());
  }

  /* -------------------------------------------- */

  /**
   * Configure the derived color attributes and associated flag.
   * @param {number|null} color     The color to configure (usually a color coming for the rendered point source data)
   *                                or null if no color is configured for this rendered source.
   * @protected
   */
  _configureColorAttributes(color) {
    // Record hasColor flags and assign derived attributes
    const hasColor = this._flags.hasColor = (color !== null);
    if ( hasColor ) Color.applyRGB(color, this.colorRGB ??= [0, 0, 0]);
    else this.colorRGB = null;
    // We need to update the hasColor uniform attribute immediately
    for ( const layer of Object.values(this.layers) ) {
      if ( layer.shader ) layer.shader.uniforms.hasColor = hasColor;
    }
  }

  /* -------------------------------------------- */

  /**
   * Configure which shaders are used for each rendered layer.
   * @returns {{
   *  background: AdaptiveLightingShader,
   *  coloration: AdaptiveLightingShader,
   *  illumination: AdaptiveLightingShader
   * }}
   * @private
   */
  _configureShaders() {
    const a = this.animation;
    return {
      background: a.backgroundShader || AdaptiveBackgroundShader,
      coloration: a.colorationShader || AdaptiveColorationShader,
      illumination: a.illuminationShader || AdaptiveIlluminationShader
    };
  }

  /* -------------------------------------------- */

  /**
   * Specific configuration for a layer.
   * @param {object} layer
   * @param {string} layerId
   * @protected
   */
  _configureLayer(layer, layerId) {}

  /* -------------------------------------------- */

  /**
   * Initialize the shaders used for this source, swapping to a different shader if the animation has changed.
   */
  #initializeShaders() {
    const shaders = this._configureShaders();
    for ( const [layerId, layer] of Object.entries(this.layers) ) {
      layer.shader = RenderedPointSource.#createShader(shaders[layerId], layer.mesh);
      this._configureLayer(layer, layerId);
    }
    this.#updateUniforms();
    Hooks.callAll(`initialize${this.constructor.name}Shaders`, this);
  }

  /* -------------------------------------------- */

  /**
   * Create a new shader using a provider shader class
   * @param {typeof AdaptiveLightingShader} cls   The shader class to create
   * @param {PointSourceMesh} container           The container which requires a new shader
   * @returns {AdaptiveLightingShader}            The shader instance used
   */
  static #createShader(cls, container) {
    const current = container.shader;
    if ( current?.constructor === cls ) return current;
    const shader = cls.create({
      primaryTexture: canvas.primary.renderTexture
    });
    shader.container = container;
    container.shader = shader;
    container.uniforms = shader.uniforms;
    if ( current ) current.destroy();
    return shader;
  }

  /* -------------------------------------------- */

  /**
   * Initialize the blend mode and vertical sorting of this source relative to others in the container.
   * @protected
   */
  _initializeBlending() {
    const BM = PIXI.BLEND_MODES;
    const blending = {
      background: {blendMode: BM.MAX_COLOR, zIndex: 0},
      illumination: {blendMode: BM.MAX_COLOR, zIndex: 0},
      coloration: {blendMode: BM.SCREEN, zIndex: 0}
    };
    for ( const [l, layer] of Object.entries(this.layers) ) {
      const b = blending[l];
      layer.mesh.blendMode = b.blendMode;
      layer.mesh.zIndex = b.zIndex;
    }
  }

  /* -------------------------------------------- */

  /**
   * Create or update the source geometry and create meshes if necessary
   * @returns {boolean} True if the shaders need to be initialized.
   */
  #initializeMeshes() {
    const createMeshes = !this.#geometry;
    this.#updateGeometry();
    if ( createMeshes ) this.#createMeshes();
    return createMeshes;
  }

  /* -------------------------------------------- */

  /**
   * Create meshes for each layer of the RenderedPointSource that is drawn to the canvas.
   */
  #createMeshes() {
    const shaders = this._configureShaders();
    for ( const [l, layer] of Object.entries(this.layers) ) {
      layer.mesh = this.#createMesh(shaders[l]);
      layer.shader = layer.mesh.shader;
    }
  }

  /* -------------------------------------------- */

  /**
   * Create a new Mesh for this source using a provided shader class
   * @param {typeof AdaptiveLightingShader} shaderCls   The shader class used for this mesh
   * @returns {PointSourceMesh}                         The created Mesh
   */
  #createMesh(shaderCls) {
    const state = new PIXI.State();
    const mesh = new PointSourceMesh(this.#geometry, shaderCls.create(), state);
    mesh.drawMode = PIXI.DRAW_MODES.TRIANGLES;
    mesh.uniforms = mesh.shader.uniforms;
    mesh.cullable = true;
    return mesh;
  }

  /* -------------------------------------------- */

  /**
   * Create the geometry for the source shape that is used in shaders and compute its bounds for culling purpose.
   * Triangulate the form and create buffers.
   */
  #updateGeometry() {
    const {x, y, radius} = this.data;
    const offset = this._flags.renderSoftEdges ? this.constructor.EDGE_OFFSET : 0;
    const pm = new PolygonMesher(this.shape, {x, y, radius, normalize: true, offset});
    this.#geometry = pm.triangulate(this.#geometry);

    // Compute bounds of the geometry (used for optimizing culling)
    const bounds = new PIXI.Rectangle(0, 0, 0, 0);
    if ( radius > 0 ) {
      const b = this.shape instanceof PointSourcePolygon ? this.shape.bounds : this.shape.getBounds();
      bounds.x = (b.x - x) / radius;
      bounds.y = (b.y - y) / radius;
      bounds.width = b.width / radius;
      bounds.height = b.height / radius;
    }
    if ( this.#geometry.bounds ) this.#geometry.bounds.copyFrom(bounds);
    else this.#geometry.bounds = bounds;
  }

  /* -------------------------------------------- */
  /*  Rendered Source Canvas Rendering            */
  /* -------------------------------------------- */

  /**
   * Render the containers used to represent this light source within the LightingLayer
   * @returns {{background: PIXI.Mesh, coloration: PIXI.Mesh, illumination: PIXI.Mesh}}
   */
  drawMeshes() {
    const meshes = {};
    if ( !this.initialized ) return meshes;
    for ( const layerId of Object.keys(this.layers) ) {
      meshes[layerId] = this.#drawMesh(layerId);
    }
    return meshes;
  }

  /* -------------------------------------------- */

  /**
   * Create a Mesh for the background component of this source which will be added to CanvasBackgroundEffects.
   * @param {string} layerId            The layer key in layers to draw
   * @returns {PIXI.Mesh|null}          The drawn mesh for this layer, or null if no mesh is required
   */
  #drawMesh(layerId) {
    const layer = this.layers[layerId];
    const mesh = layer.mesh;

    if ( layer.reset ) {
      const fn = this[`_update${layerId.titleCase()}Uniforms`];
      fn.call(this);
    }
    if ( !layer.active || (this.data.radius <= 0) ) {
      mesh.visible = false;
      return null;
    }

    // Update the mesh
    const {x, y, radius} = this.data;
    mesh.position.set(x, y);
    mesh.scale.set(radius);
    mesh.visible = mesh.renderable = true;
    return layer.mesh;
  }

  /* -------------------------------------------- */
  /*  Rendered Source Refresh                     */
  /* -------------------------------------------- */

  /** @override */
  _refresh() {
    this.#updateUniforms();
    this.#updateVisibleLayers();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _isActive() {
    return this.#hasActiveLayer && super._isActive();
  }

  /* -------------------------------------------- */

  /**
   * Update uniforms for all rendered layers.
   */
  #updateUniforms() {
    if ( this.disabled ) return;
    this._updateBackgroundUniforms();
    this._updateIlluminationUniforms();
    this._updateColorationUniforms();
  }

  /* -------------------------------------------- */

  /**
   * Update the visible state of the component channels of this RenderedPointSource.
   */
  #updateVisibleLayers() {
    let hasActiveLayer = false;
    for ( const layer of Object.values(this.layers) ) {
      layer.active = !this.disabled && (layer.shader?.isRequired !== false);
      if ( layer.active ) hasActiveLayer = true;
    }
    this.#hasActiveLayer = hasActiveLayer;
  }

  /* -------------------------------------------- */

  /**
   * Update shader uniforms used for the background layer.
   * @protected
   */
  _updateBackgroundUniforms() {}

  /* -------------------------------------------- */

  /**
   * Update shader uniforms used for the coloration layer.
   * @protected
   */
  _updateColorationUniforms() {}

  /* -------------------------------------------- */

  /**
   * Update shader uniforms used for the illumination layer.
   * @protected
   */
  _updateIlluminationUniforms() {}

  /* -------------------------------------------- */
  /*  Rendered Source Destruction                 */
  /* -------------------------------------------- */

  /** @override */
  _destroy() {
    for ( const layer of Object.values(this.layers) ) {
      layer.mesh?.destroy();
    }
    this.#geometry?.destroy();
  }

  /* -------------------------------------------- */
  /*  Animation Functions                         */
  /* -------------------------------------------- */

  /**
   * Animate the PointSource, if an animation is enabled and if it currently has rendered containers.
   * @param {number} dt         Delta time.
   */
  animate(dt) {
    if ( !this.isAnimated ) return;
    const {animation, ...options} = this.animation;
    return animation.call(this, dt, options);
  }
  /* -------------------------------------------- */

  /**
   * Generic time-based animation used for Rendered Point Sources.
   * @param {number} dt           Delta time.
   * @param {object} [options]    Options which affect the time animation
   * @param {number} [options.speed=5]            The animation speed, from 1 to 10
   * @param {number} [options.intensity=5]        The animation intensity, from 1 to 10
   * @param {boolean} [options.reverse=false]     Reverse the animation direction
   */
  animateTime(dt, {speed=5, intensity=5, reverse=false}={}) {

    // Determine the animation timing
    let t = canvas.app.ticker.lastTime;
    if ( reverse ) t *= -1;
    this.animation.time = ( (speed * t) / 5000 ) + this.animation.seed;

    // Update uniforms
    for ( const layer of Object.values(this.layers) ) {
      const u = layer.mesh.uniforms;
      u.time = this.animation.time;
      u.intensity = intensity;
    }
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  get preview() {
    const msg = "The RenderedPointSource#preview is deprecated. "
      + "Use RenderedPointSource#isPreview instead.";
    foundry.utils.logCompatibilityWarning(msg, { since: 11, until: 13});
    return this.isPreview;
  }

  /**
   * @deprecated since v11
   * @ignore
   */
  set preview(preview) {
    const msg = "The RenderedPointSource#preview is deprecated. "
      + "Set RenderedPointSourceData#preview as part of RenderedPointSourceData#initialize instead.";
    foundry.utils.logCompatibilityWarning(msg, { since: 11, until: 13});
    this.data.preview = preview;
  }
}
