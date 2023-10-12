/**
 * A batch shader generator that could handle extra uniforms during initialization.
 */
class BatchShaderGenerator extends PIXI.BatchShaderGenerator {
  constructor(vertexSrc, fragTemplate, batchDefaultUniforms) {
    super(vertexSrc, fragTemplate);
    this._batchDefaultUniforms = batchDefaultUniforms?.bind(this);
  }

  /**
   * Extra uniforms that could be handled by a custom batch shader.
   * @type {Function|undefined}
   */
  _batchDefaultUniforms;

  /* -------------------------------------------- */

  /** @override */
  generateShader(maxTextures) {
    if ( !this.programCache[maxTextures] ) {

      const sampleValues = Int32Array.from({length: maxTextures}, (n, i) => i);

      this.defaultGroupCache[maxTextures] = PIXI.UniformGroup.from({ uSamplers: sampleValues }, true);
      let fragmentSrc = this.fragTemplate;
      fragmentSrc = fragmentSrc.replace(/%count%/gi, `${maxTextures}`);
      fragmentSrc = fragmentSrc.replace(/%forloop%/gi, this.generateSampleSrc(maxTextures));
      this.programCache[maxTextures] = new PIXI.Program(this.vertexSrc, fragmentSrc);
    }

    // Constructing the standard uniforms for batches
    const uniforms = {
      tint: new Float32Array([1, 1, 1, 1]),
      translationMatrix: new PIXI.Matrix(),
      default: this.defaultGroupCache[maxTextures]
    };

    // Adding the extra uniforms
    if ( this._batchDefaultUniforms ) foundry.utils.mergeObject(uniforms, this._batchDefaultUniforms(maxTextures));

    return new PIXI.Shader(this.programCache[maxTextures], uniforms);
  }
}
