/**
 * A singleton class dedicated to manage the color spaces associated with the scene and the canvas.
 * @category - Canvas
 */
class CanvasColorManager {
  /**
   * The scene darkness level.
   * @type {number}
   */
  #darknessLevel;

  /**
   * Colors exposed by the manager.
   * @enum {Color}
   */
  colors = {
    darkness: undefined,
    halfdark: undefined,
    background: undefined,
    dim: undefined,
    bright: undefined,
    ambientBrightest: undefined,
    ambientDaylight: undefined,
    ambientDarkness: undefined,
    sceneBackground: undefined,
    fogExplored: undefined,
    fogUnexplored: undefined
  };

  /**
   * Weights used by the manager to compute colors.
   * @enum {number}
   */
  weights = {
    dark: undefined,
    halfdark: undefined,
    dim: undefined,
    bright: undefined
  };

  /**
   * Fallback colors.
   * @enum {Color}
   */
  static #fallbackColors = {
    darknessColor: 0x242448,
    daylightColor: 0xEEEEEE,
    brightestColor: 0xFFFFFF,
    backgroundColor: 0x909090,
    fogUnexplored: 0x000000,
    fogExplored: 0x000000
  };

  /* -------------------------------------------- */

  /**
   * Returns the darkness penalty for the actual scene configuration.
   * @returns {number}
   */
  get darknessPenalty() {
    return this.darknessLevel * CONFIG.Canvas.darknessLightPenalty;
  }

  /* -------------------------------------------- */

  /**
   * Get the darkness level of this scene.
   * @returns {number}
   */
  get darknessLevel() {
    return this.#darknessLevel;
  }

  /* -------------------------------------------- */

  /**
   * Initialize color space pertaining to a specific scene.
   * @param {object} [colors={}]
   * @param {Color|number|string} [colors.backgroundColor]     The background canvas color
   * @param {Color|number|string} [colors.brightestColor]      The brightest ambient color
   * @param {Color|number|string} [colors.darknessColor]       The color of darkness
   * @param {number} [colors.darknessLevel]                    A preview darkness level
   * @param {Color|number|string} [colors.daylightColor]       The ambient daylight color
   * @param {number} [colors.fogExploredColor]                 The color applied to explored areas
   * @param {number} [colors.fogUnexploredColor]               The color applied to unexplored areas
   */
  initialize({backgroundColor, brightestColor, darknessColor, darknessLevel, daylightColor, fogExploredColor,
    fogUnexploredColor}={}) {
    const scene = canvas.scene;

    // Update base ambient colors, and darkness level
    const fbc = CanvasColorManager.#fallbackColors;
    this.colors.ambientDarkness = Color.from(darknessColor ?? CONFIG.Canvas.darknessColor ?? fbc.darknessColor);
    this.colors.ambientDaylight = Color.from(daylightColor
      ?? (scene?.tokenVision ? (CONFIG.Canvas.daylightColor ?? fbc.daylightColor) : 0xFFFFFF));
    this.colors.ambientBrightest = Color.from(brightestColor ?? CONFIG.Canvas.brightestColor ?? fbc.brightestColor);

    // Darkness level control
    const priorDarknessLevel = this.#darknessLevel ?? 0;
    const dl = darknessLevel ?? scene?.darkness ?? 0;
    const darknessChanged = (dl !== this.#darknessLevel);
    this.#darknessLevel = scene.darkness = dl;

    // Update weights
    Object.assign(this.weights, CONFIG.Canvas.lightLevels ?? {
      dark: 0,
      halfdark: 0.5,
      dim: 0.25,
      bright: 1
    });

    // Compute colors
    this.#configureColors(scene, {fogExploredColor, fogUnexploredColor, backgroundColor});

    // Update primary cached container and renderer clear color with scene background color
    canvas.app.renderer.background.color = this.colors.rendererBackground;
    canvas.primary.clearColor = [...this.colors.sceneBackground.rgb, 1];

    // If darkness changed, activate some darkness handlers to refresh controls.
    if ( darknessChanged ) {
      canvas.effects._onDarknessChange(this.#darknessLevel, priorDarknessLevel);
      canvas.lighting._onDarknessChange(this.#darknessLevel, priorDarknessLevel);
      canvas.sounds._onDarknessChange(this.#darknessLevel, priorDarknessLevel);
    }

    // Push a perception update to refresh lighting and sources with the new computed color values
    canvas.perception.update({
      refreshPrimary: true,
      refreshLighting: true,
      refreshVisionSources: true
    });
  }

  /* -------------------------------------------- */

  /**
   * Configure all colors pertaining to a scene.
   * @param {Scene} scene                         The scene document for which colors are configured.
   * @param {object} [options={}]                 Preview options.
   * @param {number} [options.fogExploredColor]   A preview fog explored color.
   * @param {number} [options.fogUnexploredColor] A preview fog unexplored color.
   * @param {number} [options.backgroundColor]    The background canvas color.
   */
  #configureColors(scene, {fogExploredColor, fogUnexploredColor, backgroundColor}={}) {
    const fbc = CanvasColorManager.#fallbackColors;

    // Compute the middle ambient color
    this.colors.background = this.colors.ambientDarkness.mix(this.colors.ambientDaylight, 1.0 - this.darknessLevel);

    // Compute dark ambient colors
    this.colors.darkness = this.colors.ambientDarkness.mix(this.colors.background, this.weights.dark);
    this.colors.halfdark = this.colors.darkness.mix(this.colors.background, this.weights.halfdark);

    // Compute light ambient colors
    this.colors.bright =
      this.colors.background.mix(this.colors.ambientBrightest, (1 - this.darknessPenalty) * this.weights.bright);
    this.colors.dim = this.colors.background.mix(this.colors.bright, this.weights.dim);

    // Compute fog colors
    const cfg = CONFIG.Canvas;
    const uc = Color.from(fogUnexploredColor ?? scene.fogUnexploredColor ?? cfg.unexploredColor ?? fbc.fogUnexplored);
    this.colors.fogUnexplored = this.colors.background.multiply(uc);
    const ec = Color.from(fogExploredColor ?? scene.fogExploredColor ?? cfg.exploredColor ?? fbc.fogExplored);
    this.colors.fogExplored = this.colors.background.multiply(ec);

    // Compute scene background color
    const sceneBG = Color.from(backgroundColor ?? scene?.backgroundColor ?? fbc.backgroundColor);
    this.colors.sceneBackground = sceneBG;
    this.colors.rendererBackground = sceneBG.multiply(this.colors.background);
  }
}
