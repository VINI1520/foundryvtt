/**
 * A helper class to provide common functionality for working with the Web Audio API.
 * https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
 * A singleton instance of this class is available as game#audio.
 * @see Game#audio
 */
class AudioHelper {
  constructor() {
    if ( game.audio instanceof this.constructor ) {
      throw new Error("You may not re-initialize the singleton AudioHelper. Use game.audio instead.");
    }

    /**
     * The primary Audio Context used to play client-facing sounds.
     * The context is undefined until the user's first gesture is observed.
     * @type {AudioContext}
     */
    this.context = undefined;

    /**
     * The set of AudioBuffer objects which are cached for different audio paths
     * @type {Map<string,{buffer: AudioBuffer, lastAccessed: number, playing: boolean, size: number}>}
     */
    this.buffers = new Map();

    /**
     * The set of singleton Sound instances which are cached for different audio paths
     * @type {Map<string,Sound>}
     */
    this.sounds = new Map();

    /**
     * Get a map of the Sound objects which are currently playing.
     * @type {Map<number,Sound>}
     */
    this.playing = new Map();

    /**
     * A user gesture must be registered before audio can be played.
     * This Array contains the Sound instances which are requested for playback prior to a gesture.
     * Once a gesture is observed, we begin playing all elements of this Array.
     * @type {Function[]}
     * @see Sound
     */
    this.pending = [];

    /**
     * A flag for whether video playback is currently locked by awaiting a user gesture
     * @type {boolean}
     */
    this.locked = true;

    /**
     * Audio Context singleton used for analysing audio levels of each stream
     * Only created if necessary to listen to audio streams.
     *
     * @type {AudioContext}
     * @private
     */
    this._audioContext = null;

    /**
     * Map of all streams that we listen to for determining the decibel levels.
     * Used for analyzing audio levels of each stream.
     * Format of the object stored is :
     * {id:
     *   {
     *     stream: MediaStream,
     *     analyser: AudioAnalyser,
     *     interval: Number,
     *     callback: Function
     *   }
     * }
     *
     * @type {Object}
     * @private
     */
    this._analyserStreams = {};

    /**
     * Interval ID as returned by setInterval for analysing the volume of streams
     * When set to 0, means no timer is set.
     * @type {number}
     * @private
     */
    this._analyserInterval = 0;

    /**
     * Fast Fourier Transform Array.
     * Used for analysing the decibel level of streams. The array is allocated only once
     * then filled by the analyser repeatedly. We only generate it when we need to listen to
     * a stream's level, so we initialize it to null.
     * @type {Float32Array}
     * @private
     */
    this._fftArray = null;

    /**
     * A Promise which resolves once the game audio API is unlocked and ready to use.
     * @type {Promise<AudioContext>}
     */
    this.unlock = this.awaitFirstGesture();
  }

  /**
   * The Native interval for the AudioHelper to analyse audio levels from streams
   * Any interval passed to startLevelReports() would need to be a multiple of this value.
   * @type {number}
   */
  static levelAnalyserNativeInterval = 50;

  /**
   * The cache size threshold after which audio buffers will be expired from the cache to make more room.
   * 1 gigabyte, by default.
   */
  static THRESHOLD_CACHE_SIZE_BYTES = Math.pow(1024, 3);

  /**
   * An internal tracker for the total size of the buffers cache.
   * @type {number}
   * @private
   */
  #cacheSize = 0;

  /* -------------------------------------------- */

  /**
   * Register client-level settings for global volume overrides
   */
  static registerSettings() {

    // Playlist Volume
    game.settings.register("core", "globalPlaylistVolume", {
      name: "Global Playlist Volume",
      hint: "Define a global playlist volume modifier",
      scope: "client",
      config: false,
      default: 1.0,
      type: Number,
      onChange: v => {
        for ( let p of game.playlists ) {
          for ( let s of p.sounds ) {
            if ( s.playing ) s.sync();
          }
        }
        game.audio._onChangeGlobalVolume("globalPlaylistVolume", v);
      }
    });

    // Ambient Volume
    game.settings.register("core", "globalAmbientVolume", {
      name: "Global Ambient Volume",
      hint: "Define a global ambient volume modifier",
      scope: "client",
      config: false,
      default: 1.0,
      type: Number,
      onChange: v => {
        if ( canvas.ready ) {
          canvas.sounds.refresh({fade: 0});
          for ( const mesh of canvas.primary.videoMeshes ) {
            mesh.sourceElement.volume = v;
          }
        }
        game.audio._onChangeGlobalVolume("globalAmbientVolume", v);
      }
    });

    // Interface Volume
    game.settings.register("core", "globalInterfaceVolume", {
      name: "Global Interface Volume",
      hint: "Define a global interface volume modifier",
      scope: "client",
      config: false,
      default: 0.5,
      type: Number,
      onChange: v => game.audio._onChangeGlobalVolume("globalInterfaceVolume", v)
    });
  }

  /* -------------------------------------------- */

  /**
   * Create a Sound instance for a given audio source URL
   * @param {object} options      Audio creation options
   * @param {string} options.src                  The source URL for the audio file
   * @param {boolean} [options.singleton=true]    Reuse an existing Sound for this source?
   * @param {boolean} [options.preload=false]     Begin loading the audio immediately?
   * @param {boolean} [options.autoplay=false]    Begin playing the audio as soon as it is ready?
   * @param {object} [options.autoplayOptions={}] Additional options passed to the play method if autoplay is true
   * @returns {Sound}
   */
  create({src, singleton=true, preload=false, autoplay=false, autoplayOptions={}} = {}) {
    let sound;
    if ( singleton ) {
      if ( this.sounds.has(src) ) sound = this.sounds.get(src);
      else {
        sound = new Sound(src);
        this.sounds.set(src, sound);
      }
    } else {
      sound = new Sound(src);
    }
    if ( preload ) sound.load({autoplay, autoplayOptions});
    return sound;
  }

  /* -------------------------------------------- */

  /**
   * Test whether a source file has a supported audio extension type
   * @param {string} src      A requested audio source path
   * @returns {boolean}       Does the filename end with a valid audio extension?
   */
  static hasAudioExtension(src) {
    let rgx = new RegExp(`(\\.${Object.keys(CONST.AUDIO_FILE_EXTENSIONS).join("|\\.")})(\\?.*)?`, "i");
    return rgx.test(src);
  }

  /* -------------------------------------------- */

  /**
   * Given an input file path, determine a default name for the sound based on the filename
   * @param {string} src      An input file path
   * @returns {string}        A default sound name for the path
   */
  static getDefaultSoundName(src) {
    const parts = src.split("/").pop().split(".");
    parts.pop();
    let name = decodeURIComponent(parts.join("."));
    return name.replace(/[-_.]/g, " ").titleCase();
  }

  /* -------------------------------------------- */

  /**
   * Play a single Sound by providing its source.
   * @param {string} src            The file path to the audio source being played
   * @param {object} [options]       Additional options passed to Sound#play
   * @returns {Promise<Sound>}      The created Sound which is now playing
   */
  async play(src, options) {
    const sound = new Sound(src);
    await sound.load();
    sound.play(options);
    return sound;
  }

  /* -------------------------------------------- */

  /**
   * Register an event listener to await the first mousemove gesture and begin playback once observed.
   * @returns {Promise<AudioContext>}       The unlocked audio context
   */
  async awaitFirstGesture() {
    if ( !this.locked ) return this.context;
    await new Promise(resolve => {
      for ( let eventName of ["contextmenu", "auxclick", "pointerdown", "pointerup", "keydown"] ) {
        document.addEventListener(eventName, event => this._onFirstGesture(event, resolve), {once: true});
      }
    });
    return this.context;
  }

  /* -------------------------------------------- */

  /**
   * Request that other connected clients begin preloading a certain sound path.
   * @param {string} src          The source file path requested for preload
   * @returns {Promise<Sound>}    A Promise which resolves once the preload is complete
   */
  preload(src) {
    if ( !src || !AudioHelper.hasAudioExtension(src) ) {
      throw new Error(`Invalid audio source path ${src} provided for preload request`);
    }
    game.socket.emit("preloadAudio", src);
    return this.constructor.preloadSound(src);
  }

  /* -------------------------------------------- */
  /*  Buffer Caching                              */
  /* -------------------------------------------- */

  /**
   * Retrieve an AudioBuffer from the buffers cache, if it is available
   * @param {string} src          The buffer audio source path
   * @returns {AudioBuffer}       The AudioBuffer instance if cached, otherwise undefined
   */
  getCache(src) {
    const cache = this.buffers.get(src);
    if ( cache ) {
      cache.lastAccessed = Date.now();
      return cache.buffer;
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the last accessed time and playing status of a cached buffer.
   * @param {string} src          The buffer audio source path
   * @param {boolean} playing     Is the buffer currently playing?
   */
  updateCache(src, playing=false) {
    const buffer = this.buffers.get(src);
    if ( !buffer ) return;
    buffer.playing = playing;
    buffer.lastAccessed = Date.now();
  }

  /* -------------------------------------------- */

  /**
   * Insert an AudioBuffer into the buffers cache.
   * See https://padenot.github.io/web-audio-perf/#memory-profiling
   * @param {string} src          The buffer audio source path
   * @param {AudioBuffer} buffer  The AudioBuffer instance
   */
  setCache(src, buffer) {
    const existing = this.buffers.get(src);
    if ( existing ) return existing.lastAccessed = Date.now();
    const size = buffer.length * buffer.numberOfChannels * 4;
    this.buffers.set(src, {buffer, lastAccessed: Date.now(), playing: false, size});
    this.#cacheSize += size;
    this.#expireCache();
  }

  /* -------------------------------------------- */

  /**
   * Expire buffers from the cache when the total cache size exceeds a specified threshold.
   * Buffers which were least recently accessed are removed first, provided they are not currently playing.
   * @private
   */
  #expireCache() {
    if ( this.#cacheSize < this.constructor.THRESHOLD_CACHE_SIZE_BYTES ) return;
    const entries = Array.from(this.buffers.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);  // Oldest to newest
    for ( const [key, entry] of entries ) {
      if ( entry.playing ) continue; // Don't expire buffers which are currently playing
      console.debug(`Expiring AudioBuffer for ${key}`);
      this.buffers.delete(key);
      this.#cacheSize -= entry.size;
      if ( this.#cacheSize < this.constructor.THRESHOLD_CACHE_SIZE_BYTES ) break;
    }
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  /**
   * Open socket listeners which transact ChatMessage data
   * @param socket
   */
  static _activateSocketListeners(socket) {
    socket.on("playAudio", audioData => this.play(audioData, false));
    socket.on("preloadAudio", src => this.preloadSound(src));
  }

  /* -------------------------------------------- */

  /**
   * Play a one-off sound effect which is not part of a Playlist
   *
   * @param {Object} data           An object configuring the audio data to play
   * @param {string} data.src       The audio source file path, either a public URL or a local path relative to the public directory
   * @param {number} data.volume    The volume level at which to play the audio, between 0 and 1.
   * @param {boolean} data.autoplay Begin playback of the audio effect immediately once it is loaded.
   * @param {boolean} data.loop     Loop the audio effect and continue playing it until it is manually stopped.
   * @param {object|boolean} socketOptions  Options which only apply when emitting playback over websocket.
   *                                As a boolean, emits (true) or does not emit (false) playback to all other clients
   *                                As an object, can configure which recipients should receive the event.
   * @param {string[]} [socketOptions.recipients] An array of user IDs to push audio playback to. All users by default.
   *
   * @returns {Sound}               A Sound instance which controls audio playback.
   *
   * @example Play the sound of a locked door for all players
   * ```js
   * AudioHelper.play({src: "sounds/lock.wav", volume: 0.8, loop: false}, true);
   * ```
   */
  static play(data, socketOptions) {
    const audioData = foundry.utils.mergeObject({
      src: null,
      volume: 1.0,
      loop: false
    }, data, {insertKeys: true});

    // Push the sound to other clients
    const push = socketOptions && (socketOptions !== false);
    if ( push ) {
      socketOptions = foundry.utils.getType(socketOptions) === "Object" ? socketOptions : {};
      if ( "recipients" in socketOptions && !Array.isArray(socketOptions.recipients)) {
        throw new Error("Socket recipients must be an array of User IDs");
      }
      game.socket.emit("playAudio", audioData, socketOptions);
    }

    // Backwards compatibility, if autoplay was passed as false take no further action
    if ( audioData.autoplay === false ) return;

    // Play the sound locally
    return game.audio.play(audioData.src, {
      volume: (audioData.volume ?? 1) * game.settings.get("core", "globalInterfaceVolume"),
      loop: audioData.loop
    });
  }

  /* -------------------------------------------- */

  /**
   * Begin loading the sound for a provided source URL adding its
   * @param {string} src            The audio source path to preload
   * @returns {Promise<Sound>}      The created and loaded Sound ready for playback
   */
  static async preloadSound(src) {
    const sound = game.audio.create({
      src: src,
      preload: true,
      singleton: true
    });
    return sound.load();
  }

  /* -------------------------------------------- */

  /**
   * Returns the volume value based on a range input volume control's position.
   * This is using an exponential approximation of the logarithmic nature of audio level perception
   * @param {number|string} value   Value between [0, 1] of the range input
   * @param {number} [order=1.5]    The exponent of the curve
   * @returns {number}
   */
  static inputToVolume(value, order=1.5) {
    return Math.pow(parseFloat(value), order);
  }

  /* -------------------------------------------- */

  /**
   * Counterpart to inputToVolume()
   * Returns the input range value based on a volume
   * @param {number} volume         Value between [0, 1] of the volume level
   * @param {number} [order=1.5]    The exponent of the curve
   * @returns {number}
   */
  static volumeToInput(volume, order=1.5) {
    return Math.pow(volume, 1 / order);
  }

  /* -------------------------------------------- */
  /*  Audio Stream Analysis                       */
  /* -------------------------------------------- */

  /**
   * Returns a singleton AudioContext if one can be created.
   * An audio context may not be available due to limited resources or browser compatibility
   * in which case null will be returned
   *
   * @returns {AudioContext}  A singleton AudioContext or null if one is not available
   */
  getAudioContext() {
    if ( this._audioContext ) return this._audioContext;
    try {
      // Use one Audio Context for all the analysers.
      return new (AudioContext || webkitAudioContext)();
    } catch(err) {
      console.log("Could not create AudioContext. Will not be able to analyse stream volumes.");
    }
    return null;
  }

  /* -------------------------------------------- */

  /**
   * Registers a stream for periodic reports of audio levels.
   * Once added, the callback will be called with the maximum decibel level of
   * the audio tracks in that stream since the last time the event was fired.
   * The interval needs to be a multiple of AudioHelper.levelAnalyserNativeInterval which defaults at 50ms
   *
   * @param {string} id             An id to assign to this report. Can be used to stop reports
   * @param {MediaStream} stream    The MediaStream instance to report activity on.
   * @param {Function} callback     The callback function to call with the decibel level. `callback(dbLevel)`
   * @param {number} interval       (optional) The interval at which to produce reports.
   * @param {number} smoothing      (optional) The smoothingTimeConstant to set on the audio analyser. Refer to AudioAnalyser API docs.
   * @returns {boolean}              Returns whether or not listening to the stream was successful
   */
  startLevelReports(id, stream, callback, interval = 50, smoothing = 0.1) {
    if ( !stream || !id ) return;
    let audioContext = this.getAudioContext();
    if (audioContext === null) return false;

    // Clean up any existing report with the same ID
    this.stopLevelReports(id);

    // Make sure this stream has audio tracks, otherwise we can't connect the analyser to it
    if (stream.getAudioTracks().length === 0) return false;

    // Create the analyser
    let analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = smoothing;

    // Connect the analyser to the MediaStreamSource
    audioContext.createMediaStreamSource(stream).connect(analyser);
    this._analyserStreams[id] = {
      stream,
      analyser,
      interval,
      callback,
      // Used as a counter of 50ms increments in case the interval is more than 50
      _lastEmit: 0
    };

    // Ensure the analyser timer is started as we have at least one valid stream to listen to
    this._ensureAnalyserTimer();
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Stop sending audio level reports
   * This stops listening to a stream and stops sending reports.
   * If we aren't listening to any more streams, cancel the global analyser timer.
   * @param {string} id      The id of the reports that passed to startLevelReports.
   */
  stopLevelReports(id) {
    delete this._analyserStreams[id];
    if ( foundry.utils.isEmpty(this._analyserStreams) ) this._cancelAnalyserTimer();
  }

  /* -------------------------------------------- */

  /**
   * Ensures the global analyser timer is started
   *
   * We create only one timer that runs every 50ms and only create it if needed, this is meant to optimize things
   * and avoid having multiple timers running if we want to analyse multiple streams at the same time.
   * I don't know if it actually helps much with performance but it's expected that limiting the number of timers
   * running at the same time is good practice and with JS itself, there's a potential for a timer congestion
   * phenomenon if too many are created.
   * @private
   */
  _ensureAnalyserTimer() {
    if (this._analyserInterval === 0) {
      this._analyserInterval = setInterval(this._emitVolumes.bind(this), AudioHelper.levelAnalyserNativeInterval);
    }
  }

  /* -------------------------------------------- */

  /**
   * Cancel the global analyser timer
   * If the timer is running and has become unnecessary, stops it.
   * @private
   */
  _cancelAnalyserTimer() {
    if (this._analyserInterval !== 0) {
      clearInterval(this._analyserInterval);
      this._analyserInterval = 0;
    }
  }

  /* -------------------------------------------- */

  /**
   * Capture audio level for all speakers and emit a webrtcVolumes custom event with all the volume levels
   * detected since the last emit.
   * The event's detail is in the form of {userId: decibelLevel}
   * @private
   */
  _emitVolumes() {
    for (let id in this._analyserStreams) {
      const analyserStream = this._analyserStreams[id];
      if (++analyserStream._lastEmit < analyserStream.interval / AudioHelper.levelAnalyserNativeInterval) continue;

      // Create the Fast Fourier Transform Array only once. Assume all analysers use the same fftSize
      if (this._fftArray === null) this._fftArray = new Float32Array(analyserStream.analyser.frequencyBinCount);

      // Fill the array
      analyserStream.analyser.getFloatFrequencyData(this._fftArray);
      let maxDecibel = Math.max(...this._fftArray);
      analyserStream.callback(maxDecibel, this._fftArray);
      analyserStream._lastEmit = 0;
    }
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Handle the first observed user gesture
   * @param {Event} event         The mouse-move event which enables playback
   * @param {Function} resolve    The Promise resolution function
   * @private
   */
  _onFirstGesture(event, resolve) {
    if ( this.locked === false ) return resolve();
    this.context = new AudioContext();
    this.locked = false;
    if ( this.pending.length ) {
      console.log(`${vtt} | Activating pending audio playback with user gesture.`);
      this.pending.forEach(fn => fn());
      this.pending = [];
    }
    return resolve();
  }

  /* -------------------------------------------- */

  /**
   * Additional standard callback events that occur whenever a global volume slider is adjusted
   * @param {string} key        The setting key
   * @param {number} volume     The new volume level
   * @private
   */
  _onChangeGlobalVolume(key, volume) {
    Hooks.callAll(`${key}Changed`, volume);
  }
}
