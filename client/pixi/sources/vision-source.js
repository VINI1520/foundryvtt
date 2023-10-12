/**
 * @typedef {RenderedPointSourceData}     VisionSourceData
 * @property {number} contrast            The amount of contrast
 * @property {number} attenuation         Strength of the attenuation between bright, dim, and dark
 * @property {number} saturation          The amount of color saturation
 * @property {number} brightness          The vision brightness.
 * @property {string} visionMode          The vision mode.
 * @property {boolean} blinded            Is this vision source blinded?
 */

/**
 * A specialized subclass of the PointSource abstraction which is used to control the rendering of vision sources.
 * @property {VisionSourceData} data
 */
class VisionSource extends RenderedPointSource {

  /** @inheritdoc */
  static sourceType = "sight";

  /** @override */
  static _initializeShaderKeys = ["visionMode", "blinded"];

  /** @override */
  static _refreshUniformsKeys = ["radius", "color", "attenuation", "brightness", "contrast", "saturation", "visionMode"];

  /** @inheritdoc */
  static EDGE_OFFSET = -2;

  /* -------------------------------------------- */
  /*  Vision Source Attributes                    */
  /* -------------------------------------------- */

  /**
   * The object of data which configures how the source is rendered
   * @type {VisionSourceData}
   */
  data = this.data;

  /**
   * The vision mode linked to this VisionSource
   * @type {VisionMode|null}
   */
  visionMode = null;

  /**
   * The vision mode activation flag for handlers
   * @type {boolean}
   * @internal
   */
  _visionModeActivated = false;

  /**
   * The unconstrained LOS polygon.
   * @type {PointSourcePolygon}
   */
  los;

  /* -------------------------------------------- */
  /*  Vision Source Attributes                    */
  /* -------------------------------------------- */

  /**
   * An alias for the shape of the vision source.
   * @type {PointSourcePolygon|PIXI.Polygon}
   */
  get fov() {
    return this.shape;
  }

  /* -------------------------------------------- */

  /**
   * If this vision source background is rendered into the lighting container.
   * @type {boolean}
   */
  get preferred() {
    return this.visionMode?.vision.preferred;
  }

  /* -------------------------------------------- */

  /** @override */
  get isAnimated() {
    return super.isAnimated && this.visionMode.animated;
  }

  /* -------------------------------------------- */
  /*  Vision Source Initialization                */
  /* -------------------------------------------- */

  /** @override */
  _initialize(data) {
    super._initialize(data);
    this.data.contrast = data.contrast ?? 0;
    this.data.attenuation = data.attenuation ?? 0.5;
    this.data.saturation = data.saturation ?? 0;
    this.data.brightness = data.brightness ?? 0;
    this.data.visionMode = data.visionMode ?? "basic";
    this.data.blinded = data.blinded ?? false;
  }

  /* -------------------------------------------- */

  /** @override */
  _configure(changes) {
    this.los = this.shape;

    // Determine the active VisionMode
    this._initializeVisionMode();
    if ( !(this.visionMode instanceof VisionMode) ) {
      throw new Error("The VisionSource was not provided a valid VisionMode identifier");
    }

    // Configure animation, if any
    this.animation = {
      animation: this.visionMode.animate,
      seed: this.data.seed ?? this.animation.seed ?? Math.floor(Math.random() * 100000)
    };

    // Compute the constrained vision polygon
    this.shape = this._createRestrictedPolygon();

    // Parent class configuration
    return super._configure(changes);
  }

  /* -------------------------------------------- */

  /** @override */
  _configureLayer(layer, layerId) {
    const vmUniforms = this.visionMode.vision[layerId].uniforms;
    layer.vmUniforms = Object.entries(vmUniforms);
  }

  /* -------------------------------------------- */

  /**
   * Responsible for assigning the Vision Mode and handling exceptions based on vision special status.
   * @protected
   */
  _initializeVisionMode() {
    const blinded = this.data.blinded;
    const previousVM = this.visionMode;
    const visionMode = this.data.visionMode in CONFIG.Canvas.visionModes ? this.data.visionMode : "basic";
    this.visionMode = blinded ? CONFIG.Canvas.visionModes.blindness : CONFIG.Canvas.visionModes[visionMode];
    const deactivateHandler = ((previousVM?.id !== this.visionMode.id) && previousVM);

    // Call specific configuration for handling the blinded condition
    if ( blinded ) {
      this.data.radius = this.data.externalRadius;
      this._configureColorAttributes(null);
      foundry.utils.mergeObject(this.data, this.visionMode.vision.defaults);
    }

    // Process deactivation and activation handlers
    if ( deactivateHandler ) previousVM.deactivate(this);
    this.visionMode.activate(this);
  }

  /* -------------------------------------------- */

  /** @override */
  _getPolygonConfiguration() {
    return Object.assign(super._getPolygonConfiguration(), {
      radius: canvas.dimensions.maxR,
      useThreshold: true
    });
  }

  /* -------------------------------------------- */

  /**
   * Create a restricted FOV polygon by limiting the radius of the unrestricted LOS polygon.
   * @returns {PointSourcePolygon}
   * @protected
   */
  _createRestrictedPolygon() {
    const origin = {x: this.data.x, y: this.data.y};
    const radius = this.data.radius || this.data.externalRadius;
    const circle = new PIXI.Circle(origin.x, origin.y, radius);
    const density = PIXI.Circle.approximateVertexDensity(radius);
    return this.los.applyConstraint(circle, {density, scalingFactor: 100});
  }

  /* -------------------------------------------- */
  /*  Shader Management                           */
  /* -------------------------------------------- */

  /** @override */
  _configureShaders() {
    const vm = this.visionMode.vision;
    return {
      background: vm.background.shader || BackgroundVisionShader,
      coloration: vm.coloration.shader || ColorationVisionShader,
      illumination: vm.illumination.shader || IlluminationVisionShader
    };
  }

  /* -------------------------------------------- */

  /**
   * Update shader uniforms by providing data from this VisionSource.
   * @protected
   */
  _updateColorationUniforms() {
    const shader = this.layers.coloration.shader;
    if ( !shader ) return;
    const u = shader.uniforms;
    const d = shader._defaults;
    u.colorEffect = this.colorRGB ?? d.colorEffect;
    u.useSampler = true;
    this._updateCommonUniforms(shader);
    const vmUniforms = this.layers.coloration.vmUniforms;
    if ( vmUniforms.length ) this._updateVisionModeUniforms(shader, vmUniforms);
  }

  /* -------------------------------------------- */

  /**
   * Update shader uniforms by providing data from this VisionSource.
   * @protected
   */
  _updateIlluminationUniforms() {
    const shader = this.layers.illumination.shader;
    if ( !shader ) return;
    const u = shader.uniforms;
    const colorBright = Color.maximize(canvas.colors.bright, canvas.colors.background);
    const colorDim = canvas.colors.dim;
    const colorBackground = canvas.colors.background;

    // Modify and assign vision color according to brightness.
    // (brightness 0.5 = dim color, brightness 1.0 = bright color)
    if ( this.data.brightness <= 0 ) {
      Color.applyRGB(Color.mix(colorBackground, colorDim, this.data.brightness + 1), u.colorVision);
    }
    else Color.applyRGB(Color.mix(colorDim, colorBright, this.data.brightness), u.colorVision);

    u.useSampler = false; // We don't need to use the background sampler into vision illumination
    this._updateCommonUniforms(shader);
    const vmUniforms = this.layers.illumination.vmUniforms;
    if ( vmUniforms.length ) this._updateVisionModeUniforms(shader, vmUniforms);
  }

  /* -------------------------------------------- */

  /**
   * Update shader uniforms by providing data from this PointSource
   * @private
   */
  _updateBackgroundUniforms() {
    const shader = this.layers.background.shader;
    if ( !shader ) return;
    const u = shader.uniforms;
    u.technique = 0;
    u.contrast = this.data.contrast;
    u.useSampler = true;
    this._updateCommonUniforms(shader);
    const vmUniforms = this.layers.background.vmUniforms;
    if ( vmUniforms.length ) this._updateVisionModeUniforms(shader, vmUniforms);
  }

  /* -------------------------------------------- */

  /**
   * Update shader uniforms shared by all shader types
   * @param {AdaptiveVisionShader} shader        The shader being updated
   * @private
   */
  _updateCommonUniforms(shader) {
    const u = shader.uniforms;
    const d = shader._defaults;
    u.attenuation = Math.max(this.data.attenuation, 0.0125);
    u.saturation = this.data.saturation;
    u.screenDimensions = canvas.screenDimensions;
    u.colorTint = this.colorRGB ?? d.colorTint;
    canvas.colors.background.applyRGB(u.colorBackground);
    u.brightness = (this.data.brightness + 1) / 2;
    u.darknessLevel = canvas.colorManager.darknessLevel;
    u.linkedToDarknessLevel = this.visionMode.vision.darkness.adaptive;
    u.depthElevation = canvas.primary.mapElevationToDepth(this.data.elevation);
    if ( !u.depthTexture ) u.depthTexture = canvas.masks.depth.renderTexture;
    if ( !u.primaryTexture ) u.primaryTexture = canvas.primary.renderTexture;
  }

  /* -------------------------------------------- */

  /**
   * Update layer uniforms according to vision mode uniforms, if any.
   * @param {AdaptiveVisionShader} shader        The shader being updated.
   * @param {Array} vmUniforms                   The targeted layer.
   * @private
   */
  _updateVisionModeUniforms(shader, vmUniforms) {
    const shaderUniforms = shader.uniforms;
    for ( const [uniform, value] of vmUniforms ) {
      if ( Array.isArray(value) ) {
        const u = (shaderUniforms[uniform] ??= []);
        for ( const i in value ) u[i] = value[i];
      }
      else shaderUniforms[uniform] = value;
    }
  }
}
