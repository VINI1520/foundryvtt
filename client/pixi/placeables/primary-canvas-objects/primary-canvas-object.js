/**
 * A mixin which decorates a DisplayObject with additional properties expected for rendering in the PrimaryCanvasGroup.
 * @category - Mixins
 * @param {typeof PIXI.DisplayObject} DisplayObject   The parent DisplayObject class being mixed
 * @returns {typeof PrimaryCanvasObject}              A DisplayObject subclass mixed with PrimaryCanvasObject features
 */
function PrimaryCanvasObjectMixin(DisplayObject) {

  /**
   * A display object rendered in the PrimaryCanvasGroup.
   * @param {PlaceableObject|object} placeableObjectOrData  A linked PlaceableObject, or an independent data object
   * @param {...*} args                                     Additional arguments passed to the base class constructor
   */
  return class PrimaryCanvasObject extends DisplayObject {
    constructor(placeableObjectOrData, ...args) {
      super(...args);
      this.data = foundry.utils.deepClone(this.constructor.defaultData);
      let data = placeableObjectOrData;

      // Linked Case: provide a PlaceableObject instance
      if ( placeableObjectOrData instanceof PlaceableObject ) {
        this.object = placeableObjectOrData;
        data = this.object.document;
        this.#linkObjectProperties();
      }
      this.initialize(data);
      this.cullable = true;
    }

    /* -------------------------------------------- */

    /**
     * The PlaceableObject which is rendered to the PrimaryCanvasGroup (or undefined if no object is associated)
     * @type {PlaceableObject}
     */
    object;

    /**
     * Should the behavior of this primary canvas object be linked to an upstream PlaceableObject?
     * @type {boolean}
     */
    #linkedToObject = false;

    /**
     * Universal data object for this mesh.
     * @type {PrimaryCanvasObjectData}
     */
    data = {};

    /**
     * @typedef {Object} PrimaryCanvasObjectData
     * @property {number} x                   The x-coordinate of the PCO location
     * @property {number} y                   The y-coordinate of the PCO location
     * @property {number} z                   The z-index of the PCO
     * @property {number} width               The width of the PCO
     * @property {number} height              The height of the PCO
     * @property {number} alpha               The alpha of this PCO
     * @property {number} rotation            The rotation of this PCO
     * @property {boolean} hidden             The PCO is hidden?
     * @property {number} elevation           The elevation of the PCO
     * @property {number} sort                The sort key that resolves ties among the same elevation
     * @property {object} texture             The data texture values
     */
    static defaultData = {
      x: 0,
      y: 0,
      z: 0,
      width: 0,
      height: 0,
      alpha: 1,
      rotation: 0,
      hidden: false,
      elevation: undefined,
      sort: 0,
      texture: {
        scaleX: 1,
        scaleY: 1,
        src: null,
        tint: null
      }
    };

    /* -------------------------------------------- */

    /**
     * An elevation in distance units which defines how this Object is sorted relative to its siblings.
     * @type {number}
     */
    get elevation() {
      return this.data.elevation;
    }

    /* -------------------------------------------- */

    /**
     * A sort key which resolves ties amongst objects at the same elevation.
     * @type {number}
     */
    get sort() {
      return this.data.sort;
    }

    /* -------------------------------------------- */

    /**
     * A convenient reference to a Document associated with this display object, if any.
     * @type {ClientDocument|null}
     */
    get document() {
      return this.object?.document || null;
    }

    /* -------------------------------------------- */
    /*  Data Initialization                         */
    /* -------------------------------------------- */

    /**
     * Initialize data using an explicitly provided data object or a canvas document.
     * @param {PrimaryCanvasObjectData|Document} data     Provided data or canvas document.
     */
    initialize(data={}) {
      if ( data instanceof foundry.abstract.Document ) data = this._getCanvasDocumentData(data);
      foundry.utils.mergeObject(this.data, data, {inplace: true, insertKeys: false, overwrite: true, insertValues: true});
      this.refresh();
      this.updateBounds();
      this._initializeSorting(data.sort);
    }

    /* -------------------------------------------- */

    /**
     * Map the document data to an object and process some properties.
     * @param {Document} data       The document data.
     * @returns {Object}            The updated data object.
     * @protected
     */
    _getCanvasDocumentData(data) {
      const dt = foundry.utils.filterObject(data, this.constructor.defaultData);
      dt.elevation = data.elevation ?? 0;
      dt.sort = data.sort ?? 0;
      if ( data.texture?.tint !== undefined ) {
        dt.texture.tint = Color.from(dt.texture.tint).valueOf();
        if ( Number.isNaN(dt.texture.tint) ) dt.texture.tint = null;
      }
      return dt;
    }

    /* -------------------------------------------- */

    /**
     * Initialize sorting of this PCO. Perform checks and call the primary group sorting if necessary.
     * @param {number} sort     The sort value. Must be a finite number or undefined (in this case, it is ignored)
     * @protected
     */
    _initializeSorting(sort) {
      if ( (this.data.sort === sort) || (sort === undefined) ) return;
      this.data.sort = Number.isFinite(sort) ? sort : 0;
      canvas.primary.sortDirty = true;
    }

    /* -------------------------------------------- */

    /**
     * Define properties according to linked object.
     */
    #linkObjectProperties() {
      this.#linkedToObject = true;
      Object.defineProperties(this, {
        visible: {
          get: () => this.object.visible,
          set(visible) {
            this.object.visible = visible;
          }
        },
        renderable: {
          get: () => this.object.renderable,
          set(renderable) {
            this.object.renderable = renderable;
          }
        }
      });
    }

    /* -------------------------------------------- */
    /*  Methods                                     */
    /* -------------------------------------------- */

    /** @inheritDoc */
    destroy(...args) {
      canvas.primary.quadtree.remove(this);
      super.destroy(...args);
    }

    /* -------------------------------------------- */

    /**
     * Synchronize the appearance of this ObjectMesh with the properties of its represented Document.
     * @abstract
     */
    refresh() {}

    /* -------------------------------------------- */

    /**
     * Synchronize the position of the ObjectMesh using the position of its represented Document.
     * @abstract
     */
    setPosition() {}

    /* -------------------------------------------- */

    /**
     * Synchronize the bounds of the ObjectMesh into the primary group quadtree.
     */
    updateBounds() {
      if ( this.parent !== canvas.primary ) return;

      // Computing the bounds of this PCO and adding it to the primary group quadtree
      const {x, y, rotation} = this.data;
      const aw = Math.abs(this.width);
      const ah = Math.abs(this.height);
      const r = Math.toRadians(rotation);
      const bounds = ((aw === ah) ? new PIXI.Rectangle(x, y, aw, ah) : PIXI.Rectangle.fromRotation(x, y, aw, ah, r));
      canvas.primary.quadtree.update({r: bounds, t: this});
    }
  };
}
