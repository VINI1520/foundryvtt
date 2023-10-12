/**
 * The client-side PlaylistSound document which extends the common BasePlaylistSound model.
 * Each PlaylistSound belongs to the sounds collection of a Playlist document.
 * @extends documents.BasePlaylistSound
 * @mixes ClientDocumentMixin
 *
 * @see {@link Playlist}              The Playlist document which contains PlaylistSound embedded documents
 * @see {@link PlaylistSoundConfig}   The PlaylistSound configuration application
 * @see {@link Sound}                 The Sound API which manages web audio playback
 */
class PlaylistSound extends ClientDocumentMixin(foundry.documents.BasePlaylistSound) {
  constructor(data, context) {
    super(data, context);

    /**
     * The Sound which manages playback for this playlist sound
     * @type {Sound|null}
     */
    this.sound = this._createSound();

    /**
     * A debounced function, accepting a single volume parameter to adjust the volume of this sound
     * @type {Function}
     * @param {number} volume     The desired volume level
     */
    this.debounceVolume = foundry.utils.debounce(volume => {
      this.update({volume}, {diff: false, render: false});
    }, PlaylistSound.VOLUME_DEBOUNCE_MS);
  }

  /**
   * The debounce tolerance for processing rapid volume changes into database updates in milliseconds
   * @type {number}
   */
  static VOLUME_DEBOUNCE_MS = 100;

  /* -------------------------------------------- */

  /**
   * Create a Sound used to play this PlaylistSound document
   * @returns {Sound|null}
   * @private
   */
  _createSound() {
    if ( !this.id || !this.path ) return null;
    const sound = game.audio.create({
      src: this.path,
      preload: false,
      singleton: false
    });
    sound.on("start", this._onStart.bind(this));
    sound.on("end", this._onEnd.bind(this));
    sound.on("stop", this._onStop.bind(this));
    return sound;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The effective volume at which this playlist sound is played, incorporating the global playlist volume setting.
   * @type {number}
   */
  get effectiveVolume() {
    return this.volume * game.settings.get("core", "globalPlaylistVolume");
  }

  /* -------------------------------------------- */

  /**
   * Determine the fade duration for this PlaylistSound based on its own configuration and that of its parent.
   * @type {number}
   */
  get fadeDuration() {
    if ( !this.sound.duration ) return 0;
    const halfDuration = Math.ceil(this.sound.duration / 2) * 1000;
    return Math.clamped(this.fade ?? this.parent.fade ?? 0, 0, halfDuration);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Synchronize playback for this particular PlaylistSound instance
   */
  sync() {
    if ( !this.sound || this.sound.failed ) return;
    const fade = this.fadeDuration;

    // Conclude current playback
    if ( !this.playing ) {
      if ( fade && !this.pausedTime && this.sound.playing ) {
        return this.sound.fade(0, {duration: fade}).then(() => this.sound.stop());
      }
      else return this.sound.stop();
    }

    // Determine playback configuration
    const playback = {
      loop: this.repeat,
      volume: this.effectiveVolume,
      fade: fade
    };
    if ( this.pausedTime && this.playing && !this.sound.playing ) playback.offset = this.pausedTime;

    // Load and autoplay, or play directly if already loaded
    if ( this.sound.loaded ) return this.sound.play(playback);
    return this.sound.load({autoplay: true, autoplayOptions: playback});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  toAnchor({classes=[], ...options}={}) {
    if ( this.playing ) classes.push("playing");
    if ( !game.user.isGM ) classes.push("disabled");
    return super.toAnchor({classes, ...options});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickDocumentLink(event) {
    if ( this.playing ) return this.parent.stopSound(this);
    return this.parent.playSound(this);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @override */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if ( this.parent ) this.parent._playbackOrder = undefined;
  }

  /* -------------------------------------------- */

  /** @override */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if ( "path" in changed ) {
      if ( this.sound ) this.sound.stop();
      this.sound = this._createSound();
    }
    if ( ("sort" in changed) && this.parent ) {
      this.parent._playbackOrder = undefined;
    }
    this.sync();
  }

  /* -------------------------------------------- */

  /** @override */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( this.parent ) this.parent._playbackOrder = undefined;
    this.playing = false;
    this.sync();
  }

  /* -------------------------------------------- */

  /**
   * Special handling that occurs when a PlaylistSound reaches the natural conclusion of its playback.
   * @private
   */
  async _onEnd() {
    if (!game.user.isGM) return;
    return this.parent._onSoundEnd(this);
  }

  /* -------------------------------------------- */

  /**
   * Special handling that occurs when playback of a PlaylistSound is started.
   * @private
   */
  async _onStart() {
    if ( !this.playing ) return this.sound.stop();

    // Apply fade timings
    const fade = this.fadeDuration;
    if ( fade ) {
      this._fadeIn(this.sound);
      if ( !this.repeat && Number.isFinite(this.sound.duration) ) {
        // noinspection ES6MissingAwait
        this.sound.schedule(this._fadeOut.bind(this), this.sound.duration - (fade / 1000));
      }
    }

    // Playlist-level orchestration actions
    return this.parent._onSoundStart(this);
  }

  /* -------------------------------------------- */

  /**
   * Special handling that occurs when a PlaylistSound is manually stopped before its natural conclusion.
   * @private
   */
  async _onStop() {}

  /* -------------------------------------------- */

  /**
   * Handle fading in the volume for this sound when it begins to play (or loop)
   * @param {Sound} sound     The sound fading-in
   * @private
   */
  _fadeIn(sound) {
    if ( !sound.node ) return;
    const fade = this.fadeDuration;
    if ( !fade || sound.pausedTime ) return;
    sound.fade(this.effectiveVolume, {duration: fade, from: 0});
  }

  /* -------------------------------------------- */

  /**
   * Handle fading out the volume for this sound when it begins to play (or loop)
   * @param {Sound} sound     The sound fading-out
   * @private
   */
  _fadeOut(sound) {
    if ( !sound.node ) return;
    const fade = this.fadeDuration;
    if ( !fade ) return;
    sound.fade(0, {duration: fade});
  }
}
