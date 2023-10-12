/**
 * This class defines an interface which all adaptive vision shaders extend.
 * @extends {AdaptiveLightingShader}
 * @interface
 */
class AdaptiveVisionShader extends AdaptiveLightingShader {
  /** @override */
  static EXPOSURE = `
    // Computing exposed color for background
    if ( exposure != 0.0 ) {
      changedColor *= (1.0 + exposure);
    }`;

  /* -------------------------------------------- */

  /** @override */
  static SHADOW = "";

  /* -------------------------------------------- */

  /**
   * Incorporate falloff if a attenuation uniform is requested
   * @type {string}
   */
  static FALLOFF = `
  if ( attenuation > 0.0 ) finalColor *= smoothstep(0.995 - attenuation * 0.995, 1.0, 1.0 - dist);`;

  /**
   * Initialize fragment with common properties
   * @type {string}
   */
  static FRAGMENT_BEGIN = `
  float dist = distance(vUvs, vec2(0.5)) * 2.0;
  float depth = smoothstep(0.0, 1.0, vDepth);
  vec4 baseColor = useSampler ? texture2D(primaryTexture, vSamplerUvs) : vec4(1.0);
  vec4 depthColor = texture2D(depthTexture, vSamplerUvs);
  vec3 finalColor = baseColor.rgb;`;

  /* -------------------------------------------- */
  /*  Shader Techniques for vision                */
  /* -------------------------------------------- */

  /**
   * A mapping of available shader techniques
   * @type {Object<string, ShaderTechnique>}
   */
  static SHADER_TECHNIQUES = {
    LEGACY: {
      id: 0,
      label: "LIGHT.AdaptiveLuminance",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      finalColor *= reflection;`
    }
  };
}

/* -------------------------------------------- */

/**
 * The default background shader used for vision sources
 * @implements {AdaptiveVisionShader}
 */
class BackgroundVisionShader extends AdaptiveVisionShader {
  /**
   * Shader final
   * @type {string}
   */
  static FRAGMENT_END = `
  gl_FragColor = finalColor4c * depth * vec4(colorTint, 1.0);`;

  /**
   * Incorporate falloff if a attenuation uniform is requested
   * @type {string}
   */
  static FALLOFF = `
  if ( linkedToDarknessLevel ) finalColor = mix(baseColor.rgb, finalColor, darknessLevel);
  vec4 finalColor4c = mix( vec4(finalColor, baseColor.a), vec4(0.0), smoothstep(0.9985 - attenuation * 0.9985, 1.0, dist));
  finalColor4c = mix(finalColor4c, vec4(0.0), 1.0 - step(depthColor.g, depthElevation));
  `;

  /**
   * Memory allocations for the Adaptive Background Shader
   * @type {string}
   */
  static SHADER_HEADER = `
  ${this.FRAGMENT_UNIFORMS}
  ${this.VERTEX_FRAGMENT_VARYINGS}
  ${this.CONSTANTS}`;

  /** @inheritdoc */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    ${this.ADJUSTMENTS}
    ${this.BACKGROUND_TECHNIQUES}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = (() => {
    return {
      technique: 0,
      saturation: 0,
      contrast: 0,
      attenuation: 0.10,
      exposure: 0,
      darknessLevel: 0,
      colorVision: [1, 1, 1],
      colorTint: [1, 1, 1],
      colorBackground: [1, 1, 1],
      screenDimensions: [1, 1],
      time: 0,
      useSampler: true,
      linkedToDarknessLevel: true,
      primaryTexture: null,
      depthTexture: null,
      depthElevation: 1
    };
  })();

  /**
   * Flag whether the background shader is currently required.
   * If key uniforms are at their default values, we don't need to render the background container.
   * @type {boolean}
   */
  get isRequired() {
    const keys = ["contrast", "saturation", "colorTint", "colorVision"];
    return keys.some(k => this.uniforms[k] !== this._defaults[k]);
  }
}

/* -------------------------------------------- */

/**
 * The default illumination shader used for vision sources
 * @implements {AdaptiveVisionShader}
 */
class IlluminationVisionShader extends AdaptiveVisionShader {

  /** @override */
  static FRAGMENT_BEGIN = `
  float dist = distance(vUvs, vec2(0.5)) * 2.0;
  float depth = smoothstep(0.0, 1.0, vDepth);
  vec4 baseColor = useSampler ? texture2D(primaryTexture, vSamplerUvs) : vec4(1.0);
  vec4 depthColor = texture2D(depthTexture, vSamplerUvs);
  vec3 framebufferColor = texture2D(framebufferTexture, vSamplerUvs).rgb;
  vec3 finalColor = baseColor.rgb;
  `;

  /**
   * Constrain light to LOS
   * @type {string}
   */
  static FRAGMENT_END = `
  framebufferColor = min(framebufferColor, colorBackground);
  finalColor = mix(finalColor, framebufferColor, 1.0 - step(depthColor.g, depthElevation));
  gl_FragColor = vec4(mix(framebufferColor, finalColor, depth), depth);
  `;

  /**
   * Incorporate falloff if a attenuation uniform is requested
   * @type {string}
   */
  static FALLOFF = `
  depth *= (1.0 - smoothstep(0.9985 - attenuation * 0.9985, 1.0, dist));
  `;

  /**
   * Transition between bright and dim colors, if requested
   * @type {string}
   */
  static VISION_COLOR = `
  finalColor = colorVision;
  `;

  /**
   * The adjustments made into fragment shaders
   * @type {string}
   */
  static get ADJUSTMENTS() {
    return `
      vec3 changedColor = finalColor;\n
      ${this.SATURATION}
      finalColor = changedColor;\n`;
  }

  /**
   * Memory allocations for the Adaptive Illumination Shader
   * @type {string}
   */
  static SHADER_HEADER = `
  ${this.FRAGMENT_UNIFORMS}
  ${this.VERTEX_FRAGMENT_VARYINGS}
  ${this.CONSTANTS}
  `;

  /** @inheritdoc */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    ${this.VISION_COLOR}
    ${this.ILLUMINATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = (() => {
    const initial = foundry.data.LightData.cleanData();
    return {
      technique: initial.technique,
      attenuation: 0,
      exposure: 0,
      saturation: 0,
      darknessLevel: 0,
      colorVision: [1, 1, 1],
      colorTint: [1, 1, 1],
      colorBackground: [1, 1, 1],
      screenDimensions: [1, 1],
      time: 0,
      useSampler: false,
      linkedToDarknessLevel: true,
      primaryTexture: null,
      framebufferTexture: null,
      depthTexture: null,
      depthElevation: 1
    };
  })();
}

/* -------------------------------------------- */

/**
 * The default coloration shader used for vision sources.
 * @implements {AdaptiveLightingShader}
 */
class ColorationVisionShader extends AdaptiveVisionShader {
  /**
   * Shader final
   * @type {string}
   */
  static FRAGMENT_END = `
  gl_FragColor = finalColor4c * depth;
  `;

  /** @override */
  static EXPOSURE = "";

  /** @override */
  static CONTRAST = "";

  /**
   * Incorporate falloff if a falloff uniform is requested
   * @type {string}
   */
  static FALLOFF = `
  vec4 finalColor4c = vec4(finalColor *= (1.0 - smoothstep(0.98 - attenuation * 0.98, 1.0, dist)), 1.0);
  finalColor4c = mix(finalColor4c, vec4(0.0), 1.0 - step(depthColor.g, depthElevation));
  `;

  /**
   * Memory allocations for the Adaptive Coloration Shader
   * @type {string}
   */
  static SHADER_HEADER = `
  ${this.FRAGMENT_UNIFORMS}
  ${this.VERTEX_FRAGMENT_VARYINGS}
  ${this.CONSTANTS}
  `;

  /** @inheritdoc */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}
  
  void main() {
    ${this.FRAGMENT_BEGIN}
    finalColor = colorEffect;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = (() => {
    return {
      technique: 0,
      saturation: 0,
      attenuation: 0,
      colorEffect: [0, 0, 0],
      colorBackground: [0, 0, 0],
      colorTint: [1, 1, 1],
      time: 0,
      screenDimensions: [1, 1],
      useSampler: true,
      primaryTexture: null,
      linkedToDarknessLevel: true,
      depthTexture: null,
      depthElevation: 1
    };
  })();

  /**
   * Flag whether the coloration shader is currently required.
   * If key uniforms are at their default values, we don't need to render the coloration container.
   * @type {boolean}
   */
  get isRequired() {
    const keys = ["saturation", "colorEffect"];
    return keys.some(k => this.uniforms[k] !== this._defaults[k]);
  }
}

/* -------------------------------------------- */

/**
 * Shader specialized in wave like senses (tremorsenses)
 * @implements {BackgroundVisionShader}
 */
class WaveBackgroundVisionShader extends BackgroundVisionShader {
  /**
   * Shader final
   * @type {string}
   */
  static FRAGMENT_END = `
  gl_FragColor = finalColor4c * depth;`;

  /** @inheritdoc */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.WAVE()}
  ${this.PERCEIVED_BRIGHTNESS}
  
  void main() {
    ${this.FRAGMENT_BEGIN}    
    // Normalize vUvs and compute base time
    vec2 uvs = (2.0 * vUvs) - 1.0;
    float t = time * -8.0;
    
    // Rotate uvs
    float sinX = sin(t * 0.02);
    float cosX = cos(t * 0.02);
    mat2 rotationMatrix = mat2( cosX, -sinX, sinX, cosX);
    vec2 ruv = ((vUvs - 0.5) * rotationMatrix) + 0.5;
    
    // Produce 4 arms smoothed to the edges
    float angle = atan(ruv.x * 2.0 - 1.0, ruv.y * 2.0 - 1.0) * INVTWOPI;
    float beam = fract(angle * 4.0);
    beam = smoothstep(0.3, 1.0, max(beam, 1.0 - beam));
    
    // Construct final color
    vec3 grey = vec3(perceivedBrightness(baseColor.rgb));
    finalColor = mix(baseColor.rgb, grey * 0.5, sqrt(beam)) * mix(vec3(1.0), colorTint, 0.3);
    ${this.ADJUSTMENTS}
    ${this.BACKGROUND_TECHNIQUES}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = ({...super.defaultUniforms, colorTint: [0.8, 0.1, 0.8]});

  /** @inheritdoc */
  get isRequired() {
    return true;
  }
}

/* -------------------------------------------- */

/**
 * The wave vision shader, used to create waves emanations (ex: tremorsense)
 * @implements {ColorationVisionShader}
 */
class WaveColorationVisionShader extends ColorationVisionShader {

  /** @inheritdoc */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.WAVE()}
  ${this.PERCEIVED_BRIGHTNESS}
    
  void main() {
    ${this.FRAGMENT_BEGIN}
    // Normalize vUvs and compute base time
    vec2 uvs = (2.0 * vUvs) - 1.0;
    float t = time * -8.0;
    
    // Rotate uvs
    float sinX = sin(t * 0.02);
    float cosX = cos(t * 0.02);
    mat2 rotationMatrix = mat2( cosX, -sinX, sinX, cosX);
    vec2 ruv = ((vUvs - 0.5) * rotationMatrix) + 0.5;
    
    // Prepare distance from 4 corners
    float dst[4];
    dst[0] = distance(vec2(0.0), ruv);
    dst[1] = distance(vec2(1.0), ruv);
    dst[2] = distance(vec2(1.0,0.0), ruv);
    dst[3] = distance(vec2(0.0,1.0), ruv);
    
    // Produce 4 arms smoothed to the edges
    float angle = atan(ruv.x * 2.0 - 1.0, ruv.y * 2.0 - 1.0) * INVTWOPI;
    float beam = fract(angle * 4.0);
    beam = smoothstep(0.3, 1.0, max(beam, 1.0 - beam));
    
    // Computing the 4 corner waves
    float multiWaves = 0.0;
    for ( int i = 0; i <= 3 ; i++) {
      multiWaves += smoothstep(0.6, 1.0, max(multiWaves, wcos(-10.0, 1.30 - dst[i], dst[i] * 120.0, t)));
    }
    // Computing the central wave
    multiWaves += smoothstep(0.6, 1.0, max(multiWaves, wcos(-10.0, 1.35 - dist, dist * 120.0, -t)));
        
    // Construct final color
    finalColor = vec3(mix(multiWaves, 0.0, sqrt(beam))) * colorEffect;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = ({...super.defaultUniforms, colorEffect: [0.8, 0.1, 0.8]});

  /** @inheritdoc */
  get isRequired() {
    return true;
  }
}

/* -------------------------------------------- */

/**
 * Shader specialized in light amplification
 * @implements {BackgroundVisionShader}
 */
class AmplificationBackgroundVisionShader extends BackgroundVisionShader {
  /**
   * Shader final
   * @type {string}
   */
  static FRAGMENT_END = `
  gl_FragColor = finalColor4c * depth;`;

  /** @inheritdoc */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    float lum = perceivedBrightness(baseColor.rgb);
    vec3 vision = vec3(smoothstep(0.0, 1.0, lum * 1.5)) * colorTint;
    finalColor = vision + (vision * (lum + brightness) * 0.1) + (baseColor.rgb * (1.0 - darknessLevel) * 0.125);
    ${this.ADJUSTMENTS}
    ${this.BACKGROUND_TECHNIQUES}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = ({...super.defaultUniforms, colorTint: [0.38, 0.8, 0.38], brightness: 0.5});

  /** @inheritdoc */
  get isRequired() {
    return true;
  }
}
