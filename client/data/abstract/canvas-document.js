/**
 * A specialized sub-class of the ClientDocumentMixin which is used for document types that are intended to be
 * represented upon the game Canvas.
 * @type {function(typeof ClientDocument)}
 * @category - Mixins
 */
const CanvasDocumentMixin = Base => class extends ClientDocumentMixin(Base) {
  constructor(data={}, context) {
    super(data, context);

    /**
     * A reference to the PlaceableObject instance which represents this Embedded Document.
     * @type {PlaceableObject|null}
     */
    this._object = null;

    /**
     * Has this object been deliberately destroyed as part of the deletion workflow?
     * @type {boolean}
     * @private
     */
    this._destroyed = false;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * A lazily constructed PlaceableObject instance which can represent this Document on the game canvas.
   * @type {PlaceableObject|null}
   * @name CanvasDocumentMixin#object
   */
  get object() {
    if ( this._object || this._destroyed ) return this._object;
    if ( !this.parent?.isView || !this.layer ) return null;
    this._object = this.layer.createObject(this);
    return this._object;
  }

  /* -------------------------------------------- */

  /**
   * A reference to the CanvasLayer which contains Document objects of this type.
   * @type {PlaceablesLayer|null}
   */
  get layer() {
    return canvas.getLayerByEmbeddedName(this.documentName);
  }

  /* -------------------------------------------- */

  /**
   * An indicator for whether this document is currently rendered on the game canvas.
   * @type {boolean}
   * @name CanvasDocumentMixin#rendered
   */
  get rendered() {
    return this.object !== null;
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * @see abstract.Document#_onCreate
   * @memberof CanvasDocumentMixin#
   */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if ( this.parent.isView ) this.object?._onCreate(data, options, userId);
  }

  /* -------------------------------------------- */

  /**
   * @see abstract.Document#_onUpdate
   * @memberof CanvasDocumentMixin#
   */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if ( this.rendered ) this.object._onUpdate(changed, options, userId);
  }

  /* -------------------------------------------- */

  /**
   * @see abstract.Document#_onDelete
   * @memberof CanvasDocumentMixin#
   */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( this.rendered ) this.object._onDelete(options, userId);
  }
};

