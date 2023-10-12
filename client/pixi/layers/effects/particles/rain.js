/**
 * A full-screen weather effect which renders rain drops and splashes.
 * @extends {ParticleEffect}
 */
class RainWeatherEffect extends ParticleEffect {

  /** @inheritdoc */
  static label = "WEATHER.Rain";

  /**
   * Configuration for the particle emitter for rain
   * @type {PIXI.particles.EmitterConfigV3}
   */
  static RAIN_CONFIG = {
    behaviors: [
      {
        type: "alpha",
        config: {
          alpha: {
            list: [{time: 0, value: 0.7}, {time: 1, value: 0.1}]
          }
        }
      },
      {
        type: "moveSpeedStatic",
        config: {min: 2800, max: 3500}
      },
      {
        type: "scaleStatic",
        config: {min: 0.8, max: 1}
      },
      {
        type: "rotationStatic",
        config: {min: 75, max: 75}
      },
      {
        type: "textureRandom",
        config: {
          textures: [
            "ui/particles/rain.png"
          ]
        }
      }
    ],
    frequency: 0.002,
    lifetime: {min: 0.5, max: 0.5},
    pos: {x: 0, y: 0}
  };

  /**
   * Configuration for the particle emitter for splashes
   * @type {PIXI.particles.EmitterConfigV3}
   */
  static SPLASH_CONFIG = {
    lifetime: {min: 0.5, max: 0.5},
    pos: {x: 0, y: 0},
    behaviors: [
      {
        type: "moveSpeedStatic",
        config: {min: 0, max: 0}
      },
      {
        type: "scaleStatic",
        config: {min: 0.48, max: 0.6}
      },
      {
        type: "rotationStatic",
        config: {min: -90, max: -90}
      },
      {
        type: "noRotation",
        config: {}
      },
      {
        type: "textureRandom",
        config: {
          textures: [
            "ui/particles/drop.png"
          ]
        }
      }
    ]
  };

  /* -------------------------------------------- */

  /** @inheritdoc */
  getParticleEmitters({maxParticles, ...options}) {
    const d = canvas.dimensions;
    maxParticles ??= (d.width / d.size) * (d.height / d.size) * 0.5;

    // Create an emitter for rain drops
    const rainConfig = foundry.utils.deepClone(this.constructor.RAIN_CONFIG);
    rainConfig.maxParticles = maxParticles;
    rainConfig.frequency = 1 / maxParticles;
    rainConfig.behaviors.push({
      type: "spawnShape",
      config: {
        type: "rect",
        data: {x: -0.05 * d.width, y: -0.10 * d.height, w: d.width, h: 0.8 * d.height}
      }
    });

    // Create a second emitter for splashes
    const splashConfig = foundry.utils.deepClone(this.constructor.SPLASH_CONFIG);
    splashConfig.maxParticles = maxParticles;
    splashConfig.frequency = 2 / maxParticles;
    splashConfig.behaviors.push({
      type: "spawnShape",
      config: {
        type: "rect",
        data: { x: 0, y: 0.25 * d.height, w: d.width, h: 0.75 * d.height }
      }
    });

    // Return both emitters
    return [this.createEmitter(rainConfig), this.createEmitter(splashConfig)];
  }
}
