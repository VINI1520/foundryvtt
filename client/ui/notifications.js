/**
 * A common framework for displaying notifications to the client.
 * Submitted notifications are added to a queue, and up to 3 notifications are displayed at once.
 * Each notification is displayed for 5 seconds at which point further notifications are pulled from the queue.
 *
 * @extends {Application}
 *
 * @example Displaying Notification Messages
 * ```js
 * ui.notifications.info("This is an info message");
 * ui.notifications.warn("This is a warning message");
 * ui.notifications.error("This is an error message");
 * ui.notifications.info("This is a 4th message which will not be shown until the first info message is done");
 * ```
 */
class Notifications extends Application {
  /**
   * An incrementing counter for the notification IDs.
   * @type {number}
   */
  #id = 1;

  constructor(options) {
    super(options);

    /**
     * Submitted notifications which are queued for display
     * @type {object[]}
     */
    this.queue = [];

    /**
     * Notifications which are currently displayed
     * @type {object[]}
     */
    this.active = [];

    // Initialize any pending messages
    this.initialize();
  }

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      popOut: false,
      id: "notifications",
      template: "templates/hud/notifications.html"
    });
  }

  /* -------------------------------------------- */

  /**
   * Initialize the Notifications system by displaying any system-generated messages which were passed from the server.
   */
  initialize() {
    for ( let m of globalThis.MESSAGES ) {
      this.notify(game.i18n.localize(m.message), m.type, m.options);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _renderInner(...args) {
    return $('<ol id="notifications"></ol>');
  }

  /* -------------------------------------------- */

  /** @override */
  async _render(...args) {
    await super._render(...args);
    while ( this.queue.length && (this.active.length < 3) ) this.fetch();
  }

  /* -------------------------------------------- */

  /**
   * @typedef {Object} NotifyOptions
   * @property {boolean} [permanent=false]      Should the notification be permanently displayed until dismissed
   * @property {boolean} [localize=false]       Whether to localize the message content before displaying it
   * @property {boolean} [console=true]         Whether to log the message to the console
   */

  /**
   * Push a new notification into the queue
   * @param {string} message                   The content of the notification message
   * @param {string} type                      The type of notification, "info", "warning", and "error" are supported
   * @param {NotifyOptions} [options={}]       Additional options which affect the notification
   * @returns {number}                         The ID of the notification
   */
  notify(message, type="info", {localize=false, permanent=false, console=true}={}) {
    if ( localize ) message = game.i18n.localize(message);
    let n = {
      id: this.#id++,
      message: message,
      type: ["info", "warning", "error"].includes(type) ? type : "info",
      timestamp: new Date().getTime(),
      permanent: permanent,
      console: console
    };
    this.queue.push(n);
    if ( this.rendered ) this.fetch();
    return n.id;
  }

  /* -------------------------------------------- */

  /**
   * Display a notification with the "info" type
   * @param {string} message           The content of the notification message
   * @param {NotifyOptions} options    Notification options passed to the notify function
   * @returns {number}                 The ID of the notification
   */
  info(message, options) {
    return this.notify(message, "info", options);
  }

  /* -------------------------------------------- */

  /**
   * Display a notification with the "warning" type
   * @param {string} message           The content of the notification message
   * @param {NotifyOptions} options    Notification options passed to the notify function
   * @returns {number}                 The ID of the notification
   */
  warn(message, options) {
    return this.notify(message, "warning", options);
  }

  /* -------------------------------------------- */

  /**
   * Display a notification with the "error" type
   * @param {string} message           The content of the notification message
   * @param {NotifyOptions} options    Notification options passed to the notify function
   * @returns {number}                 The ID of the notification
   */
  error(message, options) {
    return this.notify(message, "error", options);
  }

  /* -------------------------------------------- */

  /**
   * Remove the notification linked to the ID.
   * @param {number} id                 The ID of the notification
   */
  remove(id) {

    // Remove a queued notification that has not been displayed yet
    const queued = this.queue.findSplice(n => n.id === id);
    if ( queued ) return;

    // Remove an active HTML element
    const active = this.active.findSplice(li => li.data("id") === id);
    if ( !active ) return;
    active.fadeOut(66, () => active.remove());
    this.fetch();
  }

  /* -------------------------------------------- */

  /**
   * Clear all notifications.
   */
  clear() {
    this.queue.length = 0;
    for ( const li of this.active ) li.fadeOut(66, () => li.remove());
    this.active.length = 0;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve a pending notification from the queue and display it
   * @private
   * @returns {void}
   */
  fetch() {
    if ( !this.queue.length || (this.active.length >= 3) ) return;
    const next = this.queue.pop();
    const now = Date.now();

    // Define the function to remove the notification
    const _remove = li => {
      li.fadeOut(66, () => li.remove());
      const i = this.active.indexOf(li);
      if ( i >= 0 ) this.active.splice(i, 1);
      return this.fetch();
    };

    // Construct a new notification
    const cls = ["notification", next.type, next.permanent ? "permanent" : null].filterJoin(" ");
    const li = $(`<li class="${cls}" data-id="${next.id}">${next.message}<i class="close fas fa-times-circle"></i></li>`);

    // Add click listener to dismiss
    li.click(ev => {
      if ( Date.now() - now > 250 ) _remove(li);
    });
    this.element.prepend(li);
    li.hide().slideDown(132);
    this.active.push(li);

    // Log to console if enabled
    if ( next.console ) console[next.type === "warning" ? "warn" : next.type](next.message);

    // Schedule clearing the notification 5 seconds later
    if ( !next.permanent ) window.setTimeout(() => _remove(li), 5000);
  }
}
