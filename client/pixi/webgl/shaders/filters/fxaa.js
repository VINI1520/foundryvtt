/**
 * A FXAA filter based on PIXI.FXAA and slightly improved.
 * In brief: The FXAA filter is computing the luma of neighbour pixels and apply correction according to the
 * difference. A high luma reduction is reducing correction while a low luma reduction is reinforcing it.
 * @param {string} [vertex=AdaptiveFXAAFilter.vertexShader]       Optional vertex shader
 * @param {string} [fragment=AdaptiveFXAAFilter.fragmentShader]   Optional fragment shader
 * @param {object} [uniforms=AdaptiveFXAAFilter.defaultUniforms]  Optional uniforms
 * @param {object} [options={}]                                   Additional options (token knockout, ...)
 */
class AdaptiveFXAAFilter extends AbstractBaseFilter {
  constructor(vertex, fragment, uniforms, options={}) {
    super(vertex ?? AdaptiveFXAAFilter.vertexShader,
      fragment ?? AdaptiveFXAAFilter.fragmentShader,
      uniforms ?? AdaptiveFXAAFilter.defaultUniforms);

    // Handle token knockout option
    const tko = this.uniforms.tokenKnockout = (options.tokenKnockout ??= true);
    if ( tko ) this.uniforms.tokenTexture = canvas.primary.tokensRenderTexture;
  }

  /** @override */
  static defaultUniforms = {
    lumaMinimum: 0.0078125,   // The minimum luma reduction applied
    lumaReduction: 0.125,     // The luma reduction applied. High value, less blur
    spanMax: 8,               // Maximum distance at which luma comparisons are made
    tokenKnockout: true,      // If tokens should be excluded from the FXAA
    tokenTexture: null,       // Inverse occlusion token texture (if token exclusion is activated)
    screenDimensions: [1, 1]  // Necessary if token exclusion is activated
  };

  /* -------------------------------------------- */

  /** @override */
  static vertexShader = `
  attribute vec2 aVertexPosition;
  uniform mat3 projectionMatrix;
  
  varying vec2 vcNW;
  varying vec2 vcNE;
  varying vec2 vcSW;
  varying vec2 vcSE;
  varying vec2 vcM;
  varying vec2 vFilterCoord;
  varying vec2 vMaskTextureCoord;
  
  uniform bool tokenKnockout;
  uniform vec2 screenDimensions;
  uniform vec4 inputSize;
  uniform vec4 outputFrame;
  
  vec4 filterVertexPosition() {
      vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;
      return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
  }

  // Compute coord for a screen sized mask render texture
  vec2 filterMaskTextureCoord() {
    return (  aVertexPosition * (outputFrame.zw * inputSize.zw)
            * inputSize.xy + outputFrame.xy) / screenDimensions;
  }
  
  void main(void) {
      gl_Position = filterVertexPosition();
      vFilterCoord = aVertexPosition * outputFrame.zw;
      if ( tokenKnockout ) vMaskTextureCoord = filterMaskTextureCoord();
      vcNW = (vFilterCoord + vec2(-1.0, -1.0)) * inputSize.zw;
      vcNE = (vFilterCoord + vec2(1.0, -1.0)) * inputSize.zw;
      vcSW = (vFilterCoord + vec2(-1.0, 1.0)) * inputSize.zw;
      vcSE = (vFilterCoord + vec2(1.0, 1.0)) * inputSize.zw;
      vcM = vec2(vFilterCoord * inputSize.zw);
  }
  `;

  /** @override */
  static fragmentShader = `
    ${this.CONSTANTS}
    ${this.PERCEIVED_BRIGHTNESS}
   
    varying vec2 vcNW;
    varying vec2 vcNE;
    varying vec2 vcSW;
    varying vec2 vcSE;
    varying vec2 vcM;
    
    varying vec2 vFilterCoord;
    varying vec2 vMaskTextureCoord;
    uniform sampler2D uSampler;
    uniform sampler2D tokenTexture;
    uniform highp vec4 inputSize;
    uniform float lumaMinimum;
    uniform float lumaReduction;
    uniform float spanMax;
    uniform bool tokenKnockout;
    
    vec4 fxaa(in sampler2D tex, in vec2 uv, in vec2 iiSP) {
      vec4 color;
      
      // Get neighbour pixels
      vec3 rgbNW = texture2D(tex, vcNW).rgb;
      vec3 rgbNE = texture2D(tex, vcNE).rgb;
      vec3 rgbSW = texture2D(tex, vcSW).rgb;
      vec3 rgbSE = texture2D(tex, vcSE).rgb;
      
      // Get the central pixel
      vec4 texColor = texture2D(tex, vcM);
      vec3 rgbM  = texColor.rgb;
      
      // Compute the luma for each pixel
      float lumaNW = perceivedBrightness(rgbNW);
      float lumaNE = perceivedBrightness(rgbNE);
      float lumaSW = perceivedBrightness(rgbSW);
      float lumaSE = perceivedBrightness(rgbSE);
      float lumaM  = perceivedBrightness(rgbM);
      
      // Get the luma max and min for the neighbour pixels
      float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
      float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
      
      // Get direction of the luma shift
      mediump vec2 dir;
      dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
      dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));
      
      // Compute luma reduction
      float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * lumaReduction), lumaMinimum);
  
      // Apply luma shift and reduction
      float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
      dir = min(vec2(spanMax, spanMax), max(vec2(-spanMax, -spanMax), dir * rcpDirMin)) * iiSP;
      
      // Get the new points
      vec3 rgbA = 0.5 * (
                         texture2D(tex, uv * iiSP + dir * (1.0 / 3.0 - 0.5)).rgb +
                         texture2D(tex, uv * iiSP + dir * (2.0 / 3.0 - 0.5)).rgb
                        );
      vec3 rgbB = rgbA * 0.5 + 0.25 * (
                                       texture2D(tex, uv * iiSP + dir * -0.5).rgb +
                                       texture2D(tex, uv * iiSP + dir * 0.5).rgb
                                      );
      
      // Compare with luma min and max and apply the best choice
      float lumaB = perceivedBrightness(rgbB);
      if ( (lumaB < lumaMin) || (lumaB > lumaMax) ) color = vec4(rgbA, texColor.a);
      else color = vec4(rgbB, texColor.a);
      
      // Exclude the token from the FXAA if necessary
      if ( tokenKnockout ) {
        float tokenIoTex = texture2D(tokenTexture, vMaskTextureCoord).a;
        return mix(color, texColor, tokenIoTex);
      }
      else return color;
    }
    
    void main() {
      vec4 color;
      color = fxaa(uSampler, vFilterCoord, inputSize.zw);
      gl_FragColor = color;
    }
  `;

  /* -------------------------------------------- */

  /** @override */
  apply(filterManager, input, output, clear, currentState) {
    // Adapt the FXAA to the zoom level, to avoid the blurry effect
    this.uniforms.lumaReduction = this._computeLumaReduction();

    // Get values necessary for token exclusion
    if ( this.uniforms.tokenKnockout ) this.uniforms.screenDimensions = canvas.screenDimensions;

    filterManager.applyFilter(this, input, output, clear);
  }

  /* -------------------------------------------- */

  /**
   * Compute the luma reduction according to the stage zoom level (worldTransform.d)
   * The zoom level is converted to a range [0.xxx => max zoom out , 1 => max zoom in]
   * With zoom out, the reduction tends to high value, the antialias is discrete to avoid blurring side effect.
   * With zoom in, the reduction tends to low value, the antialias is important.
   * FXAA checks local contrast to avoid processing non-edges (high contrast difference === edge):
   * 0.6 and 0.02 are factors applied to the "contrast range", to apply or not a contrast blend.
   * With small values, the contrast blend is applied more often than with high values.
   * @returns {number} The luma reduction
   * @protected
   */
  _computeLumaReduction() {
    const max = CONFIG.Canvas.maxZoom;
    const zoom = canvas.stage.worldTransform.d / max;
    return Math.mix(0.6, 0.02, zoom);
  }
}
