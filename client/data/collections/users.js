/**
 * The singleton collection of User documents which exist within the active World.
 * This Collection is accessible within the Game object as game.users.
 * @extends {WorldCollection}
 *
 * @see {@link User} The User document
 */
class Users extends WorldCollection {
  constructor(...args) {
    super(...args);

    /**
     * The User document of the currently connected user
     * @type {User|null}
     */
    this.current = this.current || null;
  }

  /* -------------------------------------------- */

  /**
   * Initialize the Map object and all its contained documents
   * @private
   * @override
   */
  _initialize() {
    super._initialize();

    // Flag the current user
    this.current = this.get(game.data.userId) || null;
    if ( this.current ) this.current.active = true;

    // Set initial user activity state
    for ( let activeId of game.data.activeUsers || [] ) {
      this.get(activeId).active = true;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  static documentName = "User";

  /* -------------------------------------------- */

  /**
   * Get the users with player roles
   * @returns {User[]}
   */
  get players() {
    return this.filter(u => !u.isGM && u.hasRole("PLAYER"));
  }

  /* -------------------------------------------- */

  /**
   * Get one User who is an active Gamemaster, or null if no active GM is available.
   * This can be useful for workflows which occur on all clients, but where only one user should take action.
   * @type {User|null}
   */
  get activeGM() {
    const activeGMs = game.users.filter(u => u.active && u.isGM);
    activeGMs.sort((a, b) => a.id > b.id ? 1 : -1); // Alphanumeric sort IDs without using localeCompare
    return activeGMs[0] || null;
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  static _activateSocketListeners(socket) {
    socket.on("userActivity", this._handleUserActivity);
  }

  /* -------------------------------------------- */

  /**
   * Handle receipt of activity data from another User connected to the Game session
   * @param {string} userId               The User id who generated the activity data
   * @param {ActivityData} activityData   The object of activity data
   * @private
   */
  static _handleUserActivity(userId, activityData={}) {
    const user = game.users.get(userId);
    if ( !user ) return;

    // Update User active state
    const active = "active" in activityData ? activityData.active : true;
    if ( user.active !== active ) {
      user.active = active;
      game.users.render();
      if ( (active === false) && ui.nav ) ui.nav.render();
      Hooks.callAll("userConnected", user, active);
    }

    // Everything below here requires the game to be ready
    if ( !game.ready ) return;

    // Set viewed scene
    const sceneChange = ("sceneId" in activityData) && (activityData.sceneId !== user.viewedScene);
    if ( sceneChange ) {
      user.viewedScene = activityData.sceneId;
      ui.nav.render();
    }

    if ( "av" in activityData ) {
      game.webrtc.settings.handleUserActivity(userId, activityData.av);
    }

    // Everything below requires an active canvas
    if ( !canvas.ready ) return;

    // User control deactivation
    if ( (active === false) || (user.viewedScene !== canvas.id) ) {
      canvas.controls.updateCursor(user, null);
      canvas.controls.updateRuler(user, null);
      user.updateTokenTargets([]);
      return;
    }

    // Re-broadcast our targets if the user is switching to the scene we're on.
    if ( sceneChange && (activityData.sceneId === canvas.id) ) {
      game.user.broadcastActivity({targets: game.user.targets.ids});
    }

    // Cursor position
    if ( "cursor" in activityData ) {
      canvas.controls.updateCursor(user, activityData.cursor);
    }

    // Was it a ping?
    if ( "ping" in activityData ) {
      canvas.controls.handlePing(user, activityData.cursor, activityData.ping);
    }

    // Ruler measurement
    if ( "ruler" in activityData ) {
      canvas.controls.updateRuler(user, activityData.ruler);
    }

    // Token targets
    if ( "targets" in activityData ) {
      user.updateTokenTargets(activityData.targets);
    }
  }
}
