/**
 * The Camera UI View that displays all the camera feeds as individual video elements.
 * @type {Application}
 *
 * @param {WebRTC} webrtc                 The WebRTC Implementation to display
 * @param {ApplicationOptions} [options]  Application configuration options.
 */
class CameraViews extends Application {
  constructor(options={}) {
    if ( !("width" in options) ) options.width = game.webrtc?.settings.client.dockWidth || 240;
    super(options);
    if ( game.webrtc?.settings.client.dockPosition === AVSettings.DOCK_POSITIONS.RIGHT ) {
      this.options.resizable.rtl = true;
    }
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "camera-views",
      template: "templates/hud/camera-views.html",
      popOut: false,
      width: 240,
      resizable: {selector: ".camera-view-width-control", resizeY: false}
    });
  }

  /* -------------------------------------------- */

  /**
   * A reference to the master AV orchestrator instance
   * @type {AVMaster}
   */
  get webrtc() {
    return game.webrtc;
  }

  /* -------------------------------------------- */

  /**
   * If all camera views are popped out, hide the dock.
   * @type {boolean}
   */
  get hidden() {
    return this.webrtc.client.getConnectedUsers().reduce((hidden, u) => {
      const settings = this.webrtc.settings.users[u];
      return hidden && (settings.blocked || settings.popout);
    }, true);
  }

  /* -------------------------------------------- */
  /* Public API                                   */
  /* -------------------------------------------- */

  /**
   * Obtain a reference to the div.camera-view which is used to portray a given Foundry User.
   * @param {string} userId     The ID of the User document
   * @return {HTMLElement|null}
   */
  getUserCameraView(userId) {
    return this.element.find(`.camera-view[data-user=${userId}]`)[0] || null;
  }

  /* -------------------------------------------- */

  /**
   * Obtain a reference to the video.user-camera which displays the video channel for a requested Foundry User.
   * If the user is not broadcasting video this will return null.
   * @param {string} userId     The ID of the User document
   * @return {HTMLVideoElement|null}
   */
  getUserVideoElement(userId) {
    return this.element.find(`.camera-view[data-user=${userId}] video.user-camera`)[0] || null;
  }

  /* -------------------------------------------- */

  /**
   * Sets whether a user is currently speaking or not
   *
   * @param {string} userId     The ID of the user
   * @param {boolean} speaking  Whether the user is speaking
   */
  setUserIsSpeaking(userId, speaking) {
    const view = this.getUserCameraView(userId);
    if ( view ) view.classList.toggle("speaking", speaking);
  }

  /* -------------------------------------------- */
  /*  Application Rendering                       */
  /* -------------------------------------------- */

  /**
   * Extend the render logic to first check whether a render is necessary based on the context
   * If a specific context was provided, make sure an update to the navigation is necessary before rendering
   */
  render(force, context={}) {
    const { renderContext, renderData } = context;
    if ( this.webrtc.mode === AVSettings.AV_MODES.DISABLED ) return this;
    if ( renderContext ) {
      if ( renderContext !== "updateUser" ) return this;
      const updateKeys = ["name", "permissions", "role", "active", "color", "sort", "character", "avatar"];
      if ( !updateKeys.some(k => renderData.hasOwnProperty(k)) ) return this;
    }
    return super.render(force, context);
  }

  /* -------------------------------------------- */

  /** @override */
  async _render(force = false, options = {}) {
    await super._render(force, options);
    this.webrtc.onRender();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  setPosition({left, top, width, scale} = {}) {
    const position = super.setPosition({left, top, width, height: "auto", scale});
    if ( foundry.utils.isEmpty(position) ) return position;
    const clientSettings = game.webrtc.settings.client;
    if ( game.webrtc.settings.verticalDock ) {
      clientSettings.dockWidth = width;
      game.webrtc.settings.set("client", "dockWidth", width);
    }
    return position;
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options={}) {
    const settings = this.webrtc.settings;
    const userSettings = settings.users;

    // Get the sorted array of connected users
    const connectedIds = this.webrtc.client.getConnectedUsers();
    const users = connectedIds.reduce((users, u) => {
      const data = this._getDataForUser(u, userSettings[u]);
      if ( data && !userSettings[u].blocked ) users.push(data);
      return users;
    }, []);
    users.sort(this.constructor._sortUsers);

    // Maximum Z of all user popout windows
    this.maxZ = Math.max(...users.map(u => userSettings[u.user.id].z));

    // Define a dynamic class for the camera dock container which affects its rendered style
    const dockClass = [`camera-position-${settings.client.dockPosition}`];
    if ( !users.some(u => !u.settings.popout) ) dockClass.push("webrtc-dock-empty");
    if ( settings.client.hideDock ) dockClass.push("webrtc-dock-minimized");
    if ( this.hidden ) dockClass.push("hidden");

    // Alter the body class depending on whether the players list is hidden
    const playersVisible = !settings.client.hidePlayerList || settings.client.hideDock;
    document.body.classList.toggle("players-hidden", playersVisible);

    const nameplateModes = AVSettings.NAMEPLATE_MODES;
    const nameplateSetting = settings.client.nameplates ?? nameplateModes.BOTH;

    const nameplates = {
      cssClass: [
        nameplateSetting === nameplateModes.OFF ? "hidden" : "",
        [nameplateModes.PLAYER_ONLY, nameplateModes.CHAR_ONLY].includes(nameplateSetting) ? "noanimate" : ""
      ].filterJoin(" "),
      playerName: [nameplateModes.BOTH, nameplateModes.PLAYER_ONLY].includes(nameplateSetting),
      charname: [nameplateModes.BOTH, nameplateModes.CHAR_ONLY].includes(nameplateSetting)
    };

    // Return data for rendering
    return {
      self: game.user,
      muteAll: settings.muteAll,
      borderColors: settings.client.borderColors,
      dockClass: dockClass.join(" "),
      hidden: this.hidden,
      users, nameplates
    };
  }

  /* -------------------------------------------- */

  /**
   * Prepare rendering data for a single user
   * @private
   */
  _getDataForUser(userId, settings) {
    const user = game.users.get(userId);
    if ( !user || !user.active ) return null;
    const charname = user.character ? user.character.name.split(" ")[0] : "";

    // CSS classes for the frame
    const frameClass = settings.popout ? "camera-box-popout" : "camera-box-dock";
    const audioClass = this.webrtc.canUserShareAudio(userId) ? null : "no-audio";
    const videoClass = this.webrtc.canUserShareVideo(userId) ? null : "no-video";

    // Return structured User data
    return {
      user, settings,
      local: user.isSelf,
      charname: user.isGM ? game.i18n.localize("GM") : charname,
      volume: AudioHelper.volumeToInput(settings.volume),
      cameraViewClass: [frameClass, videoClass, audioClass].filterJoin(" ")
    };
  }

  /* -------------------------------------------- */

  /**
   * A custom sorting function that orders/arranges the user display frames
   * @return {number}
   * @private
   */
  static _sortUsers(a, b) {
    const as = a.settings;
    const bs = b.settings;
    if (as.popout && bs.popout) return as.z - bs.z; // Sort popouts by z-index
    if (as.popout) return -1;                       // Show popout feeds first
    if (bs.popout) return 1;
    if (a.user.isSelf) return -1;                   // Show local feed first
    if (b.user.isSelf) return 1;
    if (a.hasVideo && !b.hasVideo) return -1;       // Show remote users with a camera before those without
    if (b.hasVideo && !a.hasVideo) return 1;
    return a.user.sort - b.user.sort;               // Sort according to user order
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {

    // Display controls when hovering over the video container
    let cvh = this._onCameraViewHover.bind(this);
    html.find(".camera-view").hover(cvh, cvh);

    // Handle clicks on AV control buttons
    html.find(".av-control").click(this._onClickControl.bind(this));

    // Handle volume changes
    html.find(".webrtc-volume-slider").change(this._onVolumeChange.bind(this));

    // Handle user controls.
    this._refreshView(html.find(".user-controls")[0]?.dataset.user);

    // Hide Global permission icons depending on the A/V mode
    const mode = this.webrtc.mode;
    if ( mode === AVSettings.AV_MODES.VIDEO ) html.find('[data-action="toggle-audio"]').hide();
    if ( mode === AVSettings.AV_MODES.AUDIO ) html.find('[data-action="toggle-video"]').hide();

    // Make each popout window draggable
    for ( let popout of this.element.find(".app.camera-view-popout") ) {
      let box = popout.querySelector(".camera-view");
      new CameraPopoutAppWrapper(this, box.dataset.user, $(popout));
    }

    // Listen to the video's srcObjectSet event to set the display mode of the user.
    for ( let video of this.element.find("video") ) {
      const view = video.closest(".camera-view");
      this._refreshView(view.dataset.user);
      video.addEventListener("webrtcVideoSet", ev => {
        const view = video.closest(".camera-view");
        if ( view.dataset.user !== ev.detail ) return;
        this._refreshView(view.dataset.user);
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * On hover in a camera container, show/hide the controls.
   * @event {Event} event   The original mouseover or mouseout hover event
   * @private
   */
  _onCameraViewHover(event) {
    this._toggleControlVisibility(event.currentTarget, event.type === "mouseenter", null);
  }

  /* -------------------------------------------- */

  /**
   * On clicking on a toggle, disable/enable the audio or video stream.
   * @event {MouseEvent} event   The originating click event
   * @private
   */
  async _onClickControl(event) {
    event.preventDefault();

    // Reference relevant data
    const button = event.currentTarget;
    const action = button.dataset.action;
    const userId = button.closest(".camera-view, .user-controls")?.dataset.user;
    const user = game.users.get(userId);
    const settings = this.webrtc.settings;
    const userSettings = settings.getUser(user.id);

    // Handle different actions
    switch ( action ) {

      // Globally block video
      case "block-video":
        if ( !game.user.isGM ) return;
        await user.update({"permissions.BROADCAST_VIDEO": !userSettings.canBroadcastVideo});
        return this._refreshView(userId);

      // Globally block audio
      case "block-audio":
        if ( !game.user.isGM ) return;
        await user.update({"permissions.BROADCAST_AUDIO": !userSettings.canBroadcastAudio});
        return this._refreshView(userId);

      // Hide the user
      case "hide-user":
        if ( user.isSelf ) return;
        await settings.set("client", `users.${user.id}.blocked`, !userSettings.blocked);
        return this.render();

      // Toggle video display
      case "toggle-video":
        if ( !user.isSelf ) return;
        if ( userSettings.hidden && !userSettings.canBroadcastVideo ) {
          return ui.notifications.warn("WEBRTC.WarningCannotEnableVideo", {localize: true});
        }
        await settings.set("client", `users.${user.id}.hidden`, !userSettings.hidden);
        return this._refreshView(userId);

      // Toggle audio output
      case "toggle-audio":
        if ( !user.isSelf ) return;
        if ( userSettings.muted && !userSettings.canBroadcastAudio ) {
          return ui.notifications.warn("WEBRTC.WarningCannotEnableAudio", {localize: true});
        }
        await settings.set("client", `users.${user.id}.muted`, !userSettings.muted);
        return this._refreshView(userId);

      // Toggle mute all peers
      case "mute-peers":
        if ( !user.isSelf ) return;
        await settings.set("client", "muteAll", !settings.client.muteAll);
        return this._refreshView(userId);

      // Disable sending and receiving video
      case "disable-video":
        if ( !user.isSelf ) return;
        await settings.set("client", "disableVideo", !settings.client.disableVideo);
        return this._refreshView(userId);

      // Configure settings
      case "configure":
        return this.webrtc.config.render(true);

      // Toggle popout
      case "toggle-popout":
        await settings.set("client", `users.${user.id}.popout`, !userSettings.popout);
        return this.render();

      // Hide players
      case "toggle-players":
        await settings.set("client", "hidePlayerList", !settings.client.hidePlayerList);
        return this.render();

      // Minimize the dock
      case "toggle-dock":
        await settings.set("client", "hideDock", !settings.client.hideDock);
        return this.render();
    }
  }

  /* -------------------------------------------- */

  /**
   * Change volume control for a stream
   * @param {Event} event   The originating change event from interaction with the range input
   * @private
   */
  _onVolumeChange(event) {
    const input = event.currentTarget;
    const box = input.closest(".camera-view");
    const userId = box.dataset.user;
    let volume = AudioHelper.inputToVolume(input.value);
    box.getElementsByTagName("video")[0].volume = volume;
    this.webrtc.settings.set("client", `users.${userId}.volume`, volume);
  }

  /* -------------------------------------------- */
  /*  Internal Helpers                            */
  /* -------------------------------------------- */

  /**
   * Dynamically refresh the state of a single camera view
   * @param {string} userId  The ID of the user whose view we want to refresh.
   * @protected
   */
  _refreshView(userId) {
    const view = this.element[0].querySelector(`.camera-view[data-user="${userId}"]`);
    const isSelf = game.user.id === userId;
    const clientSettings = game.webrtc.settings.client;
    const userSettings = game.webrtc.settings.getUser(userId);
    const minimized = clientSettings.hideDock;
    const isVertical = game.webrtc.settings.verticalDock;

    // Identify permissions
    const cbv = game.webrtc.canUserBroadcastVideo(userId);
    const csv = game.webrtc.canUserShareVideo(userId);
    const cba = game.webrtc.canUserBroadcastAudio(userId);
    const csa = game.webrtc.canUserShareAudio(userId);

    // Refresh video display
    const video = view.querySelector("video.user-camera");
    const avatar = view.querySelector("img.user-avatar");
    if ( video && avatar ) {
      const showVideo = csv && (isSelf || !clientSettings.disableVideo) && (!minimized || userSettings.popout);
      video.style.visibility = showVideo ? "visible" : "hidden";
      video.style.display = showVideo ? "block" : "none";
      avatar.style.display = showVideo ? "none" : "unset";
    }

    // Hidden and muted status icons
    view.querySelector(".status-hidden")?.classList.toggle("hidden", csv);
    view.querySelector(".status-muted")?.classList.toggle("hidden", csa);

    // Volume bar and video output volume
    if ( video ) {
      video.volume = userSettings.volume;
      video.muted = isSelf || clientSettings.muteAll; // Mute your own video
    }
    const volBar = this.element[0].querySelector(`[data-user="${userId}"] .volume-bar`);
    if ( volBar ) {
      const displayBar = (userId !== game.user.id) && cba;
      volBar.style.display = displayBar ? "block" : "none";
      volBar.disabled = !displayBar;
    }

    // Control toggle states
    const actions = {
      "block-video": {state: !cbv, display: game.user.isGM && !isSelf},
      "block-audio": {state: !cba, display: game.user.isGM && !isSelf},
      "hide-user": {state: !userSettings.blocked, display: !isSelf},
      "toggle-video": {state: !csv, display: isSelf && !minimized},
      "toggle-audio": {state: !csa, display: isSelf},
      "mute-peers": {state: clientSettings.muteAll, display: isSelf},
      "disable-video": {state: clientSettings.disableVideo, display: isSelf && !minimized},
      "toggle-players": {state: !clientSettings.hidePlayerList, display: isSelf && !minimized && isVertical},
      "toggle-dock": {state: !clientSettings.hideDock, display: isSelf}
    };
    const toggles = this.element[0].querySelectorAll(`[data-user="${userId}"] .av-control.toggle`);
    for ( let button of toggles ) {
      const action = button.dataset.action;
      if ( !(action in actions) ) continue;
      const state = actions[action].state;
      const displayed = actions[action].display;
      button.style.display = displayed ? "block" : "none";
      button.enabled = displayed;
      button.children[0].classList.remove(this._getToggleIcon(action, !state));
      button.children[0].classList.add(this._getToggleIcon(action, state));
      button.dataset.tooltip = this._getToggleTooltip(action, state);
    }
  }

  /* -------------------------------------------- */

  /**
   * Render changes needed to the PlayerList ui.
   * Show/Hide players depending on option.
   * @private
   */
  _setPlayerListVisibility() {
    const hidePlayerList = this.webrtc.settings.client.hidePlayerList;
    const players = document.getElementById("players");
    const top = document.getElementById("ui-top");
    if ( players ) players.classList.toggle("hidden", hidePlayerList);
    if ( top ) top.classList.toggle("offset", !hidePlayerList);
  }

  /* -------------------------------------------- */

  /**
   * Get the icon class that should be used for various action buttons with different toggled states.
   * The returned icon should represent the visual status of the NEXT state (not the CURRENT state).
   *
   * @param {string} action     The named av-control button action
   * @param {boolean} state     The CURRENT action state.
   * @returns {string}          The icon that represents the NEXT action state.
   * @protected
   */
  _getToggleIcon(action, state) {
    const clientSettings = game.webrtc.settings.client;
    const dockPositions = AVSettings.DOCK_POSITIONS;
    const dockIcons = {
      [dockPositions.TOP]: {collapse: "down", expand: "up"},
      [dockPositions.RIGHT]: {collapse: "left", expand: "right"},
      [dockPositions.BOTTOM]: {collapse: "up", expand: "down"},
      [dockPositions.LEFT]: {collapse: "right", expand: "left"}
    }[clientSettings.dockPosition];
    const actionMapping = {
      "block-video": ["fa-video", "fa-video-slash"],            // True means "blocked"
      "block-audio": ["fa-microphone", "fa-microphone-slash"],  // True means "blocked"
      "hide-user": ["fa-eye", "fa-eye-slash"],
      "toggle-video": ["fa-camera-web", "fa-camera-web-slash"], // True means "enabled"
      "toggle-audio": ["fa-microphone", "fa-microphone-slash"], // True means "enabled"
      "mute-peers": ["fa-volume-up", "fa-volume-mute"],         // True means "muted"
      "disable-video": ["fa-video", "fa-video-slash"],
      "toggle-players": ["fa-caret-square-right", "fa-caret-square-left"], // True means "displayed"
      "toggle-dock": [`fa-caret-square-${dockIcons.collapse}`, `fa-caret-square-${dockIcons.expand}`]
    };
    const icons = actionMapping[action];
    return icons ? icons[state ? 1: 0] : null;
  }

  /* -------------------------------------------- */

  /**
   * Get the text title that should be used for various action buttons with different toggled states.
   * The returned title should represent the tooltip of the NEXT state (not the CURRENT state).
   *
   * @param {string} action     The named av-control button action
   * @param {boolean} state     The CURRENT action state.
   * @returns {string}          The icon that represents the NEXT action state.
   * @protected
   */
  _getToggleTooltip(action, state) {
    const actionMapping = {
      "block-video": ["BlockUserVideo", "AllowUserVideo"],      // True means "blocked"
      "block-audio": ["BlockUserAudio", "AllowUserAudio"],      // True means "blocked"
      "hide-user": ["ShowUser", "HideUser"],
      "toggle-video": ["DisableMyVideo", "EnableMyVideo"],      // True means "enabled"
      "toggle-audio": ["DisableMyAudio", "EnableMyAudio"],      // True means "enabled"
      "mute-peers": ["MutePeers", "UnmutePeers"],               // True means "muted"
      "disable-video": ["DisableAllVideo", "EnableVideo"],
      "toggle-players": ["ShowPlayers", "HidePlayers"],         // True means "displayed"
      "toggle-dock": ["ExpandDock", "MinimizeDock"]
    };
    const labels = actionMapping[action];
    return game.i18n.localize(`WEBRTC.Tooltip${labels ? labels[state ? 1 : 0] : ""}`);
  }

  /* -------------------------------------------- */

  /**
   * Show or hide UI control elements
   * This replaces the use of jquery.show/hide as it simply adds a class which has display:none
   * which allows us to have elements with display:flex which can be hidden then shown without
   * breaking their display style.
   * This will show/hide the toggle buttons, volume controls and overlay sidebars
   * @param {jQuery} container    The container for which to show/hide control elements
   * @param {boolean} show        Whether to show or hide the controls
   * @param {string} selector     Override selector to specify which controls to show or hide
   * @private
   */
  _toggleControlVisibility(container, show, selector) {
    selector = selector || `.control-bar`;
    container.querySelectorAll(selector).forEach(c => c.classList.toggle("hidden", !show));
  }
}
