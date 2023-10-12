/**
 * A mixin which decorates a DisplayObject with depth and/or occlusion properties.
 * @category - Mixins
 * @param {typeof PIXI.DisplayObject} DisplayObject   The parent DisplayObject class being mixed
 * @returns {typeof OccludableObject}                 A DisplayObject subclass mixed with OccludableObject features
 */
function OccludableObjectMixin(DisplayObject) {
  // Verify that the display object is a prototype of SpriteMesh (for occlusion, we need the shader class support)
  // TODO: Remove PIXI.TilingSprite as soon as possible!
  if ( !(foundry.utils.isSubclass(DisplayObject, SpriteMesh) ||
    foundry.utils.isSubclass(DisplayObject, PIXI.TilingSprite)) ) {
    throw new Error("Occludable objects must be a subclass of SpriteMesh.");
  }
  return class OccludableObject extends PrimaryCanvasObjectMixin(DisplayObject) {
    constructor(...args) {
      super(...args);
      this.setShaderClass(InverseOcclusionSamplerShader);
      this.shader.enabled = false;
      this.updateTextureData();
    }

    /**
     * @typedef {Object} OccludableObjectData
     * @property {boolean} roof               The PCO is considered as a roof?
     * @property {object} occlusion           The occlusion object for this PCO
     */
    static get defaultData() {
      return foundry.utils.mergeObject(super.defaultData, {
        roof: false,
        occlusion: {
          mode: CONST.OCCLUSION_MODES.NONE,
          alpha: 0,
          radius: null
        }
      });
    };

    /**
     * Contains :
     * - the bounds of the texture data
     * - the cached mapping of non-transparent pixels (if roof)
     * - the filtered render texture (if roof)
     * @type {{minX: number, minY: number, maxX: number, maxY: number, pixels: Uint8Array, texture: PIXI.RenderTexture}}
     * @protected
     */
    _textureData;

    /**
     * A flag which tracks whether the primary canvas object is currently in an occluded state.
     * @type {boolean}
     */
    occluded = false;

    /**
     * Force or cancel the rendering of the PCO depth. If undefined, the underlying logic decide.
     * @type {boolean}
     */
    forceRenderDepth;

    /**
     * A flag which tracks occluded state change for PCO with roof quality.
     * @type {boolean}
     */
    #prevOccludedState = false;

    /* -------------------------------------------- */

    /**
     * Is this occludable object... occludable?
     * @type {boolean}
     */
    get isOccludable() {
      return this.data.occlusion.mode > CONST.OCCLUSION_MODES.NONE;
    }

    /* -------------------------------------------- */

    /**
     * Should this PCO render its depth?
     * @type {boolean}
     */
    get shouldRenderDepth() {
      return this.forceRenderDepth ?? (this.data.roof && !this.data.hidden);
    }

    /* -------------------------------------------- */

    /**
     * Debounce assignment of the PCO occluded state to avoid cases like animated token movement which can rapidly
     * change PCO appearance.
     * Uses a 50ms debounce threshold.
     * @type {function(occluded: boolean): void}
     */
    debounceSetOcclusion = foundry.utils.debounce(occluded => {
      this.occluded = occluded;
      this.refreshOcclusion();
    }, 50);

    /* -------------------------------------------- */

    /**
     * Compute and returns the normal and occlusion alpha for this occludable object.
     * @returns {{alphaNormal: number, alphaOccluded: number}}
     * @protected
     */
    _getOcclusionAlpha() {
      const {alpha, hidden, occlusion, roof} = this.data;
      const foreground = roof || ((this.data.elevation > canvas.primary.background.elevation) && canvas.tiles.active);
      const alphaForeground = foreground ? (canvas.tiles.displayRoofs ? alpha : 0.5) : alpha;
      const alphaNormal = hidden ? 0.25 : (foreground ? alphaForeground : alpha);
      const alphaOccluded = this.occluded ? occlusion.alpha : 1.0;
      return {alphaNormal, alphaOccluded};
    }

    /* -------------------------------------------- */

    /**
     * Refresh the appearance of the occlusion state for tiles which are affected by a Token beneath them.
     */
    refreshOcclusion() {
      if ( !this.visible || !this.renderable ) return;
      const {hidden, occlusion} = this.data;
      const {alphaNormal, alphaOccluded} = this._getOcclusionAlpha();

      // Tracking if roof has an occlusion state change to initialize vision
      if ( this.#prevOccludedState !== this.occluded ) {
        canvas.perception.update({initializeVision: true});
        this.#prevOccludedState = this.occluded;
      }

      // Other modes
      const mode = occlusion.mode;
      const modes = CONST.OCCLUSION_MODES;
      switch ( mode ) {
        // Fade Entire occludable object
        case modes.FADE:
          this.shader.enabled = false;
          this.alpha = Math.min(alphaNormal, alphaOccluded);
          break;

        // Radial Occlusion
        case modes.RADIAL:
          this.shader.enabled = this.occluded && !hidden;
          this.shader.uniforms.alpha = alphaNormal;
          this.shader.uniforms.alphaOcclusion = alphaOccluded;
          this.shader.uniforms.depthElevation = canvas.primary.mapElevationToDepth(this.elevation);
          this.alpha = this.occluded ? 1.0 : alphaNormal;
          break;

        // Vision-Based Occlusion
        case modes.VISION:
          const visionEnabled = !hidden && canvas.effects.visionSources.some(s => s.active);
          this.shader.enabled = visionEnabled;
          this.shader.uniforms.alpha = alphaNormal;
          this.shader.uniforms.alphaOcclusion = occlusion.alpha;
          this.shader.uniforms.depthElevation = canvas.primary.mapElevationToDepth(this.elevation);
          this.alpha = this.occluded ? (visionEnabled ? 1.0 : alphaOccluded) : alphaNormal;
          break;

        // Default state (as well as None occlusion mode)
        default:
          this.shader.enabled = false;
          this.alpha = alphaNormal;
      }

      // FIXME in V12
      if ( this.object instanceof PlaceableObject ) this.alpha = Math.min(this.alpha, this.object.alpha);

      // Called here redundantly as a special case to allow modules to react when rendered occlusion changes
      Hooks.callAll("refreshOcclusion", this);

      // TODO: Deprecated: this hook will disappear in version 13 and is keeped for compatibility
      if ( this.object instanceof Tile ) Hooks.callAll("refreshTile", this.object);
    }

    /* -------------------------------------------- */

    /**
     * Render the depth of this primary canvas object.
     * @param {PIXI.Renderer} renderer
     */
    renderDepthData(renderer) {
      if ( !this.shouldRenderDepth ) return;
      const modes = CONST.OCCLUSION_MODES;
      const occluded = this.occluded;
      let occlusionMode = this.data.occlusion.mode;

      if ( ((occlusionMode === modes.RADIAL) && !occluded)
        || ((occlusionMode === modes.VISION) && !canvas.effects.visionSources.some(s => s.active)) ) {
        occlusionMode = modes.FADE;
      }
      const isModeNone = (occlusionMode === modes.NONE);
      const isModeFade = (occlusionMode === modes.FADE);
      const isMaskingLight = (isModeFade && !occluded) || !isModeFade;
      const isMaskingWeather = (isModeFade && occluded) || !(isModeNone || isModeFade);

      // Forcing the batch plugin to render roof mask
      this.pluginName = OcclusionSamplerShader.classPluginName;

      // Saving the value from the mesh
      const originalTint = this.tint;
      const originalBlendMode = this.blendMode;
      const originalAlpha = this.worldAlpha;

      // Rendering the roof sprite
      this.tint = 0xFF0000 + (isMaskingLight ? 0xFF00 : 0x0) + (isMaskingWeather ? 0xFF : 0x0);
      this.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
      this.worldAlpha = canvas.primary.mapElevationToDepth(this.elevation);
      this._batchData.occlusionMode = occlusionMode;
      if ( this.visible && this.renderable ) this._render(renderer);

      // Restoring original values
      this.tint = originalTint;
      this.blendMode = originalBlendMode;
      this.worldAlpha = originalAlpha;

      // Stop forcing batched plugin
      this.pluginName = null;
    }

    /* -------------------------------------------- */

    /**
     * Process the PCO texture :
     * Use the texture to create a cached mapping of pixel alpha for this Tile with real base texture size.
     * Cache the bounding box of non-transparent pixels for the un-rotated shape.
     * @returns {{minX: number, minY: number, maxX: number, maxY: number, pixels: Uint8Array|undefined}}
     */
    updateTextureData() {
      if ( !this.isOccludable || !this.texture?.valid ) return;
      const aw = Math.abs(this.data.width);
      const ah = Math.abs(this.data.height);

      // If no tile texture is present
      if ( !this.texture ) return this._textureData = {minX: 0, minY: 0, maxX: aw, maxY: ah};

      // If texture date exists for this texture, we return it
      const src = this.data.texture.src ?? this.texture?.baseTexture?.textureCacheIds[0];
      this._textureData = TextureLoader.textureBufferDataMap.get(src);
      if ( this._textureData ) return this._textureData;
      else this._textureData = {
        pixels: undefined,
        minX: undefined,
        maxX: undefined,
        minY: undefined,
        maxY: undefined
      };
      // Else, we are preparing the texture data creation
      const map = this._textureData;

      // Create a temporary Sprite using the Tile texture
      const sprite = new PIXI.Sprite(this.texture);
      sprite.width = map.aw = Math.ceil(this.texture.baseTexture.realWidth / 4);
      sprite.height = map.ah = Math.ceil(this.texture.baseTexture.realHeight / 4);

      // Create or update the alphaMap render texture
      const tex = PIXI.RenderTexture.create({width: map.aw, height: map.ah});

      // Render the sprite to the texture and extract its pixels
      // Destroy sprite and texture when they are no longer needed
      canvas.app.renderer.render(sprite, {renderTexture: tex});
      sprite.destroy(false);
      const pixels = canvas.app.renderer.extract.pixels(tex);
      tex.destroy(true);

      // Create new buffer for storing alpha channel only
      map.pixels = new Uint8Array(pixels.length / 4);

      // Map the alpha pixels
      for ( let i = 0; i < map.pixels.length; i++ ) {
        const a = map.pixels[i] = pixels[(i * 4) + 3];
        if ( a > 0 ) {
          const x = i % map.aw;
          const y = Math.floor(i / map.aw);
          if ( (map.minX === undefined) || (x < map.minX) ) map.minX = x;
          else if ( (map.maxX === undefined) || (x + 1 > map.maxX) ) map.maxX = x + 1;
          if ( (map.minY === undefined) || (y < map.minY) ) map.minY = y;
          else if ( (map.maxY === undefined) || (y + 1 > map.maxY) ) map.maxY = y + 1;
        }
      }

      // Saving the texture data
      TextureLoader.textureBufferDataMap.set(src, map);
      return this._textureData;
    }

    /* -------------------------------------------- */

    /**
     * Test whether a specific Token occludes this PCO.
     * Occlusion is tested against 9 points, the center, the four corners-, and the four cardinal directions
     * @param {Token} token       The Token to test
     * @param {object} [options]  Additional options that affect testing
     * @param {boolean} [options.corners=true]  Test corners of the hit-box in addition to the token center?
     * @returns {boolean}         Is the Token occluded by the PCO?
     */
    testOcclusion(token, {corners=true}={}) {
      const {elevation, occlusion} = this.data;
      if ( occlusion.mode === CONST.OCCLUSION_MODES.NONE ) return false;
      if ( token.document.elevation >= elevation ) return false;
      const {x, y, w, h} = token;
      let testPoints = [[w / 2, h / 2]];
      if ( corners ) {
        const pad = 2;
        const cornerPoints = [
          [pad, pad],
          [w / 2, pad],
          [w - pad, pad],
          [w - pad, h / 2],
          [w - pad, h - pad],
          [w / 2, h - pad],
          [pad, h - pad],
          [pad, h / 2]
        ];
        testPoints = testPoints.concat(cornerPoints);
      }
      for ( const [tx, ty] of testPoints ) {
        if ( this.containsPixel(x + tx, y + ty) ) return true;
      }
      return false;
    }

    /* -------------------------------------------- */

    /**
     * Test whether the PCO pixel data contains a specific point in canvas space
     * @param {number} x
     * @param {number} y
     * @param {number} alphaThreshold     Value from which the pixel is taken into account, in the range [0, 1].
     * @returns {boolean}
     */
    containsPixel(x, y, alphaThreshold = 0.75) {
      return this.getPixelAlpha(x, y) > (alphaThreshold * 255);
    }

    /* -------------------------------------------- */

    /**
     * Get alpha value at specific canvas coordinate.
     * @param {number} x
     * @param {number} y
     * @returns {number|null}    The alpha value (-1 if outside of the bounds) or null if no mesh or texture is present.
     */
    getPixelAlpha(x, y) {
      if ( !this._textureData?.pixels ) return null;
      const textureCoord = this._getTextureCoordinate(x, y);
      return this.#getPixelAlpha(textureCoord.x, textureCoord.y);
    }

    /* -------------------------------------------- */

    /**
     * Get PCO alpha map texture coordinate with canvas coordinate
     * @param {number} testX               Canvas x coordinate.
     * @param {number} testY               Canvas y coordinate.
     * @returns {object}          The texture {x, y} coordinates, or null if not able to do the conversion.
     * @protected
     */
    _getTextureCoordinate(testX, testY) {
      const {x, y, width, height, rotation, texture} = this.data;

      // Save scale properties
      const sscX = Math.sign(texture.scaleX);
      const sscY = Math.sign(texture.scaleY);
      const ascX = Math.abs(texture.scaleX);
      const ascY = Math.abs(texture.scaleY);

      // Adjusting point by taking scale into account
      testX -= (x - (width / 2) * sscX * (ascX - 1));
      testY -= (y - (height / 2) * sscY * (ascY - 1));

      // Mirroring the point on x/y axis if scale is negative
      if ( sscX < 0 ) testX = (width - testX);
      if ( sscY < 0 ) testY = (height - testY);

      // Account for tile rotation and scale
      if ( rotation !== 0 ) {
        // Anchor is recomputed with scale and document dimensions
        const anchor = {
          x: this.anchor.x * width * ascX,
          y: this.anchor.y * height * ascY
        };
        let r = new Ray(anchor, {x: testX, y: testY});
        r = r.shiftAngle(-this.rotation * sscX * sscY); // Reverse rotation if scale is negative for just one axis
        testX = r.B.x;
        testY = r.B.y;
      }

      // Convert to texture data coordinates
      testX *= (this._textureData.aw / this.width);
      testY *= (this._textureData.ah / this.height);

      return {x: testX, y: testY};
    }

    /* -------------------------------------------- */

    /**
     * Get alpha value at specific texture coordinate.
     * @param {number} x
     * @param {number} y
     * @returns {number}   The alpha value (or -1 if outside of the bounds).
     */
    #getPixelAlpha(x, y) {
      // First test against the bounding box
      if ( (x < this._textureData.minX) || (x >= this._textureData.maxX) ) return -1;
      if ( (y < this._textureData.minY) || (y >= this._textureData.maxY) ) return -1;

      // Next test a specific pixel
      const px = (Math.floor(y) * this._textureData.aw) + Math.floor(x);
      return this._textureData.pixels[px];
    }

    /* -------------------------------------------- */

    /**
     * Compute the alpha-based bounding box for the tile, including an angle of rotation.
     * @returns {PIXI.Rectangle}
     * @private
     */
    _getAlphaBounds() {
      const m = this._textureData;
      const r = Math.toRadians(this.data.rotation);
      return PIXI.Rectangle.fromRotation(m.minX, m.minY, m.maxX - m.minX, m.maxY - m.minY, r).normalize();
    }

    /* -------------------------------------------- */
    /*  Deprecations and Compatibility              */
    /* -------------------------------------------- */

    /**
     * @deprecated since v11
     * @ignore
     */
    renderOcclusion(renderer) {
      const msg = "PrimaryCanvasObject#renderOcclusion is deprecated in favor of PrimaryCanvasObject#renderDepth";
      foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
      this.renderDepthData(renderer);
    }
  }
}
