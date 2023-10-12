/**
 * @typedef {PIXI.Container} CanvasVisionContainer
 * @property {PIXI.Graphics} los      LOS polygons
 * @property {PIXI.Graphics} base     Base vision
 * @property {PIXI.Graphics} fov      FOV polygons
 * @property {PIXI.Graphics} mask     Alias of los
 * @property {boolean} _explored      Does this vision point represent an explored position?
 */

/**
 * The vision mask which contains the current line-of-sight texture.
 * @category - Canvas
 */
class CanvasVisionMask extends CachedContainer {

  /** @override */
  clearColor = [0, 0, 0, 0];

  /**
   * The current vision Container.
   * @type {CanvasVisionContainer}
   */
  vision;

  /**
   * The BlurFilter which applies to the vision mask texture.
   * This filter applies a NORMAL blend mode to the container.
   * @type {AlphaBlurFilter}
   */
  filter;

  /**
   * Current LOS polygons
   * @type {PIXI.Graphics}
   */
  get los() {
    return this.vision?.los;
  }

  /**
   * Current FOV polygons
   * @type {PIXI.Graphics}
   */
  get fov() {
    return this.vision?.fov;
  }

  /* -------------------------------------------- */

  /**
   * Create the BlurFilter for the VisionMask container.
   * @returns {AlphaBlurFilter}
   */
  #createBlurFilter() {
    const b = canvas.blur;
    if ( !b.enabled ) return;
    if ( !this.filter ) {
      const f = this.filter = new AlphaBlurFilter(b.strength, b.passes, PIXI.settings.FILTER_RESOLUTION, b.kernels);
      f.blendMode = PIXI.BLEND_MODES.NORMAL;
      this.filterArea = canvas.app.renderer.screen;
      this.filters = [f];
    }
    return canvas.addBlurFilter(this.filter);
  }

  /* -------------------------------------------- */

  /**
   * Initialize the vision mask with the los and the fov graphics objects.
   * @returns {CanvasVisionContainer}
   */
  createVision() {
    const vision = new PIXI.Container();
    vision.base = vision.addChild(new PIXI.LegacyGraphics());
    vision.fov = vision.addChild(new PIXI.LegacyGraphics());
    vision.los = vision.addChild(new PIXI.LegacyGraphics());
    vision.mask = vision.los;
    vision._explored = false;
    return this.vision = this.addChild(vision);
  }

  /* -------------------------------------------- */

  /**
   * Detach the current vision container and return it
   * @returns {CanvasVisionContainer}
   */
  detachVision() {
    this.removeChildren();
    const vision = this.vision;
    vision.base.clear();
    this.vision = undefined;
    return vision;
  }

  /* -------------------------------------------- */

  async draw() {
    this.#createBlurFilter();
  }

  /**
   * Clear the vision mask
   */
  clear() {
    Canvas.clearContainer(this, false);
    this.vision = undefined;
  }
}
