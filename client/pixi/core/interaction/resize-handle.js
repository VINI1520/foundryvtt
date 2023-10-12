class ResizeHandle extends PIXI.Graphics {
  constructor(offset, handlers={}) {
    super();
    this.offset = offset;
    this.handlers = handlers;
    this.lineStyle(4, 0x000000, 1.0).beginFill(0xFF9829, 1.0).drawCircle(0, 0, 10).endFill();
    this.cursor = "pointer";
  }

  /**
   * Track whether the handle is being actively used for a drag workflow
   * @type {boolean}
   */
  active = false;

  /* -------------------------------------------- */

  refresh(bounds) {
    this.position.set(bounds.x + (bounds.width * this.offset[0]), bounds.y + (bounds.height * this.offset[1]));
    this.hitArea = new PIXI.Rectangle(-16, -16, 32, 32); // Make the handle easier to grab
  }

  /* -------------------------------------------- */

  updateDimensions(current, origin, destination, {aspectRatio=null}={}) {

    // Identify the change in dimensions
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;

    // Determine the new width and the new height
    let width = Math.max(origin.width + dx, 24);
    let height = Math.max(origin.height + dy, 24);

    // Constrain the aspect ratio
    if ( aspectRatio ) {
      if ( width >= height ) width = height * aspectRatio;
      else height = width / aspectRatio;
    }

    // Adjust the final points
    return {
      x: current.x,
      y: current.y,
      width: width * Math.sign(current.width),
      height: height * Math.sign(current.height)
    };
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  activateListeners() {
    this.off("pointerover").off("pointerout").off("pointerdown")
      .on("pointerover", this._onHoverIn.bind(this))
      .on("pointerout", this._onHoverOut.bind(this))
      .on("pointerdown", this._onMouseDown.bind(this));
    this.eventMode = "static";
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-over event on a control handle
   * @param {PIXI.FederatedEvent} event   The mouseover event
   * @protected
   */
  _onHoverIn(event) {
    const handle = event.target;
    handle.scale.set(1.5, 1.5);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-out event on a control handle
   * @param {PIXI.FederatedEvent} event   The mouseout event
   * @protected
   */
  _onHoverOut(event) {
    const handle = event.target;
    handle.scale.set(1.0, 1.0);
  }

  /* -------------------------------------------- */

  /**
   * When we start a drag event - create a preview copy of the Tile for re-positioning
   * @param {PIXI.FederatedEvent} event   The mousedown event
   * @protected
   */
  _onMouseDown(event) {
    if ( this.handlers.canDrag && !this.handlers.canDrag() ) return;
    this.active = true;
  }
}
