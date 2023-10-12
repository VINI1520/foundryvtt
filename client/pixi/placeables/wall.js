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
  }

  /**
   * An reference the Door Control icon associated with this Wall, if any
   * @type {DoorControl|null}
   * @private
   */
  doorControl;

  /**
   * A reference to an overhead Tile that is a roof, interior to which this wall is contained
   * @type {Tile}
   */
  roof;

  /**
   * A set which tracks other Wall instances that this Wall intersects with (excluding shared endpoints)
   * @type {Map<Wall,LineIntersection>}
   */
  intersectsWith = new Map();


  /** @inheritdoc */
  static embeddedName = "Wall";

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
    return !this.roof.occluded && (this.roof.document.occlusion.mode !== CONST.TILE_OCCLUSION_MODES.VISION);
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
    this.directionIcon = this.document.dir ? this.addChild(this._drawDirection()) : null;
    this.line = this.addChild(new PIXI.Graphics());
    this.endpoints = this.addChild(new PIXI.Graphics());
    this.endpoints.buttonMode = true;
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
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _createInteractionManager() {
    const mgr = super._createInteractionManager();
    mgr.options.target = ["endpoints"];
    return mgr;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners() {
    super.activateListeners();
    this.line.interactive = true;
    this.line.on("mouseover", this._onMouseOverLine, this).on("mouseout", this._onHoverOut, this);
  }

  /* -------------------------------------------- */

  /**
   * Draw a directional prompt icon for one-way walls to illustrate their direction of effect.
   * @returns {PIXI.Sprite|null}   The drawn icon
   * @private
   */
  _drawDirection() {
    if (this.directionIcon) this.removeChild(this.directionIcon);
    let d = this.document.dir;
    if ( !d ) return null;

    // Create the icon
    const icon = PIXI.Sprite.from("icons/svg/wall-direction.svg");
    icon.width = icon.height = 32;

    // Rotate the icon
    let iconAngle = -Math.PI / 2;
    let angle = this.direction;
    icon.anchor.set(0.5, 0.5);
    icon.rotation = iconAngle + angle;
    return icon;
  }

  /* -------------------------------------------- */

  /** @override */
  _refresh(options) {
    const p = this.coords;
    const mp = [(p[0] + p[2]) / 2, (p[1] + p[3]) / 2];
    const wc = this._getWallColor();

    // Determine circle radius and line width
    let lw = 2;
    if ( canvas.dimensions.size > 150 ) lw = 4;
    else if ( canvas.dimensions.size > 100 ) lw = 3;
    const cr = this.hover ? lw * 4 : lw * 3;
    let lw3 = lw * 3;

    // Draw line
    this.line.clear()
      .lineStyle(lw3, 0x000000, 1.0)  // Background black
      .moveTo(p[0], p[1])
      .lineTo(p[2], p[3]);
    this.line.lineStyle(lw, wc, 1.0)  // Foreground color
      .lineTo(p[0], p[1]);

    // Draw endpoints
    this.endpoints.clear()
      .lineStyle(lw, 0x000000, 1.0)
      .beginFill(wc, 1.0)
      .drawCircle(p[0], p[1], cr)
      .drawCircle(p[2], p[3], cr)
      .endFill();

    // Tint direction icon
    if ( this.directionIcon ) {
      this.directionIcon.position.set(mp[0], mp[1]);
      this.directionIcon.tint = wc;
    }

    // Re-position door control icon
    if ( this.doorControl ) this.doorControl.reposition();

    // Update line hit area
    this.line.hitArea = this._getWallHitPolygon(p, lw3);
  }

  /* -------------------------------------------- */

  /**
   * Compute an approximate Polygon which encloses the line segment providing a specific hitArea for the line
   * @param {number[]} coords     The original wall coordinates
   * @param {number} pad          The amount of padding to apply
   * @returns {PIXI.Polygon}      A constructed Polygon for the line
   * @private
   */
  _getWallHitPolygon(coords, pad) {

    // Identify wall orientation
    const dx = coords[2] - coords[0];
    const dy = coords[3] - coords[1];

    // Define the array of polygon points
    let points;
    if ( Math.abs(dx) >= Math.abs(dy) ) {
      const sx = Math.sign(dx);
      points = [
        coords[0]-(pad*sx), coords[1]-pad,
        coords[2]+(pad*sx), coords[3]-pad,
        coords[2]+(pad*sx), coords[3]+pad,
        coords[0]-(pad*sx), coords[1]+pad
      ];
    } else {
      const sy = Math.sign(dy);
      points = [
        coords[0]-pad, coords[1]-(pad*sy),
        coords[2]-pad, coords[3]+(pad*sy),
        coords[2]+pad, coords[3]+(pad*sy),
        coords[0]+pad, coords[1]-(pad*sy)
      ];
    }

    // Return a Polygon which pads the line
    return new PIXI.Polygon(points);
  }

  /* -------------------------------------------- */

  /**
   * Given the properties of the wall - decide upon a color to render the wall for display on the WallsLayer
   * @private
   */
  _getWallColor() {

    // Invisible Walls
    if ( this.document.sight === CONST.WALL_SENSE_TYPES.NONE ) return 0x77E7E8;

    // Terrain Walls
    else if ( this.document.sight === CONST.WALL_SENSE_TYPES.LIMITED ) return 0x81B90C;

    // Ethereal Walls
    else if ( this.document.move === CONST.WALL_SENSE_TYPES.NONE ) return 0xCA81FF;

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
    else return 0xFFFFBB;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onControl({chain=false}={}) {

    // Add chained walls
    if ( chain ) {
      const links = this.getLinkedSegments();
      for ( let l of links.walls ) {
        l.control({releaseOthers: false});
        this.layer.controlledObjects.set(l.id, l);
      }
    }

    // Draw control highlights
    this.layer.highlightControlledSegments();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onRelease(options) {
    this.layer.highlightControlledSegments();
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
      if ( tile.document.hidden ) continue;
      const [x1, y1, x2, y2] = this.document.c;
      const isInterior = tile.containsPixel(x1, y1) && tile.containsPixel(x2, y2);
      if ( isInterior ) this.roof = tile;
    }
  }

  /* -------------------------------------------- */

  /**
   * Update any intersections with this wall.
   */
  updateIntersections() {
    this._removeIntersections();
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
   * @private
   */
  _removeIntersections() {
    for ( const other of this.intersectsWith.keys() ) {
      other.intersectsWith.delete(this);
    }
    this.intersectsWith.clear();
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onCreate(...args) {
    super._onCreate(...args);
    this.layer._cloneType = this.document.toJSON();
    this.updateIntersections();
    this.identifyInteriorState();
    this._onModifyWall(this.document.door !== CONST.WALL_DOOR_TYPES.NONE);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onUpdate(data, ...args) {
    super._onUpdate(data, ...args);

    // Re-draw if we have a direction marker
    const redraw = ("dir" in data) || this.document.dir;
    if ( redraw ) this.draw();

    // If the wall is controlled, update the highlighted segments
    if ( this.controlled ) {
      canvas.addPendingOperation("WallsLayer.highlightControlledSegments", this.layer.highlightControlledSegments, this.layer);
    }

    // Downstream layer operations
    this.layer._cloneType = this.document.toJSON();

    // // If the type of door or door state has changed also modify the door icon
    const rebuildEndpoints = ("c" in data) || CONST.WALL_RESTRICTION_TYPES.some(k => k in data);
    const doorChange = ("door" in data) || ("ds" in data) || (this.isDoor && redraw);
    if ( rebuildEndpoints ) {
      this.#initializeVertices();
      this.updateIntersections();
      this.identifyInteriorState();
    }
    if ( rebuildEndpoints || doorChange ) this._onModifyWall(doorChange);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDelete(...args) {
    super._onDelete(...args);
    const wasControlled = this.controlled;

    // Release the deleted wall and update highlighted segments
    this.release();
    if ( wasControlled ) {
      canvas.addPendingOperation("WallsLayer.highlightControlledSegments", this.layer.highlightControlledSegments, this.layer);
    }

    // Refresh the display
    this.clearDoorControl();
    this._removeIntersections();
    this._onModifyWall(false);
  }

  /* -------------------------------------------- */

  /**
   * Callback actions when a wall that contains a door is moved or its state is changed
   * @param {boolean} doorChange   Update vision and sound restrictions
   * @private
   */
  _onModifyWall(doorChange=false) {

    const perceptionUpdate = {
      initializeLighting: true,
      initializeVision: true,
      initializeSounds: true,
      refreshTiles: true
    };

    // Re-draw door icons
    if ( doorChange ) {
      perceptionUpdate.forceUpdateFog = true;
      const dt = this.document.door;
      const hasCtrl = (dt === CONST.WALL_DOOR_TYPES.DOOR) || ((dt === CONST.WALL_DOOR_TYPES.SECRET) && game.user.isGM);
      if ( hasCtrl ) {
        if ( this.doorControl ) this.doorControl.draw(); // Asynchronous
        else this.createDoorControl();
      }
      else this.clearDoorControl();
    }

    // Re-initialize perception
    canvas.perception.update(perceptionUpdate, true);
  }

  /* -------------------------------------------- */
  /*  Interaction Event Callbacks                 */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _canControl(user, event) {
    // If the User is chaining walls, we don't want to control the last one
    const isChain = this.hover && (game.keyboard.downKeys.size === 1)
      && game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL);
    return !isChain;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onHoverIn(event, options) {
    this.zIndex = 1;
    if ( !this.layer._chain && event.data ) {
      const dest = event.data.getLocalPosition(this.layer);
      this.layer.last = {
        point: WallsLayer.getClosestEndpoint(dest, this)
      };
    }
    return super._onHoverIn(event, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onHoverOut(event) {
    this.zIndex = 0;
    if ( this.hover && !this.layer._chain ) this.layer.last = {point: null};
    return super._onHoverOut(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-hover events on the line segment itself, pulling the Wall to the front of the container stack
   * @param {object} event
   * @private
   */
  _onMouseOverLine(event) {
    event.stopPropagation();
    if ( this.layer.preview.children.length ) return;
    this.zIndex = 1;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickLeft(event) {
    const oe = event.data.originalEvent;
    if ( this.controlled ) {
      if ( oe.shiftKey ) return this.release();
    }
    else return this.control({releaseOthers: !oe.shiftKey, chain: oe.altKey});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickLeft2(event) {
    const sheet = this.sheet;
    sheet.render(true, {walls: this.layer.controlled});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickRight2(event) {
    return this._onClickLeft2(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftStart(event) {
    const { origin } = event.data;
    const dLeft = Math.hypot(origin.x - this.coords[0], origin.y - this.coords[1]);
    const dRight = Math.hypot(origin.x - this.coords[2], origin.y - this.coords[3]);
    event.data.fixed = dLeft < dRight ? 1 : 0; // Affix the opposite point
    return super._onDragLeftStart(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftMove(event) {
    const {clones, destination, fixed, origin, originalEvent} = event.data;

    // Pan the canvas if the drag event approaches the edge
    canvas._onDragCanvasPan(originalEvent);

    // Group movement
    if ( clones.length > 1 ) {
      const dx = destination.x - origin.x;
      const dy = destination.y - origin.y;
      for ( let c of clones ) {
        c.document.c = c._original.document.c.map((p, i) => i % 2 ? p + dy : p + dx);
      }
    }

    // Single-wall pivot
    else if ( clones.length === 1 ) {
      const w = clones[0];
      const pt = [destination.x, destination.y];
      w.document.c = fixed ? pt.concat(this.coords.slice(2, 4)) : this.coords.slice(0, 2).concat(pt);
    }

    // Refresh display
    clones.forEach(c => c.refresh());
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onDragLeftDrop(event) {
    const {clones, destination, fixed, originalEvent} = event.data;
    const layer = this.layer;
    const snap = layer._forceSnap || !originalEvent.shiftKey;

    // Get the snapped final point
    const pt = this.layer._getWallEndpointCoordinates(destination, {snap});

    // Pivot a single wall
    if ( clones.length === 1 ) {
      const p0 = fixed ? this.coords.slice(2, 4) : this.coords.slice(0, 2);
      const coords = fixed ? pt.concat(p0) : p0.concat(pt);
      if ( (coords[0] === coords[2]) && (coords[1] === coords[3]) ) {
        return this.document.delete(); // If we collapsed the wall, delete it
      }
      this.layer.last.point = pt;
      return this.document.update({c: coords});
    }

    // Drag a group of walls - snap to the end point maintaining relative positioning
    const p0 = fixed ? this.coords.slice(0, 2) : this.coords.slice(2, 4);
    const dx = pt[0] - p0[0];
    const dy = pt[1] - p0[1];
    const updates = clones.map(w => {
      const c = w._original.document.c;
      return {_id: w._original.id, c: [c[0]+dx, c[1]+dy, c[2]+dx, c[3]+dy]};
    });
    return canvas.scene.updateEmbeddedDocuments("Wall", updates);
  }
}
