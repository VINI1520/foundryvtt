/**
 * A mixin which decorates a PIXI.Filter or PIXI.Shader with common properties.
 * @category - Mixins
 * @param {typeof PIXI.Shader} ShaderClass   The parent ShaderClass class being mixed.
 * @returns {typeof BaseShaderMixin}         A Shader/Filter subclass mixed with BaseShaderMixin features.
 */
const BaseShaderMixin = ShaderClass => {
  class BaseShaderMixin extends ShaderClass {

    /**
     * Common attributes for vertex shaders.
     * @type {string}
     */
    static VERTEX_ATTRIBUTES = `
    attribute vec2 aVertexPosition;
    attribute float aDepthValue;
    `;

    /**
     * Common uniforms for vertex shaders.
     * @type {string}
     */
    static VERTEX_UNIFORMS = `
    uniform mat3 translationMatrix;
    uniform mat3 projectionMatrix;
    uniform float rotation;
    uniform float angle;
    uniform float radius;
    uniform float depthElevation;
    uniform vec2 screenDimensions;
    uniform vec2 resolution;
    uniform vec3 origin;
    uniform vec3 dimensions;
    `;

    /**
     * Common varyings shared by vertex and fragment shaders.
     * @type {string}
     */
    static VERTEX_FRAGMENT_VARYINGS = `
    varying vec2 vUvs;
    varying vec2 vSamplerUvs;
    varying float vDepth;
    `;

    /**
     * Common uniforms shared by fragment shaders.
     * @type {string}
     */
    static FRAGMENT_UNIFORMS = `
    uniform int technique;
    uniform bool useSampler;
    uniform bool darkness;
    uniform bool hasColor;
    uniform bool linkedToDarknessLevel;
    uniform float attenuation;
    uniform float contrast;
    uniform float shadows;
    uniform float exposure;
    uniform float saturation;
    uniform float intensity;
    uniform float brightness;
    uniform float luminosity;
    uniform float pulse;
    uniform float brightnessPulse;
    uniform float backgroundAlpha;
    uniform float illuminationAlpha;
    uniform float colorationAlpha;
    uniform float ratio;
    uniform float time;
    uniform float darknessLevel;
    uniform float darknessPenalty;
    uniform vec3 color;
    uniform vec3 colorBackground;
    uniform vec3 colorVision;
    uniform vec3 colorTint;
    uniform vec3 colorEffect;
    uniform vec3 colorDim;
    uniform vec3 colorBright;
    uniform vec3 ambientDaylight;
    uniform vec3 ambientDarkness;
    uniform vec3 ambientBrightest;
    uniform vec4 weights;
    uniform sampler2D primaryTexture;
    uniform sampler2D framebufferTexture;
    uniform sampler2D depthTexture;
    
    // Shared uniforms with vertex shader
    uniform ${PIXI.settings.PRECISION_VERTEX} float rotation;
    uniform ${PIXI.settings.PRECISION_VERTEX} float angle;
    uniform ${PIXI.settings.PRECISION_VERTEX} float radius;
    uniform ${PIXI.settings.PRECISION_VERTEX} float depthElevation;
    uniform ${PIXI.settings.PRECISION_VERTEX} vec2 resolution;
    uniform ${PIXI.settings.PRECISION_VERTEX} vec2 screenDimensions;
    uniform ${PIXI.settings.PRECISION_VERTEX} vec3 origin;
    uniform ${PIXI.settings.PRECISION_VERTEX} vec3 dimensions;
    uniform ${PIXI.settings.PRECISION_VERTEX} mat3 translationMatrix;
    uniform ${PIXI.settings.PRECISION_VERTEX} mat3 projectionMatrix;
    `;

    /**
     * Useful constant values computed at compile time
     * @type {string}
     */
    static CONSTANTS = `
    const float PI = 3.14159265359;
    const float TWOPI = 2.0 * PI;
    const float INVTWOPI = 1.0 / TWOPI;
    const float INVTHREE = 1.0 / 3.0;
    const vec2 PIVOT = vec2(0.5);
    const vec3 BT709 = vec3(0.2126, 0.7152, 0.0722);
    const vec4 ALLONES = vec4(1.0);
    `;

    /* -------------------------------------------- */

    /**
     * Fast approximate perceived brightness computation
     * Using Digital ITU BT.709 : Exact luminance factors
     * @type {string}
     */
    static PERCEIVED_BRIGHTNESS = `
    float perceivedBrightness(in vec3 color) {
      return sqrt( BT709.x * color.r * color.r +
                   BT709.y * color.g * color.g +
                   BT709.z * color.b * color.b );
    }
  
    float perceivedBrightness(in vec4 color) {
      return perceivedBrightness(color.rgb);
    }
    
    float reversePerceivedBrightness(in vec3 color) {
      return 1.0 - perceivedBrightness(color);
    }
  
    float reversePerceivedBrightness(in vec4 color) {
      return 1.0 - perceivedBrightness(color.rgb);
    }`;

    /* -------------------------------------------- */

    /**
     * Fractional Brownian Motion for a given number of octaves
     * @param {number} [octaves=4]
     * @param {number} [amp=1.0]
     * @returns {string}
     */
    static FBM(octaves = 4, amp = 1.0) {
      return `float fbm(in vec2 uv) {
        float total = 0.0, amp = ${amp.toFixed(1)};
        for (int i = 0; i < ${octaves}; i++) {
          total += noise(uv) * amp;
          uv += uv;
          amp *= 0.5;
        }
        return total;
      }`;
    }

    /* -------------------------------------------- */

    /**
     * High Quality Fractional Brownian Motion
     * @param {number} [octaves=3]
     * @returns {string}
     */
    static FBMHQ(octaves = 3) {
      return `float fbm(in vec2 uv, in float smoothness) {   
        float s = exp2(-smoothness);
        float f = 1.0;
        float a = 1.0;
        float t = 0.0;
        for( int i = 0; i < ${octaves}; i++ ) {
            t += a * noise(f * uv);
            f *= 2.0;
            a *= s;
        }
        return t;
      }`;
    }

    /* -------------------------------------------- */

    /**
     * Angular constraint working with coordinates on the range [-1, 1]
     * => coord: Coordinates
     * => angle: Angle in radians
     * => smoothness: Smoothness of the pie
     * => l: Length of the pie.
     * @type {string}
     */
    static PIE = `
    float pie(in vec2 coord, in float angle, in float smoothness, in float l) {   
      coord.x = abs(coord.x);
      vec2 va = vec2(sin(angle), cos(angle));
      float lg = length(coord) - l;
      float clg = length(coord - va * clamp(dot(coord, va) , 0.0, l));
      return smoothstep(0.0, smoothness, max(lg, clg * sign(va.y * coord.x - va.x * coord.y)));
    }`;

    /* -------------------------------------------- */

    /**
     * A conventional pseudo-random number generator with the "golden" numbers, based on uv position
     * @type {string}
     */
    static PRNG_LEGACY = `
    float random(in vec2 uv) { 
      return fract(cos(dot(uv, vec2(12.9898, 4.1414))) * 43758.5453);
    }`;

    /* -------------------------------------------- */

    /**
     * A pseudo-random number generator based on uv position which does not use cos/sin
     * This PRNG replaces the old PRNG_LEGACY to workaround some driver bugs
     * @type {string}
     */
    static PRNG = `
    float random(in vec2 uv) { 
      uv = mod(uv, 1000.0);
      return fract( dot(uv, vec2(5.23, 2.89) 
                        * fract((2.41 * uv.x + 2.27 * uv.y)
                                 * 251.19)) * 551.83);
    }`;

    /* -------------------------------------------- */

    /**
     * A Vec2 pseudo-random generator, based on uv position
     * @type {string}
     */
    static PRNG2D = `
    vec2 random(in vec2 uv) {
      vec2 uvf = fract(uv * vec2(0.1031, 0.1030));
      uvf += dot(uvf, uvf.yx + 19.19);
      return fract((uvf.x + uvf.y) * uvf);
    }`;

    /* -------------------------------------------- */

    /**
     * A Vec3 pseudo-random generator, based on uv position
     * @type {string}
     */
    static PRNG3D = `
    vec3 random(in vec3 uv) {
      return vec3(fract(cos(dot(uv, vec3(12.9898,  234.1418,    152.01))) * 43758.5453),
                  fract(sin(dot(uv, vec3(80.9898,  545.8937, 151515.12))) * 23411.1789),
                  fract(cos(dot(uv, vec3(01.9898, 1568.5439,    154.78))) * 31256.8817));
    }`;

    /* -------------------------------------------- */

    /**
     * A conventional noise generator
     * @type {string}
     */
    static NOISE = `
    float noise(in vec2 uv) {
      const vec2 d = vec2(0.0, 1.0);
      vec2 b = floor(uv);
      vec2 f = smoothstep(vec2(0.), vec2(1.0), fract(uv));
      return mix(
        mix(random(b), random(b + d.yx), f.x), 
        mix(random(b + d.xy), random(b + d.yy), f.x), 
        f.y
      );
    }`;

    /* -------------------------------------------- */

    /**
     * Convert a Hue-Saturation-Brightness color to RGB - useful to convert polar coordinates to RGB
     * @type {string}
     */
    static HSB2RGB = `
    vec3 hsb2rgb(in vec3 c) {
      vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0), 6.0)-3.0)-1.0, 0.0, 1.0 );
      rgb = rgb*rgb*(3.0-2.0*rgb);
      return c.z * mix(vec3(1.0), rgb, c.y);
    }`;

    /* -------------------------------------------- */

    /**
     * Declare a wave function in a shader -> wcos (default), wsin or wtan.
     * Wave on the [v1,v2] range with amplitude -> a and speed -> speed.
     * @param {string} [func="cos"]     the math function to use
     * @returns {string}
     */
    static WAVE(func="cos") {
      return `
      float w${func}(in float v1, in float v2, in float a, in float speed) {
        float w = ${func}( speed + a ) + 1.0;
        return (v1 - v2) * (w * 0.5) + v2;
      }`;
    }

    /* -------------------------------------------- */

    /**
     * Rotation function.
     * @type {string}
     */
    static ROTATION = `
    mat2 rot(in float a) {
      float s = sin(a);
      float c = cos(a);
      return mat2(c, -s, s, c);
    }
    `;

    /* -------------------------------------------- */

    /**
     * Voronoi noise function. Needs PRNG2D and CONSTANTS.
     * @see PRNG2D
     * @see CONSTANTS
     * @type {string}
     */
    static VORONOI = `
    vec3 voronoi(in vec2 uv, in float t, in float zd) {
      vec3 vor = vec3(0.0, 0.0, zd);
      vec2 uvi = floor(uv);
      vec2 uvf = fract(uv);
      for ( float j = -1.0; j <= 1.0; j++ ) {
        for ( float i = -1.0; i <= 1.0; i++ ) {
          vec2 uvn = vec2(i, j);
          vec2 uvr = 0.5 * sin(TWOPI * random(uvi + uvn) + t) + 0.5;
          uvr = 0.5 * sin(TWOPI * uvr + t) + 0.5;
          vec2 uvd = uvn + uvr - uvf;
          float dist = length(uvd);
          if ( dist < vor.z ) {
            vor.xy = uvr;
            vor.z = dist;
          }
        }
      }
      return vor;
    }
    
    vec3 voronoi(in vec2 vuv, in float zd)  { 
      return voronoi(vuv, 0.0, zd); 
    }

    vec3 voronoi(in vec3 vuv, in float zd)  { 
      return voronoi(vuv.xy, vuv.z, zd);
    }
    `;
  }
  return BaseShaderMixin;
};

/* -------------------------------------------- */

/**
 * A mixin wich decorates a shader or filter and construct a fragment shader according to a choosen channel.
 * @category - Mixins
 * @param {typeof PIXI.Shader|PIXI.Filter} ShaderClass The parent ShaderClass class being mixed.
 * @returns {typeof AdaptiveFragmentChannelMixin}      A Shader/Filter subclass mixed with AdaptiveFragmentChannelMixin.
 */
const AdaptiveFragmentChannelMixin = ShaderClass => {
  class AdaptiveFragmentChannelMixin extends ShaderClass {

    /**
     * The fragment shader which renders this filter.
     * A subclass of AdaptiveFragmentChannelMixin must implement the fragmentShader static field.
     * @type {Function}
     */
    static adaptiveFragmentShader = null;

    /**
     * A factory method for creating the filter using its defined default values
     * @param {object} [options]           Options which affect filter construction
     * @param {object} [options.uniforms]           Initial uniforms provided to the filter
     * @param {string} [options.channel=r]          A color channel to target for masking.
     * @returns {InverseOcclusionMaskFilter}
     */
    static create({channel="r", ...uniforms}={}) {
      uniforms = {...this.defaultUniforms, ...uniforms};
      this.fragmentShader = this.adaptiveFragmentShader(channel);
      return super.create(uniforms);
    }
  }
  return AdaptiveFragmentChannelMixin;
};

/* -------------------------------------------- */

/**
 * This class defines an interface which all shaders utilize
 * @extends {PIXI.Shader}
 * @property {object} uniforms      The current uniforms of the Shader
 * @interface
 */
class AbstractBaseShader extends BaseShaderMixin(PIXI.Shader) {
  constructor(program, uniforms) {
    super(program, foundry.utils.deepClone(uniforms));

    /**
     * The initial default values of shader uniforms
     * @type {object}
     */
    this._defaults = uniforms;
  }

  /* -------------------------------------------- */

  /**
   * The raw vertex shader used by this class.
   * A subclass of AbstractBaseShader must implement the vertexShader static field.
   * @type {string}
   */
  static vertexShader = "";

  /**
   * The raw fragment shader used by this class.
   * A subclass of AbstractBaseShader must implement the fragmentShader static field.
   * @type {string}
   */
  static fragmentShader = "";

  /**
   * The default uniform values for the shader.
   * A subclass of AbstractBaseShader must implement the defaultUniforms static field.
   * @type {object}
   */
  static defaultUniforms = {};

  /* -------------------------------------------- */

  /**
   * A factory method for creating the shader using its defined default values
   * @param {object} defaultUniforms
   * @returns {AbstractBaseShader}
   */
  static create(defaultUniforms) {
    const program = PIXI.Program.from(this.vertexShader, this.fragmentShader);
    const uniforms = mergeObject(this.defaultUniforms, defaultUniforms, {inplace: false, insertKeys: false});
    return new this(program, uniforms);
  }

  /* -------------------------------------------- */

  /**
   * Reset the shader uniforms back to their provided default values
   * @private
   */
  reset() {
    for (let [k, v] of Object.entries(this._defaults)) {
      this.uniforms[k] = v;
    }
  }
}

/* -------------------------------------------- */

/**
 * An abstract filter which provides a framework for reusable definition
 * @extends {PIXI.Filter}
 */
class AbstractBaseFilter extends BaseShaderMixin(PIXI.Filter) {
  /**
   * The default uniforms used by the filter
   * @type {object}
   */
  static defaultUniforms = {};

  /**
   * The fragment shader which renders this filter.
   * @type {string}
   */
  static fragmentShader = undefined;

  /**
   * The vertex shader which renders this filter.
   * @type {string}
   */
  static vertexShader = undefined;

  /**
   * A factory method for creating the filter using its defined default values.
   * @param {object} [uniforms]     Initial uniform values which override filter defaults
   * @returns {AbstractBaseFilter}      The constructed AbstractFilter instance.
   */
  static create(uniforms={}) {
    uniforms = { ...this.defaultUniforms, ...uniforms};
    return new this(this.vertexShader, this.fragmentShader, uniforms);
  }

  /**
   * Always target the resolution of the render texture or renderer
   * @type {number}
   */
  get resolution() {
    const renderer = canvas.app.renderer;
    const renderTextureSystem = renderer.renderTexture;
    if (renderTextureSystem.current) {
      return renderTextureSystem.current.resolution;
    }
    return renderer.resolution;
  }

  set resolution(value) {}

  /**
   * Always target the MSAA level of the render texture or renderer
   * @type {PIXI.MSAA_QUALITY}
   */
  get multisample() {
    const renderer = canvas.app.renderer;
    const renderTextureSystem = renderer.renderTexture;
    if (renderTextureSystem.current) {
      return renderTextureSystem.current.multisample;
    }
    return renderer.multisample;
  }

  set multisample(value) { }
}

/* ---------------------------------------- */

/**
 * The base sampler shader exposes a simple sprite shader and all the framework to handle:
 * - Batched shaders and plugin subscription
 * - And pre-rendering method
 * All othe sampler shaders (batched or not) should extend BaseSamplerShader
 */
class BaseSamplerShader extends AbstractBaseShader {
  constructor(...args) {
    super(...args);

    /**
     * The plugin name associated for this instance.
     * @type {string}
     */
    this.pluginName = this.constructor.classPluginName;
  }

  /**
   * The named batch sampler plugin that is used by this shader, or null if no batching is used.
   * @type {string}
   */
  static classPluginName = "batch";

  /**
   * Activate or deactivate this sampler. If set to false, the batch rendering is redirected to "batch".
   * Otherwise, the batch rendering is directed toward the instance pluginName (might be null)
   * @type {boolean}
   */
  get enabled() {
    return this.#enabled;
  }

  set enabled(enabled) {
    this.pluginName = enabled ? this.constructor.classPluginName : "batch";
    this.#enabled = enabled;
  }

  #enabled = true;

  /**
   * Contrast adjustment
   * @type {string}
   */
  static CONTRAST = `
    // Computing contrasted color
    if ( contrast != 0.0 ) {
      changedColor = (changedColor - 0.5) * (contrast + 1.0) + 0.5;
    }`;

  /**
   * Saturation adjustment
   * @type {string}
   */
  static SATURATION = `
    // Computing saturated color
    if ( saturation != 0.0 ) {
      vec3 grey = vec3(perceivedBrightness(changedColor));
      changedColor = mix(grey, changedColor, 1.0 + saturation);
    }`;

  /**
   * Exposure adjustment.
   * @type {string}
   */
  static EXPOSURE = `
    if ( exposure != 0.0 ) {
      changedColor *= (1.0 + exposure);
    }`;

  /**
   * The adjustments made into fragment shaders.
   * @type {string}
   */
  static get ADJUSTMENTS() {
    return `vec3 changedColor = baseColor.rgb;
      ${this.CONTRAST}
      ${this.SATURATION}
      ${this.EXPOSURE}
      baseColor.rgb = changedColor;`;
  }

  /** @inheritdoc */
  static vertexShader = `
    precision ${PIXI.settings.PRECISION_VERTEX} float;
    attribute vec2 aVertexPosition;
    attribute vec2 aTextureCoord;
    uniform mat3 projectionMatrix;
    varying vec2 vUvs;
  
    void main() {
      vUvs = aTextureCoord;
      gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    }`;

  /** @inheritdoc */
  static fragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    uniform sampler2D sampler;
    uniform vec4 tintAlpha;
    varying vec2 vUvs;
  
    void main() {
      gl_FragColor = texture2D(sampler, vUvs) * tintAlpha;
    }`;

  /**
   * Batch default vertex
   * @type {string}
   */
  static batchVertexShader = `
  precision ${PIXI.settings.PRECISION_VERTEX} float;
  attribute vec2 aVertexPosition;
  attribute vec2 aTextureCoord;
  attribute vec4 aColor;
  attribute float aTextureId;
  
  uniform mat3 projectionMatrix;
  uniform mat3 translationMatrix;
  uniform vec4 tint;
  
  varying vec2 vTextureCoord;
  varying vec4 vColor;
  varying float vTextureId;
  
  void main(void){
      gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
      vTextureCoord = aTextureCoord;
      vTextureId = aTextureId;
      vColor = aColor * tint;
  }`;

  /**
   * Batch default fragment
   * @type {string}
   */
  static batchFragmentShader = `
  precision ${PIXI.settings.PRECISION_FRAGMENT} float;
  varying vec2 vTextureCoord;
  varying vec4 vColor;
  varying float vTextureId;
  uniform sampler2D uSamplers[%count%];
  
  void main(void){
      vec4 color;
      %forloop%
      gl_FragColor = color * vColor;
  }`;

  /** @inheritdoc */
  static defaultUniforms = {
    tintAlpha: [1, 1, 1, 1],
    sampler: 0
  };

  /**
   * Batch geometry associated with this sampler.
   * @type {typeof PIXI.BatchGeometry}
   */
  static batchGeometry = PIXI.BatchGeometry;

  /**
   * The size of a vertice with all its packed attributes.
   * @type {number}
   */
  static batchVertexSize = 6;

  /**
   * Pack interleaved geometry custom function.
   * @type {Function|undefined}
   * @protected
   */
  static _packInterleavedGeometry;

  /**
   * A prerender function happening just before the batch renderer is flushed.
   * @type {Function}
   * @protected
   */
  static _preRenderBatch() {}

  /**
   * A function that returns default uniforms associated with the batched version of this sampler.
   * @abstract
   * @type {Function|undefined}
   */
  static batchDefaultUniforms;

  /**
   * The number of reserved texture units for this shader that cannot be used by the batch renderer.
   * @type {number}
   */
  static reservedTextureUnits = 0;

  /**
   * Initialize the batch geometry with custom properties.
   * @abstract
   */
  static initializeBatchGeometry() {}

  /**
   * The batch renderer to use.
   * @type {typeof BatchRenderer}
   */
  static batchRendererClass = BatchRenderer;

  /**
   * The batch generator to use.
   * @type {typeof BatchShaderGenerator}
   */
  static batchShaderGeneratorClass = BatchShaderGenerator;

  /* ---------------------------------------- */

  /**
   * Create a batch plugin for this sampler class.
   * @returns {typeof BatchPlugin}            The batch plugin class linked to this sampler class.
   */
  static createPlugin() {
    const {batchVertexShader, batchFragmentShader, batchGeometry, batchVertexSize,
      batchDefaultUniforms, batchShaderGeneratorClass, reservedTextureUnits} = this;
    const packGeometry = this._packInterleavedGeometry;
    const preRender = this._preRenderBatch;
    return class BatchPlugin extends this.batchRendererClass {
      constructor(renderer) {
        super(renderer);
        this.shaderGenerator =
          new batchShaderGeneratorClass(batchVertexShader, batchFragmentShader, batchDefaultUniforms);
        this.geometryClass = batchGeometry;
        this.vertexSize = batchVertexSize;
        this._packInterleavedGeometry = packGeometry?.bind(this);
        this._preRenderBatch = preRender.bind(this);
        this.reservedTextureUnits = reservedTextureUnits;
      }
    };
  }

  /* ---------------------------------------- */

  /**
   * Register the plugin for this sampler.
   */
  static registerPlugin() {
    const pluginName = this.classPluginName;

    // Checking the pluginName
    if ( !(pluginName && (typeof pluginName === "string") && (pluginName.length > 0)) ) {
      const msg = `Impossible to create a PIXI plugin for ${this.name}. `
        + `The plugin name is invalid: [pluginName=${pluginName}]. `
        + "The plugin name must be a string with at least 1 character.";
      throw new Error(msg);
    }

    // Checking for existing plugins
    if ( BatchRenderer.hasPlugin(pluginName) ) {
      const msg = `Impossible to create a PIXI plugin for ${this.name}. `
        + `The plugin name is already associated to a plugin in PIXI.Renderer: [pluginName=${pluginName}].`;
      throw new Error(msg);
    }

    // Initialize custom properties for the batch geometry
    this.initializeBatchGeometry();

    // Create our custom batch renderer for this geometry
    const plugin = this.createPlugin();

    // Register this plugin with its batch renderer
    PIXI.extensions.add({
      name: pluginName,
      type: PIXI.ExtensionType.RendererPlugin,
      ref: plugin
    });
  }

  /* ---------------------------------------- */

  /**
   * Perform operations which are required before binding the Shader to the Renderer.
   * @param {SpriteMesh} mesh      The mesh linked to this shader.
   * @internal
   */
  _preRender(mesh) {
    this.uniforms.tintAlpha = mesh._cachedTint;
  }
}
