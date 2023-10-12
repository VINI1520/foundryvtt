/**
 * An interface for defining particle-based weather effects
 * @param {PIXI.Container} parent     The parent container within which the effect is rendered
 * @param {object} [options]          Options passed to the getParticleEmitters method which can be used to customize
 *                                    values of the emitter configuration.
 * @interface
 */
class ParticleEffect extends FullCanvasObjectMixin(PIXI.Container) {
  constructor(options={}) {
    super();
    /**
     * The array of emitters which are active for this particle effect
     * @type {PIXI.particles.Emitter[]}
     */
    this.emitters = this.getParticleEmitters(options);
  }

  /* -------------------------------------------- */

  /**
   * Create an emitter instance which automatically updates using the shared PIXI.Ticker
   * @param {PIXI.particles.EmitterConfigV3} config   The emitter configuration
   * @returns {PIXI.particles.Emitter}                The created Emitter instance
   */
  createEmitter(config) {
    config.autoUpdate = true;
    config.emit = false;
    return new PIXI.particles.Emitter(this, config);
  }

  /* -------------------------------------------- */

  /**
   * Get the particle emitters which should be active for this particle effect.
   * @param {object} [options]    Options provided to the ParticleEffect constructor which can be used to customize
   *                              configuration values for created emitters.
   * @returns {PIXI.particles.Emitter[]}
   */
  getParticleEmitters(options={}) {
    return [];
  }

  /* -------------------------------------------- */

  /** @override */
  destroy(...args) {
    for ( const e of this.emitters ) e.destroy();
    this.emitters = [];
    super.destroy(...args);
  }

  /* -------------------------------------------- */

  /**
   * Begin animation for the configured emitters.
   */
  play() {
    for ( let e of this.emitters ) {
      e.emit = true;
    }
  }

  /* -------------------------------------------- */

  /**
   * Stop animation for the configured emitters.
   */
  stop() {
    for ( let e of this.emitters ) {
      e.emit = false;
    }
  }
}

/**
 * @deprecated since v10
 * @ignore
 */
class SpecialEffect extends ParticleEffect {
  constructor() {
    foundry.utils.logCompatibilityWarning("You are using the SpecialEffect class which is renamed to ParticleEffect.",
      {since: 10, until: 12});
    super();
  }
}
