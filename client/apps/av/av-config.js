/**
 * Audio/Video Conferencing Configuration Sheet
 * @extends {FormApplication}
 *
 * @param {AVMaster} object                   The {@link AVMaster} instance being configured.
 * @param {FormApplicationOptions} [options]  Application configuration options.
 */
class AVConfig extends FormApplication {
  constructor(object, options) {
    super(object || game.webrtc, options);
  }

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      title: game.i18n.localize("WEBRTC.Title"),
      id: "av-config",
      template: "templates/sidebar/apps/av-config.html",
      popOut: true,
      width: 480,
      height: "auto",
      tabs: [{navSelector: ".tabs", contentSelector: "form", initial: "general"}]
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    const settings = this.object.settings;
    const videoSources = await this.object.client.getVideoSources();
    const audioSources = await this.object.client.getAudioSources();
    const audioSinks = await this.object.client.getAudioSinks();

    // If the currently chosen device is unavailable, display a separate option for 'unavailable device (use default)'
    const { videoSrc, audioSrc, audioSink } = settings.client;
    const videoSrcUnavailable = this._isSourceUnavailable(videoSources, videoSrc);
    const audioSrcUnavailable = this._isSourceUnavailable(audioSources, audioSrc);
    const audioSinkUnavailable = this._isSourceUnavailable(audioSinks, audioSink);
    const isSSL = window.location.protocol === "https:";

    // Audio/Video modes
    const modes = {
      [AVSettings.AV_MODES.DISABLED]: "WEBRTC.ModeDisabled",
      [AVSettings.AV_MODES.AUDIO]: "WEBRTC.ModeAudioOnly",
      [AVSettings.AV_MODES.VIDEO]: "WEBRTC.ModeVideoOnly",
      [AVSettings.AV_MODES.AUDIO_VIDEO]: "WEBRTC.ModeAudioVideo"
    };

    // Voice Broadcast modes
    const voiceModes = Object.values(AVSettings.VOICE_MODES).reduce((obj, m) => {
      obj[m] = game.i18n.localize(`WEBRTC.VoiceMode${m.titleCase()}`);
      return obj;
    }, {});

    // Nameplate settings.
    const nameplates = {
      [AVSettings.NAMEPLATE_MODES.OFF]: "WEBRTC.NameplatesOff",
      [AVSettings.NAMEPLATE_MODES.PLAYER_ONLY]: "WEBRTC.NameplatesPlayer",
      [AVSettings.NAMEPLATE_MODES.CHAR_ONLY]: "WEBRTC.NameplatesCharacter",
      [AVSettings.NAMEPLATE_MODES.BOTH]: "WEBRTC.NameplatesBoth"
    };

    const dockPositions = Object.fromEntries(Object.values(AVSettings.DOCK_POSITIONS).map(p => {
      return [p, game.i18n.localize(`WEBRTC.DockPosition${p.titleCase()}`)];
    }));

    // Return data to the template
    return {
      user: game.user,
      modes,
      voiceModes,
      serverTypes: {FVTT: "WEBRTC.FVTTSignalingServer", custom: "WEBRTC.CustomSignalingServer"},
      turnTypes: {server: "WEBRTC.TURNServerProvisioned", custom: "WEBRTC.CustomTURNServer"},
      settings,
      canSelectMode: game.user.isGM && isSSL,
      noSSL: !isSSL,
      videoSources,
      audioSources,
      audioSinks: foundry.utils.isEmpty(audioSinks) ? false : audioSinks,
      videoSrcUnavailable,
      audioSrcUnavailable,
      audioSinkUnavailable,
      audioDisabled: audioSrc === "disabled",
      videoDisabled: videoSrc === "disabled",
      nameplates,
      nameplateSetting: settings.client.nameplates ?? AVSettings.NAMEPLATE_MODES.BOTH,
      dockPositions
    };
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Options below are GM only
    if ( !game.user.isGM ) return;
    html.find('select[name="world.turn.type"]').change(this._onTurnTypeChanged.bind(this));

    // Activate or de-activate the custom server and turn configuration sections based on current settings
    const settings = this.object.settings;
    this._setConfigSectionEnabled(".webrtc-custom-turn-config", settings.world.turn.type === "custom");
  }

  /* -------------------------------------------- */

  /**
   * Set a section's input to enabled or disabled
   * @param {string} selector    Selector for the section to enable or disable
   * @param {boolean} enabled    Whether to enable or disable this section
   * @private
   */
  _setConfigSectionEnabled(selector, enabled = true) {
    let section = this.element.find(selector);
    if (section) {
      section.css("opacity", enabled ? 1.0 : 0.5);
      section.find("input").prop("disabled", !enabled);
    }
  }

  /* -------------------------------------------- */

  /**
   * Determine whether a given video or audio source, or audio sink has become
   * unavailable since the last time it was set.
   * @param {object} sources The available devices
   * @param {string} source  The selected device
   * @private
   */
  _isSourceUnavailable(sources, source) {
    const specialValues = ["default", "disabled"];
    return source && (!specialValues.includes(source)) && !Object.keys(sources).includes(source);
  }

  /* -------------------------------------------- */

  /**
   * Callback when the turn server type changes
   * Will enable or disable the turn section based on whether the user selected a custom turn or not
   * @param {Event} event   The event that triggered the turn server type change
   * @private
   */
  _onTurnTypeChanged(event) {
    event.preventDefault();
    const choice = event.currentTarget.value;
    this._setConfigSectionEnabled(".webrtc-custom-turn-config", choice === "custom")
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    const settings = game.webrtc.settings;
    settings.client.videoSrc = settings.client.videoSrc || null;
    settings.client.audioSrc = settings.client.audioSrc || null;

    const update = expandObject(formData);

    // Update world settings
    if ( game.user.isGM ) {
      if ( settings.world.mode !== update.world.mode ) SettingsConfig.reloadConfirm({world: true});
      const world = mergeObject(settings.world, update.world);
      await game.settings.set("core", "rtcWorldSettings", world);
    }

    // Update client settings
    const client = mergeObject(settings.client, update.client);
    await game.settings.set("core", "rtcClientSettings", client);
  }
}
