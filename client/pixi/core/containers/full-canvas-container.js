/**
 * Augment any PIXI.DisplayObject to assume bounds that are always aligned with the full visible screen.
 * The bounds of this container do not depend on its children but always fill the entire canvas.
 * @param {typeof PIXI.DisplayObject} Base    Any PIXI DisplayObject subclass
 * @returns {typeof FullCanvasObject}         The decorated subclass with full canvas bounds
 */
function FullCanvasObjectMixin(Base) {
  return class FullCanvasObject extends Base {
    /** @override */
    calculateBounds() {
      const bounds = this._bounds;
      const { x, y, width, height } = canvas.dimensions.rect;
      bounds.clear();
      bounds.addFrame(this.transform, x, y, x + width, y + height);
      bounds.updateID = this._boundsID;
    }
  };
}

/**
 * @deprecated since v11
 * @ignore
 */
class FullCanvasContainer extends FullCanvasObjectMixin(PIXI.Container) {
  constructor(...args) {
    super(...args);
    const msg = "You are using the FullCanvasContainer class which has been deprecated in favor of a more flexible "
      + "FullCanvasObjectMixin which can augment any PIXI.DisplayObject subclass.";
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
  }
}
