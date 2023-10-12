/**
 * The depth mask which contains a mapping of elevation. Needed to know if we must render objects according to depth.
 * @category - Canvas
 */
class CanvasDepthMask extends CachedContainer {
  constructor(...args) {
    super(...args);
    this.#createDepth();
  }

  /**
   * Container in which roofs are rendered with depth data.
   * @type {PIXI.Container}
   */
  roofs;

  /** @override */
  static textureConfiguration = {
    scaleMode: PIXI.SCALE_MODES.NEAREST,
    format: PIXI.FORMATS.RGB
  };

  /** @override */
  clearColor = [0, 0, 0, 0];

  /* -------------------------------------------- */

  /**
   * Initialize the depth mask with the roofs container and token graphics.
   */
  #createDepth() {
    this.roofs = this.addChild(this.#createRoofsContainer());
  }

  /* -------------------------------------------- */

  /**
   * Create the roofs container.
   * @returns {PIXI.Container}
   */
  #createRoofsContainer() {
    const c = new PIXI.Container();
    const render = renderer => {
      // Render the depth of each primary canvas object
      for ( const pco of canvas.primary.children ) {
        pco.renderDepthData?.(renderer);
      }
    };
    c.render = render.bind(c);
    return c;
  }

  /* -------------------------------------------- */

  /**
   * Clear the depth mask.
   */
  clear() {
    Canvas.clearContainer(this.roofs, false);
  }
}
