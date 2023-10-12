/**
 * The master Audio/Video controller instance.
 * This is available as the singleton game.webrtc
 *
 * @param {AVSettings} settings     The Audio/Video settings to use
 */
class AVMaster {
  constructor() {
    this.settings = new AVSettings();
    this.config = new AVConfig(this);

    /**
     * The Audio/Video client class
     * @type {AVClient}
     */
    this.client = new CONFIG.WebRTC.clientClass(this, this.settings);

    /**
     * A flag to track whether the current user is actively broadcasting their microphone.
     * @type {boolean}
     */
    this.broadcasting = false;

    /**
     * Flag to determine if we are connected to the signalling server or not.
     * This is required for synchronization between connection and reconnection attempts.
     * @type {boolean}
     */
    this._connected = false;

    /**
     * The cached connection promise.
     * This is required to prevent re-triggering a connection while one is already in progress.
     * @type {Promise<boolean>|null}
     * @private
     */
    this._connecting = null;

    /**
     * A flag to track whether the A/V system is currently in the process of reconnecting.
     * This occurs if the connection is lost or interrupted.
     * @type {boolean}
     * @private
     */
    this._reconnecting = false;

    // Other internal flags
    this._speakingData = {speaking: false, volumeHistories: []};
    this._pttMuteTimeout = 0;
  }

  /* -------------------------------------------- */

  get mode() {
    return this.settings.world.mode;
  }

  /* -------------------------------------------- */
  /*  Initialization                              */
  /* -------------------------------------------- */

  /**
   * Connect to the Audio/Video client.
   * @return {Promise<boolean>}     Was the connection attempt successful?
   */
  async connect() {
    if ( this._connecting ) return this._connecting;
    const connect = async () => {
      // Disconnect from any existing session
      await this.disconnect();

      // Activate the connection
      if ( this.mode === AVSettings.AV_MODES.DISABLED ) return false;

      // Initialize Client state
      await this.client.initialize();

      // Connect to the client
      const connected = await this.client.connect();
      if ( !connected ) return false;
      console.log(`${vtt} | Connected to the ${this.client.constructor.name} Audio/Video client.`);

      // Initialize local broadcasting
      this._initialize();
      return this._connected = connected;
    };

    return this._connecting = connect().finally(() => this._connecting = null);
  }

  /* -------------------------------------------- */

  /**
   * Disconnect from the Audio/Video client.
   * @return {Promise<boolean>}     Whether an existing connection was terminated?
   */
  async disconnect() {
    if ( !this._connected ) return false;
    this._connected = this._reconnecting = false;
    await this.client.disconnect();
    console.log(`${vtt} | Disconnected from the ${this.client.constructor.name} Audio/Video client.`);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Callback actions to take when the user becomes disconnected from the server.
   * @return {Promise<void>}
   */
  async reestablish() {
    if ( !this._connected ) return;
    ui.notifications.warn("WEBRTC.ConnectionLostWarning", {localize: true});
    await this.disconnect();

    // Attempt to reconnect
    while ( this._reconnecting ) {
      await this.connect();
      if ( this._connected ) {
        this._reconnecting = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, this._reconnectPeriodMS));
    }
  }

  /* -------------------------------------------- */

  /**
   * Initialize the local broadcast state.
   * @private
   */
  _initialize() {
    const client = this.settings.client;
    const voiceMode = client.voice.mode;

    // Initialize voice detection
    this._initializeUserVoiceDetection(voiceMode);

    // Reset the speaking history for the user
    this._resetSpeakingHistory(game.user.id);

    // Set the initial state of outbound audio and video streams
    const isAlways = voiceMode === "always";
    this.client.toggleAudio(isAlways && client.audioSrc && this.canUserShareAudio(game.user.id));
    this.client.toggleVideo(client.videoSrc && this.canUserShareVideo(game.user.id));
    this.broadcast(isAlways);

    // Update the display of connected A/V
    ui.webrtc.render();
  }

  /* -------------------------------------------- */
  /*  Permissions                                 */
  /* -------------------------------------------- */

  /**
   * A user can broadcast audio if the AV mode is compatible and if they are allowed to broadcast.
   * @param {string} userId
   * @return {boolean}
   */
  canUserBroadcastAudio(userId) {
    if ( [AVSettings.AV_MODES.DISABLED, AVSettings.AV_MODES.VIDEO].includes(this.mode) ) return false;
    const user = this.settings.getUser(userId);
    return user && user.canBroadcastAudio;
  }

  /* -------------------------------------------- */

  /**
   * A user can share audio if they are allowed to broadcast and if they have not muted themselves or been blocked.
   * @param {string} userId
   * @return {boolean}
   */
  canUserShareAudio(userId) {
    if ( [AVSettings.AV_MODES.DISABLED, AVSettings.AV_MODES.VIDEO].includes(this.mode) ) return false;
    const user = this.settings.getUser(userId);
    return user && user.canBroadcastAudio && !(user.muted || user.blocked);
  }

  /* -------------------------------------------- */

  /**
   * A user can broadcast video if the AV mode is compatible and if they are allowed to broadcast.
   * @param {string} userId
   * @return {boolean}
   */
  canUserBroadcastVideo(userId) {
    if ( [AVSettings.AV_MODES.DISABLED, AVSettings.AV_MODES.AUDIO].includes(this.mode) ) return false;
    const user = this.settings.getUser(userId);
    return user && user.canBroadcastVideo;
  }

  /* -------------------------------------------- */

  /**
   * A user can share video if they are allowed to broadcast and if they have not hidden themselves or been blocked.
   * @param {string} userId
   * @return {boolean}
   */
  canUserShareVideo(userId) {
    if ( [AVSettings.AV_MODES.DISABLED, AVSettings.AV_MODES.AUDIO].includes(this.mode) ) return false;
    const user = this.settings.getUser(userId);
    return user && user.canBroadcastVideo && !(user.hidden || user.blocked);
  }

  /* -------------------------------------------- */
  /*  Broadcasting                                */
  /* -------------------------------------------- */

  /**
   * Trigger a change in the audio broadcasting state when using a push-to-talk workflow.
   * @param {boolean} intent        The user's intent to broadcast. Whether an actual broadcast occurs will depend
   *                                on whether or not the user has muted their audio feed.
   */
  broadcast(intent) {
    this.broadcasting = intent && this.canUserShareAudio(game.user.id);
    this.client.toggleBroadcast(this.broadcasting);
    const activity = this.settings.activity[game.user.id];
    if ( activity.speaking !== this.broadcasting ) game.user.broadcastActivity({av: {speaking: this.broadcasting}});
    activity.speaking = this.broadcasting;
    return ui.webrtc.setUserIsSpeaking(game.user.id, this.broadcasting);
  }

  /* -------------------------------------------- */

  /**
   * Set up audio level listeners to handle voice activation detection workflow.
   * @param {string} mode           The currently selected voice broadcasting mode
   * @private
   */
  _initializeUserVoiceDetection(mode) {

    // Deactivate prior detection
    game.audio.stopLevelReports(game.user.id);
    if ( !["always", "activity"].includes(mode) ) return;

    // Activate voice level detection for always-on and activity-based broadcasting
    const stream = this.client.getLevelsStreamForUser(game.user.id);
    const ms = mode === "activity" ? CONFIG.WebRTC.detectSelfVolumeInterval : CONFIG.WebRTC.detectPeerVolumeInterval;
    this.activateVoiceDetection(stream, ms);
  }

  /* -------------------------------------------- */

  /**
   * Activate voice detection tracking for a userId on a provided MediaStream.
   * Currently only a MediaStream is supported because MediaStreamTrack processing is not yet supported cross-browser.
   * @param {MediaStream} stream    The MediaStream which corresponds to that User
   * @param {number} [ms]           A number of milliseconds which represents the voice activation volume interval
   */
  activateVoiceDetection(stream, ms) {
    this.deactivateVoiceDetection();
    if ( !stream || !stream.getAudioTracks().some(t => t.enabled) ) return;
    ms = ms || CONFIG.WebRTC.detectPeerVolumeInterval;
    const handler = this._onAudioLevel.bind(this);
    game.audio.startLevelReports(game.userId, stream, handler, ms);
  }

  /* -------------------------------------------- */

  /**
   * Actions which the orchestration layer should take when a peer user disconnects from the audio/video service.
   */
  deactivateVoiceDetection() {
    this._resetSpeakingHistory();
    game.audio.stopLevelReports(game.userId);
  }

  /* -------------------------------------------- */

  /**
   * Periodic notification of user audio level
   *
   * This function uses the audio level (in dB) of the audio stream to determine if the user is speaking or not and
   * notifies the UI of such changes.
   *
   * The User is considered speaking if they are above the decibel threshold in any of the history values.
   * This marks them as speaking as soon as they have a high enough volume, and marks them as not speaking only after
   * they drop below the threshold in all histories (last 4 volumes = for 200 ms).
   *
   * There can be more optimal ways to do this and which uses whether the user was already considered speaking before
   * or not, in order to eliminate short bursts of audio (coughing for example).
   *
   * @param {number} dbLevel         The audio level in decibels of the user within the last 50ms
   * @private
   */
  _onAudioLevel(dbLevel) {
    const voice = this.settings.client.voice;
    const speakingData = this._speakingData;
    const wasSpeaking = speakingData.speaking;

    // Add the current volume to the history of the user and keep the list below the history length config.
    if (speakingData.volumeHistories.push(dbLevel) > CONFIG.WebRTC.speakingHistoryLength) {
      speakingData.volumeHistories.shift();
    }

    // Count the number and total decibels of speaking events which exceed an activity threshold
    const [count, max, total] = speakingData.volumeHistories.reduce((totals, vol) => {
      if ( vol >= voice.activityThreshold )  {
        totals[0] += 1;
        totals[1] = Math.min(totals[1], vol);
        totals[2] += vol;
      }
      return totals;
    }, [0, 0, 0]);

    // The user is classified as currently speaking if they exceed a certain threshold of speaking events
    const isSpeaking = (count > (wasSpeaking ? 0 : CONFIG.WebRTC.speakingThresholdEvents)) && !this.client.isMuted;
    speakingData.speaking = isSpeaking;

    // Take further action when a change in the speaking state has occurred
    if ( isSpeaking === wasSpeaking ) return;
    if ( this.client.isVoiceActivated ) return this.broadcast(isSpeaking); // Declare broadcast intent
  }

  /* -------------------------------------------- */
  /*  Push-To-Talk Controls                       */
  /* -------------------------------------------- */

  /**
   * Resets the speaking history of a user
   * If the user was considered speaking, then mark them as not speaking
   */
  _resetSpeakingHistory() {
    if ( ui.webrtc ) ui.webrtc.setUserIsSpeaking(game.userId, false);
    this._speakingData.speaking = false;
    this._speakingData.volumeHistories = [];
  }

  /* -------------------------------------------- */

  /**
   * Handle activation of a push-to-talk key or button.
   * @param {KeyboardEventContext} context    The context data of the event
   */
  _onPTTStart(context) {
    if ( !this._connected ) return false;
    const voice = this.settings.client.voice;

    // Case 1: Push-to-Talk (begin broadcasting immediately)
    if ( voice.mode === "ptt" ) {
      if (this._pttMuteTimeout > 0) clearTimeout(this._pttMuteTimeout);
      this._pttMuteTimeout = 0;
      this.broadcast(true);
    }

    // Case 2: Push-to-Mute (disable broadcasting on a timeout)
    else this._pttMuteTimeout = setTimeout(() => this.broadcast(false), voice.pttDelay);

    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle deactivation of a push-to-talk key or button.
   * @param {KeyboardEventContext} context    The context data of the event
   */
  _onPTTEnd(context) {
    if ( !this._connected ) return false;
    const voice = this.settings.client.voice;

    // Case 1: Push-to-Talk (disable broadcasting on a timeout)
    if ( voice.mode === "ptt" ) {
      this._pttMuteTimeout = setTimeout(() => this.broadcast(false), voice.pttDelay);
    }

    // Case 2: Push-to-Mute (re-enable broadcasting immediately)
    else {
      if (this._pttMuteTimeout > 0) clearTimeout(this._pttMuteTimeout);
      this._pttMuteTimeout = 0;
      this.broadcast(true);
    }
    return true;
  }

  /* -------------------------------------------- */
  /*  User Interface Controls                     */
  /* -------------------------------------------- */

  render() {
    return ui.webrtc.render();
  }

  /* -------------------------------------------- */

  /**
   * Render the audio/video streams to the CameraViews UI.
   * Assign each connected user to the correct video frame element.
   */
  onRender() {
    const users = this.client.getConnectedUsers();
    for ( let u of users ) {
      const videoElement = ui.webrtc.getUserVideoElement(u);
      if ( !videoElement ) continue;
      const isSpeaking = this.settings.activity[u]?.speaking || false;
      this.client.setUserVideo(u, videoElement);
      ui.webrtc.setUserIsSpeaking(u, isSpeaking);
    }

    // Determine the players list position based on the user's settings.
    const dockPositions = AVSettings.DOCK_POSITIONS;
    const isAfter = [dockPositions.RIGHT, dockPositions.BOTTOM].includes(this.settings.client.dockPosition);
    const iface = document.getElementById("interface");
    const cameraViews = ui.webrtc.element[0];
    ui.players.render(true);

    if ( this.settings.client.hideDock || ui.webrtc.hidden ) {
      cameraViews?.style.removeProperty("width");
      cameraViews?.style.removeProperty("height");
    }

    document.body.classList.toggle("av-horizontal-dock", !this.settings.verticalDock);

    // Change the dock position based on the user's settings.
    if ( cameraViews ) {
      if ( isAfter && (iface.nextElementSibling !== cameraViews) ) document.body.insertBefore(iface, cameraViews);
      else if ( !isAfter && (cameraViews.nextElementSibling !== iface) ) document.body.insertBefore(cameraViews, iface);
    }
  }

  /* -------------------------------------------- */
  /*  Events Handlers and Callbacks               */
  /* -------------------------------------------- */

  /**
   * Respond to changes which occur to AV Settings.
   * Changes are handled in descending order of impact.
   * @param {object} changed       The object of changed AV settings
   */
  onSettingsChanged(changed) {
    const keys = Object.keys(flattenObject(changed));

    // Change the server configuration (full AV re-connection)
    if ( keys.includes("world.turn") ) return this.connect();

    // Change audio and video visibility at a user level
    const sharing = getProperty(changed, `client.users.${game.userId}`) || {};
    if ( "hidden" in sharing ) this.client.toggleVideo(this.canUserShareVideo(game.userId));
    if ( "muted" in sharing ) this.client.toggleAudio(this.canUserShareAudio(game.userId));

    // Restore stored dock width when switching to a vertical dock position.
    const isVertical =
      [AVSettings.DOCK_POSITIONS.LEFT, AVSettings.DOCK_POSITIONS.RIGHT].includes(changed.client?.dockPosition);
    const dockWidth = changed.client?.dockWidth ?? this.settings.client.dockWidth ?? 240;
    if ( isVertical ) ui.webrtc.position.width = dockWidth;

    // Switch resize direction if docked to the right.
    if ( keys.includes("client.dockPosition") ) {
      ui.webrtc.options.resizable.rtl = changed.client.dockPosition === AVSettings.DOCK_POSITIONS.RIGHT;
    }

    // Requires re-render.
    const rerender = ["client.borderColors", "client.dockPosition", "client.nameplates"].some(k => keys.includes(k));
    if ( rerender ) ui.webrtc.render(true);

    // Call client specific setting handling
    this.client.onSettingsChanged(changed);
  }

  /* -------------------------------------------- */

  debug(message) {
    if ( this.settings.debug ) console.debug(message);
  }
}
