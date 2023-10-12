/**
 * A specialized container where bounds are not computed with children, but with canvas dimensions.
 */
class FullCanvasContainer extends PIXI.Container {
  /** @override */
  calculateBounds() {
    const bounds = this._bounds;
    const { x, y, width, height } = canvas.dimensions.rect;
    bounds.clear();
    bounds.addFrame(this.transform, x, y, x + width, y + height);
    bounds.updateID = this._boundsID;
  }
}
