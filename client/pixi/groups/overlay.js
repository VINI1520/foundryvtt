/**
 * A container group which is not bound to the stage world transform.
 *
 * @category - Canvas
 */
class OverlayCanvasGroup extends BaseCanvasMixin(UnboundContainer) {
  /** @override */
  static groupName = "overlay";

  /** @override */
  static tearDownChildren = false;
}

