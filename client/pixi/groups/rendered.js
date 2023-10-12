/**
 * A container group which contains the environment canvas group and the interface canvas group.
 *
 * @category - Canvas
 */
class RenderedCanvasGroup extends BaseCanvasMixin(PIXI.Container) {
  /** @override */
  static groupName = "rendered";

  /** @override */
  static tearDownChildren = false;
}

