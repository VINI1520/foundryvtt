/**
 * @typedef {PingOptions} PulsePingOptions
 * @property {number} [rings=3]         The number of rings used in the animation.
 * @property {string} [color2=#ffffff]  The alternate color that the rings begin at. Use white for a 'flashing' effect.
 */

/**
 * A type of ping that produces a pulsing animation.
 * @param {PIXI.Point} origin           The canvas co-ordinates of the origin of the ping.
 * @param {PulsePingOptions} [options]  Additional options to configure the ping animation.
 * @extends Ping
 */
class PulsePing extends Ping {
  constructor(origin, {rings=3, color2="#ffffff", ...options}={}) {
    super(origin, {rings, color2, ...options});
    this._color2 = game.settings.get("core", "photosensitiveMode") ? this._color : Color.from(color2);

    // The radius is half the diameter.
    this._r = this.options.size / 2;

    // This is the radius that the rings initially begin at. It's set to 1/5th of the maximum radius.
    this._r0 = this._r / 5;

    this._computeTimeSlices();
  }

  /* -------------------------------------------- */

  /**
   * Initialize some time slice variables that will be used to control the animation.
   *
   * The animation for each ring can be separated into two consecutive stages.
   * Stage 1: Fade in a white ring with radius r0.
   * Stage 2: Expand radius outward. While the radius is expanding outward, we have two additional, consecutive
   * animations:
   *  Stage 2.1: Transition color from white to the configured color.
   *  Stage 2.2: Fade out.
   * 1/5th of the animation time is allocated to Stage 1. 4/5ths are allocated to Stage 2. Of those 4/5ths, 2/5ths
   * are allocated to Stage 2.1, and 2/5ths are allocated to Stage 2.2.
   * @private
   */
  _computeTimeSlices() {
    // We divide up the total duration of the animation into rings + 1 time slices. Ring animations are staggered by 1
    // slice, and last for a total of 2 slices each. This uses up the full duration and creates the ripple effect.
    this._timeSlice = this.options.duration / (this.options.rings + 1);
    this._timeSlice2 = this._timeSlice * 2;

    // Store the 1/5th time slice for Stage 1.
    this._timeSlice15 = this._timeSlice2 / 5;

    // Store the 2/5ths time slice for the subdivisions of Stage 2.
    this._timeSlice25 = this._timeSlice15 * 2;

    // Store the 4/5ths time slice for Stage 2.
    this._timeSlice45 = this._timeSlice25 * 2;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async animate() {
    // Draw rings.
    this.removeChildren();
    for ( let i = 0; i < this.options.rings; i++ ) {
      this.addChild(new PIXI.Graphics());
    }

    // Add a blur filter to soften the sharp edges of the shape.
    const f = new PIXI.filters.BlurFilter(2);
    f.padding = this.options.size;
    this.filters = [f];

    return super.animate();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _animateFrame(dt, animation) {
    const { time } = animation;
    for ( let i = 0; i < this.options.rings; i++ ) {
      const ring = this.children[i];

      // Offset each ring by 1 time slice.
      const tMin = this._timeSlice * i;

      // Each ring gets 2 time slices to complete its full animation.
      const tMax = tMin + this._timeSlice2;

      // If it's not time for this ring to animate, do nothing.
      if ( (time < tMin) || (time >= tMax) ) continue;

      // Normalise our t.
      let t = time - tMin;

      ring.clear();
      if ( t < this._timeSlice15 ) {
        // Stage 1. Fade in a white ring of radius r0.
        const a = t / this._timeSlice15;
        this._drawShape(ring, this._color2, a, this._r0);
      } else {
        // Stage 2. Expand radius, transition color, and fade out. Re-normalize t for Stage 2.
        t -= this._timeSlice15;
        const dr = this._r / this._timeSlice45;
        const r = this._r0 + (t * dr);

        const c0 = this._color;
        const c1 = this._color2;
        const c = t <= this._timeSlice25 ? this._colorTransition(c0, c1, this._timeSlice25, t) : c0;

        const ta = Math.max(0, t - this._timeSlice25);
        const a = 1 - (ta / this._timeSlice25);
        this._drawShape(ring, c, a, r);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Transition linearly from one color to another.
   * @param {Color} from       The color to transition from.
   * @param {Color} to         The color to transition to.
   * @param {number} duration  The length of the transition in milliseconds.
   * @param {number} t         The current time along the duration.
   * @returns {number}         The incremental color between from and to.
   * @private
   */
  _colorTransition(from, to, duration, t) {
    const d = t / duration;
    const rgbFrom = from.rgb;
    const rgbTo = to.rgb;
    return Color.fromRGB(rgbFrom.map((c, i) => {
      const diff = rgbTo[i] - c;
      return c + (d * diff);
    }));
  }

  /* -------------------------------------------- */

  /**
   * Draw the shape for this ping.
   * @param {PIXI.Graphics} g  The graphics object to draw to.
   * @param {number} color     The color of the shape.
   * @param {number} alpha     The alpha of the shape.
   * @param {number} size      The size of the shape to draw.
   * @protected
   */
  _drawShape(g, color, alpha, size) {
    g.lineStyle({color, alpha, width: 6, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.BEVEL});
    g.drawCircle(0, 0, size);
  }
}

/**
 * A type of ping that produces an arrow pointing in a given direction.
 * @property {PIXI.Point} origin            The canvas co-ordinates of the origin of the ping. This becomes the arrow's
 *                                          tip.
 * @property {PulsePingOptions} [options]   Additional options to configure the ping animation.
 * @property {number} [options.rotation=0]  The angle of the arrow in radians.
 * @extends PulsePing
 */
class ArrowPing extends PulsePing {
  constructor(origin, {rotation=0, ...options}={}) {
    super(origin, options);
    this.rotation = Math.normalizeRadians(rotation + (Math.PI * 1.5));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _drawShape(g, color, alpha, size) {
    g.lineStyle({color, alpha, width: 6, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.BEVEL});
    const half = size / 2;
    const x = -half;
    const y = -size;
    g.moveTo(x, y)
      .lineTo(0, 0)
      .lineTo(half, y)
      .lineTo(0, -half)
      .lineTo(x, y);
  }
}

/**
 * A type of ping that produces a pulse warning sign animation.
 * @param {PIXI.Point} origin           The canvas co-ordinates of the origin of the ping.
 * @param {PulsePingOptions} [options]  Additional options to configure the ping animation.
 * @extends PulsePing
 */
class AlertPing extends PulsePing {
  constructor(origin, {color="#ff0000", ...options}={}) {
    super(origin, {color, ...options});
    this._r = this.options.size;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _drawShape(g, color, alpha, size) {
    // Draw a chamfered triangle.
    g.lineStyle({color, alpha, width: 6, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.BEVEL});
    const half = size / 2;
    const chamfer = size / 10;
    const chamfer2 = chamfer / 2;
    const x = -half;
    const y = -(size / 3);
    g.moveTo(x+chamfer, y)
      .lineTo(x+size-chamfer, y)
      .lineTo(x+size, y+chamfer)
      .lineTo(x+half+chamfer2, y+size-chamfer)
      .lineTo(x+half-chamfer2, y+size-chamfer)
      .lineTo(x, y+chamfer)
      .lineTo(x+chamfer, y);
  }
}
