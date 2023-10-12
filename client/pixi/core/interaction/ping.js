/**
 * @typedef {object} PingOptions
 * @property {number} [duration=900]   The duration of the animation in milliseconds.
 * @property {number} [size=128]       The size of the ping graphic.
 * @property {string} [color=#ff6400]  The color of the ping graphic.
 * @property {string} [name]           The name for the ping animation to pass to {@link CanvasAnimation.animate}.
 */

/**
 * A class to manage a user ping on the canvas.
 * @param {PIXI.Point} origin       The canvas co-ordinates of the origin of the ping.
 * @param {PingOptions} [options]   Additional options to configure the ping animation.
 */
class Ping extends PIXI.Container {
  constructor(origin, options={}) {
    super();
    this.x = origin.x;
    this.y = origin.y;
    this.options = foundry.utils.mergeObject({duration: 900, size: 128, color: "#ff6400"}, options);
    this._color = Color.from(this.options.color);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  destroy(options={}) {
    options.children = true;
    super.destroy(options);
  }

  /* -------------------------------------------- */

  /**
   * Start the ping animation.
   * @returns {Promise<boolean>}  Returns true if the animation ran to completion, false otherwise.
   */
  async animate() {
    const completed = await CanvasAnimation.animate([], {
      context: this,
      name: this.options.name,
      duration: this.options.duration,
      ontick: this._animateFrame.bind(this)
    });
    this.destroy();
    return completed;
  }

  /* -------------------------------------------- */

  /**
   * On each tick, advance the animation.
   * @param {number} dt                      The number of ms that elapsed since the previous frame.
   * @param {CanvasAnimationData} animation  The animation state.
   * @protected
   */
  _animateFrame(dt, animation) {
    throw new Error("Subclasses of Ping must implement the _animateFrame method.");
  }
}
