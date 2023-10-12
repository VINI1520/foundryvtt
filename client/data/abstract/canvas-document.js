/**
 * A specialized subclass of the ClientDocumentMixin which is used for document types that are intended to be
 * represented upon the game Canvas.
 * @category - Mixins
 * @param {typeof abstract.Document} Base     The base document class mixed with client and canvas features
 * @returns {typeof CanvasDocument}           The mixed CanvasDocument class definition
 */
function CanvasDocumentMixin(Base) {
  return class CanvasDocument extends ClientDocumentMixin(Base) {

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * A lazily constructed PlaceableObject instance which can represent this Document on the game canvas.
     * @type {PlaceableObject|null}
     */
    get object() {
      if ( this._object || this._destroyed ) return this._object;
      if ( !this.parent?.isView || !this.layer ) return null;
      return this._object = this.layer.createObject(this);
    }

    /**
     * @type {PlaceableObject|null}
     * @private
     */
    _object = this._object ?? null;

    /**
     * Has this object been deliberately destroyed as part of the deletion workflow?
     * @type {boolean}
     * @private
     */
    _destroyed = false;

    /* -------------------------------------------- */

    /**
     * A reference to the CanvasLayer which contains Document objects of this type.
     * @type {PlaceablesLayer}
     */
    get layer() {
      return canvas.getLayerByEmbeddedName(this.documentName);
    }

    /* -------------------------------------------- */

    /**
     * An indicator for whether this document is currently rendered on the game canvas.
     * @type {boolean}
     */
    get rendered() {
      return !!this._object;
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /** @inheritDoc */
    _onCreate(data, options, userId) {
      super._onCreate(data, options, userId);
      const object = this.object;
      if ( !object ) return;
      this.layer.objects.addChild(object);
      object.draw().then(() => {
        object?._onCreate(data, options, userId);
      });
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onUpdate(changed, options, userId) {
      super._onUpdate(changed, options, userId);
      this._object?._onUpdate(changed, options, userId);
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onDelete(options, userId) {
      super._onDelete(options, userId);
      this._object?._onDelete(options, userId);
    }
  };
}
