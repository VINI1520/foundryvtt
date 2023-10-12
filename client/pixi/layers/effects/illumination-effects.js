/**
 * A CanvasLayer for displaying illumination visual effects
 * @category - Canvas
 */
class CanvasIlluminationEffects extends CanvasLayer {
  constructor() {
    super();

    /**
     * A minimalist texture that holds the background color.
     * @type {PIXI.Texture}
     */
    this.backgroundColorTexture = this._createBackgroundColorTexture();

    // Other initializations
    this.background = this.addChild(new PIXI.LegacyGraphics());
    this.lights = this.addChild(new PIXI.Container());
    this.lights.sortableChildren = true;
  }

  /**
   * Is global illumination currently applied to the canvas?
   * @type {boolean}
   */
  get globalLight() {
    return canvas.effects.globalLightSource && !canvas.effects.globalLightSource.disabled;
  }

  /**
   * The filter used to mask visual effects on this layer
   * @type {VisualEffectsMaskingFilter}
   */
  filter;

  /* -------------------------------------------- */

  /**
   * Set or retrieve the illumination background color.
   * @param {number} color
   */
  set backgroundColor(color) {
    this.background.tint = color;
    const cb = Color.from(color).rgb;
    if ( this.filter ) this.filter.uniforms.replacementColor = cb;
    this.backgroundColorTexture.baseTexture.resource.data.set(cb);
    this.backgroundColorTexture.baseTexture.resource.update();
  }

  /* -------------------------------------------- */

  /**
   * Clear illumination effects container
   */
  clear() {
    this.lights.removeChildren();
  }

  /* -------------------------------------------- */

  /**
   * Create the background color texture used by illumination point source meshes.
   * 1x1 single pixel texture.
   * @returns {PIXI.Texture}    The background color texture.
   * @protected
   */
  _createBackgroundColorTexture() {
    return PIXI.Texture.fromBuffer(new Float32Array(3), 1, 1, {
      type: PIXI.TYPES.FLOAT,
      format: PIXI.FORMATS.RGB,
      wrapMode: PIXI.WRAP_MODES.CLAMP,
      scaleMode: PIXI.SCALE_MODES.NEAREST,
      mipmap: PIXI.MIPMAP_MODES.OFF
    });
  }

  /* -------------------------------------------- */

  /** @override */
  render(renderer) {
    // Prior blend mode is reinitialized. The first render into PointSourceMesh will use the background color texture.
    PointSourceMesh._priorBlendMode = undefined;
    PointSourceMesh._currentTexture = this.backgroundColorTexture;
    super.render(renderer);
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    this.darknessLevel = canvas.darknessLevel;
    this.filter = VisualEffectsMaskingFilter.create({
      filterMode: VisualEffectsMaskingFilter.FILTER_MODES.ILLUMINATION,
      uVisionSampler: canvas.masks.vision.renderTexture
    });
    this.filter.blendMode = PIXI.BLEND_MODES.MULTIPLY;
    this.filterArea = canvas.app.renderer.screen;
    this.filters = [this.filter];
    canvas.effects.visualEffectsMaskingFilters.add(this.filter);
    this.drawBaseline();
  }

  /* -------------------------------------------- */

  /** @override */
  async _tearDown(options) {
    canvas.effects.visualEffectsMaskingFilters.delete(this.filter);
    this.background.clear();
    this.clear();
  }

  /* -------------------------------------------- */

  /**
   * Draw illumination baseline
   */
  drawBaseline() {
    const bgRect = canvas.dimensions.rect.clone().pad(CONFIG.Canvas.blurStrength * 2);
    this.background.clear().beginFill(0xFFFFFF, 1.0).drawShape(bgRect).endFill();
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  updateGlobalLight() {
    const msg = "CanvasIlluminationEffects#updateGlobalLight has been deprecated.";
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
    return false;
  }
}
