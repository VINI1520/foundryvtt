/**
 * The virtual tabletop environment is implemented using a WebGL powered HTML 5 canvas using the powerful PIXI.js
 * library. The canvas is comprised by an ordered sequence of layers which define rendering groups and collections of
 * objects that are drawn on the canvas itself.
 *
 * ### Hook Events
 * {@link hookEvents.canvasConfig}
 * {@link hookEvents.canvasInit}
 * {@link hookEvents.canvasReady}
 * {@link hookEvents.canvasPan}
 * {@link hookEvents.canvasTearDown}
 *
 * @category - Canvas
 *
 * @example Canvas State
 * ```js
 * canvas.ready; // Is the canvas ready for use?
 * canvas.scene; // The currently viewed Scene document.
 * canvas.dimensions; // The dimensions of the current Scene.
 * ```
 * @example Canvas Methods
 * ```js
 * canvas.draw(); // Completely re-draw the game canvas (this is usually unnecessary).
 * canvas.pan(x, y, zoom); // Pan the canvas to new coordinates and scale.
 * canvas.recenter(); // Re-center the canvas on the currently controlled Token.
 * ```
 */
class Canvas {
  constructor() {

    /**
     * An Array of pending canvas operations which should trigger on the next re-paint
     * @type {object[]}
     */
    this.pendingOperations = [];

    /**
     * A perception manager interface for batching lighting, sight, and sound updates
     * @type {PerceptionManager}
     */
    this.perception = new PerceptionManager();

    /**
     * A flag to indicate whether a new Scene is currently being drawn.
     * @type {boolean}
     */
    this.loading = false;

    /**
     * A promise that resolves when the canvas is first initialized and ready.
     * @type {Promise<void>|null}
     */
    this.initializing = null;

    /**
     * Track the last automatic pan time to throttle
     * @type {number}
     * @private
     */
    this._panTime = 0;

    /**
     * A Set of unique pending operation names to ensure operations are only performed once
     * @type {Set<string>}
     */
    this._pendingOperationNames = new Set();

    // Define an immutable object for the canvas dimensions
    Object.defineProperty(this, "dimensions", {value: {}, writable: false});
  }

  /**
   * An set of blur filter instances which are modified by the zoom level and the "soft shadows" setting
   * @type {Set<PIXI.filters>}
   */
  blurFilters = new Set();

  /**
   * A reference to the MouseInteractionManager that is currently controlling pointer-based interaction, or null.
   * @type {MouseInteractionManager|null}
   */
  currentMouseManager = null;

  /**
   * The current pixel dimensions of the displayed Scene, or null if the Canvas is blank.
   * @type {SceneDimensions}
   */
  dimensions;

  /**
   * Record framerate performance data.
   * @type {{average: number, values: number[], element: HTMLElement, render: number}}
   */
  fps = {
    average: 0,
    values: [],
    render: 0,
    element: document.getElementById("fps")
  };

  /**
   * The singleton interaction manager instance which handles mouse interaction on the Canvas.
   * @type {MouseInteractionManager}
   */
  mouseInteractionManager;

  /**
   * @typedef {Object} CanvasPerformanceSettings
   * @property {number} mode      The performance mode in CONST.CANVAS_PERFORMANCE_MODES
   * @property {{enabled: boolean, illumination: boolean}} blur   Blur filter configuration
   * @property {string} mipmap    Whether to use mipmaps, "ON" or "OFF"
   * @property {boolean} msaa     Whether to apply MSAA at the overall canvas level
   * @property {number} fps       Maximum framerate which should be the render target
   * @property {boolean} tokenAnimation   Whether to display token movement animation
   * @property {boolean} lightAnimation   Whether to display light source animation
   * @property {boolean} lightSoftEdges   Whether to render soft edges for light sources
   * @property {{enabled: boolean, maxSize: number, p2Steps: number, p2StepsMax: 2}} textures  Texture configuration
   */

  /**
   * Configured performance settings which affect the behavior of the Canvas and its renderer.
   * @type {CanvasPerformanceSettings}
   */
  performance;

  /**
   * The renderer screen dimensions.
   * @type {number[]}
   */
  screenDimensions = [0, 0];

  /**
   * The singleton Fog of War manager instance.
   * @type {FogManager}
   * @private
   */
  _fog = new CONFIG.Canvas.fogManager();

  /**
   * The singleton color manager instance.
   * @type {CanvasColorManager}
   */
  #colorManager = new CONFIG.Canvas.colorManager();

  /**
   * The DragDrop instance which handles interactivity resulting from DragTransfer events.
   * @type {DragDrop}
   * @private
   */
  #dragDrop;

  /**
   * An object of data which caches data which should be persisted across re-draws of the game canvas.
   * @type {{scene: string, layer: string, controlledTokens: string[], targetedTokens: string[]}}
   * @private
   */
  #reload = {};

  /* -------------------------------------------- */

  /**
   * Track the timestamp when the last mouse move event was captured
   * @type {number}
   */
  #mouseMoveTime = 0;

  /**
   * The debounce timer in milliseconds for tracking mouse movements on the Canvas.
   * @type {number}
   */
  #mouseMoveDebounceMS = 100;

  /**
   * A debounced function which tracks movements of the mouse on the game canvas.
   * @type {function(PIXI.InteractionEvent)}
   */
  #debounceMouseMove = foundry.utils.debounce(this._onMouseMove.bind(this), this.#mouseMoveDebounceMS);

  /* -------------------------------------------- */
  /*  Canvas Groups and Layers                    */
  /* -------------------------------------------- */

  /**
   * The singleton PIXI.Application instance rendered on the Canvas.
   * @type {PIXI.Application}
   */
  app;

  /**
   * The primary stage container of the PIXI.Application.
   * @type {PIXI.Container}
   */
  stage;

  /**
   * The primary Canvas group which generally contains tangible physical objects which exist within the Scene.
   * This group is a {@link CachedContainer} which is rendered to the Scene as a {@link SpriteMesh}.
   * This allows the rendered result of the Primary Canvas Group to be affected by a {@link BaseSamplerShader}.
   * @type {PrimaryCanvasGroup}
   */
  primary;

  /**
   * The effects Canvas group which modifies the result of the {@link PrimaryCanvasGroup} by adding special effects.
   * This includes lighting, weather, vision, and other visual effects which modify the appearance of the Scene.
   * @type {EffectsCanvasGroup}
   */
  effects;

  /**
   * The interface Canvas group which is rendered above other groups and contains all interactive elements.
   * The various {@link InteractionLayer} instances of the interface group provide different control sets for
   * interacting with different types of {@link Document}s which can be represented on the Canvas.
   * @type {InterfaceCanvasGroup}
   */
  interface;

  /**
   * The singleton HeadsUpDisplay container which overlays HTML rendering on top of this Canvas.
   * @type {HeadsUpDisplay}
   */
  hud;

  /* -------------------------------------------- */
  /*  Properties and Attributes
  /* -------------------------------------------- */

  /**
   * A flag for whether the game Canvas is fully initialized and ready for additional content to be drawn.
   * @type {boolean}
   */
  get initialized() {
    return this.#initialized;
  }

  /** @ignore */
  #initialized = false;

  /* -------------------------------------------- */

  /**
   * A reference to the currently displayed Scene document, or null if the Canvas is currently blank.
   * @type {Scene|null}
   */
  get scene() {
    return this.#scene;
  }

  /** @ignore */
  #scene = null;

  /* -------------------------------------------- */

  /**
   * A flag for whether the game Canvas is ready to be used. False if the canvas is not yet drawn, true otherwise.
   * @type {boolean}
   */
  get ready() {
    return this.#ready;
  }

  /** @ignore */
  #ready = false;

  /* -------------------------------------------- */

  /**
   * The fog of war bound to this canvas
   * @type {FogManager}
   */
  get fog() {
    return this._fog;
  }

  /* -------------------------------------------- */

  /**
   * The color manager class bound to this canvas
   * @type {CanvasColorManager}
   */
  get colorManager() {
    return this.#colorManager;
  }

  /* -------------------------------------------- */

  /**
   * The colors bound to this scene and handled by the color manager.
   * @type {Color}
   */
  get colors() {
    return this.#colorManager.colors;
  }

  /* -------------------------------------------- */

  /**
   * Shortcut to get the masks container from HiddenCanvasGroup.
   * @type {PIXI.Container}
   */
  get masks() {
    return this.hidden.masks;
  }

  /* -------------------------------------------- */

  /**
   * The id of the currently displayed Scene.
   * @type {string|null}
   */
  get id() {
    return this.#scene?.id || null;
  }

  /* -------------------------------------------- */

  /**
   * A mapping of named CanvasLayer classes which defines the layers which comprise the Scene.
   * @type {Object<CanvasLayer>}
   */
  static get layers() {
    return CONFIG.Canvas.layers;
  }

  /* -------------------------------------------- */

  /**
   * An Array of all CanvasLayer instances which are active on the Canvas board
   * @type {CanvasLayer[]}
   */
  get layers() {
    return Object.keys(this.constructor.layers).map(k => this[k]);
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the active Canvas Layer
   * @type {CanvasLayer}
   */
  get activeLayer() {
    for ( let name of Object.keys(this.constructor.layers) ) {
      const layer = this[name];
      if ( layer?.active ) return layer;
    }
    return null;
  }

  /* -------------------------------------------- */

  /**
   * The currently displayed darkness level, which may override the saved Scene value.
   * @type {number}
   */
  get darknessLevel() {
    return this.#colorManager.darknessLevel;
  }

  /* -------------------------------------------- */
  /*  Initialization                              */
  /* -------------------------------------------- */

  /**
   * Initialize the Canvas by creating the HTML element and PIXI application.
   * This step should only ever be performed once per client session.
   * Subsequent requests to reset the canvas should go through Canvas#draw
   */
  initialize() {
    if ( this.#initialized ) throw new Error("The Canvas is already initialized and cannot be re-initialized");

    // If the game canvas is disabled by "no canvas" mode, we don't need to initialize anything
    if ( game.settings.get("core", "noCanvas") ) return;

    // Verify that WebGL is available
    Canvas.#configureWebGL();

    // Create the HTML Canvas element
    const canvas = Canvas.#createHTMLCanvas();

    // Configure canvas settings
    const config = Canvas.#configureCanvasSettings();

    // Create the PIXI Application
    this.#createApplication(canvas, config);

    // Configure the desired performance mode
    this._configurePerformanceMode();

    // Display any performance warnings which suggest that the created Application will not function well
    this.#displayPerformanceWarnings();

    // Activate drop handling
    this.#dragDrop = new DragDrop({ callbacks: { drop: this._onDrop.bind(this) } }).bind(canvas);

    // Create heads up display
    Object.defineProperty(this, "hud", {value: new HeadsUpDisplay(), writable: false});

    // Create groups
    this.#createGroups("stage", this.stage);

    // Update state flags
    this.#scene = null;
    this.#initialized = true;
    this.#ready = false;
  }

  /* -------------------------------------------- */

  /**
   * Configure the usage of WebGL for the PIXI.Application that will be created.
   * @throws an Error if WebGL is not supported by this browser environment.
   * @private
   */
  static #configureWebGL() {
    if ( !PIXI.utils.isWebGLSupported() ) {
      const err = new Error(game.i18n.localize("ERROR.NoWebGL"));
      ui.notifications.error(err.message, {permanent: true});
      throw err;
    }
    PIXI.settings.PREFER_ENV = PIXI.ENV.WEBGL2;
  }

  /* -------------------------------------------- */

  /**
   * Create the Canvas element which will be the render target for the PIXI.Application instance.
   * Replace the template element which serves as a placeholder in the initially served HTML response.
   * @returns {HTMLCanvasElement}
   * @private
   */
  static #createHTMLCanvas() {
    const board = document.getElementById("board");
    const canvas = document.createElement("canvas");
    canvas.id = "board";
    canvas.style.display = "none";
    board.replaceWith(canvas);
    return canvas;
  }

  /* -------------------------------------------- */

  /**
   * Configure the settings used to initialize the PIXI.Application instance.
   * @returns {object}    Options passed to the PIXI.Application constructor.
   * @private
   */
  static #configureCanvasSettings() {
    const config = {
      width: window.innerWidth,
      height: window.innerHeight,
      transparent: false,
      resolution: game.settings.get("core", "pixelRatioResolutionScaling") ? window.devicePixelRatio : 1,
      autoDensity: true,
      antialias: false,  // Not needed because we use SmoothGraphics
      powerPreference: "high-performance" // Prefer high performance GPU for devices with dual graphics cards
    };
    Hooks.callAll("canvasConfig", config);
    return config;
  }

  /* -------------------------------------------- */

  /**
   * Initialize custom pixi plugins.
   */
  #initializePlugins() {
    MonochromaticSamplerShader.registerPlugin();
    OcclusionSamplerShader.registerPlugin();
  }

  /* -------------------------------------------- */

  /**
   * Create the PIXI.Application and update references to the created app and stage.
   * @param {HTMLCanvasElement} canvas    The target canvas view element
   * @param {object} config               Desired PIXI.Application configuration options
   */
  #createApplication(canvas, config) {
    this.#initializePlugins();

    // Create the Application instance
    const app = new PIXI.Application({view: canvas, ...config});
    Object.defineProperty(this, "app", {value: app, writable: false});

    // Reference the Stage
    Object.defineProperty(this, "stage", {value: this.app.stage, writable: false});
    Object.defineProperty(this.stage.constructor, "name", {value: "CanvasStage", writable: false});

    // Additional PIXI configuration : Adding custom blend modes
    this.app.renderer.plugins.interaction.moveWhenInside = true;
    for ( let [k, v] of Object.entries(BLEND_MODES) ) {
      const pos = this.app.renderer.state.blendModes.push(v) - 1;
      PIXI.BLEND_MODES[k] = pos;
      PIXI.BLEND_MODES[pos] = k;
    }
    // Fix a PIXI bug with custom blend modes
    this.#mapPremultipliedBlendModes();

    // Additional PIXI configuration : Adding the FramebufferSnapshot to the canvas
    const snapshot = new FramebufferSnapshot();
    Object.defineProperty(this, "snapshot", {value: snapshot, writable: false});
  }

  /* -------------------------------------------- */

  /**
   * Remap premultiplied blend modes/non premultiplied blend modes to fix PIXI bug with custom BM.
   */
  #mapPremultipliedBlendModes() {
    const pm = [];
    const npm = [];

    // Create the reference mapping
    for ( let i = 0; i < canvas.app.renderer.state.blendModes.length; i++ ) {
      pm[i] = i;
      npm[i] = i;
    }

    // Assign exceptions
    pm[PIXI.BLEND_MODES.NORMAL_NPM] = PIXI.BLEND_MODES.NORMAL;
    pm[PIXI.BLEND_MODES.ADD_NPM] = PIXI.BLEND_MODES.ADD;
    pm[PIXI.BLEND_MODES.SCREEN_NPM] = PIXI.BLEND_MODES.SCREEN;

    npm[PIXI.BLEND_MODES.NORMAL] = PIXI.BLEND_MODES.NORMAL_NPM;
    npm[PIXI.BLEND_MODES.ADD] = PIXI.BLEND_MODES.ADD_NPM;
    npm[PIXI.BLEND_MODES.SCREEN] = PIXI.BLEND_MODES.SCREEN_NPM;

    // Keep the reference to PIXI.utils.premultiplyBlendMode!
    // And recreate the blend modes mapping with the same object.
    PIXI.utils.premultiplyBlendMode.splice(0, PIXI.utils.premultiplyBlendMode.length);
    PIXI.utils.premultiplyBlendMode.push(npm);
    PIXI.utils.premultiplyBlendMode.push(pm);
  }

  /* -------------------------------------------- */

  /**
   * Display warnings for known performance issues which may occur due to the user's hardware or browser configuration.
   * @private
   */
  #displayPerformanceWarnings() {
    const context = this.app.renderer.context;
    const gl = context.gl;
    try {
      const rendererInfo = SupportDetails.getWebGLRendererInfo(gl);
      if ( /swiftshader/i.test(rendererInfo) ) {
        ui.notifications.warn("ERROR.NoHardwareAcceleration", {localize: true, permanent: true});
      }
    } catch(err) {
      ui.notifications.warn("ERROR.RendererNotDetected", {localize: true});
    }

    // Verify that WebGL2 is being used
    if (context.webGLVersion !== 2 ) {
      const err = new Error(game.i18n.localize("ERROR.NoWebGL2"));
      ui.notifications.warn(err.message, {permanent: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Initialize the group containers of the game Canvas.
   * @param {string} parentName
   * @param {PIXI.DisplayObject} parent
   * @private
   */
  #createGroups(parentName, parent) {
    for ( const [name, config] of Object.entries(CONFIG.Canvas.groups) ) {
      if ( config.parent !== parentName ) continue;
      const group = new config.groupClass();
      Object.defineProperty(this, name, {value: group, writable: false});    // Reference on the Canvas
      Object.defineProperty(parent, name, {value: group, writable: false});  // Reference on the parent
      parent.addChild(group);
      this.#createGroups(name, group);                                       // Recursive
    }
  }

  /* -------------------------------------------- */

  /**
   * TODO: Add a quality parameter
   * Compute the blur parameters according to grid size and performance mode.
   * @private
   */
  _initializeBlur() {
    // Discard shared filters
    this.blurFilters.clear();

    // Compute base values from grid size
    const blurStrength = this.grid.size / 25;
    const blurFactor = this.grid.size / 100;

    // Lower stress for MEDIUM performance mode
    const level =
      Math.max(0, this.performance.mode - (this.performance.mode < CONST.CANVAS_PERFORMANCE_MODES.HIGH ? 1 : 0));
    const maxKernels = Math.max(5 + (level * 2), 5);
    const maxPass = 2 + (level * 2);

    // Compute blur parameters
    this.blur = new Proxy(Object.seal({
      enabled: this.performance.mode > CONST.CANVAS_PERFORMANCE_MODES.LOW,
      strength: blurStrength,
      passes: Math.clamped(level + Math.floor(blurFactor), 2, maxPass),
      kernels: Math.clamped((2 * Math.ceil((1 + (2 * level) + Math.floor(blurFactor)) / 2)) - 1, 5, maxKernels)
    }), {
      set(obj, prop, value) {
        if ( prop !== "strength" ) throw new Error(`canvas.blur.${prop} is immutable`);
        const v = Reflect.set(obj, prop, value);
        canvas.updateBlur();
        return v;
      }
    });

    // Immediately update blur
    this.updateBlur();
  }

  /* -------------------------------------------- */

  /**
   * Configure performance settings for hte canvas application based on the selected performance mode.
   * @returns {CanvasPerformanceSettings}
   * @internal
   */
  _configurePerformanceMode() {
    const modes = CONST.CANVAS_PERFORMANCE_MODES;

    // Get client settings
    let mode = game.settings.get("core", "performanceMode");
    const fps = game.settings.get("core", "maxFPS");
    const mip = game.settings.get("core", "mipmap");

    // Construct performance settings object
    const settings = {
      mode: mode,
      mipmap: mip ? "ON" : "OFF",
      msaa: false,
      fps: Math.clamped(fps, 0, 60),
      tokenAnimation: true,
      lightAnimation: true,
      lightSoftEdges: false,
    };

    // Deprecation shim for blur
    settings.blur = new Proxy({
      enabled: false,
      illumination: false
    }, {
      get(obj, prop, receiver) {
        foundry.utils.logCompatibilityWarning("canvas.performance.blur is deprecated and replaced by canvas.blur", {
          since: 10,
          until: 11
        });
        return Reflect.get(obj, prop, receiver);
      }
    });

    // Deprecation shim for textures
    const gl = this.app.renderer.context.gl;
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    // Configure default performance mode if one is not set
    if ( !Number.isFinite(mode) || (mode === -1) ) {
      if ( maxTextureSize <= Math.pow(2, 12) ) mode = CONST.CANVAS_PERFORMANCE_MODES.LOW;
      else if ( maxTextureSize <= Math.pow(2, 13) ) mode = CONST.CANVAS_PERFORMANCE_MODES.MED;
      else if ( maxTextureSize <= Math.pow(2, 14) ) mode = CONST.CANVAS_PERFORMANCE_MODES.HIGH;
      game.settings.storage.get("client").setItem("core.performanceMode", String(mode));
    }

    settings.textures = new Proxy({
      enabled: false,
      maxSize: maxTextureSize,
      p2Steps: 2,
      p2StepsMax: 3
    }, {
      get(obj, prop, receiver) {
        foundry.utils.logCompatibilityWarning("canvas.performance.textures is deprecated and will be removed in V11", {
          since: 10,
          until: 11
        });
        return Reflect.get(obj, prop, receiver);
      }
    });

    // Low settings
    if ( mode >= modes.LOW ) {
      settings.tokenAnimation = false;
      settings.lightAnimation = false;
    }

    // Medium settings
    if ( mode >= modes.MED ) {
      settings.blur.enabled = true;
      settings.textures.enabled = true;
      settings.textures.p2Steps = 3;
      settings.lightSoftEdges = true;
    }

    // High settings
    if ( mode >= modes.HIGH ) {
      settings.blur.illumination = true;
      settings.textures.p2Steps = 2;
    }

    // Max settings
    if ( mode === modes.MAX ) {
      settings.textures.p2Steps = 1;
      if ( settings.fps === 60 ) settings.fps = 0;
    }

    // Configure performance settings
    PIXI.settings.MIPMAP_TEXTURES = PIXI.MIPMAP_MODES[settings.mipmap];
    PIXI.settings.FILTER_RESOLUTION = canvas.app.renderer.resolution;
    this.app.ticker.maxFPS = PIXI.Ticker.shared.maxFPS = PIXI.Ticker.system.maxFPS = settings.fps;
    return this.performance = settings;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * Draw the game canvas.
   * @param {Scene} [scene]         A specific Scene document to render on the Canvas
   * @returns {Promise<Canvas>}     A Promise which resolves once the Canvas is fully drawn
   */
  async draw(scene) {

    // If the canvas had not yet been initialized, we have done something out of order
    if ( !this.#initialized ) {
      throw new Error("You may not call Canvas#draw before Canvas#initialize");
    }

    // Identify the Scene which should be drawn
    if ( scene === undefined ) scene = game.scenes.current;
    if ( !((scene instanceof Scene) || (scene === null)) ) {
      throw new Error("You must provide a Scene Document to draw the Canvas.");
    }

    // Assign status flags
    const wasReady = this.#ready;
    this.#ready = false;
    this.stage.visible = false;
    this.loading = true;

    // Tear down any existing scene
    if ( wasReady ) {
      try {
        await this.tearDown();
      } catch(err) {
        err.message = `Encountered an error while tearing down the previous scene: ${err.message}`;
        logger.warn(err);
      }
    }

    // Record Scene changes
    if ( this.#scene && (scene !== this.#scene) ) {
      this.#scene._view = false;
      if ( game.user.viewedScene === this.#scene.id ) game.user.viewedScene = null;
    }
    this.#scene = scene;
    if ( this.#scene === null ) return this.#drawBlank(); // Draw a blank canvas

    // Updating color manager for this scene
    this.colorManager.initialize();

    // Configure Scene dimensions
    foundry.utils.mergeObject(this.dimensions, scene.getDimensions());
    canvas.app.view.style.display = "block";
    document.documentElement.style.setProperty("--gridSize", `${this.dimensions.size}px`);

    // Call Canvas initialization hooks
    console.log(`${vtt} | Drawing game canvas for scene ${this.#scene.name}`);
    Hooks.callAll("canvasInit", this);

    // Configure attributes of the Stage
    this.stage.position.set(window.innerWidth / 2, window.innerHeight / 2);
    this.stage.hitArea = new PIXI.Rectangle(0, 0, this.dimensions.width, this.dimensions.height);
    this.stage.interactive = this.stage.sortableChildren = true;

    // Initialize the camera view position (although the canvas is hidden)
    this.initializeCanvasPosition();

    // Initialize blur parameters
    this._initializeBlur();

    // Load required textures
    try {
      await TextureLoader.loadSceneTextures(this.#scene);

      // Initialize the Fog Manager
      await this.fog.initialize();

      // Draw canvas groups
      try {
        for ( const name of Object.keys(CONFIG.Canvas.groups) ) {
          const group = this[name];
          await group.draw();
        }
      } catch(err) {
        Hooks.onError("Canvas#draw", err, {
          msg: `Canvas drawing failed: ${err.message}`,
          log: "error",
          notify: "error"
        });
      }

      // Mask primary and effects layers by the overall canvas
      const cr = canvas.dimensions.rect;
      this.masks.canvas.clear().beginFill(0xFFFFFF, 1.0).drawRect(cr.x, cr.y, cr.width, cr.height).endFill();
      this.primary.sprite.mask = this.primary.mask = this.effects.mask = this.interface.grid.mask = this.masks.canvas;

      // Initialize starting conditions
      await this.#initialize();

      this.#scene._view = true;
      this.stage.visible = true;
      Hooks.call("canvasReady", this);
    }

    // Record that loading was complete and return
    finally {
      this.loading = false;
    }
    return this;
  }

  /* -------------------------------------------- */

  /**
   * When re-drawing the canvas, first tear down or discontinue some existing processes
   * @returns {Promise<void>}
   */
  async tearDown() {
    this.stage.visible = false;

    // Track current data which should be restored on draw
    this.#reload = {
      scene: this.#scene.id,
      layer: this.activeLayer?.options.name,
      controlledTokens: this.tokens.controlled.map(t => t.id),
      targetedTokens: Array.from(game.user.targets).map(t => t.id)
    };

    // Deactivate perception refresh
    this.perception.deactivate();

    // Cancel framerate tracking
    this.deactivateFPSMeter();

    // Deactivate every layer before teardown
    for ( let l of this.layers.reverse() ) {
      if ( l instanceof InteractionLayer ) l.deactivate();
    }

    // Call tear-down hooks
    Hooks.callAll("canvasTearDown", this);

    // Tear down groups
    for ( const name of Object.keys(CONFIG.Canvas.groups).reverse() ) {
      const group = this[name];
      await group.tearDown();
    }

    // Tear down every layer
    await this.effects.tearDown();
    for ( let l of this.layers.reverse() ) {
      await l.tearDown();
    }

    // Discard shared filters
    this.blurFilters.clear();
  }

  /* -------------------------------------------- */

  /**
   * A special workflow to perform when rendering a blank Canvas with no active Scene.
   * @returns {Canvas}
   */
  #drawBlank() {
    console.log(`${vtt} | Skipping game canvas - no active scene.`);
    canvas.app.view.style.display = "none";
    ui.controls.render();
    this.loading = this.#ready = false;
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Get the value of a GL parameter
   * @param {string} parameter  The GL parameter to retrieve
   * @returns {*}               The GL parameter value
   */
  getGLParameter(parameter) {
    const gl = this.app.renderer.context.gl;
    return gl.getParameter(gl[parameter]);
  }

  /* -------------------------------------------- */

  /**
   * Once the canvas is drawn, initialize control, visibility, and audio states
   * @returns {Promise<void>}
   * @private
   */
  async #initialize() {
    this.#ready = true;

    // Clear the set of targeted Tokens for the current user
    game.user.targets.clear();

    // Render the HUD layer
    this.hud.render(true);

    // Compute Wall intersections and identify interior walls
    canvas.walls.initialize();

    // Initialize canvas conditions
    this.#initializeCanvasLayer();
    this.#initializeTokenControl();
    this._onResize();
    this.#reload = {};

    // Activate Perception Manager refresh
    this.perception.activate();
    this.perception.initialize();

    // Activate user interaction
    this.#addListeners();

    // Broadcast user presence in the Scene
    game.user.broadcastActivity({sceneId: this.#scene.id});
  }

  /* -------------------------------------------- */

  /**
   * Initialize the starting view of the canvas stage
   * If we are re-drawing a scene which was previously rendered, restore the prior view position
   * Otherwise set the view to the top-left corner of the scene at standard scale
   */
  initializeCanvasPosition() {

    // If we are re-drawing a Scene that was already visited, use it's cached view position
    let position = this.#scene._viewPosition;

    // Use a saved position, or determine the default view based on the scene size
    if ( foundry.utils.isEmpty(position) ) {
      let {x, y, scale} = this.#scene.initial;
      const r = this.dimensions.rect;
      x ??= (r.right / 2);
      y ??= (r.bottom / 2);
      scale ??= Math.clamped(Math.min(window.innerHeight / r.height, window.innerWidth / r.width), 0.25, 3);
      position = {x, y, scale};
    }

    // Pan to the initial view
    this.pan(position);
  }

  /* -------------------------------------------- */

  /**
   * Initialize a CanvasLayer in the activation state
   * @private
   */
  #initializeCanvasLayer() {
    const layer = this[this.#reload.layer] ?? this.tokens;
    layer.activate();
  }

  /* -------------------------------------------- */

  /**
   * Initialize a token or set of tokens which should be controlled.
   * Restore controlled and targeted tokens from before the re-draw.
   * @private
   */
  #initializeTokenControl() {
    let panToken = null;
    let controlledTokens = [];
    let targetedTokens = [];

    // Initial tokens based on reload data
    let isReload = this.#reload.scene === this.#scene.id;
    if ( isReload ) {
      controlledTokens = this.#reload.controlledTokens.map(id => canvas.tokens.get(id));
      targetedTokens = this.#reload.targetedTokens.map(id => canvas.tokens.get(id));
    }

    // Initialize tokens based on player character
    else if ( !game.user.isGM ) {
      controlledTokens = game.user.character?.getActiveTokens() || [];
      if (!controlledTokens.length) {
        controlledTokens = canvas.tokens.placeables.filter(t => t.actor?.testUserPermission(game.user, "OWNER"));
      }
      if (!controlledTokens.length) {
        const observed = canvas.tokens.placeables.filter(t => t.actor?.testUserPermission(game.user, "OBSERVER"));
        panToken = observed.shift() || null;
      }
    }

    // Initialize Token Control
    for ( let token of controlledTokens ) {
      if ( !panToken ) panToken = token;
      token?.control({releaseOthers: false});
    }

    // Display a warning if the player has no vision tokens in a visibility-restricted scene
    if ( !game.user.isGM && this.#scene.tokenVision && !controlledTokens.some(t => t.document.sight.enabled) ) {
      ui.notifications.warn("TOKEN.WarningNoVision", {localize: true});
    }

    // Initialize Token targets
    for ( const token of targetedTokens ) {
      token?.setTarget(true, {releaseOthers: false, groupSelection: true});
    }

    // Pan camera to controlled token
    if ( panToken && !isReload ) this.pan({x: panToken.center.x, y: panToken.center.y, duration: 250});
  }

  /* -------------------------------------------- */

  /**
   * Given an embedded object name, get the canvas layer for that object
   * @param {string} embeddedName
   * @returns {PlaceablesLayer|null}
   */
  getLayerByEmbeddedName(embeddedName) {
    return {
      AmbientLight: this.lighting,
      AmbientSound: this.sounds,
      Drawing: this.drawings,
      Note: this.notes,
      MeasuredTemplate: this.templates,
      Tile: this.tiles,
      Token: this.tokens,
      Wall: this.walls
    }[embeddedName] || null;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Activate framerate tracking by adding an HTML element to the display and refreshing it every frame.
   */
  activateFPSMeter() {
    this.deactivateFPSMeter();
    if ( !this.#ready ) return;
    // Show element
    this.fps.element.style.display = "block";
    // Activate ticker
    this.app.ticker.add(this.#measureFPS, this, PIXI.UPDATE_PRIORITY.LOW);
  }

  /* -------------------------------------------- */

  /**
   * Deactivate framerate tracking by canceling ticker updates and removing the HTML element.
   */
  deactivateFPSMeter() {
    // Deactivate ticker
    this.app.ticker.remove(this.#measureFPS, this);
    // Hide element
    this.fps.element.style.display = "none";
  }

  /* -------------------------------------------- */

  /**
   * Measure average framerate per second over the past 30 frames
   * @private
   */
  #measureFPS() {
    const lastTime = this.app.ticker.lastTime;

    // Push fps values every frame
    this.fps.values.push(1000 / this.app.ticker.elapsedMS);
    if ( this.fps.values.length > 60 ) this.fps.values.shift();

    // Do some computations and rendering occasionally
    if ( (lastTime - this.fps.render) < 250 ) return;
    if ( !this.fps.element ) return;

    // Compute average fps
    const total = this.fps.values.reduce((fps, total) => total + fps, 0);
    this.fps.average = (total / this.fps.values.length);

    // Render it
    this.fps.element.innerHTML = `<label>FPS:</label> <span>${this.fps.average.toFixed(2)}</span>`;
    this.fps.render = lastTime;
  }

  /* -------------------------------------------- */

  /**
   * @typedef {Object} CanvasViewPosition
   * @property {number|null} x      The x-coordinate which becomes stage.pivot.x
   * @property {number|null} y      The y-coordinate which becomes stage.pivot.y
   * @property {number|null} scale  The zoom level up to CONFIG.Canvas.maxZoom which becomes stage.scale.x and y
   */

  /**
   * Pan the canvas to a certain {x,y} coordinate and a certain zoom level
   * @param {CanvasViewPosition} position     The canvas position to pan to
   */
  pan({x=null, y=null, scale=null}={}) {

    // Constrain the resulting canvas view
    const constrained = this.#constrainView({x, y, scale});
    const scaleChange = constrained.scale !== this.stage.scale.x;

    // Set the pivot point
    this.stage.pivot.set(constrained.x, constrained.y);

    // Set the zoom level
    if ( scaleChange ) {
      this.stage.scale.set(constrained.scale, constrained.scale);
      this.updateBlur();
    }

    // Update the scene tracked position
    canvas.scene._viewPosition = constrained;

    // Call hooks
    Hooks.callAll("canvasPan", this, constrained);

    // Update controls
    this.controls._onCanvasPan();

    // Align the HUD
    this.hud.align();
  }

  /* -------------------------------------------- */


  /**
   * Animate panning the canvas to a certain destination coordinate and zoom scale
   * Customize the animation speed with additional options
   * Returns a Promise which is resolved once the animation has completed
   *
   * @param {CanvasViewPosition} view    The desired view parameters
   * @param {number} [view.duration=250] The total duration of the animation in milliseconds; used if speed is not set
   * @param {number} [view.speed]        The speed of animation in pixels per second; overrides duration if set
   * @returns {Promise}           A Promise which resolves once the animation has been completed
   */
  async animatePan({x, y, scale, duration=250, speed}={}) {

    // Determine the animation duration to reach the target
    if ( speed ) {
      let ray = new Ray(this.stage.pivot, {x, y});
      duration = Math.round(ray.distance * 1000 / speed);
    }

    // Constrain the resulting dimensions and construct animation attributes
    const constrained = this.#constrainView({x, y, scale});
    const attributes = [
      { parent: this.stage.pivot, attribute: "x", to: constrained.x },
      { parent: this.stage.pivot, attribute: "y", to: constrained.y },
      { parent: this.stage.scale, attribute: "x", to: constrained.scale },
      { parent: this.stage.scale, attribute: "y", to: constrained.scale }
    ].filter(a => a.to !== undefined);

    // Trigger the animation function
    const animation = await CanvasAnimation.animate(attributes, {
      name: "canvas.animatePan",
      duration: duration,
      easing: CanvasAnimation.easeInOutCosine,
      ontick: () => {
        this.hud.align();
        const stage = this.stage;
        Hooks.callAll("canvasPan", this, {x: stage.pivot.x, y: stage.pivot.y, scale: stage.scale.x});
      }
    });

    // Record final values
    this.updateBlur();
    canvas.scene._viewPosition = constrained;
    return animation;
  }

  /* -------------------------------------------- */

  /**
   * Recenter the canvas with a pan animation that ends in the center of the canvas rectangle.
   * @param {CanvasViewPosition} initial    A desired initial position from which to begin the animation
   * @returns {Promise<void>}               A Promise which resolves once the animation has been completed
   */
  async recenter(initial) {
    if ( initial ) this.pan(initial);
    const r = this.dimensions.sceneRect;
    return this.animatePan({
      x: r.x + (window.innerWidth / 2),
      y: r.y + (window.innerHeight / 2),
      duration: 250
    });
  }

  /* -------------------------------------------- */

  /**
   * Highlight objects on any layers which are visible
   * @param {boolean} active
   */
  highlightObjects(active) {
    if ( !this.#ready ) return;
    for ( let layer of this.layers ) {
      if ( !layer.objects || !layer.interactiveChildren ) continue;
      layer._highlight = active;
      for ( let o of layer.placeables ) {
        if ( (!active && o._isHoverIn) || !o.visible || !o.can(game.user, "hover") ) continue;
        o.hover = active;
        o.refresh();
      }
    }
    /** @see hookEvents.highlightObjects */
    Hooks.callAll("highlightObjects", active);
  }

  /* -------------------------------------------- */

  /**
   * Displays a Ping both locally and on other connected client, following these rules:
   * 1) Displays on the current canvas Scene
   * 2) If ALT is held, becomes an ALERT ping
   * 3) Else if the user is GM and SHIFT is held, becomes a PULL ping
   * 4) Else is a PULSE ping
   * @param {Point} origin                  Point to display Ping at
   * @param {PingOptions} [options]         Additional options to configure how the ping is drawn.
   * @returns {Promise<boolean>}
   */
  async ping(origin, options) {
    // Configure the ping to be dispatched
    const types = CONFIG.Canvas.pings.types;
    const isPull = game.user.isGM && game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT);
    const isAlert = game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.ALT);
    let style = types.PULSE;
    if ( isPull ) style = types.PULL;
    else if ( isAlert ) style = types.ALERT;
    let ping = {scene: this.scene?.id, pull: isPull, style, zoom: canvas.stage.scale.x};
    ping = foundry.utils.mergeObject(ping, options);

    // Broadcast the ping to other connected clients
    /** @type ActivityData */
    const activity = {cursor: origin, ping};
    game.user.broadcastActivity(activity);

    // Display the ping locally
    return this.controls.handlePing(game.user, origin, ping);
  }

  /* -------------------------------------------- */

  /**
   * Get the constrained zoom scale parameter which is allowed by the maxZoom parameter
   * @param {CanvasViewPosition} position   The unconstrained position
   * @returns {CanvasViewPosition}          The constrained position
   * @private
   */
  #constrainView({x, y, scale}) {
    const d = canvas.dimensions;

    // Constrain the maximum zoom level
    if ( Number.isNumeric(scale) && (scale !== this.stage.scale.x) ) {
      const max = CONFIG.Canvas.maxZoom;
      const ratio = Math.max(d.width / window.innerWidth, d.height / window.innerHeight, max);
      scale = Math.clamped(scale, 1 / ratio, max);
    } else {
      scale = this.stage.scale.x;
    }

    // Constrain the pivot point using the new scale
    if ( Number.isNumeric(x) && x !== this.stage.pivot.x ) {
      const padw = 0.4 * (window.innerWidth / scale);
      x = Math.clamped(x, -padw, d.width + padw);
    }
    else x = this.stage.pivot.x;
    if ( Number.isNumeric(y) && y !== this.stage.pivot.y ) {
      const padh = 0.4 * (window.innerHeight / scale);
      y = Math.clamped(y, -padh, d.height + padh);
    }
    else y = this.stage.pivot.y;

    // Return the constrained view dimensions
    return {x, y, scale};
  }

  /* -------------------------------------------- */

  /**
   * Create a BlurFilter instance and register it to the array for updates when the zoom level changes.
   * @param {number} blurStrength         The desired blur strength to use for this filter
   * @returns {PIXI.filters.BlurFilter}
   */
  createBlurFilter(blurStrength=CONFIG.Canvas.blurStrength) {
    const f = new PIXI.filters.BlurFilter(blurStrength);
    f.blur = this.blur.strength;
    this.blurFilters.add(f);
    return f;
  }

  /* -------------------------------------------- */

  /**
   * Add a filter to the blur filter list. The filter must have the blur property
   * @param {PIXI.filters.BlurFilter} filter    The Filter instance to add
   * @returns {PIXI.filters.BlurFilter}         The added filter for method chaining
   */
  addBlurFilter(filter) {
    if ( filter.blur === undefined ) return;
    filter.blur = this.blur.strength * this.stage.scale.x;
    this.blurFilters.add(filter); // Save initial blur of the filter in the set
    return filter;
  }

  /* -------------------------------------------- */

  /**
   * Update the blur strength depending on the scale of the canvas stage.
   * This number is zero if "soft shadows" are disabled
   * @param {number} [strength]      Optional blur strength to apply
   * @private
   */
  updateBlur(strength) {
    for ( const filter of this.blurFilters ) {
      filter.blur = (strength ?? this.blur.strength) * this.stage.scale.x;
    }
  }

  /* -------------------------------------------- */

  /**
   * Convert canvas co-ordinates to the client's viewport.
   * @param {Point} origin  The canvas coordinates.
   * @returns {Point}       The corresponding co-ordinates relative to the client's viewport.
   */
  clientCoordinatesFromCanvas(origin) {
    const t = this.stage.worldTransform;
    return {
      x: (origin.x * this.stage.scale.x) + t.tx,
      y: (origin.y * this.stage.scale.y) + t.ty
    };
  }

  /* -------------------------------------------- */

  /**
   * Convert client viewport co-ordinates to canvas co-ordinates.
   * @param {Point} origin  The client coordinates.
   * @returns {Point}       The corresponding canvas co-ordinates.
   */
  canvasCoordinatesFromClient(origin) {
    const t = this.stage.worldTransform;
    return {
      x: (origin.x - t.tx) / this.stage.scale.x,
      y: (origin.y - t.ty) / this.stage.scale.y
    };
  }

  /* -------------------------------------------- */

  /**
   * Determine whether given canvas co-ordinates are off-screen.
   * @param {Point} position  The canvas co-ordinates.
   * @returns {boolean}       Is the coordinate outside the screen bounds?
   */
  isOffscreen(position) {
    const { clientWidth, clientHeight } = document.documentElement;
    const { x, y } = this.clientCoordinatesFromCanvas(position);
    return (x < 0) || (y < 0) || (x >= clientWidth) || (y >= clientHeight);
  }


  /* -------------------------------------------- */

  /**
   * Remove all children of the display object and call one cleaning method:
   * clean first, then tearDown, and destroy if no cleaning method is found.
   * @param {PIXI.DisplayObject} displayObject  The display object to clean.
   * @param {boolean} destroy                   If textures should be destroyed.
   */
  static clearContainer(displayObject, destroy=true) {
    const children = displayObject.removeChildren();
    for ( const child of children ) {
      if ( child.clear ) child.clear(destroy);
      else if ( child.tearDown ) child.tearDown();
      else child.destroy(destroy);
    }
  }

  /* -------------------------------------------- */
  /* Event Handlers
  /* -------------------------------------------- */

  /**
   * Attach event listeners to the game canvas to handle click and interaction events
   * @private
   */
  #addListeners() {

    // Remove all existing listeners
    this.stage.removeAllListeners();

    // Define callback functions for mouse interaction events
    const callbacks = {
      clickLeft: this._onClickLeft.bind(this),
      clickLeft2: this._onClickLeft2.bind(this),
      clickRight: this._onClickRight.bind(this),
      clickRight2: this._onClickRight2.bind(this),
      dragLeftStart: this._onDragLeftStart.bind(this),
      dragLeftMove: this._onDragLeftMove.bind(this),
      dragLeftDrop: this._onDragLeftDrop.bind(this),
      dragLeftCancel: this._onDragLeftCancel.bind(this),
      dragRightStart: null,
      dragRightMove: this._onDragRightMove.bind(this),
      dragRightDrop: this._onDragRightDrop.bind(this),
      dragRightCancel: null,
      longPress: this._onLongPress.bind(this)
    };

    // Create and activate the interaction manager
    const permissions = { clickRight2: false };
    const mgr = new MouseInteractionManager(this.stage, this.stage, permissions, callbacks);
    this.mouseInteractionManager = mgr.activate();

    // Debug average FPS
    if ( game.settings.get("core", "fpsMeter") ) this.activateFPSMeter();

    // Add a listener for cursor movement
    this.stage.on("mousemove", event => {
      const now = event.data.now = Date.now();
      const dt = now - this.#mouseMoveTime;
      if ( dt > this.#mouseMoveDebounceMS ) return this._onMouseMove(event);  // Handle immediately
      else return this.#debounceMouseMove(event);  // Handle on debounced delay
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse movement on the game canvas.
   * This handler fires on both a throttle and a debounce, ensuring that the final update is always recorded.
   * @param {PIXI.InteractionEvent} event
   * @private
   */
  _onMouseMove(event) {
    this.#mouseMoveTime = event.data.now;
    canvas.controls._onMouseMove(event);
    canvas.sounds._onMouseMove(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle left mouse-click events occurring on the Canvas.
   * @see {MouseInteractionManager#_handleClickLeft}
   * @param {PIXI.InteractionEvent} event
   * @private
   */
  _onClickLeft(event) {
    const layer = this.activeLayer;
    if ( layer instanceof InteractionLayer ) layer._onClickLeft(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle double left-click events occurring on the Canvas.
   * @see {MouseInteractionManager#_handleClickLeft2}
   * @param {PIXI.InteractionEvent} event
   */
  _onClickLeft2(event) {
    const layer = this.activeLayer;
    if ( layer instanceof InteractionLayer ) layer._onClickLeft2(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle long press events occurring on the Canvas.
   * @see {MouseInteractionManager#_handleLongPress}
   * @param {PIXI.InteractionEvent} event   The triggering canvas interaction event.
   * @param {PIXI.Point}            origin  The local canvas coordinates of the mousepress.
   * @private
   */
  _onLongPress(event, origin) {
    canvas.controls._onLongPress(event, origin);
  }

  /* -------------------------------------------- */

  /**
   * Handle the beginning of a left-mouse drag workflow on the Canvas stage or its active Layer.
   * @see {MouseInteractionManager#_handleDragStart}
   * @param {PIXI.InteractionEvent} event
   * @internal
   */
  _onDragLeftStart(event) {

    // Extract event data
    const layer = this.activeLayer;
    const isRuler = game.activeTool === "ruler";
    const isCtrlRuler = game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL)
      && (layer instanceof TokenLayer);

    // Begin ruler measurement
    if ( isRuler || isCtrlRuler ) return this.controls.ruler._onDragStart(event);

    // Activate select rectangle
    const isSelect = ["select", "target"].includes(game.activeTool);
    if ( isSelect ) {
      // The event object appears to be reused, so delete any coords from a previous selection.
      delete event.data.coords;
      canvas.controls.select.active = true;
      return;
    }

    // Dispatch the event to the active layer
    if ( layer instanceof InteractionLayer ) layer._onDragLeftStart(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse movement events occurring on the Canvas.
   * @see {MouseInteractionManager#_handleDragMove}
   * @param {PIXI.InteractionEvent} event
   * @internal
   */
  _onDragLeftMove(event) {
    const layer = this.activeLayer;

    // Pan the canvas if the drag event approaches the edge
    this._onDragCanvasPan(event.data.originalEvent);

    // Continue a Ruler measurement
    const ruler = this.controls.ruler;
    if ( ruler._state > 0 ) return ruler._onMouseMove(event);

    // Continue a select event
    const isSelect = ["select", "target"].includes(game.activeTool);
    if ( isSelect && canvas.controls.select.active ) return this._onDragSelect(event);

    // Dispatch the event to the active layer
    if ( layer instanceof InteractionLayer ) layer._onDragLeftMove(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle the conclusion of a left-mouse drag workflow when the mouse button is released.
   * @see {MouseInteractionManager#_handleDragDrop}
   * @param {PIXI.InteractionEvent} event
   * @internal
   */
  _onDragLeftDrop(event) {

    // Extract event data
    const {coords, originalEvent} = event.data;
    const tool = game.activeTool;
    const layer = canvas.activeLayer;

    // Conclude a measurement event if we aren't holding the CTRL key
    const ruler = canvas.controls.ruler;
    if ( ruler.active ) {
      if ( game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL) ) originalEvent.preventDefault();
      return ruler._onMouseUp(event);
    }

    // Conclude a select event
    const isSelect = ["select", "target"].includes(tool);
    if ( isSelect && canvas.controls.select.active ) {
      canvas.controls.select.clear();
      canvas.controls.select.active = false;
      const releaseOthers = !originalEvent.shiftKey;
      if ( !coords ) return;
      if ( tool === "select" ) return layer.selectObjects(coords, {releaseOthers});
      if ( tool === "target" ) return layer.targetObjects(coords, {releaseOthers});
    }

    // Dispatch the event to the active layer
    if ( layer instanceof InteractionLayer ) layer._onDragLeftDrop(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle the cancellation of a left-mouse drag workflow
   * @see {MouseInteractionManager#_handleDragCancel}
   * @param {PointerEvent} event
   * @internal
   */
  _onDragLeftCancel(event) {
    const layer = canvas.activeLayer;
    const tool = game.activeTool;

    // Don't cancel ruler measurement
    const ruler = canvas.controls.ruler;
    if ( ruler.active ) return event.preventDefault();

    // Clear selection
    const isSelect = ["select", "target"].includes(tool);
    if ( isSelect ) return canvas.controls.select.clear();

    // Dispatch the event to the active layer
    if ( layer instanceof InteractionLayer ) layer._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle right mouse-click events occurring on the Canvas.
   * @see {MouseInteractionManager#_handleClickRight}
   * @param {PIXI.InteractionEvent} event
   * @private
   */
  _onClickRight(event) {
    const ruler = canvas.controls.ruler;
    if ( ruler.active ) return ruler._onClickRight(event);

    // Dispatch to the active layer
    const layer = this.activeLayer;
    if ( layer instanceof InteractionLayer ) layer._onClickRight(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle double right-click events occurring on the Canvas.
   * @see {MouseInteractionManager#_handleClickRight}
   * @param {PIXI.InteractionEvent} event
   * @private
   */
  _onClickRight2(event) {
    const layer = this.activeLayer;
    if ( layer instanceof InteractionLayer ) layer._onClickRight2(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle right-mouse drag events occurring on the Canvas.
   * @see {MouseInteractionManager#_handleDragMove}
   * @param {PIXI.InteractionEvent} event
   * @private
   */
  _onDragRightMove(event) {

    // Extract event data
    const DRAG_SPEED_MODIFIER = 0.8;
    const {cursorTime, origin, destination} = event.data;
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;

    // Update the client's cursor position every 100ms
    const now = Date.now();
    if ( (now - (cursorTime || 0)) > 100 ) {
      if ( this.controls ) this.controls._onMouseMove(event, destination);
      event.data.cursorTime = now;
    }

    // Pan the canvas
    this.pan({
      x: canvas.stage.pivot.x - (dx * DRAG_SPEED_MODIFIER),
      y: canvas.stage.pivot.y - (dy * DRAG_SPEED_MODIFIER)
    });

    // Reset Token tab cycling
    this.tokens._tabIndex = null;
  }


  /* -------------------------------------------- */

  /**
   * Handle the conclusion of a right-mouse drag workflow the Canvas stage.
   * @see {MouseInteractionManager#_handleDragDrop}
   * @param {PIXI.InteractionEvent} event
   * @private
   */
  _onDragRightDrop(event) {}

  /* -------------------------------------------- */

  /**
   * Determine selection coordinate rectangle during a mouse-drag workflow
   * @param {PIXI.InteractionEvent} event
   * @private
   */
  _onDragSelect(event) {

    // Extract event data
    const {origin, destination} = event.data;

    // Determine rectangle coordinates
    let coords = {
      x: Math.min(origin.x, destination.x),
      y: Math.min(origin.y, destination.y),
      width: Math.abs(destination.x - origin.x),
      height: Math.abs(destination.y - origin.y)
    };

    // Draw the select rectangle
    canvas.controls.drawSelect(coords);
    event.data.coords = coords;
  }

  /* -------------------------------------------- */

  /**
   * Pan the canvas view when the cursor position gets close to the edge of the frame
   * @param {MouseEvent} event    The originating mouse movement event
   */
  _onDragCanvasPan(event) {

    // Throttle panning by 200ms
    const now = Date.now();
    if ( now - (this._panTime || 0) <= 200 ) return;
    this._panTime = now;

    // Shift by 3 grid spaces at a time
    const {x, y} = event;
    const pad = 50;
    const shift = (this.dimensions.size * 3) / this.stage.scale.x;

    // Shift horizontally
    let dx = 0;
    if ( x < pad ) dx = -shift;
    else if ( x > window.innerWidth - pad ) dx = shift;

    // Shift vertically
    let dy = 0;
    if ( y < pad ) dy = -shift;
    else if ( y > window.innerHeight - pad ) dy = shift;

    // Enact panning
    if ( dx || dy ) return this.animatePan({x: this.stage.pivot.x + dx, y: this.stage.pivot.y + dy, duration: 200});
  }

  /* -------------------------------------------- */
  /*  Other Event Handlers                        */
  /* -------------------------------------------- */

  /**
   * Handle window resizing with the dimensions of the window viewport change
   * @param {Event} event     The Window resize event
   * @private
   */
  _onResize(event=null) {
    if ( !this.#ready ) return false;

    // Resize the renderer to the current screen dimensions
    this.app.renderer.resize(window.innerWidth, window.innerHeight);

    // Record the dimensions that were resized to (may be rounded, etc..)
    const w = this.screenDimensions[0] = this.app.renderer.screen.width;
    const h = this.screenDimensions[1] = this.app.renderer.screen.height;

    // Update the canvas position
    this.stage.position.set(w/2, h/2);
    this.pan(this.stage.pivot);
  }

  /* -------------------------------------------- */

  /**
   * Handle mousewheel events which adjust the scale of the canvas
   * @param {WheelEvent} event    The mousewheel event that zooms the canvas
   * @private
   */
  _onMouseWheel(event) {
    let dz = ( event.delta < 0 ) ? 1.05 : 0.95;
    this.pan({scale: dz * canvas.stage.scale.x});
  }

  /* -------------------------------------------- */

  /**
   * Event handler for the drop portion of a drag-and-drop event.
   * @param {DragEvent} event  The drag event being dropped onto the canvas
   * @private
   */
  _onDrop(event) {
    event.preventDefault();
    const data = TextEditor.getDragEventData(event);
    if ( !data.type ) return;

    // Acquire the cursor position transformed to Canvas coordinates
    const [x, y] = [event.clientX, event.clientY];
    const t = this.stage.worldTransform;
    data.x = (x - t.tx) / canvas.stage.scale.x;
    data.y = (y - t.ty) / canvas.stage.scale.y;

    /**
     * A hook event that fires when some useful data is dropped onto the
     * Canvas.
     * @function dropCanvasData
     * @memberof hookEvents
     * @param {Canvas} canvas The Canvas
     * @param {object} data   The data that has been dropped onto the Canvas
     */
    const allowed = Hooks.call("dropCanvasData", this, data);
    if ( allowed === false ) return;

    // Handle different data types
    switch ( data.type ) {
      case "Actor":
        return canvas.tokens._onDropActorData(event, data);
      case "JournalEntry": case "JournalEntryPage":
        return canvas.notes._onDropData(event, data);
      case "Macro":
        return game.user.assignHotbarMacro(null, Number(data.slot));
      case "PlaylistSound":
        return canvas.sounds._onDropData(event, data);
      case "Tile":
        return canvas.tiles._onDropData(event, data);
    }
  }

  /* -------------------------------------------- */
  /*  Pending Operations                          */
  /* -------------------------------------------- */

  /**
   * Add a pending canvas operation that should fire once the socket handling workflow concludes.
   * This registers operations by a unique string name into a queue - avoiding repeating the same work multiple times.
   * This is especially helpful for multi-object updates to avoid costly and redundant refresh operations.
   * TODO: this should be deprecated
   * @param {string} name     A unique name for the pending operation, conventionally Class.method
   * @param {Function} fn     The unbound function to execute later
   * @param {*} scope         The scope to which the method should be bound when called
   * @param {...*} args       Arbitrary arguments to pass to the method when called
   */
  addPendingOperation(name, fn, scope, args) {
    if ( this._pendingOperationNames.has(name) ) return;
    this._pendingOperationNames.add(name);
    this.pendingOperations.push([fn, scope, args]);
  }

  /* -------------------------------------------- */

  /**
   * Fire all pending functions that are registered in the pending operations queue and empty it.
   * TODO: this should be deprecated
   */
  triggerPendingOperations() {
    for ( let [fn, scope, args] of this.pendingOperations ) {
      if ( !fn ) continue;
      args = args || [];
      fn = fn.call(scope, ...args);
    }
    this.pendingOperations = [];
    this._pendingOperationNames.clear();
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  get blurDistance() {
    const msg = "canvas.blurDistance is deprecated in favor of canvas.blur.strength";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return this.blur.strength;
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  set blurDistance(value) {
    const msg = "Setting canvas.blurDistance is replaced by setting canvas.blur.strength";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    this.blur.strength = value;
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  activateLayer(layerName) {
    const msg = "Canvas#activateLayer is deprecated in favor of CanvasLayer#activate";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    this[layerName].activate();
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  static getDimensions(scene) {
    const msg = "Canvas.getDimensions is deprecated in favor of Scene#getDimensions";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return scene.getDimensions();
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  setBackgroundColor(color) {
    const msg = "Canvas#setBackgroundColor is deprecated in favor of Canvas#colorManager#initialize";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    this.#colorManager.initialize({backgroundColor: color});
  }
}
