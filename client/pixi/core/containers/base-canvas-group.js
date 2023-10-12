/**
 * A mixin which decorates any container with base canvas common properties.
 * @category - Mixins
 * @param {typeof Container} ContainerClass  The parent Container class being mixed.
 * @returns {typeof BaseCanvasMixin}         A ContainerClass subclass mixed with BaseCanvasMixin features.
 */
const BaseCanvasMixin = ContainerClass => {
  return class BaseCanvasMixin extends ContainerClass {
    constructor(...args) {
      super(...args);
      this.sortableChildren = true;
      this.layers = this.#createLayers();
    }

    /**
     * The name of this canvas group.
     * @type {string}
     * @abstract
     */
    static groupName;

    /**
     * If this canvas group should teardown non-layers children.
     * @type {boolean}
     */
    static tearDownChildren = true;

    /**
     * A mapping of CanvasLayer classes which belong to this group.
     * @type {Object<CanvasLayer>}
     */
    layers;

    /* -------------------------------------------- */

    /**
     * Create CanvasLayer instances which belong to the primary group.
     * @private
     */
    #createLayers() {
      const layers = {};
      for ( let [name, config] of Object.entries(CONFIG.Canvas.layers) ) {
        if ( config.group !== this.constructor.groupName ) continue;
        const layer = layers[name] = new config.layerClass();
        Object.defineProperty(this, name, {value: layer, writable: false});
        Object.defineProperty(canvas, name, {value: layer, writable: false});
      }
      return layers;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /**
     * Draw the canvas group and all its component layers.
     * @returns {Promise<void>}
     */
    async draw() {
      // Draw CanvasLayer instances
      for ( const layer of Object.values(this.layers) ) {
        this.addChild(layer);
        await layer.draw();
      }
    }

    /* -------------------------------------------- */
    /*  Tear-Down                                   */
    /* -------------------------------------------- */

    /**
     * Remove and destroy all layers from the base canvas.
     * @param {object} [options={}]
     * @returns {Promise<void>}
     */
    async tearDown(options={}) {
      // Remove layers
      for ( const layer of Object.values(this.layers).reverse() ) {
        await layer.tearDown();
        this.removeChild(layer);
      }

      // Check if we need to handle other children
      if ( !this.constructor.tearDownChildren ) return;

      // Yes? Then proceed with children cleaning
      for ( const child of this.removeChildren() ) {
        if ( child instanceof CachedContainer ) child.clear();
        else child.destroy({children: true});
      }
    }
  };
};
