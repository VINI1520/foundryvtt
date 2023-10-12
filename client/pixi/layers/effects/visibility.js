// noinspection JSPrimitiveTypeWrapperUsage
/**
 * The visibility Layer which implements dynamic vision, lighting, and fog of war
 * This layer uses an event-driven workflow to perform the minimal required calculation in response to changes.
 * @see {@link PointSource}
 * @category - Canvas
 *
 * @property {PIXI.Graphics} unexplored       The unexplored background which spans the entire canvas
 * @property {PIXI.Container} explored        The exploration container which tracks exploration progress
 * @property {PIXI.Container} revealed        A container of regions which have previously been revealed
 * @property {PIXI.Sprite} saved              The saved fog exploration texture
 * @property {PIXI.Container} pending         Pending exploration which has not yet been committed to the texture
 * @property {CanvasVisionContainer} vision   The container of current vision exploration
 */
class CanvasVisibility extends CanvasLayer {

  /**
   * The current vision container which provides line-of-sight for vision sources and field-of-view of light sources.
   * @type {PIXI.Container}
   */
  vision;

  /**
   * The canonical line-of-sight polygon which defines current Token visibility.
   * @type {PIXI.Graphics}
   */
  los;

  /**
   * The optional fog overlay sprite that should be drawn instead of the unexplored color in the fog of war.
   * @type {PIXI.Sprite}
   */
  fogOverlay;

  /**
   * Dimensions of the fog overlay texture and base texture used for tiling texture into the visibility filter.
   * @type {number[]}
   */
  #fogOverlayDimensions;

  /**
   * The active vision source data object
   * @type {{source: VisionSource|null, activeLightingOptions: object}}
   */
  visionModeData = {
    source: undefined,
    activeLightingOptions: {}
  };

  /**
   * Define whether each lighting layer is enabled, required, or disabled by this vision mode.
   * The value for each lighting channel is a number in LIGHTING_VISIBILITY
   * @type {{illumination: number, background: number, coloration: number, any: boolean}}
   */
  lightingVisibility = {
    background: VisionMode.LIGHTING_VISIBILITY.ENABLED,
    illumination: VisionMode.LIGHTING_VISIBILITY.ENABLED,
    coloration: VisionMode.LIGHTING_VISIBILITY.ENABLED,
    any: true
  };

  /* -------------------------------------------- */

  /**
   * A status flag for whether the layer initialization workflow has succeeded.
   * @type {boolean}
   */
  get initialized() {
    return this.#initialized;
  }

  #initialized = false;

  /* -------------------------------------------- */

  /**
   * Does the currently viewed Scene support Token field of vision?
   * @type {boolean}
   */
  get tokenVision() {
    return canvas.scene.tokenVision;
  }

  /* -------------------------------------------- */
  /*  Layer Initialization                        */
  /* -------------------------------------------- */

  /**
   * Initialize all Token vision sources which are present on this layer
   */
  initializeSources() {

    // Deactivate vision masking before destroying textures
    canvas.effects.toggleMaskingFilters(false);

    // Get an array of tokens from the vision source collection
    const sources = canvas.effects.visionSources;
    const priorSources = new Set(sources.values());

    // Update vision sources
    sources.clear();
    for ( const token of canvas.tokens.placeables ) {
      token.updateVisionSource({defer: true});
    }

    // Initialize vision modes
    this.visionModeData.source = this.#getSingleVisionSource(sources);
    this.#callActivationHandlers(sources, priorSources);
    this.#configureLightingVisibility();
    this.#updateLightingPostProcessing();
    this.#updateTintPostProcessing();

    // Call hooks
    Hooks.callAll("initializeVisionSources", sources);
  }

  /* -------------------------------------------- */

  /**
   * Identify whether there is one singular vision source active (excluding previews).
   * @param {Collection<string,VisionSource>} sources     The current sources
   * @returns {VisionSource|null}                         A singular source, or null
   */
  #getSingleVisionSource(sources) {
    let singleVisionSource = null;
    for ( const [key, source] of canvas.effects.visionSources.entries() ) {
      if ( key.includes(".preview") ) continue;
      if ( singleVisionSource ) return null;
      singleVisionSource = source;
    }
    return singleVisionSource;
  }

  /* -------------------------------------------- */

  /**
   * Call activation and deactivation handlers for the vision modes whose state has changed.
   * @param {Collection<string,VisionSource>} sources     The new collection of active sources
   * @param {Set<VisionSource>} priorSources              The set of previously active sources
   */
  #callActivationHandlers(sources, priorSources) {
    for ( const prior of priorSources ) {
      if ( !sources.has(prior.object.sourceId) ) prior.visionMode.deactivate(prior);
    }
    for ( const source of sources.values() ) {
      if ( !priorSources.has(source) ) source.visionMode.activate(source);
    }
  }

  /* -------------------------------------------- */

  /**
   * Configure the visibility of individual lighting channels based on the currently active vision source(s).
   */
  #configureLightingVisibility() {
    const vm = this.visionModeData.source?.visionMode;
    const lv = this.lightingVisibility;
    const lvs = VisionMode.LIGHTING_VISIBILITY;
    foundry.utils.mergeObject(lv, {
      background: CanvasVisibility.#requireBackgroundShader(vm),
      illumination: (!vm || vm.lighting.illumination.visibility)
        ? (vm?.lighting.illumination.visibility ?? lvs.ENABLED) : lvs.DISABLED,
      coloration: (!vm || vm.lighting.coloration.visibility)
        ? (vm?.lighting.coloration.visibility ?? lvs.ENABLED) : lvs.DISABLED
    });
    lv.any = (lv.background + lv.illumination + lv.coloration) > VisionMode.LIGHTING_VISIBILITY.DISABLED;
  }

  /* -------------------------------------------- */

  /**
   * Update the lighting according to vision mode options.
   */
  #updateLightingPostProcessing() {
    // Check whether lighting configuration has changed
    const lightingOptions = this.visionModeData.source?.visionMode.lighting || {};
    const diffOpt = foundry.utils.diffObject(this.visionModeData.activeLightingOptions, lightingOptions);
    this.visionModeData.activeLightingOptions = lightingOptions;
    if ( foundry.utils.isEmpty(lightingOptions) ) canvas.effects.resetPostProcessingFilters();
    if ( foundry.utils.isEmpty(diffOpt) ) return;

    // Update post-processing filters and refresh lighting
    canvas.effects.resetPostProcessingFilters();
    for ( const layer of ["background", "illumination", "coloration"] ) {
      if ( layer in lightingOptions ) {
        const options = lightingOptions[layer];
        canvas.effects.activatePostProcessingFilters(layer, options.postProcessingModes, options.uniforms);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Refresh the tint of the post processing filters.
   */
  #updateTintPostProcessing() {
    // Update tint
    const activeOptions = this.visionModeData.activeLightingOptions;
    const singleSource = this.visionModeData.source;
    const defaultTint = VisualEffectsMaskingFilter.defaultUniforms.tint;
    const color = singleSource?.colorRGB;
    for ( const f of canvas.effects.visualEffectsMaskingFilters ) {
      const tintedLayer = activeOptions[f.filterMode]?.uniforms?.tint;
      f.uniforms.tint = tintedLayer ? (color ?? (tintedLayer ?? defaultTint)) : defaultTint;
    }
  }

  /* -------------------------------------------- */

  /**
   * Give the visibility requirement of the lighting background shader.
   * @param {VisionMode} visionMode             The single Vision Mode active at the moment (if any).
   * @returns {VisionMode.LIGHTING_VISIBILITY}
   */
  static #requireBackgroundShader(visionMode) {
    if ( visionMode ) return visionMode.lighting.background.visibility;

    // Do we need to force lighting background shader? Force when :
    // - Multiple vision modes are active with a mix of preferred and non preferred visions
    // - Or when some have background shader required
    const lvs = VisionMode.LIGHTING_VISIBILITY;
    let forceBackground = false;
    let pCount = 0;
    let npCount = 0;
    for ( const vs of canvas.effects.visionSources ) {
      const p = vs.visionMode.vision.preferred;
      const v = vs.visionMode.lighting.background.visibility;
      if ( p ) pCount++;
      else npCount++;
      if ( (pCount && npCount) || v === lvs.REQUIRED ) {
        forceBackground = true;
        break;
      }
    }
    return forceBackground ? lvs.REQUIRED : lvs.ENABLED;
  }

  /* -------------------------------------------- */

  /**
   * Load the scene fog overlay if provided and attach the fog overlay sprite to this layer.
   */
  async #drawFogOverlay() {
    this.fogOverlay = undefined;
    this.#fogOverlayDimensions = [];

    // Checking fog overlay source
    const fogOverlaySrc = canvas.scene.fogOverlay;
    if ( !fogOverlaySrc ) return;

    // Checking fog texture (no fallback)
    const fogTex = await loadTexture(fogOverlaySrc);
    if ( !(fogTex && fogTex.valid) ) return;

    // Creating the sprite and updating its base texture with repeating wrap mode
    const fo = this.fogOverlay = new PIXI.Sprite();
    fo.texture = fogTex;

    // Set dimensions and position according to fog overlay <-> scene foreground dimensions
    const bkg = canvas.primary.background;
    const baseTex = fogTex.baseTexture;
    if ( bkg && ((fo.width !== bkg.width) || (fo.height !== bkg.height)) ) {
      // Set to the size of the scene dimensions
      fo.width = canvas.scene.dimensions.width;
      fo.height = canvas.scene.dimensions.height;
      fo.position.set(0, 0);
      // Activate repeat wrap mode for this base texture (to allow tiling)
      baseTex.wrapMode = PIXI.WRAP_MODES.REPEAT;
    }
    else {
      // Set the same position and size as the scene primary background
      fo.width = bkg.width;
      fo.height = bkg.height;
      fo.position.set(bkg.x, bkg.y);
    }

    // The fog overlay is added to this canvas container to update its transforms only
    fo.renderable = false;
    this.addChild(this.fogOverlay);

    // Manage video playback
    const video = game.video.getVideoSource(fogTex);
    if ( video ) {
      const playOptions = {volume: 0};
      game.video.play(video, playOptions);
    }

    // Passing overlay and base texture width and height for shader tiling calculations
    this.#fogOverlayDimensions = [fo.width, fo.height, baseTex.width, baseTex.height];
  }

  /* -------------------------------------------- */
  /*  Layer Rendering                             */
  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {

    // Create initial vision mask
    canvas.masks.vision.createVision();

    // Exploration container
    const dims = canvas.dimensions;
    this.explored = this.addChild(new PIXI.Container());

    // Past exploration updates
    this.revealed = this.explored.addChild(canvas.fog.revealed);
    this.saved = this.revealed.addChild(canvas.fog.sprite);
    this.saved.position.set(dims.sceneX, dims.sceneY);
    this.saved.width = canvas.fog.resolution.width;
    this.saved.height = canvas.fog.resolution.height;

    // Pending vision containers
    this.pending = this.revealed.addChild(canvas.fog.pending);

    // Loading the fog overlay
    await this.#drawFogOverlay();

    // Apply the visibility filter with a normal blend
    this.filter = VisibilityFilter.create({
      unexploredColor: canvas.colors.fogUnexplored.rgb,
      exploredColor: canvas.colors.fogExplored.rgb,
      backgroundColor: canvas.colors.background.rgb,
      visionTexture: canvas.masks.vision.renderTexture,
      primaryTexture: canvas.primary.renderTexture,
      fogTexture: this.fogOverlay?.texture ?? null,
      dimensions: this.#fogOverlayDimensions,
      hasFogTexture: !!this.fogOverlay?.texture.valid
    });
    this.filter.blendMode = PIXI.BLEND_MODES.NORMAL;
    this.filters = [this.filter];
    this.filterArea = canvas.app.screen;

    // Add the visibility filter to the canvas blur filter list
    canvas.addBlurFilter(this.filter);

    // Return the layer
    this.visible = false;
    this.#initialized = true;
  }

  /* -------------------------------------------- */

  /** @override */
  async _tearDown(options) {
    if ( this.#initialized ) {
      await canvas.fog.clear();
      canvas.effects.visionSources.clear();
      this.#initialized = false;
    }
    return super._tearDown();
  }

  /* -------------------------------------------- */

  /**
   * Update the display of the sight layer.
   * Organize sources into rendering queues and draw lighting containers for each source
   *
   * @param {object} [options]        Options which affect how visibility is refreshed
   * @param {boolean} [options.forceUpdateFog=false]  Always update the Fog exploration progress for this update
   */
  refresh({forceUpdateFog=false}={}) {
    if ( !this.initialized ) return;
    if ( !this.tokenVision ) {
      this.visible = false;
      return this.restrictVisibility();
    }

    // Stage the priorVision vision container to be saved to the FOW texture
    let commitFog = false;
    const priorVision = canvas.masks.vision.detachVision();
    if ( priorVision._explored ) {
      this.pending.addChild(priorVision);
      commitFog = this.pending.children.length >= FogManager.COMMIT_THRESHOLD;
    }
    else priorVision.destroy({children: true});

    // Create a new vision for this frame
    const vision = canvas.masks.vision.createVision();
    const fillColor = 0xFF0000;
    vision.fov.beginFill(fillColor, 1.0);
    vision.los.beginFill(fillColor, 1.0);

    // Draw field-of-vision for lighting sources
    for ( let lightSource of canvas.effects.lightSources ) {
      if ( !canvas.effects.visionSources.size || !lightSource.active || lightSource.disabled ) continue;
      vision.fov.drawShape(lightSource.los);
      if ( lightSource.data.vision ) vision.los.drawShape(lightSource.los);
    }

    // Draw sight-based visibility for each vision source
    for ( let visionSource of canvas.effects.visionSources ) {
      visionSource.active = true;

      // Draw FOV polygon or provide some baseline visibility of the token's space
      if ( visionSource.radius > 0 ) vision.fov.drawShape(visionSource.fov);
      else {
        const baseR = canvas.dimensions.size / 2;
        vision.base.beginFill(fillColor, 1.0).drawCircle(visionSource.x, visionSource.y, baseR).endFill();
      }

      // Draw LOS mask (with exception for blinded tokens)
      vision.los.drawShape(visionSource.data.blinded ? visionSource.fov : visionSource.los);

      // Record Fog of war exploration
      if ( canvas.fog.update(visionSource, forceUpdateFog) ) vision._explored = true;
    }

    // Conclude fill for vision graphics
    vision.fov.endFill();
    vision.los.endFill();

    // Commit updates to the Fog of War texture
    if ( commitFog ) canvas.fog.commit();

    // Alter visibility of the vision layer
    this.visible = !!(canvas.effects.visionSources.size || !game.user.isGM);

    // Restrict the visibility of other canvas objects
    this.restrictVisibility();
  }

  /* -------------------------------------------- */
  /*  Visibility Testing                          */
  /* -------------------------------------------- */

  /**
   * Restrict the visibility of certain canvas assets (like Tokens or DoorControls) based on the visibility polygon
   * These assets should only be displayed if they are visible given the current player's field of view
   */
  restrictVisibility() {
    // Activate or deactivate visual effects vision masking
    canvas.effects.toggleMaskingFilters(this.visible);

    // Tokens
    for ( let t of canvas.tokens.placeables ) {
      t.detectionFilter = undefined;
      t.visible = ( !this.tokenVision && !t.document.hidden ) || t.isVisible;
      if ( canvas.tokens._highlight ) t.refreshHUD();
    }

    // Door Icons
    for ( let d of canvas.controls.doors.children ) {
      d.visible = !this.tokenVision || d.isVisible;
    }

    // Map Notes
    for ( let n of canvas.notes.placeables ) {
      n.visible = n.isVisible;
    }
    canvas.notes.hintMapNotes();
    Hooks.callAll("sightRefresh", this);
  }

  /* -------------------------------------------- */

  /**
   * @typedef {Object} CanvasVisibilityTestConfig
   * @property {PlaceableObject} object           The target object
   * @property {CanvasVisibilityTest[]} tests     An array of visibility tests
   */

  /**
   * @typedef {Object} CanvasVisibilityTest
   * @property {PIXI.Point} point
   * @property {Map<VisionSource, boolean>} los
   */

  /**
   * Test whether a target point on the Canvas is visible based on the current vision and LOS polygons.
   * @param {Point} point                         The point in space to test, an object with coordinates x and y.
   * @param {object} [options]                    Additional options which modify visibility testing.
   * @param {number} [options.tolerance=2]        A numeric radial offset which allows for a non-exact match.
   *                                              For example, if tolerance is 2 then the test will pass if the point
   *                                              is within 2px of a vision polygon.
   * @param {PIXI.DisplayObject} [options.object] An optional reference to the object whose visibility is being tested
   * @returns {boolean}                           Whether the point is currently visible.
   */
  testVisibility(point, {tolerance=2, object=null}={}) {

    // If no vision sources are present, the visibility is dependant of the type of user
    if ( !canvas.effects.visionSources.size ) return game.user.isGM;

    // Get scene rect to test that some points are not detected into the padding
    const sr = canvas.dimensions.sceneRect;
    const inBuffer = !sr.contains(point.x, point.y);

    // Prepare an array of test points depending on the requested tolerance
    const t = tolerance;
    const offsets = t > 0 ? [[0, 0], [-t, -t], [-t, t], [t, t], [t, -t], [-t, 0], [t, 0], [0, -t], [0, t]] : [[0, 0]];
    const config = {
      object,
      tests: offsets.map(o => ({
        point: new PIXI.Point(point.x + o[0], point.y + o[1]),
        los: new Map()
      }))
    };
    const modes = CONFIG.Canvas.detectionModes;

    // First test basic detection for light sources which specifically provide vision
    for ( const lightSource of canvas.effects.lightSources.values() ) {
      if ( !lightSource.data.vision || !lightSource.active || lightSource.disabled ) continue;
      const result = lightSource.testVisibility(config);
      if ( result === true ) return true;
    }

    // Second test basic detection tests for vision sources
    for ( const visionSource of canvas.effects.visionSources.values() ) {
      if ( !visionSource.active ) continue;
      // Skip sources that are not both inside the scene or both inside the buffer
      if ( inBuffer === sr.contains(visionSource.x, visionSource.y) ) continue;
      const token = visionSource.object.document;
      const basic = token.detectionModes.find(m => m.id === DetectionMode.BASIC_MODE_ID);
      if ( !basic ) continue;
      const result = modes.basicSight.testVisibility(visionSource, basic, config);
      if ( result === true ) return true;
    }

    // Lastly test special detection modes for vision sources
    if ( !(object instanceof Token) ) return false;   // Special detection modes can only detect tokens
    for ( const visionSource of canvas.effects.visionSources.values() ) {
      if ( !visionSource.active ) continue;
      // Skip sources that are not both inside the scene or both inside the buffer
      if ( inBuffer === sr.contains(visionSource.x, visionSource.y) ) continue;
      const token = visionSource.object.document;
      for ( const mode of token.detectionModes ) {
        if ( mode.id === DetectionMode.BASIC_MODE_ID ) continue;
        const dm = modes[mode.id];
        const result = dm?.testVisibility(visionSource, mode, config);
        if ( result === true ) {
          object.detectionFilter = dm.constructor.getDetectionFilter();
          return true;
        }
      }
    }
    return false;
  }
}
