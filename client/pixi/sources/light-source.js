/**
 * @typedef {Object}                      LightSourceData
 * @see {@link foundry.data.LightData}
 * @property {number} x                   The x-coordinate of the source location
 * @property {number} y                   The y-coordinate of the source location
 * @property {number} z                   An optional z-index sorting for the source
 * @property {number} rotation            The angle of rotation for this point source
 * @property {number} alpha               An opacity for the emitted light, if any
 * @property {object} animation           An animation configuration for the source
 * @property {number} angle               The angle of emission for this point source
 * @property {number} bright              The allowed radius of bright vision or illumination
 * @property {number} color               A tint color for the emitted light, if any
 * @property {number} coloration          The coloration technique applied in the shader
 * @property {number} contrast            The amount of contrast this light applies to the background texture
 * @property {object} darkness            A darkness range (min and max) for which the source should be active
 * @property {number} dim                 The allowed radius of dim vision or illumination
 * @property {number} attenuation         Strength of the attenuation between bright, dim, and dark
 * @property {number} luminosity          The luminosity applied in the shader
 * @property {number} saturation          The amount of color saturation this light applies to the background texture
 * @property {number} shadows             The depth of shadows this light applies to the background texture
 * @property {boolean} walls              Whether or not the source is constrained by walls
 * @property {boolean} vision             Whether or not this source provides a source of vision
 * @property {number} seed                An integer seed to synchronize (or de-synchronize) animations
 */

/**
 * A specialized subclass of the PointSource abstraction which is used to control the rendering of light sources.
 * @extends {PointSource}
 * @param {AmbientLight|Token} object     The light-emitting object that generates this light source
 */
class LightSource extends PointSource {
  constructor(object) {
    super(object);

    /**
     * The object type for a Light Source.
     * This is a Scene in the case of a global light source
     * This is an AmbientLight placeable object when the source is provided by an AmbientLightDocument
     * This is a Token placeable object when the source is provided by a TokenDocument
     * @type {Scene|AmbientLight|Token}
     */
    this.object = object;

    /**
     * The light or darkness container for this source
     * @type {PIXI.Mesh|null}
     */
    this.background = null;

    /**
     * The light or darkness container for this source
     * @type {PIXI.Mesh|null}
     */
    this.illumination = null;

    /**
     * This visible color container for this source
     * @type {PIXI.Mesh|null}
     */
    this.coloration = null;
  }

  /** @inheritdoc */
  static sourceType = "light";

  /**
   * Keys in the LightSourceData structure which, when modified, change the appearance of the light
   * @type {string[]}
   * @private
   */
  static _appearanceKeys = [
    "dim", "bright", "attenuation", "alpha", "coloration", "color",
    "contrast", "saturation", "shadows", "luminosity"
  ];

  /* -------------------------------------------- */
  /*  Light Source Attributes                     */
  /* -------------------------------------------- */

  /**
   * The computed polygon which expresses the area of effect of this light source
   * @type {PointSourcePolygon|PIXI.Polygon}
   */
  los;

  /**
   * The object of data which configures how the source is rendered
   * @type {LightSourceData}
   */
  data = {};

  /**
   * Internal flag for whether this is a darkness source
   * @type {boolean}
   */
  isDarkness = false;

  /**
   * To know if a light source is a preview or not. False by default.
   * @type {boolean}
   */
  preview = false;

  /**
   * The ratio of dim:bright as part of the source radius
   * @type {number}
   */
  ratio;

  /**
   * Track which uniforms need to be reset
   * @type {{background: boolean, illumination: boolean, coloration: boolean}}
   * @private
   */
  _resetUniforms = {
    background: true,
    illumination: true,
    coloration: true
  };

  /**
   * To track if a source is temporarily shutdown to avoid glitches
   * @type {{illumination: boolean}}
   * @private
   */
  _shutdown = {
    illumination: false
  };

  /**
   * Record the current visibility state of this LightSource and its respective channels.
   * @type {{background: boolean, illumination: boolean, coloration: boolean, any: boolean}}
   */
  #visibility = {
    background: true,
    illumination: true,
    coloration: true,
    any: true
  };

  /* -------------------------------------------- */

  /**
   * To know if a light source is completely disabled.
   * @type {boolean}
   */
  get disabled() {
    return !this._meshesInit || !this.#visibility.any;
  }

  /** @override */
  get isAnimated() {
    const {animation} = this.animation;
    return !(!animation || (this.radius === 0) || this.disabled);
  }

  /* -------------------------------------------- */
  /*  Light Source Initialization                 */
  /* -------------------------------------------- */

  /**
   * Initialize the source with provided object data.
   * @param {object} data             Initial data provided to the point source.
   * @returns {LightSource}           A reference to the initialized source.
   */
  initialize(data={}) {

    // Initialize new input data
    const changes = this._initializeData(data);
    this._initializeFlags();

    // Record the requested animation configuration
    const seed = this.animation.seed ?? data.seed ?? Math.floor(Math.random() * 100000);
    const animationConfig = foundry.utils.deepClone(CONFIG.Canvas.lightAnimations[this.data.animation.type] || {});
    this.animation = Object.assign(animationConfig, this.data.animation, {seed});

    // Compute data attributes
    this.colorRGB = Color.from(this.data.color)?.rgb;
    this.radius = Math.max(Math.abs(this.data.dim), Math.abs(this.data.bright));
    this.ratio = Math.clamped(Math.abs(this.data.bright) / this.radius, 0, 1);
    this.isDarkness = this.data.luminosity < 0;

    // Compute the source polygon
    this.los = this._createPolygon();

    // TODO: this is a temporary workaround to know if we have a complete circle, to handle fast triangulation
    const isCompleteCircle = (this.los.points.length === PIXI.Circle.approximateVertexDensity(this.radius) * 2);
    this._flags.renderSoftEdges = canvas.performance.lightSoftEdges && (!isCompleteCircle || (this.data.angle < 360));

    // Initialize or update meshes with the los points array
    this._initializeMeshes(this.los);

    // Update shaders if the animation type or the constrained wall option changed
    const updateShaders = ("animation.type" in changes || "walls" in changes);
    if ( updateShaders ) this._initializeShaders();
    else if ( this.constructor._appearanceKeys.some(k => k in changes) ) {  // Record status flags
      for ( let k of Object.keys(this._resetUniforms) ) {
        this._resetUniforms[k] = true;
      }
    }

    // Initialize blend modes and sorting
    this._initializeBlending();
    return this;
  }

  /* -------------------------------------------- */

  /** @override */
  _getPolygonConfiguration() {
    return {
      type: this.data.walls ? "light" : "universal",
      angle: this.data.angle,
      density: PIXI.Circle.approximateVertexDensity(this.radius),
      radius: this.radius,
      rotation: this.data.rotation,
      source: this
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _createMeshes() {
    this.background = this._createMesh(AdaptiveBackgroundShader);
    this.illumination = this._createMesh(AdaptiveIlluminationShader);
    this.coloration = this._createMesh(AdaptiveColorationShader);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  destroy() {
    this.background?.destroy();
    this.illumination?.destroy();
    this.coloration?.destroy();
    super.destroy();
  }

  /* -------------------------------------------- */

  /**
   * Initialize the PointSource with new input data
   * @param {object} data             Initial data provided to the light source
   * @returns {object}                The changes compared to the prior data
   * @protected
   */
  _initializeData(data) {
    data.color = Color.from(data.color);
    if ( Number.isNaN(data.color) ) data.color = null;
    data.z = data.z ?? null;

    // Get the default values from the AmbientLightData schema
    const initial = AmbientLightDocument.cleanData();
    Object.assign(initial, initial.config);
    ["_id", "flags", "config"].forEach(k => delete initial[k]);

    // Merge data onto defaults
    data = foundry.utils.mergeObject(initial, data);

    // Identify changes compared to the current object
    const changes = foundry.utils.flattenObject(foundry.utils.diffObject(this.data, data));
    this.data = data;
    return changes;
  }

  /* -------------------------------------------- */

  /**
   * Record internal status flags which modify how the light source is rendered
   * @protected
   */
  _initializeFlags() {
    this._flags.renderSoftEdges = canvas.performance.lightSoftEdges && !this.preview;
    this._flags.hasColor = this.data.alpha && (this.data.color !== null);
  }

  /* -------------------------------------------- */

  /**
   * Initialize the shaders used for this source, swapping to a different shader if the animation has changed.
   * @private
   */
  _initializeShaders() {

    // Create each shader
    const createShader = (cls, container) => {
      const current = container.shader;
      if ( current?.constructor.name === cls.name ) return;
      const shader = cls.create({
        primaryTexture: canvas.primary.renderTexture
      });
      shader.container = container;
      container.shader = shader;
      if ( current ) current.destroy();
    };

    // Initialize shaders
    createShader(this.animation.backgroundShader || AdaptiveBackgroundShader, this.background);
    createShader(this.animation.illuminationShader || AdaptiveIlluminationShader, this.illumination);
    createShader(this.animation.colorationShader || AdaptiveColorationShader, this.coloration);

    // Initialize uniforms
    this._updateUniforms();

    /**
     * A hook event that fires after LightSource shaders have initialized.
     * @function initializeLightSourceShaders
     * @memberof hookEvents
     * @param {PointSource} source   The LightSource being initialized
     */
    Hooks.callAll("initializeLightSourceShaders", this);
  }

  /* -------------------------------------------- */

  /**
   * Initialize the blend mode and vertical sorting of this source relative to others in the container.
   * @private
   */
  _initializeBlending() {
    const defaultZ = this.isDarkness ? 10 : 0;
    const BM = PIXI.BLEND_MODES;

    // Background
    this.background.blendMode = BM.MAX_COLOR;
    this.background.zIndex = 0;

    // Illumination
    let blend = BM[this.isDarkness ? "MIN_COLOR" : "MAX_COLOR"];
    if ( this._resetUniforms.illumination && (this.illumination.blendMode !== blend) ) {
      this._shutdown.illumination = true;
      this.illumination.renderable = false;
    }
    this.illumination.blendMode = blend;
    this.illumination.zIndex = this.data.z ?? defaultZ;

    // Coloration
    this.coloration.blendMode = BM[this.isDarkness ? "MULTIPLY" : "SCREEN"];
    this.coloration.zIndex = this.data.z ?? defaultZ;
  }

  /* -------------------------------------------- */
  /*  Light Source Rendering                      */
  /* -------------------------------------------- */

  /** @override */
  refreshSource() {
    if ( !this._meshesInit ) return;

    // Update all uniforms for every layer
    this._updateUniforms();
  }

  /* -------------------------------------------- */

  /**
   * Update the visible state of the component channels of this LightSource.
   * @returns {boolean}     Is any channel of this light source active?
   */
  updateVisibility() {

    // If the object is not emitting light, no channels of the source are visible
    if ( this._isSuppressed() ) {
      this.#visibility = {background: false, coloration: false, illumination: false, any: false};
      return false;
    }

    // Determine which light layers are rendered
    const v = this.#visibility;
    v.background = this.background.shader?.isRequired !== false;
    v.illumination = this.illumination.shader?.isRequired !== false;
    v.coloration = this.coloration.shader?.isRequired !== false;

    // Track whether any channel is visible
    return v.any = v.background || v.illumination || v.coloration;
  }

  /* -------------------------------------------- */

  /**
   * Test whether this light source is currently suppressed?
   * @returns {boolean}
   * @private
   */
  _isSuppressed() {
    return this.object.emitsLight === false;
  }

  /* -------------------------------------------- */

  /**
   * Render the containers used to represent this light source within the LightingLayer
   * @returns {{background: PIXI.Mesh, light: PIXI.Mesh, color: PIXI.Mesh}}
   */
  drawMeshes() {
    const background = this.drawBackground();
    const light = this.drawLight();
    const color = this.drawColor();
    return {background, light, color};
  }

  /* -------------------------------------------- */

  /**
   * Create a Mesh for the background component of this source which will be added to CanvasBackgroundEffects.
   * @returns {PIXI.Mesh|null}          The background mesh for this LightSource, or null
   */
  drawBackground() {
    if ( this._resetUniforms.background ) this._updateBackgroundUniforms();
    if ( !this.#visibility.background ) {
      this.background.visible = false;
      return null;
    }
    return this._updateMesh(this.background);
  }

  /* -------------------------------------------- */

  /**
   * Create a Mesh for the illumination component of this source which will be added to CanvasIlluminationEffects.
   * @returns {PIXI.Mesh|null}          The illumination mesh for this LightSource, or null
   */
  drawLight() {
    if ( this._resetUniforms.illumination ) this._updateIlluminationUniforms();
    if ( !this.#visibility.illumination ) {
      this.illumination.visible = false;
      return null;
    }
    return this._updateMesh(this.illumination);
  }

  /* -------------------------------------------- */

  /**
   * Create a Mesh for the coloration component of this source which will be added to CanvasColorationEffects.
   * @returns {PIXI.Mesh|null}          The coloration mesh for this LightSource, or null
   */
  drawColor() {
    if ( this._resetUniforms.coloration ) this._updateColorationUniforms();
    if ( !this.#visibility.coloration ) {
      this.coloration.visible = false;
      return null;
    }
    return this._updateMesh(this.coloration);
  }

  /* -------------------------------------------- */
  /*  Shader Management                           */
  /* -------------------------------------------- */

  /**
   * Update all layer uniforms.
   * @protected
   */
  _updateUniforms() {
    this._updateBackgroundUniforms();
    this._updateIlluminationUniforms();
    this._updateColorationUniforms();
  }

  /* -------------------------------------------- */

  /**
   * Update shader uniforms by providing data from this PointSource
   * @private
   */
  _updateColorationUniforms() {
    const shader = this.coloration.shader;
    const u = shader.uniforms;
    const d = shader._defaults;
    this._updateCommonUniforms(shader);

    // Adapting color intensity to the coloration technique
    switch (this.data.coloration) {
      case 0: // Legacy
        // Default 0.25 -> Legacy technique needs quite low intensity default to avoid washing background
        u.colorationAlpha = Math.pow(this.data.alpha, 2);
        break;
      case 4: // Color burn
      case 5: // Internal burn
      case 6: // External burn
      case 9: // Invert absorption
        // Default 0.5 -> These techniques are better at low color intensity
        u.colorationAlpha = this.data.alpha;
        break;
      default:
        // Default 1 -> The remaining techniques use adaptive lighting,
        // which produces interesting results in the [0, 2] range.
        u.colorationAlpha = this.data.alpha * 2;
    }

    u.color = this._flags.hasColor ? this.colorRGB : d.color;
    u.useSampler = this.data.coloration > 0;  // Not needed for legacy coloration (technique id 0)

    // Flag uniforms as updated
    this._resetUniforms.coloration = false;
  }

  /* -------------------------------------------- */

  /**
   * Update shader uniforms by providing data from this PointSource
   * @private
   */
  _updateIlluminationUniforms() {
    const shader = this.illumination.shader;
    const c = canvas.colors;
    const u = shader.uniforms;
    const d = shader._defaults;
    const colorIntensity = this.data.alpha;
    let colorDim;
    let colorBright;

    // Inner function to get a corrected color according to the vision mode lighting levels configuration
    const getCorrectedColor = (level, colorDim, colorBright, colorBackground=c.background) => {
      // Retrieving the lighting mode and the corrected level, if any
      const lightingOptions = canvas.effects.visibility.visionModeData?.activeLightingOptions;
      const correctedLevel = (lightingOptions?.levels?.[level]) ?? level;

      // Returning the corrected color according to the lighting options
      const levels = VisionMode.LIGHTING_LEVELS;
      switch ( correctedLevel ) {
        case levels.HALFDARK:
        case levels.DIM: return colorDim;
        case levels.BRIGHT:
        case levels.DARKNESS: return colorBright;
        case levels.BRIGHTEST: return c.ambientBrightest;
        case levels.UNLIT: return colorBackground;
        default: return colorDim;
      }
    };

    // Darkness [-1, 0)
    if ( this.isDarkness ) {
      let lc; let cdim1; let cdim2; let cbr1; let cbr2;
      const lightSourceColor = this._flags.hasColor ? Color.from(this.data.color) : null;

      // Creating base colors for darkness
      const iMid = c.background.mix(c.darkness, 0.5);
      const mid = lightSourceColor ? lightSourceColor.multiply(iMid).multiply(colorIntensity * 2) : iMid;
      const black = lightSourceColor ? lightSourceColor.multiply(c.darkness).multiply(colorIntensity * 2) : c.darkness;

      if ( this.data.luminosity < -0.5 ) {
        lc = Math.abs(this.data.luminosity) - 0.5;
        cdim1 = black;
        cdim2 = black.multiply(0.625);
        cbr1 = black.multiply(0.5);
        cbr2 = black.multiply(0.125);
      }
      else {
        lc = Math.sqrt(Math.abs(this.data.luminosity) * 2); // Accelerating easing toward dark tone with sqrt
        cdim1 = mid;
        cdim2 = black;
        cbr1 = mid;
        cbr2 = black.multiply(0.5);
      }
      colorDim = cdim1.mix(cdim2, lc);
      colorBright = cbr1.mix(cbr2, lc);
      u.colorDim = getCorrectedColor(VisionMode.LIGHTING_LEVELS.HALFDARK, colorDim, colorBright).rgb;
      u.colorBright = getCorrectedColor(VisionMode.LIGHTING_LEVELS.DARKNESS, colorDim, colorBright).rgb;
    }

    // Light [0,1]
    else {
      const lum = this.data.luminosity;
      // Get the luminosity penalty for the bright color
      const lumPenalty = Math.clamped(lum * 2, 0, 1);
      // Attenuate darkness penalty applied to bright color according to light source luminosity level
      const correctedBright = c.bright.mix(c.ambientBrightest, Math.clamped((lum * 2) - 1, 0, 1));
      // Assign colors and apply luminosity penalty on the bright channel
      colorBright = correctedBright.multiply(lumPenalty).maximize(c.background);
      // Recompute dim colors with the updated luminosity
      colorDim = c.background.mix(colorBright, canvas.colorManager.weights.dim);
      u.colorBright = getCorrectedColor(VisionMode.LIGHTING_LEVELS.BRIGHT, colorDim, colorBright).rgb;
      u.colorDim = getCorrectedColor(VisionMode.LIGHTING_LEVELS.DIM, colorDim, colorBright).rgb;
    }

    // Update shared uniforms
    this._updateCommonUniforms(shader);
    u.color = this._flags.hasColor ? this.colorRGB : d.color;
    u.colorBackground = c.background.rgb;
    u.useSampler = false;

    // Flag uniforms as updated
    this._shutdown.illumination = false;
    this._resetUniforms.illumination = false;
  }

  /* -------------------------------------------- */

  /**
   * Update shader uniforms by providing data from this PointSource
   * @private
   */
  _updateBackgroundUniforms() {
    const shader = this.background.shader;
    const d = shader._defaults;
    const u = shader.uniforms;
    u.color = this._flags.hasColor ? this.colorRGB : d.color;
    u.colorBackground = canvas.colors.background.rgb;
    u.backgroundAlpha = this.data.alpha;
    u.darknessLevel = canvas.colorManager.darknessLevel;
    u.useSampler = true;

    // Update shared uniforms
    this._updateCommonUniforms(shader);

    // Flag uniforms as updated
    this._resetUniforms.background = false;
  }

  /* -------------------------------------------- */

  /**
   * Update shader uniforms shared by all shader types
   * @param {AdaptiveLightingShader} shader        The shader being updated
   * @private
   */
  _updateCommonUniforms(shader) {
    const u = shader.uniforms;

    // Passing advanced color correction values
    u.exposure = this._mapLuminosity(this.data.luminosity);
    u.contrast = (this.data.contrast < 0 ? this.data.contrast * 0.5 : this.data.contrast);
    u.saturation = this.data.saturation;
    u.shadows = this.data.shadows;
    u.darkness = this.isDarkness;
    u.hasColor = this._flags.hasColor;
    u.ratio = this.ratio;
    u.technique = this.data.coloration;
    // Graph: https://www.desmos.com/calculator/e7z0i7hrck
    // mapping [0,1] attenuation user value to [0,1] attenuation shader value
    u.attenuation = (Math.cos(Math.PI * Math.pow(this.data.attenuation, 1.5)) - 1) / -2;
    u.depthElevation = canvas.primary.mapElevationAlpha(this.elevation);

    // Passing screenDimensions to use screen size render textures
    u.screenDimensions = canvas.screenDimensions;
    if ( !u.depthTexture ) u.depthTexture = canvas.masks.depth.renderTexture;
    if ( !u.primaryTexture ) u.primaryTexture = canvas.primary.renderTexture;
  }

  /* -------------------------------------------- */

  /**
   * Map luminosity value to exposure value
   * luminosity[-1  , 0  [ => Darkness => map to exposure ]   0, 1]
   * luminosity[ 0  , 0.5[ => Light    => map to exposure [-0.5, 0[
   * luminosity[ 0.5, 1  ] => Light    => map to exposure [   0, 1]
   * @param {number} lum        The luminosity value
   * @returns {number}           The exposure value
   * @private
   */
  _mapLuminosity(lum) {
    if ( lum < 0 ) return lum + 1;
    if ( lum < 0.5 ) return lum - 0.5;
    return ( lum - 0.5 ) * 2;
  }

  /* -------------------------------------------- */
  /*  Animation Functions                         */
  /* -------------------------------------------- */

  /**
   * An animation with flickering ratio and light intensity
   * @param {number} dt                       Delta time
   * @param {object} [options={}]             Additional options which modify the flame animation
   * @param {number} [options.speed=5]        The animation speed, from 1 to 10
   * @param {number} [options.intensity=5]    The animation intensity, from 1 to 10
   * @param {boolean} [options.reverse=false] Reverse the animation direction
   */
  animateTorch(dt, {speed=5, intensity=5, reverse=false} = {}) {
    // Call animate flickering with amplification
    this.animateFlickering(dt, {speed, intensity, reverse, amplification: intensity / 5});
  }

  /* -------------------------------------------- */

  /**
   * An animation with flickering ratio and light intensity
   * @param {number} dt                                 Delta time
   * @param {object} [options={}]                       Additional options which modify the flame animation
   * @param {number} [options.speed=5]                  The animation speed, from 1 to 10
   * @param {number} [options.intensity=5]              The animation intensity, from 1 to 10
   * @param {number} [options.amplification=1]          Noise amplification (>1) or dampening (<1)
   * @param {boolean} [options.reverse=false]           Reverse the animation direction
   */
  animateFlickering(dt, {speed=5, intensity=5, reverse=false, amplification=1} = {}) {
    // Call base animate time
    this.animateTime(dt, {speed, intensity, reverse});

    // Create the noise object for the first frame
    const amplitude = amplification * 0.45;
    if ( !this._noise ) this._noise = new SmoothNoise({amplitude: amplitude, scale: 3, maxReferences: 2048});

    // Update amplitude
    if ( this._noise.amplitude !== amplitude ) this._noise.amplitude = amplitude;

    // Create noise from animation time. Range [0.0, 0.45]
    let n = this._noise.generate(this.animation.time);

    // Update brightnessPulse and ratio with some noise in it
    const co = this.coloration;
    const il = this.illumination;
    co.uniforms.brightnessPulse = il.uniforms.brightnessPulse = 0.55 + n;    // Range [0.55, 1.0 <* amplification>]
    co.uniforms.ratio = il.uniforms.ratio = (this.ratio * 0.9) + (n * 0.222);// Range [ratio * 0.9, ratio * ~1.0 <* amplification>]
  }

  /* -------------------------------------------- */

  /**
   * A basic "pulse" animation which expands and contracts.
   * @param {number} dt                           Delta time
   * @param {object} [options={}]                 Additional options which modify the pulse animation
   * @param {number} [options.speed=5]              The animation speed, from 1 to 10
   * @param {number} [options.intensity=5]          The animation intensity, from 1 to 10
   * @param {boolean} [options.reverse=false]       Reverse the animation direction
   */
  animatePulse(dt, {speed=5, intensity=5, reverse=false}={}) {

    // Determine the animation timing
    let t = canvas.app.ticker.lastTime;
    if ( reverse ) t *= -1;
    this.animation.time = ((speed * t)/5000) + this.animation.seed;

    // Define parameters
    const i = (10 - intensity) * 0.1;
    const w = 0.5 * (Math.cos(this.animation.time * 2.5) + 1);
    const wave = (a, b, w) => ((a - b) * w) + b;

    // Pulse coloration
    const co = this.coloration;
    co.uniforms.intensity = intensity;
    co.uniforms.time = this.animation.time;
    co.uniforms.pulse = wave(1.2, i, w);

    // Pulse illumination
    const il = this.illumination;
    il.uniforms.intensity = intensity;
    il.uniforms.time = this.animation.time;
    il.uniforms.ratio = wave(this.ratio, this.ratio * i, w);
  }

  /* -------------------------------------------- */

  /**
   * Emanate waves of light from the source origin point
   * @param {number} dt                         Delta time
   * @param {object} [options={}]               Additional options which modify the animation
   * @param {number} [options.speed=5]            The animation speed, from 1 to 10
   * @param {number} [options.intensity=5]        The animation intensity, from 1 to 10
   * @param {boolean} [options.reverse=false]     Reverse the animation direction
   */
  animateTime(dt, {speed=5, intensity=5, reverse=false}={}) {

    // Determine the animation timing
    let t = canvas.app.ticker.lastTime;
    if ( reverse ) t *= -1;
    this.animation.time = ((speed * t)/5000) + this.animation.seed;

    // Update uniforms
    const co = this.coloration;
    co.uniforms.intensity = intensity;
    co.uniforms.time = this.animation.time;
    const il = this.illumination;
    il.uniforms.intensity = intensity;
    il.uniforms.time = this.animation.time;
  }

  /* -------------------------------------------- */
  /*  Visibility Testing                          */
  /* -------------------------------------------- */

  /**
   * Test whether this LightSource provides visibility to see a certain target object.
   * @param {object} config               The visibility test configuration
   * @param {CanvasVisibilityTest[]} config.tests  The sequence of tests to perform
   * @param {PlaceableObject} config.object        The target object being tested
   * @returns {boolean}                   Is the target object visible to this source?
   */
  testVisibility({tests, object}={}) {
    if ( !(this.data.vision && this._canDetectObject(object)) ) return false;
    return tests.some(test => {
      const {x, y} = test.point;
      return this.los.contains(x, y);
    });
  }

  /* -------------------------------------------- */

  /**
   * Can this LightSource theoretically detect a certain object based on its properties?
   * This check should not consider the relative positions of either object, only their state.
   * @param {PlaceableObject} target      The target object being tested
   * @returns {boolean}                   Can the target object theoretically be detected by this vision source?
   */
  _canDetectObject(target) {
    const tgt = target?.document;
    const isInvisible = ((tgt instanceof TokenDocument) && tgt.hasStatusEffect(CONFIG.specialStatusEffects.INVISIBLE));
    return !isInvisible;
  }
}

/* -------------------------------------------- */

/**
 * A specialized subclass of the LightSource which is used to render global light source linked to the scene.
 * @see LightSource
 * @extends {LightSource}
 * @param {Scene} object     The linked scene.
 */
class GlobalLightSource extends LightSource {

  /** @override */
  get elevation() {
    return Infinity;
  }

  /* -------------------------------------------- */

  /** @override */
  _createPolygon() {
    return canvas.dimensions.sceneRect.toPolygon();
  }

  /* -------------------------------------------- */

  /** @override */
  _initializeFlags() {
    this._flags.renderSoftEdges = false;
    this._flags.hasColor = this.data.alpha && (this.data.color !== null);
  }

  /* -------------------------------------------- */

  /** @override */
  _isSuppressed() {
    return !canvas.effects.illumination.globalLight;
  }
}
