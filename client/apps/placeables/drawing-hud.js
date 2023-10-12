/**
 * An implementation of the PlaceableHUD base class which renders a heads-up-display interface for Drawing objects.
 * @extends {BasePlaceableHUD}
 * @param {Drawing} object                The {@link Drawing} this HUD is bound to.
 * @param {ApplicationOptions} [options]  Application configuration options.
 */
class DrawingHUD extends BasePlaceableHUD {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "drawing-hud",
      template: "templates/hud/drawing-hud.html"
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const d = this.object.document;
    return foundry.utils.mergeObject(super.getData(options), {
      lockedClass: d.locked ? "active" : "",
      visibilityClass: d.hidden ? "active" : ""
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  setPosition(options) {
    let {x, y, width, height} = this.object.hitArea;
    const c = 70;
    const p = 10;
    const position = {
      width: width + (c * 2) + (p * 2),
      height: height + (p * 2),
      left: x + this.object.x - c - p,
      top: y + this.object.y - p
    };
    this.element.css(position);
  }
}
