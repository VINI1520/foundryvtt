/**
 * The Sound class is used to control the playback of audio sources using the Web Audio API.
 */
class Sound {
  constructor(src, {container}={}) {

    /**
     * The numeric identifier for accessing this node
     * @type {number}
     */
    this.id = ++Sound._nodeId;

    /**
     * The audio source path
     * @type {string}
     */
    this.src = src;

    /**
     * The AudioContainer which controls playback
     * @type {AudioContainer}
     */
    this.container = container || new AudioContainer(this.src);
  }

  /* -------------------------------------------- */

  /**
   * The time in seconds at which playback was started
   * @type {number}
   */
  startTime = undefined;

  /**
   * The time in seconds at which playback was paused
   * @type {number}
   */
  pausedTime = undefined;

  /**
   * Registered event callbacks
   * @type {{stop: {}, start: {}, end: {}, pause: {}, load: {}}}
   */
  events = {
    end: {},
    pause: {},
    start: {},
    stop: {},
    load: {}
  };

  /**
   * The registered event handler id for this Sound.
   * Incremented each time a callback is registered.
   * @type {number}
   * @private
   */
  _eventHandlerId = 1;

  /**
   * If this Sound source is currently in the process of loading, this attribute contains a Promise that will resolve
   * when the loading process completes.
   * @type {Promise}
   */
  loading = undefined;

  /**
   * A collection of scheduled events recorded as window timeout IDs
   * @type {Set<number>}
   * @private
   */
  _scheduledEvents = new Set();

  /**
   * A global audio node ID used to quickly reference a specific audio node
   * @type {number}
   * @private
   */
  static _nodeId = 0;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * A convenience reference to the sound context used by the application
   * @returns {AudioContext}
   */
  get context() {
    return game.audio.context;
  }

  /**
   * A reference to the audio source node being used by the AudioContainer
   * @returns {AudioBufferSourceNode|MediaElementAudioSourceNode}
   */
  get node() {
    return this.container.sourceNode;
  }

  /**
   * A reference to the GainNode parameter which controls volume
   * @type {AudioParam}
   */
  get gain() {
    return this.container.gainNode?.gain;
  }

  /**
   * The current playback time of the sound
   * @returns {number}
   */
  get currentTime() {
    if ( !this.playing ) return undefined;
    if ( this.pausedTime ) return this.pausedTime;
    let time = this.context.currentTime - this.startTime;
    if ( Number.isFinite(this.duration) ) time %= this.duration;
    return time;
  }

  /**
   * The total sound duration, in seconds
   * @type {number}
   */
  get duration() {
    return this.container.duration;
  }

  /**
   * Is the contained audio node loaded and ready for playback?
   * @type {boolean}
   */
  get loaded() {
    return this.container.loaded;
  }

  /**
   * Did the contained audio node fail to load?
   * @type {boolean}
   */
  get failed() {
    return this.container.failed;
  }

  /**
   * Is the audio source currently playing?
   * @type {boolean}
   */
  get playing() {
    return this.container.playing;
  }

  /**
   * Is the Sound current looping?
   * @type {boolean}
   */
  get loop() {
    return this.container.loop;
  }
  set loop(looping) {
    this.container.loop = looping;
  }

  /**
   * The volume at which the Sound is playing
   * @returns {number}
   */
  get volume() {
    return this.gain?.value;
  }
  set volume(value) {
    if ( !this.node || !Number.isNumeric(value) ) return;
    const ct = this.context.currentTime;
    this.gain.cancelScheduledValues(ct);
    this.gain.setValueAtTime(this.gain.value = value, ct); // Important - immediately "schedule" the current value
  }

  /* -------------------------------------------- */
  /*  Control Methods                             */
  /* -------------------------------------------- */

  /**
   * Fade the volume for this sound between its current level and a desired target volume
   * @param {number} volume                     The desired target volume level between 0 and 1
   * @param {object} [options={}]               Additional options that configure the fade operation
   * @param {number} [options.duration=1000]      The duration of the fade effect in milliseconds
   * @param {number} [options.from]               A volume level to start from, the current volume by default
   * @param {string} [options.type=linear]        The type of fade easing, "linear" or "exponential"
   * @returns {Promise<void>}                   A Promise that resolves after the requested fade duration
   */
  async fade(volume, {duration=1000, from, type="linear"}={}) {
    if ( !this.gain ) return;
    const ramp = this.gain[`${type}RampToValueAtTime`];
    if ( !ramp ) throw new Error(`Invalid fade type ${type} requested`);
    const ct = this.context.currentTime;

    // Schedule the fade
    this.gain.cancelScheduledValues(ct); // Cancel any existing transition
    this.gain.setValueAtTime(from ?? this.gain.value, ct); // Important - immediately "schedule" the current value
    ramp.call(this.gain, volume, ct + (duration / 1000));
    return new Promise(resolve => window.setTimeout(resolve, duration));
  }

  /* -------------------------------------------- */

  /**
   * Load the audio source, creating an AudioBuffer.
   * Audio loading is idempotent, it can be requested multiple times but only the first load request will be honored.
   * @param {object} [options={}]   Additional options which affect resource loading
   * @param {boolean} [options.autoplay=false]  Automatically begin playback of the audio source once loaded
   * @param {object} [options.autoplayOptions]  Additional options passed to the play method when loading is complete
   * @returns {Promise<Sound>}      The Sound once its source audio buffer is loaded
   */
  async load({autoplay=false, autoplayOptions={}}={}) {

    // Delay audio loading until after an observed user gesture
    if ( game.audio.locked ) {
      console.log(`${vtt} | Delaying load of sound ${this.src} until after first user gesture`);
      await new Promise(resolve => game.audio.pending.push(resolve));
    }

    // Currently loading
    if ( this.loading instanceof Promise ) await this.loading;

    // If loading is required, cache the promise for idempotency
    if ( !this.container || this.container.loadState === AudioContainer.LOAD_STATES.NONE ) {
      this.loading = this.container.load();
      await this.loading;
      this.loading = undefined;
    }

    // Trigger automatic playback actions
    if ( autoplay ) this.play(autoplayOptions);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Begin playback for the sound node
   * @param {object} [options={}]   Options which configure playback
   * @param {boolean} [options.loop=false]    Whether to loop the audio automatically
   * @param {number} [options.offset]         A specific offset in seconds at which to begin playback
   * @param {number} [options.volume]         The desired volume at which to begin playback
   * @param {number} [options.fade=0]         Fade volume changes over a desired duration in milliseconds
   */
  play({loop=false, offset, volume, fade=0}={}) {
    if ( this.failed ) {
      this._onEnd();
      return;
    }

    if ( !this.loaded ) {
      return console.warn(`You cannot play Sound ${this.src} before it has loaded`);
    }

    // If we are still awaiting the first user interaction, add this playback to a pending queue
    if ( game.audio.locked ) {
      console.log(`${vtt} | Delaying playback of sound ${this.src} until after first user gesture`);
      return game.audio.pending.push(() => this.play({loop, offset, volume}));
    }

    // Adjust volume and looping
    const adjust = () => {
      this.loop = loop;
      if ( (volume !== undefined) && (volume !== this.volume) ) {
        if ( fade ) return this.fade(volume, {duration: fade});
        else this.volume = volume;
      }
    };

    // If the sound is already playing, and a specific offset is not provided, do nothing
    if ( this.playing ) {
      if ( offset === undefined ) return adjust();
      this.stop();
    }

    // Configure playback
    offset = offset ?? this.pausedTime ?? 0;
    if ( Number.isFinite(this.duration) ) offset %= this.duration;
    this.startTime = this.context.currentTime - offset;
    this.pausedTime = undefined;

    // Start playback
    this.volume = 0; // Start volume at 0
    this.container.play(offset, this._onEnd.bind(this));
    adjust(); // Adjust to the desired volume
    this._onStart();
  }

  /* -------------------------------------------- */

  /**
   * Pause playback, remembering the playback position in order to resume later.
   */
  pause() {
    this.pausedTime = this.currentTime;
    this.startTime = undefined;
    this.container.stop();
    this._onPause();
  }

  /* -------------------------------------------- */

  /**
   * Stop playback, fully resetting the Sound to a non-playing state.
   */
  stop() {
    if ( this.playing === false ) return;
    this.pausedTime = undefined;
    this.startTime = undefined;
    this.container.stop();
    this._onStop();
  }

  /* -------------------------------------------- */

  /**
   * Schedule a function to occur at the next occurrence of a specific playbackTime for this Sound.
   * @param {Function} fn           A function that will be called with this Sound as its single argument
   * @param {number} playbackTime   The desired playback time at which the function should be called
   * @returns {Promise<null>}       A Promise which resolves once the scheduled function has been called
   *
   * @example Schedule audio playback changes
   * ```js
   * sound.schedule(() => console.log("Do something exactly 30 seconds into the track"), 30);
   * sound.schedule(() => console.log("Do something next time the track loops back to the beginning"), 0);
   * sound.schedule(() => console.log("Do something 5 seconds before the end of the track"), sound.duration - 5);
   * ```
   */
  schedule(fn, playbackTime) {
    const now = this.currentTime;
    playbackTime = Math.clamped(playbackTime, 0, this.duration);
    if ( (playbackTime < now) && Number.isFinite(duration) ) playbackTime += this.duration;
    const deltaMS = Math.max(0, (playbackTime - now) * 1000);
    return new Promise(resolve => {
      const timeoutId = setTimeout(() => {
        this._scheduledEvents.delete(timeoutId);
        fn(this);
        return resolve();
      }, deltaMS);
      this._scheduledEvents.add(timeoutId);
    });
  }

  /* -------------------------------------------- */
  /*  Event Emitter                               */
  /* -------------------------------------------- */

  /**
   * Trigger registered callback functions for a specific event name.
   * @param {string} eventName      The event name being emitted
   */
  emit(eventName) {
    const events = this.events[eventName]
    if ( !events ) return;
    for ( let [fnId, callback] of Object.entries(events) ) {
      callback.fn(this);
      if ( callback.once ) delete events[fnId];
    }
  }

  /* -------------------------------------------- */

  /**
   * Deactivate an event handler which was previously registered for a specific event
   * @param {string} eventName      The event name being deactivated
   * @param {number|Function} fn    The callback ID or callback function being un-registered
   */
  off(eventName, fn) {
    const events = this.events[eventName];
    if ( !events ) return;
    if ( Number.isNumeric(fn) ) delete events[fn];
    for ( let [id, f] of Object.entries(events) ) {
      if ( f === fn ) {
        delete events[id];
        break;
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Register an event handler to take actions for a certain Sound event.
   * @param {string} eventName      The event name being deactivated
   * @param {Function} fn           The callback function to trigger when the event occurs
   * @param {object} [options={}]   Additional options that affect callback registration
   * @param {boolean} [options.once=false]  Trigger the callback once only and automatically un-register it
   */
  on(eventName, fn, {once=false}={}) {
    return this._registerForEvent(eventName, {fn, once});
  }

  /* -------------------------------------------- */

  /**
   * Register a new callback function for a certain event. For internal use only.
   * @private
   */
  _registerForEvent(eventName, callback) {
    const events = this.events[eventName];
    if ( !events ) return;
    const fnId = this._eventHandlerId++;
    events[fnId] = callback;
    return fnId;
  }

  /* -------------------------------------------- */

  /**
   * Cancel all pending scheduled events.
   * @private
   */
  _clearEvents() {
    for ( let timeoutId of this._scheduledEvents ) {
      window.clearTimeout(timeoutId);
    }
    this._scheduledEvents.clear();
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Called when playback concludes naturally
   * @protected
   */
  _onEnd() {
    this._clearEvents();
    game.audio.playing.delete(this.id);
    this.emit("end");
  }

  /**
   * Called when the audio buffer is first loaded
   * @protected
   */
  _onLoad() {
    this.emit("load");
  }

  /**
   * Called when playback is paused
   * @protected
   */
  _onPause() {
    this._clearEvents();
    this.emit("pause");
  }

  /**
   * Called when the sound begins playing
   * @protected
   */
  _onStart() {
    game.audio.playing.set(this.id, this);
    this.emit("start");
  }

  /**
   * Called when playback is stopped (prior to naturally reaching the end)
   * @protected
   */
  _onStop() {
    this._clearEvents();
    game.audio.playing.delete(this.id);
    this.emit("stop");
  }
}
