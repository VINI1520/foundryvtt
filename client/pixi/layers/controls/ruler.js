/**
 * @typedef {Object} RulerMeasurementSegment
 * @property {Ray} ray              The Ray which represents the point-to-point line segment
 * @property {PreciseText} label    The text object used to display a label for this segment
 * @property {number} distance      The measured distance of the segment
 * @property {string} text          The string text displayed in the label
 * @property {boolean} last         Is this segment the last one?
 */

/**
 * The Ruler - used to measure distances and trigger movements
 * @param {User}  The User for whom to construct the Ruler instance
 * @type {PIXI.Container}
 */
class Ruler extends PIXI.Container {
  constructor(user, {color=null}={}) {
    super();
    user = user || game.user;

    /**
     * Record the User which this Ruler references
     * @type {User}
     */
    this.user = user;

    /**
     * The ruler name - used to differentiate between players
     * @type {string}
     */
    this.name = `Ruler.${user.id}`;

    /**
     * The ruler color - by default the color of the active user
     * @type {Color}
     */
    this.color = Color.from(color || this.user.color || 0x42F4E2);

    /**
     * This Array tracks individual waypoints along the ruler's measured path.
     * The first waypoint is always the origin of the route.
     * @type {Array<PIXI.Point>}
     */
    this.waypoints = [];

    /**
     * The Ruler element is a Graphics instance which draws the line and points of the measured path
     * @type {PIXI.Graphics}
     */
    this.ruler = this.addChild(new PIXI.Graphics());

    /**
     * The Labels element is a Container of Text elements which label the measured path
     * @type {PIXI.Container}
     */
    this.labels = this.addChild(new PIXI.Container());

    /**
     * Track the current measurement state
     * @type {number}
     */
    this._state = Ruler.STATES.INACTIVE;
  }

  /**
   * The current destination point at the end of the measurement
   * @type {PIXI.Point}
   */
  destination = {x: undefined, y: undefined};

  /**
   * The array of most recently computed ruler measurement segments
   * @type {RulerMeasurementSegment[]}
   */
  segments;

  /**
   * The computed total distance of the Ruler.
   * @type {number}
   */
  totalDistance;

  /**
   * An enumeration of the possible Ruler measurement states.
   * @enum {number}
   */
  static STATES = {
    INACTIVE: 0,
    STARTING: 1,
    MEASURING: 2,
    MOVING: 3
  };

  /* -------------------------------------------- */

  /**
   * Is the ruler ready for measure?
   * @returns {boolean}
   */
  static get canMeasure() {
    return (game.activeTool === "ruler") || game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL);
  }

  /* -------------------------------------------- */

  /**
   * Is the Ruler being actively used to measure distance?
   * @type {boolean}
   */
  get active() {
    return this.waypoints.length > 0;
  }

  /* -------------------------------------------- */

  /**
   * Get a GridHighlight layer for this Ruler
   * @type {GridHighlight}
   */
  get highlightLayer() {
    return canvas.grid.highlightLayers[this.name] || canvas.grid.addHighlightLayer(this.name);
  }

  /* -------------------------------------------- */
  /*  Ruler Methods                               */
  /* -------------------------------------------- */

  /**
   * Clear display of the current Ruler
   */
  clear() {
    this._state = Ruler.STATES.INACTIVE;
    this.waypoints = [];
    this.segments = undefined;
    this.ruler?.clear();
    this.labels.removeChildren().forEach(c => c.destroy());
    canvas.grid.clearHighlightLayer(this.name);
  }

  /* -------------------------------------------- */

  /**
   * Measure the distance between two points and render the ruler UI to illustrate it
   * @param {PIXI.Point} destination       The destination point to which to measure
   * @param {boolean} [gridSpaces=true]    Restrict measurement only to grid spaces
   * @param {boolean} [force=false]        Do the measure whatever is the destination point?
   * @returns {RulerMeasurementSegment[]} The array of measured segments
   */
  measure(destination, {gridSpaces=true, force=false}={}) {

    // Compute the measurement destination, segments, and distance
    const d = this._getMeasurementDestination(destination);
    if ( ( d.x === this.destination.x ) && ( d.y === this.destination.y ) && !force ) return;
    this.destination = d;
    this.segments = this._getMeasurementSegments();
    this._computeDistance(gridSpaces);

    // Draw the ruler graphic
    this.ruler.clear();
    this._drawMeasuredPath();

    // Draw grid highlight
    this.highlightLayer.clear();
    for ( const segment of this.segments ) this._highlightMeasurementSegment(segment);
    return this.segments;
  }

  /* -------------------------------------------- */

  /**
   * While measurement is in progress, update the destination to be the central point of the target grid space.
   * @param {Point} destination     The current pixel coordinates of the mouse movement
   * @returns {Point}               The destination point, a center of a grid space
   * @protected
   */
  _getMeasurementDestination(destination) {
    const center = canvas.grid.getCenter(destination.x, destination.y);
    return new PIXI.Point(...center);
  }

  /* -------------------------------------------- */

  /**
   * Translate the waypoints and destination point of the Ruler into an array of Ray segments.
   * @returns {RulerMeasurementSegment[]} The segments of the measured path
   * @protected
   */
  _getMeasurementSegments() {
    const waypoints = this.waypoints.concat([this.destination]);
    return waypoints.reduce((segments, p1, i) => {
      if ( i === 0 ) return segments;
      const p0 = waypoints[i-1];
      const label = this.labels.children[i-1];
      const ray = new Ray(p0, p1);
      if ( ray.distance < 10 ) {
        if ( label ) label.visible = false;
        return segments;
      }
      segments.push({ray, label});
      return segments;
    }, []);
  }

  /* -------------------------------------------- */

  /**
   * Compute the distance of each segment and the total distance of the measured path.
   * @param {boolean} gridSpaces    Base distance on the number of grid spaces moved?
   * @protected
   */
  _computeDistance(gridSpaces) {
    const distances = canvas.grid.measureDistances(this.segments, {gridSpaces});
    let totalDistance = 0;
    for ( let [i, d] of distances.entries() ) {
      totalDistance += d;
      let s = this.segments[i];
      s.last = i === (this.segments.length - 1);
      s.distance = d;
    }
    this.totalDistance = totalDistance;
  }

  /* -------------------------------------------- */

  /**
   * Get the text label for a segment of the measured path
   * @param {RulerMeasurementSegment} segment
   * @param {number} totalDistance
   * @returns {string}
   * @protected
   */
  _getSegmentLabel(segment, totalDistance) {
    const units = canvas.scene.grid.units;
    let label = `${Math.round(segment.distance * 100) / 100} ${units}`;
    if ( segment.last ) label += ` [${Math.round(totalDistance * 100) / 100} ${units}]`;
    return label;
  }

  /* -------------------------------------------- */

  /**
   * Draw each segment of the measured path.
   * @protected
   */
  _drawMeasuredPath() {
    const r = this.ruler.beginFill(this.color, 0.25);
    for ( const segment of this.segments ) {
      const {ray, distance, label, last} = segment;
      if ( distance === 0 ) continue;

      // Draw Line
      r.moveTo(ray.A.x, ray.A.y).lineStyle(6, 0x000000, 0.5).lineTo(ray.B.x, ray.B.y)
        .lineStyle(4, this.color, 0.25).moveTo(ray.A.x, ray.A.y).lineTo(ray.B.x, ray.B.y);

      // Draw Waypoints
      r.lineStyle(2, 0x000000, 0.5).drawCircle(ray.A.x, ray.A.y, 8);
      if ( last ) r.drawCircle(ray.B.x, ray.B.y, 8);

      // Draw Label
      if ( label ) {
        const text = this._getSegmentLabel(segment, this.totalDistance);
        if ( text ) {
          label.text = text;
          label.alpha = last ? 1.0 : 0.5;
          label.visible = true;
          let labelPosition = ray.project((ray.distance + 50) / ray.distance);
          label.position.set(labelPosition.x, labelPosition.y);
        }
        else label.visible = false;
      }
    }
    r.endFill();
  }

  /* -------------------------------------------- */

  /**
   * Highlight the measurement required to complete the move in the minimum number of discrete spaces
   * @param {RulerMeasurementSegment} segment
   * @protected
   */
  _highlightMeasurementSegment(segment) {
    const {ray, distance} = segment;
    if ( distance === 0 ) return;

    const spacer = canvas.scene.grid.type === CONST.GRID_TYPES.SQUARE ? 1.41 : 1;
    const nMax = Math.max(Math.floor(ray.distance / (spacer * Math.min(canvas.grid.w, canvas.grid.h))), 1);
    const tMax = Array.fromRange(nMax+1).map(t => t / nMax);

    // Track prior position
    let prior = null;

    // Iterate over ray portions
    for ( let [i, t] of tMax.entries() ) {
      let {x, y} = ray.project(t);

      // Get grid position
      let [r0, c0] = (i === 0) ? [null, null] : prior;
      let [r1, c1] = canvas.grid.grid.getGridPositionFromPixels(x, y);
      if ( r0 === r1 && c0 === c1 ) continue;

      // Highlight the grid position
      let [x1, y1] = canvas.grid.grid.getPixelsFromGridPosition(r1, c1);
      canvas.grid.highlightPosition(this.name, {x: x1, y: y1, color: this.color});

      // Skip the first one
      prior = [r1, c1];
      if ( i === 0 ) continue;

      // If the positions are not neighbors, also highlight their halfway point
      if ( !canvas.grid.isNeighbor(r0, c0, r1, c1) ) {
        let th = tMax[i - 1] + (0.5 / nMax);
        let {x, y} = ray.project(th);
        let [rh, ch] = canvas.grid.grid.getGridPositionFromPixels(x, y);
        let [xh, yh] = canvas.grid.grid.getPixelsFromGridPosition(rh, ch);
        canvas.grid.highlightPosition(this.name, {x: xh, y: yh, color: this.color});
      }
    }
  }

  /* -------------------------------------------- */
  /*  Token Movement Execution                    */
  /* -------------------------------------------- */

  /**
   * Determine whether a SPACE keypress event entails a legal token movement along a measured ruler
   * @returns {Promise<boolean>}  An indicator for whether a token was successfully moved or not. If True the
   *                              event should be prevented from propagating further, if False it should move on
   *                              to other handlers.
   */
  async moveToken() {
    if ( game.paused && !game.user.isGM ) {
      ui.notifications.warn("GAME.PausedWarning", {localize: true});
      return false;
    }
    if ( !this.visible || !this.destination ) return false;

    // Get the Token which should move
    const token = this._getMovementToken();
    if ( !token ) return false;

    // Verify whether the movement is allowed
    let error;
    try {
      if ( !this._canMove(token) ) error = "RULER.MovementNotAllowed";
    } catch(err) {
      error = err.message;
    }
    if ( error ) {
      ui.notifications.error(error, {localize: true});
      return false;
    }

    // Animate the movement path defined by each ray segments
    await this._preMove(token);
    await this._animateMovement(token);
    await this._postMove(token);

    // Clear the Ruler
    this._endMeasurement();
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Acquire a Token, if any, which is eligible to perform a movement based on the starting point of the Ruler
   * @returns {Token}
   * @protected
   */
  _getMovementToken() {
    let [x0, y0] = Object.values(this.waypoints[0]);
    let tokens = canvas.tokens.controlled;
    if ( !tokens.length && game.user.character ) tokens = game.user.character.getActiveTokens();
    if ( !tokens.length ) return null;
    return tokens.find(t => {
      let pos = new PIXI.Rectangle(t.x - 1, t.y - 1, t.w + 2, t.h + 2);
      return pos.contains(x0, y0);
    });
  }

  /* -------------------------------------------- */

  /**
   * Test whether a Token is allowed to execute a measured movement path.
   * @param {Token} token       The Token being tested
   * @returns {boolean}         Whether the movement is allowed
   * @throws                    A specific Error message used instead of returning false
   * @protected
   */
  _canMove(token) {
    const hasCollision = this.segments.some(s => {
      return token.checkCollision(s.ray.B, {origin: s.ray.A, type: "move", mode: "any"});
    });
    if ( hasCollision ) throw new Error("RULER.MovementCollision");
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Animate piecewise Token movement along the measured segment path.
   * @param {Token} token           The Token being animated
   * @returns {Promise<void>}       A Promise which resolves once all animation is completed
   * @protected
   */
  async _animateMovement(token) {
    this._state = Ruler.STATES.MOVING;
    const wasPaused = game.paused;

    // Determine offset of the initial origin relative to the Token top-left.
    // This is important to position the token relative to the ruler origin for non-1x1 tokens.
    const origin = this.segments[0].ray.A;
    const s2 = canvas.scene.grid.type === CONST.GRID_TYPES.GRIDLESS ? 1 : (canvas.dimensions.size / 2);
    const dx = Math.round((token.document.x - origin.x) / s2) * s2;
    const dy = Math.round((token.document.y - origin.y) / s2) * s2;

    // Iterate over each measured segment
    let priorDest = undefined;
    for ( const segment of this.segments ) {
      const r = segment.ray;
      const {x, y} = token.document;

      // Break the movement if the game is paused
      if ( !wasPaused && game.paused ) break;

      // Break the movement if Token is no longer located at the prior destination (some other change override this)
      if ( priorDest && ((x !== priorDest.x) || (y !== priorDest.y)) ) break;

      // Commit the movement and update the final resolved destination coordinates
      const adjustedDestination = canvas.grid.grid._getRulerDestination(r, {x: dx, y: dy}, token);
      await this._animateSegment(token, segment, adjustedDestination);
      priorDest = adjustedDestination;
    }
  }

  /* -------------------------------------------- */

  /**
   * Update Token position and configure its animation properties for the next leg of its animation.
   * @param {Token} token                         The Token being updated
   * @param {RulerMeasurementSegment} segment     The measured segment being moved
   * @param {Point} destination                   The adjusted destination coordinate
   * @returns {Promise<unknown>}                  A Promise which resolves once the animation for this segment is done
   * @protected
   */
  async _animateSegment(token, segment, destination) {
    await token.document.update(destination);
    const anim = CanvasAnimation.getAnimation(token.animationName);
    return anim.promise;
  }

  /* -------------------------------------------- */

  /**
   * An method which can be extended by a subclass of Ruler to define custom behaviors before a confirmed movement.
   * @param {Token} token       The Token that will be moving
   * @returns {Promise<void>}
   * @protected
   */
  async _preMove(token) {}

  /* -------------------------------------------- */

  /**
   * An event which can be extended by a subclass of Ruler to define custom behaviors before a confirmed movement.
   * @param {Token} token       The Token that finished moving
   * @returns {Promise<void>}
   * @protected
   */
  async _postMove(token) {}

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers
  /* -------------------------------------------- */

  /**
   * Handle the beginning of a new Ruler measurement workflow
   * @param {PIXI.FederatedEvent} event   The drag start event
   * @see {Canvas._onDragLeftStart}
   */
  _onDragStart(event) {
    this.clear();
    this._state = Ruler.STATES.STARTING;
    this._addWaypoint(event.interactionData.origin);
  }

  /* -------------------------------------------- */

  /**
   * Handle left-click events on the Canvas during Ruler measurement.
   * @param {PIXI.FederatedEvent} event   The pointer-down event
   * @see {Canvas._onClickLeft}
   */
  _onClickLeft(event) {
    const isCtrl = game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL);
    if ( (this._state === 2) && isCtrl ) this._addWaypoint(event.interactionData.origin);
  }

  /* -------------------------------------------- */

  /**
   * Handle right-click events on the Canvas during Ruler measurement.
   * @param {PIXI.FederatedEvent} event   The pointer-down event
   * @see {Canvas._onClickRight}
   */
  _onClickRight(event) {
    if ( (this._state === 2) && (this.waypoints.length > 1) ) {
      this._removeWaypoint(event.interactionData.origin, {snap: !event.shiftKey});
      return canvas.mouseInteractionManager._dragRight = false;
    }
    else return this._endMeasurement();
  }

  /* -------------------------------------------- */

  /**
   * Continue a Ruler measurement workflow for left-mouse movements on the Canvas.
   * @param {PIXI.FederatedEvent} event   The mouse move event
   * @see {Canvas._onDragLeftMove}
   */
  _onMouseMove(event) {
    if ( this._state === Ruler.STATES.MOVING ) return;

    // Extract event data
    const mt = event.interactionData._measureTime || 0;
    const {origin, destination} = event.interactionData;
    if ( !canvas.dimensions.rect.contains(destination.x, destination.y)) return;

    // Do not begin measuring unless we have moved at least 1/4 of a grid space
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    const distance = Math.hypot(dy, dx);
    if ( !this.waypoints.length && (distance < (canvas.dimensions.size / 4))) return;

    // Hide any existing Token HUD
    canvas.hud.token.clear();
    delete event.interactionData.hudState;

    // Draw measurement updates
    if ( Date.now() - mt > 50 ) {
      this.measure(destination, {gridSpaces: !event.shiftKey});
      event.interactionData._measureTime = Date.now();
      this._state = Ruler.STATES.MEASURING;
    }
  }

  /* -------------------------------------------- */

  /**
   * Conclude a Ruler measurement workflow by releasing the left-mouse button.
   * @param {PIXI.FederatedEvent} event   The pointer-up event
   * @see {Canvas._onDragLeftDrop}
   */
  _onMouseUp(event) {
    const isCtrl = event.ctrlKey || event.metaKey;
    if ( !isCtrl ) this._endMeasurement();
  }

  /* -------------------------------------------- */

  /**
   * Handle the addition of a new waypoint in the Ruler measurement path
   * @param {PIXI.Point} point
   * @private
   */
  _addWaypoint(point) {
    const center = canvas.grid.getCenter(point.x, point.y);
    this.waypoints.push(new PIXI.Point(center[0], center[1]));
    this.labels.addChild(new PreciseText("", CONFIG.canvasTextStyle));
  }

  /* -------------------------------------------- */

  /**
   * Handle the removal of a waypoint in the Ruler measurement path
   * @param {PIXI.Point} point      The current cursor position to snap to
   * @param {boolean} [snap]        Snap exactly to grid spaces?
   * @private
   */
  _removeWaypoint(point, {snap=true}={}) {
    this.waypoints.pop();
    if ( this.labels.children.length ) this.labels.removeChildAt(this.labels.children.length - 1).destroy();
    this.measure(point, {gridSpaces: snap, force: true});
  }

  /* -------------------------------------------- */

  /**
   * Handle the conclusion of a Ruler measurement workflow
   * @private
   */
  _endMeasurement() {
    this.clear();
    game.user.broadcastActivity({ruler: null});
    canvas.mouseInteractionManager.state = MouseInteractionManager.INTERACTION_STATES.HOVER;
  }

  /* -------------------------------------------- */
  /*  Saving and Loading
  /* -------------------------------------------- */

  /**
   * @typedef {object} RulerData
   * @property {number} _state           The ruler measurement state.
   * @property {string} name             A unique name for the ruler containing the owning user's ID.
   * @property {PIXI.Point} destination  The current point the ruler has been extended to.
   * @property {string} class            The class name of this ruler instance.
   * @property {PIXI.Point[]} waypoints  Additional waypoints along the ruler's length, including the starting point.
   */

  /**
   * Package Ruler data to an object which can be serialized to a string.
   * @returns {RulerData}
   */
  toJSON() {
    return {
      class: "Ruler",
      name: `Ruler.${game.user.id}`,
      waypoints: this.waypoints,
      destination: this.destination,
      _state: this._state
    };
  }

  /* -------------------------------------------- */

  /**
   * Update a Ruler instance using data provided through the cursor activity socket
   * @param {Object} data   Ruler data with which to update the display
   */
  update(data) {
    if ( data.class !== "Ruler" ) throw new Error("Unable to recreate Ruler instance from provided data");

    // Populate data
    this.waypoints = data.waypoints;
    this._state = data._state;

    // Ensure labels are created
    for ( let i=0; i<this.waypoints.length - this.labels.children.length; i++) {
      this.labels.addChild(new PreciseText("", CONFIG.canvasTextStyle));
    }

    // Measure current distance
    if ( data.destination ) this.measure(data.destination);
  }
}
