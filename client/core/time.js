/**
 * A singleton class {@link game#time} which keeps the official Server and World time stamps.
 * Uses a basic implementation of https://www.geeksforgeeks.org/cristians-algorithm/ for synchronization.
 */
class GameTime {
  constructor(socket) {

    /**
     * The most recently synchronized timestamps retrieved from the server.
     * @type {{clientTime: number, serverTime: number, worldTime: number}}
     */
    this._time = {};

    /**
     * The average one-way latency across the most recent 5 trips
     * @type {number}
     */
    this._dt = 0;

    /**
     * The most recent five synchronization durations
     * @type {number[]}
     */
    this._dts = [];

    // Perform an initial sync
    if ( socket ) this.sync(socket);
  }

  /**
   * The amount of time to delay before re-syncing the official server time.
   * @type {number}
   */
  static SYNC_INTERVAL_MS = 1000 * 60 * 5;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The current server time based on the last synchronization point and the approximated one-way latency.
   * @type {number}
   */
  get serverTime() {
    const t1 = Date.now();
    const dt = t1 - this._time.clientTime;
    if ( dt > GameTime.SYNC_INTERVAL_MS ) this.sync();
    return this._time.serverTime + dt;
  }

  /* -------------------------------------------- */

  /**
   * The current World time based on the last recorded value of the core.time setting
   * @type {number}
   */
  get worldTime() {
    return this._time.worldTime;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Advance the game time by a certain number of seconds
   * @param {number} seconds        The number of seconds to advance (or rewind if negative) by
   * @param {object} [options]      Additional options passed to game.settings.set
   * @returns {Promise<number>}     The new game time
   */
  async advance(seconds, options) {
    return game.settings.set("core", "time", this.worldTime + seconds, options);
  }

  /* -------------------------------------------- */

  /**
   * Synchronize the local client game time with the official time kept by the server
   * @param {Socket} socket         The connected server Socket instance
   * @returns {Promise<GameTime>}
   */
  async sync(socket) {
    socket = socket ?? game.socket;

    // Get the official time from the server
    const t0 = Date.now();
    const time = await new Promise(resolve => socket.emit("time", resolve));
    const t1 = Date.now();

    // Adjust for trip duration
    if ( this._dts.length >= 5 ) this._dts.unshift();
    this._dts.push(t1 - t0);

    // Re-compute the average one-way duration
    this._dt = Math.round(this._dts.reduce((total, t) => total + t, 0) / (this._dts.length * 2));

    // Adjust the server time and return the adjusted time
    time.clientTime = t1 - this._dt;
    this._time = time;
    console.log(`${vtt} | Synchronized official game time in ${this._dt}ms`);
    return this;
  }

  /* -------------------------------------------- */
  /*  Event Handlers and Callbacks                */
  /* -------------------------------------------- */

  /**
   * Handle follow-up actions when the official World time is changed
   * @param {number} worldTime      The new canonical World time.
   * @param {object} options        Options passed from the requesting client where the change was made
   * @param {string} userId         The ID of the User who advanced the time
   */
  onUpdateWorldTime(worldTime, options, userId) {
    const dt = worldTime - this._time.worldTime;
    this._time.worldTime = worldTime;
    Hooks.callAll("updateWorldTime", worldTime, dt, options, userId);
    if ( CONFIG.debug.time ) console.log(`The world time advanced by ${dt} seconds, and is now ${worldTime}.`);
  }
}
