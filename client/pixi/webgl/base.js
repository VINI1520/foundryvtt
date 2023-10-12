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
     * A conventional pseudo-random number generator with the "golden" numbers, based on uv position
     * @type {string}
     */
    static PRNG = `
    float random(in vec2 uv) { 
      return fract(cos(dot(uv, vec2(12.9898, 4.1414))) * 43758.5453);
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
