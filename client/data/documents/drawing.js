/**
 * The client-side Drawing document which extends the common BaseDrawing model.
 *
 * @extends documents.BaseDrawing
 * @mixes ClientDocumentMixin
 *
 * @see {@link Scene}               The Scene document type which contains Drawing embedded documents
 * @see {@link DrawingConfig}       The Drawing configuration application
 */
class DrawingDocument extends CanvasDocumentMixin(foundry.documents.BaseDrawing) {

  /**
   * Define an elevation property on the Drawing Document which in the future will become a part of its data schema.
   * @type {number}
   */
  get elevation() {
    return this.#elevation ??= (this.z ?? 0);
  }

  set elevation(value) {
    this.#elevation = value;
    if ( this.rendered ) canvas.primary.sortChildren();
  }

  #elevation;

  /* -------------------------------------------- */

  /**
   * Define a sort property on the Drawing Document which in the future will become a core part of its data schema.
   * @type {number}
   */
  get sort() {
    return this.z;
  }
}
