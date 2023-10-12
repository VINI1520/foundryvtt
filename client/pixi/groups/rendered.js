/**
 * A container group which contains the environment canvas group and the interface canvas group.
 *
 * @category - Canvas
 */
class RenderedCanvasGroup extends BaseCanvasMixin(PIXI.Container) {
  /** @override */
  static groupName = "rendered";

  /* -------------------------------------------- */
  /*  Tear-Down                                   */
  /* -------------------------------------------- */

  /** @override */
  async tearDown(options={}) {
    // We don't want to destroy non-layers children (and destroying children is evil!)
    options.preserveChildren = true;
    await super.tearDown(options);
  }
}

