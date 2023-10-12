/**
 * A full-screen weather effect which renders drifting snowflakes.
 * @extends {ParticleEffect}
 */
class SnowWeatherEffect extends ParticleEffect {

  /** @inheritdoc */
  static label = "WEATHER.Snow"

  /**
   * Configuration for the particle emitter for snow
   * @type {PIXI.particles.EmitterConfigV3}
   */
  static SNOW_CONFIG = {
    lifetime: {min: 4, max: 4},
    behaviors: [
      {
        type: "alpha",
        config: {
          alpha: {
            list: [{time: 0, value: 0.9}, {time: 1, value: 0.5}]
          }
        }
      },
      {
        type: "moveSpeed",
        config: {
          speed: {
            list: [{time: 0, value: 190}, {time: 1, value: 210}]
          },
          minMult: 0.6
        }
      },
      {
        type: "scale",
        config: {
          scale: {
            list: [{time: 0, value: 0.2}, {time: 1, value: 0.4}]
          },
          minMult: 0.5
        }
      },
      {
        type: "rotation",
        config: {accel: 0, minSpeed: 0, maxSpeed: 200, minStart: 50, maxStart: 75}
      },
      {
        type: "textureRandom",
        config: {
          textures: [
            "ui/particles/snow.png"
          ]
        }
      }
    ]
  };

  /* -------------------------------------------- */

  /** @inheritdoc */
  getParticleEmitters() {
    const d = canvas.dimensions;
    const maxParticles = (d.width / d.size) * (d.height / d.size) * 0.5;
    const config = foundry.utils.deepClone(this.constructor.SNOW_CONFIG);
    config.maxParticles = maxParticles;
    config.frequency = 1 / maxParticles;
    config.behaviors.push({
      type: "spawnShape",
      config: {
        type: "rect",
        data: {x: 0, y: -0.10 * d.height, w: d.width, h: d.height}
      }
    });
    return [this.createEmitter(config)];
  }
}
