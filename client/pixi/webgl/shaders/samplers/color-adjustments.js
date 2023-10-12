/**
 * A color adjustment shader.
 */
class ColorAdjustmentsSamplerShader extends BaseSamplerShader {

  /** @override */
  static classPluginName = null;

  /** @inheritdoc */
  static fragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    uniform sampler2D sampler;
    uniform vec4 tintAlpha;
    uniform vec3 tint;
    uniform float exposure;
    uniform float contrast;
    uniform float saturation;
    uniform float brightness;
    uniform float darknessLevel;
    uniform bool linkedToDarknessLevel;
    varying vec2 vUvs;
    
    ${this.CONSTANTS}
    ${this.PERCEIVED_BRIGHTNESS}
    
    void main() {
      vec4 baseColor = texture2D(sampler, vUvs);
  
      if ( baseColor.a > 0.0 ) {
        // Unmultiply rgb with alpha channel
        baseColor.rgb /= baseColor.a;
        
        // Copy original color before update
        vec3 originalColor = baseColor.rgb;
        
        ${this.ADJUSTMENTS}

        // Multiply rgb with alpha channel
        if ( linkedToDarknessLevel == true ) baseColor.rgb = mix(originalColor, baseColor.rgb, darknessLevel);
        baseColor.rgb *= (tint * baseColor.a);
      }
  
      // Output with tint and alpha
      gl_FragColor = baseColor * tintAlpha;
    }`;

  /** @inheritdoc */
  static defaultUniforms = {
    tintAlpha: [1, 1, 1, 1],
    tint: [1, 1, 1],
    contrast: 0,
    saturation: 0,
    exposure: 0,
    sampler: null,
    linkedToDarknessLevel: false,
    darknessLevel: 1
  };

  get linkedToDarknessLevel() {
    return this.uniforms.linkedToDarknessLevel;
  }

  set linkedToDarknessLevel(link) {
    this.uniforms.linkedToDarknessLevel = link;
  }

  get darknessLevel() {
    return this.uniforms.darknessLevel;
  }

  set darknessLevel(darknessLevel) {
    this.uniforms.darknessLevel = darknessLevel;
  }

  get contrast() {
    return this.uniforms.contrast;
  }

  set contrast(contrast) {
    this.uniforms.contrast = contrast;
  }

  get exposure() {
    return this.uniforms.exposure;
  }

  set exposure(exposure) {
    this.uniforms.exposure = exposure;
  }

  get saturation() {
    return this.uniforms.saturation;
  }

  set saturation(saturation) {
    this.uniforms.saturation = saturation;
  }
}

/* -------------------------------------------- */

/**
 * A light amplification shader.
 */
class AmplificationSamplerShader extends ColorAdjustmentsSamplerShader {

  /** @override */
  static classPluginName = null;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static fragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    uniform sampler2D sampler;
    uniform vec4 tintAlpha;
    uniform vec3 tint;
    uniform float exposure;
    uniform float contrast;
    uniform float saturation;
    uniform float brightness;
    uniform float darknessLevel;
    uniform bool enable;
    varying vec2 vUvs;
    
    ${this.CONSTANTS}
    ${this.PERCEIVED_BRIGHTNESS}
    
    void main() {
      vec4 baseColor = texture2D(sampler, vUvs);
  
      if ( enable && baseColor.a > 0.0 ) {
        // Unmultiply rgb with alpha channel
        baseColor.rgb /= baseColor.a;

        float lum = perceivedBrightness(baseColor.rgb);
        vec3 vision = vec3(smoothstep(0.0, 1.0, lum * 1.5)) * tint;
        baseColor.rgb = vision + (vision * (lum + brightness) * 0.1) + (baseColor.rgb * (1.0 - darknessLevel) * 0.125);
        
        ${this.ADJUSTMENTS}

        // Multiply rgb with alpha channel
        baseColor.rgb *= baseColor.a;
      }

      // Output with tint and alpha
      gl_FragColor = baseColor * tintAlpha;
    }`;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static defaultUniforms = {
    tintAlpha: [1, 1, 1, 1],
    tint: [0.38, 0.8, 0.38],
    brightness: 0,
    darknessLevel: 1,
    enable: true
  };

  /* -------------------------------------------- */

  /**
   * Level of natural brightness (opposed to darkness level).
   * @type {number}
   */
  get darknessLevel() {
    return this.uniforms.darknessLevel;
  }

  set darknessLevel(darknessLevel) {
    this.uniforms.darknessLevel = darknessLevel;
  }

  /**
   * Brightness controls the luminosity.
   * @type {number}
   */
  get brightness() {
    return this.uniforms.brightness;
  }

  set brightness(brightness) {
    this.uniforms.brightness = brightness;
  }

  /**
   * Tint color applied to Light Amplification.
   * @type {number[]}       Light Amplification tint (default: [0.48, 1.0, 0.48]).
   */
  get colorTint() {
    return this.uniforms.colorTint;
  }

  set colorTint(color) {
    this.uniforms.colorTint = color;
  }
}

