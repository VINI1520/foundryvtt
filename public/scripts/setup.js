/**
 * A library of package management commands which are used by various interfaces around the software.
 * @extends {Game}
 */
class Setup extends Game {

  /**
   * A reference to the setup URL used under the current route prefix, if any
   * @type {string}
   */
  static get setupURL() {
    return foundry.utils.getRoute("setup");
  }

  /* -------------------------------------------- */

  /**
   * Register core game settings
   * @override
   */
  registerSettings() {
    super.registerSettings();
    game.settings.register("core", "declinedManifestUpgrades", {
      scope: "client",
      config: false,
      type: Object,
      default: {}
    });
  }

  /* -------------------------------------------- */

  /** @override */
  setupPackages(data) {
    super.setupPackages(data);
    const Collection = foundry.utils.Collection;
    if ( data.worlds ) {
      this.worlds = new Collection(data.worlds.map(m => [m.id, new World(m)]));
    }
    if ( data.systems ) {
      this.systems = new Collection(data.systems.map(m => [m.id, new System(m)]));
    }
  }

  /* -------------------------------------------- */

  /** @override */
  static async getData(socket, view) {
    let req;
    switch (view) {
      case "auth": case "license": req = "getAuthData"; break;
      case "join": req = "getJoinData"; break;
      case "players": req = "getPlayersData"; break;
      case "setup": req = "getSetupData"; break;
    }
    return new Promise(resolve => {
      socket.emit(req, resolve);
    });
  }

  /* -------------------------------------------- */
  /*  View Handlers                               */
  /* -------------------------------------------- */

  /** @override */
  async _initializeView() {
    switch (this.view) {
      case "auth":
        return this._authView();
      case "license":
        return this._licenseView();
      case "setup":
        return this._setupView();
      case "players":
        return this._playersView();
      case "join":
        return this._joinView();
      default:
        throw new Error(`Unknown view URL ${this.view} provided`);
    }
  }

  /* -------------------------------------------- */

  /**
   * The application view which displays the End User License Agreement (EULA).
   * @private
   */
  _licenseView() {
    ui.notifications = new Notifications().render(true);
    const setup = document.getElementById("setup");

    // Allow right-click specifically in the key field
    const input = document.getElementById("key");
    input?.addEventListener("contextmenu", ev => ev.stopPropagation());

    // Render the EULA
    if ( setup.dataset.step === "eula" ) new EULA().render(true);
  }

  /* -------------------------------------------- */

  /**
   * The application view which displays the admin authentication application.
   * @private
   */
  _authView() {
    if ( !globalThis.SIGNED_EULA ) window.location.href = foundry.utils.getRoute("license");
    ui.notifications = new Notifications().render(true);
    new SetupAuthenticationForm().render(true);
  }

  /* -------------------------------------------- */

  /**
   * The application view which displays the application Setup and Configuration.
   * @private
   */
  _setupView() {
    if ( !globalThis.SIGNED_EULA ) window.location.href = foundry.utils.getRoute("license");
    ui.notifications = (new Notifications()).render(true);
    ui.setup = (new SetupConfigurationForm(game.data)).render(true);
    Setup._activateSocketListeners();
    Setup.#logPackageWarnings(this.data.packageWarnings);
  }

  /* -------------------------------------------- */

  /**
   * Log server-provided package warnings so that they are discoverable on the client-side.
   * @param {object} packageWarnings         An object of package warnings and errors by package ID.
   * @param {object} [options]               Additional options to configure logging behaviour.
   * @param {boolean} [options.notify=true]  Whether to create UI notifications in addition to logging.
   */
  static #logPackageWarnings(packageWarnings, {notify=true}={}) {
    let errors = 0;
    let warnings = 0;
    for ( const [packageId, messages] of Object.entries(packageWarnings) ) {
      for ( const error of messages.error ) {
        errors++;
        console.error(`[${packageId}] ${error}`);
      }
      for ( const warning of messages.warning ) {
        warnings++;
        console.warn(`[${packageId}] ${warning}`);
      }
    }

    if ( !notify ) return;

    // Notify
    if ( errors > 0 ) {
      const err = game.i18n.format("PACKAGE.SetupErrors", {number: errors});
      ui.notifications.error(err, {permanent: true, console: false});
    }
    if ( warnings > 0 ) {
      const warn = game.i18n.format("PACKAGE.SetupWarnings", {number: warnings});
      ui.notifications.warn(warn, {permanent: true, console: false});
    }
  }

  /* -------------------------------------------- */

  /**
   * The application view which displays the User Configuration.
   * @private
   */
  _playersView() {
    if ( !globalThis.SIGNED_EULA ) window.location.href = foundry.utils.getRoute("license");
    this.users = new Users(this.data.users);
    this.collections.set("User", this.users);
    this.collections.set("Setting", this.settings.storage.get("world"));

    // Render applications
    ui.notifications = new Notifications().render(true);
    ui.players = new UserManagement(this.users);
    ui.players.render(true);

    // Game is ready for use
    this.ready = true;
  }

  /* -------------------------------------------- */

  /**
   * The application view which displays the Game join and authentication screen.
   * @private
   */
  _joinView() {
    if ( !globalThis.SIGNED_EULA ) window.location.href = foundry.utils.getRoute("license");

    // Configure Join view data
    this.users = new Users(this.data.users);
    this.collections.set("User", this.users);

    // Activate Join view socket listeners
    Users._activateSocketListeners(this.socket);

    // Render Join view applications
    ui.notifications = new Notifications().render(true);
    ui.join = new JoinGameForm().render(true);
  }

  /* -------------------------------------------- */
  /*  Package Management                          */
  /* -------------------------------------------- */

  /**
   * Check with the server whether a package of a certain type may be installed or updated.
   * @param {object} options    Options which affect how the check is performed
   * @param {string} options.type       The package type to check
   * @param {string} options.id         The package id to check
   * @param {string} [options.manifest] The manifest URL to check
   * @param {number} [options.timeout]  A timeout in milliseconds after which the check will fail
   * @returns {Promise<PackageManifestData>} The resulting manifest if an update is available
   */
  static async checkPackage({type="module", id, manifest, timeout=20000}={}) {
    return this.post({action: "checkPackage", type, id, manifest}, timeout).then(r => r.json());
  }

  /* -------------------------------------------- */

  /**
   * Prepares the cache of available and owned packages
   * @param {object} options          Options which configure how the cache is warmed
   * @param {string} options.type     The type of package being cached
   * @returns {Promise<void>}
   */
  static async warmPackages({type="system"}={}) {
    if ( Setup.cache[type].state > Setup.CACHE_STATES.COLD ) return;
    Setup.cache[type].state = Setup.CACHE_STATES.WARMING;
    await this.getPackages({type});
    Setup.cache[type].state = Setup.CACHE_STATES.WARMED;
  }

  /* -------------------------------------------- */

  /**
   * Get a Map of available packages of a given type which may be installed
   * @param {string} type
   * @returns {Promise<Map<string, ClientPackage>>}
   */
  static async getPackages({type="system"}={}) {
    if ( this.cache[type].packages?.size > 0 ) return this.cache[type].packages;
    const packages = new Map();
    let request;
    try {
      request = await this.post({action: "getPackages", type: type});
    } catch(err) {
      ui.notifications.error("PACKAGE.GetPackagesTimedOut", {localize: true});
      return packages;
    }
    if ( !request.ok ) return packages;
    let response = await request.json();
    response.packages.forEach(p => {
      const pkg = new PACKAGE_TYPES[type](p);
      packages.set(p.id, pkg);
    });
    this.cache[type].packages = packages;
    this.cache[type].owned = response.owned;
    return packages;
  }

  /* -------------------------------------------- */

  /**
   * Install a Package
   * @param {object} options        Options which affect how the package is installed
   * @param {string} options.type          The type of package being installed, in ["module", "system", "world"]
   * @param {string} options.id            The package id
   * @param {string} options.manifest      The package manifest URL
   * @param {Function} onProgress  A function that will receive progress updates during the installation process
   * @returns {Promise<foundry.packages.BasePackage>}    A Promise which resolves to the installed package
   */
  static async installPackage({type="module", id, manifest}={}, onProgress) {
    return new Promise(async resolve => {

      /**
       * Handles an Install error
       * @param {InstallPackageError} response
       */
      const error = response => {
        if ( response.packageWarnings ) {
          ui.notifications.error(game.i18n.localize(response.error));
          Setup.#logPackageWarnings(response.packageWarnings, {notify: false});
        } else {
          const err = new Error(response.error);
          err.stack = response.stack;
          ui.notifications.error(game.i18n.format("SETUP.InstallFailure", {message: response.error.split("\n")[0]}), {
            console: false
          });                   // Display a user-friendly UI notification
          console.error(err);   // Log the full error details to console
        }
        Setup._removeProgressListener(progress);
        if ( onProgress ) Setup._removeProgressListener(onProgress);
        resolve(response);
        ui.setup.render();
      };

      /**
       * Handles successful Package installation
       * @param {InstallPackageSuccess} data
       * @returns {Promise<void>}
       */
      const done = async data => {
        const pkg = new PACKAGE_TYPES[type](data.pkg);
        ui.notifications.info(game.i18n.format("SETUP.InstallSuccess", {type: type.titleCase(), id: pkg.id}));

        // Trigger dependency installation (asynchronously)
        if ( pkg.relationships ) {
          // noinspection ES6MissingAwait
          this.installDependencies(pkg);
        }

        // Add the created package to game data
        pkg.install();

        // Update application views
        if ( ui.setup ) await ui.setup.reload();
        Setup._removeProgressListener(progress);
        if ( onProgress ) Setup._removeProgressListener(onProgress);
        resolve(pkg);
      };

      const progress = data => {
        if ( data.step === "Error" ) return error(data);
        if ( data.step === "Package" ) return done(data);
      };

      Setup._addProgressListener(progress);
      if ( onProgress ) Setup._addProgressListener(onProgress);
      let request;
      try {
        request = await this.post({action: "installPackage", type, id, manifest});
      } catch(err) {
        ui.notifications.error("PACKAGE.PackageInstallTimedOut", {localize: true});
        resolve();
        return;
      }

      /** @type {InstallPackageResponse} */
      const response = await request.json();

      // Handle errors and warnings
      if ( response.error ) error(response);
      if ( response.warning ) ui.notifications.warn(response.warning);
    });
  }

  /* -------------------------------------------- */

  /**
   * Install a set of dependency modules which are required by an installed package
   * @param {ClientPackage} pkg   The package which was installed that requested dependencies
   * @returns {Promise<void>}
   */
  static async installDependencies(pkg) {
    const dependencyChecks = new Map();

    // Check required Relationships
    for ( let d of pkg.relationships?.requires ?? [] ) {
      await this.#checkDependency(d, dependencyChecks);
    }

    const uninstalled = Array.from(dependencyChecks.values()).filter(d => d.installNeeded);
    if ( !uninstalled.length ) return;

    // Prepare data for rendering
    const data = {
      title: pkg.title,
      totalDependencies: uninstalled.length,
      canInstall: uninstalled.filter(d => d.canInstall),
      cantInstall: uninstalled.filter(d => !d.canInstall)
    };

    // Handle pluralization
    const singleDependency = data.totalDependencies === 1;
    const singleInstall = data.canInstall.length === 1;
    data.hasDependenciesLabel = singleDependency
      ? game.i18n.format("SETUP.PackageHasDependenciesSingular", {title: pkg.title})
      : game.i18n.format("SETUP.PackageHasDependenciesPlural", {title: pkg.title, number: data.totalDependencies});
    data.autoInstallLabel = singleInstall
      ? game.i18n.localize("SETUP.PackageDependenciesAutomaticSingular")
      : game.i18n.format("SETUP.PackageDependenciesAutomaticPlural", {number: data.canInstall.length});
    data.manualInstallLabel = data.cantInstall.length
      ? game.i18n.localize("SETUP.PackageDependenciesCouldNotInstallSingular")
      : game.i18n.format("SETUP.PackageDependenciesCouldNotInstallPlural", {number: data.cantInstall.length});
    // Prompt the user to confirm installation of dependency packages
    const html = await renderTemplate("templates/setup/install-dependencies.html", data);
    const options = {
      id: "setup-install-dependencies",
      width: 600
    };
    new Dialog(
      {
        title: game.i18n.localize("SETUP.PackageDependenciesTitle"),
        content: html,
        buttons: {
          automatic: {
            icon: '<i class="fas fa-bolt-auto"></i>',
            label: singleInstall
              ? game.i18n.localize("SETUP.PackageDependenciesAutomaticSingular")
              : game.i18n.format("SETUP.PackageDependenciesAutomaticPlural", {number: data.canInstall.length}),
            disabled: data.canInstall.length === 0,
            callback: async () => {
              // Install dependency packages
              for ( let d of dependencyChecks.values() ) {
                await this.installPackage({type: d.type, id: d.id, manifest: d.manifest});
              }
              return ui.notifications.info(game.i18n.format("SETUP.PackageDependenciesSuccess", {
                title: pkg.title,
                number: dependencyChecks.size
              }));
            }
          },
          manual: {
            icon: '<i class="fas fa-wrench"></i>',
            label: game.i18n.localize(`SETUP.PackageDependenciesManual${singleDependency ? "Singular" : "Plural"}`),
            callback: () => {
              return ui.notifications.warn(game.i18n.format("SETUP.PackageDependenciesDecline", {
                title: pkg.title
              }));
            }
          }
        },
        default: "automatic"
      }, options).render(true);
  }


  /* -------------------------------------------- */

  /**
   * @typedef {Object} PackageDependencyCheck
   * @property {string} id                The package id
   * @property {string} type              The package type
   * @property {string} manifest          The package manifest URL
   * @property {boolean} installNeeded    Whether the package is already installed
   * @property {boolean} canInstall       Whether the package can be installed
   * @property {string} message           An error message to display to the user
   * @property {string} url               The URL to the package
   * @property {string} version           The package version
   */

  /**
   * Checks a dependency to see if it needs to be installed
   * @param {RelatedPackage} relatedPackage                                   The dependency
   * @param {Map<string, PackageDependencyCheck>} dependencyChecks            The current map of dependencies to install
   * @returns {Promise<void>}
   * @private
   */
  static async #checkDependency(relatedPackage, dependencyChecks) {
    if ( !relatedPackage.id || dependencyChecks.has(relatedPackage.id) ) return;
    relatedPackage.type = relatedPackage.type || "module";

    let dependencyCheck = {
      id: relatedPackage.id,
      type: relatedPackage.type,
      manifest: "",
      installNeeded: true,
      canInstall: false,
      message: "",
      url: "",
      version: ""
    };

    const installed = game.data[`${relatedPackage.type}s`].find(p => p.id === relatedPackage.id);
    if ( installed ) {
      const msg = `Dependency ${relatedPackage.type} ${relatedPackage.id} is already installed.`;
      console.debug(msg);
      dependencyCheck.installNeeded = false;
      dependencyCheck.message = msg;
      dependencyChecks.set(dependencyCheck.id, dependencyCheck);
      return;
    }

    // Manifest URL provided
    let dependency;
    if ( relatedPackage.manifest ) {
      dependencyCheck.manifest = relatedPackage.manifest;
      dependencyCheck.url = relatedPackage.manifest;
      dependency = await PACKAGE_TYPES[relatedPackage.type].fromRemoteManifest(relatedPackage.manifest);
      if ( !dependency ) {
        const msg = `Requested dependency "${relatedPackage.id}" not found at ${relatedPackage.manifest}.`;
        console.warn(msg);
        dependencyCheck.message = msg;
        dependencyChecks.set(dependencyCheck.id, dependencyCheck);
        return;
      }
    }
    else {
      // Discover from package listing
      const packages = await Setup.getPackages({type: relatedPackage.type});
      dependency = packages.get(relatedPackage.id);
      if ( !dependency ) {
        const msg = `Requested dependency "${relatedPackage.id}" not found in ${relatedPackage.type} directory.`;
        console.warn(msg);
        dependencyCheck.message = msg;
        dependencyChecks.set(dependencyCheck.id, dependencyCheck);
        return;
      }

      // Prefer linking to Readme over Project URL over Manifest
      if ( dependency.readme ) dependencyCheck.url = dependency.readme;
      else if ( dependency.url ) dependencyCheck.url = dependency.url;
      else dependencyCheck.url = dependency.manifest;
      dependencyCheck.manifest = dependency.manifest;
    }
    dependencyCheck.version = dependency.version;

    /**
     * Test whether a package dependency version matches the defined compatibility criteria of its dependant package.
     * @param {string} dependencyVersion                 The version string of the dependency package
     * @param {PackageCompatibility} compatibility       Compatibility criteria defined by the dependant package
     * @param {string} [compatibility.minimum]           A minimum version of the dependency which is required
     * @param {string} [compatibility.maximum]           A maximum version of the dependency which is allowed
     * @returns {boolean}
     */
    function isDependencyCompatible(dependencyVersion, {minimum, maximum}={}) {
      if ( minimum && foundry.utils.isNewerVersion(minimum, dependencyVersion) ) return false;
      return !( maximum && foundry.utils.isNewerVersion(dependencyVersion, maximum) );
    }

    // Validate that the dependency is compatible
    if ( !isDependencyCompatible(dependency.version, relatedPackage.compatibility) ) {
      const range = [
        relatedPackage.compatibility?.minimum ? `>= ${relatedPackage.compatibility.minimum}` : "",
        relatedPackage.compatibility?.maximum && relatedPackage.compatibility?.maximum ? " and " : "",
        relatedPackage.compatibility?.maximum ? `<= ${relatedPackage.compatibility.maximum}` : ""
      ].join("");
      const msg = `No version of dependency "${relatedPackage.id}" found matching required range of ${range}.`;
      console.warn(msg);
      dependencyCheck.message = msg;
      dependencyChecks.set(dependencyCheck.id, dependencyCheck);
      return;
    }
    dependencyCheck.canInstall = true;
    dependencyChecks.set(dependencyCheck.id, dependencyCheck);

    // If the dependency has dependencies itself, take a fun trip down recursion lane
    for ( let d of dependency.relationships?.requires ?? [] ) {
      await this.#checkDependency(d, dependencyChecks);
    }
  }

  /* -------------------------------------------- */

  /**
   * Uninstall a single Package by name and type.
   * @param {object} options            Options which configure how package uninstallation is handled
   * @param {string} options.type       The type of package being installed, in ["module", "system", "world"]
   * @param {string} options.id         The canonical package id
   * @returns {Promise<object>}         A Promise which resolves to the uninstalled package manifest
   */
  static async uninstallPackage({type="module", id}={}) {
    let request;
    try {
      request = await this.post({action: "uninstallPackage", type, id});
    } catch(err) {
      return {error: err.message, stack: err.stack};
    }
    // Update in-memory data
    game[`${type}s`].delete(id);
    return request.json();
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  /**
   * Activate socket listeners related to the Setup view.
   */
  static _activateSocketListeners() {
    game.socket.on("progress", Setup._onProgress);
  }

  /* --------------------------------------------- */

  /**
   * A list of functions to call on progress events.
   * @type {Function[]}
   */
  static _progressListeners = [];

  /* --------------------------------------------- */

  /**
   * Handle a progress event from the server.
   * @param {object} data  The progress update data.
   * @private
   */
  static _onProgress(data) {
    Setup._progressListeners.forEach(l => l(data));
  }

  /* --------------------------------------------- */

  /**
   * Add a function to be called on a progress event.
   * @param {Function} listener
   */
  static _addProgressListener(listener) {
    Setup._progressListeners.push(listener);
  }

  /* --------------------------------------------- */

  /**
   * Stop sending progress events to a given function.
   * @param {Function} listener
   */
  static _removeProgressListener(listener) {
    Setup._progressListeners = Setup._progressListeners.filter(l => l !== listener);
  }

  /* -------------------------------------------- */
  /*  Helper Functions                            */
  /* -------------------------------------------- */

  /**
   * A helper method to submit a POST request to setup configuration with a certain body, returning the JSON response
   * @param {object} body             The request body to submit
   * @param {number} [timeout=30000]  The time, in milliseconds, to wait before aborting the request
   * @returns {Promise<object>}       The response body
   * @private
   */
  static post(body, timeout = 30000) {
    if (!((game.view === "setup") || (game.ready && game.user.isGM && body.shutdown))) {
      throw new Error("You may not submit POST requests to the setup page while a game world is currently active.");
    }
    return fetchWithTimeout(this.setupURL, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body),
      redirect: "manual"
    }, {timeoutMs: timeout});
  }
}

/**
 * An enum that indicates a state the Cache is in
 * @enum {number}
 */
Setup.CACHE_STATES = {
  COLD: 0,
  WARMING: 1,
  WARMED: 2
};

/**
 * A cached object of retrieved packages from the web server
 * @type {{world: World[], system: System[], module: Module[]}}
 */
Setup.cache = {
  world: { packages: new Map(), state: Setup.CACHE_STATES.COLD },
  module: { packages: new Map(), state: Setup.CACHE_STATES.COLD },
  system: { packages: new Map(), state: Setup.CACHE_STATES.COLD }
};

/**
 * A form application for managing core server configuration options.
 * @extends FormApplication
 * @see config.ApplicationConfiguration
 */
class ApplicationConfigurationForm extends FormApplication {

  /**
   * An ApplicationConfiguration instance which is used for validation and processing of form changes.
   * @type {config.ApplicationConfiguration}
   */
  config = new foundry.config.ApplicationConfiguration(this.object);

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "configuration",
      template: "templates/setup/application-configuration.html",
      popOut: false
    });
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options={}) {
    const worlds = Array.from(game.worlds.values());
    worlds.sort((a, b) => a.title.localeCompare(b.title));
    return {
      config: this.config.toObject(),
      cssClass: ["tab", "flexcol", ui.setup?.activeTab === this.options.id ? "active": ""].filterJoin(" "),
      cssId: this.options.id,
      languages: game.data.languages,
      fields: this.config.schema.fields,
      worlds: worlds
    };
  }

  /* -------------------------------------------- */

  /** @override */
  async _onSubmit(event, options={}) {
    event.preventDefault();
    const original = this.config.toObject();

    // Validate the proposed changes
    const formData = this._getSubmitData();
    let changes;
    try {
      changes = this.config.updateSource(formData);
    } catch(err) {
      return ui.notifications.error(err.message);
    }
    if ( foundry.utils.isEmpty(changes) ) return;

    // Confirm that a server restart is okay
    const confirm = await Dialog.confirm({
      title: game.i18n.localize("SETUP.ConfigSave"),
      content: `<p>${game.i18n.localize("SETUP.ConfigSaveWarning")}</p>`,
      defaultYes: false
    });

    // Submit the form
    if ( confirm ) {
      this.element.html(`<p class="notification warning">${game.i18n.localize("SETUP.ConfigSaveRestart")}</p>`);
      return ui.setup._post({action: "adminConfigure", config: changes});
    }

    // Reset the form
    else {
      this.config.updateSource(original);
      return this.render();
    }
  }
}

/**
 * The End User License Agreement
 * Display the license agreement and prompt the user to agree before moving forwards
 * @type {Application}
 */
class EULA extends Application {
  /** @inheritdoc */
	static get defaultOptions() {
	  const options = super.defaultOptions;
	  options.id = "eula";
	  options.template = "templates/setup/eula.html";
	  options.title = "End User License Agreement";
	  options.width = 720;
	  options.popOut = true;
	  return options;
  }

  /* -------------------------------------------- */

  /**
   * A reference to the setup URL used under the current route prefix, if any
   * @return {string}
   */
  get licenseURL() {
    return getRoute("license");
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
      let html = await fetchWithTimeout("license.html").then(r => r.text());
	  return {
        html: html
	  }
  }

  /* -------------------------------------------- */

  /** @override */
	async _renderOuter() {
	  const id = this.id;
	  const classes = Array.from(this.options.classes).join(" ");

	  // Override the normal window app wrapper so it cannot be closed or minimized
	  const parsed = $.parseHTML(`<div id="${id}" class="app window-app ${classes}" data-appid="${this.appId}">
      <header class="window-header flexrow">
          <h4 class="window-title">${this.title}</h4>
      </header>
      <section class="window-content"></section>
    </div>`);
	  const html = $(parsed[0]);

    // Make the outer window draggable
    const header = html.find('header')[0];
    new Draggable(this, html, header, this.options.resizable);

    // Set the outer frame z-index
    if ( Object.keys(ui.windows).length === 0 ) _maxZ = 100;
    html.css({zIndex: Math.min(++_maxZ, 9999)});
    return html;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    const form = html[0].children[1];
    html.find("#decline").click(this._onDecline.bind(this));
    form.onsubmit = this._onSubmit.bind(this);
  }

  /* -------------------------------------------- */

  /**
   * Handle refusal of the EULA by checking the decline button
   * @param {MouseEvent} event    The originating click event
   */
  _onDecline(event) {
    const button = event.currentTarget;
    ui.notifications.error(`You have declined the End User License Agreement and cannot use the software.`);
    button.form.dataset.clicked = "decline";
  }

  /* -------------------------------------------- */

  /**
   * Validate form submission before sending it onwards to the server
   * @param {Event} event       The originating form submission event
   */
  _onSubmit(event) {
    const form = event.target;
    if ( form.dataset.clicked === "decline" ) {
      return setTimeout(() => window.location.href = CONST.WEBSITE_URL, 1000);
    }
    if ( !form.agree.checked ) {
      event.preventDefault();
      ui.notifications.error(`You must agree to the ${this.options.title} before proceeding.`);
    }
  }
}

/**
 * A special class of Dialog which allows for the installation of Packages.
 */
class InstallPackage extends Application {
  constructor(data, options) {
    super(options);
    this.data = data;

    /**
     * The instance of the setup form to which this is linked
     * @type {SetupConfigurationForm}
     */
    this.setup = data.setup;

    /**
     * The category being filtered for
     * @type {string}
     */
    this._category = "all";

    /**
     * The visibility being filtered for
     * @type {string}
     */
    this._visibility = "all";

    /**
     * The list of installable packages
     * @type {ClientPackage[]}
     */
    this.packages = undefined;

    /**
     * The list of Tags available
     * @type {Array<object>}
     */
    this.tags = undefined;

    /**
     * Have we initialized the filter to a special value?
     * @type {boolean}
     * @private
     */
    this._initializedFilter = !this.data.filterValue;
  }

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "install-package",
      template: "templates/setup/install-package.html",
      classes: ["dialog"],
      width: 720,
      height: 620,
      scrollY: [".categories", ".package-list"],
      filters: [{inputSelector: 'input[name="filter"]', contentSelector: ".package-list"}]
    });
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.localize(`SETUP.Install${this.data.packageType.titleCase()}`);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  render(...args) {
    // Lazily load packages
    const type = this.data.packageType;
    if ( Setup.cache[type].state === Setup.CACHE_STATES.COLD ) {
      Setup.warmPackages({type}).then(() => this.render(false));
    }
    return super.render(...args);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async getData(options={}) {
    const data = super.getData(options);
    const type = data.packageType = this.data.packageType;
    if ( !this.packages?.length || !this.tags?.length ) {
      const {packages, tags} = await InstallPackage.getTaggedPackages(type);
      this.packages = packages;
      this.tags = tags;
    }
    data.loading = Setup.cache[type].state < Setup.CACHE_STATES.WARMED;
    data.couldntLoad = !this.packages.length && Setup.cache[type].state === Setup.CACHE_STATES.WARMED;

    // Category filters
    data.tags = Object.entries(this.tags).reduce((tags, t) => {
      let [k, v] = t;
      v.active = this._category === t[0];
      v.css = t[1].active ? " active" : "";
      tags[k] = v;
      return tags;
    }, {});

    // Visibility filters
    data.visibility = [
      { id: "inst", css: this._visibility === "inst" ? " active" : "", label: "SETUP.PackageVisInst" },
      { id: "unin", css: this._visibility === "unin" ? " active" : "", label: "SETUP.PackageVisUnin" },
      { id: "all", css: this._visibility === "all" ? " active" : "", label: "SETUP.PackageVisAll" }
    ];

    // Filter packages
    const installed = new Set(game.data[`${type}s`].map(s => s.id));
    data.packages = this.packages.filter(p => {
      p.installed = installed.has(p.id);
      if ( (this._visibility === "unin") && p.installed ) return false;
      if ( (this._visibility === "inst") && !p.installed ) return false;
      p.cssClass = [p.installed ? "installed" : null, p.installable ? null: "locked"].filterJoin(" ");
      if ( this._category === "all" ) return true;
      if ( this._category === "premium" ) return p.protected;
      if ( this._category === "exclusive" ) return p.exclusive;
      return p.tags.includes(this._category);
    });
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html[0].children[0].onsubmit = ev => ev.preventDefault();
    html.find(".package-title a").click(this._onClickPackageTitle.bind(this));
    html.find("button.install").click(this._onClickPackageInstall.bind(this));
    html.find(".category .filter").click(this._onClickCategoryFilter.bind(this));
    html.find(".visibilities .visibility").click(this._onClickVisibilityFilter.bind(this));
    html.find("input[name=filter]").focus();

    const loading = Setup.cache[this.data.packageType].state < Setup.CACHE_STATES.WARMED;
    if ( !this._initializedFilter && !loading ) {
      html.find('input[name="filter"]').val(this.data.filterValue);
      this._searchFilters[0].filter(null, this.data.filterValue);
      this._initializedFilter = true;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle left-click events to filter to a certain module category
   * @param {MouseEvent} event
   * @private
   */
  _onClickCategoryFilter(event) {
    event.preventDefault();
    this._category = event.target.dataset.category || "all";
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle left-click events to filter to a certain visibility state
   * @param {MouseEvent} event
   * @private
   */
  _onClickVisibilityFilter(event) {
    event.preventDefault();
    this._visibility = event.target.dataset.visibility || "all";
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle a left-click event on the package title
   * @param {MouseEvent} event
   * @private
   */
  _onClickPackageTitle(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".package");
    if ( li.classList.contains("installed") ) return;
    if ( li.classList.contains("locked") ) {
      const href = `https://foundryvtt.com/packages/${li.dataset.packageId}/`;
      return window.open(href, "_blank");
    }
    const form = li.closest("form");
    form.manifestURL.value = li.querySelector("button.install").dataset.manifest;
  }

  /* -------------------------------------------- */

  /**
   * Handle a left-click event on the package "Install" button
   * @param {MouseEvent} event
   * @private
   */
  async _onClickPackageInstall(event) {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;
    const type = this.data.packageType;
    let manifest = button.dataset.manifest;

    // Install from manifest field
    if (button.dataset.action === "install-url") {
      manifest = button.form.manifestURL.value.trim();
    }

    // Install from package listing
    else {
      const li = button.closest(".package");
      if ( li.classList.contains("locked") ) {
        const href = `https://foundryvtt.com/packages/${li.dataset.packageId}/`;
        return window.open(href, "_blank");
      }
    }

    // Execute the installation
    await Setup.installPackage({type, manifest}, data => {
      this.setup.updateProgressBar(data);
      this.setup.updateProgressButton(data);
    });
    button.disabled = false;
  }

  /* -------------------------------------------- */

  /** @override */
  _onSearchFilter(event, query, rgx, html) {
    for ( let li of html.children ) {
      if ( !query ) {
        li.classList.remove("hidden");
        continue;
      }
      const id = li.dataset.packageId;
      const title = li.querySelector(".package-title a")?.textContent;
      const author = li.querySelector(".tag.author").textContent;
      const match = rgx.test(SearchFilter.cleanQuery(id))
        || rgx.test(SearchFilter.cleanQuery(title))
        || rgx.test(SearchFilter.cleanQuery(author));
      li.classList.toggle("hidden", !match);
    }
  }

  /* -------------------------------------------- */

  /**
   * Organize package data and cache it to the application
   * @param {string} type   The type of packages being retrieved
   * @returns {object[]}     The retrieved or cached packages
   */
  static async getTaggedPackages(type) {

    // Identify package tags and counts
    const packages = [];
    const counts = {premium: 0, exclusive: 0};
    const unordered_tags = {};
    const codes = CONST.PACKAGE_AVAILABILITY_CODES;

    // Prepare package data
    for ( let pack of Setup.cache[type].packages.values() ) {
      const p = pack.toObject();
      const availability = pack.availability;

      // Skip packages which require downgrading or upgrading to an unstable version
      if ( [codes.REQUIRES_CORE_DOWNGRADE, codes.REQUIRES_CORE_UPGRADE_UNSTABLE].includes(availability) ) continue;

      // Create the array of package tags
      const tags = pack.tags.map(t => {
        const [k, v] = t;
        if ( !unordered_tags[k] ) unordered_tags[k] = {label: v, count: 0, [type]: true};
        unordered_tags[k].count++;
        return k;
      });

      // Structure package data
      foundry.utils.mergeObject(p, {
        cssClass: "",
        author: Array.from(pack.authors).map(a => a.name).join(", "),
        tags: tags,
        installable: availability !== codes.REQUIRES_CORE_UPGRADE_STABLE
      });
      if ( pack.protected ) {
        if ( !pack.owned ) p.installable = false;
        counts.premium++;
      }
      if ( pack.exclusive ) counts.exclusive++;
      packages.push(p);
    }

    // Organize category tags
    const sorted_tags = Array.from(Object.keys(unordered_tags));
    sorted_tags.sort();
    const tags = sorted_tags.reduce((obj, k) => {
      obj[k] = unordered_tags[k];
      return obj;
    }, {
      all: { label: "All Packages", count: packages.length, [type]: true},
      premium: { label: "Premium Content", count: counts.premium, [type]: true},
      exclusive: { label: "Exclusive Content", count: counts.exclusive, [type]: true }
    });
    return { packages: packages, tags: tags };
  }
}

/**
 * The Join Game setup application
 * @extends {FormApplication}
 */
class JoinGameForm extends FormApplication {
  constructor(object, options) {
    super(object, options);
    game.users.apps.push(this);
  }

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "join-game",
      template: "templates/setup/join-game.html",
      popOut: false,
      closeOnSubmit: false,
      scrollY: ["#world-description"]
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const data = {
      isAdmin: game.data.isAdmin,
      users: game.users,
      world: game.world,
      passwordString: game.data.passwordString,
      usersCurrent: game.users.filter(u => u.active).length,
      usersMax: game.users.contents.length
    };

    // Next session time
    const nextDate = new Date(game.world.nextSession || undefined);
    if ( nextDate.isValid() ) {
      data.nextDate = nextDate.toDateInputString();
      data.nextTime = nextDate.toTimeInputString();
      const fmt = new Intl.DateTimeFormat(undefined, {timeZoneName: "short"});
      const tz = fmt.formatToParts().find(p => p.type === "timeZoneName");
      data.nextTZ = tz ? ` (${tz.value})` : "";
    }
    return data;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    this.form.userid.addEventListener("focus", ev => this._setMode("join"));
    this.form.password.addEventListener("focus", ev => this._setMode("join"));
    this.form.adminPassword?.addEventListener("focus", ev => this._setMode("shutdown"));
    this.form.shutdown.addEventListener("click", this._onShutdown.bind(this));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, options) {
    if ( !this.form ) return super._render(force, options);
    // Preserve form state across re-renders.
    const data = this._getSubmitData();
    const focus = this.form.querySelector(":focus");
    await super._render(force, options);
    Object.entries(data).forEach(([k, v]) => this.form.elements[k].value = v);
    if ( focus?.name ) this.form.elements[focus.name].focus();
    if ( this.form.userid.selectedOptions[0]?.disabled ) this.form.userid.value = "";
  }

  /* -------------------------------------------- */

  /**
   * Toggle the submission mode of the form to alter what pressing the "ENTER" key will do
   * @param {string} mode
   * @private
   */
  _setMode(mode) {
    switch (mode) {
      case "join":
        this.form.shutdown.type = "button";
        this.form.join.type = "submit";
        break;
      case "shutdown":
        this.form.join.type = "button";
        this.form.shutdown.type = "submit";
        break;
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onSubmit(event, options) {
    event.preventDefault();
    const form = event.target;
    form.submit.disabled = true;
    const data = this._getSubmitData();
    data.action = "join";
    return this._post(data, form.submit);
  }

  /* -------------------------------------------- */

  /**
   * Handle requests to shut down the currently active world
   * @param {MouseEvent} event    The originating click event
   * @returns {Promise<void>}
   * @private
   */
  async _onShutdown(event) {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;
    const data = this._getSubmitData();
    data.action = "shutdown";
    return this._post(data, button);
  }

  /* -------------------------------------------- */

  /**
   * Submit join view POST requests to the server for handling.
   * @param {object} formData                         The processed form data
   * @param {EventTarget|HTMLButtonElement} button    The triggering button element
   * @returns {Promise<void>}
   * @private
   */
  async _post(formData, button) {
    const joinURL = foundry.utils.getRoute("join");
    button.disabled = true;

    // Look up some data
    const user = game.users.get(formData.userid)?.name || formData.userid;

    let response;
    try {
      response = await fetchJsonWithTimeout(joinURL, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(formData)
      });
    }
    catch(e) {
      if (e instanceof HttpError) {
        const error = game.i18n.format(e.displayMessage, {user});
        ui.notifications.error(error);
      }
      else {
        ui.notifications.error(e);
      }
      button.disabled = false;
      return;
    }

    // Redirect on success
    ui.notifications.info(game.i18n.format(response.message, {user}));
    setTimeout(() => window.location.href = response.redirect, 500 );
  }
}

/**
 * The Setup Authentication Form
 * @extends {Application}
 */
class SetupAuthenticationForm extends Application {
  /** @inheritdoc */
	static get defaultOptions() {
	  return foundry.utils.mergeObject(super.defaultOptions, {
	    id: "setup-authentication",
      template: "templates/setup/setup-authentication.html",
      popOut: false
    });
  }
}

/**
 * The Setup screen configuration form application.
 * @alias ui.setup
 */
class SetupConfigurationForm extends Application {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "setup-configuration",
      classes: ["dark"],
      template: "templates/setup/setup-config.html",
      popOut: false,
      scrollY: ["#world-list", "#system-list", "#module-list"],
      tabs: [{navSelector: ".tabs", contentSelector: ".content", initial: "worlds"}],
      filters: [
        {inputSelector: "#world-filter", contentSelector: "#world-list"},
        {inputSelector: "#system-filter", contentSelector: "#system-list"},
        {inputSelector: "#module-filter", contentSelector: "#module-list"}
      ]
    });
  }

  /* -------------------------------------------- */

  /**
   * Track the button elements which represent updates for different named packages
   * @type {HTMLElement|null}
   * @private
   */
  _progressButton = null;

  /**
   * Keeps track of which packages were updated to enable displaying their state on redraw
   * @type {Set<string>}
   * @private
   */
  _updatedPackages = new Set();

  /**
   * The name of the currently active tab.
   * @type {string}
   */
  get activeTab() {
    return this._tabs[0].active;
  }

  /* -------------------------------------------- */

  /** @override */
  _onSearchFilter(event, query, rgx, html) {
    let anyMatch = !query;
    for ( let li of html.children ) {
      if ( !query ) {
        li.classList.remove("hidden");
        continue;
      }
      const id = li.dataset.packageId;
      const title = li.querySelector(".package-title")?.textContent;
      const match = rgx.test(id) || rgx.test(SearchFilter.cleanQuery(title));
      li.classList.toggle("hidden", !match);
      if ( match ) anyMatch = true;
    }
    const empty = !anyMatch || !html.children.length;
    html.classList.toggle("empty", empty);
    if ( !anyMatch ) {
      let type;
      switch ( html.id ) {
        case "world-list": type = "world"; break;
        case "system-list": type = "system"; break;
        case "module-list": type = "module"; break;
      }
      html.previousElementSibling.innerHTML =
        game.i18n.format("SETUP.PackagesNoResults", { type: type, name: query});
    }
    html.previousElementSibling.classList.toggle("hidden", anyMatch);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onChangeTab(event, tabs, active) {
    super._onChangeTab(event, tabs, active);
    this._searchFilters.forEach(f => { // Clear the search filter.
      if ( f._input ) f._input.value = "";
      f.filter(null, "");
    });
    ui.setup.element.find(".tab.active .filter > input").trigger("focus"); // Trigger filter focus
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options={}) {
    options = game.data.options;
    options.upnp = options.upnp !== false;

    // Helper functions
    const authorLabel = authors => game.i18n.localize(`Author${authors.size > 1 ? "Pl" : ""}`);
    const formatAuthors = p => {
      if ( p.authors.length ) p.authors = p.authors.map(a => {
        if ( a.url ) return `<a href="${a.url}" target="_blank">${a.name}</a>`;
        return a.name;
      }).join(", ");
    };
    const codes = CONST.PACKAGE_AVAILABILITY_CODES;

    // Prepare Systems
    const systems = game.systems.map(system => {
      const s = system.toObject();
      s.locked = system.locked;
      s.labels = {authors: authorLabel(system), ...system.getAvailabilityLabels()};
      formatAuthors(s);
      s.updated = this._updatedPackages.has(s.id);
      s.path = `${game.data.options.dataPath}/Data/systems/${s.id}/`;
      return s;
    }).sort((a, b) => a.title.localeCompare(b.title));

    // Prepare Modules
    const modules = game.modules.map(module => {
      const m = module.toObject();
      m.locked = module.locked;
      m.labels = {authors: authorLabel(module), ...module.getAvailabilityLabels()};
      formatAuthors(m);
      const required = (m?.relationships?.requires ?? []).reduce((arr, d) => {
        if ( d?.id ) arr.push(d.id);
        return arr;
      }, []);
      m.relationships = {requires: required.length ? required : null};
      m.updated = this._updatedPackages.has(m.id);
      m.path = `${game.data.options.dataPath}/Data/modules/${m.id}/`;
      return m;
    }).sort((a, b) => a.title.localeCompare(b.title));

    // Prepare Worlds
    const worlds = game.worlds.map(world => {
      const w = world.toObject();
      w.shortDesc = TextEditor.previewHTML(w.description);
      w.system = game.systems.get(w.system);
      w.labels = {authors: authorLabel(world), ...world.getAvailabilityLabels()};
      formatAuthors(w);
      w.updated = this._updatedPackages.has(w.id);
      w.path = `${game.data.options.dataPath}/Data/worlds/${w.id}/`;

      // World availability takes into account System availability
      w.available = world.availability <= codes.REQUIRES_UPDATE;
      return w;
    }).sort((a, b) => a.title.localeCompare(b.title));

    // Return data for rendering
    const coreVersion = game.version;
    const versionDisplay = game.release.display;
    const canReachInternet = game.data.addresses.remote;
    const couldReachWebsite = game.data.coreUpdate.couldReachWebsite;
    return {
      coreVersion: coreVersion,
      release: game.release,
      coreVersionHint: game.i18n.format("SETUP.CoreVersionHint", {versionDisplay}),
      noSystems: !systems.length,
      systems: systems,
      modules: modules,
      worlds: worlds,
      languages: game.data.languages,
      options: options,
      adminPassword: game.data.passwordString,
      updateChannels: Object.entries(CONST.SOFTWARE_UPDATE_CHANNELS).reduce((obj, c) => {
        obj[c[0]] = game.i18n.localize(c[1]);
        return obj;
      }, {}),
      updateChannelHints: Object.entries(CONST.SOFTWARE_UPDATE_CHANNELS).reduce((obj, c) => {
        obj[c[0]] = game.i18n.localize(`${c[1]}Hint`);
        return obj;
      }, {}),
      coreUpdate: game.data.coreUpdate.hasUpdate ? game.i18n.format("SETUP.UpdateAvailable", game.data.coreUpdate) : false,
      canReachInternet: canReachInternet,
      couldReachWebsite: couldReachWebsite,
      slowResponse: game.data.coreUpdate.slowResponse,
      updateButtonEnabled: canReachInternet && couldReachWebsite
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, options) {
    await loadTemplates(["templates/setup/parts/package-tags.html"]);
    await super._render(force, options);
    ui.config = (new ApplicationConfigurationForm(game.data.options)).render(true);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Create or Edit World
    html.find("button#create-world, button.edit-world").on("click", this._onWorldConfig.bind(this));

    // Generic Action Buttons
    html.on("click", "button[data-action]", this._onActionButton.bind(this));

    // Install Package
    html.find("button.install-package").on("click", this.#onInstallPackageDialog.bind(this));

    // Update Package
    html.find("button.update").on("click", this.#onUpdatePackage.bind(this));

    // Update All Packages
    html.find("button.update-packages").on("click", this.#onUpdatePackages.bind(this));

    // Uninstall Package
    html.find("button.uninstall").on("click", this._onUninstallPackage.bind(this));

    // Change Update Channel
    html.find("select[name='updateChannel']").on("change", this._onChangeChannel.bind(this));

    // Update Core
    html.find("button#update-core").on("click", this._onCoreUpdate.bind(this));

    // Tours
    html.find("a.launch-tour").on("click", this.#onStartTour.bind(this));

    // Lock
    html.find("button.lock-toggle").on("click", this.#onToggleLock.bind(this));

    html.find(".tab.active .filter > input").trigger("focus");

    html.on("click", "a.system-install", event => this.#onClickInstall(event, "system"));
    html.on("click", "a.module-install", event => this.#onClickInstall(event, "module"));
    html.on("click", "a.world-install", event => this.#onClickInstall(event, "world"));
  }

  /* -------------------------------------------- */

  /**
   * Post the setup configuration form
   * @param {object} requestData    An object of data which should be included with the POST request
   * @param {object} requestOptions An object of options passed to the fetchWithTimeout method
   * @returns {Promise<object>}     A Promise resolving to the returned response data
   * @throws                        An error if the request was not successful
   * @internal
   */
  async _post(requestData, requestOptions={}) {

    // Post the request and handle redirects
    let responseData;
    try {
      const response = await foundry.utils.fetchWithTimeout(Setup.setupURL, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(requestData)
      }, requestOptions);
      if ( response.redirected ) return window.location.href = response.url;
      responseData = await response.json();
    } catch(err) {
      ui.notifications.error(err, {permanent: true});
      throw err;
    }

    // Handle server-side errors
    if ( responseData.error ) {
      const message = game.i18n.localize(responseData.error);
      const err = new Error(message);
      err.stack = responseData.stack;
      ui.notifications.error(err, {permanent: true});
      throw err;
    }
    return responseData;
  }

  /* -------------------------------------------- */

  /**
   * Reload the setup view by re-acquiring setup data and re-rendering the form
   * @private
   */
  async reload() {
    this._progressButton = null;
    return Setup.getData(game.socket, game.view).then(setupData => {
      foundry.utils.mergeObject(game.data, setupData);
      game.setupPackages(setupData);
      this.refresh();
    });
  }

  /* -------------------------------------------- */

  /**
   * Refresh this application UI by re-rendering it and other related applications.
   */
  refresh() {
    this.render();
    Object.values(ui.windows).forEach(app => {
      if ( app instanceof InstallPackage ) app.render();
    });
  }

  /* -------------------------------------------- */

  /**
   * Generic button handler for the setup form which submits a POST request including any dataset on the button itself
   * @param {MouseEvent} event    The originating mouse click event
   * @returns {Promise}
   * @private
   */
  async _onActionButton(event) {
    event.preventDefault();

    // Construct data to post
    const button = event.currentTarget;
    button.disabled = true;
    const data = foundry.utils.deepClone(button.dataset);
    const requestOptions = {};

    // Warn about world migration
    switch ( data.action ) {
      case "launchWorld":
        const world = game.worlds.get(data.world);
        requestOptions.timeoutMs = null;
        const confirm = await this.#displayWorldMigrationInfo(world);
        if ( !confirm ) return button.disabled = false;
        break;
    }

    // Submit the post request
    const response = await this._post(data, requestOptions);
    button.disabled = false;
    return response;
  }

  /* -------------------------------------------- */

  async #displayWorldMigrationInfo(world) {
    if ( !world ) return false;
    if ( !foundry.utils.isNewerVersion(game.release.version, world.coreVersion) ) return true;

    // Prompt that world migration will be required
    const system = game.systems.get(world.system);
    const title = game.i18n.localize("SETUP.WorldMigrationRequiredTitle");
    const disableModules = game.release.isGenerationalChange(world.compatibility.verified);
    const content = [
      game.i18n.format("SETUP.WorldMigrationRequired", {
        world: world.title,
        oldVersion: world.coreVersion,
        newVersion: game.release
      }),
      system.availability !== 0 ? game.i18n.format("SETUP.WorldMigrationSystemUnavailable", {
        system: system.title,
        systemVersion: system.version
      }) : "",
      disableModules ? game.i18n.localize("SETUP.WorldMigrationDisableModules") : "",
      game.i18n.localize("SETUP.WorldMigrationBackupPrompt")
    ].filterJoin("");

    // Present the confirmation dialog
    const confirm = await Dialog.wait({
      title, content, default: "no",
      buttons: {
        yes: {
          icon: '<i class="fa-solid fa-laptop-arrow-down"></i>',
          label: game.i18n.localize("SETUP.WorldMigrationBegin"),
          callback: () => true
        },
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("Cancel"),
          callback: () => false
        }
      },
      close: () => false
    });

    // Notify migration in progress
    if ( confirm ) {
      const msg = game.i18n.format("SETUP.WorldMigrationInProcess", {version: game.release});
      ui.notifications.info(msg, {permanent: true});
    }
    return confirm;
  }

  /* -------------------------------------------- */

  /**
   * Begin creation of a new World using the config form
   * @param {MouseEvent} event    The originating mouse click event
   * @private
   */
  _onWorldConfig(event) {
    event.preventDefault();
    const button = event.currentTarget;
    let world;
    const options = {};

    // Edit an existing World
    if ( button.dataset.world ) {
      world = game.worlds.get(button.dataset.world);
    }

    // Create a new World
    else {
      if ( !game.systems.size ) return ui.notifications.warn(game.i18n.localize("SETUP.YouMustInstallASystem"));
      options.create = true;
      world = new World({name: "1", title: "1", system: "1", coreVersion: game.release.version});
      world.id = world.title = world.system = "";
    }

    // Render the World configuration application
    new WorldConfig(world, options).render(true);
  }

  /* -------------------------------------------- */

  /**
   * When changing the software update channel, reset the state of the update button and "Force Update" checkbox.
   * Clear results from a prior check to ensure that users don't accidentally perform an update for some other channel.
   * @param {Event} event     The select change event
   */
  async _onChangeChannel(event) {
    const button = document.getElementById("update-core");
    button.value = "updateCheck";
    button.children[1].textContent = game.i18n.localize("SETUP.UpdateCheckFor");
    const check = document.querySelector("input[name='forceUpdate']");
    check.checked = false;
  }

  /* -------------------------------------------- */
  /*  Package Management                          */
  /* -------------------------------------------- */

  /**
   * Handle install button clicks to add new packages
   * @param {Event} event
   * @private
   */
  async #onInstallPackageDialog(event) {
    event.preventDefault();
    let button = this._progressButton = event.currentTarget;
    const list = button.closest(".tab").querySelector(".package-list");
    const type = list.dataset.packageType;
    new InstallPackage({packageType: type, setup: this}).render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle update button press for a single Package
   * @param {Event} event
   * @private
   */
  async #onUpdatePackage(event) {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;

    // Get the requested package
    let pkg = this.#getPackageFromButton(button);
    if ( !pkg?.manifest ) return;

    // Inquire with the server for updates
    if ( button.dataset.state === "check" ) {
      let data = await this.#updateCheckOne(pkg.type, pkg.id, button);
      let manifest = data.manifest;

      // Handle non-update states
      switch ( data.state ) {
        case "error":
          return ui.notifications.error(data.error, {permanent: true});
        case "warning":
          return ui.notifications.warn(data.warning);
        case "sidegrade":
          return ui.setup?.reload();
        case "trackChange":
          const accepted = await this.#promptTrackChange(pkg, data.trackChange);
          if ( accepted ) {
            manifest = data.trackChange.manifest;
            data.state = "update";
          }
          break;
      }

      // Perform the update
      if ( data.state === "update" ) return this.#updateDownloadOne(pkg.type, pkg.id, button, manifest);
    }
  }

  /* -------------------------------------------- */

  /**
   * Prompt the user to use a new Package track it if they haven't previously declined.
   * @param {BasePackage} pkg                                     The Package being updated
   * @param {{manifest: string, version: string}} trackChange     A recommended track change provided by the server
   * @returns {Promise<boolean>}                                  Whether the recommended track change was accepted
   * @private
   */
  async #promptTrackChange(pkg, trackChange) {
    let declinedManifestUpgrades = game.settings.get("core", "declinedManifestUpgrades");
    let declinedForVersion = declinedManifestUpgrades[pkg.id] === pkg.version;
    if ( declinedForVersion ) return false;

    // Display prompt
    let content = await renderTemplate("templates/setup/manifest-update.html", {
      localManifest: pkg.manifest,
      localTitle: game.i18n.format("SETUP.PriorManifestUrl", {version: pkg.version}),
      remoteManifest: trackChange.manifest,
      remoteTitle: game.i18n.format("SETUP.UpdatedManifestUrl", {version: trackChange.version}),
      package: pkg.title
    });
    let accepted = await Dialog.confirm({
      title: `${pkg.title} ${game.i18n.localize("SETUP.ManifestUpdate")}`,
      content: content,
      yes: () => {
        delete declinedManifestUpgrades[pkg.id];
        return true;
      },
      no: () => {
        declinedManifestUpgrades[pkg.id] = pkg.version;
        return false;
      },
      defaultYes: true
    });
    game.settings.set("core", "declinedManifestUpgrades", declinedManifestUpgrades);
    return accepted;
  }

  /* -------------------------------------------- */

  /**
   * Traverses the HTML structure to find the Package this button belongs to
   * @param {HTMLElement} button      The clicked button
   * @returns {Promise<BasePackage>}  A Package
   * @private
   */
  #getPackageFromButton(button) {
    let li = button.closest("li.package");
    let id = li.dataset.packageId;
    let type = li.closest("ul.package-list").dataset.packageType;
    return game[`${type}s`].get(id, {strict: true});
  }

  /* -------------------------------------------- */

  /**
   * @typedef {object} PackageCheckResult
   * @property {string} type                                         The Package Type
   * @property {string} id                                           The Package Id
   * @property {HTMLElement} button                                  The update button for the Package
   * @property {string} state                                        The State of the check, from [ "error", "sidegrade", "trackChange", "warning", "update", "current", "unknown" ]
   * @property {string} [error]                                      An error to display, if any
   * @property {string} [warning]                                    A warning to display, if any
   * @property {manifest: string, version: string} [trackChange]     The suggested track change, if any
   * @property {string} [manifest]                                   The manifest of the Update, if any
   */

  /**
   * Execute upon an update check for a single Package
   * @param {string} type         The package type to check
   * @param {string} id           The package id to check
   * @param {HTMLElement} button  The update button for the package
   * @returns {Promise<PackageCheckResult>}    The status of the update check
   * @private
   */
  async #updateCheckOne(type, id, button) {
    button.disabled = true;
    const checkData = {type: type, id: id, button: button, state: "unknown"};

    // Check whether an update is available
    let responseData;
    let manifestData;
    try {
      responseData = await Setup.checkPackage({type, id});
      manifestData = responseData.remote;
    } catch(err) {
      checkData.state = "error";
      checkData.error = game.i18n.localize("PACKAGE.UpdateCheckTimedOut");
      button.disabled = false;
      return checkData;
    }

    // Returned error data
    if ( responseData.error ) {
      checkData.state = "error";
      checkData.error = responseData.error;
      return checkData;
    }

    // Metadata sidegrade performed
    if ( responseData.hasSidegraded ) {
      button.dataset.state = checkData.state = "sidegrade";
      return checkData;
    }

    // Track change suggested
    if ( responseData.trackChange ) {
      button.dataset.state = checkData.state = "trackChange";
      checkData.trackChange = responseData.trackChange;
      checkData.manifest = responseData.trackChange.manifest;
      return checkData;
    }

    const availability = responseData.availability;
    const codes = CONST.PACKAGE_AVAILABILITY_CODES;

    // Unsupported updates
    const wrongCore = [codes.REQUIRES_CORE_UPGRADE_STABLE, codes.REQUIRES_CORE_UPGRADE_UNSTABLE];
    if ( responseData.isUpgrade && wrongCore.includes(availability) ) {
      button.innerHTML = `<i class="fas fa-ban"></i><label>${game.i18n.format("SETUP.PackageStatusBlocked")}</label>`;
      checkData.state = "warning";
      if ( availability === codes.REQUIRES_CORE_UPGRADE_UNSTABLE ) {
        checkData.warning = game.i18n.format("SETUP.PackageUpdateCoreUnstable", {
          id: manifestData.id,
          vmin: manifestData.compatibility.minimum
        });
      } else {
        checkData.warning = game.i18n.format("SETUP.PackageUpdateCoreUpdateNeeded", {
          id: manifestData.id,
          vmin: manifestData.compatibility.minimum,
          vcur: game.version
        });
      }
      return checkData;
    }

    // Available updates
    if ( responseData.isUpgrade && (availability === codes.AVAILABLE || availability === codes.REQUIRES_UPDATE) ) {
      const label = game.i18n.format("SETUP.PackageStatusUpdate");
      button.innerHTML = `<i class="fas fa-download"></i><label>${label}</label>`;
      button.dataset.state = checkData.state = "update";
      checkData.manifest = manifestData.manifest;
      return checkData;
    }

    // Packages which are already current
    const label = game.i18n.format("SETUP.PackageStatusCurrent");
    checkData.state = "current";
    button.innerHTML = `<i class="fas fa-check"></i><label>${label}</label>`;
    return checkData;
  }

  /* -------------------------------------------- */

  /**
   * Execute upon an update download for a single Package
   * Returns a Promise which resolves once the download has successfully started
   * @param {string} type         The package type to install
   * @param {string} id           The package id to install
   * @param {HTMLElement} button  The Download button
   * @param {string} manifestUrl  The URL of the source manifest
   * @returns {Promise<object>}   Installed package manifest data
   * @private
   */
  async #updateDownloadOne(type, id, button, manifestUrl) {
    this._progressButton = button;
    const label = game.i18n.format("SETUP.PackageStatusUpdating");
    this._progressButton.innerHTML = `<i class="fas fa-spinner fa-pulse"></i><label>${label}</label>`;
    const packageData = await Setup.installPackage({type, id: id, manifest: manifestUrl}, data => {
      this.updateProgressBar(data);
      this.updateProgressButton(data);
    });
    this._updatedPackages.add(packageData.id);
    this._progressButton = null;
    return packageData;
  }

  /* -------------------------------------------- */

  /**
   * Handle uninstall button clicks to remove existing packages
   * @param {Event} event
   * @private
   */
  _onUninstallPackage(event) {
    event.preventDefault();

    // Disable the button
    let button = event.currentTarget;
    button.disabled = true;

    // Obtain the package metadata
    const li = button.closest(".package");
    const id = li.dataset.packageId;
    const type = li.closest(".package-list").dataset.packageType;

    // Access the installed package and its index in the source data
    const cls = {world: World, system: System, module: Module}[type];
    const pkg = game[cls.collection].get(id);

    // Provide a deletion confirmation warning
    // For worlds, require the user to provide a deletion code
    // Based on https://stackoverflow.com/a/8084248
    const title = pkg.title;
    let warning = `<p>${game.i18n.format("SETUP.PackageDeleteConfirm", {type: type.titleCase(), title})}</p>`;
    const code = (Math.random() + 1).toString(36).substring(7, 11);
    if ( type === "world" ) {
      warning += `<p class="notification">${game.i18n.localize("SETUP.WorldDeleteConfirm1")}</p>`;
      warning += `<p>${game.i18n.format("SETUP.WorldDeleteConfirm2")}<b>${code}</b></p>`;
      warning += "<p><input id=\"delete-confirm\" type=\"text\" required autocomplete=\"off\"></p>";
    } else {
      warning += `<p class="notification">${game.i18n.localize("SETUP.PackageDeleteNoUndo")}</p>`;
    }

    // Confirm deletion request
    Dialog.confirm({
      title: game.i18n.format("SETUP.PackageDeleteTitle", {type: type.titleCase(), title}),
      content: warning,
      yes: async html => {

        // Confirm World deletion
        if ( type === "world" ) {
          const confirm = html.find("#delete-confirm").val();
          if ( confirm !== code ) {
            return ui.notifications.error("SETUP.PackageDeleteWorldConfirm", {localize: true});
          }
        }

        // Submit the server request
        const response = await Setup.uninstallPackage({type, id});
        if ( response.error ) {
          const err = new Error(response.error);
          err.stack = response.stack;
          ui.notifications.error(`${game.i18n.localize("SETUP.UninstallFailure")}: ${err.message}`);
          console.error(err);
        } else {
          ui.notifications.info(`${type.titleCase()} ${id} ${game.i18n.localize("SETUP.UninstallSuccess")}.`);
          pkg.uninstall();
        }

        // Reload setup data
        ui.setup.reload();
      }
    }).then(() => button.disabled = false);
  }

  /* -------------------------------------------- */

  /**
   * Execute upon an update-all workflow to update all packages of a certain type
   * @param {Event} event
   * @private
   */
  async #onUpdatePackages(event) {
    event.preventDefault();
    let button = event.currentTarget;
    button.disabled = true;
    const icon = button.querySelector("i");
    icon.className = "fas fa-spinner fa-pulse";
    let ol = $(".tab.active .package-list");
    let type = ol.data("packageType");

    // Get Packages
    let packages = [];
    ol.children(".package").each((i, li) => {
      const id = li.dataset.packageId;
      const pack = game[`${type}s`].get(id);
      if ( pack && pack.manifest && !pack.locked ) packages.push({
        id: id,
        status: "none",
        button: li.querySelector("button.update")
      });
    });

    // Ensure the package cache is warm
    await Setup.warmPackages({type});

    // Check for updates in parallel
    let shouldReload = false;
    const checks = [];
    for ( let [i, p] of packages.entries() ) {
      const check = this.#updateCheckOne(type, p.id, p.button);
      checks.push(check);
      if (((i+1) % 10) === 0) await check; // Batch in groups of 10
    }
    /** @type PackageCheckResult[] */
    const checkedPackages = await Promise.all(checks);

    // Execute updates one at a time
    let updateLog = [];
    for ( const p of checkedPackages ) {
      const pack = game[`${p.type}s`].get(p.id);
      if ( p.state === "error" ) updateLog.push({package: pack, action: game.i18n.localize("Error"), actionClass: "fa-exclamation-circle", description: p.error});
      else if ( p.state === "warning" ) updateLog.push({package: pack, action: game.i18n.localize("Warning"), actionClass: "fa-exclamation-triangle", description: p.warning});
      else if ( p.state === "sidegrade" ) shouldReload = true;
      if ( !(p.state === "update" || p.state === "trackChange") ) continue;
      let manifest = p.manifest;
      let shouldUpdate = true;
      if ( p.trackChange ) {
        shouldUpdate = await this.#promptTrackChange(pack, p.trackChange);
        manifest = p.trackChange.manifest;
      }
      if ( shouldUpdate ) {
        try {
          let updated = await this.#updateDownloadOne(type, p.id, p.button, manifest);
          if ( p.state !== "sidegrade" ) {
            updateLog.push({
              package: pack,
              action: game.i18n.localize("Update"),
              actionClass: "fa-check-circle",
              description: `${pack.version} ➞ ${updated.version}`
            });
            shouldReload = true;
          }
        }
        catch(exception) {
          updateLog.push({package: pack, action: game.i18n.localize("Error"), actionClass: "fa-exclamation-circle", description: exception.message});
        }
      }
      p.available = false;
    }

    // Display Updatelog
    if ( updateLog.length > 0 ) {
      let content = await renderTemplate("templates/setup/updated-packages.html", {
        changed: updateLog
      });
      await Dialog.prompt({
        title: game.i18n.localize("SETUP.UpdatedPackages"),
        content: content,
        callback: () => {},
        options: {width: 600},
        rejectClose: false
      });
    }
    if (shouldReload && ui.setup) {
      await ui.setup.reload();
    }
    icon.className = "fas fa-cloud-download-alt";
    button.disabled = false;
  }

  /* -------------------------------------------- */

  /**
   * Handle lock button clicks to lock / unlock a Package
   * @param {Event} event
   * @private
   */
  async #onToggleLock(event) {
    event.preventDefault();

    // Submit a lock request and update package data
    const button = event.currentTarget;
    const pkg = await this.#getPackageFromButton(button);
    const shouldLock = !pkg.locked;
    await this._post({action: "lockPackage", type: pkg.type, id: pkg.id, shouldLock});
    pkg.locked = shouldLock;

    // Update the setup interface
    let icon = button.querySelector(".fas");
    if (shouldLock) {
      button.classList.replace("lock", "unlock");
      icon.classList.replace("fa-unlock", "fa-lock");
    }
    else {
      button.classList.replace("unlock", "lock");
      icon.classList.replace("fa-lock", "fa-unlock");
    }
    let li = button.closest("li.package");
    let uninstall = li.querySelector(".uninstall");
    uninstall.hidden = shouldLock;
    let update = li.querySelector(".update");
    if ( update ) {
      update.hidden = shouldLock;
    }
  }

  /* -------------------------------------------- */

  /**
   * Spawn the system install dialog with a given system name already filled in.
   * @param {TriggeredEvent} event  The triggering event.
   * @private
   */
  #onClickInstall(event, type) {
    event.preventDefault();
    const query = event.currentTarget.dataset.query;
    new InstallPackage({packageType: type, setup: this, filterValue: query}).render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle a click on a Tour button
   * @param {TriggeredEvent} event  The triggering event
   * @private
   */
  async #onStartTour(event) {
    event.preventDefault();
    const tourName = event.currentTarget.dataset.tour;
    let tour = game.tours.get(`core.${tourName}`);
    if ( !tour ) return console.error(`${event.currentTarget.dataset.tour} not recognized as a launchable Tour`);
    await tour.start();
  }

  /* -------------------------------------------- */
  /*  Core Software Update                        */
  /* -------------------------------------------- */

  /**
   * Handle button clicks to update the core VTT software
   * @param {Event} event
   * @private
   */
  async _onCoreUpdate(event) {
    const button = event.currentTarget;
    const form = button.form;
    const label = button.children[1];

    // Disable the form
    button.disabled = true;
    form.disabled = true;

    const progress = data => {
      if ( ["UpdateComplete", "Error"].includes(data.step) ) {
        // After the update has completed or was interrupted due to error, remove any listeners and update the UI
        // appropriately.
        Setup._removeProgressListener(progress);

        // Final form updates
        button.disabled = true;
        form.disabled = true;
        const icon = button.querySelector("i");
        icon.className = data.step === "UpdateComplete" ? "fas fa-check" : "fas fa-times";

        // Display a notification message
        const level = data.step === "UpdateComplete" ? "info" : "error";
        ui.notifications[level](data.message, {localize: true});
        return;
      }
      this.updateProgressBar(data);
      this.updateProgressButton(data);
      UpdateNotes.updateButton(data);
      ui.updateNotes.setPosition({height: "auto"});
    };

    // Condition next step based on action
    if ( button.value === "updateDownload" ) {
      this._progressButton = button;
      // Attach a listener to accept progress events from the server after the update process has begun.
      Setup._addProgressListener(progress);
    }

    // Post the update request
    const requestData = {
      action: button.value,
      updateChannel: form.querySelector("select[name='updateChannel']").value,
      forceUpdate: form.querySelector("input[name='forceUpdate']").checked
    };
    const response = await this._post(requestData).catch(err => {
      button.disabled = false;
      form.disabled = false;
      throw err;
    });
    if ( response.info || response.warn ) {
      button.disabled = false;
      form.disabled = false;
      return response.info
        ? ui.notifications.info(response.info, {localize: true})
        : ui.notifications.warn(response.warn, {localize: true});
    }

    // Proceed to download step
    if ( button.value === "updateCheck" ) {
      let releaseData = new foundry.config.ReleaseData(response);
      ui.notifications.info(game.i18n.format("SETUP.UpdateInfoAvailable", {display: releaseData.display}));
      label.textContent = game.i18n.format("SETUP.UpdateButtonDownload", {display: releaseData.display});
      button.value = "updateDownload";
      button.disabled = false;
      if ( response.notes ) new UpdateNotes(response).render(true);
      if ( response.willDisableModules ) {
        ui.notifications.warn(game.i18n.format("SETUP.UpdateWarningWillDisable", {
          nIncompatible: game.modules.filter(m => m.incompatible).length,
          nModules: game.modules.size
        }), {permanent: true});
      }
    }
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  /**
   * Update the display of an installation progress bar for a particular progress packet
   * @param {object} data   The progress update data
   */
  updateProgressBar(data) {
    const tabName = data.type === "core" ? "update" : `${data.type}s`;
    const tab = this.element.find(`.tab[data-tab="${tabName}"]`);
    if ( !tab.hasClass("active") ) return;
    const progress = tab.find(".progress-bar");
    progress.css("visibility", "visible");

    // Update bar and label position
    let pl = `${data.pct}%`;
    let bar = progress.children(".bar");
    bar.css("width", pl);
    let barLabel = progress.children(".pct");
    barLabel.text(pl);
    barLabel.css("left", pl);
  }

  /* -------------------------------------------- */

  /**
   * Update installation progress for a particular button which triggered the action
   * @param {object} data   The progress update data
   */
  updateProgressButton(data) {
    const button = this._progressButton;
    if ( !button ) return;
    button.disabled = data.pct < 100;

    // Update Icon
    const icon = button.querySelector("i");
    if ( data.pct < 100 ) icon.className = "fas fa-spinner fa-pulse";

    // Update label
    const label = button.querySelector("label");
    const step = game.i18n.localize(data.step);
    if ( label ) label.textContent = step;
    else button.textContent = ` ${step}`;
  }
}

/**
 * The client side Updater application
 * This displays the progress of patching/update progress for the VTT
 * @type {Application}
 */
class UpdateNotes extends Application {
  constructor(target, options) {
    super(options);
    this.target = target;
    this.candidateReleaseData = new foundry.config.ReleaseData(this.target);
    ui.updateNotes = this;
  }

  /* ----------------------------------------- */

  /** @override */
	static get defaultOptions() {
	  return mergeObject(super.defaultOptions, {
	    id: "update-notes",
      template: "templates/setup/update-notes.html",
      width: 600
    });
  }

  /* ----------------------------------------- */

  /** @override */
  get title() {
    return `Update Notes - Foundry Virtual Tabletop ${this.candidateReleaseData.display}`;
  }

  /* ----------------------------------------- */

  /** @override */
  async getData(options={}) {
    return {
      notes: this.target.notes
    }
  }

  /* ----------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find("button").click(ev => {
      ev.preventDefault();
      ev.currentTarget.disabled = true;
      document.getElementById("update-core").click();
    });
  }

  /* ----------------------------------------- */

  /**
   * Update the button at the footer of the Update Notes application to reflect the current status of the workflow.
   * @param {object} progressData       Data supplied by SetupConfig#_onCoreUpdate
   */
  static updateButton(progressData) {
    const notes = ui.updateNotes;
    if ( !notes?.rendered ) return;
    const button = notes.element.find("button")[0];
    if ( !button ) return;
    const icon = button.querySelector("i");
    icon.className = progressData.pct < 100 ? "fas fa-spinner fa-pulse" : "fas fa-check";
    const label = button.querySelector("label");
    label.textContent = game.i18n.localize(progressData.step);
  }
}

/**
 * The User Management setup application.
 * @param {Users} object                      The {@link Users} object being configured.
 * @param {FormApplicationOptions} [options]  Application configuration options.
 */
class UserManagement extends FormApplication {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "manage-players",
      classes: ["dark"],
      template: "templates/setup/user-management.html",
      popOut: false,
      closeOnSubmit: false,
      scrollY: ["#player-list"]
    });
  }

  /* -------------------------------------------- */

  /**
   * The template path used to render a single user entry in the configuration view
   * @type {string}
   */
  static USER_TEMPLATE = "templates/setup/player-create.html";

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(...args) {
    await getTemplate(this.constructor.USER_TEMPLATE);
    return super._render(...args);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    return {
      user: game.user,
      users: this.object,
      roles: UserManagement._getRoleLabels(),
      options: this.options,
      userTemplate: this.constructor.USER_TEMPLATE,
      passwordString: game.data.passwordString
    };
  }

  /* -------------------------------------------- */

  /**
   * Get a mapping of role IDs to labels that should be displayed
   * @private
   */
  static _getRoleLabels() {
    return Object.entries(CONST.USER_ROLES).reduce((obj, e) => {
      obj[e[1]] = game.i18n.localize(`USER.Role${e[0].titleCase()}`);
      return obj;
    }, {});
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.find("button[data-action]").click(UserManagement._onAction);
    html.find("input.password").keydown(UserManagement._onPasswordKeydown);
    html.find("label.show").click(UserManagement._onShowPassword);
    html.on("click", ".user-delete", UserManagement._onUserDelete);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {

    // Construct updates array
    const userData = foundry.utils.expandObject(formData).users;
    const updates = Object.entries(userData).reduce((arr, e) => {
      const [id, data] = e;

      // Identify changes
      const user = game.users.get(id);
      const diff = foundry.utils.diffObject(user.toObject(), data);
      if ( data.password === game.data.passwordString ) delete diff.password;
      else diff.password = data.password;

      // Register changes for update
      if ( !foundry.utils.isEmpty(diff) ) {
        diff._id = id;
        arr.push(diff);
      }
      return arr;
    }, []);

    // The World must have at least one Gamemaster
    if ( !Object.values(userData).some(u => u.role === CONST.USER_ROLES.GAMEMASTER) ) {
      return ui.notifications.error("USERS.NoGMError", {localize: true});
    }

    // Update all users and redirect
    try {
      await User.updateDocuments(updates, {diff: false});
      ui.notifications.info("USERS.UpdateSuccess", {localize: true});
      return setTimeout(() => window.location.href = foundry.utils.getRoute("game"), 1000);
    } catch(err) {
      this.render();
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle new user creation event
   * @param {PointerEvent} event      The originating click event
   * @private
   */
  static async _onAction(event) {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;
    switch ( button.dataset.action ) {
      case "create-user":
        await UserManagement._onUserCreate();
        break;
      case "configure-permissions":
        new PermissionConfig().render(true);
        break;
    }
    button.disabled = false;
  }

  /* -------------------------------------------- */

  /**
   * When the user enters some characters into a password field, present them with the "show" label that allows them
   * to see the text they have entered.
   * @param {KeyboardEvent} event     The initiating keydown event
   * @private
   */
  static _onPasswordKeydown(event) {
    if ( ["Shift", "Ctrl", "Alt", "Tab"].includes(event.key) ) return;
    const input = event.currentTarget;
    const show = input.nextElementSibling;
    show.classList.add("visible");
  }

  /* -------------------------------------------- */

  /**
   * Reveal the password that is being configured so the user can verify they have typed it correctly.
   * @param {PointerEvent} event        The initiating mouse click event
   * @private
   */
  static _onShowPassword(event) {
    const label = event.currentTarget;
    const group = label.closest(".form-group");
    const input = group.firstElementChild;
    input.type = input.type === "password" ? "text" : "password";
    label.classList.remove("active");
    if ( input.type === "text" ) label.classList.add("active");
  }

  /* -------------------------------------------- */

  /**
   * Handle creating a new User record in the form
   * @private
   */
  static async _onUserCreate() {

    // Create the new User
    let newPlayerIndex = game.users.size + 1;
    while ( game.users.getName(`Player${newPlayerIndex}` )) { newPlayerIndex++; }
    const user = await User.create({
      name: `Player${newPlayerIndex}`,
      role: CONST.USER_ROLES.PLAYER
    });

    // Render the User's HTML
    const html = await renderTemplate(UserManagement.USER_TEMPLATE, {
      user: user.data,
      roles: this._getRoleLabels()
    });

    // Append the player to the list and restore the button
    $("#player-list").append(html);
  }

  /* -------------------------------------------- */

  /**
   * Handle user deletion event
   * @param {PointerEvent} event      The originating click event
   * @private
   */
  static _onUserDelete(event) {
    event.preventDefault();
    let button = $(event.currentTarget);
    const li = button.parents(".player");
    const user = game.users.get(li.attr("data-user-id"));

    // Craft a message
    let message = `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("USERS.DeleteWarning")}</p>`;
    if (user.isGM) message += `<p class="warning"><strong>${game.i18n.localize("USERS.DeleteGMWarning")}</strong></p>`;

    // Render a confirmation dialog
    new Dialog({
      title: `${game.i18n.localize("USERS.Delete")} ${user.name}?`,
      content: message,
      buttons: {
        yes: {
          icon: '<i class="fas fa-trash"></i>',
          label: game.i18n.localize("Delete"),
          callback: () => {
            user.delete();
            li.slideUp(200, () => li.remove());
          }
        },
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("Cancel")
        }
      },
      default: "yes"
    }).render(true);
  }
}
