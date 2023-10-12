/**
 * Render the HUD container
 * @type {Application}
 */
class HeadsUpDisplay extends Application {
  constructor(...args) {
    super(...args);

    /**
     * Token HUD
     * @type {TokenHUD}
     */
    this.token = new TokenHUD();

    /**
     * Tile HUD
     * @type {TileHUD}
     */
    this.tile = new TileHUD();

    /**
     * Drawing HUD
     * @type {DrawingHUD}
     */
    this.drawing = new DrawingHUD();

    /**
     * Chat Bubbles
     * @type {ChatBubbles}
     */
    this.bubbles = new ChatBubbles();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.id = "hud";
    options.template = "templates/hud/hud.html";
    options.popOut = false;
    return options;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    if ( !canvas.ready ) return {};
    return {
      width: canvas.dimensions.width,
      height: canvas.dimensions.height
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, options) {
    await super._render(force, options);
    this.align();
  }

  /* -------------------------------------------- */

  /**
   * Align the position of the HUD layer to the current position of the canvas
   */
  align() {
    const hud = this.element[0];
    const {x, y} = canvas.primary.getGlobalPosition();
    const scale = canvas.stage.scale.x;
    hud.style.left = `${x}px`;
    hud.style.top = `${y}px`;
    hud.style.transform = `scale(${scale})`;
  }
}
