/**
 * The core Game instance which encapsulates the data, settings, and states relevant for managing the game experience.
 * The singleton instance of the Game class is available as the global variable game.
 */
class Game {
  /**
   * @param {string} view         The named view which is active for this game instance.
   * @param {object} data         An object of all the World data vended by the server when the client first connects
   * @param {string} sessionId    The ID of the currently active client session retrieved from the browser cookie
   * @param {Socket} socket       The open web-socket which should be used to transact game-state data
   */
  constructor(view, data, sessionId, socket) {

    /**
     * The named view which is currently active.
     * Game views include: join, setup, players, license, game, stream
     * @type {string}
     */
    Object.defineProperty(this, "view", {value: view, writable: false, enumerable: true});

    /**
     * The object of world data passed from the server
     * @type {object}
     */
    Object.defineProperty(this, "data", {value: data, writable: false, enumerable: true});

    /**
     * The Release data for this version of Foundry
     * @type {config.ReleaseData}
     */
    Object.defineProperty(this, "release", {
      value: new foundry.config.ReleaseData(data.release),
      writable: false,
      enumerable: true
    });

    /**
     * The id of the active World user, if any
     * @type {string|null}
     */
    Object.defineProperty(this, "userId", {value: data.userId || null, writable: false, enumerable: true});

    // Set up package data
    this.setupPackages(data);

    /**
     * A mapping of WorldCollection instances, one per primary Document type.
     * @type {Collection<string,WorldCollection>}
     */
    Object.defineProperty(this, "collections", {
      value: new foundry.utils.Collection(),
      writable: false,
      enumerable: true
    });

    /**
     * A mapping of CompendiumCollection instances, one per Compendium pack.
     * @type {CompendiumPacks<string,CompendiumCollection>}
     */
    Object.defineProperty(this, "packs", {
      value: new CompendiumPacks(),
      writable: false,
      enumerable: true
    });

    /**
     * A singleton web Worker manager.
     * @type {WorkerManager}
     */
    Object.defineProperty(this, "workers", {value: new WorkerManager(), writable: false, enumerable: true});

    /**
     * Localization support
     * @type {Localization}
     */
    Object.defineProperty(this, "i18n", {
      value: new Localization(data?.options?.language),
      writable: false,
      enumerable: true
    });

    /**
     * The Keyboard Manager
     * @type {KeyboardManager}
     */
    Object.defineProperty(this, "keyboard", {value: new KeyboardManager(), writable: false, enumerable: true});

    /**
     * The Mouse Manager
     * @type {MouseManager}
     */
    Object.defineProperty(this, "mouse", {value: new MouseManager(), writable: false, enumerable: true});

    /**
     * The Gamepad Manager
     * @type {GamepadManager}
     */
    Object.defineProperty(this, "gamepad", {value: new GamepadManager(), writable: false, enumerable: true});

    /**
     * The New User Experience manager.
     * @type {NewUserExperience}
     */
    Object.defineProperty(this, "nue", {value: new NewUserExperience(), writable: false, enumerable: true});

    /**
     * The user role permissions setting
     * @type {object}
     */
    this.permissions = null;

    /**
     * The client session id which is currently active
     * @type {string}
     */
    Object.defineProperty(this, "sessionId", {value: sessionId, writable: false, enumerable: true});

    /**
     * Client settings which are used to configure application behavior
     * @type {ClientSettings}
     */
    Object.defineProperty(this, "settings", {
      value: new ClientSettings(data.settings || []),
      writable: false,
      enumerable: true
    });

    /**
     * Client keybindings which are used to configure application behavior
     * @type {ClientKeybindings}
     */
    Object.defineProperty(this, "keybindings", {value: new ClientKeybindings(), writable: false, enumerable: true});

    /**
     * A reference to the open Socket.io connection
     * @type {WebSocket|null}
     */
    Object.defineProperty(this, "socket", {value: socket, writable: false, enumerable: true});

    /**
     * A singleton GameTime instance which manages the progression of time within the game world.
     * @type {GameTime}
     */
    Object.defineProperty(this, "time", {value: new GameTime(socket), writable: false, enumerable: true});

    const canvas = new Canvas();
    /**
     * A singleton reference to the Canvas object which may be used.
     * @type {Canvas}
     */
    Object.defineProperty(this, "canvas", {value: canvas, writable: false, enumerable: true});
    Object.defineProperty(globalThis, "canvas", {value: canvas, writable: true, enumerable: false});

    /**
     * A singleton instance of the Audio Helper class
     * @type {AudioHelper}
     */
    Object.defineProperty(this, "audio", {value: new AudioHelper(), writable: false, enumerable: true});

    /**
     * A singleton instance of the Video Helper class
     * @type {VideoHelper}
     */
    Object.defineProperty(this, "video", {value: new VideoHelper(), writable: false, enumerable: true});

    /**
     * A singleton instance of the TooltipManager class.
     * @type {TooltipManager}
     */
    Object.defineProperty(this, "tooltip", {value: new TooltipManager(), configurable: true, enumerable: true});

    /**
     * A singleton instance of the Clipboard Helper class.
     * @type {ClipboardHelper}
     */
    Object.defineProperty(this, "clipboard", {value: new ClipboardHelper(), writable: false, enumerable: true});

    /**
     * A singleton instance of the Tour collection class
     * @type {Tours}
     */
    Object.defineProperty(this, "tours", {value: new Tours(), writable: false, enumerable: true});

    /**
     * The global document index.
     * @type {DocumentIndex}
     */
    Object.defineProperty(this, "documentIndex", {value: new DocumentIndex(), writable: false, enumerable: true});

    /**
     * The singleton instance of the ClientIssues manager.
     * @type {ClientIssues}
     */
    Object.defineProperty(this, "issues", {value: new ClientIssues(), writable: false, enumerable: true});

    /**
     * Whether the Game is running in debug mode
     * @type {boolean}
     */
    this.debug = false;

    /**
     * A flag for whether texture assets for the game canvas are currently loading
     * @type {boolean}
     */
    this.loading = false;

    /**
     * A flag for whether the Game has successfully reached the "ready" hook
     * @type {boolean}
     */
    this.ready = false;
  }

  /**
   * The game World which is currently active.
   * @type {World}
   */
  world;

  /**
   * The System which is used to power this game World.
   * @type {System}
   */
  system;

  /**
   * A Map of active Modules which are currently eligible to be enabled in this World.
   * The subset of Modules which are designated as active are currently enabled.
   * @type {Map<string, Module>}
   */
  modules;

  /**
   * Returns the current version of the Release, usable for comparisons using isNewerVersion
   * @type {string}
   */
  get version() {
    return this.release.version;
  }

  /* -------------------------------------------- */

  /**
   * Fetch World data and return a Game instance
   * @param {string} view             The named view being created
   * @param {string|null} sessionId   The current sessionId of the connecting client
   * @returns {Promise<Game>}         A Promise which resolves to the created Game instance
   */
  static async create(view, sessionId) {
    const socket = sessionId ? await this.connect(sessionId) : null;
    const gameData = socket ? await this.getData(socket, view) : {};
    return new this(view, gameData, sessionId, socket);
  }

  /* -------------------------------------------- */

  /**
   * Establish a live connection to the game server through the socket.io URL
   * @param {string} sessionId  The client session ID with which to establish the connection
   * @returns {Promise<object>}  A promise which resolves to the connected socket, if successful
   */
  static async connect(sessionId) {
    return new Promise((resolve, reject) => {
      const socket = io.connect({
        path: foundry.utils.getRoute("socket.io"),
        transports: ["websocket"],    // Require websocket transport instead of XHR polling
        upgrade: false,               // Prevent "upgrading" to websocket since it is enforced
        reconnection: true,           // Automatically reconnect
        reconnectionDelay: 500,       // Time before reconnection is attempted
        reconnectionAttempts: 10,     // Maximum reconnection attempts
        reconnectionDelayMax: 500,    // The maximum delay between reconnection attempts
        query: {session: sessionId},  // Pass session info
        cookie: false
      });

      // Confirm successful session creation
      socket.on("session", response => {
        socket.session = response;
        const id = response.sessionId;
        if ( !id || (sessionId && (sessionId !== id)) ) return foundry.utils.debouncedReload();
        console.log(`${vtt} | Connected to server socket using session ${id}`);
        resolve(socket);
      });

      // Fail to establish an initial connection
      socket.on("connectTimeout", () => {
        reject(new Error("Failed to establish a socket connection within allowed timeout."));
      });
      socket.on("connectError", err => reject(err));
    });
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the cookies which are attached to the client session
   * @returns {object}   The session cookies
   */
  static getCookies() {
    const cookies = {};
    for (let cookie of document.cookie.split("; ")) {
      let [name, value] = cookie.split("=");
      cookies[name] = decodeURIComponent(value);
    }
    return cookies;
  }

  /* -------------------------------------------- */

  /**
   * Request World data from server and return it
   * @param {Socket} socket     The active socket connection
   * @param {string} view       The view for which data is being requested
   * @returns {Promise<object>}
   */
  static async getData(socket, view) {
    if ( !socket.session.userId ) {
      socket.disconnect();
      window.location.href = foundry.utils.getRoute("join");
    }
    return new Promise(resolve => {
      socket.emit("world", resolve);
    });
  }

  /* -------------------------------------------- */

  /**
   * Get the current World status upon initial connection.
   * @param {Socket} socket  The active client socket connection
   * @returns {Promise<boolean>}
   */
  static async getWorldStatus(socket) {
    const status = await new Promise(resolve => {
      socket.emit("getWorldStatus", resolve);
    });
    console.log(`${vtt} | The game World is currently ${status ? "active" : "not active"}`);
    return status;
  }

  /* -------------------------------------------- */

  /**
   * Configure package data that is currently enabled for this world
   * @param {object} data  Game data provided by the server socket
   */
  setupPackages(data) {
    if ( data.world ) {
      this.world = new World(data.world);
    }
    if ( data.system ) {
      this.system = new System(data.system);
      if ( data.documentTypes ) this.documentTypes = data.documentTypes;
      if ( data.template ) this.template = data.template;
      if ( data.model ) this.model = data.model;
    }
    this.modules = new foundry.utils.Collection(data.modules.map(m => [m.id, new Module(m)]));
  }

  /* -------------------------------------------- */

  /**
   * Return the named scopes which can exist for packages.
   * Scopes are returned in the prioritization order that their content is loaded.
   * @returns {string[]}    An array of string package scopes
   */
  getPackageScopes() {
    return CONFIG.DatabaseBackend.getFlagScopes();
  }

  /* -------------------------------------------- */

  /**
   * Initialize the Game for the current window location
   */
  async initialize() {
    console.log(`${vtt} | Initializing Foundry Virtual Tabletop Game`);
    this.ready = false;

    Hooks.callAll("init");

    // Register game settings
    this.registerSettings();

    // Initialize language translations
    await this.i18n.initialize();

    // Register Tours
    await this.registerTours();

    // Activate event listeners
    this.activateListeners();

    // Initialize the current view
    await this._initializeView();

    // Display usability warnings or errors
    this.issues._detectUsabilityIssues();
  }

  /* -------------------------------------------- */

  /**
   * Shut down the currently active Game. Requires GameMaster user permission.
   * @returns {Promise<void>}
   */
  async shutDown() {
    if ( !(game.user?.isGM || game.data.isAdmin) ) {
      throw new Error("Only a Gamemaster User or server Administrator may shut down the currently active world");
    }

    // Display a warning if other players are connected
    const othersActive = game.users.filter(u => u.active && !u.isSelf).length;
    if ( othersActive ) {
      const warning = othersActive > 1 ? "GAME.ReturnSetupActiveUsers" : "GAME.ReturnSetupActiveUser";
      const confirm = await Dialog.confirm({
        title: game.i18n.localize("GAME.ReturnSetup"),
        content: `<p>${game.i18n.format(warning, {number: othersActive})}</p>`
      });
      if ( !confirm ) return;
    }

    // Dispatch the request
    const setupUrl = foundry.utils.getRoute("setup");
    const response = await fetchWithTimeout(setupUrl, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({shutdown: true}),
      redirect: "manual"
    });

    // Redirect after allowing time for a pop-up notification
    setTimeout(() => window.location.href = response.url, 1000);
  }

  /* -------------------------------------------- */
  /*  Primary Game Initialization
  /* -------------------------------------------- */

  /**
   * Fully set up the game state, initializing Documents, UI applications, and the Canvas
   * @returns {Promise<void>}
   */
  async setupGame() {

    // Store permission settings
    this.permissions = await this.settings.get("core", "permissions");

    // Initialize world data
    this.initializePacks();     // Do this first since documents may reference compendium content
    this.initializeDocuments();  // Next initialize world-level documents

    // Monkeypatch a search method on EmbeddedCollection
    foundry.abstract.EmbeddedCollection.prototype.search = DocumentCollection.prototype.search;

    // Call world setup hook
    Hooks.callAll("setup");

    // Initialize AV conferencing
    // noinspection ES6MissingAwait
    this.initializeRTC();

    // Initialize user interface
    this.initializeMouse();
    this.initializeGamepads();
    this.initializeKeyboard();

    // Call this here to set up a promise that dependent UI elements can await.
    this.canvas.initializing = this.initializeCanvas();
    this.initializeUI();
    DocumentSheetConfig.initializeSheets();

    // Canvas initialization
    await this.canvas.initializing;
    this.activateSocketListeners();

    // If the player is not a GM and does not have an impersonated character, prompt for selection
    if ( !this.user.isGM && !this.user.character ) {
      this.user.sheet.render(true);
    }

    // Call all game ready hooks
    this.ready = true;

    // Initialize New User Experience
    this.nue.initialize();

    // Index available documents
    await this.documentIndex.index();

    Hooks.callAll("ready");
  }

  /* -------------------------------------------- */

  /**
   * Initialize game state data by creating WorldCollection instances for every primary Document type
   */
  initializeDocuments() {
    const initOrder = ["User", "Folder", "Actor", "Item", "Scene", "Combat", "JournalEntry", "Macro", "Playlist",
      "RollTable", "Cards", "ChatMessage"];
    if ( initOrder.length !== CONST.DOCUMENT_TYPES.length ) {
      throw new Error("Missing Document initialization type!");
    }

    // Warn developers about collision with V10 DataModel changes
    const v10DocumentMigrationErrors = [];
    for ( const documentName of CONST.DOCUMENT_TYPES ) {
      const cls = getDocumentClass(documentName);
      for ( const key of cls.schema.keys() ) {
        if ( key in cls.prototype ) {
          const err = `The ${cls.name} class defines the "${key}" attribute which collides with the "${key}" key in `
          + `the ${cls.documentName} data schema`;
          v10DocumentMigrationErrors.push(err);
        }
      }
    }
    if ( v10DocumentMigrationErrors.length ) {
      v10DocumentMigrationErrors.unshift("Version 10 Compatibility Failure",
        "-".repeat(90),
        "Several Document class definitions include properties which collide with the new V10 DataModel:",
        "-".repeat(90));
      throw new Error(v10DocumentMigrationErrors.join("\n"));
    }

    // Initialize world document collections
    this._documentsReady = false;
    const t0 = performance.now();
    for ( let documentName of initOrder ) {
      const documentClass = CONFIG[documentName].documentClass;
      const collectionClass = CONFIG[documentName].collection;
      const collectionName = documentClass.metadata.collection;
      this[collectionName] = new collectionClass(foundry.utils.deepClone(this.data[collectionName]));
      this.collections.set(documentName, this[collectionName]);
    }
    this._documentsReady = true;

    // Prepare data for all world documents (this was skipped at construction-time)
    for ( const collection of this.collections.values() ) {
      for ( let document of collection ) {
        document._safePrepareData();
      }
    }

    // Special-case - world settings
    this.collections.set("Setting", this.settings.storage.get("world"));

    // Special case - fog explorations
    const fogCollectionCls = CONFIG.FogExploration.collection;
    this.collections.set("FogExploration", new fogCollectionCls());
    const dt = performance.now() - t0;
    console.debug(`${vtt} | Prepared World Documents in ${Math.round(dt)}ms`);
  }

  /* -------------------------------------------- */

  /**
   * Initialize the Compendium packs which are present within this Game
   * Create a Collection which maps each Compendium pack using it's collection ID
   * @returns {Collection<string,CompendiumCollection>}
   */
  initializePacks() {
    for ( let metadata of this.data.packs ) {
      let pack = this.packs.get(metadata.id);

      // Update the compendium collection
      if ( !pack ) pack = new CompendiumCollection(metadata);
      this.packs.set(pack.collection, pack);

      // Re-render any applications associated with pack content
      for ( let document of pack.contents ) {
        document.render(false, {editable: !pack.locked});
      }

      // Re-render any open Compendium applications
      pack.apps.forEach(app => app.render(false));
    }
    return this.packs;
  }

  /* -------------------------------------------- */

  /**
   * Initialize the WebRTC implementation
   */
  initializeRTC() {
    this.webrtc = new AVMaster();
    return this.webrtc.connect();
  }

  /* -------------------------------------------- */

  /**
   * Initialize core UI elements
   */
  initializeUI() {

    // Initialize all singleton applications
    for ( let [k, cls] of Object.entries(CONFIG.ui) ) {
      ui[k] = new cls();
    }

    // Initialize pack applications
    for ( let pack of this.packs.values() ) {
      if ( Application.isPrototypeOf(pack.applicationClass) ) {
        const app = new pack.applicationClass({collection: pack});
        pack.apps.push(app);
      }
    }

    // Render some applications (asynchronously)
    ui.nav.render(true);
    ui.notifications.render(true);
    ui.sidebar.render(true);
    ui.players.render(true);
    ui.hotbar.render(true);
    ui.webrtc.render(true);
    ui.pause.render(true);
    ui.controls.render(true);
    this.scaleFonts();
  }

  /* -------------------------------------------- */

  /**
   * Initialize the game Canvas
   * @returns {Promise<void>}
   */
  async initializeCanvas() {

    // Ensure that necessary fonts have fully loaded
    await FontConfig._loadFonts();

    // Identify the current scene
    const scene = game.scenes.current;

    // Attempt to initialize the canvas and draw the current scene
    try {
      this.canvas.initialize();
      if ( scene ) await scene.view();
      else if ( this.canvas.initialized ) await this.canvas.draw(null);
    } catch(err) {
      Hooks.onError("Game#initializeCanvas", err, {
        msg: "Failed to render WebGL canvas",
        log: "error"
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Initialize Keyboard controls
   */
  initializeKeyboard() {
    Object.defineProperty(globalThis, "keyboard", {value: this.keyboard, writable: false, enumerable: true});
    this.keyboard._activateListeners();
    try {
      game.keybindings._registerCoreKeybindings();
      game.keybindings.initialize();
    }
    catch(e) {
      console.error(e);
    }
  }

  /* -------------------------------------------- */

  /**
   * Initialize Mouse controls
   */
  initializeMouse() {
    this.mouse._activateListeners();
  }

  /* -------------------------------------------- */

  /**
   * Initialize Gamepad controls
   */
  initializeGamepads() {
    this.gamepad._activateListeners();
  }

  /* -------------------------------------------- */

  /**
   * Register core game settings
   */
  registerSettings() {

    // Permissions Control Menu
    game.settings.registerMenu("core", "permissions", {
      name: "PERMISSION.Configure",
      label: "PERMISSION.ConfigureLabel",
      hint: "PERMISSION.ConfigureHint",
      icon: "fas fa-user-lock",
      type: PermissionConfig,
      restricted: true
    });

    // User Role Permissions
    game.settings.register("core", "permissions", {
      name: "Permissions",
      scope: "world",
      default: {},
      type: Object,
      config: false,
      onChange: permissions => {
        game.permissions = permissions;
        if ( ui.controls ) ui.controls.initialize();
        if ( ui.sidebar ) ui.sidebar.render();
      }
    });

    // WebRTC Control Menu
    game.settings.registerMenu("core", "webrtc", {
      name: "WEBRTC.Title",
      label: "WEBRTC.MenuLabel",
      hint: "WEBRTC.MenuHint",
      icon: "fas fa-headset",
      type: AVConfig,
      restricted: false
    });

    // RTC World Settings
    game.settings.register("core", "rtcWorldSettings", {
      name: "WebRTC (Audio/Video Conferencing) World Settings",
      scope: "world",
      default: AVSettings.DEFAULT_WORLD_SETTINGS,
      type: Object,
      onChange: () => game.webrtc.settings.changed()
    });

    // RTC Client Settings
    game.settings.register("core", "rtcClientSettings", {
      name: "WebRTC (Audio/Video Conferencing) Client specific Configuration",
      scope: "client",
      default: AVSettings.DEFAULT_CLIENT_SETTINGS,
      type: Object,
      onChange: () => game.webrtc.settings.changed()
    });

    // Default Token Configuration
    game.settings.registerMenu("core", DefaultTokenConfig.SETTING, {
      name: "SETTINGS.DefaultTokenN",
      label: "SETTINGS.DefaultTokenL",
      hint: "SETTINGS.DefaultTokenH",
      icon: "fas fa-user-alt",
      type: DefaultTokenConfig,
      restricted: true
    });

    // Default Token Settings
    game.settings.register("core", DefaultTokenConfig.SETTING, {
      name: "SETTINGS.DefaultTokenN",
      hint: "SETTINGS.DefaultTokenL",
      scope: "world",
      type: Object,
      default: {}
    });

    // Font Configuration
    game.settings.registerMenu("core", FontConfig.SETTING, {
      name: "SETTINGS.FontConfigN",
      label: "SETTINGS.FontConfigL",
      hint: "SETTINGS.FontConfigH",
      icon: "fa-solid fa-font",
      type: FontConfig,
      restricted: true
    });

    // Font Configuration Settings
    game.settings.register("core", FontConfig.SETTING, {
      scope: "world",
      type: Object,
      default: {}
    });

    // Combat Tracker Configuration
    game.settings.registerMenu("core", Combat.CONFIG_SETTING, {
      name: "SETTINGS.CombatConfigN",
      label: "SETTINGS.CombatConfigL",
      hint: "SETTINGS.CombatConfigH",
      icon: "fa-solid fa-swords",
      type: CombatTrackerConfig
    });

    // No-Canvas Mode
    game.settings.register("core", "noCanvas", {
      name: "SETTINGS.NoCanvasN",
      hint: "SETTINGS.NoCanvasL",
      scope: "client",
      config: true,
      type: Boolean,
      default: false,
      requiresReload: true
    });

    // Language preference
    game.settings.register("core", "language", {
      name: "SETTINGS.LangN",
      hint: "SETTINGS.LangL",
      scope: "client",
      config: true,
      default: game.i18n.lang,
      type: String,
      choices: CONFIG.supportedLanguages,
      requiresReload: true
    });

    // Chat message roll mode
    game.settings.register("core", "rollMode", {
      name: "Default Roll Mode",
      scope: "client",
      config: false,
      default: CONST.DICE_ROLL_MODES.PUBLIC,
      type: String,
      choices: CONFIG.Dice.rollModes,
      onChange: ChatLog._setRollMode
    });

    // World time
    game.settings.register("core", "time", {
      name: "World Time",
      scope: "world",
      config: false,
      default: 0,
      type: Number,
      onChange: this.time.onUpdateWorldTime.bind(this.time)
    });

    // Register module configuration settings
    game.settings.register("core", ModuleManagement.CONFIG_SETTING, {
      name: "Module Configuration Settings",
      scope: "world",
      config: false,
      default: {},
      type: Object,
      requiresReload: true
    });

    // Register compendium visibility setting
    game.settings.register("core", CompendiumCollection.CONFIG_SETTING, {
      name: "Compendium Configuration",
      scope: "world",
      config: false,
      default: {},
      type: Object,
      onChange: () => {
        this.initializePacks();
        ui.compendium.render();
      }
    });

    // Combat Tracker Configuration
    game.settings.register("core", Combat.CONFIG_SETTING, {
      name: "Combat Tracker Configuration",
      scope: "world",
      config: false,
      default: {},
      type: Object,
      onChange: () => {
        if (game.combat) {
          game.combat.reset();
          game.combats.render();
        }
      }
    });

    // Document Sheet Class Configuration
    game.settings.register("core", "sheetClasses", {
      name: "Sheet Class Configuration",
      scope: "world",
      config: false,
      default: {},
      type: Object,
      onChange: setting => DocumentSheetConfig.updateDefaultSheets(setting)
    });

    game.settings.registerMenu("core", "sheetClasses", {
      name: "SETTINGS.DefaultSheetsN",
      label: "SETTINGS.DefaultSheetsL",
      hint: "SETTINGS.DefaultSheetsH",
      icon: "fa-solid fa-scroll",
      type: DefaultSheetsConfig,
      restricted: true
    });

    // Are Chat Bubbles Enabled?
    game.settings.register("core", "chatBubbles", {
      name: "SETTINGS.CBubN",
      hint: "SETTINGS.CBubL",
      scope: "client",
      config: true,
      default: true,
      type: Boolean
    });

    // Pan to Token Speaker
    game.settings.register("core", "chatBubblesPan", {
      name: "SETTINGS.CBubPN",
      hint: "SETTINGS.CBubPL",
      scope: "client",
      config: true,
      default: true,
      type: Boolean
    });

    // Scrolling Status Text
    game.settings.register("core", "scrollingStatusText", {
      name: "SETTINGS.ScrollStatusN",
      hint: "SETTINGS.ScrollStatusL",
      scope: "world",
      config: true,
      default: true,
      type: Boolean
    });

    // Disable Resolution Scaling
    game.settings.register("core", "pixelRatioResolutionScaling", {
      name: "SETTINGS.ResolutionScaleN",
      hint: "SETTINGS.ResolutionScaleL",
      scope: "client",
      config: true,
      default: true,
      type: Boolean,
      requiresReload: true
    });

    // Left-Click Deselection
    game.settings.register("core", "leftClickRelease", {
      name: "SETTINGS.LClickReleaseN",
      hint: "SETTINGS.LClickReleaseL",
      scope: "client",
      config: true,
      default: false,
      type: Boolean
    });

    // Canvas Performance Mode
    game.settings.register("core", "performanceMode", {
      name: "SETTINGS.PerformanceModeN",
      hint: "SETTINGS.PerformanceModeL",
      scope: "client",
      config: true,
      type: Number,
      default: -1,
      choices: {
        [CONST.CANVAS_PERFORMANCE_MODES.LOW]: "SETTINGS.PerformanceModeLow",
        [CONST.CANVAS_PERFORMANCE_MODES.MED]: "SETTINGS.PerformanceModeMed",
        [CONST.CANVAS_PERFORMANCE_MODES.HIGH]: "SETTINGS.PerformanceModeHigh",
        [CONST.CANVAS_PERFORMANCE_MODES.MAX]: "SETTINGS.PerformanceModeMax"
      },
      onChange: () => {
        canvas._configurePerformanceMode();
        return canvas.ready ? canvas.draw() : null;
      }
    });

    // Maximum Framerate
    game.settings.register("core", "maxFPS", {
      name: "SETTINGS.MaxFPSN",
      hint: "SETTINGS.MaxFPSL",
      scope: "client",
      config: true,
      type: Number,
      range: {min: 10, max: 60, step: 10},
      default: 60,
      onChange: () => {
        canvas._configurePerformanceMode();
        return canvas.ready ? canvas.draw() : null;
      }
    });

    // FPS Meter
    game.settings.register("core", "fpsMeter", {
      name: "SETTINGS.FPSMeterN",
      hint: "SETTINGS.FPSMeterL",
      scope: "client",
      config: true,
      type: Boolean,
      default: false,
      onChange: enabled => {
        if ( enabled ) return canvas.activateFPSMeter();
        else return canvas.deactivateFPSMeter();
      }
    });

    // Font scale
    game.settings.register("core", "fontSize", {
      name: "SETTINGS.FontSizeN",
      hint: "SETTINGS.FontSizeL",
      scope: "client",
      config: true,
      type: Number,
      range: {min: 1, max: 10, step: 1},
      default: 5,
      onChange: () => game.scaleFonts()
    });

    // Photosensitivity mode.
    game.settings.register("core", "photosensitiveMode", {
      name: "SETTINGS.PhotosensitiveModeN",
      hint: "SETTINGS.PhotosensitiveModeL",
      scope: "client",
      config: true,
      type: Boolean,
      default: false,
      requiresReload: true
    });

    // Live Token Drag Preview
    game.settings.register("core", "tokenDragPreview", {
      name: "SETTINGS.TokenDragPreviewN",
      hint: "SETTINGS.TokenDragPreviewL",
      scope: "world",
      config: true,
      default: false,
      type: Boolean
    });

    // Animated Token Vision
    game.settings.register("core", "visionAnimation", {
      name: "SETTINGS.AnimVisionN",
      hint: "SETTINGS.AnimVisionL",
      config: true,
      type: Boolean,
      default: true
    });

    // Light Source Flicker
    game.settings.register("core", "lightAnimation", {
      name: "SETTINGS.AnimLightN",
      hint: "SETTINGS.AnimLightL",
      config: true,
      type: Boolean,
      default: true,
      onChange: () => canvas.effects?.activateAnimation()
    });

    // Mipmap Antialiasing
    game.settings.register("core", "mipmap", {
      name: "SETTINGS.MipMapN",
      hint: "SETTINGS.MipMapL",
      config: true,
      type: Boolean,
      default: true,
      onChange: () => canvas.ready ? canvas.draw() : null
    });

    // Default Drawing Configuration
    game.settings.register("core", DrawingsLayer.DEFAULT_CONFIG_SETTING, {
      name: "Default Drawing Configuration",
      scope: "client",
      config: false,
      default: {},
      type: Object
    });

    // Keybindings
    game.settings.register("core", "keybindings", {
      scope: "client",
      config: false,
      type: Object,
      default: {},
      onChange: () => game.keybindings.initialize()
    });

    // New User Experience
    game.settings.register("core", "nue.shownTips", {
      scope: "world",
      type: Boolean,
      default: false,
      config: false
    });

    // Tours
    game.settings.register("core", "tourProgress", {
      scope: "client",
      config: false,
      type: Object,
      default: {}
    });

    // Editor autosave.
    game.settings.register("core", "editorAutosaveSecs", {
      name: "SETTINGS.EditorAutosaveN",
      hint: "SETTINGS.EditorAutosaveH",
      scope: "world",
      config: true,
      type: Number,
      default: 60,
      range: {min: 30, max: 300, step: 10}
    });

    // Link recommendations.
    game.settings.register("core", "pmHighlightDocumentMatches", {
      name: "SETTINGS.EnableHighlightDocumentMatches",
      hint: "SETTINGS.EnableHighlightDocumentMatchesH",
      scope: "world",
      config: false,
      type: Boolean,
      default: true
    });

    // Combat Theme
    game.settings.register("core", "combatTheme", {
      name: "SETTINGS.CombatThemeN",
      hint: "SETTINGS.CombatThemeL",
      scope: "client",
      config: false,
      type: String,
      choices: Object.entries(CONFIG.Combat.sounds).reduce( (choices, s) => {
        choices[s[0]] = game.i18n.localize(s[1].label);
        return choices;
      }, {none: game.i18n.localize("SETTINGS.None") }),
      default: "none"
    });

    // Show Toolclips
    game.settings.register("core", "showToolclips", {
      name: "SETTINGS.ShowToolclips",
      hint: "SETTINGS.ShowToolclipsH",
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
      requiresReload: true
    });

    // Favorite paths
    game.settings.register("core", "favoritePaths", {
      scope: "client",
      config: false,
      type: Object,
      default: {"data-/": {source: "data", path: "/", label: "root"}}
    });

    // Top level collection sorting
    game.settings.register("core", "collectionSortingModes", {
      scope: "client",
      config: false,
      type: Object,
      default: {}
    });

    // Collection searching
    game.settings.register("core", "collectionSearchModes", {
      scope: "client",
      config: false,
      type: Object,
      default: {}
    });

    // Hotbar lock
    game.settings.register("core", "hotbarLock", {
      scope: "client",
      config: false,
      type: Boolean,
      default: false
    });

    // Adventure imports
    game.settings.register("core", "adventureImports", {
      scope: "world",
      config: false,
      type: Object,
      default: {}
    });

    // Document-specific settings
    RollTables.registerSettings();

    // Audio playback settings
    AudioHelper.registerSettings();

    // Register CanvasLayer settings
    NotesLayer.registerSettings();
    TemplateLayer.registerSettings();
  }

  /* -------------------------------------------- */

  /**
   * Register core Tours
   * @returns {Promise<void>}
   */
  async registerTours() {
    try {
      game.tours.register("core", "welcome", await SidebarTour.fromJSON("/tours/welcome.json"));
      game.tours.register("core", "installingASystem", await SetupTour.fromJSON("/tours/installing-a-system.json"));
      game.tours.register("core", "creatingAWorld", await SetupTour.fromJSON("/tours/creating-a-world.json"));
      game.tours.register("core", "backupsOverview", await SetupTour.fromJSON("/tours/backups-overview.json"));
      game.tours.register("core", "uiOverview", await Tour.fromJSON("/tours/ui-overview.json"));
      game.tours.register("core", "sidebar", await SidebarTour.fromJSON("/tours/sidebar.json"));
      game.tours.register("core", "canvasControls", await CanvasTour.fromJSON("/tours/canvas-controls.json"));
    }
    catch(err) {
      console.error(err);
    }
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Is the current session user authenticated as an application administrator?
   * @type {boolean}
   */
  get isAdmin() {
    return this.data.isAdmin;
  }

  /* -------------------------------------------- */

  /**
   * The currently connected User document, or null if Users is not yet initialized
   * @type {User|null}
   */
  get user() {
    return this.users ? this.users.current : null;
  }

  /* -------------------------------------------- */

  /**
   * A convenience accessor for the currently viewed Combat encounter
   * @type {Combat}
   */
  get combat() {
    return this.combats?.viewed;
  }

  /* -------------------------------------------- */

  /**
   * A state variable which tracks whether the game session is currently paused
   * @type {boolean}
   */
  get paused() {
    return this.data.paused;
  }

  /* -------------------------------------------- */

  /**
   * A convenient reference to the currently active canvas tool
   * @type {string}
   */
  get activeTool() {
    return ui.controls?.activeTool ?? "select";
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Toggle the pause state of the game
   * Trigger the `pauseGame` Hook when the paused state changes
   * @param {boolean} pause         The desired pause state; true for paused, false for un-paused
   * @param {boolean} [push=false]  Push the pause state change to other connected clients? Requires an GM user.
   * @returns {boolean}             The new paused state
   */
  togglePause(pause, push=false) {
    this.data.paused = pause ?? !this.data.paused;
    if (push && game.user.isGM) game.socket.emit("pause", this.data.paused);
    ui.pause.render();
    Hooks.callAll("pauseGame", this.data.paused);
    return this.data.paused;
  }

  /* -------------------------------------------- */

  /**
   * Open Character sheet for current token or controlled actor
   * @returns {ActorSheet|null}  The ActorSheet which was toggled, or null if the User has no character
   */
  toggleCharacterSheet() {
    const token = canvas.ready && (canvas.tokens.controlled.length === 1) ? canvas.tokens.controlled[0] : null;
    const actor = token ? token.actor : game.user.character;
    if ( !actor ) return null;
    const sheet = actor.sheet;
    if ( sheet.rendered ) {
      if ( sheet._minimized ) sheet.maximize();
      else sheet.close();
    }
    else sheet.render(true);
    return sheet;
  }

  /* -------------------------------------------- */

  /**
   * Log out of the game session by returning to the Join screen
   */
  logOut() {
    if ( this.socket ) this.socket.disconnect();
    window.location.href = foundry.utils.getRoute("join");
  }

  /* -------------------------------------------- */

  /**
   * Scale the base font size according to the user's settings.
   * @param {number} [index]  Optionally supply a font size index to use, otherwise use the user's setting.
   *                          Available font sizes, starting at index 1, are: 8, 10, 12, 14, 16, 18, 20, 24, 28, and 32.
   */
  scaleFonts(index) {
    const fontSizes = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32];
    index = index ?? game.settings.get("core", "fontSize");
    const size = fontSizes[index - 1] || 16;
    document.documentElement.style.fontSize = `${size}px`;
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  /**
   * Activate Socket event listeners which are used to transact game state data with the server
   */
  activateSocketListeners() {
    let disconnectedTime = 0;
    let reconnectTimeRequireRefresh = 5000;

    // Disconnection and reconnection attempts
    this.socket.on("disconnect", () => {
      disconnectedTime = Date.now();
      ui.notifications.error("You have lost connection to the server, attempting to re-establish.");
    });

    // Reconnect attempt
    this.socket.io.on("reconnect_attempt", () => {
      const t = Date.now();
      console.log(`${vtt} | Attempting to re-connect: ${((t - disconnectedTime) / 1000).toFixed(2)} seconds`);
    });


    // Reconnect failed
    this.socket.io.on("reconnect_failed", () => {
      ui.notifications.error(`${vtt} | Server connection lost.`);
      window.location.href = foundry.utils.getRoute("no");
    });

    // Reconnect succeeded
    this.socket.io.on("reconnect", () => {
      ui.notifications.info(`${vtt} | Server connection re-established.`);
      if ( (Date.now() - disconnectedTime) >= reconnectTimeRequireRefresh ) {
        foundry.utils.debouncedReload();
      }
    });

    // Game pause
    this.socket.on("pause", pause => {
      game.togglePause(pause, false);
    });

    // Game shutdown
    this.socket.on("shutdown", () => {
      ui.notifications.info("The game world is shutting down and you will be returned to the server homepage.", {
        permanent: true
      });
      setTimeout(() => window.location.href = foundry.utils.getRoute("/"), 1000);
    });

    // Application reload.
    this.socket.on("reload", () => foundry.utils.debouncedReload());

    // Hot Reload
    this.socket.on("hotReload", this.#handleHotReload.bind(this));

    // Database Operations
    CONFIG.DatabaseBackend.activateSocketListeners(this.socket);

    // Additional events
    AudioHelper._activateSocketListeners(this.socket);
    Users._activateSocketListeners(this.socket);
    Scenes._activateSocketListeners(this.socket);
    Journal._activateSocketListeners(this.socket);
    FogExplorations._activateSocketListeners(this.socket);
    ChatBubbles._activateSocketListeners(this.socket);
    ProseMirrorEditor._activateSocketListeners(this.socket);
    CompendiumCollection._activateSocketListeners(this.socket);
  }

  /* -------------------------------------------- */

  /**
   * @typedef {Object} HotReloadData
   * @property {string} packageType       The type of package which was modified
   * @property {string} packageId         The id of the package which was modified
   * @property {string} content           The updated stringified file content
   * @property {string} path              The relative file path which was modified
   * @property {string} extension         The file extension which was modified, e.g. "js", "css", "html"
   */

  /**
   * Handle a hot reload request from the server
   * @param {HotReloadData} data          The hot reload data
   * @private
   */
  #handleHotReload(data) {
    const proceed = Hooks.call("hotReload", data);
    if ( proceed === false ) return;

    switch ( data.extension ) {
      case "css": return this.#hotReloadCSS(data);
      case "html":
      case "hbs": return this.#hotReloadHTML(data);
      case "json": return this.#hotReloadJSON(data);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle hot reloading of CSS files
   * @param {HotReloadData} data          The hot reload data
   */
  #hotReloadCSS(data) {
    const links = document.querySelectorAll(`link`);
    const link = Array.from(links).find(l => {
      let href = l.getAttribute("href");
      // If the href has a query string, remove it
      if ( href.includes("?") ) {
        const [path, query] = href.split("?");
        href = path;
      }
      return href === data.path;
    });
    if ( !link ) return;
    const href = link.getAttribute("href");
    link.setAttribute("href", `${href}?${Date.now()}`);
  }

  /* -------------------------------------------- */

  /**
   * Handle hot reloading of HTML files, such as Handlebars templates
   * @param {HotReloadData} data          The hot reload data
   */
  #hotReloadHTML(data) {
    let template;
    try {
      template = Handlebars.compile(data.content);
    }
    catch(err) {
      return console.error(err);
    }
    Handlebars.registerPartial(data.path, template);
    _templateCache[data.path] = template;
    for ( const appId in ui.windows ) {
      ui.windows[appId].render(true);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle hot reloading of JSON files, such as language files
   * @param {HotReloadData} data          The hot reload data
   */
  #hotReloadJSON(data) {
    const currentLang = game.i18n.lang;
    if ( data.packageId === "core" ) {
      if ( !data.path.endsWith(`lang/${currentLang}.json`) ) return;
    }
    else {
      const pkg = data.packageType === "system" ? game.system : game.modules.get(data.packageId);
      const lang = pkg.languages.find(l=> (l.path === data.path) && (l.lang === currentLang));
      if ( !lang ) return;
    }

    // Update the translations
    let translations = {};
    try {
      translations = JSON.parse(data.content);
    }
    catch(err) {
      return console.error(err);
    }
    foundry.utils.mergeObject(game.i18n.translations, translations);
    for ( const appId in ui.windows ) {
      ui.windows[appId].render(true);
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Activate Event Listeners which apply to every Game View
   */
  activateListeners() {

    // Disable touch zoom
    document.addEventListener("touchmove", ev => {
      if ( (ev.scale !== undefined) && (ev.scale !== 1) ) ev.preventDefault();
    }, {passive: false});

    // Disable right-click
    document.addEventListener("contextmenu", ev => ev.preventDefault());

    // Disable mouse 3, 4, and 5
    document.addEventListener("pointerdown", this._onPointerDown);
    document.addEventListener("pointerup", this._onPointerUp);

    // Prevent dragging and dropping unless a more specific handler allows it
    document.addEventListener("dragstart", this._onPreventDragstart);
    document.addEventListener("dragover", this._onPreventDragover);
    document.addEventListener("drop", this._onPreventDrop);

    // Support mousewheel interaction for range input elements
    window.addEventListener("wheel", Game._handleMouseWheelInputChange, {passive: false});

    // Tooltip rendering
    this.tooltip.activateEventListeners();

    // Document links
    TextEditor.activateListeners();

    // Await gestures to begin audio and video playback
    game.video.awaitFirstGesture();

    // Handle changes to the state of the browser window
    window.addEventListener("beforeunload", this._onWindowBeforeUnload);
    window.addEventListener("blur", this._onWindowBlur);
    window.addEventListener("resize", this._onWindowResize);
    if ( this.view === "game" ) {
      history.pushState(null, null, location.href);
      window.addEventListener("popstate", this._onWindowPopState);
    }

    // Force hyperlinks to a separate window/tab
    document.addEventListener("click", this._onClickHyperlink);
  }

  /* -------------------------------------------- */

  /**
   * Support mousewheel control for range type input elements
   * @param {WheelEvent} event    A Mouse Wheel scroll event
   * @private
   */
  static _handleMouseWheelInputChange(event) {
    const r = event.target;
    if ( (r.tagName !== "INPUT") || (r.type !== "range") || r.disabled ) return;
    event.preventDefault();
    event.stopPropagation();

    // Adjust the range slider by the step size
    const step = (parseFloat(r.step) || 1.0) * Math.sign(-1 * event.deltaY);
    r.value = Math.clamped(parseFloat(r.value) + step, parseFloat(r.min), parseFloat(r.max));

    // Dispatch a change event that can bubble upwards to the parent form
    const ev = new Event("change", {bubbles: true});
    r.dispatchEvent(ev);
  }

  /* -------------------------------------------- */

  /**
   * On left mouse clicks, check if the element is contained in a valid hyperlink and open it in a new tab.
   * @param {MouseEvent} event
   * @private
   */
  _onClickHyperlink(event) {
    const a = event.target.closest("a[href]");
    if ( !a || (a.href === "javascript:void(0)") || a.closest(".editor-content.ProseMirror") ) return;
    event.preventDefault();
    window.open(a.href, "_blank");
  }

  /* -------------------------------------------- */

  /**
   * Prevent starting a drag and drop workflow on elements within the document unless the element has the draggable
   * attribute explicitly defined or overrides the dragstart handler.
   * @param {DragEvent} event   The initiating drag start event
   * @private
   */
  _onPreventDragstart(event) {
    const target = event.target;
    const inProseMirror = (target.nodeType === Node.TEXT_NODE) && target.parentElement.closest(".ProseMirror");
    if ( (target.getAttribute?.("draggable") === "true") || inProseMirror ) return;
    event.preventDefault();
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Disallow dragging of external content onto anything but a file input element
   * @param {DragEvent} event   The requested drag event
   * @private
   */
  _onPreventDragover(event) {
    const target = event.target;
    if ( (target.tagName !== "INPUT") || (target.type !== "file") ) event.preventDefault();
  }

  /* -------------------------------------------- */

  /**
   * Disallow dropping of external content onto anything but a file input element
   * @param {DragEvent} event   The requested drag event
   * @private
   */
  _onPreventDrop(event) {
    const target = event.target;
    if ( (target.tagName !== "INPUT") || (target.type !== "file") ) event.preventDefault();
  }

  /* -------------------------------------------- */

  /**
   * On a left-click event, remove any currently displayed inline roll tooltip
   * @param {PointerEvent} event    The mousedown pointer event
   * @private
   */
  _onPointerDown(event) {
    if ([3, 4, 5].includes(event.button)) event.preventDefault();
    const inlineRoll = document.querySelector(".inline-roll.expanded");
    if ( inlineRoll && !event.target.closest(".inline-roll") ) {
      return Roll.defaultImplementation.collapseInlineResult(inlineRoll);
    }
  }

  /* -------------------------------------------- */

  /**
   * Fallback handling for mouse-up events which aren't handled further upstream.
   * @param {PointerEvent} event    The mouseup pointer event
   * @private
   */
  _onPointerUp(event) {
    const cmm = canvas.currentMouseManager;
    if ( !cmm || event.defaultPrevented ) return;
    cmm.cancel(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle resizing of the game window by adjusting the canvas and repositioning active interface applications.
   * @param {Event} event     The window resize event which has occurred
   * @private
   */
  _onWindowResize(event) {
    Object.values(ui.windows).forEach(app => {
      app.setPosition({top: app.position.top, left: app.position.left});
    });
    ui.webrtc?.setPosition({height: "auto"});
    if (canvas && canvas.ready) return canvas._onResize(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle window unload operations to clean up any data which may be pending a final save
   * @param {Event} event     The window unload event which is about to occur
   * @private
   */
  _onWindowBeforeUnload(event) {
    if ( canvas.ready ) {
      canvas.fog.commit();
      // Save the fog immediately rather than waiting for the 3s debounced save as part of commitFog.
      return canvas.fog.save();
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle cases where the browser window loses focus to reset detection of currently pressed keys
   * @param {Event} event   The originating window.blur event
   * @private
   */
  _onWindowBlur(event) {
    game.keyboard?.releaseKeys();
  }

  /* -------------------------------------------- */

  _onWindowPopState(event) {
    if ( game._goingBack ) return;
    history.pushState(null, null, location.href);
    if ( confirm(game.i18n.localize("APP.NavigateBackConfirm")) ) {
      game._goingBack = true;
      history.back();
      history.back();
    }
  }

  /* -------------------------------------------- */
  /*  View Handlers                               */
  /* -------------------------------------------- */

  /**
   * Initialize elements required for the current view
   * @private
   */
  async _initializeView() {
    switch (this.view) {
      case "game":
        return this._initializeGameView();
      case "stream":
        return this._initializeStreamView();
      default:
        throw new Error(`Unknown view URL ${this.view} provided`);
    }
  }

  /* -------------------------------------------- */

  /**
   * Initialization steps for the primary Game view
   * @private
   */
  async _initializeGameView() {

    // Require a valid user cookie and EULA acceptance
    if ( !globalThis.SIGNED_EULA ) window.location.href = foundry.utils.getRoute("license");
    if (!this.userId) {
      console.error("Invalid user session provided - returning to login screen.");
      this.logOut();
    }

    // Set up the game
    await this.setupGame();

    // Set a timeout of 10 minutes before kicking the user off
    if ( this.data.demoMode && !this.user.isGM ) {
      setTimeout(() => {
        console.log(`${vtt} | Ending demo session after 10 minutes. Thanks for testing!`);
        this.logOut();
      }, 1000 * 60 * 10);
    }

    // Context menu listeners
    ContextMenu.eventListeners();
  }

  /* -------------------------------------------- */

  /**
   * Initialization steps for the Stream helper view
   * @private
   */
  async _initializeStreamView() {
    if ( !globalThis.SIGNED_EULA ) window.location.href = foundry.utils.getRoute("license");
    this.initializeDocuments();
    ui.chat = new ChatLog({stream: true});
    ui.chat.render(true);
    CONFIG.DatabaseBackend.activateSocketListeners(this.socket);
  }
}
