/**
 * The primary Canvas group which generally contains tangible physical objects which exist within the Scene.
 * This group is a {@link CachedContainer} which is rendered to the Scene as a {@link SpriteMesh}.
 * This allows the rendered result of the Primary Canvas Group to be affected by a {@link BaseSamplerShader}.
 * @extends {BaseCanvasMixin(CachedContainer)}
 * @category - Canvas
 */
class PrimaryCanvasGroup extends BaseCanvasMixin(CachedContainer) {
  constructor(sprite) {
    sprite ||= new SpriteMesh(undefined, BaseSamplerShader);
    super(sprite);
    this.eventMode = "none";
    this.tokensRenderTexture =
      this.createRenderTexture({renderFunction: this._renderTokens.bind(this), clearColor: [0, 0, 0, 0]});
  }

  /* -------------------------------------------- */

  /** @override */
  static groupName = "primary";

  /** @override */
  clearColor = [0, 0, 0, 0];

  /**
   * Track the set of HTMLVideoElements which are currently playing as part of this group.
   * @type {Set<SpriteMesh>}
   */
  videoMeshes = new Set();

  /**
   * Allow API users to override the default elevation of the background layer.
   * This is a temporary solution until more formal support for scene levels is added in a future release.
   * @type {number}
   */
  static BACKGROUND_ELEVATION = 0;

  /* -------------------------------------------- */
  /*  Group Attributes                            */
  /* -------------------------------------------- */

  /**
   * The primary background image configured for the Scene, rendered as a SpriteMesh.
   * @type {SpriteMesh}
   */
  background;

  /**
   * The primary foreground image configured for the Scene, rendered as a SpriteMesh.
   * @type {SpriteMesh}
   */
  foreground;

  /**
   * A Quadtree which partitions and organizes primary canvas objects.
   * @type {CanvasQuadtree}
   */
  quadtree = new CanvasQuadtree();

  /**
   * The collection of PrimaryDrawingContainer objects which are rendered in the Scene.
   * @type {Collection<string, PrimaryDrawingContainer>}
   */
  drawings = new foundry.utils.Collection();

  /**
   * The collection of SpriteMesh objects which are rendered in the Scene.
   * @type {Collection<string, TokenMesh>}
   */
  tokens = new foundry.utils.Collection();

  /**
   * The collection of SpriteMesh objects which are rendered in the Scene.
   * @type {Collection<string, TileMesh|TileSprite>}
   */
  tiles = new foundry.utils.Collection();

  /**
   * Track the current elevation range which is present in the Scene.
   * @type {{min: number, max: number}}
   * @private
   */
  #elevation = {min: 0, max: 1};

  /* -------------------------------------------- */
  /*  Custom Rendering                            */
  /* -------------------------------------------- */

  /**
   * Render all tokens in their own render texture.
   * @param {PIXI.Renderer} renderer    The renderer to use.
   * @private
   */
  _renderTokens(renderer) {
    for ( const tokenMesh of this.tokens ) {
      tokenMesh.render(renderer);
    }
  }

  /* -------------------------------------------- */
  /*  Group Properties                            */
  /* -------------------------------------------- */

  /**
   * Return the base HTML image or video element which provides the background texture.
   * @type {HTMLImageElement|HTMLVideoElement}
   */
  get backgroundSource() {
    if ( !this.background.texture.valid || this.background.texture === PIXI.Texture.WHITE ) return null;
    return this.background.texture.baseTexture.resource.source;
  }

  /* -------------------------------------------- */

  /**
   * Return the base HTML image or video element which provides the foreground texture.
   * @type {HTMLImageElement|HTMLVideoElement}
   */
  get foregroundSource() {
    if ( !this.foreground.texture.valid ) return null;
    return this.foreground.texture.baseTexture.resource.source;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * Refresh the primary mesh.
   */
  refreshPrimarySpriteMesh() {
    const singleSource = canvas.effects.visibility.visionModeData.source;
    const vmOptions = singleSource?.visionMode.canvas;
    const isBaseSampler = (this.sprite.shader.constructor === BaseSamplerShader);

    if ( !vmOptions && isBaseSampler ) return;

    // Update the primary sprite shader class (or reset to BaseSamplerShader)
    this.sprite.setShaderClass(vmOptions?.shader ?? BaseSamplerShader);
    this.sprite.shader.uniforms.sampler = this.renderTexture;

    // Need to update uniforms?
    if ( !vmOptions?.uniforms ) return;

    vmOptions.uniforms.linkedToDarknessLevel = singleSource?.visionMode.vision.darkness.adaptive;
    vmOptions.uniforms.darknessLevel = canvas.colorManager.darknessLevel;

    // Assigning color from source if any
    vmOptions.uniforms.tint = singleSource?.colorRGB ?? this.sprite.shader.constructor.defaultUniforms.tint;

    // Updating uniforms in the primary sprite shader
    for ( const [uniform, value] of Object.entries(vmOptions?.uniforms ?? {}) ) {
      if ( uniform in this.sprite.shader.uniforms ) this.sprite.shader.uniforms[uniform] = value;
    }
  }

  /* -------------------------------------------- */

  /**
   * Draw the canvas group and all its component layers.
   * @returns {Promise<void>}
   */
  async draw() {
    this.clearColor = [...canvas.colors.sceneBackground.rgb, 1];
    this.quadtree.clear();
    this.#drawBackground();
    this.#drawForeground();
    await super.draw();
  }

  /* -------------------------------------------- */

  /**
   * Draw the Scene background image.
   */
  #drawBackground() {
    const bg = this.background = this.addChild(new SpriteMesh());
    bg.elevation = this.constructor.BACKGROUND_ELEVATION;
    bg.sort = -9999999999;
    const tex = canvas.sceneTextures.background ?? getTexture(canvas.scene.background.src);
    this.#drawSceneMesh(this.background, tex);
  }

  /* -------------------------------------------- */

  /**
   * Draw the Scene foreground image.
   */
  #drawForeground() {
    const fg = this.foreground = this.addChild(new SpriteMesh());
    fg.visible = false;
    const tex = canvas.sceneTextures.foreground ?? getTexture(canvas.scene.foreground);
    if ( !tex ) return;

    // Configure visibility and ordering
    fg.visible = true;
    fg.elevation = canvas.scene.foregroundElevation;
    fg.sort = -9999999999;

    // Compare dimensions with background texture and draw the mesh
    const bg = this.background.texture;
    if ( tex && bg && ((tex.width !== bg.width) || (tex.height !== bg.height)) ) {
      ui.notifications.warn("WARNING.ForegroundDimensionsMismatch", {localize: true});
    }
    this.#drawSceneMesh(fg, tex);
  }

  /* -------------------------------------------- */

  /**
   * Draw a SpriteMesh texture that fills the entire Scene rectangle.
   * @param {SpriteMesh} mesh               The target SpriteMesh
   * @param {PIXI.Texture|null} texture     The loaded Texture or null
   */
  #drawSceneMesh(mesh, texture) {
    // No background texture? In this case a PIXI.Texture.WHITE is assigned with alpha 0.025
    mesh.alpha = texture ? 1 : 0.025;
    texture ??= PIXI.Texture.WHITE;

    // Assign the texture and configure dimensions
    const d = canvas.dimensions;
    mesh.texture = texture;
    mesh.position.set(d.sceneX, d.sceneY);
    mesh.width = d.sceneWidth;
    mesh.height = d.sceneHeight;

    // Manage video playback
    const video = game.video.getVideoSource(mesh);
    if ( video ) {
      this.videoMeshes.add(mesh);
      game.video.play(video, {volume: game.settings.get("core", "globalAmbientVolume")});
    }
  }

  /* -------------------------------------------- */
  /*  Tear-Down                                   */
  /* -------------------------------------------- */

  /**
   * Remove and destroy all children from the group.
   * Clear container references to rendered objects.
   * @returns {Promise<void>}
   */
  async tearDown() {

    // Stop video playback
    for ( const mesh of this.videoMeshes ) {
      game.video.stop(mesh.sourceElement);
      mesh.texture.baseTexture.destroy();
    }

    await super.tearDown();

    // Clear collections
    this.videoMeshes.clear();
    this.tokens.clear();
    this.tiles.clear();
  }

  /* -------------------------------------------- */
  /*  Token Management                            */
  /* -------------------------------------------- */

  /**
   * Draw the SpriteMesh for a specific Token object.
   * @param {Token} token     The Token being added
   * @returns {TokenMesh}     The added TokenMesh
   */
  addToken(token) {
    let mesh = this.tokens.get(token.objectId);
    if ( !mesh ) mesh = this.addChild(new TokenMesh(token));
    else mesh.object = token;
    mesh.anchor.set(0.5, 0.5);
    mesh.texture = token.texture ?? PIXI.Texture.EMPTY;
    this.tokens.set(token.objectId, mesh);
    if ( mesh.isVideo ) this.videoMeshes.add(mesh);
    return mesh;
  }

  /* -------------------------------------------- */

  /**
   * Remove a TokenMesh from the group.
   * @param {Token} token     The Token being removed
   */
  removeToken(token) {
    const mesh = this.tokens.get(token.objectId);
    if ( mesh ) {
      this.removeChild(mesh);
      this.tokens.delete(token.objectId);
      this.videoMeshes.delete(mesh);
      if ( !mesh._destroyed ) mesh.destroy({children: true});
    }
  }

  /* -------------------------------------------- */
  /*  Tile Management                             */
  /* -------------------------------------------- */

  /**
   * Draw the SpriteMesh for a specific Token object.
   * @param {Tile} tile               The Tile being added
   * @returns {TileMesh|TileSprite}   The added TileMesh or TileSprite
   */
  addTile(tile) {
    let mesh = this.tiles.get(tile.objectId);
    mesh?.destroy();
    const cls = tile.document.getFlag("core", "isTilingSprite") ? TileSprite : TileMesh;
    mesh = this.addChild(new cls(tile));
    mesh.texture = tile.texture ?? PIXI.Texture.EMPTY;
    mesh.anchor.set(0.5, 0.5);
    this.tiles.set(tile.objectId, mesh);
    if ( mesh.isVideo ) this.videoMeshes.add(mesh);
    return mesh;
  }

  /* -------------------------------------------- */

  /**
   * Remove a TokenMesh from the group.
   * @param {Tile} tile     The Tile being removed
   */
  removeTile(tile) {
    const mesh = this.tiles.get(tile.objectId);
    if ( mesh ) {
      this.removeChild(mesh);
      this.tiles.delete(tile.objectId);
      this.videoMeshes.delete(mesh);
      if ( !mesh._destroyed ) mesh.destroy({children: true});
    }
  }

  /* -------------------------------------------- */
  /*  Drawing Management                          */
  /* -------------------------------------------- */

  /**
   * Add a DrawingShape to the group.
   * @param {Drawing} drawing     The Drawing being added
   * @returns {DrawingShape}      The created DrawingShape instance
   */
  addDrawing(drawing) {
    let shape = this.drawings.get(drawing.objectId);
    if ( !shape ) shape = this.addChild(new DrawingShape(drawing));
    else shape.object = drawing;
    shape.texture = drawing.texture ?? null;
    this.drawings.set(drawing.objectId, shape);
    return shape;
  }

  /* -------------------------------------------- */

  /**
   * Remove a DrawingShape from the group.
   * @param {Drawing} drawing     The Drawing being removed
   */
  removeDrawing(drawing) {
    const shape = this.drawings.get(drawing.objectId);
    if ( shape ) {
      this.removeChild(shape);
      this.drawings.delete(drawing.objectId);
      if ( !shape._destroyed ) shape.destroy({children: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Map an elevation value to a depth value with the right precision.
   * @param {number} elevation      A current elevation (or zIndex) in distance units.
   * @returns {number}              The depth value for this elevation on the range [1/255, 1]
   */
  mapElevationToDepth(elevation) {
    const {min, max} = this.#elevation;
    if ( elevation < min ) return 1 / 255;
    if ( elevation > max ) return 1;
    const pct = (elevation - min) / (max - min) || 0;
    const depth = (Math.round(pct * 252) + 2) / 255;
    return depth;
  }

  /* -------------------------------------------- */

  /**
   * Override the default PIXI.Container behavior for how objects in this container are sorted.
   * @override
   */
  sortChildren() {
    this.#elevation.min = Infinity;
    this.#elevation.max = -Infinity;

    // Test objects that should render their depth
    let minElevation = 0;
    let maxElevation = 1;
    for ( let i=0; i<this.children.length; i++ ) {
      const child = this.children[i];
      child._lastSortedIndex = i;
      const elevation = child.elevation || 0;

      // We do not take into account an infinite value
      if ( elevation === Infinity ) continue;

      // Save min and max elevation of all placeable with finite values
      minElevation = Math.min(minElevation, elevation);
      maxElevation = Math.max(maxElevation, elevation);

      // If the children is not rendering its depth, do not count it
      if ( !child.shouldRenderDepth ) continue;

      // Assign elevation to min/max
      if ( elevation < this.#elevation.min ) this.#elevation.min = elevation;
      if ( elevation > this.#elevation.max ) this.#elevation.max = elevation;
    }

    // Handle Infinity/-Infinity special case for min/max
    // If the above computation does not lead to finite values, we're using the finite "bounds" for min/max
    if ( !Number.isFinite(this.#elevation.min) ) this.#elevation.min = minElevation;
    if ( !Number.isFinite(this.#elevation.max) ) this.#elevation.max = maxElevation;

    this.children.sort(PrimaryCanvasGroup._sortObjects);
    this.sortDirty = false;
  }

  /* -------------------------------------------- */

  /**
   * The sorting function used to order objects inside the Primary Canvas Group.
   * Overrides the default sorting function defined for the PIXI.Container.
   * Sort TokenMesh above other objects except WeatherEffects, then DrawingShape, all else held equal.
   * @param {PrimaryCanvasObject|PIXI.DisplayObject} a     An object to display
   * @param {PrimaryCanvasObject|PIXI.DisplayObject} b     Some other object to display
   * @returns {number}
   * @private
   */
  static _sortObjects(a, b) {
    return ((a.elevation || 0) - (b.elevation || 0))
      || (a.constructor.PRIMARY_SORT_ORDER || 0) - (b.constructor.PRIMARY_SORT_ORDER || 0)
      || ((a.sort || 0) - (b.sort || 0))
      || (a._lastSortedIndex || 0) - (b._lastSortedIndex || 0);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  mapElevationAlpha(elevation) {
    const msg = "PrimaryCanvasGroup#mapElevationAlpha is deprecated in favor of PrimaryCanvasGroup#mapElevationToDepth";
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
    return this.mapElevationToDepth(elevation);
  }
}
