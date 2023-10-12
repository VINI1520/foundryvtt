/**
 * An AmbientLight is an implementation of PlaceableObject which represents a dynamic light source within the Scene.
 * @category - Canvas
 * @see {@link AmbientLightDocument}
 * @see {@link LightingLayer}
 */
class AmbientLight extends PlaceableObject {
  constructor(document) {
    super(document);

    /**
     * A reference to the PointSource object which defines this light source area of effect
     * @type {LightSource}
     */
    this.source = new LightSource({object: this});
  }

  /**
   * A reference to the ControlIcon used to configure this light
   * @type {ControlIcon}
   */
  controlIcon;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static embeddedName = "AmbientLight";

  /** @override */
  static RENDER_FLAGS = {
    redraw: {propagate: ["refresh"]},
    refresh: {propagate: ["refreshField"], alias: true},
    refreshField: {propagate: ["refreshPosition", "refreshState"]},
    refreshPosition: {},
    refreshState: {}
  };

  /* -------------------------------------------- */

  /** @inheritdoc */
  get bounds() {
    const {x, y} = this.document;
    const r = Math.max(this.dimRadius, this.brightRadius);
    return new PIXI.Rectangle(x-r, y-r, 2*r, 2*r);
  }

  /* -------------------------------------------- */

  /**
   * A convenience accessor to the LightData configuration object
   * @returns {LightData}
   */
  get config() {
    return this.document.config;
  }

  /* -------------------------------------------- */

  /**
   * Test whether a specific AmbientLight source provides global illumination
   * @type {boolean}
   */
  get global() {
    return this.document.isGlobal;
  }

  /* -------------------------------------------- */

  /**
   * The maximum radius in pixels of the light field
   * @type {number}
   */
  get radius() {
    return Math.max(Math.abs(this.dimRadius), Math.abs(this.brightRadius));
  }

  /* -------------------------------------------- */

  /**
   * Get the pixel radius of dim light emitted by this light source
   * @type {number}
   */
  get dimRadius() {
    let d = canvas.dimensions;
    return ((this.config.dim / d.distance) * d.size);
  }

  /* -------------------------------------------- */

  /**
   * Get the pixel radius of bright light emitted by this light source
   * @type {number}
   */
  get brightRadius() {
    let d = canvas.dimensions;
    return ((this.config.bright / d.distance) * d.size);
  }

  /* -------------------------------------------- */

  /**
   * Is this Ambient Light currently visible? By default, true only if the source actively emits light.
   * @type {boolean}
   */
  get isVisible() {
    return this.emitsLight;
  }

  /* -------------------------------------------- */

  /**
   * Does this Ambient Light actively emit light given its properties and the current darkness level of the Scene?
   * @type {boolean}
   */
  get emitsLight() {
    const {hidden, config} = this.document;

    // Lights which are disabled are not visible
    if ( hidden ) return false;

    // Lights which have no radius are not visible
    if ( this.radius === 0 ) return false;

    // Some lights are inactive based on the current darkness level
    const darkness = canvas.darknessLevel;
    return darkness.between(config.darkness.min, config.darkness.max);
  }

  /* -------------------------------------------- */
  /* Rendering
  /* -------------------------------------------- */

  /** @override */
  _destroy(options) {
    this.source.destroy();
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    this.field = this.addChild(new PIXI.Graphics());
    this.field.eventMode = "none";
    this.controlIcon = this.addChild(this.#drawControlIcon());
  }

  /* -------------------------------------------- */

  /**
   * Draw the ControlIcon for the AmbientLight
   * @returns {ControlIcon}
   */
  #drawControlIcon() {
    const size = Math.max(Math.round((canvas.dimensions.size * 0.5) / 20) * 20, 40);
    let icon = new ControlIcon({texture: CONFIG.controlIcons.light, size: size });
    icon.x -= (size * 0.5);
    icon.y -= (size * 0.5);
    return icon;
  }

  /* -------------------------------------------- */
  /*  Incremental Refresh                         */
  /* -------------------------------------------- */

  /** @override */
  _applyRenderFlags(flags) {
    if ( flags.refreshField ) this.#refreshField();
    if ( flags.refreshPosition ) this.#refreshPosition();
    if ( flags.refreshState ) this.#refreshState();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the shape of the light field-of-effect. This is refreshed when the AmbientLight fov polygon changes.
   */
  #refreshField() {
    this.field.clear();
    if ( !this.source.disabled ) this.field.lineStyle(2, 0xEEEEEE, 0.4).drawShape(this.source.shape);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the position of the AmbientLight. Called with the coordinates change.
   */
  #refreshPosition() {
    const {x, y} = this.document;
    this.position.set(x, y);
    this.field.position.set(-x, -y);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the state of the light. Called when the disabled state or darkness conditions change.
   */
  #refreshState() {
    this.alpha = this._getTargetAlpha();
    this.refreshControl();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of the ControlIcon for this AmbientLight source.
   */
  refreshControl() {
    const isHidden = this.id && this.document.hidden;
    this.controlIcon.texture = getTexture(this.isVisible ? CONFIG.controlIcons.light : CONFIG.controlIcons.lightOff);
    this.controlIcon.tintColor = isHidden ? 0xFF3300 : 0xFFFFFF;
    this.controlIcon.borderColor = isHidden ? 0xFF3300 : 0xFF5500;
    this.controlIcon.draw();
    this.controlIcon.visible = this.layer.active;
    this.controlIcon.border.visible = this.hover || this.layer.highlightObjects;
  }

  /* -------------------------------------------- */
  /*  Light Source Management                     */
  /* -------------------------------------------- */

  /**
   * Update the LightSource associated with this AmbientLight object.
   * @param {object} [options={}]   Options which modify how the source is updated
   * @param {boolean} [options.defer]     Defer updating perception to manually update it later
   * @param {boolean} [options.deleted]   Indicate that this light source has been deleted
   */
  updateSource({defer=false, deleted=false}={}) {

    // Remove the light source from the active map
    if ( deleted ) canvas.effects.lightSources.delete(this.sourceId);

    // Update source data and add the source to the active map
    else {
      const d = canvas.dimensions;
      const sourceData = foundry.utils.mergeObject(this.config.toObject(false), {
        x: this.document.x,
        y: this.document.y,
        rotation: this.document.rotation,
        dim: Math.clamped(this.dimRadius, 0, d.maxR),
        bright: Math.clamped(this.brightRadius, 0, d.maxR),
        walls: this.document.walls,
        vision: this.document.vision,
        z: this.document.getFlag("core", "priority") ?? null,
        seed: this.document.getFlag("core", "animationSeed"),
        disabled: !this.emitsLight,
        preview: this.isPreview
      });
      this.source.initialize(sourceData);
      canvas.effects.lightSources.set(this.sourceId, this.source);
    }

    // Schedule a perception refresh, unless that operation is deferred for some later workflow
    if ( !defer ) canvas.perception.update({refreshLighting: true, refreshVision: true});
    if ( this.layer.active ) this.renderFlags.set({refreshField: true});
  }

  /* -------------------------------------------- */
  /*  Document Event Handlers                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    this.updateSource();
  }

  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data, options, userId) {
    super._onUpdate(data, options, userId);

    // Refresh Light Source
    this.updateSource();

    // Incremental Refresh
    this.renderFlags.set({
      refreshState: ["hidden", "config"].some(k => k in data),
      refreshField: ["hidden", "x", "y", "config", "rotation", "walls"].some(k => k in data)
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDelete(options, userId) {
    this.updateSource({deleted: true});
    super._onDelete(options, userId);
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _canHUD(user, event) {
    return user.isGM; // Allow GMs to single right-click
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _canConfigure(user, event) {
    return false; // Double-right does nothing
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickRight(event) {
    this.document.update({hidden: !this.document.hidden});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftMove(event) {
    super._onDragLeftMove(event);
    const clones = event.interactionData.clones || [];
    for ( let c of clones ) {
      c.updateSource({defer: true});
    }
    canvas.effects.refreshLighting();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragEnd() {
    this.updateSource({deleted: true});
    this._original?.updateSource();
    super._onDragEnd();
  }
}
