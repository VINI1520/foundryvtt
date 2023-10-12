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
   * Texture extractor
   * @type {TextureExtractor}
   */
  #extractor;

  /**
   * The fog refresh count.
   * If > to the refresh threshold, the fog texture is saved to database. It is then reinitialized to 0.
   * @type {number}
   */
  #refreshCount = 0;

  /**
   * Matrix used for fog rendering transformation.
   * @type {PIXI.Matrix}
   */
  #renderTransform = new PIXI.Matrix();

  /**
   * Define the number of fog refresh needed before the fog texture is extracted and pushed to the server.
   * @type {number}
   */
  static COMMIT_THRESHOLD = 70;

  /**
   * A debounced function to save fog of war exploration once a continuous stream of updates has concluded.
   * @type {Function}
   */
  #debouncedSave = foundry.utils.debounce(this.save.bind(this), 2000);

  /**
   * Handling of the concurrency for fog loading, saving and reset.
   * @type {Semaphore}
   */
  #queue = new foundry.utils.Semaphore();

  /* -------------------------------------------- */
  /*  Fog Manager Properties                      */
  /* -------------------------------------------- */

  /**
   * The exploration SpriteMesh which holds the fog exploration texture.
   * @type {SpriteMesh}
   */
  get sprite() {
    return this.#explorationSprite || (this.#explorationSprite = new SpriteMesh(Canvas.getRenderTexture({
      clearColor: [0, 0, 0, 1],
      textureConfiguration: this.textureConfiguration
    }), FogSamplerShader));
  }

  #explorationSprite;

  /* -------------------------------------------- */

  /**
   * The configured options used for the saved fog-of-war texture.
   * @type {FogTextureConfiguration}
   */
  get textureConfiguration() {
    return canvas.effects.visibility.textureConfiguration;
  }

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
    if ( this.#extractor === undefined ) {
      try {
        this.#extractor = new TextureExtractor(canvas.app.renderer, {
          callerName: "FogExtractor",
          controlHash: true,
          format: PIXI.FORMATS.RED
        });
      } catch(e) {
        this.#extractor = null;
        console.error(e);
      }
    }
    this.#extractor?.reset();
    await this.load();
    this.#initialized = true;
  }

  /* -------------------------------------------- */

  /**
   * Clear the fog and reinitialize properties (commit and save in non reset mode)
   * @returns {Promise<void>}
   */
  async clear() {
    // Save any pending exploration
    try {
      await this.save();
    } catch(e) {
      ui.notifications.error("Failed to save fog exploration");
      console.error(e);
    }

    // Deactivate current fog exploration
    this.#initialized = false;
    this.#deactivate();
  }

  /* -------------------------------------------- */

  /**
   * Once a new Fog of War location is explored, composite the explored container with the current staging sprite.
   * Once the number of refresh is > to the commit threshold, save the fog texture to the database.
   */
  commit() {
    const vision = canvas.effects.visibility.vision;
    if ( !vision?.children.length || !this.fogExploration || !this.tokenVision ) return;
    if ( !this.#explorationSprite?.texture.valid ) return;

    // Get a staging texture or clear and render into the sprite if its texture is a RT
    // and render the entire fog container to it
    const dims = canvas.dimensions;
    const isRenderTex = this.#explorationSprite.texture instanceof PIXI.RenderTexture;
    const tex = isRenderTex ? this.#explorationSprite.texture : Canvas.getRenderTexture({
      clearColor: [0, 0, 0, 1],
      textureConfiguration: this.textureConfiguration
    });
    this.#renderTransform.tx = -dims.sceneX;
    this.#renderTransform.ty = -dims.sceneY;

    // Base vision not committed
    vision.base.visible = false;
    vision.los.preview.visible = false;
    // Render the currently revealed vision to the texture
    canvas.app.renderer.render(isRenderTex ? vision : this.#explorationSprite, {
      renderTexture: tex,
      clear: false,
      transform: this.#renderTransform
    });
    vision.base.visible = true;
    vision.los.preview.visible = true;

    if ( !isRenderTex ) this.#explorationSprite.texture.destroy(true);
    this.#explorationSprite.texture = tex;
    this.#updated = true;

    if ( !this.exploration ) {
      const fogExplorationCls = getDocumentClass("FogExploration");
      this.exploration = new fogExplorationCls();
    }

    // Schedule saving the texture to the database
    if ( this.#refreshCount > FogManager.COMMIT_THRESHOLD ) {
      this.#debouncedSave();
      this.#refreshCount = 0;
    }
    else this.#refreshCount++;
  }

  /* -------------------------------------------- */

  /**
   * Load existing fog of war data from local storage and populate the initial exploration sprite
   * @returns {Promise<(PIXI.Texture|void)>}
   */
  async load() {
    return await this.#queue.add(this.#load.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Load existing fog of war data from local storage and populate the initial exploration sprite
   * @returns {Promise<(PIXI.Texture|void)>}
   */
  async #load() {
    if ( CONFIG.debug.fog.manager ) console.debug("FogManager | Loading saved FogExploration for Scene.");

    this.#deactivate();

    // Take no further action if token vision is not enabled
    if ( !this.tokenVision ) return;

    // Load existing FOW exploration data or create a new placeholder
    const fogExplorationCls = getDocumentClass("FogExploration");
    this.exploration = await fogExplorationCls.get();

    // Extract and assign the fog data image
    const assign = (tex, resolve) => {
      if ( this.#explorationSprite?.texture === tex ) return resolve(tex);
      this.#explorationSprite?.destroy(true);
      this.#explorationSprite = new SpriteMesh(tex, FogSamplerShader);
      canvas.effects.visibility.resetExploration();
      canvas.perception.initialize();
      resolve(tex);
    };

    // Initialize the exploration sprite if no exploration data exists
    if ( !this.exploration ) {
      return await new Promise(resolve => {
        assign(Canvas.getRenderTexture({
          clearColor: [0, 0, 0, 1],
          textureConfiguration: this.textureConfiguration
        }), resolve);
      });
    }
    // Otherwise load the texture from the exploration data
    return await new Promise(resolve => {
      let tex = this.exploration.getTexture();
      if ( tex === null ) assign(Canvas.getRenderTexture({
        clearColor: [0, 0, 0, 1],
        textureConfiguration: this.textureConfiguration
      }), resolve);
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
    if ( CONFIG.debug.fog.manager ) console.debug("FogManager | Resetting fog of war exploration for Scene.");
    game.socket.emit("resetFog", canvas.scene.id);
  }

  /* -------------------------------------------- */

  /**
   * Request a fog of war save operation.
   * Note: if a save operation is pending, we're waiting for its conclusion.
   */
  async save() {
    return await this.#queue.add(this.#save.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Request a fog of war save operation.
   * Note: if a save operation is pending, we're waiting for its conclusion.
   */
  async #save() {
    if ( !this.#updated ) return;
    this.#updated = false;
    const exploration = this.exploration;
    if ( CONFIG.debug.fog.manager ) {
      console.debug("FogManager | Initiate non-blocking extraction of the fog of war progress.");
    }
    if ( !this.#extractor ) {
      console.error("FogManager | Browser does not support texture extraction.");
      return;
    }

    // Get compressed base64 image from the fog texture
    let base64image;
    try {
      base64image = await this.#extractor.extract({
        texture: this.#explorationSprite.texture,
        compression: TextureExtractor.COMPRESSION_MODES.BASE64,
        type: "image/webp",
        quality: 0.8,
        debug: CONFIG.debug.fog.extractor
      });
    } catch(err) {
      // FIXME this is needed because for some reason .extract() may throw a boolean false instead of an Error
      throw new Error("Fog of War base64 extraction failed");
    }

    // If the exploration changed, the fog was reloaded while the pixels were extracted
    if ( this.exploration !== exploration ) return;

    // Need to skip?
    if ( !base64image ) {
      if ( CONFIG.debug.fog.manager ) console.debug("FogManager | Fog of war has not changed. Skipping db operation.");
      return;
    }

    // Generate fog exploration with base64 image and time stamp
    const updateData = {
      explored: base64image,
      timestamp: Date.now()
    };

    // Update the fog exploration document
    await this.#updateFogExploration(updateData);
  }

  /* -------------------------------------------- */

  /**
   * Update the fog exploration document with provided data.
   * @param {object} updateData
   * @returns {Promise<void>}
   */
  async #updateFogExploration(updateData) {
    if ( !game.scenes.has(canvas.scene?.id) ) return;
    if ( !this.exploration ) return;
    if ( CONFIG.debug.fog.manager ) console.debug("FogManager | Saving fog of war progress into exploration document.");
    if ( !this.exploration.id ) {
      this.exploration.updateSource(updateData);
      this.exploration = await this.exploration.constructor.create(this.exploration.toJSON(), {loadFog: false});
    }
    else await this.exploration.update(updateData, {loadFog: false});
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
    this.#extractor?.reset();

    // Destroy current exploration texture and provide a new one with transparency
    if ( this.#explorationSprite && !this.#explorationSprite.destroyed ) this.#explorationSprite.destroy(true);
    this.#explorationSprite = undefined;

    this.#updated = false;
    this.#refreshCount = 0;
  }

  /* -------------------------------------------- */

  /**
   * If fog of war data is reset from the server, deactivate the current fog and initialize the exploration.
   * @returns {Promise}
   * @internal
   */
  async _handleReset() {
    return await this.#queue.add(this.#handleReset.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * If fog of war data is reset from the server, deactivate the current fog and initialize the exploration.
   * @returns {Promise}
   */
  async #handleReset() {
    ui.notifications.info("Fog of War exploration progress was reset for this Scene");

    // Remove the current exploration document
    this.#deactivate();

    // Reset exploration in the visibility layer
    canvas.effects.visibility.resetExploration();

    // Refresh perception
    canvas.perception.initialize();
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  get pending() {
    const msg = "pending is deprecated and redirected to the exploration container";
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
    return canvas.effects.visibility.explored;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  get revealed() {
    const msg = "revealed is deprecated and redirected to the exploration container";
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
    return canvas.effects.visibility.explored;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  update(source, force=false) {
    const msg = "update is obsolete and always returns true. The fog exploration does not record position anymore.";
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
    return true;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  get resolution() {
    const msg = "resolution is deprecated and redirected to CanvasVisibility#textureConfiguration";
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
    return canvas.effects.visibility.textureConfiguration;
  }
}
