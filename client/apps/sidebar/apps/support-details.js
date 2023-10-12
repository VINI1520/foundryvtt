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
    options.width = 620;
    options.height = "auto";
    return options;
  }

  /* -------------------------------------------- */

  /**
   * Returns the support report data
   * @param options
   * @return {Object|Promise}
   */
  getData(options = {}) {
    let data = super.getData(options);

    // Build report data
    data.report = SupportDetails.generateSupportReport();
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Binds the Support Report copy button
   * @param html
   */
  activateListeners(html) {
    super.activateListeners(html);

    html.find("button[name=copy]").click(() => {
      const supportReport = html.find("#support-report")[0];
      game.clipboard.copyPlainText(supportReport.innerText);
      ui.notifications.info("Report Copied");
    });
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
