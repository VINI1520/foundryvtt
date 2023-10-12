/**
 * An object structure of document types at the top level, with a count of different sub-types for that document type.
 * @typedef {Object<Object<number>>} ModuleSubTypeCounts
 */

/**
 * A class responsible for tracking issues in the current world.
 */
class ClientIssues {
  /**
   * Keep track of valid Documents in the world that are using module-provided sub-types.
   * @type {Map<string, ModuleSubTypeCounts>}
   */
  #moduleTypeMap = new Map();

  /**
   * Keep track of document validation failures.
   * @type {object}
   */
  #documentValidationFailures = {};

  /**
   * @typedef {object} UsabilityIssue
   * @property {string} message   The pre-localized message to display in relation to the usability issue.
   * @property {string} severity  The severity of the issue, either "error", "warning", or "info".
   * @property {object} [params]  Parameters to supply to the localization.
   */

  /**
   * Keep track of any usability issues related to browser or technology versions.
   * @type {Object<UsabilityIssue>}
   */
  #usabilityIssues = {};

  /**
   * The minimum supported resolution.
   * @type {{WIDTH: number, HEIGHT: number}}
   */
  static #MIN_RESOLUTION = {WIDTH: 1024, HEIGHT: 700};

  /**
   * @typedef {object} BrowserTest
   * @property {number} minimum  The minimum supported version for this browser.
   * @property {RegExp} match    A regular expression to match the browser against the user agent string.
   * @property {string} message  A message to display if the user's browser version does not meet the minimum.
   */

  /**
   * The minimum supported client versions.
   * @type {Object<BrowserTest>}
   */
  static #BROWSER_TESTS = {
    Electron: {
      minimum: 24,
      match: /Electron\/(\d+)\./,
      message: "ERROR.ElectronVersion"
    },
    Chromium: {
      minimum: 92,
      match: /Chrom(?:e|ium)\/(\d+)\./,
      message: "ERROR.BrowserVersion"
    },
    Firefox: {
      minimum: 90,
      match: /Firefox\/(\d+)\./,
      message: "ERROR.BrowserVersion"
    },
    Safari: {
      minimum: 15.4,
      match: /Version\/(\d+)\..*Safari\//,
      message: "ERROR.BrowserVersion"
    }
  };

  /* -------------------------------------------- */

  /**
   * Add a Document to the count of module-provided sub-types.
   * @param {string} documentName                The Document name.
   * @param {string} subType                     The Document's sub-type.
   * @param {object} [options]
   * @param {boolean} [options.decrement=false]  Decrement the counter rather than incrementing it.
   */
  #countDocumentSubType(documentName, subType, {decrement=false}={}) {
    if ( !((typeof subType === "string") && subType.includes(".")) ) return;
    const [moduleId, ...rest] = subType.split(".");
    subType = rest.join(".");
    if ( !this.#moduleTypeMap.has(moduleId) ) this.#moduleTypeMap.set(moduleId, {});
    const counts = this.#moduleTypeMap.get(moduleId);
    const types = counts[documentName] ??= {};
    types[subType] ??= 0;
    if ( decrement ) types[subType] = Math.max(types[subType] - 1, 0);
    else types[subType]++;
  }

  /* -------------------------------------------- */

  /**
   * Detect the user's browser and display a notification if it is below the minimum required version.
   */
  #detectBrowserVersion() {
    for ( const [browser, {minimum, match, message}] of Object.entries(ClientIssues.#BROWSER_TESTS) ) {
      const [, version] = navigator.userAgent.match(match) ?? [];
      if ( !Number.isNumeric(version) ) continue;
      if ( Number(version) < minimum ) {
        const err = game.i18n.format(message, {browser, version, minimum});
        ui.notifications?.error(err, {permanent: true, console: true});
        this.#usabilityIssues.browserVersionIncompatible = {
          message,
          severity: "error",
          params: {browser, version, minimum}
        };
      }
      break;
    }
  }

  /* -------------------------------------------- */

  /**
   * Record a reference to a resolution notification ID so that we can remove it if the problem is remedied.
   * @type {number}
   */
  #resolutionTooLowNotification;

  /**
   * Detect the user's resolution and display a notification if it is too small.
   */
  #detectResolution() {
    const {WIDTH: reqWidth, HEIGHT: reqHeight} = ClientIssues.#MIN_RESOLUTION;
    const {innerWidth: width, innerHeight: height} = window;
    if ( (height < reqHeight) || (width < reqWidth) ) {

      // Display a permanent error notification
      if ( ui.notifications && !this.#resolutionTooLowNotification ) {
        this.#resolutionTooLowNotification = ui.notifications.error(game.i18n.format("ERROR.LowResolution", {
          width, reqWidth, height, reqHeight
        }), {permanent: true});
      }

      // Record the usability issue
      this.#usabilityIssues.resolutionTooLow = {
        message: "ERROR.LowResolution",
        severity: "error",
        params: {width, reqWidth, height, reqHeight}
      };
    }

    // Remove an error notification if present
    else {
      if ( this.#resolutionTooLowNotification ) {
        this.#resolutionTooLowNotification = ui.notifications.remove(this.#resolutionTooLowNotification);
      }
      delete this.#usabilityIssues.resolutionTooLow;
    }
  }

  /* -------------------------------------------- */

  /**
   * Detect and display warnings for known performance issues which may occur due to the user's hardware or browser
   * configuration.
   * @internal
   */
  _detectWebGLIssues() {
    const context = canvas.app.renderer.context;
    try {
      const rendererInfo = SupportDetails.getWebGLRendererInfo(context.gl);
      if ( /swiftshader/i.test(rendererInfo) ) {
        ui.notifications.warn("ERROR.NoHardwareAcceleration", {localize: true, permanent: true});
        this.#usabilityIssues.hardwareAccel = {message: "ERROR.NoHardwareAcceleration", severity: "error"};
      }
    } catch ( err ) {
      ui.notifications.warn("ERROR.RendererNotDetected", {localize: true, permanent: true});
      this.#usabilityIssues.noRenderer = {message: "ERROR.RendererNotDetected", severity: "warning"};
    }

    // Verify that WebGL2 is being used.
    if ( !canvas.supported.webGL2 ) {
      ui.notifications.error("ERROR.NoWebGL2", {localize: true, permanent: true});
      this.#usabilityIssues.webgl2 = {message: "ERROR.NoWebGL2", severity: "error"};
    }
  }

  /* -------------------------------------------- */

  /**
   * Add an invalid Document to the module-provided sub-type counts.
   * @param {string} documentName                The Document name.
   * @param {object} source                      The Document's source data.
   * @param {object} [options]
   * @param {boolean} [options.decrement=false]  Decrement the counter rather than incrementing it.
   * @internal
   */
  _countDocumentSubType(documentName, source, options={}) {
    const cls = getDocumentClass(documentName);
    if ( cls.hasTypeData ) this.#countDocumentSubType(documentName, source.type, options);
    for ( const [embeddedName, collection] of Object.entries(cls.metadata.embedded ?? {}) ) {
      if ( !getDocumentClass(embeddedName).hasTypeData ) continue;
      for ( const embedded of source[collection] ) this.#countDocumentSubType(embeddedName, embedded.type, options);
    }
  }

  /* -------------------------------------------- */

  /**
   * Track a validation failure that occurred in a WorldCollection.
   * @param {WorldCollection} collection      The parent collection.
   * @param {object} source                   The Document's source data.
   * @param {DataModelValidationError} error  The validation error.
   * @internal
   */
  _trackValidationFailure(collection, source, error) {
    if ( !(collection instanceof WorldCollection) ) return;
    if ( !(error instanceof foundry.data.validation.DataModelValidationError) ) return;
    const documentName = collection.documentName;
    this.#documentValidationFailures[documentName] ??= {};
    this.#documentValidationFailures[documentName][source._id] = {name: source.name, error};
  }

  /* -------------------------------------------- */

  /**
   * Detect and record certain usability error messages which are likely to result in the user having a bad experience.
   * @internal
   */
  _detectUsabilityIssues() {
    this.#detectResolution();
    this.#detectBrowserVersion();
    window.addEventListener("resize", foundry.utils.debounce(this.#detectResolution.bind(this), 250), {passive: true});
  }

  /* -------------------------------------------- */

  /**
   * Get the Document sub-type counts for a given module.
   * @param {Module|string} module  The module or its ID.
   * @returns {ModuleSubTypeCounts}
   */
  getSubTypeCountsFor(module) {
    return this.#moduleTypeMap.get(module.id ?? module);
  }

  /* -------------------------------------------- */

  /**
   * Retrieve all sub-type counts in the world.
   * @returns {Iterator<string, ModuleSubTypeCounts>}
   */
  getAllSubTypeCounts() {
    return this.#moduleTypeMap.entries();
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the tracked validation failures.
   * @returns {object}
   */
  get validationFailures() {
    return this.#documentValidationFailures;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the tracked usability issues.
   * @returns {Object<UsabilityIssue>}
   */
  get usabilityIssues() {
    return this.#usabilityIssues;
  }

  /* -------------------------------------------- */

  /**
   * @typedef {object} PackageCompatibilityIssue
   * @property {string[]} error    Error messages.
   * @property {string[]} warning  Warning messages.
   */

  /**
   * Retrieve package compatibility issues.
   * @returns {Object<PackageCompatibilityIssue>}
   */
  get packageCompatibilityIssues() {
    return game.data.packageWarnings;
  }
}
