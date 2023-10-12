// noinspection JSPrimitiveTypeWrapperUsage
/**
 * The visibility Layer which implements dynamic vision, lighting, and fog of war
 * This layer uses an event-driven workflow to perform the minimal required calculation in response to changes.
 * @see {@link PointSource}
 * @category - Canvas
 *
 * @property {PIXI.Container} explored        The exploration container which tracks exploration progress
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
   * The optional visibility overlay sprite that should be drawn instead of the unexplored color in the fog of war.
   * @type {PIXI.Sprite}
   */
  visibilityOverlay;

  /**
   * Matrix used for visibility rendering transformation.
   * @type {PIXI.Matrix}
   */
  #renderTransform = new PIXI.Matrix();

  /**
   * Dimensions of the visibility overlay texture and base texture used for tiling texture into the visibility filter.
   * @type {number[]}
   */
  #visibilityOverlayDimensions;

  /**
   * The SpriteMesh which holds a cached texture of lights field of vision.
   * These elements are less likely to change during the course of a game.
   * @type {SpriteMesh}
   */
  #lightsSprite;

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

  /**
   * Map of the point sources active and updateId states
   * - The wasActive
   * - The updateId
   * @type {Map<number, object<boolean, number>>}
   */
  #pointSourcesStates = new Map();

  /**
   * The maximum allowable visibility texture size.
   * @type {number}
   */
  static #MAXIMUM_VISIBILITY_TEXTURE_SIZE = 4096;

  /* -------------------------------------------- */
  /*  Canvas Visibility Properties                */
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

  /**
   * The configured options used for the saved fog-of-war texture.
   * @type {FogTextureConfiguration}
   */
  get textureConfiguration() {
    return this.#textureConfiguration;
  }

  /** @private */
  #textureConfiguration;

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

    // Update vision sources
    sources.clear();
    for ( const token of canvas.tokens.placeables ) {
      token.updateVisionSource({defer: true});
    }
    for ( const token of canvas.tokens.preview.children ) {
      token.updateVisionSource({defer: true});
    }

    // Initialize vision modes
    this.visionModeData.source = this.#getSingleVisionSource();
    this.#configureLightingVisibility();
    this.#updateLightingPostProcessing();
    this.#updateTintPostProcessing();

    // Call hooks
    Hooks.callAll("initializeVisionSources", sources);
  }

  /* -------------------------------------------- */

  /**
   * Identify whether there is one singular vision source active (excluding previews).
   * @returns {VisionSource|null}                         A singular source, or null
   */
  #getSingleVisionSource() {
    let singleVisionSource = null;
    for ( const visionSource of canvas.effects.visionSources ) {
      if ( !visionSource.active ) continue;
      if ( singleVisionSource && visionSource.isPreview ) continue;
      singleVisionSource = visionSource;
      if ( !singleVisionSource.isPreview ) return singleVisionSource;
    }
    return singleVisionSource;
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
      illumination: vm?.lighting.illumination.visibility ?? lvs.ENABLED,
      coloration: vm?.lighting.coloration.visibility ?? lvs.ENABLED
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
    // Do we need to force lighting background shader? Force when :
    // - Multiple vision modes are active with a mix of preferred and non preferred visions
    // - Or when some have background shader required
    const lvs = VisionMode.LIGHTING_VISIBILITY;
    let preferred = false;
    let nonPreferred = false;
    for ( const vs of canvas.effects.visionSources ) {
      if ( !vs.active ) continue;
      const vm = vs.visionMode;
      if ( vm.lighting.background.visibility === lvs.REQUIRED ) return lvs.REQUIRED;
      if ( vm.vision.preferred ) preferred = true;
      else nonPreferred = true;
    }
    if ( preferred && nonPreferred ) return lvs.REQUIRED;
    return visionMode?.lighting.background.visibility ?? lvs.ENABLED;
  }

  /* -------------------------------------------- */
  /*  Layer Rendering                             */
  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    this.#configureVisibilityTexture();

    // Initialize fog
    await canvas.fog.initialize();

    // Create the vision container and attach it to the CanvasVisionMask cached container
    this.vision = this.#createVision();
    canvas.masks.vision.attachVision(this.vision);

    // Exploration container
    this.explored = this.addChild(this.#createExploration());

    // Loading the fog overlay
    await this.#drawVisibilityOverlay();

    // Apply the visibility filter with a normal blend
    this.filter = CONFIG.Canvas.visibilityFilter.create({
      unexploredColor: canvas.colors.fogUnexplored.rgb,
      exploredColor: canvas.colors.fogExplored.rgb,
      backgroundColor: canvas.colors.background.rgb,
      visionTexture: canvas.masks.vision.renderTexture,
      primaryTexture: canvas.primary.renderTexture,
      overlayTexture: this.visibilityOverlay?.texture ?? null,
      dimensions: this.#visibilityOverlayDimensions,
      hasOverlayTexture: !!this.visibilityOverlay?.texture.valid
    }, canvas.visibilityOptions);
    this.filter.blendMode = PIXI.BLEND_MODES.NORMAL;
    this.filters = [this.filter];
    this.filterArea = canvas.app.screen;

    // Add the visibility filter to the canvas blur filter list
    canvas.addBlurFilter(this.filter);
    this.visible = false;
    this.#initialized = true;
  }

  /* -------------------------------------------- */

  /**
   * Create the exploration container with its exploration sprite.
   * @returns {PIXI.Container}   The newly created exploration container.
   */
  #createExploration() {
    const dims = canvas.dimensions;
    const explored = new PIXI.Container();
    const explorationSprite = explored.addChild(canvas.fog.sprite);
    explorationSprite.position.set(dims.sceneX, dims.sceneY);
    explorationSprite.width = this.#textureConfiguration.width;
    explorationSprite.height = this.#textureConfiguration.height;
    return explored;
  }

  /* -------------------------------------------- */

  /**
   * Create the vision container and all its children.
   * @returns {PIXI.Container} The created vision container.
   */
  #createVision() {
    const dims = canvas.dimensions;
    const vision = new PIXI.Container();

    // Base vision to provide minimum sight
    vision.base = vision.addChild(new PIXI.LegacyGraphics());
    vision.base.blendMode = PIXI.BLEND_MODES.MAX_COLOR;

    // The field of vision container
    vision.fov = vision.addChild(new PIXI.Container());

    // SpriteMesh that holds the cached elements that provides contribution to the field of vision
    vision.fov.lightsSprite = this.#lightsSprite = vision.fov.addChild(new SpriteMesh(Canvas.getRenderTexture({
      textureConfiguration: this.textureConfiguration
    })));
    vision.fov.lightsSprite.position.set(dims.sceneX, dims.sceneY);
    vision.fov.lightsSprite.blendMode = PIXI.BLEND_MODES.MAX_COLOR;

    // Graphic that holds elements which are not changing often during the course of a game (light sources)
    // This graphics is cached in the lightsSprite SpriteMesh
    vision.fov.lights = vision.fov.addChild(new PIXI.LegacyGraphics());
    vision.fov.lights.cullable = false;
    vision.fov.lights.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
    vision.fov.lights.renderable = false;

    // Graphic that holds elements which are changing often (token vision and light sources)
    vision.fov.tokens = vision.fov.addChild(new PIXI.LegacyGraphics());
    vision.fov.tokens.blendMode = PIXI.BLEND_MODES.MAX_COLOR;

    // Handling of the line of sight
    vision.los = vision.addChild(new PIXI.LegacyGraphics());
    vision.los.preview = vision.los.addChild(new PIXI.LegacyGraphics());
    vision.mask = vision.los;
    return vision;
  }

  /* -------------------------------------------- */

  /** @override */
  async _tearDown(options) {
    if ( this.#initialized ) {
      canvas.masks.vision.detachVision();
      this.#pointSourcesStates.clear();
      await canvas.fog.clear();

      // Performs deep cleaning of the detached vision container
      this.vision.destroy({children: true, texture: true, baseTexture: true});
      this.vision = undefined;

      canvas.effects.visionSources.clear();
      this.#initialized = false;
    }
    return super._tearDown();
  }

  /* -------------------------------------------- */

  /**
   * Update the display of the sight layer.
   * Organize sources into rendering queues and draw lighting containers for each source
   */
  refresh() {
    if ( !this.initialized ) return;

    // Refresh visibility
    if ( this.tokenVision ) {
      this.refreshVisibility();
      this.visible = canvas.effects.visionSources.some(s => s.active) || !game.user.isGM;
    }
    else this.visible = false;

    // Update visibility of objects
    this.restrictVisibility();
  }

  /* -------------------------------------------- */

  /**
   * Update vision (and fog if necessary)
   */
  refreshVisibility() {
    if ( !this.vision?.children.length ) return;
    const fillColor = 0xFF0000;
    const vision = this.vision;

    // A flag to know if the lights cache render texture need to be refreshed
    let refreshCache = false;

    // A flag to know if fog need to be refreshed.
    let commitFog = false;

    // Checking if the lights cache need a full redraw
    let lightsFullRedraw = this.#checkLights();
    if ( lightsFullRedraw ) {
      this.#pointSourcesStates.clear();
      vision.fov.lights.clear();
    }
    vision.base.clear();
    vision.base.beginFill(fillColor, 1.0);
    vision.fov.lights.beginFill(fillColor, 1.0);
    vision.fov.tokens.clear();
    vision.fov.tokens.beginFill(fillColor, 1.0);

    vision.los.clear();
    vision.los.beginFill(fillColor, 1.0);
    vision.los.preview.clear();
    vision.los.preview.beginFill(fillColor, 1.0);

    // Iterating over each light source
    for ( const lightSource of canvas.effects.lightSources ) {
      // The light source is providing vision and has an active layer?
      if ( lightSource.active && lightSource.data.vision ) {
        if ( !lightSource.isPreview ) vision.los.drawShape(lightSource.shape);
        else vision.los.preview.drawShape(lightSource.shape);
      }

      // The light source is emanating from a token?
      if ( lightSource.object instanceof Token ) {
        if ( !lightSource.active ) continue;
        if ( !lightSource.isPreview ) vision.fov.tokens.drawShape(lightSource.shape);
        else vision.base.drawShape(lightSource.shape);
        continue;
      }

      // Determine whether this light source needs to be drawn to the texture
      let draw = lightsFullRedraw;
      if ( !lightsFullRedraw ) {
        const priorState = this.#pointSourcesStates.get(lightSource);
        if ( !priorState || priorState.wasActive === false ) draw = lightSource.active;
      }

      // Save the state of this light source
      this.#pointSourcesStates.set(lightSource,
        {wasActive: lightSource.active, updateId: lightSource.updateId});

      if ( !lightSource.active ) continue;
      refreshCache = true;
      if ( draw ) vision.fov.lights.drawShape(lightSource.shape);
    }

    // Do we need to cache the lights into the lightsSprite render texture?
    // Note: With a full redraw, we need to refresh the texture cache, even if no elements are present
    if ( refreshCache || lightsFullRedraw ) this.#cacheLights(lightsFullRedraw);

    // Iterating over each vision source
    for ( const visionSource of canvas.effects.visionSources ) {
      if ( !visionSource.active ) continue;
      // Draw FOV polygon or provide some baseline visibility of the token's space
      if ( (visionSource.radius > 0) && !visionSource.data.blinded && !visionSource.isPreview ) {
        vision.fov.tokens.drawShape(visionSource.fov);
      } else vision.base.drawShape(visionSource.fov);
      // Draw LOS mask (with exception for blinded tokens)
      if ( !visionSource.data.blinded && !visionSource.isPreview ) {
        vision.los.drawShape(visionSource.los);
        commitFog = true;
      } else vision.los.preview.drawShape(visionSource.data.blinded ? visionSource.fov : visionSource.los);
    }

    // Fill operations are finished for LOS and FOV lights and tokens
    vision.base.endFill();
    vision.fov.lights.endFill();
    vision.fov.tokens.endFill();
    vision.los.endFill();
    vision.los.preview.endFill();

    // Update fog of war texture (if fow is activated)
    if ( commitFog ) canvas.fog.commit();
  }

  /* -------------------------------------------- */

  /**
   * Reset the exploration container with the fog sprite
   */
  resetExploration() {
    if ( !this.explored ) return;
    this.explored.destroy();
    this.explored = this.addChild(this.#createExploration());
  }

  /* -------------------------------------------- */

  /**
   * Check if the lightsSprite render texture cache needs to be fully redrawn.
   * @returns {boolean}              return true if the lights need to be redrawn.
   */
  #checkLights() {
    // Counter to detect deleted light source
    let lightCount = 0;
    // First checking states changes for the current effects lightsources
    for ( const lightSource of canvas.effects.lightSources ) {
      if ( lightSource.object instanceof Token ) continue;
      const state = this.#pointSourcesStates.get(lightSource);
      if ( !state ) continue;
      if ( (state.updateId !== lightSource.updateId) || (state.wasActive && !lightSource.active) ) return true;
      lightCount++;
    }
    // Then checking if some lightsources were deleted
    return this.#pointSourcesStates.size > lightCount;
  }

  /* -------------------------------------------- */

  /**
   * Cache into the lightsSprite render texture elements contained into vision.fov.lights
   * Note: A full cache redraw needs the texture to be cleared.
   * @param {boolean} clearTexture       If the texture need to be cleared before rendering.
   */
  #cacheLights(clearTexture) {
    this.vision.fov.lights.renderable = true;
    const dims = canvas.dimensions;
    this.#renderTransform.tx = -dims.sceneX;
    this.#renderTransform.ty = -dims.sceneY;

    // Render the currently revealed vision to the texture
    canvas.app.renderer.render(this.vision.fov.lights, {
      renderTexture: this.#lightsSprite.texture,
      clear: clearTexture,
      transform: this.#renderTransform
    });
    this.vision.fov.lights.renderable = false;
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
      t._refreshVisibility(); // TODO: set render flag instead in the future
    }

    // Door Icons
    for ( let d of canvas.controls.doors.children ) {
      d.visible = d.isVisible;
    }

    // Map Notes
    for ( let n of canvas.notes.placeables ) {
      n._refreshVisibility(); // TODO: set render flag instead in the future
    }

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
   * @param {Point} point                               The point in space to test, an object with coordinates x and y.
   * @param {object} [options]                          Additional options which modify visibility testing.
   * @param {number} [options.tolerance=2]              A numeric radial offset which allows for a non-exact match.
   *                                                    For example, if tolerance is 2 then the test will pass if the point
   *                                                    is within 2px of a vision polygon.
   * @param {PlaceableObject|object|null} [options.object] An optional reference to the object whose visibility is being tested
   * @returns {boolean}                                 Whether the point is currently visible.
   */
  testVisibility(point, {tolerance=2, object=null}={}) {

    // If no vision sources are present, the visibility is dependant of the type of user
    if ( !canvas.effects.visionSources.some(s => s.active) ) return game.user.isGM;

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
      if ( !lightSource.data.vision || !lightSource.active ) continue;
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

  /* -------------------------------------------- */
  /*  Visibility Overlay and Texture management   */
  /* -------------------------------------------- */

  /**
   * Load the scene fog overlay if provided and attach the fog overlay sprite to this layer.
   */
  async #drawVisibilityOverlay() {
    this.visibilityOverlay = undefined;
    this.#visibilityOverlayDimensions = [];
    const overlayTexture = canvas.sceneTextures.fogOverlay ?? getTexture(canvas.scene.fogOverlay);
    if ( !overlayTexture ) return;

    // Creating the sprite and updating its base texture with repeating wrap mode
    const fo = this.visibilityOverlay = new PIXI.Sprite(overlayTexture);

    // Set dimensions and position according to overlay <-> scene foreground dimensions
    const bkg = canvas.primary.background;
    const baseTex = overlayTexture.baseTexture;
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

    // The overlay is added to this canvas container to update its transforms only
    fo.renderable = false;
    this.addChild(this.visibilityOverlay);

    // Manage video playback
    const video = game.video.getVideoSource(overlayTexture);
    if ( video ) {
      const playOptions = {volume: 0};
      game.video.play(video, playOptions);
    }

    // Passing overlay and base texture width and height for shader tiling calculations
    this.#visibilityOverlayDimensions = [fo.width, fo.height, baseTex.width, baseTex.height];
  }

  /* -------------------------------------------- */

  /**
   * @typedef {object} VisibilityTextureConfiguration
   * @property {number} resolution
   * @property {number} width
   * @property {number} height
   * @property {number} mipmap
   * @property {number} scaleMode
   * @property {number} multisample
   */

  /**
   * Configure the fog texture will all required options.
   * Choose an adaptive fog rendering resolution which downscales the saved fog textures for larger dimension Scenes.
   * It is important that the width and height of the fog texture is evenly divisible by the downscaling resolution.
   * @returns {VisibilityTextureConfiguration}
   * @private
   */
  #configureVisibilityTexture() {
    const dims = canvas.dimensions;
    let width = dims.sceneWidth;
    let height = dims.sceneHeight;
    const maxSize = CanvasVisibility.#MAXIMUM_VISIBILITY_TEXTURE_SIZE;

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

    // Determine the fog texture options
    return this.#textureConfiguration = {
      resolution,
      width,
      height,
      mipmap: PIXI.MIPMAP_MODES.OFF,
      multisample: PIXI.MSAA_QUALITY.NONE,
      scaleMode: PIXI.SCALE_MODES.LINEAR,
      alphaMode: PIXI.ALPHA_MODES.NPM,
      format: PIXI.FORMATS.RED
    };
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  get fogOverlay() {
    const msg = "fogOverlay is deprecated in favor of visibilityOverlay";
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
    return this.visibilityOverlay;
  }
}
