/**
 * This class defines an interface for masked custom filters
 * @interface
 */
class AbstractBaseMaskFilter extends AbstractBaseFilter {
  /**
   * The default vertex shader used by all instances of AbstractBaseMaskFilter
   * @type {string}
   */
  static vertexShader = `
  attribute vec2 aVertexPosition;

  uniform mat3 projectionMatrix;
  uniform vec2 screenDimensions;
  uniform vec4 inputSize;
  uniform vec4 outputFrame;

  varying vec2 vTextureCoord;
  varying vec2 vMaskTextureCoord;

  vec4 filterVertexPosition( void ) {
      vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;
      return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0., 1.);
  }

  // getting normalized coord for the tile texture
  vec2 filterTextureCoord( void ) {
      return aVertexPosition * (outputFrame.zw * inputSize.zw);
  }

  // getting normalized coord for a screen sized mask render texture
  vec2 filterMaskTextureCoord( in vec2 textureCoord ) {
    return (textureCoord * inputSize.xy + outputFrame.xy) / screenDimensions;
  }

  void main() {
    vTextureCoord = filterTextureCoord();
    vMaskTextureCoord = filterMaskTextureCoord(vTextureCoord);
    gl_Position = filterVertexPosition();
  }`;

  /** @override */
  apply(filterManager, input, output, clear, currentState) {
    this.uniforms.screenDimensions = canvas.screenDimensions;
    filterManager.applyFilter(this, input, output, clear);
  }
}

/* -------------------------------------------- */

/**
 * A filter used to control channels intensity using an externally provided mask texture.
 * The mask channel used must be provided at filter creation.
 */
class InverseOcclusionMaskFilter extends AdaptiveFragmentChannelMixin(AbstractBaseMaskFilter) {

  /** @override */
  static adaptiveFragmentShader(channel) {
    return `
    precision mediump float;
    varying vec2 vTextureCoord;
    varying vec2 vMaskTextureCoord;
    uniform sampler2D uSampler;
    uniform sampler2D uMaskSampler;
    uniform float alphaOcclusion;
    uniform float alpha;
    uniform float elevation;
    void main() {
      float tex = texture2D(uMaskSampler, vMaskTextureCoord).${channel};
      tex = 1.0 - step(tex, elevation);
      float mask = 1.0 - tex + alphaOcclusion * tex;
      float calpha = tex + alpha * (1.0 - tex);
      gl_FragColor = texture2D(uSampler, vTextureCoord) * mask * calpha;
    }`;
  }

  /** @override */
  static defaultUniforms = {
    uMaskSampler: null,
    alphaOcclusion: 0,
    alpha: 1,
    depthElevation: 0
  };
}

/* -------------------------------------------- */

/**
 * A filter used to apply a reverse mask on the target display object.
 * The caller must choose a channel to use (alpha is a good candidate).
 */
class ReverseMaskFilter extends AdaptiveFragmentChannelMixin(AbstractBaseMaskFilter) {
  /** @override */
  static adaptiveFragmentShader(channel) {
    return `
    precision mediump float;
    varying vec2 vTextureCoord;
    varying vec2 vMaskTextureCoord;
    uniform sampler2D uSampler;
    uniform sampler2D uMaskSampler;
    void main() {
      float mask = 1.0 - texture2D(uMaskSampler, vMaskTextureCoord).${channel};
      gl_FragColor = texture2D(uSampler, vTextureCoord) * mask;
    }`;
  }

  /** @override */
  static defaultUniforms = {
    uMaskSampler: null
  };
}

/* -------------------------------------------- */

/**
 * A minimalist filter (just used for blending)
 */
class VoidFilter extends AbstractBaseFilter {
  static fragmentShader = `
  varying vec2 vTextureCoord;
  uniform sampler2D uSampler;
  void main() {
    gl_FragColor = texture2D(uSampler, vTextureCoord);
  }`;
}

/* -------------------------------------------- */

/**
 * This filter handles masking and post-processing for visual effects.
 */
class VisualEffectsMaskingFilter extends AbstractBaseMaskFilter {
  constructor(vertex, fragment, uniforms, filterMode) {
    super(vertex, fragment, uniforms);
    this.filterMode = filterMode;
  }

  /** @override */
  static create({filterMode, postProcessModes, ...uniforms}={}) {
    const fragmentShader = this.fragmentShader(filterMode, postProcessModes);
    uniforms = {...this.defaultUniforms, ...uniforms};
    return new this(this.vertexShader, fragmentShader, uniforms, filterMode);
  }

  /**
   * Code to determine which post-processing effect is applied in this filter.
   * @type {string[]}
   */
  #postProcessModes;

  /**
   * The filter mode.
   * @type {string}
   */
  filterMode;

  /* -------------------------------------------- */

  /**
   * Update the filter shader with new post-process modes.
   * @param {string[]} [postProcessModes=[]]   New modes to apply.
   * @param {object} [uniforms={}]             Uniforms value to update.
   */
  updatePostprocessModes(postProcessModes=[], uniforms={}) {

    // Update shader uniforms
    for ( let [uniform, value] of Object.entries(uniforms) ) {
      if ( uniform in this.uniforms ) this.uniforms[uniform] = value;
    }

    // Update the shader program if post-processing modes have changed
    if ( postProcessModes.equals(this.#postProcessModes) ) return;
    this.#postProcessModes = postProcessModes;
    this.program = PIXI.Program.from(VisualEffectsMaskingFilter.vertexShader,
      VisualEffectsMaskingFilter.fragmentShader(this.filterMode, this.#postProcessModes));
  }

  /* -------------------------------------------- */

  /**
   * Remove all post-processing modes and reset some key uniforms.
   */
  reset() {
    this.#postProcessModes = [];
    this.program = PIXI.Program.from(VisualEffectsMaskingFilter.vertexShader,
      VisualEffectsMaskingFilter.fragmentShader(this.filterMode));
    const uniforms = ["tint", "exposure", "contrast", "saturation"];
    for ( const uniform of uniforms ) {
      this.uniforms[uniform] = VisualEffectsMaskingFilter.defaultUniforms[uniform];
    }
  }

  /* -------------------------------------------- */

  /**
   * Masking modes.
   * @enum {number}
   */
  static FILTER_MODES = {
    BACKGROUND: "background",
    ILLUMINATION: "illumination",
    COLORATION: "coloration"
  };

  /** @override */
  static defaultUniforms = {
    replacementColor: [0, 0, 0],
    tint: [1, 1, 1],
    screenDimensions: [1, 1],
    enableVisionMasking: true,
    uVisionSampler: null,
    exposure: 0,
    contrast: 0,
    saturation: 0
  };

  /**
   * Filter post-process techniques.
   * @enum {{id: string, glsl: string}}
   */
  static POST_PROCESS_TECHNIQUES = {
    EXPOSURE: {
      id: "EXPOSURE",
      glsl: `if ( exposure != 0.0 ) {
        finalColor.rgb *= (1.0 + exposure);
      }`
    },
    CONTRAST: {
      id: "CONTRAST",
      glsl: `if ( contrast != 0.0 ) {
        finalColor.rgb = (finalColor.rgb - 0.5) * (contrast + 1.0) + 0.5;
      }`
    },
    SATURATION: {
      id: "SATURATION",
      glsl: `if ( saturation != 0.0 ) {
        float reflection = perceivedBrightness(finalColor.rgb);
        finalColor.rgb = mix(vec3(reflection), finalColor.rgb, 1.0 + saturation) * finalColor.a;
      }`
    }
  };

  /**
   * Assign the replacement color according to the filter mode.
   * @param {number} filterMode    Filter mode.
   * @returns {string}             The replacement color.
   */
  static replacementColor(filterMode) {
    switch (filterMode) {
      case VisualEffectsMaskingFilter.FILTER_MODES.BACKGROUND:
        return "vec4 repColor = vec4(0.0);";
      default:
        return "vec4 repColor = vec4(replacementColor, 1.0);";
    }
  }

  /**
   * Memory allocations and headers for the VisualEffectsMaskingFilter
   * @param {number} filterMode          Filter mode.
   * @returns {string}                   The filter header according to the filter mode.
   */
  static fragmentHeader(filterMode) {
    return `
    varying vec2 vTextureCoord;
    varying vec2 vMaskTextureCoord;
    uniform float contrast;
    uniform float saturation;
    uniform float exposure;
    uniform vec3 replacementColor;
    uniform vec3 tint;
    uniform sampler2D uSampler;
    uniform sampler2D uVisionSampler;
    uniform bool enableVisionMasking;
    vec4 baseColor;
    vec4 finalColor;
    ${this.replacementColor(filterMode)}
    ${this.CONSTANTS}
    ${this.PERCEIVED_BRIGHTNESS}
    `;
  }

  /**
   * The fragment core code.
   * @type {string}
   */
  static fragmentCore = `
    // Get the base color from the filter sampler
    finalColor = texture2D(uSampler, vTextureCoord);
    
    // Handling vision masking  
    if ( enableVisionMasking ) {
      finalColor = mix( repColor, 
                        finalColor, 
                        texture2D(uVisionSampler, vMaskTextureCoord).r);
    }
    `;

  /**
   * Construct filter post-processing code according to provided value.
   * @param {string[]} postProcessModes  Post-process modes to construct techniques.
   * @returns {string}                   The constructed shader code for post-process techniques.
   */
  static fragmentPostProcess(postProcessModes=[]) {
    return postProcessModes.reduce((s, t) => s + this.POST_PROCESS_TECHNIQUES[t].glsl ?? "", "");
  }

  /**
   * Specify the fragment shader to use according to mode
   * @param {number} filterMode
   * @param {string[]} postProcessModes
   * @returns {string}
   * @override
   */
  static fragmentShader(filterMode=this.FILTER_MODES.BACKGROUND, postProcessModes=[]) {
    return `
    ${this.fragmentHeader(filterMode)}
    void main() {
      ${this.fragmentCore}
      ${this.fragmentPostProcess(postProcessModes)}
      if ( enableVisionMasking ) finalColor *= vec4(tint, 1.0);
      gl_FragColor = finalColor;
    }
    `;
  }
}

/* -------------------------------------------- */

/**
 * Apply visibility coloration according to the baseLine color.
 * Uses very lightweight gaussian vertical and horizontal blur filter passes.
 * @extends {AbstractBaseFilter}
 */
class VisibilityFilter extends AbstractBaseMaskFilter {
  constructor(...args) {
    super(...args);

    // Handling inner blur filters configuration
    const b = canvas.blur;
    if ( b.enabled ) {
      const resolution = PIXI.Filter.defaultResolution;
      this.#blurXFilter = new b.blurPassClass(true, b.strength, b.passes, resolution, b.kernels);
      this.#blurYFilter = new b.blurPassClass(false, b.strength, b.passes, resolution, b.kernels);
    }

    // Handling fog overlay texture matrix
    this.#overlayTex = this.uniforms.overlayTexture;
    if ( this.#overlayTex && !this.#overlayTex.uvMatrix ) {
      this.#overlayTex.uvMatrix = new PIXI.TextureMatrix(this.#overlayTex.uvMatrix, 0.0);
    }
  }

  /**
   * Horizontal inner blur filter
   * @type {AlphaBlurFilterPass}
   */
  #blurXFilter;

  /**
   * Vertical inner blur filter
   * @type {AlphaBlurFilterPass}
   */
  #blurYFilter;

  /**
   * Optional fog overlay texture
   * @type {PIXI.Texture|undefined}
   */
  #overlayTex;

  /** @override */
  static defaultUniforms = {
    exploredColor: [1, 1, 1],
    unexploredColor: [0, 0, 0],
    screenDimensions: [1, 1],
    visionTexture: null,
    primaryTexture: null,
    overlayTexture: null,
    overlayMatrix: new PIXI.Matrix(),
    hasOverlayTexture: false
  };

  /** @override */
  static create(uniforms={}, options={}) {
    uniforms = { ...this.defaultUniforms, ...uniforms};
    return new this(this.vertexShader, this.fragmentShader(options), uniforms);
  }

  static vertexShader = `
  attribute vec2 aVertexPosition;
  uniform mat3 projectionMatrix;
  uniform mat3 overlayMatrix;
  varying vec2 vTextureCoord;
  varying vec2 vMaskTextureCoord;
  varying vec2 vOverlayCoord;
  varying vec2 vOverlayTilingCoord;
  uniform vec4 inputSize;
  uniform vec4 outputFrame;
  uniform vec4 dimensions;
  uniform vec2 screenDimensions;
  uniform bool hasOverlayTexture;

  vec4 filterVertexPosition( void ) {
    vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;
    return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
  }

  vec2 filterTextureCoord( void ) {
    return aVertexPosition * (outputFrame.zw * inputSize.zw);
  }
  
  vec2 overlayTilingTextureCoord( void ) {
    if ( hasOverlayTexture ) return vOverlayCoord * (dimensions.xy / dimensions.zw);
    return vOverlayCoord;
  }
  
  // getting normalized coord for a screen sized mask render texture
  vec2 filterMaskTextureCoord( in vec2 textureCoord ) {
    return (textureCoord * inputSize.xy + outputFrame.xy) / screenDimensions;
  }

  void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
    vMaskTextureCoord = filterMaskTextureCoord(vTextureCoord);
    vOverlayCoord = (overlayMatrix * vec3(vTextureCoord, 1.0)).xy;
    vOverlayTilingCoord = overlayTilingTextureCoord();
  }`;

  /** @override */
  static fragmentShader(options) { return `
    varying vec2 vTextureCoord;
    varying vec2 vMaskTextureCoord;
    varying vec2 vOverlayCoord;
    varying vec2 vOverlayTilingCoord;
    uniform sampler2D uSampler;
    uniform sampler2D primaryTexture;
    uniform sampler2D overlayTexture;
    uniform vec3 unexploredColor;
    uniform vec3 backgroundColor;
    uniform bool hasOverlayTexture;
    ${options.persistentVision ? `` 
    : `uniform sampler2D visionTexture;
     uniform vec3 exploredColor;`}
    ${this.CONSTANTS}
    ${this.PERCEIVED_BRIGHTNESS}
    
    // To check if we are out of the bound
    float getClip(in vec2 uv) {
      return step(3.5,
         step(0.0, uv.x) +
         step(0.0, uv.y) +
         step(uv.x, 1.0) +
         step(uv.y, 1.0));
    }
    
    // Unpremultiply fog texture
    vec4 unPremultiply(in vec4 pix) {
      if ( !hasOverlayTexture || (pix.a == 0.0) ) return pix;
      return vec4(pix.rgb / pix.a, pix.a);
    }
  
    void main() {
      float r = texture2D(uSampler, vTextureCoord).r;               // Revealed red channel from the filter texture
      ${options.persistentVision ? `` : `float v = texture2D(visionTexture, vMaskTextureCoord).r;`} // Vision red channel from the vision cached container
      vec4 baseColor = texture2D(primaryTexture, vMaskTextureCoord);// Primary cached container renderTexture color
      vec4 fogColor = hasOverlayTexture 
                      ? texture2D(overlayTexture, vOverlayTilingCoord) * getClip(vOverlayCoord)
                      : baseColor;      
      fogColor = unPremultiply(fogColor);
      
      // Compute fog exploration colors
      ${!options.persistentVision
      ? `float reflec = perceivedBrightness(baseColor.rgb);
      vec4 explored = vec4(min((exploredColor * reflec) + (baseColor.rgb * exploredColor), vec3(1.0)), 0.5);`
      : ``}
      vec4 unexplored = hasOverlayTexture
                        ? mix(vec4(unexploredColor, 1.0), vec4(fogColor.rgb * backgroundColor, 1.0), fogColor.a)
                        : vec4(unexploredColor, 1.0);
  
      // Mixing components to produce fog of war
      ${options.persistentVision
      ? `gl_FragColor = mix(unexplored, vec4(0.0), r);`
      : `vec4 fow = mix(unexplored, explored, max(r,v));
       gl_FragColor = mix(fow, vec4(0.0), v);`}
      
      // Output the result
      gl_FragColor.rgb *= gl_FragColor.a;
    }`
  }

  /**
   * Set the blur strength
   * @param {number} value    blur strength
   */
  set blur(value) {
    if ( this.#blurXFilter ) this.#blurXFilter.blur = this.#blurYFilter.blur = value;
  }

  get blur() {
    return this.#blurYFilter?.blur;
  }

  /** @override */
  apply(filterManager, input, output, clear) {
    this.calculateMatrix(filterManager);
    if ( canvas.blur.enabled ) {
      // Get temporary filter textures
      const firstRenderTarget = filterManager.getFilterTexture();
      // Apply inner filters
      this.state.blend = false;
      this.#blurXFilter.apply(filterManager, input, firstRenderTarget, PIXI.CLEAR_MODES.NONE);
      this.#blurYFilter.apply(filterManager, firstRenderTarget, input, PIXI.CLEAR_MODES.NONE);
      this.state.blend = true;
      // Inform PIXI that temporary filter textures are not more necessary
      filterManager.returnFilterTexture(firstRenderTarget);
    }
    // Apply visibility
    super.apply(filterManager, input, output, clear);
  }

  /**
   * Calculate the fog overlay sprite matrix.
   * @param {PIXI.FilterManager} filterManager
   */
  calculateMatrix(filterManager) {
    if ( !this.uniforms.hasOverlayTexture ) return;
    this.#overlayTex.uvMatrix.update();
    this.uniforms.overlayMatrix =
      filterManager.calculateSpriteMatrix(this.uniforms.overlayMatrix, canvas.effects.visibility.visibilityOverlay)
        .prepend(this.#overlayTex.uvMatrix.mapCoord);
  }
}

/* -------------------------------------------- */

/**
 * A filter which forces all non-transparent pixels to a specific color and transparency.
 * @extends {AbstractBaseFilter}
 */
class ForceColorFilter extends AbstractBaseFilter {
  static defaultUniforms = {
    color: [1, 1, 1],
    alpha: 1.0
  };

  static fragmentShader = `
  varying vec2 vTextureCoord;
  uniform sampler2D uSampler;
  uniform vec3 color;
  uniform float alpha;
  
  void main() {
    vec4 tex = texture2D(uSampler, vTextureCoord);
    if ( tex.a > 0.0 ) gl_FragColor = vec4(color * alpha, 1.0);
    else gl_FragColor = vec4(0.0);
  }`;
}

/* -------------------------------------------- */

/**
 * This filter turns pixels with an alpha channel < alphaThreshold in transparent pixels
 * Then, optionally, it can turn the result in the chosen color (default: pure white).
 * The alpha [threshold,1] is re-mapped to [0,1] with an hermite interpolation slope to prevent pixelation.
 * @extends {PIXI.Filter}
 */
class RoofMaskFilter extends AbstractBaseFilter {
  static defaultUniforms = {
    alphaThreshold: 0.75,
    turnToColor: false,
    color: [1, 1, 1]
  };

  static fragmentShader = `
  precision mediump float;
  varying vec2 vTextureCoord;
  uniform sampler2D uSampler;
  uniform float alphaThreshold;
  uniform bool turnToColor;
  uniform vec3 color;

  void main(void) {
    vec4 tex = texture2D(uSampler, vTextureCoord);
    float zapper = smoothstep(alphaThreshold, 1.0, tex.a);
    if (turnToColor) tex = vec4(color, 1.0);
    gl_FragColor = tex * zapper;
  }`;
}

/* -------------------------------------------- */

/**
 * A filter which implements an inner or outer glow around the source texture.
 * Inspired from https://github.com/pixijs/filters/tree/main/filters/glow
 * @license MIT
 */
class GlowOverlayFilter extends AbstractBaseFilter {

  /** @override */
  padding = 6;

  /**
   * The inner strength of the glow.
   * @type {number}
   */
  innerStrength = 3;

  /**
   * The outer strength of the glow.
   * @type {number}
   */
  outerStrength = 3;

  /**
   * Should this filter auto-animate?
   * @type {number}
   */
  animated = true;

  /** @inheritdoc */
  static defaultUniforms = {
    distance: 10,
    glowColor: [1, 1, 1, 1],
    quality: 0.1,
    time: 0,
    knockout: true,
    alpha: 1
  };

  /** @inheritdoc */
  static createFragmentShader(quality, distance) {
    return `
    precision mediump float;
    varying vec2 vTextureCoord;
    varying vec4 vColor;
  
    uniform sampler2D uSampler;
    uniform float innerStrength;
    uniform float outerStrength;
    uniform float alpha;
    uniform vec4 glowColor;
    uniform vec4 inputSize;
    uniform vec4 inputClamp;
    uniform bool knockout;
  
    const float PI = 3.14159265358979323846264;
    const float DIST = ${distance.toFixed(0)}.0;
    const float ANGLE_STEP_SIZE = min(${(1 / quality / distance).toFixed(7)}, PI * 2.0);
    const float ANGLE_STEP_NUM = ceil(PI * 2.0 / ANGLE_STEP_SIZE);
    const float MAX_TOTAL_ALPHA = ANGLE_STEP_NUM * DIST * (DIST + 1.0) / 2.0;
  
    float getClip(in vec2 uv) {
      return step(3.5,
       step(inputClamp.x, uv.x) +
       step(inputClamp.y, uv.y) +
       step(uv.x, inputClamp.z) +
       step(uv.y, inputClamp.w));
    }
  
    void main(void) {
      vec2 px = inputSize.zw;
      float totalAlpha = 0.0;
      vec2 direction;
      vec2 displaced;
      vec4 curColor;
  
      for (float angle = 0.0; angle < PI * 2.0; angle += ANGLE_STEP_SIZE) {
       direction = vec2(cos(angle), sin(angle)) * px;
       for (float curDistance = 0.0; curDistance < DIST; curDistance++) {
         displaced = vTextureCoord + direction * (curDistance + 1.0);
         curColor = texture2D(uSampler, displaced) * getClip(displaced);
         totalAlpha += (DIST - curDistance) * (smoothstep(0.5, 1.0, curColor.a));
       }
      }
  
      curColor = texture2D(uSampler, vTextureCoord);
      float alphaRatio = (totalAlpha / MAX_TOTAL_ALPHA);
      
      float innerGlowAlpha = (1.0 - alphaRatio) * innerStrength * smoothstep(0.6, 1.0, curColor.a);
      float innerGlowStrength = min(1.0, innerGlowAlpha);
      
      vec4 innerColor = mix(curColor, glowColor, innerGlowStrength);

      float outerGlowAlpha = alphaRatio * outerStrength * (1.0 - smoothstep(0.35, 1.0, curColor.a));
      float outerGlowStrength = min(1.0 - innerColor.a, outerGlowAlpha);
      vec4 outerGlowColor = outerGlowStrength * glowColor.rgba;
      
      if ( knockout ) {
        float resultAlpha = outerGlowAlpha + innerGlowAlpha;
        gl_FragColor = mix(vec4(glowColor.rgb * resultAlpha, resultAlpha), vec4(0.0), curColor.a);
      }
      else {
        vec4 outerGlowColor = outerGlowStrength * glowColor.rgba * alpha;
        gl_FragColor = innerColor + outerGlowColor;
      }
    }`;
  }

  /** @inheritdoc */
  static vertexShader = `
  precision mediump float;
  attribute vec2 aVertexPosition;
  uniform mat3 projectionMatrix;
  uniform vec4 inputSize;
  uniform vec4 outputFrame;
  varying vec2 vTextureCoord;

  void main(void) {
      vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy;
      gl_Position = vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
      vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
  }`;

  /** @inheritdoc */
  static create(uniforms = {}) {
    uniforms = {...this.defaultUniforms, ...uniforms};
    const fragmentShader = this.createFragmentShader(uniforms.quality, uniforms.distance);
    return new this(this.vertexShader, fragmentShader, uniforms);
  }

  /* -------------------------------------------- */

  /** @override */
  apply(filterManager, input, output, clear) {
    const z = canvas.stage.worldTransform.d;
    if ( !canvas.photosensitiveMode && this.animated ) {
      const t = canvas.app.ticker.lastTime;
      this.uniforms.outerStrength = Math.oscillation(this.outerStrength * 0.5, this.outerStrength * 2.0, t, 2000) * z;
      this.uniforms.innerStrength = Math.oscillation(this.innerStrength * 0.5, this.innerStrength * 2.0, t, 2000) * z;
    }
    else {
      this.uniforms.outerStrength = this.outerStrength * z;
      this.uniforms.innerStrength = this.innerStrength * z;
    }
    filterManager.applyFilter(this, input, output, clear);
  }
}

/* -------------------------------------------- */

/**
 * A filter which implements an outline.
 * Inspired from https://github.com/pixijs/filters/tree/main/filters/outline
 * @license MIT
 */
class OutlineOverlayFilter extends AbstractBaseFilter {
  /** @override */
  padding = 3;

  /** @override */
  autoFit = false;

  /**
   * If the filter is animated or not.
   * @type {boolean}
   */
  animate = true;

  /** @inheritdoc */
  static defaultUniforms = {
    outlineColor: [1, 1, 1, 1],
    thickness: [1, 1],
    alphaThreshold: 0.60,
    knockout: true,
    wave: false
  };

  static vertexShader = `
  attribute vec2 aVertexPosition;

  uniform mat3 projectionMatrix;
  uniform vec2 screenDimensions;
  uniform vec4 inputSize;
  uniform vec4 outputFrame;

  varying vec2 vTextureCoord;
  varying vec2 vFilterCoord;

  vec4 filterVertexPosition( void ) {
      vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;
      return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0., 1.);
  }

  // getting normalized coord for the tile texture
  vec2 filterTextureCoord( void ) {
      return aVertexPosition * (outputFrame.zw * inputSize.zw);
  }

  // getting normalized coord for a screen sized mask render texture
  vec2 filterCoord( in vec2 textureCoord ) {
    return textureCoord * inputSize.xy / outputFrame.zw;
  }

  void main() {
    vTextureCoord = filterTextureCoord();
    vFilterCoord = filterCoord(vTextureCoord);
    gl_Position = filterVertexPosition();
  }`;

  /** @inheritdoc */
  static createFragmentShader() {
    return `
    varying vec2 vTextureCoord;
    varying vec2 vFilterCoord;
    uniform sampler2D uSampler;
    
    uniform vec2 thickness;
    uniform vec4 outlineColor;
    uniform vec4 filterClamp;
    uniform float alphaThreshold;
    uniform float time;
    uniform bool knockout;
    uniform bool wave;
    
    ${this.CONSTANTS}
    ${this.WAVE()}
    
    void main(void) {
        float dist = distance(vFilterCoord, vec2(0.5)) * 2.0;
        vec4 ownColor = texture2D(uSampler, vTextureCoord);
        vec4 wColor = wave ? outlineColor * 
                             wcos(0.0, 1.0, dist * 75.0, 
                                  -time * 0.01 + 3.0 * dot(vec4(1.0), ownColor)) 
                             * 0.33 * (1.0 - dist) : vec4(0.0);
        float texAlpha = smoothstep(alphaThreshold, 1.0, ownColor.a);
        vec4 curColor;
        float maxAlpha = 0.;
        vec2 displaced;
        for ( float angle = 0.0; angle <= TWOPI; angle += ${this.#quality.toFixed(7)} ) {
            displaced.x = vTextureCoord.x + thickness.x * cos(angle);
            displaced.y = vTextureCoord.y + thickness.y * sin(angle);
            curColor = texture2D(uSampler, clamp(displaced, filterClamp.xy, filterClamp.zw));
            curColor.a = clamp((curColor.a - 0.6) * 2.5, 0.0, 1.0);
            maxAlpha = max(maxAlpha, curColor.a);
        }
        float resultAlpha = max(maxAlpha, texAlpha);
        vec3 result = ((knockout ? vec3(0.0) : ownColor.rgb) + outlineColor.rgb * (1.0 - texAlpha)) * resultAlpha;
        gl_FragColor = mix(vec4(result, resultAlpha), wColor, texAlpha);
    }
    `;
  }

  /* -------------------------------------------- */

  /**
   * Quality of the outline according to performance mode.
   * @returns {number}
   */
  static get #quality() {
    switch ( canvas.performance.mode ) {
      case CONST.CANVAS_PERFORMANCE_MODES.LOW:
        return (Math.PI * 2) / 10;
      case CONST.CANVAS_PERFORMANCE_MODES.MED:
        return (Math.PI * 2) / 20;
      default:
        return (Math.PI * 2) / 30;
    }
  }

  /* -------------------------------------------- */

  /**
   * The thickness of the outline.
   * @type {number}
   */
  get thickness() {
    return this.#thickness;
  }

  set thickness(value) {
    this.#thickness = value;
    this.padding = value * 1.5;
  }

  #thickness = 3;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static create(uniforms = {}) {
    uniforms = {...this.defaultUniforms, ...uniforms};
    return new this(this.vertexShader, this.createFragmentShader(), uniforms);
  }

  /* -------------------------------------------- */

  /** @override */
  apply(filterManager, input, output, clear) {
    const animate = this.animate && !canvas.photosensitiveMode;
    if ( canvas.photosensitiveMode && this.uniforms.wave ) this.uniforms.wave = false;
    const oThickness = animate
      ? Math.oscillation(this.#thickness * 0.75, this.#thickness * 1.25, canvas.app.ticker.lastTime, 1500)
      : this.#thickness;
    this.uniforms.time = animate ? canvas.app.ticker.lastTime : 0;
    this.uniforms.thickness[0] = (oThickness / input._frame.width) * canvas.stage.scale.x;
    this.uniforms.thickness[1] = (oThickness / input._frame.height) * canvas.stage.scale.x;
    filterManager.applyFilter(this, input, output, clear);
  }
}

/* -------------------------------------------- */

/**
 * The filter used by the weather layer to mask weather above occluded roofs.
 * @see {@link WeatherEffects}
 */
class WeatherOcclusionMaskFilter extends AbstractBaseMaskFilter {

  /**
   * Elevation of this weather occlusion mask filter.
   * @type {number}
   */
  elevation = Infinity;

  /** @override */
  static vertexShader = `
    attribute vec2 aVertexPosition;
  
    // Filter globals uniforms
    uniform mat3 projectionMatrix;
    uniform vec4 inputSize;
    uniform vec4 outputFrame;
    
    // Needed to compute mask and terrain normalized coordinates
    uniform vec2 screenDimensions;
    
    // Needed for computing scene sized texture coordinates 
    uniform vec2 sceneAnchor;
    uniform vec2 sceneDimensions;
    uniform bool useTerrain;
  
    varying vec2 vTextureCoord;
    varying vec2 vMaskTextureCoord;
    varying vec2 vTerrainTextureCoord;
  
    vec4 filterVertexPosition( void ) {
        vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;
        return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0., 1.);
    }
  
    // getting normalized coord for the tile texture
    vec2 filterTextureCoord( void ) {
        return aVertexPosition * (outputFrame.zw * inputSize.zw);
    }
  
    // getting normalized coord for a screen sized mask render texture
    vec2 filterMaskTextureCoord( in vec2 textureCoord ) {
      return (textureCoord * inputSize.xy + outputFrame.xy) / screenDimensions;
    }
    
    // get normalized terrain texture coordinates
    vec2 filterTerrainTextureCoord( in vec2 textureCoord ) {
      return (textureCoord - (sceneAnchor / screenDimensions)) * (screenDimensions / sceneDimensions);
    }
  
    void main() {
      vTextureCoord = filterTextureCoord();
      if ( useTerrain ) vTerrainTextureCoord = filterTerrainTextureCoord(vTextureCoord);
      vMaskTextureCoord = filterMaskTextureCoord(vTextureCoord);
      gl_Position = filterVertexPosition();
    }`;

  /** @override */
  static fragmentShader = ` 
    // Occlusion mask uniforms
    uniform bool useOcclusion;
    uniform sampler2D occlusionTexture;
    uniform bool reverseOcclusion;
    uniform vec4 occlusionWeights;
    
    // Terrain mask uniforms
    uniform bool useTerrain;
    uniform sampler2D terrainTexture;
    uniform bool reverseTerrain;
    uniform vec4 terrainWeights;
    
    // Other uniforms
    varying vec2 vTextureCoord;
    varying vec2 vMaskTextureCoord;
    varying vec2 vTerrainTextureCoord;
    uniform sampler2D uSampler;
    uniform float depthElevation;
    
    // Clip the terrain texture if out of bounds
    float getTerrainClip(vec2 uv) {
      return step(3.5,
         step(0.0, uv.x) +
         step(0.0, uv.y) +
         step(uv.x, 1.0) +
         step(uv.y, 1.0));
    }
    
    void main() {     
      // Base mask value 
      float mask = 1.0;
      
      // Process the occlusion mask
      if ( useOcclusion ) {
        float oMask = 1.0 - step((255.5 / 255.0) - 
                                  dot(occlusionWeights, texture2D(occlusionTexture, vMaskTextureCoord)), 
                                  depthElevation);
        if ( reverseOcclusion ) oMask = 1.0 - oMask;
        mask *= oMask;
      }
                    
      // Process the terrain mask 
      if ( useTerrain ) {
        float tMask = dot(terrainWeights, texture2D(terrainTexture, vTerrainTextureCoord));
        if ( reverseTerrain ) tMask = 1.0 - tMask;
        mask *= (tMask * getTerrainClip(vTerrainTextureCoord));
      }
      
      // Process filtering and apply mask value
      gl_FragColor = texture2D(uSampler, vTextureCoord) * mask;
    }`;

  /** @override */
  static defaultUniforms = {
    depthElevation: 0,
    useOcclusion: true,
    occlusionTexture: null,
    reverseOcclusion: false,
    occlusionWeights: [0, 0, 1, 0],
    useTerrain: false,
    terrainTexture: null,
    reverseTerrain: false,
    terrainWeights: [1, 0, 0, 0],
    sceneDimensions: [0, 0],
    sceneAnchor: [0, 0]
  };

  /** @override */
  apply(filterManager, input, output, clear, currentState) {
    if ( this.uniforms.useTerrain ) {
      const wt = canvas.stage.worldTransform;
      const z = wt.d;
      const sceneDim = canvas.scene.dimensions;

      // Computing the scene anchor and scene dimensions for terrain texture coordinates
      this.uniforms.sceneAnchor[0] = wt.tx + (sceneDim.sceneX * z);
      this.uniforms.sceneAnchor[1] = wt.ty + (sceneDim.sceneY * z);
      this.uniforms.sceneDimensions[0] = sceneDim.sceneWidth * z;
      this.uniforms.sceneDimensions[1] = sceneDim.sceneHeight * z;
    }
    this.uniforms.depthElevation = canvas.primary.mapElevationToDepth(this.elevation);
    return super.apply(filterManager, input, output, clear, currentState);
  }
}

