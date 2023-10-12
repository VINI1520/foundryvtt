/**
 * An occlusion shader to reveal certain area with elevation comparisons.
 * This shader is also working as a batched plugin.
 */
class OcclusionSamplerShader extends BaseSamplerShader {

  /* -------------------------------------------- */
  /*  Batched version Rendering                   */
  /* -------------------------------------------- */

  /** @override */
  static classPluginName = "occlusion";

  /** @override */
  static reservedTextureUnits = 1; // We need a texture unit for the occlusion texture

  /** @override */
  static batchDefaultUniforms(maxTex) {
    return {
      screenDimensions: [1, 1],
      occlusionTexture: maxTex
    };
  }

  /** @override */
  static _preRenderBatch(batchRenderer) {
    batchRenderer.renderer.texture.bind(canvas.masks.occlusion.renderTexture, batchRenderer.maxTextures);
    batchRenderer._shader.uniforms.screenDimensions = canvas.screenDimensions;
  }

  /** @override */
  static batchVertexSize = 7;

  /* ---------------------------------------- */

  /** @override */
  static initializeBatchGeometry() {
    this.batchGeometry =
      class BatchGeometry extends PIXI.Geometry {
        /** @override */
        constructor(_static = false) {
          super();
          this._buffer = new PIXI.Buffer(null, _static, false);
          this._indexBuffer = new PIXI.Buffer(null, _static, true);

          // We need to put all the attributes that will be packed into the geometries.
          // For the occlusion batched shader, we need:
          // all things for the standard batching: tint, texture id, etc.
          // and specific to this sampler: occlusion mode.
          // For a size of 8 * 32 bits values (batchVertexSize = 7)
          this.addAttribute("aVertexPosition", this._buffer, 2, false, PIXI.TYPES.FLOAT)
            .addAttribute("aTextureCoord", this._buffer, 2, false, PIXI.TYPES.FLOAT)
            .addAttribute("aColor", this._buffer, 4, true, PIXI.TYPES.UNSIGNED_BYTE)
            .addAttribute("aTextureId", this._buffer, 1, true, PIXI.TYPES.FLOAT)
            .addAttribute("aOcclusionMode", this._buffer, 1, true, PIXI.TYPES.FLOAT)
            .addIndex(this._indexBuffer);
        }
      };
  }

  /* ---------------------------------------- */

  /** @override */
  static _packInterleavedGeometry(element, attributeBuffer, indexBuffer, aIndex, iIndex) {
    const {uint32View, float32View} = attributeBuffer;

    const packedVertices = aIndex / this.vertexSize;
    const uvs = element.uvs;
    const indices = element.indices;
    const occlusionMode = element.occlusionMode;
    const vertexData = element.vertexData;
    const textureId = element._texture.baseTexture._batchLocation;
    const argb = element._tintRGB + (element.worldAlpha * 255 << 24);

    for ( let i = 0; i < vertexData.length; i += 2 ) {
      float32View[aIndex++] = vertexData[i];
      float32View[aIndex++] = vertexData[i + 1];
      float32View[aIndex++] = uvs[i];
      float32View[aIndex++] = uvs[i + 1];
      uint32View[aIndex++] = argb;
      float32View[aIndex++] = textureId;
      float32View[aIndex++] = occlusionMode;
    }

    for ( let i = 0; i < indices.length; i++ ) {
      indexBuffer[iIndex++] = packedVertices + indices[i];
    }
  }

  /* ---------------------------------------- */

  /** @override */
  static batchVertexShader = `
    precision ${PIXI.settings.PRECISION_VERTEX} float;
    attribute vec2 aVertexPosition;
    attribute vec2 aTextureCoord;
    attribute vec4 aColor;
    attribute float aTextureId;
    attribute float aOcclusionMode;
    
    uniform mat3 projectionMatrix;
    uniform mat3 translationMatrix;
    uniform vec4 tint;
    uniform vec2 screenDimensions;
    
    varying vec2 vTextureCoord;
    varying vec4 vColor;
    varying float vTextureId;
    varying vec2 vSamplerUvs;
    varying float vDepthElevation;
    varying float vOcclusionMode;
    
    void main(void) {
        vec3 tPos = translationMatrix * vec3(aVertexPosition, 1.0);
        vSamplerUvs = tPos.xy / screenDimensions;
        vTextureCoord = aTextureCoord;
        vTextureId = aTextureId;
        vColor = aColor;
        vOcclusionMode = aOcclusionMode;
        gl_Position = vec4((projectionMatrix * tPos).xy, 0.0, 1.0);
    }
  `;

  /** @override */
  static batchFragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    varying vec2 vTextureCoord;
    varying vec2 vSamplerUvs;
    varying vec4 vColor;
    varying float vTextureId;
    varying float vOcclusionMode;    
    uniform sampler2D occlusionTexture;
    uniform sampler2D uSamplers[%count%];
    
    void main(void) {
      vec4 color;
      %forloop%
      
      float rAlpha = 1.0 - step(color.a, 0.75);
      vec4 oTex = texture2D(occlusionTexture, vSamplerUvs);
      
      vec3 tint = vColor.rgb;
      tint.rgb *= rAlpha;
      tint.g *= vColor.a;
      tint.b *= (256.0 / 255.0) - vColor.a;
      
      if ( vOcclusionMode == ${CONST.OCCLUSION_MODES.RADIAL.toFixed(1)} ) {
        float oAlpha = step(vColor.a, oTex.g);
        tint.g *= oAlpha;
        // Weather is masked in the parts of the roof that are cut out.
        tint.b *= 1.0 - oAlpha;
      } 
      else if ( vOcclusionMode == ${CONST.OCCLUSION_MODES.VISION.toFixed(1)} ) {
        float oAlpha = step(vColor.a, oTex.b);
        tint.g *= oAlpha;
        tint.b *= 1.0 - oAlpha;
      }

      gl_FragColor = vec4(tint, 1.0);
    }
  `;

  /* -------------------------------------------- */
  /*  Non-Batched version Rendering               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static vertexShader = `
    precision ${PIXI.settings.PRECISION_VERTEX} float;
    attribute vec2 aVertexPosition;
    attribute vec2 aTextureCoord;
    uniform mat3 projectionMatrix;
    uniform vec2 screenDimensions;
    varying vec2 vUvs;
    varying vec2 vSamplerUvs;
  
    void main() {
      vUvs = aTextureCoord;
      vSamplerUvs = aVertexPosition / screenDimensions;
      gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
    }
  `;

  /** @inheritdoc */
  static fragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    uniform sampler2D sampler;
    uniform sampler2D occlusionTexture;
    uniform vec4 tintAlpha;
    uniform float occlusionMode;
    varying vec2 vUvs;
    varying vec2 vSamplerUvs;
    
    void main() {
      float rAlpha = 1.0 - step(texture2D(sampler, vUvs).a, 0.75);
      vec4 oTex = texture2D(occlusionTexture, vSamplerUvs);
      vec3 tint = 1.0 - step(tintAlpha.rgb, vec3(0.0));
      tint.rgb *= rAlpha;
      tint.g *= tintAlpha.a;
      tint.b *= (256.0 / 255.0) - tintAlpha.a;
           
      if ( occlusionMode == ${CONST.OCCLUSION_MODES.RADIAL.toFixed(1)} ) {
        float oAlpha = step(tintAlpha.a, oTex.g);
        tint.g *= oAlpha;
        tint.b *= 1.0 - oAlpha;
      } 
      else if ( occlusionMode == ${CONST.OCCLUSION_MODES.VISION.toFixed(1)} ) {
        float oAlpha = step(tintAlpha.a, oTex.b);
        tint.g *= oAlpha;
        tint.b *= 1.0 - oAlpha;
      }
      gl_FragColor = vec4(tint, 1.0);
    }
  `;

  /** @inheritdoc */
  static defaultUniforms = {
    tintAlpha: [1, 1, 1, 1],
    sampler: null,
    occlusionTexture: null,
    occlusionMode: 0,
    screenDimensions: [1, 1]
  };

  /** @override */
  _preRender(mesh) {
    super._preRender(mesh);
    if ( !this.uniforms.occlusionTexture ) {
      this.uniforms.occlusionTexture = canvas.masks.occlusion.renderTexture;
    }
    this.uniforms.occlusionMode = mesh.document.occlusion.mode;
    this.uniforms.screenDimensions = canvas.screenDimensions;
  }
}
