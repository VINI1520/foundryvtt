/**
 * @typedef {Option} ChatBubbleOptions
 * @property {string[]} [cssClasses]    An optional array of CSS classes to apply to the resulting bubble
 * @property {boolean} [pan=true]       Pan to the token speaker for this bubble, if allowed by the client
 * @property {boolean} [requireVisible=false] Require that the token be visible in order for the bubble to be rendered
 */

/**
 * The Chat Bubble Class
 * This application displays a temporary message sent from a particular Token in the active Scene.
 * The message is displayed on the HUD layer just above the Token.
 */
class ChatBubbles {
  constructor() {
    this.template = "templates/hud/chat-bubble.html";

    /**
     * Track active Chat Bubbles
     * @type {object}
     */
    this.bubbles = {};

    /**
     * Track which Token was most recently panned to highlight
     * Use this to avoid repeat panning
     * @type {Token}
     * @private
     */
    this._panned = null;
  }

  /* -------------------------------------------- */

  /**
   * A reference to the chat bubbles HTML container in which rendered bubbles should live
   * @returns {jQuery}
   */
  get container() {
    return $("#chat-bubbles");
  }

  /* -------------------------------------------- */

  /**
   * Create a chat bubble message for a certain token which is synchronized for display across all connected clients.
   * @param {TokenDocument} token           The speaking Token Document
   * @param {string} message                The spoken message text
   * @param {ChatBubbleOptions} [options]   Options which affect the bubble appearance
   * @returns {Promise<jQuery|null>}        A promise which resolves with the created bubble HTML, or null
   */
  async broadcast(token, message, options={}) {
    if ( token instanceof Token ) token = token.document;
    if ( !(token instanceof TokenDocument) || !message ) {
      throw new Error("You must provide a Token instance and a message string");
    }
    game.socket.emit("chatBubble", {
      sceneId: token.parent.id,
      tokenId: token.id,
      message,
      options
    });
    return this.say(token.object, message, options);
  }

  /* -------------------------------------------- */

  /**
   * Speak a message as a particular Token, displaying it as a chat bubble
   * @param {Token} token                   The speaking Token
   * @param {string} message                The spoken message text
   * @param {ChatBubbleOptions} [options]   Options which affect the bubble appearance
   * @returns {Promise<jQuery|null>}        A Promise which resolves to the created bubble HTML element, or null
   */
  async say(token, message, {cssClasses, requireVisible = false, pan = true} = {}) {

    // Ensure that a bubble is allowed for this token
    if ( !token || !message ) return null;
    let allowBubbles = game.settings.get("core", "chatBubbles");
    if ( !allowBubbles ) return null;
    if ( requireVisible && !token.visible ) return null;

    // Clear any existing bubble for the speaker
    await this._clearBubble(token);

    // Create the HTML and call the chatBubble hook
    const actor = ChatMessage.implementation.getSpeakerActor({scene: token.scene.id, token: token.id});
    message = await TextEditor.enrichHTML(message, { async: true, rollData: actor?.getRollData() });
    let html = $(await this._renderHTML({
      token, message, cssClasses
    }));

    const allowed = Hooks.call("chatBubble", token, html, message, {cssClasses, pan});
    if ( allowed === false ) return null;

    // Set initial dimensions
    let dimensions = this._getMessageDimensions(message);
    this._setPosition(token, html, dimensions);

    // Append to DOM
    this.container.append(html);

    // Optionally pan to the speaker
    const panToSpeaker = game.settings.get("core", "chatBubblesPan") && pan && (this._panned !== token);
    const promises = [];
    if ( panToSpeaker ) {
      const scale = Math.max(1, canvas.stage.scale.x);
      promises.push(canvas.animatePan({x: token.document.x, y: token.document.y, scale, duration: 1000}));
      this._panned = token;
    }

    // Get animation duration and settings
    const duration = this._getDuration(html);
    const scroll = dimensions.unconstrained - dimensions.height;

    // Animate the bubble
    promises.push(new Promise(resolve => {
      html.fadeIn(250, () => {
        if ( scroll > 0 ) {
          html.find(".bubble-content").animate({top: -1 * scroll}, duration - 1000, "linear", resolve);
        }
        setTimeout(() => html.fadeOut(250, () => html.remove()), duration);
      });
    }));

    // Return the chat bubble HTML after all animations have completed
    await Promise.all(promises);
    return html;
  }

  /* -------------------------------------------- */

  /**
   * Activate Socket event listeners which apply to the ChatBubbles UI.
   * @param {Socket} socket     The active web socket connection
   * @internal
   */
  static _activateSocketListeners(socket) {
    socket.on("chatBubble", ({sceneId, tokenId, message, options}) => {
      if ( !canvas.ready ) return;
      const scene = game.scenes.get(sceneId);
      if ( !scene?.isView ) return;
      const token = scene.tokens.get(tokenId);
      if ( !token ) return;
      return canvas.hud.bubbles.say(token.object, message, options);
    });
  }

  /* -------------------------------------------- */

  /**
   * Clear any existing chat bubble for a certain Token
   * @param {Token} token
   * @private
   */
  async _clearBubble(token) {
    let existing = $(`.chat-bubble[data-token-id="${token.id}"]`);
    if ( !existing.length ) return;
    return new Promise(resolve => {
      existing.fadeOut(100, () => {
        existing.remove();
        resolve();
      });
    });
  }

  /* -------------------------------------------- */

  /**
   * Render the HTML template for the chat bubble
   * @param {object} data         Template data
   * @returns {Promise<string>}   The rendered HTML
   * @private
   */
  async _renderHTML(data) {
    return renderTemplate(this.template, data);
  }

  /* -------------------------------------------- */

  /**
   * Before displaying the chat message, determine it's constrained and unconstrained dimensions
   * @param {string} message    The message content
   * @returns {object}          The rendered message dimensions
   * @private
   */
  _getMessageDimensions(message) {
    let div = $(`<div class="chat-bubble" style="visibility:hidden">${message}</div>`);
    $("body").append(div);
    let dims = {
      width: div[0].clientWidth + 8,
      height: div[0].clientHeight
    };
    div.css({maxHeight: "none"});
    dims.unconstrained = div[0].clientHeight;
    div.remove();
    return dims;
  }

  /* -------------------------------------------- */

  /**
   * Assign styling parameters to the chat bubble, toggling either a left or right display (randomly)
   * @param {Token} token             The speaking Token
   * @param {JQuery} html             Chat bubble content
   * @param {Rectangle} dimensions    Positioning data
   * @private
   */
  _setPosition(token, html, dimensions) {
    let cls = Math.random() > 0.5 ? "left" : "right";
    html.addClass(cls);
    const pos = {
      height: dimensions.height,
      width: dimensions.width,
      top: token.y - dimensions.height - 8
    };
    if ( cls === "right" ) pos.left = token.x - (dimensions.width - token.w);
    else pos.left = token.x;
    html.css(pos);
  }

  /* -------------------------------------------- */

  /**
   * Determine the length of time for which to display a chat bubble.
   * Research suggests that average reading speed is 200 words per minute.
   * Since these are short-form messages, we multiply reading speed by 1.5.
   * Clamp the result between 1 second (minimum) and 20 seconds (maximum)
   * @param {jQuery} html     The HTML message
   * @returns {number}        The number of milliseconds for which to display the message
   */
  _getDuration(html) {
    const words = html.text().split(/\s+/).reduce((n, w) => n + Number(!!w.trim().length), 0);
    const ms = (words * 60 * 1000) / 300;
    return Math.clamped(1000, ms, 20000);
  }
}
