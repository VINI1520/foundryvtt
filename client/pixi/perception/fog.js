/**
 * A fog of war management class which is the singleton canvas.fog instance.
 * @category - Canvas
 */
class FogManager {

  /**
   * The FogExploration document which applies to this canvas view
   * @type {FogExploration|null}
   */
  exploration = null;

  /**
   * A status flag for whether the layer initialization workflow has succeeded
   * @type {boolean}
   * @private
   */
  #initialized = false;

  /**
   * Track whether we have pending fog updates which have not yet been saved to the database
   * @type {boolean}
   * @private
   */
  #updated = false;

  /**
   * A pool of RenderTexture objects which can be cycled through to save fog exploration progress.
   * @type {PIXI.RenderTexture[]}
   * @private
   */
  #textures = [];

  /**
   * The maximum allowable fog of war texture size.
   * @type {number}
   */
  static #MAXIMUM_FOW_TEXTURE_SIZE = 4096;

  /**
   * Define the number of positions that are explored before a set of fog updates are pushed to the server.
   * @type {number}
   */
  static COMMIT_THRESHOLD = 10;

  /**
   * A debounced function to save fog of war exploration once a continuous stream of updates has concluded.
   * @type {Function}
   */
  #debouncedSave = foundry.utils.debounce(this.save.bind(this), 3000);

  /* -------------------------------------------- */
  /*  Fog Manager Properties                      */
  /* -------------------------------------------- */

  /**
   * Vision containers for explored positions which have not yet been committed to the saved texture.
   * @type {PIXI.Container}
   */
  get pending() {
    return this.#pending;
  }

  /** @private */
  #pending = new PIXI.Container();

  /* -------------------------------------------- */

  /**
   * The container of previously revealed exploration.
   * @type {PIXI.Container}
   */
  get revealed() {
    return this.#revealed;
  }

  /** @private */
  #revealed = new PIXI.Container();

  /* -------------------------------------------- */

  /**
   * A sprite containing the saved fog exploration texture.
   * @type {PIXI.Sprite}
   */
  get sprite() {
    return this.#sprite;
  }

  /** @private */
  #sprite = new SpriteMesh(PIXI.Texture.EMPTY, FogSamplerShader);

  /* -------------------------------------------- */

  /**
   * The configured resolution used for the saved fog-of-war texture
   * @type {FogResolution}
   */
  get resolution() {
    return this.#resolution;
  }

  /** @private */
  #resolution;

  /* -------------------------------------------- */

  /**
   * Does the currently viewed Scene support Token field of vision?
   * @type {boolean}
   */
  get tokenVision() {
    return canvas.scene.tokenVision;
  }

  /* -------------------------------------------- */

  /**
   * Does the currently viewed Scene support fog of war exploration?
   * @type {boolean}
   */
  get fogExploration() {
    return canvas.scene.fogExploration;
  }

  /* -------------------------------------------- */
  /*  Fog of War Management                       */
  /* -------------------------------------------- */

  /**
   * Initialize fog of war - resetting it when switching scenes or re-drawing the canvas
   * @returns {Promise<void>}
   */
  async initialize() {
    this.#initialized = false;
    this.configureResolution();
    if ( this.tokenVision && !this.exploration ) await this.load();
    this.#initialized = true;
  }

  /* -------------------------------------------- */

  /**
   * Clear the fog and reinitialize properties (commit and save in non reset mode)
   * @returns {Promise<void>}
   */
  async clear() {

    // Save any pending exploration
    const wasDeleted = !game.scenes.has(canvas.scene?.id);
    if ( !wasDeleted ) {
      this.commit();
      if ( this.#updated ) await this.save();
    }

    // Deactivate current fog exploration
    this.#initialized = false;
    this.#deactivate();
  }

  /* -------------------------------------------- */

  /**
   * Once a new Fog of War location is explored, composite the explored container with the current staging sprite
   * Save that staging Sprite as the rendered fog exploration and swap it out for a fresh staging texture
   * Do all this asynchronously, so it doesn't block token movement animation since this takes some extra time
   */
  commit() {
    if ( !this.#pending.children.length ) return;
    if ( CONFIG.debug.fog ) console.debug("SightLayer | Committing fog exploration to render texture.");

    // Create a staging texture and render the entire fog container to it
    const dims = canvas.dimensions;
    const tex = this.#getTexture();
    const transform = new PIXI.Matrix(1, 0, 0, 1, -dims.sceneX, -dims.sceneY);

    // Render the currently revealed vision to the texture
    canvas.app.renderer.render(this.#revealed, tex, undefined, transform);

    // Return reusable RenderTexture to the pool, destroy past exploration textures
    if ( this.#sprite.texture instanceof PIXI.RenderTexture ) this.#textures.push(this.#sprite.texture);
    else this.#sprite.texture?.destroy(true);
    this.#sprite.texture = tex;

    // Clear the pending container
    Canvas.clearContainer(this.#pending);

    // Schedule saving the texture to the database
    this.#updated = true;
    this.#debouncedSave();
  }

  /* -------------------------------------------- */

  /**
   * Load existing fog of war data from local storage and populate the initial exploration sprite
   * @returns {Promise<(PIXI.Texture|void)>}
   */
  async load() {
    if ( CONFIG.debug.fog ) console.debug("SightLayer | Loading saved FogExploration for Scene.");

    // Remove the previous render texture if one exists
    if ( this.#sprite?.texture?.valid ) {
      this.#textures.push(this.#sprite.texture);
      this.#sprite.texture = null;
    }

    // Take no further action if token vision is not enabled
    if ( !this.tokenVision ) return;

    // Load existing FOW exploration data or create a new placeholder
    const fogExplorationCls = getDocumentClass("FogExploration");
    this.exploration = await fogExplorationCls.get();

    // Create a brand new FogExploration document
    if ( !this.exploration ) {
      this.exploration = new fogExplorationCls();
      return this.#sprite.texture = PIXI.Texture.EMPTY;
    }

    // Extract and assign the fog data image
    const assign = (tex, resolve) => {
      this.#sprite.texture = tex;
      resolve(tex);
    };
    return await new Promise(resolve => {
      let tex = this.exploration.getTexture();
      if ( tex === null ) assign(PIXI.Texture.EMPTY, resolve);
      else if ( tex.baseTexture.valid ) assign(tex, resolve);
      else tex.on("update", tex => assign(tex, resolve));
    });
  }

  /* -------------------------------------------- */

  /**
   * Dispatch a request to reset the fog of war exploration status for all users within this Scene.
   * Once the server has deleted existing FogExploration documents, the _onReset handler will re-draw the canvas.
   */
  async reset() {
    if ( CONFIG.debug.fog ) console.debug("SightLayer | Resetting fog of war exploration for Scene.");
    game.socket.emit("resetFog", canvas.scene.id);
  }

  /* -------------------------------------------- */

  /**
   * Save Fog of War exploration data to a base64 string to the FogExploration document in the database.
   * Assumes that the fog exploration has already been rendered as fog.rendered.texture.
   */
  async save() {
    if ( !this.tokenVision || !this.fogExploration || !this.exploration ) return;
    if ( !this.#updated ) return;
    this.#updated = false;
    if ( CONFIG.debug.fog ) console.debug("SightLayer | Saving exploration progress to FogExploration document.");

    // Use the existing rendered fog to create a Sprite and downsize to save with smaller footprint
    const dims = canvas.dimensions;
    const fog = new PIXI.Sprite(this.#sprite.texture);

    // Determine whether a downscaling factor should be used
    const maxSize = FogManager.#MAXIMUM_FOW_TEXTURE_SIZE;
    const scale = Math.min(maxSize / dims.sceneWidth, maxSize / dims.sceneHeight);
    if ( scale < 1.0 ) fog.scale.set(scale, scale);

    // Add the fog to a temporary container to bound it's dimensions and export to base data
    const stage = new PIXI.Container();
    stage.addChild(fog);

    // Extract fog exploration to a base64 image
    const updateData = {
      explored: await ImageHelper.pixiToBase64(stage, "image/jpeg", 0.8),
      timestamp: Date.now()
    };

    // Create or update the FogExploration document
    if ( !this.exploration.id ) {
      this.exploration.updateSource(updateData);
      this.exploration = await this.exploration.constructor.create(this.exploration.toJSON());
    }
    else await this.exploration.update(updateData);
  }

  /* -------------------------------------------- */

  /**
   * Update the fog layer when a player token reaches a board position which was not previously explored
   * @param {VisionSource} source   The vision source for which the fog layer should update
   * @param {boolean} force         Force fog to be updated even if the location is already explored
   * @returns {boolean}             Whether the source position represents a new fog exploration point
   */
  update(source, force=false) {
    if ( !this.fogExploration || source.isPreview ) return false;
    if ( !this.exploration ) {
      const cls = getDocumentClass("FogExploration");
      this.exploration = new cls();
    }
    return this.exploration.explore(source, force);
  }

  /* -------------------------------------------- */

  /**
   * @typedef {object} FogResolution
   * @property {number} resolution
   * @property {number} width
   * @property {number} height
   * @property {number} mipmap
   * @property {number} scaleMode
   * @property {number} multisample
   */

  /**
   * Choose an adaptive fog rendering resolution which downscales the saved fog textures for larger dimension Scenes.
   * It is important that the width and height of the fog texture is evenly divisible by the downscaling resolution.
   * @returns {FogResolution}
   * @private
   */
  configureResolution() {
    const dims = canvas.dimensions;
    let width = dims.sceneWidth;
    let height = dims.sceneHeight;
    const maxSize = FogManager.#MAXIMUM_FOW_TEXTURE_SIZE;

    // Adapt the fog texture resolution relative to some maximum size, and ensure that multiplying the scene dimensions
    // by the resolution results in an integer number in order to avoid fog drift.
    let resolution = 1.0;
    if ( (width >= height) && (width > maxSize) ) {
      resolution = maxSize / width;
      height = Math.ceil(height * resolution) / resolution;
    } else if ( height > maxSize ) {
      resolution = maxSize / height;
      width = Math.ceil(width * resolution) / resolution;
    }

    // Determine the fog texture dimensions that is evenly divisible by the scaled resolution
    return this.#resolution = {
      resolution,
      width,
      height,
      mipmap: PIXI.MIPMAP_MODES.OFF,
      scaleMode: PIXI.SCALE_MODES.LINEAR,
      multisample: PIXI.MSAA_QUALITY.NONE
    };
  }

  /* -------------------------------------------- */

  /**
   * Deactivate fog of war.
   * Clear all shared containers by unlinking them from their parent.
   * Destroy all stored textures and graphics.
   */
  #deactivate() {

    // Remove the current exploration document
    this.exploration = null;
    canvas.masks.vision.clear();

    // Un-stage fog containers from the visibility layer
    if ( this.#pending.parent ) this.#pending.parent.removeChild(this.#pending);
    if ( this.#revealed.parent ) this.#revealed.parent.removeChild(this.#revealed);
    if ( this.#sprite.parent ) this.#sprite.parent.removeChild(this.#sprite);

    // Clear the pending container
    Canvas.clearContainer(this.#pending);

    // Destroy fog exploration textures
    while ( this.#textures.length ) {
      const t = this.#textures.pop();
      t.destroy(true);
    }
    this.#sprite.texture.destroy(true);
    this.#sprite.texture = PIXI.Texture.EMPTY;
  }

  /* -------------------------------------------- */

  /**
   * If fog of war data is reset from the server, re-draw the canvas
   * @returns {Promise}
   * @internal
   */
  async _handleReset() {
    ui.notifications.info("Fog of War exploration progress was reset for this Scene");

    // Deactivate the existing fog containers and re-draw CanvasVisibility
    this.#deactivate();

    // Create new fog exploration
    const cls = getDocumentClass("FogExploration");
    this.exploration = new cls();

    // Re-draw the canvas visibility layer
    await canvas.effects.visibility.draw();
    canvas.perception.initialize();
  }

  /* -------------------------------------------- */

  /**
   * Get a usable RenderTexture from the textures pool
   * @returns {PIXI.RenderTexture}
   */
  #getTexture() {
    if ( this.#textures.length ) {
      const tex = this.#textures.pop();
      if ( tex.valid ) return tex;
    }
    return PIXI.RenderTexture.create(this.#resolution);
  }
}
