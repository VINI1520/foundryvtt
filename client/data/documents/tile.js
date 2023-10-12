/**
 * The client-side Tile document which extends the common BaseTile document model.
 * @extends documents.BaseTile
 * @mixes ClientDocumentMixin
 *
 * @see {@link Scene}                     The Scene document type which contains Tile documents
 * @see {@link TileConfig}                The Tile configuration application
 */
class TileDocument extends CanvasDocumentMixin(foundry.documents.BaseTile) {

  /**
   * Define an elevation property on the Tile Document which in the future will become a core part of its data schema.
   * @type {number}
   */
  get elevation() {
    return this.#elevation ?? (this.overhead
      ? this.parent.foregroundElevation : PrimaryCanvasGroup.BACKGROUND_ELEVATION);
  }

  set elevation(value) {
    if ( !Number.isFinite(value) && (value !== undefined) ) {
      throw new Error("Elevation must be a finite Number or undefined");
    }
    this.#elevation = value;
    if ( this.rendered ) {
      canvas.primary.sortDirty = true;
      canvas.perception.update({refreshTiles: true});
      // TODO: Temporary workaround. Delete when elevation will be a real tile document property
      this._object.renderFlags.set({refreshElevation: true});
    }
  }

  #elevation;

  /* -------------------------------------------- */

  /**
   * Define a sort property on the Tile Document which in the future will become a core part of its data schema.
   * @type {number}
   */
  get sort() {
    return this.z;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    const d = this.parent?.dimensions;
    if ( !d ) return;
    const securityBuffer = Math.max(d.size / 5, 20).toNearest(0.1);
    const maxX = d.width - securityBuffer;
    const maxY = d.height - securityBuffer;
    const minX = (this.width - securityBuffer) * -1;
    const minY = (this.height - securityBuffer) * -1;
    this.x = Math.clamped(this.x.toNearest(0.1), minX, maxX);
    this.y = Math.clamped(this.y.toNearest(0.1), minY, maxY);
  }
}
