/**
 * A CanvasLayer for displaying coloration visual effects
 * @category - Canvas
 */
class CanvasColorationEffects extends CanvasLayer {
  sortableChildren = true;

  /**
   * The filter used to mask visual effects on this layer
   * @type {VisualEffectsMaskingFilter}
   */
  filter;

  /* -------------------------------------------- */

  /**
   * Clear coloration effects container
   */
  clear() {
    this.removeChildren();
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    this.filter = VisualEffectsMaskingFilter.create({
      filterMode: VisualEffectsMaskingFilter.FILTER_MODES.COLORATION,
      uVisionSampler: canvas.masks.vision.renderTexture
    });
    this.filter.blendMode = PIXI.BLEND_MODES.ADD;
    this.filterArea = canvas.app.renderer.screen;
    this.filters = [this.filter];
    canvas.effects.visualEffectsMaskingFilters.add(this.filter);
  }

  /* -------------------------------------------- */

  /** @override */
  async _tearDown(options) {
    canvas.effects.visualEffectsMaskingFilters.delete(this.filter);
  }
}
