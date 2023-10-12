/**
 * Support Info and Report
 * @type {Application}
 */
class SupportDetails extends Application {
  /** @inheritdoc */
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.title = "SUPPORT.Title";
    options.id = "support-details";
    options.template = "templates/sidebar/apps/support-details.html";
    options.width = 780;
    options.height = 680;
    options.resizable = true;
    options.classes = ["sheet"];
    options.tabs = [{navSelector: ".tabs", contentSelector: "article", initial: "support"}];
    return options;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const context = super.getData(options);

    // Build report data
    context.report = SupportDetails.generateSupportReport();

    // Build document issues data.
    context.documentIssues = this._getDocumentValidationErrors();

    // Build module issues data.
    context.moduleIssues = this._getModuleIssues();

    // Build client issues data.
    context.clientIssues = Object.values(game.issues.usabilityIssues).map(({message, severity, params}) => {
      return {severity, message: params ? game.i18n.format(message, params) : game.i18n.localize(message)};
    });

    return context;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.find("button[data-action]").on("click", this._onClickAction.bind(this));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force=false, options={}) {
    await super._render(force, options);
    if ( options.tab ) this._tabs[0].activate(options.tab);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _renderInner(data) {
    await loadTemplates({supportDetailsReport: "templates/sidebar/apps/parts/support-details-report.html"});
    return super._renderInner(data);
  }

  /* -------------------------------------------- */

  /**
   * Handle a button click action.
   * @param {MouseEvent} event  The click event.
   * @protected
   */
  _onClickAction(event) {
    const action = event.currentTarget.dataset.action;
    switch ( action ) {
      case "copy":
        this._copyReport();
        break;
    }
  }

  /* -------------------------------------------- */

  /**
   * Copy the support details report to clipboard.
   * @protected
   */
  _copyReport() {
    const report = document.getElementById("support-report");
    game.clipboard.copyPlainText(report.innerText);
    ui.notifications.info("SUPPORT.ReportCopied", {localize: true});
  }

  /* -------------------------------------------- */

  /**
   * Marshal information on Documents that failed validation and format it for display.
   * @returns {object[]}
   * @protected
   */
  _getDocumentValidationErrors() {
    const context = [];
    for ( const [documentName, documents] of Object.entries(game.issues.validationFailures) ) {
      const cls = getDocumentClass(documentName);
      const label = game.i18n.localize(cls.metadata.labelPlural);
      context.push({
        label,
        documents: Object.entries(documents).map(([id, {name, error}]) => {
          return {name: name ?? id, validationError: error.asHTML()};
        })
      });
    }
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Marshal package-related warnings and errors and format it for display.
   * @returns {object[]}
   * @protected
   */
  _getModuleIssues() {
    const errors = {label: game.i18n.localize("Errors"), issues: []};
    const warnings = {label: game.i18n.localize("Warnings"), issues: []};
    for ( const [moduleId, {error, warning}] of Object.entries(game.issues.packageCompatibilityIssues) ) {
      const label = game.modules.get(moduleId)?.title ?? moduleId;
      if ( error.length ) errors.issues.push({label, issues: error.map(message => ({severity: "error", message}))});
      if ( warning.length ) warnings.issues.push({
        label,
        issues: warning.map(message => ({severity: "warning", message}))
      });
    }
    const context = [];
    if ( errors.issues.length ) context.push(errors);
    if ( warnings.issues.length ) context.push(warnings);
    return context;
  }

  /* -------------------------------------------- */

  /**
   * A bundle of metrics for Support
   * @typedef {Object} SupportReportData
   * @property {number} coreVersion
   * @property {string} systemVersion
   * @property {number} activeModuleCount
   * @property {string} os
   * @property {string} client
   * @property {string} gpu
   * @property {number|string} maxTextureSize
   * @property {string} sceneDimensions
   * @property {number} grid
   * @property {float} padding
   * @property {number} walls
   * @property {number} lights
   * @property {number} sounds
   * @property {number} tiles
   * @property {number} tokens
   * @property {number} actors
   * @property {number} items
   * @property {number} journals
   * @property {number} tables
   * @property {number} playlists
   * @property {number} packs
   * @property {number} messages
   */

  /**
   * Collects a number of metrics that is useful for Support
   * @returns {SupportReportData}
   */
  static generateSupportReport() {

    // Create a WebGL Context if necessary
    let tempCanvas;
    let gl = canvas.app?.renderer?.gl;
    if ( !gl ) {
      const tempCanvas = document.createElement("canvas");
      if ( tempCanvas.getContext ) {
        gl = tempCanvas.getContext("webgl2") || tempCanvas.getContext("webgl") || tempCanvas.getContext("experimental-webgl");
      }
    }
    const rendererInfo = this.getWebGLRendererInfo(gl) ?? "Unknown Renderer";

    // Build report data
    const viewedScene = game.scenes.get(game.user.viewedScene);
    /** @type {SupportReportData} **/
    const report = {
      coreVersion: `${game.release.display}, ${game.release.version}`,
      systemVersion: `${game.system.id}, ${game.system.version}`,
      activeModuleCount: Array.from(game.modules.values()).filter(x => x.active).length,
      performanceMode: game.settings.get("core", "performanceMode"),
      os: navigator.oscpu ?? "Unknown",
      client: navigator.userAgent,
      gpu: rendererInfo,
      maxTextureSize: gl && gl.getParameter ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : "Could not detect",
      hasViewedScene: viewedScene,
      packs: game.packs.size,
    };

    // Attach Document Collection counts
    const reportCollections = [ "actors", "items", "journal", "tables", "playlists", "messages" ];
    for ( let c of reportCollections ) {
      const collection = game[c];
      report[c] = `${collection.size}${collection.invalidDocumentIds.size > 0 ?
        ` (${collection.invalidDocumentIds.size} ${game.i18n.localize("Invalid")})` : ""}`;
    }

    if ( viewedScene ) {
      report.sceneDimensions = `${viewedScene.dimensions.width} x ${viewedScene.dimensions.height}`;
      report.grid = viewedScene.grid.size;
      report.padding = viewedScene.padding;
      report.walls = viewedScene.walls.size;
      report.lights = viewedScene.lights.size;
      report.sounds = viewedScene.sounds.size;
      report.tiles = viewedScene.tiles.size;
      report.tokens = viewedScene.tokens.size;
    }

    // Clean up temporary canvas
    if ( tempCanvas ) tempCanvas.remove();
    return report;
  }

  /* -------------------------------------------- */

  /**
   * Get a WebGL renderer information string
   * @param {WebGLRenderingContext} gl    The rendering context
   * @returns {string}                    The unmasked renderer string
   */
  static getWebGLRendererInfo(gl) {
    if ( navigator.userAgent.match(/Firefox\/([0-9]+)\./) ) {
      return gl.getParameter(gl.RENDERER);
    } else {
      return gl.getParameter(gl.getExtension("WEBGL_debug_renderer_info").UNMASKED_RENDERER_WEBGL);
    }
  }
}
