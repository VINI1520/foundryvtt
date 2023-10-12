/**
 * A single Mouse Cursor
 * @type {PIXI.Container}
 */
class Cursor extends PIXI.Container {
  constructor(user) {
    super();
    this.target = {x: 0, y: 0};
    this.draw(user);

    // Register and add animation
    canvas.app.ticker.add(this._animate, this);
  }

  /* -------------------------------------------- */

  /**
   * Draw the user's cursor as a small dot with their user name attached as text
   */
  draw(user) {

    // Cursor dot
    const d = this.addChild(new PIXI.Graphics());
    const color = user.color.replace("#", "0x") || 0x42F4E2;
    d.beginFill(color, 0.35).lineStyle(1, 0x000000, 0.5).drawCircle(0, 0, 6);

    // Player name
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = 14;
    let n = this.addChild(new PreciseText(user.name, style));
    n.x -= n.width / 2;
    n.y += 10;
  }

  /* -------------------------------------------- */

  /**
   * Move an existing cursor to a new position smoothly along the animation loop
   */
  _animate() {
    let dy = this.target.y - this.y,
        dx = this.target.x - this.x;
    if ( Math.abs( dx ) + Math.abs( dy ) < 10 ) return;
    this.x += dx / 10;
    this.y += dy / 10;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  destroy(options) {
    canvas.app.ticker.remove(this._animate, this);
    super.destroy(options);
  }
}
