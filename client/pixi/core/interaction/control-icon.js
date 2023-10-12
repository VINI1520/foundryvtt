/**
 * A generic helper for drawing a standard Control Icon
 * @type {PIXI.Container}
 */
class ControlIcon extends PIXI.Container {
  constructor({texture, size=40, borderColor=0xFF5500, tint=null}={}, ...args) {
    super(...args);

    // Define arguments
    this.iconSrc = texture;
    this.size = size;
    this.rect = [-2, -2, size+4, size+4];
    this.borderColor = borderColor;

    /**
     * The color of the icon tint, if any
     * @type {number|null}
     */
    this.tintColor = tint;

    // Define hit area
    this.interactive = true;
    this.interactiveChildren = false;
    this.hitArea = new PIXI.Rectangle(...this.rect);
    this.buttonMode = true;

    // Background
    this.bg = this.addChild(new PIXI.Graphics());

    // Icon
    this.icon = this.addChild(new PIXI.Sprite());

    // Border
    this.border = this.addChild(new PIXI.Graphics());

    // Draw asynchronously
    this.draw();
  }

  /* -------------------------------------------- */

  async draw() {

    // Load the icon texture
    this.texture = this.texture ?? await loadTexture(this.iconSrc);

    // Don't draw a destroyed Control
    if ( this.destroyed ) return this;

    // Draw background
    this.bg.clear().beginFill(0x000000, 0.4).lineStyle(2, 0x000000, 1.0).drawRoundedRect(...this.rect, 5).endFill();

    // Draw border
    this.border.clear().lineStyle(2, this.borderColor, 1.0).drawRoundedRect(...this.rect, 5).endFill();
    this.border.visible = false;

    // Draw icon
    this.icon.texture = this.texture;
    this.icon.width = this.icon.height = this.size;
    this.icon.tint = Number.isNumeric(this.tintColor) ? this.tintColor : 0xFFFFFF;
    return this;
  }
}
