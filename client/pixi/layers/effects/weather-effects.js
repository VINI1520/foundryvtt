/**
 * A CanvasLayer for displaying visual effects like weather, transitions, flashes, or more.
 */
class WeatherEffects extends FullCanvasObjectMixin(CanvasLayer) {
  constructor() {
    super();
    this.#initializeInverseOcclusionFilter();
    this.mask = canvas.masks.scene;
    this.sortableChildren = true;
    this.eventMode = "none";
  }

  /**
   * Sorting values to deal with ties.
   * @type {number}
   */
  static PRIMARY_SORT_ORDER = 1000;

  /* -------------------------------------------- */

  /**
   * Initialize the inverse occlusion filter.
   */
  #initializeInverseOcclusionFilter() {
    this.occlusionFilter = WeatherOcclusionMaskFilter.create({
      occlusionTexture: canvas.masks.depth.renderTexture
    });
    this.occlusionFilter.enabled = false;
    this.occlusionFilter.elevation = this.#elevation;
    this.filterArea = canvas.app.renderer.screen;
    this.filters = [this.occlusionFilter];
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {name: "effects"});
  }

  /* -------------------------------------------- */

  /**
   * Array of weather effects linked to this weather container.
   * @type {Map<string,(ParticleEffect|WeatherShaderEffect)[]>}
   */
  effects = new Map();

  /**
   * @typedef {Object} WeatherTerrainMaskConfiguration
   * @property {boolean} enabled                          Enable or disable this mask.
   * @property {number[]} channelWeights                  An RGBA array of channel weights applied to the mask texture.
   * @property {boolean} reverse=false                    If the mask should be reversed.
   * @property {PIXI.Texture|PIXI.RenderTexture} texture  A texture which defines the mask region.
   */

  /**
   * A default configuration of the terrain mask that is automatically applied to any shader-based weather effects.
   * This configuration is automatically passed to WeatherShaderEffect#configureTerrainMask upon construction.
   * @type {WeatherTerrainMaskConfiguration}
   */
  terrainMaskConfig;

  /**
   * @typedef {Object} WeatherOcclusionMaskConfiguration
   * @property {boolean} enabled                          Enable or disable this mask.
   * @property {number[]} channelWeights                  An RGBA array of channel weights applied to the mask texture.
   * @property {boolean} reverse=false                    If the mask should be reversed.
   * @property {PIXI.Texture|PIXI.RenderTexture} texture  A texture which defines the mask region.
   */

  /**
   * A default configuration of the terrain mask that is automatically applied to any shader-based weather effects.
   * This configuration is automatically passed to WeatherShaderEffect#configureTerrainMask upon construction.
   * @type {WeatherOcclusionMaskConfiguration}
   */
  occlusionMaskConfig;

  /**
   * The inverse occlusion mask filter bound to this container.
   * @type {WeatherOcclusionMaskFilter}
   */
  occlusionFilter;

  /* -------------------------------------------- */

  /**
   * Define an elevation property on the WeatherEffects layer.
   * This approach is used for now until the weather elevation property is formally added to the Scene data schema.
   * @type {number}
   */
  get elevation() {
    return this.#elevation;
  }

  set elevation(value) {
    this.occlusionFilter.elevation = this.#elevation = value;
    canvas.primary.sortDirty = true;
    canvas.perception.update({refreshTiles: true});
  }

  #elevation = Infinity;

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    const effect = CONFIG.weatherEffects[canvas.scene.weather];
    this.initializeEffects(effect);
  }

  /* -------------------------------------------- */

  /** @override */
  async _tearDown(options) {
    this.clearEffects();
  }

  /* -------------------------------------------- */
  /*  Weather Effect Management                   */
  /* -------------------------------------------- */

  /**
   * Initialize the weather container from a weather config object.
   * @param {object} [weatherEffectsConfig]        Weather config object (or null/undefined to clear the container).
   */
  initializeEffects(weatherEffectsConfig) {
    this.#destroyEffects();
    Hooks.callAll("initializeWeatherEffects", this, weatherEffectsConfig);
    this.#constructEffects(weatherEffectsConfig);
  }

  /* -------------------------------------------- */

  /**
   * Clear the weather container.
   */
  clearEffects() {
    this.initializeEffects(null);
  }

  /* -------------------------------------------- */

  /**
   * Destroy all effects associated with this weather container.
   */
  #destroyEffects() {
    if ( this.effects.size === 0 ) return;
    for ( const effect of this.effects.values() ) effect.destroy();
    this.effects.clear();
  }

  /* -------------------------------------------- */

  /**
   * Construct effects according to the weather effects config object.
   * @param {object} [weatherEffectsConfig]        Weather config object (or null/undefined to clear the container).
   */
  #constructEffects(weatherEffectsConfig) {
    if ( !weatherEffectsConfig ) return this.occlusionFilter.enabled = false;
    const effects = weatherEffectsConfig.effects;
    let zIndex = 0;

    // Enable a layer-wide occlusion filter unless it is explicitly disabled by the effect configuration
    const useOcclusionFilter = weatherEffectsConfig.filter?.enabled !== false;
    if ( useOcclusionFilter ) {
      WeatherEffects.configureOcclusionMask(this.occlusionFilter, this.occlusionMaskConfig || {enabled: true});
      if ( this.terrainMaskConfig ) WeatherEffects.configureTerrainMask(this.occlusionFilter, this.terrainMaskConfig);
      this.occlusionFilter.blendMode = weatherEffectsConfig.filter?.blendMode ?? PIXI.BLEND_MODES.NORMAL;
      this.occlusionFilter.enabled = true;
    }

    // Create each effect
    for ( const effect of effects ) {
      const requiredPerformanceLevel = Number.isNumeric(effect.performanceLevel) ? effect.performanceLevel : 0;
      if ( canvas.performance.mode < requiredPerformanceLevel ) {
        console.debug(`Skipping weather effect ${effect.id}. The client performance level ${canvas.performance.mode}`
          + ` is less than the required performance mode ${requiredPerformanceLevel} for the effect`);
        continue;
      }

      // Construct the effect container
      let ec;
      try {
        ec = new effect.effectClass(effect.config, effect.shaderClass);
      } catch(err) {
        err.message = `Failed to construct weather effect: ${err.message}`;
        console.error(err);
        continue;
      }

      // Configure effect container
      ec.zIndex = effect.zIndex ?? zIndex++;
      ec.blendMode = effect.blendMode ?? PIXI.BLEND_MODES.NORMAL;

      // Apply effect-level occlusion and terrain masking only if we are not using a layer-wide filter
      if ( effect.shaderClass && !useOcclusionFilter ) {
        WeatherEffects.configureOcclusionMask(ec.shader, this.occlusionMaskConfig || {enabled: true});
        if ( this.terrainMaskConfig ) WeatherEffects.configureTerrainMask(ec.shader, this.terrainMaskConfig);
      }

      // Add to the layer, register the effect, and begin play
      this.addChild(ec);
      this.effects.set(effect.id, ec);
      ec.play();
    }
  }

  /* -------------------------------------------- */

  /**
   * Set the occlusion uniforms for this weather shader.
   * @param {PIXI.Shader} context                       The shader context
   * @param {WeatherOcclusionMaskConfiguration} config  Occlusion masking options
   * @protected
   */
  static configureOcclusionMask(context, {enabled=false, channelWeights=[0, 0, 1, 0], reverse=false, texture}={}) {
    if ( !(context instanceof PIXI.Shader) ) return;
    const uniforms = context.uniforms;
    if ( texture !== undefined ) uniforms.occlusionTexture = texture;
    else uniforms.occlusionTexture ??= canvas.masks.depth.renderTexture;
    uniforms.useOcclusion = enabled;
    uniforms.occlusionWeights = channelWeights;
    uniforms.reverseOcclusion = reverse;
    if ( enabled && !uniforms.occlusionTexture ) {
      console.warn(`The occlusion configuration for the weather shader ${context.constructor.name} is enabled but`
        + " does not have a valid texture");
      uniforms.useOcclusion = false;
    }
  }

  /* -------------------------------------------- */

  /**
   * Set the terrain uniforms for this weather shader.
   * @param {PIXI.Shader} context                     The shader context
   * @param {WeatherTerrainMaskConfiguration} config  Terrain masking options
   * @protected
   */
  static configureTerrainMask(context, {enabled=false, channelWeights=[1, 0, 0, 0], reverse=false, texture}={}) {
    if ( !(context instanceof PIXI.Shader) ) return;
    const uniforms = context.uniforms;
    if ( texture !== undefined ) uniforms.terrainTexture = texture;
    uniforms.useTerrain = enabled;
    uniforms.terrainWeights = channelWeights;
    uniforms.reverseTerrain = reverse;
    if ( enabled && !uniforms.terrainTexture ) {
      console.warn(`The terrain configuration for the weather shader ${context.constructor.name} is enabled but`
        + " does not have a valid texture");
      uniforms.useTerrain = false;
    }
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  get weather() {
    const msg = "The WeatherContainer at canvas.weather.weather is deprecated and combined with the layer itself.";
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
    return this;
  }
}
