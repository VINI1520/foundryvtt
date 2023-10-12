/**
 * A CanvasLayer for displaying visual effects like weather, transitions, flashes, or more.
 */
class WeatherEffects extends CanvasLayer {

  /**
   * The weather overlay container
   * @type {FullCanvasContainer}
   */
  weather;

  /**
   * The currently active weather effect
   * @type {ParticleEffect}
   */
  weatherEffect;

  /**
   * An occlusion filter that prevents weather from being displayed in certain regions
   * @type {AbstractBaseMaskFilter}
   */
  weatherOcclusionFilter;

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
    this.#elevation = value;
    canvas.primary.sortChildren();
  }

  #elevation = Infinity;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {name: "effects"});
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    this.weatherOcclusionFilter = InverseOcclusionMaskFilter.create({
      alphaOcclusion: 0,
      uMaskSampler: canvas.masks.depth.renderTexture,
      channel: "b"
    });
    this.drawWeather();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _tearDown(options) {
    this.weatherEffect?.destroy();
    this.weather = this.weatherEffect = null;
    return super._tearDown();
  }

  /* -------------------------------------------- */

  /**
   * Draw the weather container.
   * @returns {FullCanvasContainer|null}    The weather container, or null if no effect is present
   */
  drawWeather() {
    if ( this.weatherEffect ) this.weatherEffect.stop();
    const effect = CONFIG.weatherEffects[canvas.scene.weather];
    if ( !effect ) {
      this.weatherOcclusionFilter.enabled = false;
      return null;
    }

    // Create the effect and begin playback
    if ( !this.weather ) {
      const w = new FullCanvasContainer();
      w.accessibleChildren = w.interactiveChildren = false;
      w.filterArea = canvas.app.renderer.screen;
      this.weather = this.addChild(w);
    }
    this.weatherEffect = new effect(this.weather);
    this.weatherEffect.play();

    // Apply occlusion filter
    this.weatherOcclusionFilter.enabled = true;
    this.weather.filters = [this.weatherOcclusionFilter];
    return this.weather;
  }
}
