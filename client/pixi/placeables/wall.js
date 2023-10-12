/**
 * A Wall is an implementation of PlaceableObject which represents a physical or visual barrier within the Scene.
 * Walls are used to restrict Token movement or visibility as well as to define the areas of effect for ambient lights
 * and sounds.
 * @category - Canvas
 * @see {@link WallDocument}
 * @see {@link WallsLayer}
 */
class Wall extends PlaceableObject {
  constructor(document) {
    super(document);
    this.#initializeVertices();
    this.#priorDoorState = this.document.ds;
  }

  /** @inheritdoc */
  static embeddedName = "Wall";

  /** @override */
  static RENDER_FLAGS = {
    redraw: {propagate: ["refresh"]},
    refresh: {propagate: ["refreshState", "refreshLine"], alias: true},
    refreshState: {propagate: ["refreshEndpoints", "refreshHighlight"]},
    refreshLine: {propagate: ["refreshEndpoints", "refreshHighlight", "refreshDirection"]},
    refreshEndpoints: {},
    refreshDirection: {},
    refreshHighlight: {}
  };

  /**
   * A reference the Door Control icon associated with this Wall, if any
   * @type {DoorControl|null}
   * @protected
   */
  doorControl;

  /**
   * A reference to an overhead Tile that is a roof, interior to which this wall is contained
   * @type {Tile}
   */
  roof;

  /**
   * A Graphics object used to highlight this wall segment. Only used when the wall is controlled.
   * @type {PIXI.Graphics}
   */
  highlight;

  /**
   * A set which tracks other Wall instances that this Wall intersects with (excluding shared endpoints)
   * @type {Map<Wall,LineIntersection>}
   */
  intersectsWith = new Map();

  /**
   * Cache the prior door state so that we can identify changes in the door state.
   * @type {number}
   */
  #priorDoorState;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * A convenience reference to the coordinates Array for the Wall endpoints, [x0,y0,x1,y1].
   * @type {number[]}
   */
  get coords() {
    return this.document.c;
  }

  /* -------------------------------------------- */

  /**
   * The endpoints of the wall expressed as {@link PolygonVertex} instances.
   * @type {{a: PolygonVertex, b: PolygonVertex}}
   */
  get vertices() {
    return this.#vertices;
  }

  /** @ignore */
  #vertices;

  /* -------------------------------------------- */

  /**
   * The initial endpoint of the Wall.
   * @type {PolygonVertex}
   */
  get A() {
    return this.#vertices.a;
  }

  /* -------------------------------------------- */

  /**
   * The second endpoint of the Wall.
   * @type {PolygonVertex}
   */
  get B() {
    return this.#vertices.b;
  }

  /* -------------------------------------------- */

  /**
   * A set of vertex sort keys which identify this Wall's endpoints.
   * @type {Set<number>}
   */
  get wallKeys() {
    return this.#wallKeys;
  }

  /** @ignore */
  #wallKeys;

  /* -------------------------------------------- */

  /** @inheritdoc */
  get bounds() {
    const [x0, y0, x1, y1] = this.document.c;
    return new PIXI.Rectangle(x0, y0, x1-x0, y1-y0).normalize();
  }

  /* -------------------------------------------- */

  /**
   * A boolean for whether this wall contains a door
   * @type {boolean}
   */
  get isDoor() {
    return this.document.door > CONST.WALL_DOOR_TYPES.NONE;
  }

  /* -------------------------------------------- */

  /**
   * A boolean for whether the wall contains an open door
   * @returns {boolean}
   */
  get isOpen() {
    return this.isDoor && (this.document.ds === CONST.WALL_DOOR_STATES.OPEN);
  }

  /* -------------------------------------------- */

  /**
   * Is this Wall interior to a non-occluded roof Tile?
   * @type {boolean}
   */
  get hasActiveRoof() {
    if ( !this.roof ) return false;
    return !this.roof.occluded && (this.roof.document.occlusion.mode !== CONST.OCCLUSION_MODES.VISION);
  }

  /* -------------------------------------------- */

  /**
   * Return the coordinates [x,y] at the midpoint of the wall segment
   * @returns {Array<number>}
   */
  get midpoint() {
    return [(this.coords[0] + this.coords[2]) / 2, (this.coords[1] + this.coords[3]) / 2];
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get center() {
    const [x, y] = this.midpoint;
    return new PIXI.Point(x, y);
  }

  /* -------------------------------------------- */

  /**
   * Get the direction of effect for a directional Wall
   * @type {number|null}
   */
  get direction() {
    let d = this.document.dir;
    if ( !d ) return null;
    let c = this.coords;
    let angle = Math.atan2(c[3] - c[1], c[2] - c[0]);
    if ( d === CONST.WALL_DIRECTIONS.LEFT ) return angle + (Math.PI / 2);
    else return angle - (Math.PI / 2);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Create PolygonVertex instances for the Wall endpoints and register the set of vertex keys.
   */
  #initializeVertices() {
    this.#vertices = {
      a: new PolygonVertex(...this.document.c.slice(0, 2)),
      b: new PolygonVertex(...this.document.c.slice(2, 4))
    };
    this.#wallKeys = new Set([this.#vertices.a.key, this.#vertices.b.key]);
  }

  /* -------------------------------------------- */

  /**
   * This helper converts the wall segment to a Ray
   * @returns {Ray}    The wall in Ray representation
   */
  toRay() {
    return Ray.fromArrays(this.coords.slice(0, 2), this.coords.slice(2));
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw() {
    this.line = this.addChild(new PIXI.Graphics());
    this.directionIcon = this.addChild(this.#drawDirection());
    this.endpoints = this.addChild(new PIXI.Graphics());
    this.endpoints.cursor = "pointer";
  }

  /* -------------------------------------------- */

  /** @override */
  clear() {
    this.clearDoorControl();
    return super.clear();
  }

  /* -------------------------------------------- */

  /**
   * Draw a control icon that is used to manipulate the door's open/closed state
   * @returns {DoorControl}
   */
  createDoorControl() {
    if ((this.document.door === CONST.WALL_DOOR_TYPES.SECRET) && !game.user.isGM) return null;
    this.doorControl = canvas.controls.doors.addChild(new DoorControl(this));
    this.doorControl.draw();
    return this.doorControl;
  }

  /* -------------------------------------------- */

  /**
   * Clear the door control if it exists.
   */
  clearDoorControl() {
    if ( this.doorControl ) {
      this.doorControl.destroy({children: true});
      this.doorControl = null;
    }
  }

  /* -------------------------------------------- */

  /**
   * Determine the orientation of this wall with respect to a reference point
   * @param {Point} point       Some reference point, relative to which orientation is determined
   * @returns {number}          An orientation in CONST.WALL_DIRECTIONS which indicates whether the Point is left,
   *                            right, or collinear (both) with the Wall
   */
  orientPoint(point) {
    const orientation = foundry.utils.orient2dFast(this.A, this.B, point);
    if ( orientation === 0 ) return CONST.WALL_DIRECTIONS.BOTH;
    return orientation < 0 ? CONST.WALL_DIRECTIONS.LEFT : CONST.WALL_DIRECTIONS.RIGHT;
  }

  /* -------------------------------------------- */

  /**
   * Test whether to apply a configured threshold of this wall.
   * When the proximity threshold is met, this wall is excluded as an edge in perception calculations.
   * @param {string} sourceType     Sense type for the source
   * @param {Point} sourceOrigin    The origin or position of the source on the canvas
   * @param {number} [externalRadius=0] The external radius of the source
   * @returns {boolean}             True if the wall has a threshold greater than 0 for the
   *                                source type, and the source type is within that distance.
   */
  applyThreshold(sourceType, sourceOrigin, externalRadius=0) {
    const document = this.document;
    const d = document.threshold[sourceType];
    if ( !d ) return false; // No threshold applies
    const proximity = document[sourceType] === CONST.WALL_SENSE_TYPES.PROXIMITY;
    const pt = foundry.utils.closestPointToSegment(sourceOrigin, this.A, this.B); // Closest point
    const sourceDistance = Math.hypot(pt.x - sourceOrigin.x, pt.y - sourceOrigin.y);
    const thresholdDistance = d * document.parent.dimensions.distancePixels;
    return proximity
      ? Math.max(sourceDistance - externalRadius, 0) < thresholdDistance
      : (sourceDistance + externalRadius) > thresholdDistance;
  }

  /* -------------------------------------------- */

  /**
   * Draw a directional prompt icon for one-way walls to illustrate their direction of effect.
   * @returns {PIXI.Sprite|null}   The drawn icon
   */
  #drawDirection() {
    if ( this.directionIcon ) return;

    // Create the icon
    const tex = getTexture(CONFIG.controlIcons.wallDirection);
    const icon = new PIXI.Sprite(tex);

    // Set icon initial state
    icon.width = icon.height = 32;
    icon.anchor.set(0.5, 0.5);
    icon.visible = false;
    return icon;
  }

  /* -------------------------------------------- */

  /**
   * Compute an approximate Polygon which encloses the line segment providing a specific hitArea for the line
   * @param {number} pad          The amount of padding to apply
   * @returns {PIXI.Polygon}      A constructed Polygon for the line
   */
  #getHitPolygon(pad) {
    const c = this.document.c;

    // Identify wall orientation
    const dx = c[2] - c[0];
    const dy = c[3] - c[1];

    // Define the array of polygon points
    let points;
    if ( Math.abs(dx) >= Math.abs(dy) ) {
      const sx = Math.sign(dx);
      points = [
        c[0]-(pad*sx), c[1]-pad,
        c[2]+(pad*sx), c[3]-pad,
        c[2]+(pad*sx), c[3]+pad,
        c[0]-(pad*sx), c[1]+pad
      ];
    } else {
      const sy = Math.sign(dy);
      points = [
        c[0]-pad, c[1]-(pad*sy),
        c[2]-pad, c[3]+(pad*sy),
        c[2]+pad, c[3]+(pad*sy),
        c[0]+pad, c[1]-(pad*sy)
      ];
    }

    // Return a Polygon which pads the line
    return new PIXI.Polygon(points);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  control({chain=false, ...options}={}) {
    const controlled = super.control(options);
    if ( controlled && chain ) {
      const links = this.getLinkedSegments();
      for ( let l of links.walls ) {
        l.control({releaseOthers: false});
        this.layer.controlledObjects.set(l.id, l);
      }
    }
    return controlled;
  }

  /* -------------------------------------------- */

  /** @override */
  _destroy(options) {
    this.clearDoorControl();
  }

  /* -------------------------------------------- */

  /**
   * Test whether the Wall direction lies between two provided angles
   * This test is used for collision and vision checks against one-directional walls
   * @param {number} lower    The lower-bound limiting angle in radians
   * @param {number} upper    The upper-bound limiting angle in radians
   * @returns {boolean}
   */
  isDirectionBetweenAngles(lower, upper) {
    let d = this.direction;
    if ( d < lower ) {
      while ( d < lower ) d += (2 * Math.PI);
    } else if ( d > upper ) {
      while ( d > upper ) d -= (2 * Math.PI);
    }
    return ( d > lower && d < upper );
  }

  /* -------------------------------------------- */

  /**
   * A simple test for whether a Ray can intersect a directional wall
   * @param {Ray} ray     The ray to test
   * @returns {boolean}    Can an intersection occur?
   */
  canRayIntersect(ray) {
    if ( this.direction === null ) return true;
    return this.isDirectionBetweenAngles(ray.angle - (Math.PI/2), ray.angle + (Math.PI/2));
  }

  /* -------------------------------------------- */

  /**
   * Get an Array of Wall objects which are linked by a common coordinate
   * @returns {Object}    An object reporting ids and endpoints of the linked segments
   */
  getLinkedSegments() {
    const test = new Set();
    const done = new Set();
    const ids = new Set();
    const objects = [];

    // Helper function to add wall points to the set
    const _addPoints = w => {
      let p0 = w.coords.slice(0, 2).join(".");
      if ( !done.has(p0) ) test.add(p0);
      let p1 = w.coords.slice(2).join(".");
      if ( !done.has(p1) ) test.add(p1);
    };

    // Helper function to identify other walls which share a point
    const _getWalls = p => {
      return canvas.walls.placeables.filter(w => {
        if ( ids.has(w.id) ) return false;
        let p0 = w.coords.slice(0, 2).join(".");
        let p1 = w.coords.slice(2).join(".");
        return ( p === p0 ) || ( p === p1 );
      });
    };

    // Seed the initial search with this wall's points
    _addPoints(this);

    // Begin recursively searching
    while ( test.size > 0 ) {
      const testIds = new Array(...test);
      for ( let p of testIds ) {
        let walls = _getWalls(p);
        walls.forEach(w => {
          _addPoints(w);
          if ( !ids.has(w.id) ) objects.push(w);
          ids.add(w.id);
        });
        test.delete(p);
        done.add(p);
      }
    }

    // Return the wall IDs and their endpoints
    return {
      ids: new Array(...ids),
      walls: objects,
      endpoints: new Array(...done).map(p => p.split(".").map(Number))
    };
  }

  /* -------------------------------------------- */

  /**
   * Determine whether this wall is beneath a roof tile, and is considered "interior", or not.
   * Tiles which are hidden do not count as roofs for the purposes of defining interior walls.
   */
  identifyInteriorState() {
    this.roof = null;
    for ( const tile of canvas.tiles.roofs ) {
      if ( tile.document.hidden || !tile.mesh ) continue;
      const [x1, y1, x2, y2] = this.document.c;
      const isInterior = tile.mesh.containsPixel(x1, y1) && tile.mesh.containsPixel(x2, y2);
      if ( isInterior ) this.roof = tile;
    }
  }

  /* -------------------------------------------- */

  /**
   * Update any intersections with this wall.
   */
  updateIntersections() {
    this.#removeIntersections();
    for ( let other of canvas.walls.placeables ) {
      this._identifyIntersectionsWith(other);
    }
    for ( let boundary of canvas.walls.outerBounds ) {
      this._identifyIntersectionsWith(boundary);
    }
    if ( canvas.walls.outerBounds !== canvas.walls.innerBounds ) {
      for ( const boundary of canvas.walls.innerBounds ) {
        this._identifyIntersectionsWith(boundary);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Record the intersection points between this wall and another, if any.
   * @param {Wall} other  The other wall.
   */
  _identifyIntersectionsWith(other) {
    if ( this === other ) return;
    const {a: wa, b: wb} = this.#vertices;
    const {a: oa, b: ob} = other.#vertices;

    // Ignore walls which share an endpoint
    if ( this.#wallKeys.intersects(other.#wallKeys) ) return;

    // Record any intersections
    if ( !foundry.utils.lineSegmentIntersects(wa, wb, oa, ob) ) return;
    const i = foundry.utils.lineLineIntersection(wa, wb, oa, ob, {t1: true});
    if ( !i ) return;  // This eliminates co-linear lines, should not be necessary
    this.intersectsWith.set(other, i);
    other.intersectsWith.set(this, {x: i.x, y: i.y, t0: i.t1, t1: i.t0});
  }

  /* -------------------------------------------- */

  /**
   * Remove this wall's intersections.
   */
  #removeIntersections() {
    for ( const other of this.intersectsWith.keys() ) {
      other.intersectsWith.delete(this);
    }
    this.intersectsWith.clear();
  }

  /* -------------------------------------------- */
  /*  Incremental Refresh                         */
  /* -------------------------------------------- */

  /** @override */
  _applyRenderFlags(flags) {
    if ( flags.refreshLine ) this.#refreshLine();
    if ( flags.refreshEndpoints ) this.#refreshEndpoints();
    if ( flags.refreshDirection ) this.#refreshDirection();
    if ( flags.refreshHighlight ) this.#refreshHighlight();
    if ( flags.refreshState ) this.#refreshState();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the displayed position of the wall which refreshes when the wall coordinates or type changes.
   */
  #refreshLine() {
    const c = this.document.c;
    const wc = this._getWallColor();
    const lw = Wall.#getLineWidth();

    // Draw line
    this.line.clear()
      .lineStyle(lw * 3, 0x000000, 1.0)  // Background black
      .moveTo(c[0], c[1])
      .lineTo(c[2], c[3]);
    this.line.lineStyle(lw, wc, 1.0)  // Foreground color
      .lineTo(c[0], c[1]);

    // Tint direction icon
    if ( this.directionIcon ) {
      this.directionIcon.position.set((c[0] + c[2]) / 2, (c[1] + c[3]) / 2);
      this.directionIcon.tint = wc;
    }

    // Re-position door control icon
    if ( this.doorControl ) this.doorControl.reposition();

    // Update hit area for interaction
    this.line.hitArea = this.#getHitPolygon(lw * 3);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of wall endpoints which refreshes when the wall position or state changes.
   */
  #refreshEndpoints() {
    const c = this.coords;
    const wc = this._getWallColor();
    const lw = Wall.#getLineWidth();
    const cr = (this.hover || this.layer.highlightObjects) ? lw * 4 : lw * 3;
    this.endpoints.clear()
      .lineStyle(lw, 0x000000, 1.0)
      .beginFill(wc, 1.0)
      .drawCircle(c[0], c[1], cr)
      .drawCircle(c[2], c[3], cr)
      .endFill();
  }

  /* -------------------------------------------- */

  /**
   * Draw a directional prompt icon for one-way walls to illustrate their direction of effect.
   * @returns {PIXI.Sprite|null}   The drawn icon
   */
  #refreshDirection() {
    if ( !this.document.dir ) return this.directionIcon.visible = false;

    // Set icon state and rotation
    const icon = this.directionIcon;
    const iconAngle = -Math.PI / 2;
    const angle = this.direction;
    icon.rotation = iconAngle + angle;
    icon.visible = true;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the appearance of the wall control highlight graphic. Occurs when wall control or position changes.
   */
  #refreshHighlight() {

    // Remove highlight
    if ( !this.controlled ) {
      if ( this.highlight ) {
        this.removeChild(this.highlight).destroy();
        this.highlight = undefined;
      }
      return;
    }

    // Add highlight
    if ( !this.highlight ) {
      this.highlight = this.addChildAt(new PIXI.Graphics(), 0);
      this.highlight.eventMode = "none";
    }
    else this.highlight.clear();

    // Configure highlight
    const c = this.coords;
    const lw = Wall.#getLineWidth();
    const cr = lw * 2;
    let cr2 = cr * 2;
    let cr4 = cr * 4;

    // Draw highlight
    this.highlight.lineStyle({width: cr, color: 0xFF9829})
      .drawRoundedRect(c[0] - cr2, c[1] - cr2, cr4, cr4, cr)
      .drawRoundedRect(c[2] - cr2, c[3] - cr2, cr4, cr4, cr)
      .lineStyle({width: cr2, color: 0xFF9829})
      .moveTo(c[0], c[1]).lineTo(c[2], c[3]);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the displayed state of the Wall.
   */
  #refreshState() {
    this.alpha = this._getTargetAlpha();
  }

  /* -------------------------------------------- */

  /**
   * Given the properties of the wall - decide upon a color to render the wall for display on the WallsLayer
   * @returns {number}
   * @protected
   */
  _getWallColor() {
    const senses = CONST.WALL_SENSE_TYPES;

    // Invisible Walls
    if ( this.document.sight === senses.NONE ) return 0x77E7E8;

    // Terrain Walls
    else if ( this.document.sight === senses.LIMITED ) return 0x81B90C;

    // Windows (Sight Proximity)
    else if ( [senses.PROXIMITY, senses.DISTANCE].includes(this.document.sight) ) return 0xc7d8ff;

    // Ethereal Walls
    else if ( this.document.move === senses.NONE ) return 0xCA81FF;

    // Doors
    else if ( this.document.door === CONST.WALL_DOOR_TYPES.DOOR ) {
      let ds = this.document.ds || CONST.WALL_DOOR_STATES.CLOSED;
      if ( ds === CONST.WALL_DOOR_STATES.CLOSED ) return 0x6666EE;
      else if ( ds === CONST.WALL_DOOR_STATES.OPEN ) return 0x66CC66;
      else if ( ds === CONST.WALL_DOOR_STATES.LOCKED ) return 0xEE4444;
    }

    // Secret Doors
    else if ( this.document.door === CONST.WALL_DOOR_TYPES.SECRET ) {
      let ds = this.document.ds || CONST.WALL_DOOR_STATES.CLOSED;
      if ( ds === CONST.WALL_DOOR_STATES.CLOSED ) return 0xA612D4;
      else if ( ds === CONST.WALL_DOOR_STATES.OPEN ) return 0x7C1A9b;
      else if ( ds === CONST.WALL_DOOR_STATES.LOCKED ) return 0xEE4444;
    }

    // Standard Walls
    return 0xFFFFBB;
  }

  /* -------------------------------------------- */

  /**
   * Adapt the width that the wall should be rendered based on the grid size.
   * @returns {number}
   */
  static #getLineWidth() {
    const s = canvas.dimensions.size;
    if ( s > 150 ) return 4;
    else if ( s > 100 ) return 3;
    return 2;
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    this.layer._cloneType = this.document.toJSON();
    this.updateIntersections();
    this.identifyInteriorState();
    this.#onModifyWall(this.document.door !== CONST.WALL_DOOR_TYPES.NONE);
  }

  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data, options, userId) {
    super._onUpdate(data, options, userId);

    // Incremental Refresh
    const changed = new Set(Object.keys(data));
    this.renderFlags.set({
      refreshLine: ["c", "sight", "move", "door", "ds"].some(k => changed.has(k)),
      refreshDirection: changed.has("dir")
    });

    // Update the clone tool wall data
    this.layer._cloneType = this.document.toJSON();

    // Handle wall changes which require perception changes.
    const rebuildEndpoints = changed.has("c") || CONST.WALL_RESTRICTION_TYPES.some(k => changed.has(k));
    const doorChange = ["door", "ds"].some(k => changed.has(k));
    if ( rebuildEndpoints ) {
      this.#initializeVertices();
      this.updateIntersections();
      this.identifyInteriorState();
    }
    if ( rebuildEndpoints || doorChange || ("threshold" in data) ) this.#onModifyWall(doorChange);

    // Trigger door interaction sounds
    if ( "ds" in data ) {
      const states = CONST.WALL_DOOR_STATES;
      let interaction;
      if ( data.ds === states.LOCKED ) interaction = "lock";
      else if ( data.ds === states.OPEN ) interaction = "open";
      else if ( data.ds === states.CLOSED ) {
        if ( this.#priorDoorState === states.OPEN ) interaction = "close";
        else if ( this.#priorDoorState === states.LOCKED ) interaction = "unlock";
      }
      if ( options.sound !== false ) this._playDoorSound(interaction);
      this.#priorDoorState = data.ds;
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    this.clearDoorControl();
    this.#removeIntersections();
    this.#onModifyWall(false);
  }

  /* -------------------------------------------- */

  /**
   * Callback actions when a wall that contains a door is moved or its state is changed
   * @param {boolean} doorChange   Update vision and sound restrictions
   */
  #onModifyWall(doorChange=false) {

    // Re-initialize perception
    canvas.perception.update({
      initializeLighting: true,
      initializeVision: true,
      initializeSounds: true,
      refreshTiles: true
    });

    // Re-draw door icons
    if ( doorChange ) {
      const dt = this.document.door;
      const hasCtrl = (dt === CONST.WALL_DOOR_TYPES.DOOR) || ((dt === CONST.WALL_DOOR_TYPES.SECRET) && game.user.isGM);
      if ( hasCtrl ) {
        if ( this.doorControl ) this.doorControl.draw(); // Asynchronous
        else this.createDoorControl();
      }
      else this.clearDoorControl();
    }
  }

  /* -------------------------------------------- */

  /**
   * Play a door interaction sound.
   * This plays locally, each client independently applies this workflow.
   * @param {string} interaction      The door interaction: "open", "close", "lock", "unlock", or "test".
   * @protected
   * @internal
   */
  _playDoorSound(interaction) {
    if ( !CONST.WALL_DOOR_INTERACTIONS.includes(interaction) ) {
      throw new Error(`"${interaction}" is not a valid door interaction type`);
    }
    if ( !this.isDoor ) return;
    const doorSound = CONFIG.Wall.doorSounds[this.document.doorSound];
    let sounds = doorSound?.[interaction];
    if ( sounds && !Array.isArray(sounds) ) sounds = [sounds];
    else if ( !sounds?.length ) {
      if ( interaction !== "test" ) return;
      sounds = [CONFIG.sounds.lock];
    }
    const src = sounds[Math.floor(Math.random() * sounds.length)];
    AudioHelper.play({src});
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _createInteractionManager() {
    const mgr = super._createInteractionManager();
    mgr.options.target = "endpoints";
    return mgr;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners() {
    super.activateListeners();
    this.line.eventMode = "static";
    this.line.cursor = "pointer";
    this.line.on("pointerdown", this.mouseInteractionManager.handleEvent, this.mouseInteractionManager)
      .on("pointerup", this.mouseInteractionManager.handleEvent, this.mouseInteractionManager)
      .on("mouseupoutside", this.mouseInteractionManager.handleEvent, this.mouseInteractionManager)
      .on("pointerout", this.mouseInteractionManager.handleEvent, this.mouseInteractionManager)
      .on("pointerover", this._onMouseOverLine, this);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _canControl(user, event) {
    if ( !this.layer.active || this.isPreview ) return false;
    // If the User is chaining walls, we don't want to control the last one
    const isChain = this.hover && (game.keyboard.downKeys.size === 1)
      && game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL);
    return !isChain;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onHoverIn(event, options) {
    // contrary to hover out, hover in is prevented in chain mode to avoid distracting the user
    if ( this.layer._chain ) return false;
    this.zIndex = 1;
    const dest = event.getLocalPosition(this.layer);
    this.layer.last = {
      point: WallsLayer.getClosestEndpoint(dest, this)
    };
    return super._onHoverIn(event, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onHoverOut(event) {
    this.zIndex = 0;
    const mgr = canvas.mouseInteractionManager;
    if ( this.hover && !this.layer._chain && (mgr.state < mgr.states.CLICKED) ) this.layer.last = {point: null};
    return super._onHoverOut(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-hover events on the line segment itself, pulling the Wall to the front of the container stack
   * @param {PIXI.FederatedEvent} event
   * @protected
   */
  _onMouseOverLine(event) {
    if ( this.layer._chain ) return false;
    event.stopPropagation();
    if ( this.layer.preview.children.length ) return;
    this.mouseInteractionManager.handleEvent(event);
    this.zIndex = 1;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickLeft(event) {
    if ( this.layer._chain ) return false;
    event.stopPropagation();
    const alt = game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.ALT);
    const shift = game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT);
    if ( this.controlled && !alt ) {
      if ( shift ) return this.release();
      else if ( this.layer.controlled.length > 1 ) return this.layer._onDragLeftStart(event);
    }
    return this.control({releaseOthers: !shift, chain: alt});
  }

  /* -------------------------------------------- */

  /** @override */
  _onClickLeft2(event) {
    event.stopPropagation();
    const sheet = this.sheet;
    sheet.render(true, {walls: this.layer.controlled});
  }

  /* -------------------------------------------- */

  /** @override */
  _onClickRight2(event) {
    event.stopPropagation();
    const sheet = this.sheet;
    sheet.render(true, {walls: this.layer.controlled});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftStart(event) {
    const origin = event.interactionData.origin;
    const dLeft = Math.hypot(origin.x - this.coords[0], origin.y - this.coords[1]);
    const dRight = Math.hypot(origin.x - this.coords[2], origin.y - this.coords[3]);
    event.interactionData.fixed = dLeft < dRight ? 1 : 0; // Affix the opposite point
    return super._onDragLeftStart(event);
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftMove(event) {
    // Pan the canvas if the drag event approaches the edge
    canvas._onDragCanvasPan(event);

    // Group movement
    const {destination, fixed, origin} = event.interactionData;
    let clones = event.interactionData.clones || [];

    if ( clones.length > 1 ) {
      // Drag a group of walls - snap to the end point maintaining relative positioning
      const p0 = fixed ? this.coords.slice(0, 2) : this.coords.slice(2, 4);
      // Get the snapped final point
      const pt = this.layer._getWallEndpointCoordinates({
        x: destination.x + (p0[0] - origin.x),
        y: destination.y + (p0[1] - origin.y)
      }, {snap: false});
      const dx = pt[0] - p0[0];
      const dy = pt[1] - p0[1];
      for ( let c of clones ) {
        c.document.c = c._original.document.c.map((p, i) => i % 2 ? p + dy : p + dx);
      }
    }

    // Single-wall pivot
    else if ( clones.length === 1 ) {
      const w = clones[0];
      const pt = this.layer._getWallEndpointCoordinates(destination, {snap: false});
      w.document.c = fixed ? pt.concat(this.coords.slice(2, 4)) : this.coords.slice(0, 2).concat(pt);
    }

    // Refresh display
    clones.forEach(c => c.refresh());
  }

  /* -------------------------------------------- */

  /** @override */
  async _onDragLeftDrop(event) {
    const {origin, destination, fixed} = event.interactionData;
    event.interactionData.clearPreviewContainer = false;
    let clones = event.interactionData.clones || [];

    const layer = this.layer;
    const snap = layer._forceSnap || !event.shiftKey;

    // Pivot a single wall
    if ( clones.length === 1 ) {
      // Get the snapped final point
      const pt = this.layer._getWallEndpointCoordinates(destination, {snap});
      const p0 = fixed ? this.coords.slice(2, 4) : this.coords.slice(0, 2);
      const coords = fixed ? pt.concat(p0) : p0.concat(pt);
      try {

        // If we collapsed the wall, delete it
        if ( (coords[0] === coords[2]) && (coords[1] === coords[3]) ) {
          return this.document.delete();
        }

        // Otherwise shift the last point
        this.layer.last.point = pt;
        return this.document.update({c: coords});
      } finally {
        this.layer.clearPreviewContainer();
      }
    }

    // Drag a group of walls - snap to the end point maintaining relative positioning
    const p0 = fixed ? this.coords.slice(0, 2) : this.coords.slice(2, 4);
    // Get the snapped final point
    const pt = this.layer._getWallEndpointCoordinates({
      x: destination.x + (p0[0] - origin.x),
      y: destination.y + (p0[1] - origin.y)
    }, {snap});
    const dx = pt[0] - p0[0];
    const dy = pt[1] - p0[1];
    const updates = clones.map(w => {
      const c = w._original.document.c;
      return {_id: w._original.id, c: [c[0]+dx, c[1]+dy, c[2]+dx, c[3]+dy]};
    });
    try {
      return await canvas.scene.updateEmbeddedDocuments("Wall", updates);
    } finally {
      this.layer.clearPreviewContainer();
    }
  }
}
