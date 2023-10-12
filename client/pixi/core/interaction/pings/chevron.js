/**
 * A type of ping that points to a specific location.
 * @param {PIXI.Point} origin      The canvas co-ordinates of the origin of the ping.
 * @param {PingOptions} [options]  Additional options to configure the ping animation.
 * @extends Ping
 */
class ChevronPing extends Ping {
  constructor(origin, options={}) {
    super(origin, options);
    this._r = (this.options.size / 2) * .75;

    // The inner ring is 3/4s the size of the outer.
    this._rInner = this._r * .75;

    // The animation is split into three stages. First, the chevron fades in and moves downwards, then the rings fade
    // in, then everything fades out as the chevron moves back up.
    // Store the 1/4 time slice.
    this._t14 = this.options.duration * .25;

    // Store the 1/2 time slice.
    this._t12 = this.options.duration * .5;

    // Store the 3/4s time slice.
    this._t34 = this._t14 * 3;
  }

  /**
   * The path to the chevron texture.
   * @type {string}
   * @private
   */
  static _CHEVRON_PATH = "icons/pings/chevron.webp";

  /* -------------------------------------------- */

  /** @inheritdoc */
  async animate() {
    this.removeChildren();
    this.addChild(...this._createRings());
    this._chevron = await this._loadChevron();
    this.addChild(this._chevron);
    return super.animate();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _animateFrame(dt, animation) {
    const { time } = animation;
    if ( time < this._t14 ) {
      // Normalise t between 0 and 1.
      const t = time / this._t14;
      // Apply easing function.
      const dy = CanvasAnimation.easeOutCircle(t);
      this._chevron.y = this._y + (this._h2 * dy);
      this._chevron.alpha = time / this._t14;
    } else if ( time < this._t34 ) {
      const t = time - this._t14;
      const a = t / this._t12;
      this._drawRings(a);
    } else {
      const t = (time - this._t34) / this._t14;
      const a = 1 - t;
      const dy = CanvasAnimation.easeInCircle(t);
      this._chevron.y = this._y + ((1 - dy) * this._h2);
      this._chevron.alpha = a;
      this._drawRings(a);
    }
  }

  /* -------------------------------------------- */

  /**
   * Draw the outer and inner rings.
   * @param {number} a  The alpha.
   * @private
   */
  _drawRings(a) {
    this._outer.clear();
    this._inner.clear();
    this._outer.lineStyle(6, this._color, a).drawCircle(0, 0, this._r);
    this._inner.lineStyle(3, this._color, a).arc(0, 0, this._rInner, 0, Math.PI * 1.5);
  }

  /* -------------------------------------------- */

  /**
   * Load the chevron texture.
   * @returns {Promise<PIXI.Sprite>}
   * @private
   */
  async _loadChevron() {
    const texture = await TextureLoader.loader.loadTexture(ChevronPing._CHEVRON_PATH);
    const chevron = PIXI.Sprite.from(texture);
    chevron.tint = this._color;

    const w = this.options.size;
    const h = (texture.height / texture.width) * w;
    chevron.width = w;
    chevron.height = h;

    // The chevron begins the animation slightly above the pinged point.
    this._h2 = h / 2;
    chevron.x = -(w / 2);
    chevron.y = this._y = -h - this._h2;

    return chevron;
  }

  /* -------------------------------------------- */

  /**
   * Draw the two rings that are used as part of the ping animation.
   * @returns {PIXI.Graphics[]}
   * @private
   */
  _createRings() {
    this._outer = new PIXI.Graphics();
    this._inner = new PIXI.Graphics();
    return [this._outer, this._inner];
  }
}
