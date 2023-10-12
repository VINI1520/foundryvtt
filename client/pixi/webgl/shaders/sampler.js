/**
 * A simple shader to emulate a PIXI.Sprite with a PIXI.SpriteMesh
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

/* ---------------------------------------- */

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
    sampler: 0,
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

/* ---------------------------------------- */

/**
 * A color adjustment shader.
 */
class TokenInvisibilitySamplerShader extends BaseSamplerShader {

  /** @override */
  static classPluginName = null;

  /** @inheritdoc */
  static fragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    uniform sampler2D sampler;
    uniform vec4 tintAlpha;
    uniform vec3 color;
    uniform float alpha;
    uniform bool enable;
    varying vec2 vUvs;
    
    ${this.CONSTANTS}
    ${this.PERCEIVED_BRIGHTNESS}
    
    void main() {
      vec4 baseColor = texture2D(sampler, vUvs);
  
      if ( baseColor.a > 0.0 ) {
        // Unmultiply rgb with alpha channel
        baseColor.rgb /= baseColor.a;

        // Computing halo
        float lum = perceivedBrightness(baseColor.rgb);
        vec3 haloColor = vec3(lum) * color;
        float halo = smoothstep(0.0, 0.4, lum);
        
        // Construct final image
        baseColor.a *= halo * alpha;
        baseColor.rgb = mix(baseColor.rgb * baseColor.a, haloColor * baseColor.a, 0.65);
      }
  
      // Output with tint and alpha
      gl_FragColor = baseColor * tintAlpha;
    }`;

  /** @inheritdoc */
  static defaultUniforms = {
    tintAlpha: [1, 1, 1, 1],
    sampler: 0,
    color: [0.25, 0.35, 1.0],
    alpha: 0.8
  };
}

/* ---------------------------------------- */

/**
 * A monochromatic shader.
 */
class MonochromaticSamplerShader extends BaseSamplerShader {

  /** @override */
  static classPluginName = "monochromatic";

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
      vColor = aColor;
  }`;

  /** @override */
  static batchFragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    varying vec2 vTextureCoord;
    varying vec4 vColor;
    varying float vTextureId;
    uniform sampler2D uSamplers[%count%];
    
    void main(void){
       vec4 color;
       %forloop%
       gl_FragColor = vec4(vColor.rgb, 1.0) * color.a;
    }
  `;

  /** @inheritdoc */
  static fragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    uniform sampler2D sampler;
    uniform vec4 tintAlpha;
    varying vec2 vUvs;
    
    void main() {
      gl_FragColor = vec4(tintAlpha.rgb, 1.0) * texture2D(sampler, vUvs).a;
    }
  `;

  /** @inheritdoc */
  static defaultUniforms = {
    tintAlpha: [1, 1, 1, 1],
    sampler: 0
  };
}

/* ---------------------------------------- */

/**
 * A shader used to control channels intensity using an externally provided mask texture.
 */
class InverseOcclusionSamplerShader extends BaseSamplerShader {

  /** @override */
  static classPluginName = null;

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
  static fragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    varying vec2 vUvs;
    varying vec2 vUvsMask;
    uniform vec4 tintAlpha;
    uniform sampler2D sampler;
    uniform sampler2D maskSampler;
    uniform float alphaOcclusion;
    uniform float alpha;
    uniform float depthElevation;
    uniform bool roof;
    uniform bool vision;
    void main() {
      vec4 otex = texture2D(maskSampler, vUvsMask);
      float occlusionElevation = roof ? otex.a : (vision ? otex.b : otex.g);
      float tex = 1.0 - step(depthElevation, occlusionElevation);
      float mask = 1.0 - tex + (alphaOcclusion * tex);
      float calpha = tex + alpha * (1.0 - tex);
      gl_FragColor = texture2D(sampler, vUvs) * mask * calpha * tintAlpha;
    }
  `;

  /** @inheritdoc */
  static defaultUniforms = {
    roof: true,
    vision: false,
    tintAlpha: [1, 1, 1, 1],
    depthElevation: 0,
    sampler: 0,
    maskSampler: 0,
    alpha: 1.0,
    alphaOcclusion: 1.0,
    screenDimensions: [1, 1]
  };

  /** @override */
  _preRender(mesh) {
    super._preRender(mesh);
    this.uniforms.roof = mesh.object.isRoof;
    this.uniforms.vision = (mesh.document.occlusion.mode === CONST.TILE_OCCLUSION_MODES.VISION);
    this.uniforms.screenDimensions = canvas.screenDimensions;
    const renderTexture = this.uniforms.roof ? canvas.masks.depth.renderTexture : canvas.masks.occlusion.renderTexture;
    if ( this.uniforms.maskSampler !== renderTexture ) this.uniforms.maskSampler = renderTexture;
  }
}

/* ---------------------------------------- */

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
      _occlusionTexture: new PIXI.UniformGroup({
        occlusionTexture: maxTex
      }, true)
    };
  }

  /** @override */
  static _preRenderBatch(batchRenderer) {
    batchRenderer.renderer.texture.bind(canvas.masks.occlusion.renderTexture,
      batchRenderer.MAX_TEXTURES);
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
          // and specific to this sampler: depth elevation and occlusion mode.
          // For a size of 8 * 32 bits values (batchVertexSize = 8)
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

    const activeMode = element.object.document.occlusion.mode;
    const packedVertices = aIndex / this.vertexSize;
    const uvs = element.uvs;
    const indices = element.indices;
    const occluded = element.object.object.occluded;
    const occlusionMode = (canvas.effects.visionSources.size > 0) ? activeMode
      : (activeMode === CONST.TILE_OCCLUSION_MODES.VISION ? CONST.TILE_OCCLUSION_MODES.FADE : activeMode);
    const isModeFade = (occlusionMode === CONST.TILE_OCCLUSION_MODES.FADE);
    const vertexData = element.vertexData;
    const textureId = element._texture.baseTexture._batchLocation;
    const depthElevation = canvas.primary.mapElevationAlpha(element.object.document.elevation);
    const argb = element._tintRGB + ((255 * ((isModeFade && occluded) ? 0.15 : depthElevation)) << 24);

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
    uniform sampler2D occlusionTexture[1];
    uniform sampler2D uSamplers[%count%];
    
    void main(void) {
      vec4 color;
      %forloop%
      
      float rAlpha = 1.0 - step(color.a, 0.75);
      vec4 oTex = texture2D(occlusionTexture[0], vSamplerUvs);
      
      vec3 tint = vColor.rgb;
      tint.rb *= rAlpha;
      
      float oAlpha;
      if ( vOcclusionMode == ${CONST.TILE_OCCLUSION_MODES.RADIAL.toFixed(1)} ) {
        oAlpha = step(vColor.a, oTex.g);
        tint.g = vColor.a * rAlpha * oAlpha;
      } 
      else if ( vOcclusionMode == ${CONST.TILE_OCCLUSION_MODES.VISION.toFixed(1)} ) {
        oAlpha = step(vColor.a, oTex.b);
        tint.g = vColor.a * rAlpha * oAlpha;
      }
      else {
        oAlpha = 0.0;
        tint.g = rAlpha * vColor.a;
      }
      
      gl_FragColor = vec4(tint, vColor.a * rAlpha * oAlpha);
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
      float oAlpha = 1.0;
      vec3 tint = tintAlpha.rgb;
      tint.rgb = (tintAlpha.a == 0.0) ? tint.rgb : (tint.rgb / tintAlpha.a);
      tint.rb *= rAlpha;
           
      if ( occlusionMode == ${CONST.TILE_OCCLUSION_MODES.RADIAL.toFixed(1)} ) {
        oAlpha = step(tintAlpha.a, oTex.g);
        tint.g = tint.a * rAlpha * oAlpha;
      } 
      else if ( occlusionMode == ${CONST.TILE_OCCLUSION_MODES.VISION.toFixed(1)} ) {
        oAlpha = step(tintAlpha.a, oTex.b);
        tint.g = tint.a * rAlpha * oAlpha;
      }
      else {
        oAlpha = 0.0;
        tint.g = rAlpha * tint.a;
      }
      gl_FragColor = vec4(tint.rgb * rAlpha, tintAlpha.a * rAlpha * oAlpha);
    }
  `;

  /** @inheritdoc */
  static defaultUniforms = {
    tintAlpha: [1, 1, 1, 1],
    sampler: 0,
    occlusionTexture: 0,
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

/* ---------------------------------------- */

/**
 * A simple shader which purpose is to make the original texture red channel the alpha channel,
 * and still keeping channel informations. Used in cunjunction with the AlphaBlurFilterPass.
 */
class FogSamplerShader extends BaseSamplerShader {
  /** @override */
  static classPluginName = null;

  /** @override */
  static fragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    uniform sampler2D sampler;
    uniform vec4 tintAlpha;
    varying vec2 vUvs;
    void main() {
        vec4 color = texture2D(sampler, vUvs);
        gl_FragColor = vec4(1.0, color.gb, 1.0) * step(0.15, color.r) * tintAlpha;
    }`;
}
