/**
 * A container group which contains the primary canvas group and the effects canvas group.
 *
 * @category - Canvas
 */
class EnvironmentCanvasGroup extends BaseCanvasMixin(PIXI.Container) {
  /** @override */
  static groupName = "environment";

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
