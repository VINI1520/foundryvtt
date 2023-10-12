/**
 * @typedef {RenderedPointSourceData}     LightSourceData
 * @see {@link foundry.data.LightData}
 * @property {number} alpha               An opacity for the emitted light, if any
 * @property {object} animation           An animation configuration for the source
 * @property {number} bright              The allowed radius of bright vision or illumination
 * @property {number} coloration          The coloration technique applied in the shader
 * @property {number} contrast            The amount of contrast this light applies to the background texture
 * @property {number} dim                 The allowed radius of dim vision or illumination
 * @property {number} attenuation         Strength of the attenuation between bright, dim, and dark
 * @property {number} luminosity          The luminosity applied in the shader
 * @property {number} saturation          The amount of color saturation this light applies to the background texture
 * @property {number} shadows             The depth of shadows this light applies to the background texture
 * @property {boolean} vision             Whether or not this source provides a source of vision
 */

/**
 * A specialized subclass of the PointSource abstraction which is used to control the rendering of light sources.
 */
class LightSource extends RenderedPointSource {

  /** @inheritDoc */
  static sourceType = "light";

  /** @override */
  static _initializeShaderKeys = ["animation.type", "walls"];

  /** @override */
  static _refreshUniformsKeys = ["dim", "bright", "attenuation", "alpha", "coloration", "color", "contrast",
    "saturation", "shadows", "luminosity"];

  /* -------------------------------------------- */
  /*  Light Source Attributes                     */
  /* -------------------------------------------- */

  /**
   * The object of data which configures how the source is rendered
   * @type {LightSourceData}
   */
  data = this.data;

  /**
   * The ratio of dim:bright as part of the source radius
   * @type {number}
   */
  ratio = 0;

  /* -------------------------------------------- */
  /*  Light Source Properties                  */
  /* -------------------------------------------- */

  /**
   * Is this darkness?
   * @type {boolean}
   */
  get isDarkness() {
    return this.data.luminosity < 0;
  }

  /* -------------------------------------------- */
  /*  Light Source Initialization                 */
  /* -------------------------------------------- */

  /** @override */
  _initialize(data) {
    super._initialize(data);
    this.data.alpha = data.alpha ?? 0.5;
    this.data.animation = data.animation ?? {};
    this.data.bright = data.bright ?? 0;
    this.data.coloration = data.coloration ?? 1;
    this.data.contrast = data.contrast ?? 0;
    this.data.dim = data.dim ?? 0;
    this.data.attenuation = data.attenuation ?? 0.5;
    this.data.luminosity = data.luminosity ?? 0.5;
    this.data.saturation = data.saturation ?? 0;
    this.data.shadows = data.shadows ?? 0;
    this.data.vision = data.vision ?? false;
    this.data.radius = Math.max(Math.abs(this.data.dim), Math.abs(this.data.bright));
    if ( this.data.radius > 0 ) this.data.radius = Math.max(this.data.radius, this.data.externalRadius);
  }

  /* -------------------------------------------- */

  /** @override */
  _configure(changes) {
    // Record the requested animation configuration
    const seed = this.data.seed ?? this.animation.seed ?? Math.floor(Math.random() * 100000);
    const animationConfig = foundry.utils.deepClone(CONFIG.Canvas.lightAnimations[this.data.animation.type] || {});
    this.animation = Object.assign(animationConfig, this.data.animation, {seed});

    // Compute data attributes
    this.ratio = Math.clamped(Math.abs(this.data.bright) / this.data.radius, 0, 1);

    // Parent class configuration
    return super._configure(changes);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getPolygonConfiguration() {
    return Object.assign(super._getPolygonConfiguration(), {useThreshold: true});
  }

  /* -------------------------------------------- */

  /** @override */
  _initializeBlending() {

    // Configure blending data
    const BM = PIXI.BLEND_MODES;
    const i = this.layers.illumination;
    const z = this.data.z ?? (this.isDarkness ? 10 : 0);
    const blending = {
      background: {blendMode: BM.MAX_COLOR, zIndex: 0},
      illumination: {blendMode: BM[this.isDarkness ? "MIN_COLOR" : "MAX_COLOR"], zIndex: z},
      coloration: {blendMode: BM[this.isDarkness ? "MULTIPLY" : "SCREEN"], zIndex: z}
    };

    // Assign blending data
    for ( const [l, layer] of Object.entries(this.layers) ) {
      const b = blending[l];
      layer.mesh.blendMode = b.blendMode;
      layer.mesh.zIndex = b.zIndex;
    }

    // Special logic to temporarily suppress the illumination layer when the darkness state changes
    if ( i.reset && (i.mesh.blendMode !== blending.illumination.blendMode) ) {
      i.suppressed = true;
      i.mesh.renderable = false;
    }
  }

  /* -------------------------------------------- */
  /*  Shader Management                           */
  /* -------------------------------------------- */

  /** @override */
  _updateColorationUniforms() {
    const shader = this.layers.coloration.shader;
    if ( !shader ) return;
    const u = shader.uniforms;
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

    u.useSampler = this.data.coloration > 0;  // Not needed for legacy coloration (technique id 0)

    // Flag uniforms as updated
    this.layers.coloration.reset = false;
  }

  /* -------------------------------------------- */

  /** @override */
  _updateIlluminationUniforms() {
    const shader = this.layers.illumination.shader;
    if ( !shader ) return;
    const c = canvas.colors;
    const u = shader.uniforms;
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

      // Creating base colors for darkness
      const iMid = Color.mix(c.background, c.darkness, 0.5);
      const mid = this.data.color
        ? Color.multiplyScalar(Color.multiply(this.data.color, iMid), colorIntensity * 2)
        : iMid;
      const black = this.data.color
        ? Color.multiplyScalar(Color.multiply(this.data.color, c.darkness), colorIntensity * 2)
        : c.darkness;

      if ( this.data.luminosity < -0.5 ) {
        lc = Math.abs(this.data.luminosity) - 0.5;
        cdim1 = black;
        cdim2 = Color.multiplyScalar(black, 0.625);
        cbr1 = Color.multiplyScalar(black, 0.5);
        cbr2 = Color.multiplyScalar(black, 0.125);
      }
      else {
        lc = Math.sqrt(Math.abs(this.data.luminosity) * 2); // Accelerating easing toward dark tone with sqrt
        cdim1 = mid;
        cdim2 = black;
        cbr1 = mid;
        cbr2 = Color.multiplyScalar(black, 0.5);
      }
      colorDim = Color.mix(cdim1, cdim2, lc);
      colorBright = Color.mix(cbr1, cbr2, lc);
      Color.applyRGB(getCorrectedColor(VisionMode.LIGHTING_LEVELS.HALFDARK, colorDim, colorBright), u.colorDim);
      Color.applyRGB(getCorrectedColor(VisionMode.LIGHTING_LEVELS.DARKNESS, colorDim, colorBright), u.colorBright);
    }

    // Light [0,1]
    else {
      const lum = this.data.luminosity;
      // Get the luminosity penalty for the bright color
      const lumPenalty = Math.clamped(lum * 2, 0, 1);
      // Attenuate darkness penalty applied to bright color according to light source luminosity level
      const correctedBright = Color.mix(c.bright, c.ambientBrightest, Math.clamped((lum * 2) - 1, 0, 1));
      // Assign colors and apply luminosity penalty on the bright channel
      colorBright = Color.maximize(Color.multiplyScalar(correctedBright, lumPenalty), c.background);
      // Recompute dim colors with the updated luminosity
      colorDim = Color.mix(c.background, colorBright, canvas.colorManager.weights.dim);
      Color.applyRGB(getCorrectedColor(VisionMode.LIGHTING_LEVELS.BRIGHT, colorDim, colorBright), u.colorBright);
      Color.applyRGB(getCorrectedColor(VisionMode.LIGHTING_LEVELS.DIM, colorDim, colorBright), u.colorDim);
    }

    c.background.applyRGB(u.colorBackground);
    u.useSampler = false;

    // Update shared uniforms
    this._updateCommonUniforms(shader);

    // Flag uniforms as updated
    const i = this.layers.illumination;
    i.reset = i.suppressed = false;
  }

  /* -------------------------------------------- */

  /** @override */
  _updateBackgroundUniforms() {
    const shader = this.layers.background.shader;
    if ( !shader ) return;
    const u = shader.uniforms;
    canvas.colors.background.applyRGB(u.colorBackground);
    u.backgroundAlpha = this.data.alpha;
    u.darknessLevel = canvas.colorManager.darknessLevel;
    u.useSampler = true;

    // Update shared uniforms
    this._updateCommonUniforms(shader);

    // Flag uniforms as updated
    this.layers.background.reset = false;
  }

  /* -------------------------------------------- */

  /**
   * Update shader uniforms shared by all shader types
   * @param {AdaptiveLightingShader} shader        The shader being updated
   * @protected
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
    if ( this.cachedAttenuation !== this.data.attenuation ) {
      this.computedAttenuation = (Math.cos(Math.PI * Math.pow(this.data.attenuation, 1.5)) - 1) / -2;
      this.cachedAttenuation = this.data.attenuation;
    }
    u.attenuation = this.computedAttenuation;
    u.depthElevation = canvas.primary.mapElevationToDepth(this.data.elevation);
    u.color = this.colorRGB ?? shader._defaults.color;

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
   * An animation with flickering ratio and light intensity.
   * @param {number} dt                       Delta time
   * @param {object} [options={}]             Additional options which modify the flame animation
   * @param {number} [options.speed=5]        The animation speed, from 1 to 10
   * @param {number} [options.intensity=5]    The animation intensity, from 1 to 10
   * @param {boolean} [options.reverse=false] Reverse the animation direction
   */
  animateTorch(dt, {speed=5, intensity=5, reverse=false} = {}) {
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
    this.animateTime(dt, {speed, intensity, reverse});

    // Create the noise object for the first frame
    const amplitude = amplification * 0.45;
    if ( !this._noise ) this._noise = new SmoothNoise({amplitude: amplitude, scale: 3, maxReferences: 2048});

    // Update amplitude
    if ( this._noise.amplitude !== amplitude ) this._noise.amplitude = amplitude;

    // Create noise from animation time. Range [0.0, 0.45]
    let n = this._noise.generate(this.animation.time);

    // Update brightnessPulse and ratio with some noise in it
    const co = this.layers.coloration.shader;
    const il = this.layers.illumination.shader;
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
    const co = this.layers.coloration.shader;
    co.uniforms.intensity = intensity;
    co.uniforms.time = this.animation.time;
    co.uniforms.pulse = wave(1.2, i, w);

    // Pulse illumination
    const il = this.layers.illumination.shader;
    il.uniforms.intensity = intensity;
    il.uniforms.time = this.animation.time;
    il.uniforms.ratio = wave(this.ratio, this.ratio * i, w);
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
      return this.shape.contains(x, y);
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
 */
class GlobalLightSource extends LightSource {

  /** @override */
  _createPolygon() {
    return canvas.dimensions.sceneRect.toPolygon();
  }

  /* -------------------------------------------- */

  /** @override */
  _configureSoftEdges() {
    this._flags.renderSoftEdges = false;
  }

  /* -------------------------------------------- */

  /** @override */
  _initialize(data) {
    super._initialize(data);
    // Force attenuation to 0
    this.data.attenuation = 0;
    // Inflate radius to avoid seeing the edges of the GlobalLight in huge maps without padding
    // TODO: replace with better handling of rectangular shapes and custom shader
    this.data.radius *= 1.2;
  }
}
