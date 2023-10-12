/**
 * A shader used to control channels intensity using an externally provided mask texture.
 */
class InverseOcclusionSamplerShader extends BaseSamplerShader {

  /** @override */
  static classPluginName = null;

  /** @inheritdoc */
  static defaultUniforms = {
    roof: false,
    vision: false,
    tintAlpha: [1, 1, 1, 1],
    depthElevation: 0,
    sampler: null,
    maskSampler: null,
    alpha: 1.0,
    alphaOcclusion: 1.0,
    screenDimensions: [1, 1],
    pixelRatio: [1, 1]
  };

  /** @inheritdoc */
  static vertexShader = `
    precision ${PIXI.settings.PRECISION_VERTEX} float;
    attribute vec2 aVertexPosition;
    attribute vec2 aTextureCoord;
    uniform mat3 projectionMatrix;
    uniform vec2 screenDimensions;
    varying vec2 vUvsMask;
    varying vec2 vUvs;
  
    void main() {
      vUvs = aTextureCoord;
      vUvsMask = aVertexPosition / screenDimensions;
      gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    }
  `;

  /** @inheritdoc */
  static fragmentShader(sampleSize) {
    return `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    varying vec2 vUvs;
    varying vec2 vUvsMask;
    uniform vec2 pixelRatio;
    uniform vec4 tintAlpha;
    uniform sampler2D sampler;
    uniform sampler2D maskSampler;
    uniform float alphaOcclusion;
    uniform float alpha;
    uniform float depthElevation;
    uniform bool roof;
    uniform bool vision;
    
    const float sampleSize = ${sampleSize.toFixed(1)};
    const float isqrSampleSize = 1.0 / (sampleSize * sampleSize);
    const float start = floor(-sampleSize * 0.5);
    const float end = abs(start);
    
    // Get the mask value with the required step
    float getSample(in vec2 vs) {
      vec4 otex = texture2D(maskSampler, vUvsMask + vs);
      float occlusionElevation = roof ? otex.g : (vision ? otex.b : otex.g);
      return (1.0 - step(depthElevation, occlusionElevation));
    }
    
    void main() {
      float tex = 0.0;
      
      // Activate blur for vision occlusion or for non-roof overhead with radial and if sampleSize > 0.0
      bool activateBlur = (vision || (!vision && !roof)) && (sampleSize > 0.0);
      
      // Box-2-Box blur
      if ( !activateBlur ) tex = getSample(vec2(0.0));
      else {
        for ( float x = start; x < end; x += 1.0 ) {
          for ( float y = start; y < end; y += 1.0 ) {
            tex += (getSample(pixelRatio * vec2(x, y) * 0.0033) * isqrSampleSize);
          }
        }
      }
      
      float mask = 1.0 - tex + (alphaOcclusion * tex);
      float calpha = tex + alpha * (1.0 - tex);
      gl_FragColor = texture2D(sampler, vUvs) * mask * calpha * tintAlpha;
    }
  `;
  }

  /* -------------------------------------------- */

  /**
   * A factory method for creating the shader using its defined default values
   * @param {object} defaultUniforms
   * @returns {AbstractBaseShader}
   */
  static create(defaultUniforms) {
    let sampleSize = 0;
    if ( canvas.performance.mode === CONST.CANVAS_PERFORMANCE_MODES.HIGH ) sampleSize = 3;
    else if ( canvas.performance.mode === CONST.CANVAS_PERFORMANCE_MODES.MAX ) sampleSize = 5;
    const program = PIXI.Program.from(this.vertexShader, this.fragmentShader(sampleSize));
    const uniforms = mergeObject(this.defaultUniforms, defaultUniforms, {inplace: false, insertKeys: false});
    return new this(program, uniforms);
  }

  /* -------------------------------------------- */

  /** @override */
  _preRender(mesh) {
    super._preRender(mesh);
    this.uniforms.roof = mesh.isRoof;
    this.uniforms.vision = (mesh.data.occlusion.mode === CONST.OCCLUSION_MODES.VISION);
    this.uniforms.screenDimensions = canvas.screenDimensions;
    const zoom = canvas.stage.worldTransform.d;
    this.uniforms.pixelRatio[0] = (Math.min(canvas.screenDimensions[0], canvas.screenDimensions[1])
      / canvas.screenDimensions[0]) * zoom;
    this.uniforms.pixelRatio[1] = (Math.min(canvas.screenDimensions[0], canvas.screenDimensions[1])
      / canvas.screenDimensions[1]) * zoom;
    const renderTexture = this.uniforms.roof ? canvas.masks.depth.renderTexture : canvas.masks.occlusion.renderTexture;
    if ( this.uniforms.maskSampler !== renderTexture ) this.uniforms.maskSampler = renderTexture;
  }
}
