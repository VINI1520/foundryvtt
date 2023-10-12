/**
 * The client-side User document which extends the common BaseUser model.
 * Each User document contains UserData which defines its data schema.
 *
 * @extends documents.BaseUser
 * @mixes ClientDocumentMixin
 *
 * @see {@link documents.Users}             The world-level collection of User documents
 * @see {@link applications.UserConfig}     The User configuration application
 */
class User extends ClientDocumentMixin(foundry.documents.BaseUser) {

  /**
   * Track whether the user is currently active in the game
   * @type {boolean}
   */
  active = false;

  /**
   * Track references to the current set of Tokens which are targeted by the User
   * @type {Set<Token>}
   */
  targets = new UserTargets(this);

  /**
   * Track the ID of the Scene that is currently being viewed by the User
   * @type {string|null}
   */
  viewedScene = null;

  /**
   * A flag for whether the current User is a Trusted Player
   * @type {boolean}
   */
  get isTrusted() {
    return this.hasRole("TRUSTED");
  }

  /**
   * A flag for whether this User is the connected client
   * @type {boolean}
   */
  get isSelf() {
    return game.userId === this.id;
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.avatar = this.avatar || this.character?.img || CONST.DEFAULT_TOKEN;
    const rgb = Color.from(this.color).rgb;
    this.border = Color.fromRGB(rgb.map(c => Math.min(c * 2, 1)));
  }

  /* ---------------------------------------- */
  /*  User Methods                            */
  /* ---------------------------------------- */

  /**
   * Assign a Macro to a numbered hotbar slot between 1 and 50
   * @param {Macro|null} macro      The Macro document to assign
   * @param {number|string} [slot]  A specific numbered hotbar slot to fill
   * @param {number} [fromSlot]     An optional origin slot from which the Macro is being shifted
   * @returns {Promise<User>}       A Promise which resolves once the User update is complete
   */
  async assignHotbarMacro(macro, slot, {fromSlot}={}) {
    if ( !(macro instanceof Macro) && (macro !== null) ) throw new Error("Invalid Macro provided");
    const hotbar = this.hotbar;

    // If a slot was not provided, get the first available slot
    if ( Number.isNumeric(slot) ) slot = Number(slot);
    else {
      for ( let i=1; i<=50; i++ ) {
        if ( !(i in hotbar ) ) {
          slot = i;
          break;
        }
      }
    }
    if ( !slot ) throw new Error("No available Hotbar slot exists");
    if ( slot < 1 || slot > 50 ) throw new Error("Invalid Hotbar slot requested");
    if ( macro && (hotbar[slot] === macro.id) ) return this;

    // Update the hotbar data
    const update = foundry.utils.deepClone(hotbar);
    if ( macro ) update[slot] = macro.id;
    else delete update[slot];
    if ( Number.isNumeric(fromSlot) && (fromSlot in hotbar) ) delete update[fromSlot];
    return this.update({hotbar: update}, {diff: false, recursive: false, noHook: true});
  }

  /* -------------------------------------------- */

  /**
   * Assign a specific boolean permission to this user.
   * Modifies the user permissions to grant or restrict access to a feature.
   *
   * @param {string} permission    The permission name from USER_PERMISSIONS
   * @param {boolean} allowed      Whether to allow or restrict the permission
   */
  assignPermission(permission, allowed) {
    if ( !game.user.isGM ) throw new Error(`You are not allowed to modify the permissions of User ${this.id}`);
    const permissions = {[permission]: allowed};
    return this.update({permissions});
  }

  /* -------------------------------------------- */

  /**
   * @typedef {object} PingData
   * @property {boolean} [pull=false]  Pulls all connected clients' views to the pinged co-ordinates.
   * @property {string} style          The ping style, see CONFIG.Canvas.pings.
   * @property {string} scene          The ID of the scene that was pinged.
   * @property {number} zoom           The zoom level at which the ping was made.
   */

  /**
   * @typedef {object} ActivityData
   * @property {string|null} [sceneId]           The ID of the scene that the user is viewing.
   * @property {{x: number, y: number}} [cursor] The position of the user's cursor.
   * @property {RulerData|null} [ruler]          The state of the user's ruler, if they are currently using one.
   * @property {string[]} [targets]              The IDs of the tokens the user has targeted in the currently viewed
   *                                             scene.
   * @property {boolean} [active]                Whether the user has an open WS connection to the server or not.
   * @property {PingData} [ping]                 Is the user emitting a ping at the cursor coordinates?
   * @property {AVSettingsData} [av]             The state of the user's AV settings.
   */

  /**
   * Submit User activity data to the server for broadcast to other players.
   * This type of data is transient, persisting only for the duration of the session and not saved to any database.
   * Activity data uses a volatile event to prevent unnecessary buffering if the client temporarily loses connection.
   * @param {ActivityData} activityData  An object of User activity data to submit to the server for broadcast.
   * @param {object} [options]
   * @param {boolean|undefined} [options.volatile]  If undefined, volatile is inferred from the activity data.
   */
  broadcastActivity(activityData={}, {volatile}={}) {
    if ( !this.active ) {
      this.active = true;
      ui.players.render();
    }
    activityData.sceneId = canvas.ready ? canvas.scene.id : null;
    if ( this.viewedScene !== activityData.sceneId ) {
      this.viewedScene = activityData.sceneId;
      ui.nav.render();
    }
    volatile ??= !(("sceneId" in activityData)
      || (activityData.ruler === null)
      || ("targets" in activityData)
      || ("ping" in activityData)
      || ("av" in activityData)
    );
    if ( volatile ) game.socket.volatile.emit("userActivity", this.id, activityData);
    else game.socket.emit("userActivity", this.id, activityData);
  }

  /* -------------------------------------------- */

  /**
   * Get an Array of Macro Documents on this User's Hotbar by page
   * @param {number} page     The hotbar page number
   * @returns {Array<{slot: number, macro: Macro|null}>}
   */
  getHotbarMacros(page=1) {
    const macros = Array.from({length: 50}, () => "");
    for ( let [k, v] of Object.entries(this.hotbar) ) {
      macros[parseInt(k)-1] = v;
    }
    const start = (page-1) * 10;
    return macros.slice(start, start+10).map((m, i) => {
      return {
        slot: start + i + 1,
        macro: m ? game.macros.get(m) : null
      };
    });
  }

  /* -------------------------------------------- */

  /**
   * Update the set of Token targets for the user given an array of provided Token ids.
   * @param {string[]} targetIds      An array of Token ids which represents the new target set
   */
  updateTokenTargets(targetIds=[]) {

    // Clear targets outside of the viewed scene
    if ( this.viewedScene !== canvas.scene.id ) {
      for ( let t of this.targets ) {
        t.setTarget(false, {user: this, releaseOthers: false, groupSelection: true});
      }
      return;
    }

    // Update within the viewed Scene
    const targets = new Set(targetIds);
    if ( this.targets.equals(targets) ) return;

    // Remove old targets
    for ( let t of this.targets ) {
      if ( !targets.has(t.id) ) t.setTarget(false, {user: this, releaseOthers: false, groupSelection: true});
    }

    // Add new targets
    for ( let id of targets ) {
      const token = canvas.tokens.get(id);
      if ( !token || this.targets.has(token) ) continue;
      token.setTarget(true, {user: this, releaseOthers: false, groupSelection: true});
    }
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritdoc  */
  _onUpdate(data, options, userId) {
    super._onUpdate(data, options, userId);

    // If the user role changed, we need to re-build the immutable User object
    if ( this._source.role !== this.role ) {
      const user = this.clone({}, {keepId: true});
      game.users.set(user.id, user);
      return user._onUpdate(data, options, userId);
    }

    // Get the changed attributes
    let changed = Object.keys(data).filter(k => k !== "_id");

    // If your own password or role changed - you must re-authenticate
    const isSelf = data._id === game.userId;
    if ( isSelf && changed.some(p => ["password", "role"].includes(p) ) ) return game.logOut();
    if ( !game.ready ) return;

    // Redraw Navigation
    if ( changed.some(p => ["active", "color", "role"].includes(p)) ) ui.nav?.render();

    // Redraw Players UI
    if ( changed.some(p => ["active", "character", "color", "role"].includes(p)) ) ui.players?.render();

    // Redraw Hotbar
    if ( isSelf && changed.includes("hotbar") ) ui.hotbar?.render();

    // Reconnect to Audio/Video conferencing, or re-render camera views
    const webRTCReconnect = ["permissions", "role"].some(k => k in data);
    if ( webRTCReconnect && (data._id === game.userId) ) {
      game.webrtc?.client.updateLocalStream().then(() => game.webrtc.render());
    } else if ( ["name", "avatar", "character"].some(k => k in data) ) game.webrtc?.render();

    // Update Canvas
    if ( canvas.ready ) {

      // Redraw Cursor
      if ( changed.includes("color") ) {
        canvas.controls.drawCursor(this);
        const ruler = canvas.controls.getRulerForUser(this.id);
        if ( ruler ) ruler.color = Color.from(data.color);
      }
      if ( changed.includes("active") ) canvas.controls.updateCursor(this, null);

      // Modify impersonated character
      if ( isSelf && changed.includes("character") ) {
        canvas.perception.initialize();
        canvas.tokens.cycleTokens(true, true);
      }
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc  */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( this.id === game.user.id ) return game.logOut();
  }
}
