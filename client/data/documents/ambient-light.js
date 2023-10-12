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
    const configs = Object.values(this.apps).filter(app => app instanceof AmbientLightConfig);
    configs.forEach(app => {
      if ( app.preview ) options.animate = false;
      app._previewChanges(data);
    });
    super._onUpdate(data, options, userId);
    configs.forEach(app => app._previewChanges());
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
