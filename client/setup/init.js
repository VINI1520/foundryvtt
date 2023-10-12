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
