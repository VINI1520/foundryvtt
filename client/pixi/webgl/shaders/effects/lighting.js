/* eslint-disable no-tabs */

/**
 * @typedef {Object} ShaderTechnique
 * @property {number} id                      The numeric identifier of the technique
 * @property {string} label                   The localization string that labels the technique
 * @property {string|undefined} coloration    The coloration shader fragment when the technique is used
 * @property {string|undefined} illumination  The illumination shader fragment when the technique is used
 * @property {string|undefined} background    The background shader fragment when the technique is used
 */

/**
 * This class defines an interface which all adaptive lighting shaders extend.
 * @extends {AbstractBaseShader}
 * @interface
 */
class AdaptiveLightingShader extends AbstractBaseShader {

  /** @inheritdoc */
  static vertexShader = `
  ${this.VERTEX_ATTRIBUTES}
  ${this.VERTEX_UNIFORMS}
  ${this.VERTEX_FRAGMENT_VARYINGS}

  void main() {
    vec3 tPos = translationMatrix * vec3(aVertexPosition, 1.0);
    vUvs = aVertexPosition * 0.5 + 0.5;
    vDepth = aDepthValue;
    vSamplerUvs = tPos.xy / screenDimensions;
    gl_Position = vec4((projectionMatrix * tPos).xy, 0.0, 1.0);
  }`;

  /* -------------------------------------------- */
  /*  GLSL Helper Functions                       */
  /* -------------------------------------------- */

  /**
   * Determine the correct penalty to apply for a given darkness level and luminosity
   * @param {number} darknessLevel      The current darkness level on [0,1]
   * @param {number} luminosity         The light source luminosity on [-1,1]
   * @returns {number}                  The amount of penalty to apply on [0,1]
   */
  getDarknessPenalty(darknessLevel, luminosity) {
    const l = Math.max(luminosity, 0);  // [0,1]
    return (darknessLevel / 4) * (1 - l); // [0, 0.25]
  }

  /* -------------------------------------------- */

  /**
   * Construct adaptive shader according to shader type
   * @param {string} shaderType  shader type to construct : coloration, illumination, background, etc.
   * @returns {string}           the constructed shader adaptive block
   */
  static getShaderTechniques(shaderType) {
    let shader = "";
    let index = 0;
    for ( let technique of Object.values(this.SHADER_TECHNIQUES) ) {
      if ( technique[shaderType] ) {
        let cond = `if ( technique == ${technique.id} )`;
        if ( index > 0 ) cond = `else ${cond}`;
        shader += `${cond} {${technique[shaderType]}\n}\n`;
        index++;
      }
    }
    return shader;
  }

  /* -------------------------------------------- */

  /**
   * The coloration technique coloration shader fragment
   * @type {string}
   */
  static get COLORATION_TECHNIQUES() {
    return this.getShaderTechniques("coloration");
  }

  /* -------------------------------------------- */

  /**
   * The coloration technique illumination shader fragment
   * @type {string}
   */
  static get ILLUMINATION_TECHNIQUES() {
    return this.getShaderTechniques("illumination");
  }

  /* -------------------------------------------- */

  /**
   * The coloration technique background shader fragment
   * @type {string}
   */
  static get BACKGROUND_TECHNIQUES() {
    return this.getShaderTechniques("background");
  }

  /* -------------------------------------------- */

  /**
   * The adjustments made into fragment shaders
   * @type {string}
   */
  static get ADJUSTMENTS() {
    return `vec3 changedColor = finalColor;\n
    ${this.CONTRAST}
    ${this.SATURATION}
    ${this.EXPOSURE}
    ${this.SHADOW}
    if ( useSampler ) finalColor = changedColor;`;
  }

  /* -------------------------------------------- */

  /**
   * Contrast adjustment
   * @type {string}
   */
  static CONTRAST = `
    // Computing contrasted color
    if ( contrast != 0.0 ) {
      changedColor = (changedColor - 0.5) * (contrast + 1.0) + 0.5;
    }`;

  /* -------------------------------------------- */

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

  /* -------------------------------------------- */

  /**
   * Exposure adjustment
   * @type {string}
   */
  static EXPOSURE = `
    // Computing exposed color for background
    if ( exposure > 0.0 && !darkness ) {
      float halfExposure = exposure * 0.5;
      float attenuationStrength = attenuation * 0.25;
      float lowerEdge = 0.98 - attenuationStrength;
      float upperEdge = 1.02 + attenuationStrength;
      float finalExposure = halfExposure *
                            (1.0 - smoothstep(ratio * lowerEdge, clamp(ratio * upperEdge, 0.0001, 1.0), dist)) +
                            halfExposure;
      changedColor *= (1.0 + finalExposure);
    }`;

  /* -------------------------------------------- */

  /**
   * Switch between an inner and outer color, by comparing distance from center to ratio
   * Apply a strong gradient between the two areas if attenuation uniform is set to true
   * @type {string}
   */
  static SWITCH_COLOR = `
    vec3 switchColor( in vec3 innerColor, in vec3 outerColor, in float dist ) {
      float attenuationStrength = attenuation * 0.7;
      float lowerEdge = 0.99 - attenuationStrength;
      float upperEdge = 1.01 + attenuationStrength;
      return mix(innerColor, outerColor, smoothstep(ratio * lowerEdge, clamp(ratio * upperEdge, 0.0001, 1.0), dist));
    }`;

  /* -------------------------------------------- */

  /**
   * Shadow adjustment
   * @type {string}
   */
  static SHADOW = `
    // Computing shadows
    if ( shadows != 0.0 ) {
      float shadowing = mix(1.0, smoothstep(0.50, 0.80, perceivedBrightness(changedColor)), shadows);
      // Applying shadow factor
      changedColor *= shadowing;
    }`;

  /* -------------------------------------------- */

  /**
   * Transition between bright and dim colors, if requested
   * @type {string}
   */
  static TRANSITION = `
  finalColor = switchColor(colorBright, colorDim, dist);`;

  /**
   * Incorporate falloff if a attenuation uniform is requested
   * @type {string}
   */
  static FALLOFF = `
  if ( attenuation > 0.0 && !darkness ) finalColor *= smoothstep(0.995 - attenuation * 0.995, 1.0, 1.0 - dist);`;

  /**
   * Initialize fragment with common properties
   * @type {string}
   */
  static FRAGMENT_BEGIN = `
  float dist = distance(vUvs, vec2(0.5)) * 2.0;
  float depth = smoothstep(0.0, 1.0, vDepth);
  vec4 baseColor = (useSampler ? texture2D(primaryTexture, vSamplerUvs) : vec4(0.0));
  vec4 depthColor = texture2D(depthTexture, vSamplerUvs);
  vec3 finalColor = baseColor.rgb;
  `;

  /**
   * Shader final
   * @type {string}
   */
  static FRAGMENT_END = `
  gl_FragColor = vec4(finalColor, 1.0);`;

  /* -------------------------------------------- */
  /*  Shader Techniques for lighting              */
  /* -------------------------------------------- */

  /**
   * A mapping of available shader techniques
   * @type {Object<string, ShaderTechnique>}
   */
  static SHADER_TECHNIQUES = {
    LEGACY: {
      id: 0,
      label: "LIGHT.LegacyColoration"
    },
    LUMINANCE: {
      id: 1,
      label: "LIGHT.AdaptiveLuminance",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      finalColor *= reflection;`
    },
    INTERNAL_HALO: {
      id: 2,
      label: "LIGHT.InternalHalo",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      finalColor = switchColor(finalColor, finalColor * reflection, dist);`
    },
    EXTERNAL_HALO: {
      id: 3,
      label: "LIGHT.ExternalHalo",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      finalColor = switchColor(finalColor * reflection, finalColor, dist);`
    },
    COLOR_BURN: {
      id: 4,
      label: "LIGHT.ColorBurn",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      finalColor = (finalColor * (1.0 - sqrt(reflection))) / clamp(baseColor.rgb * 2.0, 0.001, 0.25);`
    },
    INTERNAL_BURN: {
      id: 5,
      label: "LIGHT.InternalBurn",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      finalColor = switchColor((finalColor * (1.0 - sqrt(reflection))) / clamp(baseColor.rgb * 2.0, 0.001, 0.25), finalColor * reflection, dist);`
    },
    EXTERNAL_BURN: {
      id: 6,
      label: "LIGHT.ExternalBurn",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      finalColor = switchColor(finalColor * reflection, (finalColor * (1.0 - sqrt(reflection))) / clamp(baseColor.rgb * 2.0, 0.001, 0.25), dist);`
    },
    LOW_ABSORPTION: {
      id: 7,
      label: "LIGHT.LowAbsorption",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      reflection *= smoothstep(0.35, 0.75, reflection);
      finalColor *= reflection;`
    },
    HIGH_ABSORPTION: {
      id: 8,
      label: "LIGHT.HighAbsorption",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      reflection *= smoothstep(0.55, 0.85, reflection);
      finalColor *= reflection;`
    },
    INVERT_ABSORPTION: {
      id: 9,
      label: "LIGHT.InvertAbsorption",
      coloration: `
      float r = reversePerceivedBrightness(baseColor);
      finalColor *= (r * r * r * r * r);`
    },
    NATURAL_LIGHT: {
      id: 10,
      label: "LIGHT.NaturalLight",
      coloration: `
      float reflection = perceivedBrightness(baseColor);
      finalColor *= reflection;`,
      background: `
      float ambientColorIntensity = perceivedBrightness(colorBackground);
      vec3 mutedColor = mix(finalColor, 
                            finalColor * mix(color, colorBackground, ambientColorIntensity), 
                            backgroundAlpha);
      finalColor = mix( finalColor,
                        mutedColor,
                        darknessLevel);`
    }
  };
}

/* -------------------------------------------- */

/**
 * The default coloration shader used by standard rendering and animations
 * A fragment shader which creates a solid light source.
 * @implements {AdaptiveLightingShader}
 */
class AdaptiveBackgroundShader extends AdaptiveLightingShader {

  /**
   * Shader final
   * @type {string}
   */
  static FRAGMENT_END = `
  gl_FragColor = finalColor4c * depth;
  `;

  /**
   * Incorporate falloff if a attenuation uniform is requested
   * @type {string}
   */
  static FALLOFF = `
  vec4 finalColor4c = mix( vec4(finalColor, baseColor.a), vec4(0.0), smoothstep(0.995 - attenuation * 0.995, 1.0, dist));
  finalColor4c = mix(finalColor4c, vec4(0.0), 1.0 - step(depthColor.g, depthElevation) * depth);
  `;

  /**
   * Memory allocations for the Adaptive Background Shader
   * @type {string}
   */
  static SHADER_HEADER = `
  ${this.FRAGMENT_UNIFORMS}
  ${this.VERTEX_FRAGMENT_VARYINGS}
  ${this.CONSTANTS}
  ${this.SWITCH_COLOR}
  `;

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
    const initial = foundry.data.LightData.cleanData();
    return {
      technique: initial.coloration,
      contrast: initial.contrast,
      shadows: initial.shadows,
      saturation: initial.saturation,
      intensity: initial.animation.intensity,
      attenuation: initial.attenuation,
      exposure: 0,
      ratio: 0.5,
      darkness: false,
      color: [1, 1, 1],
      colorBackground: [1, 1, 1],
      screenDimensions: [1, 1],
      time: 0,
      useSampler: true,
      primaryTexture: null,
      depthTexture: null,
      depthElevation: 1
    };
  })();

  /**
   * Flag whether the background shader is currently required.
   * Check vision modes requirements first, then
   * if key uniforms are at their default values, we don't need to render the background container.
   * @type {boolean}
   */
  get isRequired() {
    const vs = canvas.effects.visibility.lightingVisibility;

    // Checking if a vision mode is forcing the rendering
    if ( vs.background === VisionMode.LIGHTING_VISIBILITY.REQUIRED ) return true;

    // Checking if disabled
    if ( vs.background === VisionMode.LIGHTING_VISIBILITY.DISABLED ) return false;

    // Then checking keys
    const keys = ["contrast", "saturation", "shadows", "exposure", "technique"];
    return keys.some(k => this.uniforms[k] !== this._defaults[k]);
  }
}

/* -------------------------------------------- */

/**
 * The default coloration shader used by standard rendering and animations
 * A fragment shader which creates a solid light source.
 * @implements {AdaptiveLightingShader}
 */
class AdaptiveIlluminationShader extends AdaptiveLightingShader {

  /** @override */
  static FRAGMENT_BEGIN = `
  float dist = distance(vUvs, vec2(0.5)) * 2.0;
  float depth = smoothstep(0.0, 1.0, vDepth);
  vec4 baseColor = (useSampler ? texture2D(primaryTexture, vSamplerUvs) : vec4(0.0));
  vec4 depthColor = texture2D(depthTexture, vSamplerUvs);
  vec3 framebufferColor = texture2D(framebufferTexture, vSamplerUvs).rgb;
  vec3 finalColor = baseColor.rgb;
  `;

  /**
   * Fragment end
   * @type {string}
   */
  static FRAGMENT_END = `
  // Darkness
  if ( !darkness ) framebufferColor = min(framebufferColor, colorBackground);
  else framebufferColor = max(framebufferColor, colorBackground);
  
  // Elevation
  finalColor = mix(finalColor, framebufferColor, 1.0 - step(depthColor.g, depthElevation));
  
  // Final
  gl_FragColor = vec4(mix(framebufferColor, finalColor, depth), depth);
  `;

  /**
   * Incorporate falloff if a attenuation uniform is requested
   * @type {string}
   */
  static FALLOFF = `
  depth *= (1.0 - smoothstep(0.98 - attenuation * 0.98, 1.0, dist));
  `;

  /**
   * The adjustments made into fragment shaders
   * @type {string}
   */
  static get ADJUSTMENTS() {
    return `
      vec3 changedColor = finalColor;\n
      ${this.SATURATION}
      ${this.EXPOSURE}
      ${this.SHADOW}
      finalColor = changedColor;\n`;
  }

  static EXPOSURE = `
    // Computing exposure with illumination
    if ( exposure > 0.0 && !darkness ) {
      // Diminishing exposure for illumination by a factor 2 (to reduce the "inflating radius" visual problem)
      float quartExposure = exposure * 0.25;
      float attenuationStrength = attenuation * 0.25;
      float lowerEdge = 0.98 - attenuationStrength;
      float upperEdge = 1.02 + attenuationStrength;
      float finalExposure = quartExposure *
                            (1.0 - smoothstep(ratio * lowerEdge, clamp(ratio * upperEdge, 0.0001, 1.0), dist)) +
                            quartExposure;
      changedColor *= (1.0 + finalExposure);
    }
    else if ( exposure != 0.0 ) changedColor *= (1.0 + exposure);
  `;

  /**
   * Memory allocations for the Adaptive Illumination Shader
   * @type {string}
   */
  static SHADER_HEADER = `
  ${this.FRAGMENT_UNIFORMS}
  ${this.VERTEX_FRAGMENT_VARYINGS}
  ${this.CONSTANTS}
  ${this.SWITCH_COLOR}
  `;

  /** @inheritdoc */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    ${this.TRANSITION}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = (() => {
    const initial = foundry.data.LightData.cleanData();
    return {
      technique: initial.coloration,
      shadows: initial.shadows,
      saturation: initial.saturation,
      intensity: initial.animation.intensity,
      attenuation: initial.attenuation,
      contrast: initial.contrast,
      exposure: 0,
      ratio: 0.5,
      darkness: false,
      darknessLevel: 0,
      color: [1, 1, 1],
      colorBackground: [1, 1, 1],
      colorDim: [1, 1, 1],
      colorBright: [1, 1, 1],
      screenDimensions: [1, 1],
      time: 0,
      useSampler: false,
      primaryTexture: null,
      framebufferTexture: null,
      depthTexture: null,
      depthElevation: 1
    };
  })();

  /**
   * Flag whether the illumination shader is currently required.
   * @type {boolean}
   */
  get isRequired() {
    const vs = canvas.effects.visibility.lightingVisibility;

    // Checking if disabled
    if ( vs.illumination === VisionMode.LIGHTING_VISIBILITY.DISABLED ) return false;

    // For the moment, we return everytimes true if we are here
    return true;
  }
}

/* -------------------------------------------- */

/**
 * The default coloration shader used by standard rendering and animations.
 * A fragment shader which creates a light source.
 * @implements {AdaptiveLightingShader}
 */
class AdaptiveColorationShader extends AdaptiveLightingShader {
  /**
   * Shader final
   * @type {string}
   */
  static FRAGMENT_END = `
  gl_FragColor = finalColor4c * depth;
  `;

  /**
   * The adjustments made into fragment shaders
   * @type {string}
   */
  static get ADJUSTMENTS() {
    return `
      vec3 changedColor = finalColor;\n
      ${this.SATURATION}
      ${this.SHADOW}
      finalColor = changedColor;\n`;
  }

  static SHADOW = `
    // Computing shadows
    if ( shadows != 0.0 ) {
      float shadowing = mix(1.0, smoothstep(0.25, 0.35, perceivedBrightness(baseColor.rgb)), shadows);
      // Applying shadow factor
      changedColor *= shadowing;
    }
  `;

  /**
   * Incorporate falloff if a falloff uniform is requested
   * @type {string}
   */
  static FALLOFF = `
  vec4 finalColor4c;
  float smooth = smoothstep(0.98 - attenuation * 0.98, 1.0, dist);
  if ( darkness ) {
    vec3 final = vec3(1.0);
    finalColor4c = vec4(final *= smooth, 1.0);
  } else {
    finalColor4c = vec4(finalColor *= (1.0 - smooth), 1.0);
  }
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
  ${this.SWITCH_COLOR}
  `;

  /** @inheritdoc */
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}
  
  void main() {
    ${this.FRAGMENT_BEGIN}
    finalColor = (darkness ? vec3(0.0) : color * colorationAlpha);
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = (() => {
    const initial = foundry.data.LightData.cleanData();
    return {
      technique: initial.coloration,
      shadows: initial.shadows,
      saturation: initial.saturation,
      colorationAlpha: 1,
      intensity: initial.animation.intensity,
      attenuation: initial.attenuation,
      ratio: 0.5,
      color: [1, 1, 1],
      time: 0,
      darkness: false,
      hasColor: false,
      screenDimensions: [1, 1],
      useSampler: false,
      primaryTexture: null,
      depthTexture: null,
      depthElevation: 1
    };
  })();

  /**
   * Flag whether the coloration shader is currently required.
   * @type {boolean}
   */
  get isRequired() {
    const vs = canvas.effects.visibility.lightingVisibility;

    // Checking if a vision mode is forcing the rendering
    if ( vs.coloration === VisionMode.LIGHTING_VISIBILITY.REQUIRED ) return true;

    // Checking if disabled
    if ( vs.coloration === VisionMode.LIGHTING_VISIBILITY.DISABLED ) return false;

    // Otherwise, we need the coloration if it has color or if it's darkness
    return (this.uniforms.hasColor || this.uniforms.darkness);
  }
}

/* -------------------------------------------- */

/**
 * Allow coloring of illumination
 * @extends {AdaptiveIlluminationShader}
 * @author SecretFire
 */
class TorchIlluminationShader extends AdaptiveIlluminationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    ${this.TRANSITION}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Torch animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class TorchColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    finalColor = color * brightnessPulse * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }
  `;

  /** @inheritdoc */
  static defaultUniforms = ({...super.defaultUniforms, ratio: 0, brightnessPulse: 1});
}

/* -------------------------------------------- */

/**
 * Pulse animation illumination shader
 * @extends {AdaptiveIlluminationShader}
 * @author SecretFire
 */
class PulseIlluminationShader extends AdaptiveIlluminationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    float fading = pow(abs(1.0 - dist * dist), 1.01 - ratio);
    ${this.TRANSITION}
    finalColor *= fading;
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Pulse animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class PulseColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  float pfade(in float dist, in float pulse) {
      return 1.0 - smoothstep(pulse * 0.5, 1.0, dist);
  }
    
  void main() {
    ${this.FRAGMENT_BEGIN}
    finalColor = color * pfade(dist, pulse) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = ({...super.defaultUniforms, pulse: 0});
}

/* -------------------------------------------- */

/**
 * Energy field animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class EnergyFieldColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `    
  ${this.SHADER_HEADER}
  ${this.PRNG3D}
  ${this.PERCEIVED_BRIGHTNESS}

  // classic 3d voronoi (with some bug fixes)
  vec3 voronoi3d(const in vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    
    float id = 0.0;
    vec2 res = vec2(100.0);
    
    for (int k = -1; k <= 1; k++) {
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec3 b = vec3(float(i), float(j), float(k));
          vec3 r = vec3(b) - f + random(p + b);
          
          float d = dot(r, r);
          float cond = max(sign(res.x - d), 0.0);
          float nCond = 1.0 - cond;
          float cond2 = nCond * max(sign(res.y - d), 0.0);
          float nCond2 = 1.0 - cond2;
    
          id = (dot(p + b, vec3(1.0, 67.0, 142.0)) * cond) + (id * nCond);
          res = vec2(d, res.x) * cond + res * nCond;
    
          res.y = cond2 * d + nCond2 * res.y;
        }
      }
    }
    // replaced abs(id) by pow( abs(id + 10.0), 0.01)
    // needed to remove artifacts in some specific configuration
    return vec3( sqrt(res), pow( abs(id + 10.0), 0.01) );
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 uv = vUvs;
    
    // Hemispherize and scaling the uv
    float f = (1.0 - sqrt(1.0 - dist)) / dist;
    uv -= vec2(0.5);
    uv *= f * 4.0 * intensity;
    uv += vec2(0.5);
    
    // time and uv motion variables
    float t = time * 0.4;
    float uvx = cos(uv.x - t);
    float uvy = cos(uv.y + t);
    float uvxt = cos(uv.x + sin(t));
    float uvyt = sin(uv.y + cos(t));
    
    // creating the voronoi 3D sphere, applying motion
    vec3 c = voronoi3d(vec3(uv.x - uvx + uvyt, 
                            mix(uv.x, uv.y, 0.5) + uvxt - uvyt + uvx,
                            uv.y + uvxt - uvx));
    
    // applying color and contrast, to create sharp black areas. 
    finalColor = c.x * c.x * c.x * color * colorationAlpha;

    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Chroma animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class ChromaColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.HSB2RGB}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    finalColor = mix( color, 
                      hsb2rgb(vec3(time * 0.25, 1.0, 1.0)),
                      intensity * 0.1 ) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Wave animation illumination shader
 * @extends {AdaptiveIlluminationShader}
 * @author SecretFire
 */
class WaveIlluminationShader extends AdaptiveIlluminationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  float wave(in float dist) {
    float sinWave = 0.5 * (sin(-time * 6.0 + dist * 10.0 * intensity) + 1.0);
    return 0.3 * sinWave + 0.8;
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    ${this.TRANSITION}
    finalColor *= wave(dist);
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Wave animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class WaveColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  float wave(in float dist) {
    float sinWave = 0.5 * (sin(-time * 6.0 + dist * 10.0 * intensity) + 1.0);
    return 0.55 * sinWave + 0.8;
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    finalColor = color * wave(dist) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Bewitching Wave animation illumination shader
 * @extends {AdaptiveIlluminationShader}
 * @author SecretFire
 */
class BewitchingWaveIlluminationShader extends AdaptiveIlluminationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(4, 1.0)}
  ${this.PERCEIVED_BRIGHTNESS}

  // Transform UV
  vec2 transform(in vec2 uv, in float dist) {
    float t = time * 0.25;
    mat2 rotmat = mat2(cos(t), -sin(t), sin(t), cos(t));
    mat2 scalemat = mat2(2.5, 0.0, 0.0, 2.5);
    uv -= vec2(0.5); 
    uv *= rotmat * scalemat;
    uv += vec2(0.5);
    return uv;
  }

  float bwave(in float dist) {
    vec2 uv = transform(vUvs, dist);
    float motion = fbm(uv + time * 0.25);
    float distortion = mix(1.0, motion, clamp(1.0 - dist, 0.0, 1.0));
    float sinWave = 0.5 * (sin(-time * 6.0 + dist * 10.0 * intensity * distortion) + 1.0);
    return 0.3 * sinWave + 0.8;
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    ${this.TRANSITION}
    finalColor *= bwave(dist);
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Bewitching Wave animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class BewitchingWaveColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(4, 1.0)}
  ${this.PERCEIVED_BRIGHTNESS}

  // Transform UV
  vec2 transform(in vec2 uv, in float dist) {
    float t = time * 0.25;
    mat2 rotmat = mat2(cos(t), -sin(t), sin(t), cos(t));
    mat2 scalemat = mat2(2.5, 0.0, 0.0, 2.5);
    uv -= vec2(0.5); 
    uv *= rotmat * scalemat;
    uv += vec2(0.5);
    return uv;
  }

  float bwave(in float dist) {
    vec2 uv = transform(vUvs, dist);
    float motion = fbm(uv + time * 0.25);
    float distortion = mix(1.0, motion, clamp(1.0 - dist, 0.0, 1.0));
    float sinWave = 0.5 * (sin(-time * 6.0 + dist * 10.0 * intensity * distortion) + 1.0);
    return 0.55 * sinWave + 0.8;
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    finalColor = color * bwave(dist) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Fog animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class FogColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(4, 1.0)}
  ${this.PERCEIVED_BRIGHTNESS}

  vec3 fog() {
    // constructing the palette
    vec3 c1 = color * 0.60;
    vec3 c2 = color * 0.95;
    vec3 c3 = color * 0.50;
    vec3 c4 = color * 0.75;
    vec3 c5 = vec3(0.3);
    vec3 c6 = color;
    
    // creating the deformation
    vec2 uv = vUvs;
    vec2 p = uv.xy * 8.0;

    // time motion fbm and palette mixing
    float q = fbm(p - time * 0.1);
    vec2 r = vec2(fbm(p + q - time * 0.5 - p.x - p.y), 
                  fbm(p + q - time * 0.3));
    vec3 c = clamp(mix(c1, 
                       c2, 
                       fbm(p + r)) + mix(c3, c4, r.x) 
                                   - mix(c5, c6, r.y),
                                     vec3(0.0), vec3(1.0));
    // returning the color
    return c;
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    float intens = intensity * 0.2;
    // applying fog
    finalColor = fog() * intens * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Sunburst animation illumination shader
 * @extends {AdaptiveIlluminationShader}
 * @author SecretFire
 */
class SunburstIlluminationShader extends AdaptiveIlluminationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  // Smooth back and forth between a and b
  float cosTime(in float a, in float b) {
    return (a - b) * ((cos(time) + 1.0) * 0.5) + b;
  }

  // Create the sunburst effect
  vec3 sunBurst(in vec3 color, in vec2 uv, in float dist) {
    // Pulse calibration
    float intensityMod = 1.0 + (intensity * 0.05);
    float lpulse = cosTime(1.3 * intensityMod, 0.85 * intensityMod);
    
    // Compute angle
    float angle = atan(uv.x, uv.y) * INVTWOPI;
    
    // Creating the beams and the inner light
    float beam = fract(angle * 16.0 + time);
    float light = lpulse * pow(abs(1.0 - dist), 0.65);
    
    // Max agregation of the central light and the two gradient edges
    float sunburst = max(light, max(beam, 1.0 - beam));
        
    // Creating the effect : applying color and color correction. ultra saturate the entire output color.
    return color * pow(sunburst, 3.0);
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 uv = (2.0 * vUvs) - 1.0;
    finalColor = switchColor(colorBright, colorDim, dist);
    ${this.ADJUSTMENTS}
    finalColor = sunBurst(finalColor, uv, dist);
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/**
 * Sunburst animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class SunburstColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  // Smooth back and forth between a and b
  float cosTime(in float a, in float b) {
    return (a - b) * ((cos(time) + 1.0) * 0.5) + b;
  }

  // Create a sun burst effect
  vec3 sunBurst(in vec2 uv, in float dist) {
    // pulse calibration
    float intensityMod = 1.0 + (intensity * 0.05);
    float lpulse = cosTime(1.1 * intensityMod, 0.85 * intensityMod);

    // compute angle
    float angle = atan(uv.x, uv.y) * INVTWOPI;
    
    // creating the beams and the inner light
    float beam = fract(angle * 16.0 + time);
    float light = lpulse * pow(abs(1.0 - dist), 0.65);
    
    // agregation of the central light and the two gradient edges to create the sunburst
    float sunburst = max(light, max(beam, 1.0 - beam));
        
    // creating the effect : applying color and color correction. saturate the entire output color.
    return color * pow(sunburst, 3.0);
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 uvs = (2.0 * vUvs) - 1.0;
    finalColor = sunBurst(uvs, dist) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Light dome animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class LightDomeColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(2)}
  ${this.PERCEIVED_BRIGHTNESS}

  // Rotate and scale uv
  vec2 transform(in vec2 uv, in float dist) {
    float hspherize = (1.0 - sqrt(1.0 - dist)) / dist;
    float t = time * 0.02;
    mat2 rotmat = mat2(cos(t), -sin(t), sin(t), cos(t));
    mat2 scalemat = mat2(8.0 * intensity, 0.0, 0.0, 8.0 * intensity);
    uv -= PIVOT; 
    uv *= rotmat * scalemat * hspherize;
    uv += PIVOT;
    return uv;
  }
  
  vec3 ripples(in vec2 uv) {
    // creating the palette
    vec3 c1 = color * 0.550;
    vec3 c2 = color * 0.020;
    vec3 c3 = color * 0.3;
    vec3 c4 = color;
    vec3 c5 = color * 0.025;
    vec3 c6 = color * 0.200;

    vec2 p = uv + vec2(5.0);
    float q = 2.0 * fbm(p + time * 0.2);
    vec2 r = vec2(fbm(p + q + ( time  ) - p.x - p.y), fbm(p * 2.0 + ( time )));
    
    return clamp( mix( c1, c2, abs(fbm(p + r)) ) + mix( c3, c4, abs(r.x * r.x * r.x) ) - mix( c5, c6, abs(r.y * r.y)), vec3(0.0), vec3(1.0));
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    
    // to hemispherize, rotate and magnify
    vec2 uv = transform(vUvs, dist);
    finalColor = ripples(uv) * pow(1.0 - dist, 0.25) * colorationAlpha;

    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */


/**
 * Emanation animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class EmanationColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  // Create an emanation composed of n beams, n = intensity
  vec3 beamsEmanation(in vec2 uv, in float dist) {
    float angle = atan(uv.x, uv.y) * INVTWOPI;

    // create the beams
    float beams = fract( angle * intensity + sin(dist * 10.0 - time));

    // compose the final beams with max, to get a nice gradient on EACH side of the beams.
    beams = max(beams, 1.0 - beams);

    // creating the effect : applying color and color correction. saturate the entire output color.
    return smoothstep( 0.0, 1.0, beams * color);
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 uvs = (2.0 * vUvs) - 1.0;
    // apply beams emanation, fade and alpha
    finalColor = beamsEmanation(uvs, dist) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Ghost light animation illumination shader
 * @extends {AdaptiveIlluminationShader}
 * @author SecretFire
 */
class GhostLightIlluminationShader extends AdaptiveIlluminationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(3, 1.0)}

  void main() {
    ${this.FRAGMENT_BEGIN}
    
    // Creating distortion with vUvs and fbm
    float distortion1 = fbm(vec2( 
                        fbm(vUvs * 5.0 - time * 0.50), 
                        fbm((-vUvs - vec2(0.01)) * 5.0 + time * INVTHREE)));
    
    float distortion2 = fbm(vec2(
                        fbm(-vUvs * 5.0 - time * 0.50),
                        fbm((-vUvs + vec2(0.01)) * 5.0 + time * INVTHREE)));
    vec2 uv = vUvs;
      
    // time related var
    float t = time * 0.5;
    float tcos = 0.5 * (0.5 * (cos(t)+1.0)) + 0.25;

    ${this.TRANSITION}
    finalColor *= mix( distortion1 * 1.5 * (intensity * 0.2),
                       distortion2 * 1.5 * (intensity * 0.2), tcos);
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Ghost light animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class GhostLightColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(3, 1.0)}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    
    // Creating distortion with vUvs and fbm
    float distortion1 = fbm(vec2( 
                        fbm(vUvs * 3.0 + time * 0.50), 
                        fbm((-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));
    
    float distortion2 = fbm(vec2(
                        fbm(-vUvs * 3.0 + time * 0.50),
                        fbm((-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));
    vec2 uv = vUvs;
      
    // time related var
    float t = time * 0.5;
    float tcos = 0.5 * (0.5 * (cos(t)+1.0)) + 0.25;
    float tsin = 0.5 * (0.5 * (sin(t)+1.0)) + 0.25;
    
    // Creating distortions with cos and sin : create fluidity
    uv -= PIVOT;
    uv *= tcos * distortion1;
    uv *= tsin * distortion2;
    uv *= fbm(vec2(time + distortion1, time + distortion2));
    uv += PIVOT;

    finalColor = distortion1 * distortion1 * 
                 distortion2 * distortion2 * 
                 color * pow(1.0 - dist, dist)
                 * colorationAlpha * mix( uv.x + distortion1 * 4.5 * (intensity * 0.2),
                                          uv.y + distortion2 * 4.5 * (intensity * 0.2), tcos);
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Hexagonal dome animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class HexaDomeColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  // rotate and scale uv
  vec2 transform(in vec2 uv, in float dist) {
    float hspherize = (1.0 - sqrt(1.0 - dist)) / dist;
    float t = -time * 0.20;
    float scale = 10.0 / (11.0 - intensity);
    float cost = cos(t);
    float sint = sin(t);

    mat2 rotmat = mat2(cost, -sint, sint, cost);
    mat2 scalemat = mat2(scale, 0.0, 0.0, scale);
    uv -= PIVOT; 
    uv *= rotmat * scalemat * hspherize;
    uv += PIVOT;
    return uv;
  }

  // Adapted classic hexa algorithm
  float hexDist(in vec2 uv) {
    vec2 p = abs(uv);
    float c = dot(p, normalize(vec2(1.0, 1.73)));
    c = max(c, p.x);
    return c;
  }

  vec4 hexUvs(in vec2 uv) {
    const vec2 r = vec2(1.0, 1.73);
    const vec2 h = r*0.5;
    
    vec2 a = mod(uv, r) - h;
    vec2 b = mod(uv - h, r) - h;
    vec2 gv = dot(a, a) < dot(b,b) ? a : b;
    
    float x = atan(gv.x, gv.y);
    float y = 0.55 - hexDist(gv);
    vec2 id = uv - gv;
    return vec4(x, y, id.x, id.y);
  }

  vec3 hexa(in vec2 uv) {
    float t = time;
    vec2 uv1 = uv + vec2(0.0, sin(uv.y) * 0.25);
    vec2 uv2 = 0.5 * uv1 + 0.5 * uv + vec2(0.55, 0);
    float a = 0.2;
    float c = 0.5;
    float s = -1.0;
    uv2 *= mat2(c, -s, s, c);

    vec3 col = color;
    float hexy = hexUvs(uv2 * 10.0).y;
    float hexa = smoothstep( 3.0 * (cos(t)) + 4.5, 12.0, hexy * 20.0) * 3.0;

    col *= mix(hexa, 1.0 - hexa, min(hexy, 1.0 - hexy));
    col += color * fract(smoothstep(1.0, 2.0, hexy * 20.0)) * 0.65;
    return col;
  }

  void main() {
    ${this.FRAGMENT_BEGIN}

    // Rotate, magnify and hemispherize the uvs
    vec2 uv = transform(vUvs, dist);
    
    // Hexaify the uv (hemisphere) and apply fade and alpha
    finalColor = hexa(uv) * pow(1.0 - dist, 0.18) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Roling mass illumination shader - intended primarily for darkness
 * @extends {AdaptiveIlluminationShader}
 * @author SecretFire
 */
class RoilingIlluminationShader extends AdaptiveIlluminationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(3)}

  void main() {
    ${this.FRAGMENT_BEGIN}

    // Creating distortion with vUvs and fbm
    float distortion1 = fbm( vec2( 
                        fbm( vUvs * 2.5 + time * 0.5),
                        fbm( (-vUvs - vec2(0.01)) * 5.0 + time * INVTHREE)));
    
    float distortion2 = fbm( vec2(
                        fbm( -vUvs * 5.0 + time * 0.5),
                        fbm( (vUvs + vec2(0.01)) * 2.5 + time * INVTHREE)));
    
    // Timed values
    float t = -time * 0.5;
    float cost = cos(t);
    float sint = sin(t);
    
    // Rotation matrix
    mat2 rotmat = mat2(cost, -sint, sint, cost);
    vec2 uv = vUvs;

    // Applying rotation before distorting
    uv -= vec2(0.5);
    uv *= rotmat;
    uv += vec2(0.5);

    // Amplify distortions
    vec2 dstpivot = vec2( sin(min(distortion1 * 0.1, distortion2 * 0.1)),
                          cos(min(distortion1 * 0.1, distortion2 * 0.1)) ) * INVTHREE
                  - vec2( cos(max(distortion1 * 0.1, distortion2 * 0.1)),
                          sin(max(distortion1 * 0.1, distortion2 * 0.1)) ) * INVTHREE ;
    vec2 apivot = PIVOT - dstpivot;
    uv -= apivot;
    uv *= 1.13 + 1.33 * (cos(sqrt(max(distortion1, distortion2)) + 1.0) * 0.5);
    uv += apivot;

    // distorted distance
    float ddist = distance(uv, PIVOT) * 2.0;
    float alphaBright, alphaDim;

    // R'lyeh Ftagnh !
    float smooth = smoothstep(ratio * 0.95, ratio * 1.05, clamp(ddist, 0.0, 1.0));
    float inSmooth = min(smooth, 1.0 - smooth) * 2.0;
    
    // Creating the spooky membrane around the bright area
    vec3 membraneColor = vec3(1.0 - inSmooth);
   
    // Intensity modifier
    if ( darkness ) {
      alphaBright = 1.0 - pow(clamp(ratio - ddist, 0.0, 1.0), 0.75) * sqrt(2.0 - ddist);
      alphaDim =    1.0 - pow(clamp(1.0 - ddist, 0.0, 1.0), 0.65);
    } else {
      alphaBright = 1.0;
      alphaDim =    1.0;
    }

    float intensMod = intensity * 0.25;
    if ( !darkness && attenuation > 0.0 && ratio > 0.0 ) {
      finalColor = mix(colorBright * intensMod * (darkness ? 1.0 : 1.5), 
                       colorDim * intensMod, 
                       smoothstep(ratio * 0.8, clamp(ratio * 0.95, 0.0001, 1.0), clamp(ddist, 0.0, 1.0))) 
                       * min(alphaBright, alphaDim);
    } else finalColor = mix(colorDim, colorBright, step(ddist, ratio)) * min(alphaBright, alphaDim) * intensMod;
    
    finalColor *= membraneColor;
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Black Hole animation illumination shader
 * @extends {AdaptiveIlluminationShader}
 * @author SecretFire
 */
class BlackHoleIlluminationShader extends AdaptiveIlluminationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  // create an emanation composed of n beams, n = intensity
  vec3 beamsEmanation(in vec2 uv, in float dist, in vec3 pCol) {
    float angle = atan(uv.x, uv.y) * INVTWOPI;

    // Create the beams
    float beams = fract(angle * intensity + sin(dist * 30.0 - time));

    // Compose the final beams and reverse beams, to get a nice gradient on EACH side of the beams.
    beams = max(beams, 1.0 - beams);

    // Compute a darkness modifier.
    float darknessPower = (darkness ? pow(beams, 1.5) : 0.8);

    // Creating the effect : applying color and darkness power correction. saturate the entire output color.
    vec3 smoothie = smoothstep(0.2, 1.1 + (intensity * 0.1), beams * pCol * darknessPower);
    return ( darkness ? smoothie : pCol * (1.0 - beams) ) * intensity;
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 uvs = (2.0 * vUvs) - 1.0;
    
    vec3 pColorDim, pColorBright;
    if ( darkness ) {
      // palette of colors to give the darkness a disturbing purpleish tone
      pColorDim    = vec3(0.25, 0.10, 0.35);
      pColorBright = vec3(0.85, 0.80, 0.95);
    } else {
      pColorDim    = vec3(0.5);
      pColorBright = vec3(1.0);
    }
    
    // smooth mixing of the palette by distance from center and bright ratio
    vec3 pCol = mix(pColorDim, pColorBright, smoothstep(ratio * 0.9, ratio * 1.1, (darkness ? dist : 1.0 - dist) ));
    if ( darkness ) {
      finalColor = min(colorDim, 
                       mix(colorBright, 
                           beamsEmanation(uvs, dist, pCol), 
                           1.0 - sqrt(1.0 - dist)));
    } else {
      finalColor = mix(colorBright, 
                       mix(colorDim, 
                           beamsEmanation(uvs, dist, pCol), 
                           sqrt(dist)), (attenuation > 0.0 ? smoothstep(ratio * 0.8, clamp(ratio * 1.2, 0.0001, 1.0), dist) : step(1.0 - dist, ratio)) );      
    }
    
    // Apply darker components of colorDim and mixed emanations/colorBright.
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Vortex animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class VortexColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(4, 1.0)}
  ${this.PERCEIVED_BRIGHTNESS}

  vec2 vortex(in vec2 uv, in float dist, in float radius, in mat2 rotmat) {
    float intens = intensity * 0.2;
    vec2 uvs = uv - PIVOT;
    uv *= rotmat;

    if ( dist < radius ) {
      float sigma = (radius - dist) / radius;
      float theta = sigma * sigma * TWOPI * intens;
      float st = sin(theta);
      float ct = cos(theta);
      uvs = vec2(dot(uvs, vec2(ct, -st)), dot(uvs, vec2(st, ct)));
    }
    uvs += PIVOT;
    return uvs;
  }

  vec3 spice(in vec2 iuv, in mat2 rotmat) {

    // constructing the palette
    vec3 c1 = color * 0.55;
    vec3 c2 = color * 0.95;
    vec3 c3 = color * 0.45;
    vec3 c4 = color * 0.75;
    vec3 c5 = vec3(0.20);
    vec3 c6 = color * 1.2;

    // creating the deformation
    vec2 uv = iuv;
    uv -= PIVOT;
    uv *= rotmat;
    vec2 p = uv.xy * 6.0;
    uv += PIVOT;

    // time motion fbm and palette mixing
    float q = fbm(p + time);
    vec2 r = vec2(fbm(p + q + time * 0.9 - p.x - p.y), 
                  fbm(p + q + time * 0.6));
    vec3 c = mix(c1, 
                 c2, 
                 fbm(p + r)) + mix(c3, c4, r.x) 
                             - mix(c5, c6, r.y);
    // returning the color
    return c;
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    
    if ( !darkness ) {
      // Timed values
      float t = time * 0.5;
      float cost = cos(t);
      float sint = sin(t);

      // Rotation matrix
      mat2 vortexRotMat = mat2(cost, -sint, sint, cost);
      mat2 spiceRotMat = mat2(cost * 2.0, -sint * 2.0, sint * 2.0, cost * 2.0);

      // Creating vortex
      vec2 vuv = vortex(vUvs, dist, 1.0, vortexRotMat);

      // Applying spice
      finalColor = spice(vuv, spiceRotMat) * colorationAlpha;
      ${this.COLORATION_TECHNIQUES}
      ${this.ADJUSTMENTS}
      
    } else {
      finalColor = vec3(0.0);
    }
    
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Vortex animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class VortexIlluminationShader extends AdaptiveIlluminationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(4, 1.0)}
  ${this.PERCEIVED_BRIGHTNESS}

  vec2 vortex(in vec2 uv, in float dist, in float radius, in float angle, in mat2 rotmat) {
    vec2 uvs = uv - PIVOT;
    uv *= rotmat;

    if ( dist < radius ) {
      float sigma = (radius - dist) / radius;
      float theta = sigma * sigma * angle;
      float st = sin(theta);
      float ct = cos(theta);
      uvs = vec2(dot(uvs, vec2(ct, -st)), dot(uvs, vec2(st, ct)));
    }
    uvs += PIVOT;
    return uvs;
  }

  vec3 spice(in vec2 iuv, in mat2 rotmat) {
    // constructing the palette
    vec3 c1 = vec3(0.20);
    vec3 c2 = vec3(0.80);
    vec3 c3 = vec3(0.15);
    vec3 c4 = vec3(0.85);
    vec3 c5 = c3;
    vec3 c6 = vec3(0.9);

    // creating the deformation
    vec2 uv = iuv;
    uv -= PIVOT;
    uv *= rotmat;
    vec2 p = uv.xy * 6.0;
    uv += PIVOT;

    // time motion fbm and palette mixing
    float q = fbm(p + time);
    vec2 r = vec2(fbm(p + q + time * 0.9 - p.x - p.y), fbm(p + q + time * 0.6));

    // Mix the final color
    return mix(c1, c2, fbm(p + r)) + mix(c3, c4, r.x) - mix(c5, c6, r.y);
  }

  vec3 convertToDarknessColors(in vec3 col, in float dist) {
    float intens = intensity * 0.20;
    float lum = (col.r * 2.0 + col.g * 3.0 + col.b) * 0.5 * INVTHREE;
    float colorMod = smoothstep(ratio * 0.99, ratio * 1.01, dist);
    return mix(colorDim, colorBright * colorMod, 1.0 - smoothstep( 0.80, 1.00, lum)) *
                smoothstep( 0.25 * intens, 0.85 * intens, lum);
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    if ( darkness ) {
      // Timed values
      float t = time * 0.5;
      float cost = cos(t) * 2.0;
      float sint = sin(t) * 2.0;

      // Rotation matrix
      mat2 rotmatrix = mat2(cost, -sint, sint, cost);

      // Creating vortex
      vec2 svuv = vortex(vUvs, dist, 1.0, 6.24, rotmatrix);
      vec2 nvuv = vortex(vUvs, dist, 1.0, 2.12, rotmatrix);

      // Applying spice
      vec3 normalSpice = spice(nvuv, rotmatrix);
      finalColor = convertToDarknessColors( max(normalSpice, spice(svuv, rotmatrix)), dist );
    } else {
      ${this.TRANSITION}
    }
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Swirling rainbow animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class SwirlingRainbowColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.HSB2RGB}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}

    float intens = intensity * 0.1;
    vec2 nuv = vUvs * 2.0 - 1.0;
    vec2 puv = vec2(atan(nuv.x, nuv.y) * INVTWOPI + 0.5, length(nuv));
    vec3 rainbow = hsb2rgb(vec3(puv.x + puv.y - time * 0.2, 1.0, 1.0));
    finalColor = mix(color, rainbow, smoothstep(0.0, 1.5 - intens, dist))
                     * (1.0 - dist * dist * dist);
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Radial rainbow animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class RadialRainbowColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.HSB2RGB}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}

    float intens = intensity * 0.1;
    vec2 nuv = vUvs * 2.0 - 1.0;
    vec2 puv = vec2(atan(nuv.x, nuv.y) * INVTWOPI + 0.5, length(nuv)); 
    vec3 rainbow = hsb2rgb(vec3(puv.y - time * 0.2, 1.0, 1.0));
    finalColor = mix(color, rainbow, smoothstep(0.0, 1.5 - intens, dist))
                  * (1.0 - dist * dist * dist);
    
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Fairy light animation coloration shader
 * @extends {AdaptiveColorationShader}
 * @author SecretFire
 */
class FairyLightColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.HSB2RGB}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(3, 1.0)}
  ${this.PERCEIVED_BRIGHTNESS}

  void main() {
    ${this.FRAGMENT_BEGIN}
    
    // Creating distortion with vUvs and fbm
    float distortion1 = fbm(vec2( 
                        fbm(vUvs * 3.0 + time * 0.50), 
                        fbm((-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));
    
    float distortion2 = fbm(vec2(
                        fbm(-vUvs * 3.0 + time * 0.50),
                        fbm((-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));
    vec2 uv = vUvs;
      
    // time related var
    float t = time * 0.5;
    float tcos = 0.5 * (0.5 * (cos(t)+1.0)) + 0.25;
    float tsin = 0.5 * (0.5 * (sin(t)+1.0)) + 0.25;
    
    // Creating distortions with cos and sin : create fluidity
    uv -= PIVOT;
    uv *= tcos * distortion1;
    uv *= tsin * distortion2;
    uv *= fbm(vec2(time + distortion1, time + distortion2));
    uv += PIVOT;

    // Creating the rainbow
    float intens = intensity * 0.1;
    vec2 nuv = vUvs * 2.0 - 1.0;
    vec2 puv = vec2(atan(nuv.x, nuv.y) * INVTWOPI + 0.5, length(nuv));
    vec3 rainbow = hsb2rgb(vec3(puv.x + puv.y - time * 0.2, 1.0, 1.0));
    vec3 mixedColor = mix(color, rainbow, smoothstep(0.0, 1.5 - intens, dist));

    finalColor = distortion1 * distortion1 * 
                 distortion2 * distortion2 * 
                 mixedColor * colorationAlpha * (1.0 - dist * dist * dist) *
                 mix( uv.x + distortion1 * 4.5 * (intensity * 0.4),
                      uv.y + distortion2 * 4.5 * (intensity * 0.4), tcos);
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Fairy light animation illumination shader
 * @extends {AdaptiveIlluminationShader}
 * @author SecretFire
 */
class FairyLightIlluminationShader extends AdaptiveIlluminationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(3, 1.0)}

  void main() {
    ${this.FRAGMENT_BEGIN}
    
    // Creating distortion with vUvs and fbm
    float distortion1 = fbm(vec2( 
                        fbm(vUvs * 3.0 - time * 0.50), 
                        fbm((-vUvs + vec2(1.)) * 5.0 + time * INVTHREE)));
    
    float distortion2 = fbm(vec2(
                        fbm(-vUvs * 3.0 - time * 0.50),
                        fbm((-vUvs + vec2(1.)) * 5.0 - time * INVTHREE)));
      
    // linear interpolation motion
    float motionWave = 0.5 * (0.5 * (cos(time * 0.5) + 1.0)) + 0.25;
    ${this.TRANSITION}
    finalColor *= mix(distortion1, distortion2, motionWave);
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;
}

/* -------------------------------------------- */

/**
 * Alternative torch illumination shader
 * @extends {AdaptiveIlluminationShader}
 */
class FlameIlluminationShader extends AdaptiveIlluminationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}
  
  void main() {
    ${this.FRAGMENT_BEGIN}                          
    ${this.TRANSITION}
    finalColor *= brightnessPulse;
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = ({...super.defaultUniforms, brightnessPulse: 1});
}

/* -------------------------------------------- */

/**
 * Alternative torch coloration shader
 * @extends {AdaptiveColorationShader}
 */
class FlameColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBMHQ(3)}
  ${this.PERCEIVED_BRIGHTNESS}

  vec2 scale(in vec2 uv, in float scale) {
    mat2 scalemat = mat2(scale, 0.0, 0.0, scale);
    uv -= PIVOT; 
    uv *= scalemat;
    uv += PIVOT;
    return uv;
  }
  
  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 uv = scale(vUvs, 10.0 * ratio);
    
    float intens = pow(0.1 * intensity, 2.0);
    float fratioInner = ratio * (intens * 0.5) - 
                   (0.005 * 
                        fbm( vec2( 
                             uv.x + time * 8.01, 
                             uv.y + time * 10.72), 1.0));
    float fratioOuter = ratio - (0.007 * 
                        fbm( vec2( 
                             uv.x + time * 7.04, 
                             uv.y + time * 9.51), 2.0));
                             
    float fdist = max(dist - fratioInner * intens, 0.0);
    
    float flameDist = smoothstep(clamp(0.97 - fratioInner, 0.0, 1.0),
                                 clamp(1.03 - fratioInner, 0.0, 1.0),
                                 1.0 - fdist);
    float flameDistInner = smoothstep(clamp(0.95 - fratioOuter, 0.0, 1.0),
                                      clamp(1.05 - fratioOuter, 0.0, 1.0),
                                      1.0 - fdist);
                                 
    vec3 flameColor = color * 8.0;
    vec3 flameFlickerColor = color * 1.2;
    
    finalColor = mix(mix(color, flameFlickerColor, flameDistInner),
                     flameColor, 
                     flameDist) * brightnessPulse * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }
  `;

  /** @inheritdoc */
  static defaultUniforms = ({ ...super.defaultUniforms, brightnessPulse: 1});
}

/* -------------------------------------------- */

/**
 * A futuristic Force Grid animation.
 * @extends {AdaptiveColorationShader}
 */
class ForceGridColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}

  const float MAX_INTENSITY = 1.2;
  const float MIN_INTENSITY = 0.8;

  vec2 hspherize(in vec2 uv, in float dist) {
    float f = (1.0 - sqrt(1.0 - dist)) / dist;
    uv -= vec2(0.50);
    uv *= f * 5.0;
    uv += vec2(0.5);
    return uv;
  }

  float wave(in float dist) {
    float sinWave = 0.5 * (sin(time * 6.0 + pow(1.0 - dist, 0.10) * 35.0 * intensity) + 1.0);
    return ((MAX_INTENSITY - MIN_INTENSITY) * sinWave) + MIN_INTENSITY;
  }

  float fpert(in float d, in float p) {
    return max(0.3 - 
               mod(p + time + d * 0.3, 3.5),
               0.0) * intensity * 2.0;
  }

  float pert(in vec2 uv, in float dist, in float d, in float w) {
    uv -= vec2(0.5);
    float f = fpert(d, min( uv.y,  uv.x)) +
              fpert(d, min(-uv.y,  uv.x)) +
              fpert(d, min(-uv.y, -uv.x)) +
              fpert(d, min( uv.y, -uv.x));
    f *= f;
    return max(f, 3.0 - f) * w;
  }

  vec3 forcegrid(vec2 suv, in float dist) {
    vec2 uv = suv - vec2(0.2075, 0.2075);
    vec2 cid2 = floor(uv);
    float cid = (cid2.y + cid2.x);
    uv = fract(uv);
    float r = 0.3;
    float d = 1.0;
    float e;
    float c;

    for( int i = 0; i < 5; i++ ) {
      e = uv.x - r;
      c = clamp(1.0 - abs(e * 0.75), 0.0, 1.0);
      d += pow(c, 200.0) * (1.0 - dist);
      if ( e > 0.0 ) {
        uv.x = (uv.x - r) / (2.0 - r);
      } 
      uv = uv.yx;
    }

    float w = wave(dist);
    vec3 col = vec3(max(d - 1.0, 0.0)) * 1.8;
    col *= pert(suv, dist * intensity * 4.0, d, w);
    col += color * 0.30 * w;
    return col * color;
  }
  
  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 uvs = vUvs;
    uvs -= PIVOT;
    uvs *= intensity * 0.2;
    uvs += PIVOT;
    vec2 suvs = hspherize(uvs, dist);
    finalColor = forcegrid(suvs, dist) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }
  `;
}

/* -------------------------------------------- */

/**
 * A disco like star light.
 * @extends {AdaptiveColorationShader}
 */
class StarLightColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBM(2, 1.0)}

  vec2 transform(in vec2 uv, in float dist) {
    float t = time * 0.40;
    float cost = cos(t);
    float sint = sin(t);

    mat2 rotmat = mat2(cost, -sint, sint, cost);
    uv *= rotmat;
    return uv;
  }

  float makerays(in vec2 uv, in float t) {
    vec2 uvn = normalize(uv * (uv + t)) * (5.0 + intensity);
    return max(clamp(0.5 * tan(fbm(uvn - t)), 0.0, 2.25),
               clamp(3.0 - tan(fbm(uvn + t * 2.0)), 0.0, 2.25));
  }

  float starlight(in float dist) {
    vec2 uv = (vUvs - 0.5);
    uv = transform(uv, dist);
    float rays = makerays(uv, time);
    return pow(1.0 - dist, rays) * pow(1.0 - dist, 0.25);
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    finalColor = clamp(color * starlight(dist) * colorationAlpha, 0.0, 1.0);
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }
  `;
}

/* -------------------------------------------- */

/**
 * A patch of smoke
 * @extends {AdaptiveColorationShader}
 */
class SmokePatchColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBMHQ(3)}
  
  vec2 transform(in vec2 uv, in float dist) {
    float t = time * 0.1;
    float cost = cos(t);
    float sint = sin(t);

    mat2 rotmat = mat2(cost, -sint, sint, cost);
    mat2 scalemat = mat2(10.0, uv.x, uv.y, 10.0);
    uv -= PIVOT;
    uv *= (rotmat * scalemat);
    uv += PIVOT;
    return uv;
  }

  float smokefading(in float dist) {
    float t = time * 0.4;
    vec2 uv = transform(vUvs, dist);
    return pow(1.0 - dist, 
      mix(fbm(uv, 1.0 + intensity * 0.4), 
        max(fbm(uv + t, 1.0),
            fbm(uv - t, 1.0)), 
          pow(dist, intensity * 0.5)));
  }

  void main() {
    ${this.FRAGMENT_BEGIN}
    finalColor = color * smokefading(dist) * colorationAlpha;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }
  `;
}

/* -------------------------------------------- */

/**
 * A patch of smoke
 * @extends {AdaptiveIlluminationShader}
 */
class SmokePatchIlluminationShader extends AdaptiveIlluminationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  ${this.PERCEIVED_BRIGHTNESS}
  ${this.PRNG}
  ${this.NOISE}
  ${this.FBMHQ(3)}

  vec2 transform(in vec2 uv, in float dist) {
    float t = time * 0.1;
    float cost = cos(t);
    float sint = sin(t);

    mat2 rotmat = mat2(cost, -sint, sint, cost);
    mat2 scalemat = mat2(10.0, uv.x, uv.y, 10.0);
    uv -= PIVOT;
    uv *= (rotmat * scalemat);
    uv += PIVOT;
    return uv;
  }
  
  float smokefading(in float dist) {
    float t = time * 0.4;
    vec2 uv = transform(vUvs, dist);
    return pow(1.0 - dist,
      mix(fbm(uv, 1.0 + intensity * 0.4),
        max(fbm(uv + t, 1.0),
            fbm(uv - t, 1.0)),
        pow(dist, intensity * 0.5)));
  }

  void main() {
    ${this.FRAGMENT_BEGIN}                          
    ${this.TRANSITION}
    if ( darkness ) finalColor = mix(framebufferColor, finalColor, smokefading(dist) * 2.0);
    else finalColor *= smokefading(dist);
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }
  `;
}

/* -------------------------------------------- */

/**
 * Revolving animation coloration shader
 * @extends {AdaptiveColorationShader}
 */
class RevolvingColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  uniform float gradientFade;
  uniform float beamLength;
  
  ${this.PERCEIVED_BRIGHTNESS}
  ${this.PIE}
  ${this.ROTATION}

  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 ncoord = vUvs * 2.0 - 1.0;
    float angularIntensity = mix(PI, PI * 0.5, intensity * 0.1);
    ncoord *= rot(angle + time);
    float angularCorrection = pie(ncoord, angularIntensity, gradientFade, beamLength);
    finalColor = color * colorationAlpha * angularCorrection;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }
  `;

  /** @inheritdoc */
  static defaultUniforms = ({
    ...super.defaultUniforms,
    angle: 0,
    gradientFade: 0.15,
    beamLength: 1
  });
}

/* -------------------------------------------- */

/**
 * Siren light animation coloration shader
 * @extends {AdaptiveColorationShader}
 */
class SirenColorationShader extends AdaptiveColorationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  uniform float gradientFade;
  uniform float beamLength;
  
  ${this.PERCEIVED_BRIGHTNESS}
  ${this.PIE}
  ${this.ROTATION}

  void main() {
    ${this.FRAGMENT_BEGIN}
    vec2 ncoord = vUvs * 2.0 - 1.0;
    float angularIntensity = mix(PI, 0.0, intensity * 0.1);
    ncoord *= rot(time * 50.0 + angle);
    float angularCorrection = pie(ncoord, angularIntensity, clamp(gradientFade * dist, 0.05, 1.0), beamLength);
    finalColor = color * brightnessPulse * colorationAlpha * angularCorrection;
    ${this.COLORATION_TECHNIQUES}
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }
  `;

  /** @inheritdoc */
  static defaultUniforms = ({
    ...super.defaultUniforms,
    ratio: 0,
    brightnessPulse: 1,
    angle: 0,
    gradientFade: 0.15,
    beamLength: 1
  });
}

/* -------------------------------------------- */

/**
 * Siren light animation illumination shader
 * @extends {AdaptiveIlluminationShader}
 */
class SirenIlluminationShader extends AdaptiveIlluminationShader {
  static fragmentShader = `
  ${this.SHADER_HEADER}
  uniform float gradientFade;
  uniform float beamLength;
  
  ${this.PERCEIVED_BRIGHTNESS}
  ${this.PIE}
  ${this.ROTATION}

  void main() {
    ${this.FRAGMENT_BEGIN}
    ${this.TRANSITION}
    vec2 ncoord = vUvs * 2.0 - 1.0;
    float angularIntensity = mix(PI, 0.0, intensity * 0.1);
    ncoord *= rot(time * 50.0 + angle);
    float angularCorrection = mix(1.0, pie(ncoord, angularIntensity, clamp(gradientFade * dist, 0.05, 1.0), beamLength), 0.5);
    finalColor *= angularCorrection;
    ${this.ADJUSTMENTS}
    ${this.FALLOFF}
    ${this.FRAGMENT_END}
  }`;

  /** @inheritdoc */
  static defaultUniforms = ({
    ...super.defaultUniforms,
    angle: 0,
    gradientFade: 0.45,
    beamLength: 1
  });
}



