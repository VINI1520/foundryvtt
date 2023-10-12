/**
 * The client-side AmbientLight document which extends the common BaseAmbientLight document model.
 * @extends documents.BaseAmbientLight
 * @mixes ClientDocumentMixin
 *
 * @see {@link Scene}                     The Scene document type which contains AmbientLight documents
 * @see {@link AmbientLightConfig}        The AmbientLight configuration application
 */
class AmbientLightDocument extends CanvasDocumentMixin(foundry.documents.BaseAmbientLight) {

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onUpdate(data, options, userId) {
    // Update references to original state so that resetting the preview does not clobber these updates in-memory.
    if ( !options.preview ) Object.values(this.apps).forEach(app => app.original = this.toObject());
    return super._onUpdate(data, options, userId);
  }

  /* -------------------------------------------- */
  /*  Model Properties                            */
  /* -------------------------------------------- */

  /**
   * Is this ambient light source global in nature?
   * @type {boolean}
   */
  get isGlobal() {
    return !this.walls;
  }
}
