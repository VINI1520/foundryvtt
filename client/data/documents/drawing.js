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
    return this.#elevation ?? this.z ?? 0;
  }

  set elevation(value) {
    if ( !Number.isFinite(value) && (value !== undefined) ) {
      throw new Error("Elevation must be a finite Number or undefined");
    }
    this.#elevation = value;
    if ( this.rendered ) {
      canvas.primary.sortDirty = true;
      canvas.perception.update({refreshTiles: true});
      // TODO: Temporary workaround. Delete when elevation will be a real drawing document property
      this._object.renderFlags.set({refreshShape: true});
    }
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
