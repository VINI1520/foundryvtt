/**
 * @deprecated since v10
 * @ignore
 */
class SynchronizedTransform extends PIXI.Transform {
  constructor(transform) {
    super();
    this.reference = transform;
    const msg = "The SynchronizedTransform class is deprecated and should no longer be used.";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
  }

  /**
   * A list of attributes from the transform reference which should be synchronized
   * @type {string}
   */
  static synchronizedAttributes = [
    "localTransform", "position", "scale", "pivot", "skew", "_rotation",
    "_cx", "_sx", "_cy", "_sy", "_localID", "_currentLocalID"
  ];

  /**
   * A Transform instance which defines the reference point for the worldTransform
   * @type {PIXI.Transform}
   */
  get reference() {
    return this._reference;
  }
  set reference(value) {
    this._reference = value;
    this._syncLocalID = -1;
  }

  /** @override */
  updateTransform(parentTransform) {
    if ( this._localID !== this._currentLocalID ) this._reference._parentID = -1;
    else if ( this._localID !== this._syncLocalID ) this._parentID = -1;
    this._syncLocalID = this._localID;
    super.updateTransform(parentTransform);
  }

  /** @override */
  updateLocalTransform() {
    if (this._localID !== this._currentLocalID) {
      this._reference._parentID = -1;
      super.updateLocalTransform();
    }
  }
}
for ( let attr of SynchronizedTransform.synchronizedAttributes ) {
  Object.defineProperty(SynchronizedTransform.prototype, attr, {
    get() { return this._reference[attr]; },
    set(value) {
      if ( !this._reference ) return;
      this._reference[attr] = value;
    }
  });
}

/**
 * @deprecated since v10
 * @ignore
 */
class ObjectHUD extends PIXI.Container {
  constructor(object) {
    super();
    const msg = "The ObjectHUD class is deprecated and should no longer be used.";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});

    /**
     * The object that this HUD container is linked to
     * @type {PIXI.DisplayObject}
     */
    this.object = object;

    /**
     * Use the linked object's transform matrix to easily synchronize position
     * @type {PIXI.Transform}
     */
    this.transform = new SynchronizedTransform(this.object.transform);

    // Allow the HUD to be culled when off-screen
    this.cullable = true;
  }

  /** @override */
  get visible() {
    return this.object.visible;
  }
  set visible(value) {}

  /** @override */
  get renderable() {
    return this.object.renderable;
  }
  set renderable(value) {}

  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  async createScrollingText(content, {direction=CONST.TEXT_ANCHOR_POINTS.TOP, ...options}={}) {
    const msg = "You are calling ObjectHUD#createScrollingText which has been migrated and refactored to"
      + " CanvasInterfaceGroup#createScrollingText";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    if ( !this.visible || !this.renderable ) return;
    const w = this.object.w;
    const h = this.object.h;
    let distance;
    if ( [CONST.TEXT_ANCHOR_POINTS.BOTTOM, CONST.TEXT_ANCHOR_POINTS.TOP].includes(direction) ) distance = h;
    else if ( [CONST.TEXT_ANCHOR_POINTS.LEFT, CONST.TEXT_ANCHOR_POINTS.RIGHT].includes(direction) ) distance = w;
    return canvas.interface.createScrollingText(this.object.center, content, {direction, distance, ...options});
  }
}
