/**
 * A container group which displays interface elements rendered above other canvas groups.
 * @extends {BaseCanvasMixin(PIXI.Container)}
 */
class InterfaceCanvasGroup extends BaseCanvasMixin(PIXI.Container) {

  /** @override */
  static groupName = "interface";

  /**
   * A container dedicated to the display of scrolling text.
   * @type {PIXI.Container}
   */
  #scrollingText;

  /**
   * A graphics which represent the scene outline.
   * @type {PIXI.Graphics}
   */
  #outline;

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * Draw the canvas group and all its component layers.
   * @returns {Promise<void>}
   */
  async draw() {
    this.#drawOutline();
    this.#drawScrollingText();
    await super.draw();
  }

  /* -------------------------------------------- */

  /**
   * Draw a background outline which emphasizes what portion of the canvas is playable space and what is buffer.
   */
  #drawOutline() {
    // Create Canvas outline
    const outline = this.#outline = this.addChild(new PIXI.Graphics());

    const {scene, dimensions} = canvas;
    const displayCanvasBorder = scene.padding !== 0;
    const displaySceneOutline = !scene.background.src;
    if ( !(displayCanvasBorder || displaySceneOutline) ) return;
    if ( displayCanvasBorder ) outline.lineStyle({
      alignment: 1,
      alpha: 0.75,
      color: 0x000000,
      join: PIXI.LINE_JOIN.BEVEL,
      width: 4
    }).drawShape(dimensions.rect);
    if ( displaySceneOutline ) outline.lineStyle({
      alignment: 1,
      alpha: 0.25,
      color: 0x000000,
      join: PIXI.LINE_JOIN.BEVEL,
      width: 4
    }).drawShape(dimensions.sceneRect).endFill();
  }

  /* -------------------------------------------- */
  /*  Scrolling Text                              */
  /* -------------------------------------------- */

  /**
   * Draw the scrolling text.
   */
  #drawScrollingText() {
    this.#scrollingText = this.addChild(new PIXI.Container());

    const {width, height} = canvas.dimensions;
    this.#scrollingText.width = width;
    this.#scrollingText.height = height;
    this.#scrollingText.zIndex = 1000;
  }

  /* -------------------------------------------- */

  /**
   * Display scrolling status text originating from this ObjectHUD container.
   * @param {Point} origin            An origin point where the text should first emerge
   * @param {string} content          The text content to display
   * @param {object} [options]        Options which customize the text animation
   * @param {number} [options.duration=2000]  The duration of the scrolling effect in milliseconds
   * @param {number} [options.distance]       The distance in pixels that the scrolling text should travel
   * @param {TEXT_ANCHOR_POINTS} [options.anchor]     The original anchor point where the text appears
   * @param {TEXT_ANCHOR_POINTS} [options.direction]  The direction in which the text scrolls
   * @param {number} [options.jitter=0]       An amount of randomization between [0, 1] applied to the initial position
   * @param {object} [options.textStyle={}]   Additional parameters of PIXI.TextStyle which are applied to the text
   * @returns {Promise<PreciseText|null>}   The created PreciseText object which is scrolling
   */
  async createScrollingText(origin, content, {duration=2000, distance, jitter=0, anchor, direction, ...textStyle}={}) {
    if ( !game.settings.get("core", "scrollingStatusText") ) return null;

    // Create text object
    const style = PreciseText.getTextStyle({anchor, ...textStyle});
    const text = this.#scrollingText.addChild(new PreciseText(content, style));
    text.visible = false;

    // Set initial coordinates
    const jx = (jitter ? (Math.random()-0.5) * jitter : 0) * text.width;
    const jy = (jitter ? (Math.random()-0.5) * jitter : 0) * text.height;
    text.position.set(origin.x + jx, origin.y + jy);

    // Configure anchor point
    text.anchor.set(...{
      [CONST.TEXT_ANCHOR_POINTS.CENTER]: [0.5, 0.5],
      [CONST.TEXT_ANCHOR_POINTS.BOTTOM]: [0.5, 0],
      [CONST.TEXT_ANCHOR_POINTS.TOP]: [0.5, 1],
      [CONST.TEXT_ANCHOR_POINTS.LEFT]: [1, 0.5],
      [CONST.TEXT_ANCHOR_POINTS.RIGHT]: [0, 0.5]
    }[anchor ?? CONST.TEXT_ANCHOR_POINTS.CENTER]);

    // Configure animation distance
    let dx = 0;
    let dy = 0;
    switch ( direction ?? CONST.TEXT_ANCHOR_POINTS.TOP ) {
      case CONST.TEXT_ANCHOR_POINTS.BOTTOM:
        dy = distance ?? (2 * text.height); break;
      case CONST.TEXT_ANCHOR_POINTS.TOP:
        dy = -1 * (distance ?? (2 * text.height)); break;
      case CONST.TEXT_ANCHOR_POINTS.LEFT:
        dx = -1 * (distance ?? (2 * text.width)); break;
      case CONST.TEXT_ANCHOR_POINTS.RIGHT:
        dx = distance ?? (2 * text.width); break;
    }

    // Fade In
    await CanvasAnimation.animate([
      {parent: text, attribute: "alpha", from: 0, to: 1.0},
      {parent: text.scale, attribute: "x", from: 0.6, to: 1.0},
      {parent: text.scale, attribute: "y", from: 0.6, to: 1.0}
    ], {
      context: this,
      duration: duration * 0.25,
      easing: CanvasAnimation.easeInOutCosine,
      ontick: () => text.visible = true
    });

    // Scroll
    const scroll = [{parent: text, attribute: "alpha", to: 0.0}];
    if ( dx !== 0 ) scroll.push({parent: text, attribute: "x", to: text.position.x + dx});
    if ( dy !== 0 ) scroll.push({parent: text, attribute: "y", to: text.position.y + dy});
    await CanvasAnimation.animate(scroll, {
      context: this,
      duration: duration * 0.75,
      easing: CanvasAnimation.easeInOutCosine
    });

    // Clean-up
    this.#scrollingText.removeChild(text);
    text.destroy();
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  get reverseMaskfilter() {
    foundry.utils.logCompatibilityWarning("InterfaceCanvasGroup.reverseMaskfilter is deprecated. "
      + "Please create your own ReverseMaskFilter, or instead of attaching the filter to each of your "
      + "objects extend the already masked GridLayer with a container for these objects, "
      + "which is much better for performance.", {since: 11, until: 13});
    return ReverseMaskFilter.create({
      uMaskSampler: canvas.primary.tokensRenderTexture,
      channel: "a"
    });
  }
}
