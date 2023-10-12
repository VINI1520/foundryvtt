/**
 * An AudioSourceNode container which handles the strategy of node type to use for playback.
 * Used by the Sound interface which controls playback.
 * This class is for internal use only and should not be used by external callers.
 */
class AudioContainer {
  constructor(src) {

    /**
     * The audio source path
     * @type {string}
     */
    this.src = src;
  }

  /**
   * The Audio Node used to control this sound
   * @type {AudioBufferSourceNode|MediaElementAudioSourceNode}
   */
  sourceNode = undefined;

  /**
   * The GainNode used to control volume
   * @type {GainNode}
   */
  gainNode = undefined;

  /**
   * Is this container using an AudioBuffer?
   * @type {boolean}
   */
  isBuffer = false;

  /**
   * Whether we have attempted to load the audio node or not, and whether it failed.
   * @see {LOAD_STATES}
   * @type {number}
   */
  loadState = AudioContainer.LOAD_STATES.NONE;

  /**
   * Is the audio source currently playing?
   * @type {boolean}
   */
  playing = false;

  /**
   * Should the audio source loop?
   * @type {boolean}
   * @private
   */
  _loop = false;

  get loop() {
    return this._loop;
  }
  set loop(looping) {
    this._loop = looping;
    if ( !this.sourceNode ) return;
    if ( this.isBuffer ) this.sourceNode.loop = looping;
  }

  /**
   * The maximum duration, in seconds, for which an AudioBuffer will be used.
   * Otherwise, a streaming media element will be used.
   * @type {number}
   */
  static MAX_BUFFER_DURATION = 10 * 60;  // 10 Minutes

  /**
   * The sequence of container loading states.
   * @enum {number}
   */
  static LOAD_STATES = {
    FAILED: -1,
    NONE: 0,
    LOADING: 1,
    LOADED: 2
  };

  /**
   * Has the audio file been loaded either fully or for streaming.
   * @type {boolean}
   */
  get loaded() {
    return this.loadState === AudioContainer.LOAD_STATES.LOADED;
  }

  /**
   * Did the audio file fail to load.
   * @type {boolean}
   */
  get failed() {
    return this.loadState === AudioContainer.LOAD_STATES.FAILED;
  }

  /* -------------------------------------------- */
  /*  Container Attributes                        */
  /* -------------------------------------------- */

  /**
   * A reference to the AudioBuffer if the sourceNode is a AudioBufferSourceNode.
   * @returns {AudioBuffer}
   */
  get buffer() {
    return this.sourceNode.buffer;
  }

  /* -------------------------------------------- */

  /**
   * The game audio context used throughout the application.
   * @returns {AudioContext}
   */
  get context() {
    return game.audio.context;
  }

  /* -------------------------------------------- */

  /**
   * The total duration of the audio source in seconds
   * @type {number}
   */
  get duration() {
    if ( !this.loaded || this.failed ) return undefined;
    if ( this.isBuffer ) return this.buffer.duration;
    else return this.element.duration;
  }

  /* -------------------------------------------- */

  /**
   * A reference to the HTMLMediaElement, if the sourceNode is a MediaElementAudioSourceNode.
   * @returns {HTMLMediaElement}
   */
  get element() {
    return this.sourceNode.mediaElement;
  }

  /* -------------------------------------------- */
  /*  Constructor Methods                         */
  /* -------------------------------------------- */

  /**
   * Load the source node required for playback of this audio source
   * @returns {Promise<void>}
   */
  async load() {
    this.loadState = AudioContainer.LOAD_STATES.LOADING;
    this.sourceNode = await this._createNode();
    if ( !this.sourceNode ) {
      this.loadState = AudioContainer.LOAD_STATES.FAILED;
      return;
    }
    this.gainNode = this.context.createGain();
    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.context.destination);
    this.loadState = AudioContainer.LOAD_STATES.LOADED;
  }

  /* -------------------------------------------- */

  /**
   * Create the initial audio node used for playback.
   * Determine the node type to use based on cached state and sound duration.
   * @returns {AudioBufferSourceNode|MediaElementAudioSourceNode}
   * @private
   */
  async _createNode() {

    // If an audio buffer is cached, use an AudioBufferSourceNode
    const cached = game.audio.getCache(this.src);
    if ( cached ) return this._createAudioBufferSourceNode(cached);

    // Otherwise, check the element duration using HTML5 audio
    let element;
    try {
      element = await this._createAudioElement();
    } catch(err) {
      console.error(`${vtt} | Failed to load audio node:`, err);
      return;
    }
    const isShort = element.duration && (element.duration <= this.constructor.MAX_BUFFER_DURATION);

    // For short sounds create and cache the audio buffer and use an AudioBufferSourceNode
    if ( isShort ) {
      const buffer = await this.createAudioBuffer(this.src);
      console.debug(`${vtt} | Constructing audio buffer source node - ${this.src}`);
      return this._createAudioBufferSourceNode(buffer);
    }

    // For long or streamed sounds, use a MediaElementAudioSourceNode
    console.debug(`${vtt} | Constructing audio element source node - ${this.src}`);
    return this._createMediaElementAudioSourceNode(element);
  }

  /* -------------------------------------------- */

  /**
   * Create an Audio source node using a buffered array.
   * @param {string} src                The source URL from which to create the buffer
   * @returns {Promise<AudioBuffer>}    The created and decoded buffer
   */
  async createAudioBuffer(src) {
    console.debug(`${vtt} | Loading audio buffer - ${src}`);
    const response = await foundry.utils.fetchWithTimeout(src);
    const arrayBuffer = await response.arrayBuffer();
    return this.context.decodeAudioData(arrayBuffer);
  }

  /* -------------------------------------------- */

  /**
   * Create a AudioBufferSourceNode using a provided AudioBuffer
   * @private
   */
  _createAudioBufferSourceNode(buffer) {
    this.isBuffer = true;
    game.audio.setCache(this.src, buffer);
    return new AudioBufferSourceNode(this.context, {buffer});
  }

  /* -------------------------------------------- */

  /**
   * Create an HTML5 Audio element which has loaded the metadata for the provided source.
   * @returns {Promise<HTMLAudioElement>}
   * @private
   */
  async _createAudioElement() {
    console.debug(`${vtt} | Loading audio element - ${this.src}`);
    return new Promise((resolve, reject) => {
      const element = new Audio();
      element.autoplay = false;
      element.crossOrigin = "anonymous";
      element.onloadedmetadata = () => resolve(element);
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = this.src;
    });
  }

  /* -------------------------------------------- */

  /**
   * Create a MediaElementAudioSourceNode using a provided HTMLAudioElement
   * @private
   */
  _createMediaElementAudioSourceNode(element) {
    this.isBuffer = false;
    return new MediaElementAudioSourceNode(this.context, {mediaElement: element});
  }

  /* -------------------------------------------- */
  /*  Playback Methods                            */
  /* -------------------------------------------- */

  /**
   * Begin playback for the source node.
   * @param {number} [offset]       The desired start time
   * @param {Function} [onended]    A callback function for when playback concludes naturally
   */
  play(offset=0, onended=undefined) {
    if ( this.isBuffer ) {
      this.sourceNode.onended = () => this._onEnd(onended);
      this.sourceNode.start(0, offset);
      game.audio.updateCache(this.src, true);
    }
    else {
      this.element.currentTime = offset;
      this.element.onended = () => this._onEnd(onended);
      this.element.play();
    }
    this.playing = true;
  }

  /* -------------------------------------------- */

  /**
   * Terminate playback for the source node.
   */
  stop() {
    this.playing = false;
    if ( this.isBuffer ) {
      this.sourceNode.onended = undefined;
      this.sourceNode.stop(0);
      game.audio.updateCache(this.src, false);
    }
    this._unloadMediaNode();
  }

  /* -------------------------------------------- */

  /**
   * Perform cleanup actions when the sound has finished playing. For
   * MediaElementAudioSourceNodes, this also means optionally restarting if
   * the sound is supposed to loop.
   * @param {Function} onended A callback provided by the owner of the container that gets fired when the sound ends.
   * @private
   */
  _onEnd(onended) {
    if ( !this.isBuffer && this._loop ) return this.play(0, onended);
    onended();
    this.stop();
  }

  /* -------------------------------------------- */

  /**
   * Unload the MediaElementAudioSourceNode to terminate any ongoing
   * connections.
   * @private
   */
  _unloadMediaNode() {
    console.debug(`${vtt} | Unloading audio element - ${this.src}`);
    const element = this.element;

    // Deconstruct the audio pipeline
    this.sourceNode.disconnect(this.gainNode);
    this.gainNode.disconnect(this.context.destination);
    this.loadState = AudioContainer.LOAD_STATES.NONE;
    this.sourceNode = this.gainNode = undefined;

    // Unload media streams
    if ( !this.isBuffer ) {
      element.onended = undefined;
      element.pause();
      element.src = "";
      element.remove();
    }
  }
}
