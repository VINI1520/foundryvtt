/**
 * A container group which contains the primary canvas group and the effects canvas group.
 *
 * @category - Canvas
 */
class EnvironmentCanvasGroup extends BaseCanvasMixin(PIXI.Container) {
  /** @override */
  static groupName = "environment";

  /** @override */
  static tearDownChildren = false;

  /**
   * The environment antialiasing filter.
   * @type {AdaptiveFXAAFilter}
   */
  #fxaaFilter;

  /* -------------------------------------------- */

  /** @override */
  async draw() {
    this.#createFilter();
    await super.draw();
  }

  /* -------------------------------------------- */

  /**
   * Activate the environment group post-processing.
   * Note: only for performance mode intermediate, high or maximum.
   */
  #createFilter() {
    this.filters ??= [];
    this.filters.findSplice(f => f === this.#fxaaFilter);
    if ( canvas.performance.mode < CONST.CANVAS_PERFORMANCE_MODES.MED ) return;
    this.#fxaaFilter ??= new AdaptiveFXAAFilter();
    this.filters.push(this.#fxaaFilter);
  }
}
