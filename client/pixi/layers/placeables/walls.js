/**
 * The Walls canvas layer which provides a container for Wall objects within the rendered Scene.
 * @category - Canvas
 */
class WallsLayer extends PlaceablesLayer {

  /**
   * Synthetic Wall instances which represent the outer boundaries of the game canvas.
   * @type {Wall[]}
   */
  outerBounds = [];

  /**
   * Synthetic Wall instances which represent the inner boundaries of the scene rectangle.
   * @type {Wall[]}
   */
  innerBounds = [];

  /**
   * A graphics layer used to display chained Wall selection
   * @type {PIXI.Graphics}
   */
  chain = null;

  /**
   * Track whether we are currently within a chained placement workflow
   * @type {boolean}
   */
  _chain = false;

  /**
   * Track whether the layer is currently toggled to snap at exact grid precision
   * @type {boolean}
   */
  _forceSnap = false;

  /**
   * Track the most recently created or updated wall data for use with the clone tool
   * @type {Object|null}
   * @private
   */
  _cloneType = null;

  /**
   * Reference the last interacted wall endpoint for the purposes of chaining
   * @type {{point: PointArray}}
   * @private
   */
  last = {
    point: null
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "walls",
      controllableObjects: true,
      sortActiveTop: true,  // TODO this needs to be removed
      zIndex: 40
    });
  }

  /** @inheritdoc */
  static documentName = "Wall";

  /* -------------------------------------------- */

  /** @inheritdoc */
  get hookName() {
    return WallsLayer.name;
  }

  /* -------------------------------------------- */

  /**
   * An Array of Wall instances in the current Scene which act as Doors.
   * @type {Wall[]}
   */
  get doors() {
    return this.objects.children.filter(w => w.document.door > CONST.WALL_DOOR_TYPES.NONE);
  }

  /* -------------------------------------------- */

  /**
   * Gate the precision of wall snapping to become less precise for small scale maps.
   * @type {number}
   */
  get gridPrecision() {

    // Force snapping to grid vertices
    if ( this._forceSnap ) return canvas.grid.type <= CONST.GRID_TYPES.SQUARE ? 1 : 5;

    // Normal snapping precision
    let size = canvas.dimensions.size;
    if ( size >= 128 ) return 16;
    else if ( size >= 64 ) return 8;
    else if ( size >= 32 ) return 4;
    return 1;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _draw(options) {
    await super._draw(options);
    this.#defineBoundaries();
    this.chain = this.addChildAt(new PIXI.Graphics(), 0);
    this.last = {point: null};
    this.highlightControlledSegments();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _deactivate() {
    super._deactivate();
    this.chain?.clear();
  }

  /* -------------------------------------------- */

  /**
   * Perform initialization steps for the WallsLayer whenever the composition of walls in the Scene is changed.
   * Cache unique wall endpoints and identify interior walls using overhead roof tiles.
   */
  initialize() {
    this.identifyWallIntersections();
    this.identifyInteriorWalls();
  }

  /* -------------------------------------------- */

  /**
   * Define the canvas boundaries for outer and inner regions
   */
  #defineBoundaries() {
    const d = canvas.dimensions;
    const cls = getDocumentClass("Wall");
    const ctx = {parent: canvas.scene};
    const define = (name, r) => {
      const docs = [
        new cls({_id: `Bound${name}Top`.padEnd(16, "0"), c: [r.x, r.y, r.right, r.y]}, ctx),
        new cls({_id: `Bound${name}Right`.padEnd(16, "0"), c: [r.right, r.y, r.right, r.bottom]}, ctx),
        new cls({_id: `Bound${name}Bottom`.padEnd(16, "0"), c: [r.right, r.bottom, r.x, r.bottom]}, ctx),
        new cls({_id: `Bound${name}Left`.padEnd(16, "0"), c: [r.x, r.bottom, r.x, r.y]}, ctx)
      ];
      return docs.map(d => new Wall(d));
    };
    this.outerBounds = define("Outer", d.rect);
    this.innerBounds = d.rect.x === d.sceneRect.x ? this.outerBounds : define("Inner", d.sceneRect);
  }

  /* -------------------------------------------- */

  /**
   * Initialization to identify all intersections between walls.
   * These intersections are cached and used later when computing point source polygons.
   */
  identifyWallIntersections() {

    // Preprocess wall segments and canvas boundaries
    const segments = [];
    const process = wall => {
      const isNW = wall.A.key - wall.B.key < 0;
      const nw = isNW ? wall.A : wall.B;
      const se = isNW ? wall.B : wall.A;
      segments.push({wall, nw, se});
    };
    for ( const wall of this.outerBounds ) process(wall);

    let boundaries = this.outerBounds;
    if ( boundaries !== this.innerBounds ) boundaries = boundaries.concat(this.innerBounds);
    for ( const wall of boundaries ) process(wall);
    for ( const wall of this.placeables ) process(wall);

    // Sort segments by their north-west X value, breaking ties with the south-east X value
    segments.sort((s1, s2) => (s1.nw.x - s2.nw.x) || (s1.se.x - s2.se.x));

    // Iterate over all endpoints, identifying intersections
    const ln = segments.length;
    for ( let i=0; i<ln; i++ ) {
      const s1 = segments[i];
      for ( let j=i+1; j<ln; j++ ) {
        const s2 = segments[j];
        if ( s2.nw.x > s1.se.x ) break; // Segment s2 is entirely right of segment s1
        s1.wall._identifyIntersectionsWith(s2.wall);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Identify walls which are treated as "interior" because they are contained fully within a roof tile.
   */
  identifyInteriorWalls() {
    for ( const wall of this.placeables ) {
      wall.identifyInteriorState();
    }
  }

  /* -------------------------------------------- */

  /**
   * Given a point and the coordinates of a wall, determine which endpoint is closer to the point
   * @param {Point} point         The origin point of the new Wall placement
   * @param {Wall} wall           The existing Wall object being chained to
   * @returns {PointArray}        The [x,y] coordinates of the starting endpoint
   */
  static getClosestEndpoint(point, wall) {
    const c = wall.coords;
    const a = [c[0], c[1]];
    const b = [c[2], c[3]];

    // Exact matches
    if ( a.equals([point.x, point.y]) ) return a;
    else if ( b.equals([point.x, point.y]) ) return b;

    // Closest match
    const da = Math.hypot(point.x - a[0], point.y - a[1]);
    const db = Math.hypot(point.x - b[0], point.y - b[1]);
    return da < db ? a : b;
  }

  /* -------------------------------------------- */

  /**
   * Test whether movement along a given Ray collides with a Wall.
   * @param {Ray} ray                             The attempted movement
   * @param {object} [options={}]                 Options which customize how collision is tested.
   *                                              These options are passed to PointSourcePolygon.testCollision
   */
  checkCollision(ray, options={}) {
    return CONFIG.Canvas.losBackend.testCollision(ray.A, ray.B, options);
  }

  /* -------------------------------------------- */

  /**
   * Highlight the endpoints of Wall segments which are currently group-controlled on the Walls layer
   */
  highlightControlledSegments() {
    if ( !this.chain ) return;
    const drawn = new Set();
    const c = this.chain.clear();

    // Determine circle radius and line width
    let lw = 2;
    if ( canvas.dimensions.size > 150 ) lw = 4;
    else if ( canvas.dimensions.size > 100 ) lw = 3;
    const cr = lw * 2;
    let cr2 = cr * 2;
    let cr4 = cr * 4;

    for ( let p of this.controlled ) {
      let p1 = p.coords.slice(0, 2);
      if ( !drawn.has(p1.join(".")) ) c.lineStyle(cr, 0xFF9829).drawRoundedRect(p1[0] - cr2, p1[1] - cr2, cr4, cr4, cr);
      let p2 = p.coords.slice(2);
      if ( !drawn.has(p2.join(".")) ) c.lineStyle(cr, 0xFF9829).drawRoundedRect(p2[0] - cr2, p2[1] - cr2, cr4, cr4, cr);
      c.lineStyle(cr2, 0xFF9829).moveTo(...p1).lineTo(...p2);
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  releaseAll(options) {
    if ( this.chain ) this.chain.clear();
    return super.releaseAll(options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async pasteObjects(position, options) {
    if ( !this._copy.length ) return [];

    // Transform walls to reference their upper-left coordinates as {x,y}
    const [xs, ys] = this._copy.reduce((arr, w) => {
      arr[0].push(Math.min(w.document.c[0], w.document.c[2]));
      arr[1].push(Math.min(w.document.c[1], w.document.c[3]));
      return arr;
    }, [[], []]);

    // Get the top-left most coordinate
    const topX = Math.min(...xs);
    const topY = Math.min(...ys);

    // Get the magnitude of shift
    const dx = Math.floor(topX - position.x);
    const dy = Math.floor(topY - position.y);
    const shift = [dx, dy, dx, dy];

    // Iterate over objects
    const toCreate = [];
    for ( let w of this._copy ) {
      let data = w.document.toJSON();
      data.c = data.c.map((c, i) => c - shift[i]);
      delete data._id;
      toCreate.push(data);
    }

    // Call paste hooks
    Hooks.call("pasteWall", this._copy, toCreate);

    // Create all objects
    let created = await canvas.scene.createEmbeddedDocuments("Wall", toCreate);
    ui.notifications.info(`Pasted data for ${toCreate.length} Wall objects.`);
    return created;
  }

  /* -------------------------------------------- */

  /**
   * Pan the canvas view when the cursor position gets close to the edge of the frame
   * @param {MouseEvent} event    The originating mouse movement event
   * @param {number} x            The x-coordinate
   * @param {number} y            The y-coordinate
   * @private
   */
  _panCanvasEdge(event, x, y) {

    // Throttle panning by 20ms
    const now = Date.now();
    if ( now - (event.data.panTime || 0) <= 100 ) return;
    event.data.panTime = now;

    // Determine the amount of shifting required
    const pad = 50;
    const shift = 500 / canvas.stage.scale.x;

    // Shift horizontally
    let dx = 0;
    if ( x < pad ) dx = -shift;
    else if ( x > window.innerWidth - pad ) dx = shift;

    // Shift vertically
    let dy = 0;
    if ( y < pad ) dy = -shift;
    else if ( y > window.innerHeight - pad ) dy = shift;

    // Enact panning
    if (( dx || dy ) && !this._panning ) {
      return canvas.animatePan({x: canvas.stage.pivot.x + dx, y: canvas.stage.pivot.y + dy, duration: 100});
    }
  }

  /* -------------------------------------------- */

  /**
   * Get the endpoint coordinates for a wall placement, snapping to grid at a specified precision
   * Require snap-to-grid until a redesign of the wall chaining system can occur.
   * @param {Object} point          The initial candidate point
   * @param {boolean} [snap=true]   Whether to snap to grid
   * @return {number[]}             The endpoint coordinates [x,y]
   * @private
   */
  _getWallEndpointCoordinates(point, {snap=true}={}) {
    if ( snap ) point = canvas.grid.getSnappedPosition(point.x, point.y, this.gridPrecision);
    return [point.x, point.y].map(Math.floor);
  }

  /* -------------------------------------------- */

  /**
   * The Scene Controls tools provide several different types of prototypical Walls to choose from
   * This method helps to translate each tool into a default wall data configuration for that type
   * @param {string} tool     The active canvas tool
   * @private
   */
  _getWallDataFromActiveTool(tool) {

    // Using the clone tool
    if ( tool === "clone" && this._cloneType ) return this._cloneType;

    // Default wall data
    const wallData = {
      light: CONST.WALL_SENSE_TYPES.NORMAL,
      sight: CONST.WALL_SENSE_TYPES.NORMAL,
      sound: CONST.WALL_SENSE_TYPES.NORMAL,
      move: CONST.WALL_SENSE_TYPES.NORMAL
    };

    // Tool-based wall restriction types
    switch ( tool ) {
      case "invisible":
        wallData.sight = wallData.light = wallData.sound = CONST.WALL_SENSE_TYPES.NONE; break;
      case "terrain":
        wallData.sight = wallData.light = wallData.sound = CONST.WALL_SENSE_TYPES.LIMITED; break;
      case "ethereal":
        wallData.move = wallData.sound = CONST.WALL_SENSE_TYPES.NONE; break;
      case "doors":
        wallData.door = CONST.WALL_DOOR_TYPES.DOOR; break;
      case "secret":
        wallData.door = CONST.WALL_DOOR_TYPES.SECRET; break;
    }
    return wallData;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftStart(event) {
    const { origin, originalEvent } = event.data;
    event.data.createState = WallsLayer.CREATION_STATES.NONE;

    // Create a pending WallDocument
    const data = this._getWallDataFromActiveTool(game.activeTool);
    const snap = this._forceSnap || !originalEvent.shiftKey;
    const isChain = this._chain || game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL);
    const pt = (isChain && this.last.point) ? this.last.point : this._getWallEndpointCoordinates(origin, {snap});
    data.c = pt.concat(pt);
    const cls = getDocumentClass("Wall");
    const doc = new cls(data, {parent: canvas.scene});

    // Create the preview Wall object
    const wall = new this.constructor.placeableClass(doc);
    event.data.createState = WallsLayer.CREATION_STATES.POTENTIAL;
    event.data.preview = this.preview.addChild(wall);
    return wall.draw();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftMove(event) {
    const { destination, preview } = event.data;
    const states = WallsLayer.CREATION_STATES;
    if ( !preview || preview._destroyed || [states.NONE, states.COMPLETED].includes(event.data.createState) ) return;
    if ( preview.parent === null ) { // In theory this should never happen, but rarely does
      this.preview.addChild(preview);
    }
    preview.document.c = preview.document.c.slice(0, 2).concat([destination.x, destination.y]);
    preview.refresh();
    event.data.createState = WallsLayer.CREATION_STATES.CONFIRMED;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onDragLeftDrop(event) {
    const { createState, destination, originalEvent, preview } = event.data;

    // Prevent default to allow chaining to continue
    if ( game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL) ) {
      originalEvent.preventDefault();
      this._chain = true;
      if ( createState < WallsLayer.CREATION_STATES.CONFIRMED ) return;
    } else this._chain = false;

    // Successful wall completion
    if ( createState === WallsLayer.CREATION_STATES.CONFIRMED ) {
      event.data.createState = WallsLayer.CREATION_STATES.COMPLETED;

      // Get final endpoint location
      const snap = this._forceSnap || !originalEvent.shiftKey;
      let dest = this._getWallEndpointCoordinates(destination, {snap});
      const coords = preview.document.c.slice(0, 2).concat(dest);
      preview.document.c = coords;

      // Ignore walls which are collapsed
      if ( (coords[0] === coords[2]) && (coords[1] === coords[3]) ) return this._onDragLeftCancel(originalEvent);

      // Create the Wall
      this.last = {point: dest};
      const cls = getDocumentClass(this.constructor.documentName);
      await cls.create(preview.document.toObject(false), {parent: canvas.scene});
      this.preview.removeChild(preview);

      // Maybe chain
      if ( this._chain ) {
        event.data.origin = {x: dest[0], y: dest[1]};
        return this._onDragLeftStart(event);
      }
    }

    // Partial wall completion
    return this._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftCancel(event) {
    this._chain = false;
    this.last = {point: null};
    super._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickRight(event) {
    if ( event.data.createState > WallsLayer.CREATION_STATES.NONE ) return this._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  get boundaries() {
    const msg = "WallsLayer#boundaries is deprecated in favor of WallsLayer#outerBounds and WallsLayer#innerBounds";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return new Set(this.outerBounds);
  }
}

