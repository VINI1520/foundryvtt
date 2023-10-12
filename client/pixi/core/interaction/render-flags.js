/**
 * @typedef {Object} RenderFlag
 * @property {string[]} propagate     Activating this flag also sets these flags to true
 * @property {string[]} reset         Activating this flag resets these flags to false
 */

/**
 * A data structure for tracking a set of boolean status flags.
 * This is a restricted set which can only accept flag values which are pre-defined.
 * @param {Object<RenderFlag>} flags  An object which defines the flags which are supported for tracking
 * @param {object} [config]           Optional configuration
 * @param {RenderFlagObject} [config.object]  The object which owns this RenderFlags instance
 * @param {number} [config.priority]          The ticker priority at which these render flags are handled
 */
class RenderFlags extends Set {
  constructor(flags={}, {object, priority=PIXI.UPDATE_PRIORITY.OBJECTS}={}) {
    super([]);
    for ( const cfg of Object.values(flags) ) {
      cfg.propagate ||= [];
      cfg.reset ||= [];
    }
    Object.defineProperties(this, {
      /**
       * The flags tracked by this data structure.
       * @type {Object<RenderFlag>}
       */
      flags: {value: Object.freeze(flags), enumerable: false, writable: false},

      /**
       * The RenderFlagObject instance which owns this set of RenderFlags
       * @type {RenderFlagObject}
       */
      object: {value: object, enumerable: false, writable: false},

      /**
       * The update priority when these render flags are applied.
       * Valid options are OBJECTS or PERCEPTION.
       * @type {string}
       */
      priority: {value: priority, enumerable: false, writable: false}
    });
  }

  /* -------------------------------------------- */

  /**
   * @inheritDoc
   * @returns {Object<boolean>}     The flags which were previously set that have been cleared.
   */
  clear() {

    // Record which flags were previously active
    const flags = {};
    for ( const flag of this ) {
      flags[flag] = true;
    }

    // Empty the set
    super.clear();

    // Remove the object from the pending queue
    if ( this.object ) canvas.pendingRenderFlags[this.priority].delete(this.object);
    return flags;
  }

  /* -------------------------------------------- */

  /**
   * Allow for handling one single flag at a time.
   * This function returns whether the flag needs to be handled and removes it from the pending set.
   * @param {string} flag
   * @returns {boolean}
   */
  handle(flag) {
    const active = this.has(flag);
    this.delete(flag);
    return active;
  }

  /* -------------------------------------------- */

  /**
   * Activate certain flags, also toggling propagation and reset behaviors
   * @param {Object<boolean>} changes
   */
  set(changes) {
    const seen = new Set();
    for ( const [flag, value] of Object.entries(changes) ) {
      this.#set(flag, value, seen);
    }
    if ( this.object ) canvas.pendingRenderFlags[this.priority].add(this.object);
  }

  /* -------------------------------------------- */

  /**
   * Recursively set a flag.
   * This method applies propagation or reset behaviors when flags are assigned.
   * @param {string} flag
   * @param {boolean} value
   * @param {Set<string>} seen
   */
  #set(flag, value, seen) {
    if ( seen.has(flag) || !value ) return;
    seen.add(flag);
    const cfg = this.flags[flag];
    if ( !cfg ) throw new Error(`"${flag}" is not defined as a supported RenderFlag option.`);
    if ( !cfg.alias ) this.add(flag);
    for ( const r of cfg.reset ) this.delete(r);
    for ( const p of cfg.propagate ) this.#set(p, true, seen);
  }
}

/* -------------------------------------------- */

/**
 * Add RenderFlags functionality to some other object.
 * This mixin standardizes the interface for such functionality.
 * @param {typeof PIXI.DisplayObject} Base      The base class being mixed
 * @returns {typeof RenderFlagObject}           The mixed class definition
 */
function RenderFlagsMixin(Base) {
  return class RenderFlagObject extends Base {
    constructor(...args) {
      super(...args);
      this.renderFlags = new RenderFlags(this.constructor.RENDER_FLAGS, {
        object: this,
        priority: this.constructor.RENDER_FLAG_PRIORITY
      });
    }

    /**
     * Configure the render flags used for this class.
     * @type {Object<RenderFlag>}
     */
    static RENDER_FLAGS = {};

    /**
     * The ticker priority when RenderFlags of this class are handled.
     * Valid values are OBJECTS or PERCEPTION.
     * @type {string}
     */
    static RENDER_FLAG_PRIORITY = "OBJECTS";

    /**
     * Status flags which are applied at render-time to update the PlaceableObject.
     * If an object defines RenderFlags, it should at least include flags for "redraw" and "refresh".
     * @type {RenderFlags}
     */
    renderFlags;

    /**
     * Apply any current render flags, clearing the renderFlags set.
     * Subclasses should override this method to define behavior.
     */
    applyRenderFlags() {
      this.renderFlags.clear();
    }
  };
}

/* -------------------------------------------- */
