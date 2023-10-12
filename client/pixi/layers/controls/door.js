/**
 * An icon representing a Door Control
 * @extends {PIXI.Container}
 */
class DoorControl extends PIXI.Container {
  constructor(wall) {
    super();
    this.wall = wall;
    this.visible = false;  // Door controls are not visible by default
  }

  /* -------------------------------------------- */

  /**
   * The center of the wall which contains the door.
   * @returns {PIXI.Point|PIXI.Point|boolean|*}
   */
  get center() {
    return this.wall.center;
  }

  /* -------------------------------------------- */

  /**
   * Draw the DoorControl icon, displaying its icon texture and border
   * @returns {Promise<DoorControl>}
   */
  async draw() {

    // Background
    this.bg = this.bg || this.addChild(new PIXI.Graphics());
    this.bg.clear().beginFill(0x000000, 1.0).drawRoundedRect(-2, -2, 44, 44, 5).endFill();
    this.bg.alpha = 0;

    // Control Icon
    this.icon = this.icon || this.addChild(new PIXI.Sprite());
    this.icon.width = this.icon.height = 40;
    this.icon.alpha = 0.6;
    this.icon.texture = this._getTexture();

    // Border
    this.border = this.border || this.addChild(new PIXI.Graphics());
    this.border.clear().lineStyle(1, 0xFF5500, 0.8).drawRoundedRect(-2, -2, 44, 44, 5).endFill();
    this.border.visible = false;

    // Add control interactivity
    this.interactive = true;
    this.interactiveChildren = false;
    this.hitArea = new PIXI.Rectangle(-2, -2, 44, 44);
    this.buttonMode = true;

    // Set position
    this.reposition();
    this.alpha = 1.0;

    // Activate listeners
    this.removeAllListeners();
    this.on("mouseover", this._onMouseOver).on("mouseout", this._onMouseOut)
      .on("mousedown", this._onMouseDown).on("rightdown", this._onRightDown);
    return this;
  }


  /* -------------------------------------------- */

  /**
   * Get the icon texture to use for the Door Control icon based on the door state
   * @returns {PIXI.Texture}
   */
  _getTexture() {

    // Determine displayed door state
    const ds = CONST.WALL_DOOR_STATES;
    let s = this.wall.document.ds;
    if ( !game.user.isGM && (s === ds.LOCKED) ) s = ds.CLOSED;

    // Determine texture path
    const icons = CONFIG.controlIcons;
    let path = {
      [ds.LOCKED]: icons.doorLocked,
      [ds.CLOSED]: icons.doorClosed,
      [ds.OPEN]: icons.doorOpen
    }[s] || icons.doorClosed;
    if ( (s === ds.CLOSED) && (this.wall.document.door === CONST.WALL_DOOR_TYPES.SECRET) ) path = icons.doorSecret;

    // Obtain the icon texture
    return getTexture(path);
  }

  /* -------------------------------------------- */

  reposition() {
    let pos = this.wall.midpoint.map(p => p - 20);
    this.position.set(...pos);
  }

  /* -------------------------------------------- */

  /**
   * Determine whether the DoorControl is visible to the calling user's perspective.
   * The control is always visible if the user is a GM and no Tokens are controlled.
   * @see {CanvasVisibility#testVisibility}
   * @type {boolean}
   */
  get isVisible() {

    // Hide secret doors from players
    const w = this.wall;
    if ( (w.document.door === CONST.WALL_DOOR_TYPES.SECRET) && !game.user.isGM ) return false;

    // Test two points which are perpendicular to the door midpoint
    const ray = this.wall.toRay();
    const [x, y] = w.midpoint;
    const [dx, dy] = [-ray.dy, ray.dx];
    const t = 3 / (Math.abs(dx) + Math.abs(dy)); // Approximate with Manhattan distance for speed
    const points = [
      {x: x + (t * dx), y: y + (t * dy)},
      {x: x - (t * dx), y: y - (t * dy)}
    ];

    // Test each point for visibility
    return points.some(p => {
      return canvas.effects.visibility.testVisibility(p, {object: this, tolerance: 0});
    });
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Handle mouse over events on a door control icon.
   * @param {PIXI.InteractionEvent} event      The originating interaction event
   * @protected
   */
  _onMouseOver(event) {
    event.stopPropagation();
    const canControl = game.user.can("WALL_DOORS");
    const blockPaused = game.paused && !game.user.isGM;
    if ( !canControl || blockPaused ) return false;
    this.border.visible = true;
    this.icon.alpha = 1.0;
    this.bg.alpha = 0.25;
    canvas.walls.hover = this.wall;
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse out events on a door control icon.
   * @param {PIXI.InteractionEvent} event      The originating interaction event
   * @protected
   */
  _onMouseOut(event) {
    event.stopPropagation();
    if ( game.paused && !game.user.isGM ) return false;
    this.border.visible = false;
    this.icon.alpha = 0.6;
    this.bg.alpha = 0;
    canvas.walls.hover = null;
  }

  /* -------------------------------------------- */

  /**
   * Handle left mouse down events on a door control icon.
   * This should only toggle between the OPEN and CLOSED states.
   * @param {PIXI.InteractionEvent} event      The originating interaction event
   * @protected
   */
  _onMouseDown(event) {
    if ( event.data.originalEvent.button !== 0 ) return; // Only support standard left-click
    event.stopPropagation();
    const state = this.wall.document.ds;
    const states = CONST.WALL_DOOR_STATES;

    // Determine whether the player can control the door at this time
    if ( !game.user.can("WALL_DOORS") ) return false;
    if ( game.paused && !game.user.isGM ) {
      ui.notifications.warn("GAME.PausedWarning", {localize: true});
      return false;
    }

    // Play an audio cue for locked doors
    if ( state === states.LOCKED ) {
      AudioHelper.play({src: CONFIG.sounds.lock});
      return false;
    }

    // Toggle between OPEN and CLOSED states
    return this.wall.document.update({ds: state === states.CLOSED ? states.OPEN : states.CLOSED});
  }

  /* -------------------------------------------- */

  /**
   * Handle right mouse down events on a door control icon.
   * This should toggle whether the door is LOCKED or CLOSED.
   * @param {PIXI.InteractionEvent} event      The originating interaction event
   * @protected
   */
  _onRightDown(event) {
    event.stopPropagation();
    if ( !game.user.isGM ) return;
    let state = this.wall.document.ds,
        states = CONST.WALL_DOOR_STATES;
    if ( state === states.OPEN ) return;
    state = state === states.LOCKED ? states.CLOSED : states.LOCKED;
    return this.wall.document.update({ds: state});
  }
}
