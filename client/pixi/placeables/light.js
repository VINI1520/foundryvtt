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
    this.source = new LightSource(this);
  }

  /**
   * A reference to the ControlIcon used to configure this light
   * @type {ControlIcon}
   */
  controlIcon;

  /* --------------------c------------------------ */

  /** @inheritdoc */
  static embeddedName = "AmbientLight";

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
  async _draw() {
    this.field = this.addChild(new PIXI.Graphics());
    this.controlIcon = this.addChild(this._drawControlIcon());
    this.updateSource({defer: true});
  }

  /* -------------------------------------------- */

  /**
   * Draw the ControlIcon for the AmbientLight
   * @returns {ControlIcon}
   * @private
   */
  _drawControlIcon() {
    const size = Math.max(Math.round((canvas.dimensions.size * 0.5) / 20) * 20, 40);
    let icon = new ControlIcon({texture: CONFIG.controlIcons.light, size: size });
    icon.x -= (size * 0.5);
    icon.y -= (size * 0.5);
    return icon;
  }

  /* -------------------------------------------- */

  /** @override */
  _refresh(options) {
    const active = this.layer.active;

    // Update position and FOV
    const {x, y} = this.document;
    this.position.set(x, y);
    this.field.position.set(-x, -y);

    // Draw the light preview field
    const l = this.field.clear();
    if ( active && this.source.los ) l.lineStyle(2, 0xEEEEEE, 0.4).drawShape(this.source.los);

    // Update control icon appearance
    this.refreshControl();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of the ControlIcon for this AmbientLight source
   */
  refreshControl() {
    this.controlIcon.texture = getTexture(this.isVisible ? CONFIG.controlIcons.light : CONFIG.controlIcons.lightOff);
    this.controlIcon.tintColor = this.document.hidden ? 0xFF3300 : 0xFFFFFF;
    this.controlIcon.borderColor = this.document.hidden ? 0xFF3300 : 0xFF5500;
    this.controlIcon.draw();
    this.controlIcon.visible = this.layer.active;
    this.controlIcon.border.visible = this.hover;
  }

  /* -------------------------------------------- */
  /*  Light Source Management                     */
  /* -------------------------------------------- */

  /**
   * Update the LightSource associated with this AmbientLight object.
   * @param {object} [options={}]   Options which modify how the source is updated
   * @param {boolean} [options.defer]     Defer refreshing the LightingLayer to manually call that refresh later
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
        seed: this.document.getFlag("core", "animationSeed")
      });
      this.source.initialize(sourceData);
      canvas.effects.lightSources.set(this.sourceId, this.source);
    }

    // Schedule a perception refresh, unless that operation is deferred for some later workflow
    if ( !defer ) canvas.perception.update({refreshLighting: true, refreshVision: true, forceUpdateFog: true}, true);
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onCreate(...args) {
    super._onCreate(...args);
    this.updateSource();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onUpdate(...args) {
    this.updateSource();
    super._onUpdate(...args);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDelete(...args) {
    super._onDelete(...args);
    this.updateSource({deleted: true});
  }

  /* -------------------------------------------- */
  /*  Mouse Interaction Handlers                  */
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
    const clones = event.data.clones || [];
    for ( let c of clones ) {
      c.updateSource({defer: true});
    }
    canvas.effects.refreshLighting();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftCancel(event) {
    super._onDragLeftCancel(event);
    this.updateSource();
  }
}
