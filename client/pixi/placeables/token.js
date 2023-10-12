/**
 * A Token is an implementation of PlaceableObject which represents an Actor within a viewed Scene on the game canvas.
 * @category - Canvas
 * @see {TokenDocument}
 * @see {TokenLayer}
 */
class Token extends PlaceableObject {
  constructor(document) {
    super(document);
    this.#initialize();
  }

  /** @inheritdoc */
  static embeddedName = "Token";

  /** @override */
  static RENDER_FLAGS = {
    redraw: {propagate: ["refresh"]},
    redrawEffects: {},
    refresh: {propagate: ["refreshState", "refreshSize", "refreshPosition", "refreshElevation", "refreshBars",
      "refreshNameplate", "refreshBorder", "refreshShader"], alias: true},
    refreshState: {propagate: ["refreshVisibility", "refreshBorder"]},
    refreshSize: {propagate: ["refreshMesh", "refreshBorder", "refreshBars", "refreshPosition", "refreshTarget", "refreshEffects"]},
    refreshPosition: {propagate: ["refreshMesh", "refreshVisibility"]},
    refreshElevation: {propagate: ["refreshMesh"]},
    refreshVisibility: {},
    refreshEffects: {},
    refreshMesh: {},
    refreshShader: {},
    refreshBars: {},
    refreshNameplate: {},
    refreshBorder: {},
    refreshTarget: {}
  };

  /**
   * Defines the filter to use for detection.
   * @param {PIXI.Filter|null} filter
   */
  detectionFilter = null;

  /**
   * A Graphics instance which renders the border frame for this Token inside the GridLayer.
   * @type {PIXI.Graphics}
   */
  border;

  /**
   * Track the set of User documents which are currently targeting this Token
   * @type {Set<User>}
   */
  targeted = new Set([]);

  /**
   * A reference to the SpriteMesh which displays this Token in the PrimaryCanvasGroup.
   * @type {TokenMesh}
   */
  mesh;

  /**
   * A reference to the VisionSource object which defines this vision source area of effect
   * @type {VisionSource}
   */
  vision = new VisionSource({object: this});

  /**
   * A reference to the LightSource object which defines this light source area of effect
   * @type {LightSource}
   */
  light = new LightSource({object: this});

  /**
   * A reference to an animation that is currently in progress for this Token, if any
   * @type {Promise|null}
   * @internal
   */
  _animation = null;

  /**
   * An Object which records the Token's prior velocity dx and dy.
   * This can be used to determine which direction a Token was previously moving.
   * @type {{dx: number, dy: number, ox: number, oy: number}}
   */
  #priorMovement;

  /**
   * The Token central coordinate, adjusted for its most recent movement vector.
   * @type {Point}
   */
  #adjustedCenter;

  /**
   * @typedef {Point} TokenPosition
   * @property {number} rotation  The token's last valid rotation.
   */

  /**
   * The Token's most recent valid position and rotation.
   * @type {TokenPosition}
   */
  #validPosition;

  /**
   * A flag to capture whether this Token has an unlinked video texture
   * @type {boolean}
   */
  #unlinkedVideo = false;

  /* -------------------------------------------- */

  /**
   * Establish an initial velocity of the token based on its direction of facing.
   * Assume the Token made some prior movement towards the direction that it is currently facing.
   */
  #initialize() {

    // Initialize prior movement
    const {x, y, rotation} = this.document;
    const r = Ray.fromAngle(x, y, Math.toRadians(rotation + 90), canvas.dimensions.size);

    // Initialize valid position
    this.#validPosition = {x, y, rotation};
    this.#priorMovement = {dx: r.dx, dy: r.dy, ox: Math.sign(r.dx), oy: Math.sign(r.dy)};
    this.#adjustedCenter = this.getMovementAdjustedPoint(this.center);
  }

  /* -------------------------------------------- */
  /*  Permission Attributes
  /* -------------------------------------------- */

  /**
   * A convenient reference to the Actor object associated with the Token embedded document.
   * @returns {Actor|null}
   */
  get actor() {
    return this.document.actor;
  }

  /* -------------------------------------------- */

  /**
   * A convenient reference for whether the current User has full control over the Token document.
   * @type {boolean}
   */
  get owner() {
    return this.document.isOwner;
  }

  get isOwner() {
    return this.document.isOwner;
  }

  /* -------------------------------------------- */

  /**
   * A boolean flag for whether the current game User has observer permission for the Token
   * @type {boolean}
   */
  get observer() {
    return game.user.isGM || !!this.actor?.testUserPermission(game.user, "OBSERVER");
  }

  /* -------------------------------------------- */

  /**
   * Is the HUD display active for this token?
   * @returns {boolean}
   */
  get hasActiveHUD() {
    return this.layer.hud.object === this;
  }

  /* -------------------------------------------- */

  /**
   * Convenience access to the token's nameplate string
   * @type {string}
   */
  get name() {
    return this.document.name;
  }

  /* -------------------------------------------- */
  /*  Rendering Attributes
  /* -------------------------------------------- */

  /** @override */
  get bounds() {
    const {x, y} = this.document;
    return new PIXI.Rectangle(x, y, this.w, this.h);
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's grid width into a pixel width based on the canvas size
   * @type {number}
   */
  get w() {
    return canvas.grid.grid.getRect(this.document.width, this.document.height).width;
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's grid height into a pixel height based on the canvas size
   * @type {number}
   */
  get h() {
    return canvas.grid.grid.getRect(this.document.width, this.document.height).height;
  }

  /* -------------------------------------------- */

  /**
   * The Token's current central position
   * @type {Point}
   */
  get center() {
    return this.getCenter(this.document.x, this.document.y);
  }

  /* -------------------------------------------- */

  /**
   * The Token's central position, adjusted in each direction by one or zero pixels to offset it relative to walls.
   * @type {Point}
   */
  getMovementAdjustedPoint(point, {offsetX, offsetY}={}) {
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    const r = new PIXI.Rectangle(x, y, 0, 0);
    const walls = canvas.walls.quadtree.getObjects(r, {collisionTest: o => {
      return foundry.utils.orient2dFast(o.t.A, o.t.B, {x, y}) === 0;
    }});
    if ( walls.size ) {
      const {ox, oy} = this.#priorMovement;
      return {x: x - (offsetX ?? ox), y: y - (offsetY ?? oy)};
    }
    return {x, y};
  }

  /* -------------------------------------------- */

  /**
   * The HTML source element for the primary Tile texture
   * @type {HTMLImageElement|HTMLVideoElement}
   */
  get sourceElement() {
    return this.texture?.baseTexture.resource.source;
  }

  /* -------------------------------------------- */

  /** @override */
  get sourceId() {
    let id = `${this.document.documentName}.${this.document.id}`;
    if ( this.isPreview ) id += ".preview";
    return id;
  }

  /* -------------------------------------------- */

  /**
   * Does this Tile depict an animated video texture?
   * @type {boolean}
   */
  get isVideo() {
    const source = this.sourceElement;
    return source?.tagName === "VIDEO";
  }

  /* -------------------------------------------- */
  /*  State Attributes
  /* -------------------------------------------- */

  /**
   * An indicator for whether or not this token is currently involved in the active combat encounter.
   * @type {boolean}
   */
  get inCombat() {
    return this.document.inCombat;
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to a Combatant that represents this Token, if one is present in the current encounter.
   * @type {Combatant|null}
   */
  get combatant() {
    return this.document.combatant;
  }

  /* -------------------------------------------- */

  /**
   * An indicator for whether the Token is currently targeted by the active game User
   * @type {boolean}
   */
  get isTargeted() {
    return this.targeted.has(game.user);
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the detection modes array.
   * @type {[object]}
   */
  get detectionModes() {
    return this.document.detectionModes;
  }

  /* -------------------------------------------- */

  /**
   * Determine whether the Token is visible to the calling user's perspective.
   * Hidden Tokens are only displayed to GM Users.
   * Non-hidden Tokens are always visible if Token Vision is not required.
   * Controlled tokens are always visible.
   * All Tokens are visible to a GM user if no Token is controlled.
   *
   * @see {CanvasVisibility#testVisibility}
   * @type {boolean}
   */
  get isVisible() {
    // Clear the detection filter
    this.detectionFilter = undefined;

    // Only GM users can see hidden tokens
    const gm = game.user.isGM;
    if ( this.document.hidden && !gm ) return false;

    // Some tokens are always visible
    if ( !canvas.effects.visibility.tokenVision ) return true;
    if ( this.controlled ) return true;

    // Otherwise, test visibility against current sight polygons
    if ( canvas.effects.visionSources.get(this.sourceId)?.active ) return true;
    const tolerance = Math.min(this.w, this.h) / 4;
    return canvas.effects.visibility.testVisibility(this.center, {tolerance, object: this});
  }

  /* -------------------------------------------- */

  /**
   * The animation name used for Token movement
   * @type {string}
   */
  get animationName() {
    return `${this.objectId}.animate`;
  }

  /* -------------------------------------------- */
  /*  Lighting and Vision Attributes
  /* -------------------------------------------- */

  /**
   * Test whether the Token has sight (or blindness) at any radius
   * @type {boolean}
   */
  get hasSight() {
    return this.document.sight.enabled;
  }

  /* -------------------------------------------- */

  /**
   * Does this Token actively emit light given its properties and the current darkness level of the Scene?
   * @type {boolean}
   */
  get emitsLight() {
    const {hidden, light} = this.document;
    if ( hidden ) return false;
    if ( !(light.dim || light.bright) ) return false;
    const darkness = canvas.darknessLevel;
    return darkness.between(light.darkness.min, light.darkness.max);
  }

  /* -------------------------------------------- */

  /**
   * Test whether the Token uses a limited angle of vision or light emission.
   * @type {boolean}
   */
  get hasLimitedSourceAngle() {
    const doc = this.document;
    return (this.hasSight && (doc.sight.angle !== 360)) || (this.emitsLight && (doc.light.angle !== 360));
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's dim light distance in units into a radius in pixels.
   * @type {number}
   */
  get dimRadius() {
    return this.getLightRadius(this.document.light.dim);
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's bright light distance in units into a radius in pixels.
   * @type {number}
   */
  get brightRadius() {
    return this.getLightRadius(this.document.light.bright);
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's vision range in units into a radius in pixels.
   * @type {number}
   */
  get sightRange() {
    return this.getLightRadius(this.document.sight.range);
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's maximum vision range that takes into account lights.
   * @type {number}
   */
  get optimalSightRange() {
    const r = Math.max(Math.abs(this.document.light.bright), Math.abs(this.document.light.dim));
    return this.getLightRadius(Math.max(this.document.sight.range, r));
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  clone() {
    const clone = super.clone();
    clone.#priorMovement = this.#priorMovement;
    clone.#validPosition = this.#validPosition;
    return clone;
  }

  /* -------------------------------------------- */

  /**
   * Update the light and vision source objects associated with this Token.
   * @param {object} [options={}]       Options which configure how perception sources are updated
   * @param {boolean} [options.defer=false]         Defer updating perception to manually update it later
   * @param {boolean} [options.deleted=false]       Indicate that this light and vision source has been deleted
   */
  updateSource({defer=false, deleted=false}={}) {
    this.#adjustedCenter = this.getMovementAdjustedPoint(this.center);
    this.updateLightSource({defer, deleted});
    this.updateVisionSource({defer, deleted});
  }

  /* -------------------------------------------- */

  /**
   * Update an emitted light source associated with this Token.
   * @param {object} [options={}]
   * @param {boolean} [options.defer]      Defer updating perception to manually update it later.
   * @param {boolean} [options.deleted]    Indicate that this light source has been deleted.
   */
  updateLightSource({defer=false, deleted=false}={}) {

    // Prepare data
    const origin = this.#adjustedCenter;
    const sourceId = this.sourceId;
    const d = canvas.dimensions;
    const isLightSource = this.emitsLight;

    // Initialize a light source
    if ( isLightSource && !deleted ) {
      const lightConfig = foundry.utils.mergeObject(this.document.light.toObject(false), {
        x: origin.x,
        y: origin.y,
        elevation: this.document.elevation,
        dim: Math.clamped(this.getLightRadius(this.document.light.dim), 0, d.maxR),
        bright: Math.clamped(this.getLightRadius(this.document.light.bright), 0, d.maxR),
        externalRadius: this.externalRadius,
        z: this.document.getFlag("core", "priority"),
        seed: this.document.getFlag("core", "animationSeed"),
        rotation: this.document.rotation,
        preview: this.isPreview
      });
      this.light.initialize(lightConfig);
      canvas.effects.lightSources.set(sourceId, this.light);
    }

    // Remove a light source
    else deleted = canvas.effects.lightSources.delete(sourceId);

    // Schedule a perception update
    if ( !defer && (isLightSource || deleted) ) {
      canvas.perception.update({
        refreshLighting: true,
        refreshVision: true
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the VisionSource instance associated with this Token.
   * @param {object} [options]        Options which affect how the vision source is updated
   * @param {boolean} [options.defer]     Defer updating perception to manually update it later.
   * @param {boolean} [options.deleted]   Indicate that this vision source has been deleted.
   */
  updateVisionSource({defer=false, deleted=false}={}) {

    // Prepare data
    const origin = this.#adjustedCenter;
    const sourceId = this.sourceId;
    const d = canvas.dimensions;
    const isVisionSource = this._isVisionSource();
    let initializeVision = false;

    // Initialize vision source
    if ( isVisionSource && !deleted ) {
      const previousVisionMode = this.vision.visionMode;
      this.vision.initialize({
        x: origin.x,
        y: origin.y,
        elevation: this.document.elevation,
        radius: Math.clamped(this.sightRange, 0, d.maxR),
        externalRadius: this.externalRadius,
        angle: this.document.sight.angle,
        contrast: this.document.sight.contrast,
        saturation: this.document.sight.saturation,
        brightness: this.document.sight.brightness,
        attenuation: this.document.sight.attenuation,
        rotation: this.document.rotation,
        visionMode: this.document.sight.visionMode,
        color: Color.from(this.document.sight.color),
        blinded: this.document.hasStatusEffect(CONFIG.specialStatusEffects.BLIND),
        preview: this.isPreview
      });
      if ( !canvas.effects.visionSources.has(sourceId) || (this.vision.visionMode !== previousVisionMode) ) {
        initializeVision = true;
      }
      canvas.effects.visionSources.set(sourceId, this.vision);
    }

    // Remove vision source and deactivate current vision mode
    else deleted = canvas.effects.visionSources.delete(sourceId);
    if ( deleted ) {
      initializeVision = true;
      this.vision.visionMode?.deactivate(this.vision);
    }

    // Schedule a perception update
    if ( !defer && (isVisionSource || deleted) ) {
      canvas.perception.update({
        refreshLighting: true,
        refreshVision: true,
        initializeVision
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Test whether this Token is a viable vision source for the current User
   * @returns {boolean}
   * @protected
   */
  _isVisionSource() {
    if ( !canvas.effects.visibility.tokenVision || !this.hasSight ) return false;

    // Only display hidden tokens for the GM
    const isGM = game.user.isGM;
    if (this.document.hidden && !isGM) return false;

    // Always display controlled tokens which have vision
    if ( this.controlled ) return true;

    // Otherwise, vision is ignored for GM users
    if ( isGM ) return false;

    // If a non-GM user controls no other tokens with sight, display sight
    const canObserve = this.actor?.testUserPermission(game.user, "OBSERVER") ?? false;
    if ( !canObserve ) return false;
    const others = this.layer.controlled.filter(t => !t.document.hidden && t.hasSight);
    return !others.length;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  render(renderer) {
    if ( this.detectionFilter ) this._renderDetectionFilter(renderer);
    super.render(renderer);
  }

  /* -------------------------------------------- */

  /**
   * Render the bound mesh detection filter.
   * Note: this method does not verify that the detection filter exists.
   * @param {PIXI.Renderer} renderer
   * @protected
   */
  _renderDetectionFilter(renderer) {
    if ( !this.mesh ) return;

    // Pushing the detection filter on the mesh
    this.mesh.filters ??= [];
    this.mesh.filters.push(this.detectionFilter);

    // Rendering the mesh
    const originalTint = this.mesh.tint;
    const originalAlpha = this.mesh.worldAlpha;
    this.mesh.tint = 0xFFFFFF;
    this.mesh.worldAlpha = 1;
    this.mesh.pluginName = BaseSamplerShader.classPluginName;
    this.mesh.render(renderer);
    this.mesh.tint = originalTint;
    this.mesh.worldAlpha = originalAlpha;
    this.mesh.pluginName = null;

    // Removing the detection filter on the mesh
    this.mesh.filters.pop();
  }

  /* -------------------------------------------- */

  /** @override */
  clear() {
    if ( this.mesh ) this.mesh.texture = PIXI.Texture.EMPTY;
    if ( this.#unlinkedVideo ) this.texture?.baseTexture?.destroy(); // Destroy base texture if the token has an unlinked video
    this.#unlinkedVideo = false;
    if ( this.border ) this.border.visible = false;
    if ( this.hasActiveHUD ) this.layer.hud.clear();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _destroy(options) {
    this.stopAnimation();                       // Cancel movement animations
    canvas.primary.removeToken(this);           // Remove the TokenMesh from the PrimaryCanvasGroup
    this.border?.destroy();                     // Remove the border Graphics from the GridLayer
    this.light.destroy();                       // Destroy the LightSource
    this.vision.destroy();                      // Destroy the VisionSource
    if ( this.#unlinkedVideo ) this.texture?.baseTexture?.destroy();  // Destroy base texture if the token has an unlinked video
    this.removeChildren().forEach(c => c.destroy({children: true}));
    this.texture = undefined;
    this.#unlinkedVideo = false;
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw() {
    this.#cleanData();

    // Load token texture
    let texture;
    if ( this._original ) texture = this._original.texture?.clone();
    else texture = await loadTexture(this.document.texture.src, {fallback: CONST.DEFAULT_TOKEN});

    // Manage video playback
    let video = game.video.getVideoSource(texture);
    this.#unlinkedVideo = !!video && !this._original;
    if ( this.#unlinkedVideo ) {
      texture = await game.video.cloneTexture(video);
      video = game.video.getVideoSource(texture);
      const playOptions = {volume: 0};
      if ( (this.document.getFlag("core", "randomizeVideo") !== false) && Number.isFinite(video.duration) ) {
        playOptions.offset = Math.random() * video.duration;
      }
      game.video.play(video, playOptions);
    }
    this.texture = texture;

    // Draw the TokenMesh in the PrimaryCanvasGroup
    this.mesh = canvas.primary.addToken(this);

    // Draw the border frame in the GridLayer
    this.border ||= canvas.grid.borders.addChild(new PIXI.Graphics());

    // Draw Token interface components
    this.bars ||= this.addChild(this.#drawAttributeBars());
    this.tooltip ||= this.addChild(this.#drawTooltip());
    this.effects ||= this.addChild(new PIXI.Container());

    this.target ||= this.addChild(new PIXI.Graphics());
    this.nameplate ||= this.addChild(this.#drawNameplate());

    // Draw elements
    await this.drawEffects();

    // Define initial interactivity and visibility state
    this.hitArea = new PIXI.Rectangle(0, 0, this.w, this.h);
  }

  /* -------------------------------------------- */

  /**
   * Apply initial sanitizations to the provided input data to ensure that a Token has valid required attributes.
   * Constrain the Token position to remain within the Canvas rectangle.
   */
  #cleanData() {
    if ( !canvas || !this.scene?.active ) return;
    const d = canvas.dimensions;
    this.document.x = Math.clamped(this.document.x, 0, d.width - this.w);
    this.document.y = Math.clamped(this.document.y, 0, d.height - this.h);
  }

  /* -------------------------------------------- */

  /**
   * Draw resource bars for the Token
   */
  #drawAttributeBars() {
    const bars = new PIXI.Container();
    bars.bar1 = bars.addChild(new PIXI.Graphics());
    bars.bar2 = bars.addChild(new PIXI.Graphics());
    return bars;
  }

  /* -------------------------------------------- */
  /*  Incremental Refresh                         */
  /* -------------------------------------------- */

  /** @override */
  _applyRenderFlags(flags) {
    if ( flags.refreshVisibility ) this._refreshVisibility();
    if ( flags.refreshPosition ) this.#refreshPosition();
    if ( flags.refreshElevation ) this.#refreshElevation();
    if ( flags.refreshBars ) this.drawBars();
    if ( flags.refreshNameplate ) this._refreshNameplate();
    if ( flags.refreshBorder ) this._refreshBorder();
    if ( flags.refreshSize ) this.#refreshSize();
    if ( flags.refreshTarget ) this._refreshTarget();
    if ( flags.refreshState ) this.#refreshState();
    if ( flags.refreshMesh ) this._refreshMesh();
    if ( flags.refreshShader ) this._refreshShader();
    if ( flags.refreshEffects ) this._refreshEffects();
    if ( flags.redrawEffects ) this.drawEffects();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the visibility.
   * @protected
   */
  _refreshVisibility() {
    this.visible = this.isVisible;
    if ( this.border ) this.border.visible = this.visible && this.renderable
      && (this.controlled || this.hover || this.layer.highlightObjects)
      && !((this.document.disposition === CONST.TOKEN_DISPOSITIONS.SECRET) && !this.isOwner);
  }

  /* -------------------------------------------- */

  /**
   * Refresh aspects of the user interaction state.
   * For example the border, nameplate, or bars may be shown on Hover or on Control.
   */
  #refreshState() {
    this.alpha = this._getTargetAlpha();
    this.nameplate.visible = this._canViewMode(this.document.displayName);
    this.bars.visible = this.actor && this._canViewMode(this.document.displayBars);
    const activePointer = !((this.document.disposition === CONST.TOKEN_DISPOSITIONS.SECRET) && !this.isOwner);
    this.cursor = activePointer ? "pointer" : null;
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to the width or height of the Token base.
   */
  #refreshSize() {

    // Hit Area
    this.hitArea.width = this.w;
    this.hitArea.height = this.h;

    // Nameplate and tooltip position
    this.nameplate.position.set(this.w / 2, this.h + 2);
    this.tooltip.position.set(this.w / 2, -2);
  }

  /* -------------------------------------------- */

  /**
   * Refresh position of the Token. Called when x/y coordinates change.
   */
  #refreshPosition() {
    this.position.set(this.document.x, this.document.y);
    this.border.position.set(this.document.x, this.document.y);
  }

  /* -------------------------------------------- */

  /**
   * Refresh elevation of the Token. Called when its elevation or sort attributes change.
   */
  #refreshElevation() {
    canvas.primary.sortDirty = true;

    // Elevation tooltip text
    const tt = this._getTooltipText();
    if ( tt !== this.tooltip.text ) this.tooltip.text = tt;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the text content, position, and visibility of the Token nameplate.
   * @protected
   */
  _refreshNameplate() {
    this.nameplate.text = this.document.name;
    this.nameplate.visible = this._canViewMode(this.document.displayName);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the token mesh.
   * @protected
   */
  _refreshMesh() {
    this.mesh?.initialize(this.document);
    if ( this.mesh ) this.mesh.alpha = Math.min(this.mesh.alpha, this.alpha);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the token mesh shader.
   * @protected
   */
  _refreshShader() {
    if ( !this.mesh ) return;
    const isInvisible = this.document.hasStatusEffect(CONFIG.specialStatusEffects.INVISIBLE);
    this.mesh.setShaderClass(isInvisible ? TokenInvisibilitySamplerShader : InverseOcclusionSamplerShader);
  }

  /* -------------------------------------------- */

  /**
   * Draw the Token border, taking into consideration the grid type and border color
   * @protected
   */
  _refreshBorder() {
    const b = this.border;
    b.clear();

    // Determine the desired border color
    const borderColor = this._getBorderColor();
    if ( !borderColor ) return;

    // Draw Hex border for size 1 tokens on a hex grid
    const t = CONFIG.Canvas.objectBorderThickness;
    if ( canvas.grid.isHex ) {
      const polygon = canvas.grid.grid.getBorderPolygon(this.document.width, this.document.height, t);
      if ( polygon ) {
        b.lineStyle(t, 0x000000, 0.8).drawPolygon(polygon);
        b.lineStyle(t/2, borderColor, 1.0).drawPolygon(polygon);
      }
    }

    // Otherwise, draw square border
    else {
      const h = Math.round(t/2);
      const o = Math.round(h/2);
      b.lineStyle(t, 0x000000, 0.8).drawRoundedRect(-o, -o, this.w+h, this.h+h, 3);
      b.lineStyle(h, borderColor, 1.0).drawRoundedRect(-o, -o, this.w+h, this.h+h, 3);
    }
  }

  /* -------------------------------------------- */

  /**
   * Get the hex color that should be used to render the Token border
   * @param {object} [options]
   * @param {boolean} [options.hover]  Return a border color for this hover state, otherwise use the token's current
   *                                   state.
   * @returns {number|null}            The hex color used to depict the border color
   * @protected
   */
  _getBorderColor({hover}={}) {
    const colors = CONFIG.Canvas.dispositionColors;
    if ( this.controlled ) return colors.CONTROLLED;
    else if ( (hover ?? this.hover) || this.layer.highlightObjects ) {
      let d = this.document.disposition;
      if ( !game.user.isGM && this.isOwner ) return colors.CONTROLLED;
      else if ( this.actor?.hasPlayerOwner ) return colors.PARTY;
      else if ( d === CONST.TOKEN_DISPOSITIONS.FRIENDLY ) return colors.FRIENDLY;
      else if ( d === CONST.TOKEN_DISPOSITIONS.NEUTRAL ) return colors.NEUTRAL;
      else if ( d === CONST.TOKEN_DISPOSITIONS.HOSTILE ) return colors.HOSTILE;
      else if ( d === CONST.TOKEN_DISPOSITIONS.SECRET ) return this.isOwner ? colors.SECRET : null;
    }
    return null;
  }

  /* -------------------------------------------- */

  /**
   * @typedef {object} ReticuleOptions
   * @property {number} [margin=0]        The amount of margin between the targeting arrows and the token's bounding
   *                                      box, expressed as a fraction of an arrow's size.
   * @property {number} [alpha=1]         The alpha value of the arrows.
   * @property {number} [size=0.15]       The size of the arrows as a proportion of grid size.
   * @property {number} [color=0xFF6400]  The color of the arrows.
   * @property {object} [border]          The arrows' border style configuration.
   * @property {number} [border.color=0]  The border color.
   * @property {number} [border.width=2]  The border width.
   */

  /**
   * Refresh the target indicators for the Token.
   * Draw both target arrows for the primary User and indicator pips for other Users targeting the same Token.
   * @param {ReticuleOptions} [reticule]  Additional parameters to configure how the targeting reticule is drawn.
   * @protected
   */
  _refreshTarget(reticule) {
    this.target.clear();

    // We don't show the target arrows for a secret token disposition and non-GM users
    const isSecret = (this.document.disposition === CONST.TOKEN_DISPOSITIONS.SECRET) && !this.isOwner;
    if ( !this.targeted.size || isSecret ) return;

    // Determine whether the current user has target and any other users
    const [others, user] = Array.from(this.targeted).partition(u => u === game.user);

    // For the current user, draw the target arrows
    if ( user.length ) this._drawTarget(reticule);

    // For other users, draw offset pips
    const hw = (this.w / 2) + (others.length % 2 === 0 ? 8 : 0);
    for ( let [i, u] of others.entries() ) {
      const offset = Math.floor((i+1) / 2) * 16;
      const sign = i % 2 === 0 ? 1 : -1;
      const x = hw + (sign * offset);
      this.target.beginFill(Color.from(u.color), 1.0).lineStyle(2, 0x0000000).drawCircle(x, 0, 6);
    }
  }

  /* -------------------------------------------- */

  /**
   * Draw the targeting arrows around this token.
   * @param {ReticuleOptions} [reticule]  Additional parameters to configure how the targeting reticule is drawn.
   * @protected
   */
  _drawTarget({margin: m=0, alpha=1, size=.15, color, border: {width=2, color: lineColor=0}={}}={}) {
    const l = canvas.dimensions.size * size; // Side length.
    const {h, w} = this;
    const lineStyle = {color: lineColor, alpha, width, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.BEVEL};
    color ??= (this._getBorderColor({hover: true}) ?? CONFIG.Canvas.dispositionColors.NEUTRAL);
    m *= l * -1;
    this.target.beginFill(color, alpha).lineStyle(lineStyle)
      .drawPolygon([-m, -m, -m-l, -m, -m, -m-l]) // Top left
      .drawPolygon([w+m, -m, w+m+l, -m, w+m, -m-l]) // Top right
      .drawPolygon([-m, h+m, -m-l, h+m, -m, h+m+l]) // Bottom left
      .drawPolygon([w+m, h+m, w+m+l, h+m, w+m, h+m+l]); // Bottom right
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of Token attribute bars, rendering its latest resource data.
   * If the bar attribute is valid (has a value and max), draw the bar. Otherwise hide it.
   */
  drawBars() {
    if ( !this.actor || (this.document.displayBars === CONST.TOKEN_DISPLAY_MODES.NONE) ) return;
    ["bar1", "bar2"].forEach((b, i) => {
      const bar = this.bars[b];
      const attr = this.document.getBarAttribute(b);
      if ( !attr || (attr.type !== "bar") || (attr.max === 0) ) return bar.visible = false;
      this._drawBar(i, bar, attr);
      bar.visible = true;
    });
  }

  /* -------------------------------------------- */

  /**
   * Draw a single resource bar, given provided data
   * @param {number} number       The Bar number
   * @param {PIXI.Graphics} bar   The Bar container
   * @param {Object} data         Resource data for this bar
   * @protected
   */
  _drawBar(number, bar, data) {
    const val = Number(data.value);
    const pct = Math.clamped(val, 0, data.max) / data.max;

    // Determine sizing
    let h = Math.max((canvas.dimensions.size / 12), 8);
    const w = this.w;
    const bs = Math.clamped(h / 8, 1, 2);
    if ( this.document.height >= 2 ) h *= 1.6;  // Enlarge the bar for large tokens

    // Determine the color to use
    const blk = 0x000000;
    let color;
    if ( number === 0 ) color = Color.fromRGB([(1-(pct/2)), pct, 0]);
    else color = Color.fromRGB([(0.5 * pct), (0.7 * pct), 0.5 + (pct / 2)]);

    // Draw the bar
    bar.clear();
    bar.beginFill(blk, 0.5).lineStyle(bs, blk, 1.0).drawRoundedRect(0, 0, this.w, h, 3);
    bar.beginFill(color, 1.0).lineStyle(bs, blk, 1.0).drawRoundedRect(0, 0, pct*w, h, 2);

    // Set position
    let posY = number === 0 ? this.h - h : 0;
    bar.position.set(0, posY);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Draw the token's nameplate as a text object
   * @returns {PIXI.Text}  The Text object for the Token nameplate
   */
  #drawNameplate() {
    const style = this._getTextStyle();
    const name = new PreciseText(this.document.name, style);
    name.anchor.set(0.5, 0);
    name.position.set(this.w / 2, this.h + 2);
    return name;
  }

  /* -------------------------------------------- */

  /**
   * Draw a text tooltip for the token which can be used to display Elevation or a resource value
   * @returns {PreciseText}     The text object used to render the tooltip
   */
  #drawTooltip() {
    let text = this._getTooltipText();
    const style = this._getTextStyle();
    const tip = new PreciseText(text, style);
    tip.anchor.set(0.5, 1);
    tip.position.set(this.w / 2, -2);
    return tip;
  }

  /* -------------------------------------------- */

  /**
   * Return the text which should be displayed in a token's tooltip field
   * @returns {string}
   * @protected
   */
  _getTooltipText() {
    let el = this.document.elevation;
    if ( !Number.isFinite(el) || el === 0 ) return "";
    let units = canvas.scene.grid.units;
    return el > 0 ? `+${el} ${units}` : `${el} ${units}`;
  }

  /* -------------------------------------------- */

  /**
   * Get the text style that should be used for this Token's tooltip.
   * @returns {string}
   * @protected
   */
  _getTextStyle() {
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = 24;
    if (canvas.dimensions.size >= 200) style.fontSize = 28;
    else if (canvas.dimensions.size < 50) style.fontSize = 20;
    style.wordWrapWidth = this.w * 2.5;
    return style;
  }

  /* -------------------------------------------- */

  /**
   * Draw the active effects and overlay effect icons which are present upon the Token
   */
  async drawEffects() {
    const wasVisible = this.effects.visible;
    this.effects.visible = false;
    this.effects.removeChildren().forEach(c => c.destroy());
    this.effects.bg = this.effects.addChild(new PIXI.Graphics());
    this.effects.bg.visible = false;
    this.effects.overlay = null;

    // Categorize new effects
    const tokenEffects = this.document.effects;
    const actorEffects = this.actor?.temporaryEffects || [];
    let overlay = {
      src: this.document.overlayEffect,
      tint: null
    };

    // Draw status effects
    if ( tokenEffects.length || actorEffects.length ) {
      const promises = [];

      // Draw actor effects first
      for ( let f of actorEffects ) {
        if ( !f.icon ) continue;
        const tint = Color.from(f.tint ?? null);
        if ( f.getFlag("core", "overlay") ) {
          if ( overlay ) promises.push(this._drawEffect(overlay.src, overlay.tint));
          overlay = {src: f.icon, tint};
          continue;
        }
        promises.push(this._drawEffect(f.icon, tint));
      }

      // Next draw token effects
      for ( let f of tokenEffects ) promises.push(this._drawEffect(f, null));
      await Promise.all(promises);
    }

    // Draw overlay effect
    this.effects.overlay = await this._drawOverlay(overlay.src, overlay.tint);
    this.effects.bg.visible = true;
    this.effects.visible = wasVisible;
    this._refreshEffects();
  }

  /* -------------------------------------------- */

  /**
   * Draw a status effect icon
   * @param {string} src
   * @param {number|null} tint
   * @returns {Promise<PIXI.Sprite|undefined>}
   * @protected
   */
  async _drawEffect(src, tint) {
    if ( !src ) return;
    let tex = await loadTexture(src, {fallback: "icons/svg/hazard.svg"});
    let icon = new PIXI.Sprite(tex);
    if ( tint ) icon.tint = tint;
    return this.effects.addChild(icon);
  }

  /* -------------------------------------------- */

  /**
   * Draw the overlay effect icon
   * @param {string} src
   * @param {number|null} tint
   * @returns {Promise<PIXI.Sprite>}
   * @protected
   */
  async _drawOverlay(src, tint) {
    const icon = await this._drawEffect(src, tint);
    if ( icon ) icon.alpha = 0.8;
    return icon;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of status effects, adjusting their position for the token width and height.
   * @protected
   */
  _refreshEffects() {
    let i = 0;
    const w = Math.round(canvas.dimensions.size / 2 / 5) * 2;
    const rows = Math.floor(this.document.height * 5);
    const bg = this.effects.bg.clear().beginFill(0x000000, 0.40).lineStyle(1.0, 0x000000);
    for ( const effect of this.effects.children ) {
      if ( effect === bg ) continue;

      // Overlay effect
      if ( effect === this.effects.overlay ) {
        const size = Math.min(this.w * 0.6, this.h * 0.6);
        effect.width = effect.height = size;
        effect.position.set((this.w - size) / 2, (this.h - size) / 2);
      }

      // Status effect
      else {
        effect.width = effect.height = w;
        effect.x = Math.floor(i / rows) * w;
        effect.y = (i % rows) * w;
        bg.drawRoundedRect(effect.x + 1, effect.y + 1, w - 2, w - 2, 2);
        i++;
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Helper method to determine whether a token attribute is viewable under a certain mode
   * @param {number} mode   The mode from CONST.TOKEN_DISPLAY_MODES
   * @returns {boolean}      Is the attribute viewable?
   * @protected
   */
  _canViewMode(mode) {
    if ( mode === CONST.TOKEN_DISPLAY_MODES.NONE ) return false;
    else if ( mode === CONST.TOKEN_DISPLAY_MODES.ALWAYS ) return true;
    else if ( mode === CONST.TOKEN_DISPLAY_MODES.CONTROL ) return this.controlled;
    else if ( mode === CONST.TOKEN_DISPLAY_MODES.HOVER ) return this.hover || this.layer.highlightObjects;
    else if ( mode === CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER ) return this.isOwner
      && (this.hover || this.layer.highlightObjects);
    else if ( mode === CONST.TOKEN_DISPLAY_MODES.OWNER ) return this.isOwner;
    return false;
  }

  /* -------------------------------------------- */
  /*  Token Animation                             */
  /* -------------------------------------------- */

  /**
   * Animate changes to the appearance of the Token.
   * Animations are performed over differences between the TokenDocument and the current Token and TokenMesh appearance.
   * @param {object} updateData                     A record of the differential data which changed, for reference only
   * @param {CanvasAnimationOptions} [options]      Options which configure the animation behavior
   * @param {Function} [options.ontick]                 An optional function called each animation frame
   * @param {number} [options.movementSpeed]            A desired token movement speed in grid spaces per second
   * @param {TokenMeshDisplayAttributes} [options.a0]   The animation starting attributes if different from those cached.
   * @param {TokenMeshDisplayAttributes} [options.hoverInOut]   The placeable need hover/un-hover emulation.
   * @returns {Promise<void>}                       A promise which resolves once the animation is complete
   */
  async animate(updateData, {hoverInOut, name, duration, easing, movementSpeed=6, ontick, a0}={}) {

    // Start from current Mesh attributes
    a0 ??= this.mesh.getDisplayAttributes();

    // Prepare animation targets
    const d = this.document;
    const a1 = {
      x: d.x,
      y: d.y,
      width: d.width,
      height: d.height,
      alpha: d.alpha,
      rotation: d.rotation,
      scaleX: d.texture.scaleX,
      scaleY: d.texture.scaleY
    };

    // Special handling for rotation direction
    let dr = a1.rotation - a0.rotation;
    if ( dr ) {
      if ( dr > 180 ) a1.rotation -= 360;
      if ( dr < -180 ) a1.rotation += 360;
      dr = a1.rotation - a0.rotation;
    }

    // Prepare animation attributes
    const documentData = {texture: {}};
    const attributes = [];
    for ( const k of Object.keys(a1) ) {
      const parent = ["scaleX", "scaleY"].includes(k) ? documentData.texture : documentData;
      if ( a1[k] !== a0[k] ) attributes.push({attribute: k, from: a0[k], to: a1[k], parent});
    }

    // Special handling for texture tint
    let tint = Color.from(d.texture.tint || 0xFFFFFF);
    if ( !tint.equals(a0.tint) ) {
      attributes.push({attribute: "tint", from: a0.tint, to: tint, parent: documentData.texture});
    }

    // Configure animation
    if ( !attributes.length ) return this.renderFlags.set({refreshMesh: true});
    const emits = this.emitsLight;
    const isPerceptionChange = ["x", "y", "rotation"].some(k => k in updateData);
    const visionAnimation = game.settings.get("core", "visionAnimation") && isPerceptionChange;
    const config = {
      animatePerception: visionAnimation ? (this._isVisionSource() || emits) : false,
      sound: this.observer
    };

    // Configure animation duration aligning movement and rotation speeds
    if ( !duration ) {
      const durations = [];
      const dx = a1.x - a0.x;
      const dy = a1.y - a0.y;
      if ( dx || dy ) durations.push((Math.hypot(dx, dy) * 1000) / (canvas.dimensions.size * movementSpeed));
      if ( dr ) durations.push((Math.abs(dr) * 1000) / (movementSpeed * 60));
      if ( durations.length ) duration = Math.max(...durations);
    }

    // Release hover state if any
    if ( hoverInOut ) this.#forceReleaseHover();

    // Dispatch animation
    this._animation = CanvasAnimation.animate(attributes, {
      name: name || this.animationName,
      context: this,
      duration: duration,
      easing: easing,
      priority: PIXI.UPDATE_PRIORITY.OBJECTS + 1, // Before perception updates and Token render flags
      ontick: (dt, anim) => {
        this.#animateFrame(documentData, config);
        if ( ontick ) ontick(dt, anim, documentData, config);
      }
    });
    await this._animation;
    this._animation = null;

    // Render the completed animation
    config.animatePerception = true;
    this.#animateFrame(documentData, config);

    // Force hover state if mouse is over the token
    if ( hoverInOut ) this.#forceCheckHover();
  }

  /* -------------------------------------------- */

  /**
   * Handle a single frame of a token animation.
   * @param {object} documentData   The current animation frame
   * @param {object} config         The animation configuration
   * @param {boolean} [config.animatePerception]    Animate perception changes
   * @param {boolean} [config.sound]                Animate ambient sound changes
   */
  #animateFrame(documentData, {animatePerception, sound}={}) {

    // Update the document
    documentData = this.document.constructor.cleanData(documentData, {partial: true});
    foundry.utils.mergeObject(this.document, documentData, {insertKeys: false});

    // Refresh the Token and TokenMesh
    this.renderFlags.set({
      refreshSize: ("width" in documentData) || ("height" in documentData),
      refreshPosition: ("x" in documentData) || ("y" in documentData),
      refreshMesh: true
    });

    // Animate perception changes if necessary
    if ( !animatePerception && !sound ) return;

    const refreshOptions = {refreshSounds: sound}
    if ( animatePerception ) {
      this.updateSource({defer: true});
      refreshOptions.refreshLighting = refreshOptions.refreshVision = refreshOptions.refreshTiles = true;
    }
    canvas.perception.update(refreshOptions);
  }

  /* -------------------------------------------- */

  /**
   * Terminate animation of this particular Token.
   */
  stopAnimation() {
    return CanvasAnimation.terminateAnimation(this.animationName);
  }

  /* -------------------------------------------- */
  /*  Methods
  /* -------------------------------------------- */

  /**
   * Check for collision when attempting a move to a new position
   * @param {Point} destination           The central destination point of the attempted movement
   * @param {object} [options={}]         Additional options forwarded to WallsLayer#checkCollision
   * @returns {boolean|object[]|object}   The result of the WallsLayer#checkCollision test
   */
  checkCollision(destination, {origin, type="move", mode="any"}={}) {

    // The test origin is the last confirmed valid position of the Token
    const center = origin || this.getCenter(this.#validPosition.x, this.#validPosition.y);
    origin = this.getMovementAdjustedPoint(center);

    // The test destination is the adjusted point based on the proposed movement vector
    const dx = destination.x - center.x;
    const dy = destination.y - center.y;
    const offsetX = dx === 0 ? this.#priorMovement.ox : Math.sign(dx);
    const offsetY = dy === 0 ? this.#priorMovement.oy : Math.sign(dy);
    destination = this.getMovementAdjustedPoint(destination, {offsetX, offsetY});

    // Reference the correct source object
    let source;
    switch ( type ) {
      case "move":
        source = this.#getMovementSource(origin); break;
      case "sight":
        source = this.vision; break;
      case "light":
        source = this.light; break;
      case "sound":
        throw new Error("Collision testing for Token sound sources is not supported at this time");
    }

    // Create a movement source passed to the polygon backend
    return CONFIG.Canvas.polygonBackends[type].testCollision(origin, destination, {type, mode, source});
  }

  /* -------------------------------------------- */

  /**
   * Prepare a MovementSource for the document
   * @returns {MovementSource}
   */
  #getMovementSource(origin) {
    const movement = new MovementSource({object: this});
    movement.initialize({x: origin.x, y: origin.y, elevation: this.document.elevation});
    return movement;
  }

  /* -------------------------------------------- */

  /**
   * Get the center-point coordinate for a given grid position
   * @param {number} x    The grid x-coordinate that represents the top-left of the Token
   * @param {number} y    The grid y-coordinate that represents the top-left of the Token
   * @returns {Object}     The coordinate pair which represents the Token's center at position (x, y)
   */
  getCenter(x, y) {
    return {
      x: x + (this.w / 2),
      y: y + (this.h / 2)
    };
  }

  /* -------------------------------------------- */

  /**
   * Set this Token as an active target for the current game User.
   * Note: If the context is set with groupSelection:true, you need to manually broadcast the activity for other users.
   * @param {boolean} targeted                        Is the Token now targeted?
   * @param {object} [context={}]                     Additional context options
   * @param {User|null} [context.user=null]           Assign the token as a target for a specific User
   * @param {boolean} [context.releaseOthers=true]    Release other active targets for the same player?
   * @param {boolean} [context.groupSelection=false]  Is this target being set as part of a group selection workflow?
   */
  setTarget(targeted=true, {user=null, releaseOthers=true, groupSelection=false}={}) {

    // Do not allow setting a preview token as a target
    if ( this.isPreview ) return;

    // Release other targets
    user = user || game.user;
    if ( user.targets.size && releaseOthers ) {
      user.targets.forEach(t => {
        if ( t !== this ) t.setTarget(false, {user, releaseOthers: false, groupSelection});
      });
    }

    const wasTargeted = this.targeted.has(user);

    // Acquire target
    if ( targeted ) {
      this.targeted.add(user);
      user.targets.add(this);
    }

    // Release target
    else {
      this.targeted.delete(user);
      user.targets.delete(this);
    }

    if ( wasTargeted !== targeted ) {
      // Refresh Token display
      this.renderFlags.set({refreshTarget: true});

      // Refresh the Token HUD
      if ( this.hasActiveHUD ) this.layer.hud.render();
    }

    // Broadcast the target change
    if ( !groupSelection ) user.broadcastActivity({targets: user.targets.ids});
  }

  /* -------------------------------------------- */

  /**
   * Add or remove the currently controlled Tokens from the active combat encounter
   * @param {Combat} [combat]    A specific combat encounter to which this Token should be added
   * @returns {Promise<Token>} The Token which initiated the toggle
   */
  async toggleCombat(combat) {
    await this.layer.toggleCombat(!this.inCombat, combat, {token: this});
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Toggle an active effect by its texture path.
   * Copy the existing Array in order to ensure the update method detects the data as changed.
   *
   * @param {string|object} effect  The texture file-path of the effect icon to toggle on the Token.
   * @param {object} [options]      Additional optional arguments which configure how the effect is handled.
   * @param {boolean} [options.active]    Force a certain active state for the effect
   * @param {boolean} [options.overlay]   Whether to set the effect as the overlay effect?
   * @returns {Promise<boolean>}   Was the texture applied (true) or removed (false)
   */
  async toggleEffect(effect, {active, overlay=false}={}) {
    const fx = this.document.effects;
    const texture = effect.icon ?? effect;

    // Case 1 - handle an active effect object
    if ( effect.icon ) await this.document.toggleActiveEffect(effect, {active, overlay});

    // Case 2 - overlay effect
    else if ( overlay ) await this.#toggleOverlayEffect(texture, {active});

    // Case 3 - add or remove a standard effect icon
    else {
      const idx = fx.findIndex(e => e === texture);
      if ((idx !== -1) && (active !== true)) fx.splice(idx, 1);
      else if ((idx === -1) && (active !== false)) fx.push(texture);
      await this.document.update({effects: fx}, {
        diff: false,
        toggleEffect: CONFIG.statusEffects.find(e => e.icon === texture)?.id
      });
    }

    // Update the Token HUD
    if ( this.hasActiveHUD ) canvas.tokens.hud.refreshStatusIcons();
    return active;
  }

  /* -------------------------------------------- */

  /**
   * A helper function to toggle the overlay status icon on the Token
   * @param {string} texture
   * @param {object} options
   * @param {boolean} [options.active]
   * @returns {Promise<*>}
   */
  async #toggleOverlayEffect(texture, {active}) {

    // Assign the overlay effect
    active = active ?? this.document.overlayEffect !== texture;
    let effect = active ? texture : "";
    await this.document.update({overlayEffect: effect});

    // Set the defeated status in the combat tracker
    // TODO - deprecate this and require that active effects be used instead
    if ( (texture === CONFIG.controlIcons.defeated) && game.combat ) {
      const combatant = game.combat.getCombatantByToken(this.id);
      if ( combatant ) await combatant.update({defeated: active});
    }
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Toggle the visibility state of any Tokens in the currently selected set
   * @returns {Promise<TokenDocument[]>}     A Promise which resolves to the updated Token documents
   */
  async toggleVisibility() {
    let isHidden = this.document.hidden;
    const tokens = this.controlled ? canvas.tokens.controlled : [this];
    const updates = tokens.map(t => { return {_id: t.id, hidden: !isHidden};});
    return canvas.scene.updateEmbeddedDocuments("Token", updates);
  }

  /* -------------------------------------------- */

  /**
   * The external radius of the token in pixels.
   * @type {number}
   */
  get externalRadius() {
    return Math.max(this.w, this.h) / 2;
  }

  /* -------------------------------------------- */

  /**
   * A generic transformation to turn a certain number of grid units into a radius in canvas pixels.
   * This function adds additional padding to the light radius equal to the external radius of the token.
   * This causes light to be measured from the outer token edge, rather than from the center-point.
   * @param {number} units  The radius in grid units
   * @returns {number}      The radius in pixels
   */
  getLightRadius(units) {
    if ( units === 0 ) return 0;
    return ((Math.abs(units) * canvas.dimensions.distancePixels) + this.externalRadius) * Math.sign(units);
  }

  /* -------------------------------------------- */

  /** @override */
  _getShiftedPosition(dx, dy) {
    let {x, y, width, height} = this.document;
    const s = canvas.dimensions.size;

    // Identify the coordinate of the starting grid space
    let x0 = x;
    let y0 = y;
    if ( canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS ) {
      const c = this.center;
      x0 = width <= 1 ? c.x : x + (s / 2);
      y0 = height <= 1 ? c.y : y + ( s / 2);
    }

    // Shift the position and test collision
    const [x1, y1] = canvas.grid.grid.shiftPosition(x0, y0, dx, dy, {token: this});
    let collide = this.checkCollision(this.getCenter(x1, y1));
    return collide ? {x, y} : {x: x1, y: y1};
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    this.updateSource(); // Update vision and lighting sources
    if ( !game.user.isGM && this.isOwner && !this.document.hidden ) this.control({pan: true}); // Assume control
  }

  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data, options, userId) {
    super._onUpdate(data, options, userId);

    const animate = options.animate !== false;

    // Identify what has changed
    const keys = Object.keys(foundry.utils.flattenObject(data));
    const changed = new Set(keys);
    const displayBarsChange = ("displayBars" in data);
    const barChanges = ("bar1" in data) || ("bar2" in data);
    const dispositionChange = changed.has("disposition");
    const positionChange = ["x", "y"].some(c => changed.has(c));
    const rotationChange = changed.has("rotation");
    const lockRotationChange = changed.has("lockRotation");
    const shapeChange = ["width", "height"].some(k => changed.has(k));
    const visibilityChange = changed.has("hidden");
    const elevationChange = changed.has("elevation");
    const perspectiveChange = visibilityChange || positionChange || elevationChange || shapeChange
      || (rotationChange && this.hasLimitedSourceAngle);
    const visionChange = ("sight" in data) || (this.hasSight && perspectiveChange) || ("detectionModes" in data);
    const lightChange = ("light" in data) || (this.emitsLight && perspectiveChange);

    // Record movement
    if ( positionChange || rotationChange || shapeChange ) {
      this.#recordPosition(positionChange, rotationChange, shapeChange);
    }

    // Handle special case for effect(s) toggled for actorless token
    const statusId = options.toggleEffect;
    if ( !this.actor && changed.has("effects") && Object.values(CONFIG.specialStatusEffects).includes(statusId) ) {
      this._onApplyStatusEffect(statusId, this.document.hasStatusEffect(statusId));
    }

    // Full re-draw
    if ( ["texture.src", "actorId", "actorLink"].some(r => changed.has(r)) ) {
      this.renderFlags.set({redraw: true});
    }

    // Incremental refresh
    const refreshMeshRequired = (visibilityChange || rotationChange || lockRotationChange
      || ("texture" in data) || ("alpha" in data));
    this.renderFlags.set({
      refreshVisibility: visibilityChange && (!animate || data.hidden === false),
      refreshPosition: positionChange && !animate,  // Triggers refreshMesh
      refreshSize: shapeChange && !animate,         // Triggers refreshMesh
      refreshMesh: refreshMeshRequired && !animate,
      refreshElevation: elevationChange,
      refreshBars: barChanges,
      refreshNameplate: ["name", "appendNumber", "prependAdjective", "displayName"].some(k => changed.has(k)) || dispositionChange,
      refreshState: displayBarsChange || shapeChange || dispositionChange,
      refreshTarget: dispositionChange,
      redrawEffects: ["effects", "overlayEffect"].some(k => changed.has(k))
    });

    // Perception updates
    if ( visionChange || lightChange ) this.updateSource({defer: true});
    canvas.perception.update({
      initializeVision: visionChange,
      refreshVision: lightChange || elevationChange,
      refreshLighting: lightChange,
      refreshTiles: perspectiveChange,
      refreshSounds: perspectiveChange
    });

    // Animate changes
    if ( animate && (refreshMeshRequired || positionChange || shapeChange) ) {
      const animationConfig = (options.animation ||= {});
      animationConfig.hoverInOut = positionChange || shapeChange;
      this.animate(data, animationConfig);
    }

    // Acquire or release Token control
    if ( visibilityChange ) {
      if ( this.controlled && data.hidden && !game.user.isGM ) this.release();
      else if ( (data.hidden === false) && !canvas.tokens.controlled.length ) this.control({pan: true});
    }

    // Automatically pan the canvas
    if ( positionChange && this.controlled && (options.pan !== false) ) this.#panCanvas();

    // Update the Token HUD
    if ( this.hasActiveHUD && (positionChange || shapeChange) ) {
      if ( positionChange || shapeChange ) this.layer.hud.render();
    }

    // Process Combat Tracker changes
    if ( this.inCombat ) {
      if ( changed.has("name") ) game.combat.debounceSetup();
      else if ( ["effects", "name", "overlayEffect"].some(k => changed.has(k)) ) ui.combat.render();
    }
  }

  /* -------------------------------------------- */

  /**
   * When Token position or rotation changes, record the movement vector.
   * Update cached values for both #validPosition and #priorMovement.
   * @param {boolean} positionChange    Did the x/y position change?
   * @param {boolean} rotationChange    Did rotation change?
   * @param {boolean} shapeChange       Did the width or height change?
   */
  #recordPosition(positionChange, rotationChange, shapeChange) {

    // Update rotation
    const position = {};
    if ( rotationChange ) {
      position.rotation = this.document.rotation;
    }

    // Update movement vector
    if ( positionChange ) {
      const origin = this._animation ? this.position : this.#validPosition;
      position.x = this.document.x;
      position.y = this.document.y;
      const ray = new Ray(origin, position);

      // Offset movement relative to prior vector
      const prior = this.#priorMovement;
      const ox = ray.dx === 0 ? prior.ox : Math.sign(ray.dx);
      const oy = ray.dy === 0 ? prior.oy : Math.sign(ray.dy);
      this.#priorMovement = {dx: ray.dx, dy: ray.dy, ox, oy};
    }

    // Update valid position
    foundry.utils.mergeObject(this.#validPosition, position);
  }

  /* -------------------------------------------- */

  /**
   * Automatically pan the canvas when a controlled Token moves offscreen.
   */
  #panCanvas() {

    // Target center point in screen coordinates
    const c = this.center;
    const {x: sx, y: sy} = canvas.stage.transform.worldTransform.apply(c);

    // Screen rectangle minus padding space
    const pad = 50;
    const sidebarPad = $("#sidebar").width() + pad;
    const rect = new PIXI.Rectangle(pad, pad, window.innerWidth - sidebarPad, window.innerHeight - pad);

    // Pan the canvas if the target center-point falls outside the screen rect
    if ( !rect.contains(sx, sy) ) canvas.animatePan(this.center);
  }

  /* -------------------------------------------- */

  /** @override */
  _onDelete(options, userId) {
    // Remove target (if applicable)
    game.user.targets.delete(this);

    // Process changes to perception
    const sourceId = this.sourceId;
    if ( canvas.effects.lightSources.has(sourceId) ) this.updateLightSource({deleted: true});
    if ( canvas.effects.visionSources.has(sourceId) ) this.updateVisionSource({deleted: true});

    // Remove Combatants
    if (userId === game.user.id) {
      game.combats._onDeleteToken(this.scene.id, this.id);
    }

    // Parent class deletion handlers
    return super._onDelete(options, userId);
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to Token behavior when a significant status effect is applied
   * @param {string} statusId       The status effect ID being applied, from CONFIG.specialStatusEffects
   * @param {boolean} active        Is the special status effect now active?
   * @internal
   */
  _onApplyStatusEffect(statusId, active) {
    switch ( statusId ) {
      case CONFIG.specialStatusEffects.INVISIBLE:
        canvas.perception.update({refreshVision: true});
        this.renderFlags.set({refreshMesh: true, refreshShader: true});
        break;
      case CONFIG.specialStatusEffects.BLIND:
        canvas.perception.update({initializeVision: true});
        break;
    }
    Hooks.callAll("applyTokenStatusEffect", this, statusId, active);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onControl({releaseOthers=true, pan=false, ...options}={}) {
    super._onControl(options);
    _token = this; // Debugging global window variable
    this.document.sort += 1;
    if ( this.mesh ) this.mesh.initialize({sort: this.document.sort});
    canvas.perception.update({
      initializeVision: true,
      refreshLighting: true,
      refreshSounds: true,
      refreshTiles: true
    });

    // Pan to the controlled Token
    if ( pan ) canvas.animatePan(this.center);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onRelease(options) {
    super._onRelease(options);
    this.document.sort -= 1;
    if ( this.mesh ) this.mesh.initialize({sort: this.document.sort});
    canvas.perception.update({
      initializeVision: true,
      refreshLighting: true,
      refreshSounds: true,
      refreshTiles: true
    });
  }

  /* -------------------------------------------- */

  /**
   * Force the release of the hover state for this token.
   * - On the layer if necessary
   * - Initialize the interaction manager state to NONE
   * - Call the hover hook
   */
  #forceReleaseHover() {
    if ( !this.hover ) return;

    // Emulate an onHoverOut event and set manually the interaction manager
    this._onHoverOut(new PIXI.FederatedEvent("pointerout"));
    this.mouseInteractionManager.state = MouseInteractionManager.INTERACTION_STATES.NONE;
  }

  /* -------------------------------------------- */

  /**
   * Check the position of the mouse and assign hover to the token if the mouse is inside the bounds.
   */
  #forceCheckHover() {
    if ( this.hover ) return;

    // Get mouse position and check the token bounds
    const mousePos = canvas.mousePosition;
    if ( !this.bounds.contains(mousePos.x, mousePos.y) ) return;

    // If inside the bounds, emulate an onHoverIn event and set manually the interaction manager
    this._onHoverIn(new PIXI.FederatedEvent("pointerover"), {hoverOutOthers: true});
    this.mouseInteractionManager.state = MouseInteractionManager.INTERACTION_STATES.HOVER;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  _canControl(user, event) {
    if ( !this.layer.active || this.isPreview ) return false;
    if ( canvas.controls.ruler.active ) return false;
    const tool = game.activeTool;
    if ( (tool === "target") && !this.isPreview ) return true;
    return super._canControl(user, event);
  }

  /* -------------------------------------------- */

  /** @override */
  _canHUD(user, event) {
    if ( canvas.controls.ruler.active ) return false;
    return user.isGM || (this.actor?.testUserPermission(user, "OWNER") ?? false);
  }

  /* -------------------------------------------- */

  /** @override */
  _canConfigure(user, event) {
    return !this.isPreview;
  }

  /* -------------------------------------------- */

  /** @override */
  _canHover(user, event) {
    return !this.isPreview;
  }

  /* -------------------------------------------- */

  /** @override */
  _canView(user, event) {
    if ( !this.actor ) ui.notifications.warn("TOKEN.WarningNoActor", {localize: true});
    return this.actor?.testUserPermission(user, "LIMITED");
  }

  /* -------------------------------------------- */

  /** @override */
  _canDrag(user, event) {
    if ( !this.controlled || this._animation ) return false;
    if ( !this.layer.active || (game.activeTool !== "select") ) return false;
    if ( CONFIG.Canvas.rulerClass.canMeasure ) return false;
    return game.user.isGM || !game.paused;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onHoverIn(event, options) {
    const combatant = this.combatant;
    if ( combatant ) ui.combat.hoverCombatant(combatant, true);
    return super._onHoverIn(event, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onHoverOut(event) {
    const combatant = this.combatant;
    if ( combatant ) ui.combat.hoverCombatant(combatant, false);
    return super._onHoverOut(event);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClickLeft(event) {
    const tool = game.activeTool;
    if ( tool === "target" ) {
      event.stopPropagation();
      return this.setTarget(!this.isTargeted, {releaseOthers: !event.shiftKey});
    }
    super._onClickLeft(event);
  }

  /** @override */
  _propagateLeftClick(event) {
    return CONFIG.Canvas.rulerClass.canMeasure;
  }

  /* -------------------------------------------- */

  /** @override */
  _onClickLeft2(event) {
    if ( !this._propagateLeftClick(event) ) event.stopPropagation();
    const sheet = this.actor?.sheet;
    if ( sheet?.rendered ) {
      sheet.maximize();
      sheet.bringToTop();
    }
    else sheet?.render(true, {token: this.document});
  }

  /* -------------------------------------------- */

  /** @override */
  _onClickRight2(event) {
    if ( !this._propagateRightClick(event) ) event.stopPropagation();
    if ( this.isOwner && game.user.can("TOKEN_CONFIGURE") ) return super._onClickRight2(event);
    return this.setTarget(!this.targeted.has(game.user), {releaseOthers: !event.shiftKey});
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftDrop(event) {
    const clones = event.interactionData.clones || [];
    const destination = event.interactionData.destination;

    // Ensure the cursor destination is within bounds
    if ( !canvas.dimensions.rect.contains(destination.x, destination.y) ) return false;

    event.interactionData.clearPreviewContainer = false;

    // Compute the final dropped positions
    const updates = clones.reduce((updates, c) => {

      // Get the snapped top-left coordinate
      let dest = {x: c.document.x, y: c.document.y};
      if ( !event.shiftKey && (canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS) ) {
        const isTiny = (c.document.width < 1) && (c.document.height < 1);
        const interval = canvas.grid.isHex ? 1 : isTiny ? 2 : 1;
        dest = canvas.grid.getSnappedPosition(dest.x, dest.y, interval, {token: c});
      }

      // Test collision for each moved token vs the central point of its destination space
      const target = c.getCenter(dest.x, dest.y);
      if ( !game.user.isGM ) {
        let collides = c._original.checkCollision(target);
        if ( collides ) {
          ui.notifications.error("RULER.MovementCollision", {localize: true, console: false});
          return updates;
        }
      }

      // Otherwise, ensure the final token center is in-bounds
      else if ( !canvas.dimensions.rect.contains(target.x, target.y) ) return updates;

      // Perform updates where no collision occurs
      updates.push({_id: c._original.id, x: dest.x, y: dest.y});
      return updates;
    }, []);

    // Submit the data update
    try {
      return canvas.scene.updateEmbeddedDocuments("Token", updates);
    } finally {
      this.layer.clearPreviewContainer();
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftMove(event) {
    const {clones, destination, origin} = event.interactionData;
    const preview = game.settings.get("core", "tokenDragPreview");

    // Pan the canvas if the drag event approaches the edge
    canvas._onDragCanvasPan(event);

    // Determine dragged distance
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;

    // Update the position of each clone
    for ( let c of clones || [] ) {
      const o = c._original;
      const x = o.document.x + dx;
      const y = o.document.y + dy;
      if ( preview && !game.user.isGM ) {
        const collision = o.checkCollision(o.getCenter(x, y));
        if ( collision ) continue;
      }
      c.document.x = x;
      c.document.y = y;
      c.refresh();
      if ( preview ) c.updateSource({defer: true});
    }

    // Update perception immediately
    if ( preview ) canvas.perception.update({refreshLighting: true, refreshVision: true});
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragEnd() {
    this.updateSource({deleted: true});
    this._original?.updateSource();
    super._onDragEnd();
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  get hasLimitedVisionAngle() {
    const msg = "Token#hasLimitedVisionAngle has been renamed to Token#hasLimitedSourceAngle";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return this.hasLimitedSourceAngle;
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  getSightOrigin() {
    const msg = "Token#getSightOrigin has been deprecated in favor of Token#getMovementAdjustedPoint";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return this.getMovementAdjustedPoint(this.center);
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  get icon() {
    foundry.utils.logCompatibilityWarning("Token#icon has been renamed to Token#mesh.", {since: 10, until: 12});
    return this.mesh;
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  async setPosition(x, y, {animate=true, movementSpeed, recenter=true}={}) {
    throw new Error("The Token#setPosition method is deprecated in favor of a standard TokenDocument#update");
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  async animateMovement(ray, {movementSpeed=6}={}) {
    throw new Error("The Token#animateMovement method is deprecated in favor Token#animate");
  }

  /**
   * @deprecated since v11
   * @ignore
   */
  updatePosition() {
    const msg = "Token#updatePosition has been deprecated without replacement as it is no longer required.";
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
  }

  /**
   * @deprecated since 11
   * @ignore
   */
  refreshHUD({bars=true, border=true, effects=true, elevation=true, nameplate=true}={}) {
    const msg = "Token#refreshHUD is deprecated in favor of token.renderFlags.set()";
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
    this.renderFlags.set({
      refreshBars: bars,
      refreshBorder: border,
      refreshElevation: elevation,
      refreshNameplate: nameplate,
      redrawEffects: effects
    });
  }

  /**
   * @deprecated since 11
   * @ignore
   */
  getDisplayAttributes() {
    const msg = "Token#getDisplayAttributes is deprecated in favor of TokenMesh#getDisplayAttributes";
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
    return this.mesh.getDisplayAttributes();
  }
}

/**
 * A "secret" global to help debug attributes of the currently controlled Token.
 * This is only for debugging, and may be removed in the future, so it's not safe to use.
 * @type {Token}
 * @ignore
 */
let _token = null;
