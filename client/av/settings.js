/**
 * @typedef {object} AVSettingsData
 * @property {boolean} [muted]     Whether this user has muted themselves.
 * @property {boolean} [hidden]    Whether this user has hidden their video.
 * @property {boolean} [speaking]  Whether the user is broadcasting audio.
 */

class AVSettings {
  constructor() {
    this.initialize();
    this._set = debounce((key, value) => game.settings.set("core", key, value), 100);
    this._change = debounce(this._onSettingsChanged.bind(this), 100);
    this.activity[game.userId] = {};
  }

  /* -------------------------------------------- */

  /**
   * WebRTC Mode, Disabled, Audio only, Video only, Audio & Video
   * @enum {number}
   */
  static AV_MODES = {
    DISABLED: 0,
    AUDIO: 1,
    VIDEO: 2,
    AUDIO_VIDEO: 3
  };

  /* -------------------------------------------- */

  /**
   * Voice modes: Always-broadcasting, voice-level triggered, push-to-talk.
   * @enum {string}
   */
  static VOICE_MODES = {
    ALWAYS: "always",
    ACTIVITY: "activity",
    PTT: "ptt"
  };

  /* -------------------------------------------- */

  /**
   * Displayed nameplate options: Off entirely, animate between player and character name, player name only, character
   * name only.
   * @enum {number}
   */
  static NAMEPLATE_MODES = {
    OFF: 0,
    BOTH: 1,
    PLAYER_ONLY: 2,
    CHAR_ONLY: 3
  };

  /* -------------------------------------------- */

  /**
   * AV dock positions.
   * @enum {string}
   */
  static DOCK_POSITIONS = {
    TOP: "top",
    RIGHT: "right",
    BOTTOM: "bottom",
    LEFT: "left"
  };

  /* -------------------------------------------- */

  /**
   * Default client AV settings.
   * @type {object}
   */
  static DEFAULT_CLIENT_SETTINGS = {
    videoSrc: "default",
    audioSrc: "default",
    audioSink: "default",
    dockPosition: AVSettings.DOCK_POSITIONS.LEFT,
    hidePlayerList: false,
    hideDock: false,
    muteAll: false,
    disableVideo: false,
    borderColors: false,
    dockWidth: 240,
    nameplates: AVSettings.NAMEPLATE_MODES.BOTH,
    voice: {
      mode: AVSettings.VOICE_MODES.PTT,
      pttName: "`",
      pttDelay: 100,
      activityThreshold: -45
    },
    users: {}
  };

  /* -------------------------------------------- */

  /**
   * Default world-level AV settings.
   * @type {object}
   */
  static DEFAULT_WORLD_SETTINGS = {
    mode: AVSettings.AV_MODES.DISABLED,
    turn: {
      type: "server",
      url: "",
      username: "",
      password: ""
    }
  };

  /* -------------------------------------------- */

  /**
   * Default client settings for each connected user.
   * @type {object}
   */
  static DEFAULT_USER_SETTINGS = {
    popout: false,
    x: 100,
    y: 100,
    z: 0,
    width: 320,
    volume: 1.0,
    muted: false,
    hidden: false,
    blocked: false
  };

  /* -------------------------------------------- */

  /**
   * Stores the transient AV activity data received from other users.
   * @type {Object<string, AVSettingsData>}
   */
  activity = {};

  /* -------------------------------------------- */

  initialize() {
    this.client = game.settings.get("core", "rtcClientSettings");
    this.world = game.settings.get("core", "rtcWorldSettings");
    this._original = foundry.utils.deepClone({client: this.client, world: this.world});
    const {muted, hidden} = this._getUserSettings(game.user);
    game.user.broadcastActivity({av: {muted, hidden}});
  }

  /* -------------------------------------------- */

  changed() {
    return this._change();
  }

  /* -------------------------------------------- */

  get(scope, setting) {
    return getProperty(this[scope], setting);
  }

  /* -------------------------------------------- */

  getUser(userId) {
    const user = game.users.get(userId);
    if ( !user ) return null;
    return this._getUserSettings(user);
  }

  /* -------------------------------------------- */

  set(scope, setting, value) {
    setProperty(this[scope], setting, value);
    this._set(`rtc${scope.titleCase()}Settings`, this[scope]);
  }

  /* -------------------------------------------- */

  /**
   * Return a mapping of AV settings for each game User.
   * @type {object}
   */
  get users() {
    const users = {};
    for ( let u of game.users ) {
      users[u.id] = this._getUserSettings(u);
    }
    return users;
  }

  /* -------------------------------------------- */

  /**
   * A helper to determine if the dock is configured in a vertical position.
   */
  get verticalDock() {
    const positions = this.constructor.DOCK_POSITIONS;
    return [positions.LEFT, positions.RIGHT].includes(this.client.dockPosition ?? positions.LEFT);
  }

  /* -------------------------------------------- */

  /**
   * Prepare a standardized object of user settings data for a single User
   * @private
   */
  _getUserSettings(user) {
    const clientSettings = this.client.users[user.id] || {};
    const activity = this.activity[user.id] || {};
    const settings = foundry.utils.mergeObject(AVSettings.DEFAULT_USER_SETTINGS, clientSettings, {inplace: false});
    settings.canBroadcastAudio = user.can("BROADCAST_AUDIO");
    settings.canBroadcastVideo = user.can("BROADCAST_VIDEO");

    if ( user.isSelf ) {
      settings.muted ||= !game.webrtc?.client.isAudioEnabled();
      settings.hidden ||= !game.webrtc?.client.isVideoEnabled();
    } else {
      // Either we have muted or hidden them, or they have muted or hidden themselves.
      settings.muted ||= !!activity.muted;
      settings.hidden ||= !!activity.hidden;
    }

    settings.speaking = activity.speaking;
    return settings;
  }

  /* -------------------------------------------- */

  /**
   * Handle setting changes to either rctClientSettings or rtcWorldSettings.
   * @private
   */
  _onSettingsChanged() {
    const original = this._original;
    this.initialize();
    const changed = foundry.utils.diffObject(original, this._original);
    game.webrtc.onSettingsChanged(changed);
    Hooks.callAll("rtcSettingsChanged", this, changed);
  }

  /* -------------------------------------------- */

  /**
   * Handle another connected user changing their AV settings.
   * @param {string} userId
   * @param {AVSettingsData} settings
   */
  handleUserActivity(userId, settings) {
    const current = this.activity[userId] || {};
    this.activity[userId] = foundry.utils.mergeObject(current, settings, {inplace: false});
    if ( !ui.webrtc ) return;
    const hiddenChanged = ("hidden" in settings) && (current.hidden !== settings.hidden);
    const mutedChanged = ("muted" in settings) && (current.muted !== settings.muted);
    if ( (hiddenChanged || mutedChanged) && ui.webrtc.getUserVideoElement(userId) ) ui.webrtc._refreshView(userId);
    if ( "speaking" in settings ) ui.webrtc.setUserIsSpeaking(userId, settings.speaking);
  }
}
