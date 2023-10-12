/**
 * The Tokens Container.
 * @category - Canvas
 */
class TokenLayer extends PlaceablesLayer {

  /**
   * The current index position in the tab cycle
   * @type {number|null}
   * @private
   */
  _tabIndex = null;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "tokens",
      canDragCreate: false,
      controllableObjects: true,
      rotatableObjects: true,
      elevationSorting: true,
      zIndex: 100
    });
  }

  /** @inheritdoc */
  static documentName = "Token";

  /* -------------------------------------------- */

  /** @inheritdoc */
  get hookName() {
    return TokenLayer.name;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get gridPrecision() {
    return 1; // Snap tokens to top-left
  }

  /* -------------------------------------------- */
  /*  Properties
  /* -------------------------------------------- */

  /**
   * Token objects on this layer utilize the TokenHUD
   */
  get hud() {
    return canvas.hud.token;
  }

  /**
   * An Array of tokens which belong to actors which are owned
   * @type {Token[]}
   */
  get ownedTokens() {
    return this.placeables.filter(t => t.actor && t.actor.isOwner);
  }

  /* -------------------------------------------- */
  /*  Methods
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _draw(options) {
    await super._draw(options);
    canvas.app.ticker.add(this._animateTargets, this);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _tearDown(options) {
    this.concludeAnimation();
    return super._tearDown(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _activate() {
    super._activate();
    if ( canvas.controls ) canvas.controls.doors.visible = true;
    this._tabIndex = null;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _deactivate() {
    super._deactivate();
    if ( this.objects ) this.objects.visible = true;
    if ( canvas.controls ) canvas.controls.doors.visible = false;
  }

  /* -------------------------------------------- */

  /**
   * Target all Token instances which fall within a coordinate rectangle.
   *
   * @param {object} rectangle                      The selection rectangle.
   * @param {number} rectangle.x                    The top-left x-coordinate of the selection rectangle
   * @param {number} rectangle.y                    The top-left y-coordinate of the selection rectangle
   * @param {number} rectangle.width                The width of the selection rectangle
   * @param {number} rectangle.height               The height of the selection rectangle
   * @param {object} [options]                      Additional options to configure targeting behaviour.
   * @param {boolean} [options.releaseOthers=true]  Whether or not to release other targeted tokens
   * @returns {number}                              The number of Token instances which were targeted.
   */
  targetObjects({x, y, width, height}, {releaseOthers=true}={}) {
    const user = game.user;

    // Get the set of targeted tokens
    const targets = this.placeables.filter(obj => {
      if ( !obj.visible ) return false;
      let c = obj.center;
      return Number.between(c.x, x, x+width) && Number.between(c.y, y, y+height);
    });

    // Maybe release other targets
    if ( releaseOthers ) {
      for ( let t of user.targets ) {
        if ( !targets.includes(t) ) t.setTarget(false, {releaseOthers: false, groupSelection: true});
      }
    }

    // Acquire targets for tokens which are not yet targeted
    targets.forEach(t => {
      if ( !user.targets.has(t) ) t.setTarget(true, {releaseOthers: false, groupSelection: true});
    });

    // Broadcast the target change
    user.broadcastActivity({targets: user.targets.ids});

    // Return the number of targeted tokens
    return user.targets.size;
  }

  /* -------------------------------------------- */

  /**
   * Cycle the controlled token by rotating through the list of Owned Tokens that are available within the Scene
   * Tokens are currently sorted in order of their TokenID
   *
   * @param {boolean} forwards  Which direction to cycle. A truthy value cycles forward, while a false value
   *                            cycles backwards.
   * @param {boolean} reset     Restart the cycle order back at the beginning?
   * @returns {Token|null}       The Token object which was cycled to, or null
   */
  cycleTokens(forwards, reset) {
    let next = null;
    if ( reset ) this._tabIndex = null;
    const order = this._getCycleOrder();

    // If we are not tab cycling, try and jump to the currently controlled or impersonated token
    if ( this._tabIndex === null ) {
      this._tabIndex = 0;

      // Determine the ideal starting point based on controlled tokens or the primary character
      let current = this.controlled.length ? order.find(t => this.controlled.includes(t)) : null;
      if ( !current && game.user.character ) {
        const actorTokens = game.user.character.getActiveTokens();
        current = actorTokens.length ? order.find(t => actorTokens.includes(t)) : null;
      }
      current = current || order[this._tabIndex] || null;

      // Either start cycling, or cancel
      if ( !current ) return null;
      next = current;
    }

    // Otherwise, cycle forwards or backwards
    else {
      if ( forwards ) this._tabIndex = this._tabIndex < (order.length - 1) ? this._tabIndex + 1 : 0;
      else this._tabIndex = this._tabIndex > 0 ? this._tabIndex - 1 : order.length - 1;
      next = order[this._tabIndex];
      if ( !next ) return null;
    }

    // Pan to the token and control it (if possible)
    canvas.animatePan({x: next.center.x, y: next.center.y, duration: 250});
    next.control();
    return next;
  }

  /* -------------------------------------------- */

  /**
   * Add or remove the set of currently controlled Tokens from the active combat encounter
   * @param {boolean} state         The desired combat state which determines if each Token is added (true) or
   *                                removed (false)
   * @param {Combat|null} combat    A Combat encounter from which to add or remove the Token
   * @param {Token|null} [token]    A specific Token which is the origin of the group toggle request
   * @return {Promise<Combatant[]>} The Combatants added or removed
   */
  async toggleCombat(state=true, combat=null, {token=null}={}) {
    // Process each controlled token, as well as the reference token
    const tokens = this.controlled.filter(t => t.inCombat !== state);
    if ( token && !token.controlled && (token.inCombat !== state) ) tokens.push(token);

    // Reference the combat encounter displayed in the Sidebar if none was provided
    combat = combat ?? game.combats.viewed;
    if ( !combat ) {
      if ( game.user.isGM ) {
        const cls = getDocumentClass("Combat");
        combat = await cls.create({scene: canvas.scene.id, active: true}, {render: !state || !tokens.length});
      } else {
        ui.notifications.warn("COMBAT.NoneActive", {localize: true});
        return [];
      }
    }

    // Add tokens to the Combat encounter
    if ( state ) {
      const createData = tokens.map(t => {
        return {
          tokenId: t.id,
          sceneId: t.scene.id,
          actorId: t.document.actorId,
          hidden: t.document.hidden
        };
      });
      return combat.createEmbeddedDocuments("Combatant", createData);
    }

    // Remove Tokens from combat
    if ( !game.user.isGM ) return [];
    const tokenIds = new Set(tokens.map(t => t.id));
    const combatantIds = combat.combatants.reduce((ids, c) => {
      if ( tokenIds.has(c.tokenId) ) ids.push(c.id);
      return ids;
    }, []);
    return combat.deleteEmbeddedDocuments("Combatant", combatantIds);
  }

  /* -------------------------------------------- */

  /**
   * Get the tab cycle order for tokens by sorting observable tokens based on their distance from top-left.
   * @returns {Token[]}
   * @private
   */
  _getCycleOrder() {
    const observable = this.placeables.filter(token => {
      if ( game.user.isGM ) return true;
      if ( !token.actor?.testUserPermission(game.user, "OBSERVER") ) return false;
      return !token.document.hidden;
    });
    observable.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    return observable;
  }

  /* -------------------------------------------- */

  /**
   * Immediately conclude the animation of any/all tokens
   */
  concludeAnimation() {
    this.placeables.filter(t => t._animation).forEach(t => {
      t.stopAnimation();
      t.document.reset();
      t.renderFlags.set({refreshSize: true, refreshPosition: true, refreshMesh: true});
    });
    canvas.app.ticker.remove(this._animateTargets, this);
  }

  /* -------------------------------------------- */

  /**
   * Animate targeting arrows on targeted tokens.
   * @private
   */
  _animateTargets() {
    if ( !game.user.targets.size ) return;
    if ( this._t === undefined ) this._t = 0;
    else this._t += canvas.app.ticker.elapsedMS;
    const duration = 2000;
    const pause = duration * .6;
    const fade = (duration - pause) * .25;
    const minM = .5; // Minimum margin is half the size of the arrow.
    const maxM = 1; // Maximum margin is the full size of the arrow.
    // The animation starts with the arrows halfway across the token bounds, then move fully inside the bounds.
    const rm = maxM - minM;
    const t = this._t % duration;
    let dt = Math.max(0, t - pause) / (duration - pause);
    dt = CanvasAnimation.easeOutCircle(dt);
    const m = t < pause ? minM : minM + (rm * dt);
    const ta = Math.max(0, t - duration + fade);
    const a = 1 - (ta / fade);

    for ( const t of game.user.targets ) {
      t._refreshTarget({
        margin: m,
        alpha: a,
        color: CONFIG.Canvas.targeting.color,
        size: CONFIG.Canvas.targeting.size
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Provide an array of Tokens which are eligible subjects for overhead tile occlusion.
   * By default, only tokens which are currently controlled or owned by a player are included as subjects.
   * @protected
   */
  _getOccludableTokens() {
    return game.user.isGM ? canvas.tokens.controlled : canvas.tokens.ownedTokens.filter(t => !t.document.hidden);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  storeHistory(type, data) {
    super.storeHistory(type, data.map(d => {
      // Clean actorData and delta updates from the history so changes to those fields are not undone.
      d = foundry.utils.deepClone(d);
      delete d.actorData;
      delete d.delta;
      return d;
    }));
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle dropping of Actor data onto the Scene canvas
   * @private
   */
  async _onDropActorData(event, data) {

    // Ensure the user has permission to drop the actor and create a Token
    if ( !game.user.can("TOKEN_CREATE") ) {
      return ui.notifications.warn("You do not have permission to create new Tokens!");
    }

    // Acquire dropped data and import the actor
    let actor = await Actor.implementation.fromDropData(data);
    if ( !actor.isOwner ) {
      return ui.notifications.warn(`You do not have permission to create a new Token for the ${actor.name} Actor.`);
    }
    if ( actor.compendium ) {
      const actorData = game.actors.fromCompendium(actor);
      actor = await Actor.implementation.create(actorData, {fromCompendium: true});
    }

    // Prepare the Token document
    const td = await actor.getTokenDocument({x: data.x, y: data.y, hidden: game.user.isGM && event.altKey});

    // Bypass snapping
    if ( event.shiftKey ) td.updateSource({
      x: td.x - (td.width * canvas.grid.w / 2),
      y: td.y - (td.height * canvas.grid.h / 2)
    });

    // Otherwise, snap to the nearest vertex, adjusting for large tokens
    else {
      const hw = canvas.grid.w/2;
      const hh = canvas.grid.h/2;
      td.updateSource(canvas.grid.getSnappedPosition(td.x - (td.width*hw), td.y - (td.height*hh)));
    }

    // Validate the final position
    if ( !canvas.dimensions.rect.contains(td.x, td.y) ) return false;

    // Submit the Token creation request and activate the Tokens layer (if not already active)
    this.activate();
    return td.constructor.create(td, {parent: canvas.scene});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onClickLeft(event) {
    let tool = game.activeTool;

    // If Control is being held, we always want the Tool to be Ruler
    if ( game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL) ) tool = "ruler";
    switch ( tool ) {
      // Clear targets if Left Click Release is set
      case "target":
        if ( game.settings.get("core", "leftClickRelease") ) {
          game.user.updateTokenTargets([]);
          game.user.broadcastActivity({targets: []});
        }
        break;

      // Place Ruler waypoints
      case "ruler":
        return canvas.controls.ruler._onClickLeft(event);
    }

    // If we don't explicitly return from handling the tool, use the default behavior
    super._onClickLeft(event);
  }

  /* -------------------------------------------- */

  /**
   * Reset canvas and tokens mouse manager.
   */
  onClickTokenTools() {
    canvas.mouseInteractionManager?.reset({state: false});
    for ( const token of this.placeables ) {
      token.mouseInteractionManager?.reset();
    }
  }
}
