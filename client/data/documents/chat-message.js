/**
 * The client-side ChatMessage document which extends the common BaseChatMessage model.
 *
 * @extends documents.BaseChatMessage
 * @mixes ClientDocumentMixin
 *
 * @see {@link documents.Messages}                The world-level collection of ChatMessage documents
 *
 * @property {Roll[]} rolls                       The prepared array of Roll instances
 */
class ChatMessage extends ClientDocumentMixin(foundry.documents.BaseChatMessage) {

  /**
   * Is the display of dice rolls in this message collapsed (false) or expanded (true)
   * @type {boolean}
   * @private
   */
  _rollExpanded = false;

  /**
   * Is this ChatMessage currently displayed in the sidebar ChatLog?
   * @type {boolean}
   */
  logged = false;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Return the recommended String alias for this message.
   * The alias could be a Token name in the case of in-character messages or dice rolls.
   * Alternatively it could be the name of a User in the case of OOC chat or whispers.
   * @type {string}
   */
  get alias() {
    const speaker = this.speaker;
    if ( speaker.alias ) return speaker.alias;
    else if ( game.actors.has(speaker.actor) ) return game.actors.get(speaker.actor).name;
    else return this.user?.name ?? game.i18n.localize("CHAT.UnknownUser");
  }

  /* -------------------------------------------- */

  /**
   * Is the current User the author of this message?
   * @type {boolean}
   */
  get isAuthor() {
    return !!this.user?.isSelf;
  }

  /* -------------------------------------------- */

  /**
   * Return whether the content of the message is visible to the current user.
   * For certain dice rolls, for example, the message itself may be visible while the content of that message is not.
   * @type {boolean}
   */
  get isContentVisible() {
    if ( this.isRoll ) {
      const whisper = this.whisper || [];
      const isBlind = whisper.length && this.blind;
      if ( whisper.length ) return whisper.includes(game.user.id) || (this.isAuthor && !isBlind);
      return true;
    }
    else return this.visible;
  }

  /* -------------------------------------------- */

  /**
   * Test whether the chat message contains a dice roll
   * @type {boolean}
   */
  get isRoll() {
    return this.type === CONST.CHAT_MESSAGE_TYPES.ROLL;
  }

  /* -------------------------------------------- */

  /**
   * Return whether the ChatMessage is visible to the current User.
   * Messages may not be visible if they are private whispers.
   * @type {boolean}
   */
  get visible() {
    if ( this.whisper.length ) {
      if ( this.type === CONST.CHAT_MESSAGE_TYPES.ROLL ) return true;
      return this.isAuthor || (this.whisper.indexOf(game.user.id) !== -1);
    }
    return true;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  prepareDerivedData() {
    super.prepareDerivedData();

    // Create Roll instances for contained dice rolls
    this.rolls = this.rolls.reduce((rolls, rollData) => {
      try {
        rolls.push(Roll.fromData(rollData));
      } catch(err) {
        Hooks.onError("ChatMessage#rolls", err, {rollData, log: "error"});
      }
      return rolls;
    }, []);
  }

  /* -------------------------------------------- */

  /**
   * Transform a provided object of ChatMessage data by applying a certain rollMode to the data object.
   * @param {object} chatData     The object of ChatMessage data prior to applying a rollMode preference
   * @param {string} rollMode     The rollMode preference to apply to this message data
   * @returns {object}            The modified ChatMessage data with rollMode preferences applied
   */
  static applyRollMode(chatData, rollMode) {
    const modes = CONST.DICE_ROLL_MODES;
    if ( rollMode === "roll" ) rollMode = game.settings.get("core", "rollMode");
    if ( [modes.PRIVATE, modes.BLIND].includes(rollMode) ) {
      chatData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
    }
    else if ( rollMode === modes.SELF ) chatData.whisper = [game.user.id];
    else if ( rollMode === modes.PUBLIC ) chatData.whisper = [];
    chatData.blind = rollMode === modes.BLIND;
    return chatData;
  }

  /* -------------------------------------------- */

  /**
   * Update the data of a ChatMessage instance to apply a requested rollMode
   * @param {string} rollMode     The rollMode preference to apply to this message data
   */
  applyRollMode(rollMode) {
    const updates = {};
    this.constructor.applyRollMode(updates, rollMode);
    this.updateSource(updates);
  }

  /* -------------------------------------------- */

  /**
   * Attempt to determine who is the speaking character (and token) for a certain Chat Message
   * First assume that the currently controlled Token is the speaker
   *
   * @param {object} [options={}]   Options which affect speaker identification
   * @param {Scene} [options.scene]         The Scene in which the speaker resides
   * @param {Actor} [options.actor]         The Actor who is speaking
   * @param {TokenDocument} [options.token] The Token who is speaking
   * @param {string} [options.alias]        The name of the speaker to display
   *
   * @returns {object}              The identified speaker data
   */
  static getSpeaker({scene, actor, token, alias}={}) {

    // CASE 1 - A Token is explicitly provided
    const hasToken = (token instanceof Token) || (token instanceof TokenDocument);
    if ( hasToken ) return this._getSpeakerFromToken({token, alias});
    const hasActor = actor instanceof Actor;
    if ( hasActor && actor.isToken ) return this._getSpeakerFromToken({token: actor.token, alias});

    // CASE 2 - An Actor is explicitly provided
    if ( hasActor ) {
      alias = alias || actor.name;
      const tokens = actor.getActiveTokens();
      if ( !tokens.length ) return this._getSpeakerFromActor({scene, actor, alias});
      const controlled = tokens.filter(t => t.controlled);
      token = controlled.length ? controlled.shift() : tokens.shift();
      return this._getSpeakerFromToken({token: token.document, alias});
    }

    // CASE 3 - Not the viewed Scene
    else if ( ( scene instanceof Scene ) && !scene.isView ) {
      const char = game.user.character;
      if ( char ) return this._getSpeakerFromActor({scene, actor: char, alias});
      return this._getSpeakerFromUser({scene, user: game.user, alias});
    }

    // CASE 4 - Infer from controlled tokens
    if ( canvas.ready ) {
      let controlled = canvas.tokens.controlled;
      if (controlled.length) return this._getSpeakerFromToken({token: controlled.shift().document, alias});
    }

    // CASE 5 - Infer from impersonated Actor
    const char = game.user.character;
    if ( char ) {
      const tokens = char.getActiveTokens(false, true);
      if ( tokens.length ) return this._getSpeakerFromToken({token: tokens.shift(), alias});
      return this._getSpeakerFromActor({actor: char, alias});
    }

    // CASE 6 - From the alias and User
    return this._getSpeakerFromUser({scene, user: game.user, alias});
  }

  /* -------------------------------------------- */

  /**
   * A helper to prepare the speaker object based on a target TokenDocument
   * @param {object} [options={}]       Options which affect speaker identification
   * @param {TokenDocument} options.token        The TokenDocument of the speaker
   * @param {string} [options.alias]             The name of the speaker to display
   * @returns {object}                  The identified speaker data
   * @private
   */
  static _getSpeakerFromToken({token, alias}) {
    return {
      scene: token.parent?.id || null,
      token: token.id,
      actor: token.actor?.id || null,
      alias: alias || token.name
    };
  }

  /* -------------------------------------------- */

  /**
   * A helper to prepare the speaker object based on a target Actor
   * @param {object} [options={}]       Options which affect speaker identification
   * @param {Scene} [options.scene]             The Scene is which the speaker resides
   * @param {Actor} [options.actor]             The Actor that is speaking
   * @param {string} [options.alias]            The name of the speaker to display
   * @returns {Object}                  The identified speaker data
   * @private
   */
  static _getSpeakerFromActor({scene, actor, alias}) {
    return {
      scene: (scene || canvas.scene)?.id || null,
      actor: actor.id,
      token: null,
      alias: alias || actor.name
    };
  }
  /* -------------------------------------------- */

  /**
   * A helper to prepare the speaker object based on a target User
   * @param {object} [options={}]       Options which affect speaker identification
   * @param {Scene} [options.scene]             The Scene in which the speaker resides
   * @param {User} [options.user]               The User who is speaking
   * @param {string} [options.alias]            The name of the speaker to display
   * @returns {Object}                  The identified speaker data
   * @private
   */
  static _getSpeakerFromUser({scene, user, alias}) {
    return {
      scene: (scene || canvas.scene)?.id || null,
      actor: null,
      token: null,
      alias: alias || user.name
    };
  }

  /* -------------------------------------------- */

  /**
   * Obtain an Actor instance which represents the speaker of this message (if any)
   * @param {Object} speaker    The speaker data object
   * @returns {Actor|null}
   */
  static getSpeakerActor(speaker) {
    if ( !speaker ) return null;
    let actor = null;

    // Case 1 - Token actor
    if ( speaker.scene && speaker.token ) {
      const scene = game.scenes.get(speaker.scene);
      const token = scene ? scene.tokens.get(speaker.token) : null;
      actor = token?.actor;
    }

    // Case 2 - explicit actor
    if ( speaker.actor && !actor ) {
      actor = game.actors.get(speaker.actor);
    }
    return actor || null;
  }

  /* -------------------------------------------- */

  /**
   * Obtain a data object used to evaluate any dice rolls associated with this particular chat message
   * @returns {object}
   */
  getRollData() {
    const actor = this.constructor.getSpeakerActor(this.speaker) ?? this.user?.character;
    return actor ? actor.getRollData() : {};
  }

  /* -------------------------------------------- */

  /**
   * Given a string whisper target, return an Array of the user IDs which should be targeted for the whisper
   *
   * @param {string} name   The target name of the whisper target
   * @returns {User[]}      An array of User instances
   */
  static getWhisperRecipients(name) {

    // Whisper to groups
    if (["GM", "DM"].includes(name.toUpperCase())) {
      return game.users.filter(u => u.isGM);
    }
    else if (name.toLowerCase() === "players") {
      return game.users.players;
    }

    const lowerName = name.toLowerCase();
    const users = game.users.filter(u => u.name.toLowerCase() === lowerName);
    if ( users.length ) return users;
    const actors = game.users.filter(a => a.character && (a.character.name.toLowerCase() === lowerName));
    if ( actors.length ) return actors;

    // Otherwise, return an empty array
    return [];
  }

  /* -------------------------------------------- */

  /**
   * Render the HTML for the ChatMessage which should be added to the log
   * @returns {Promise<jQuery>}
   */
  async getHTML() {

    // Determine some metadata
    const data = this.toObject(false);
    data.content = await TextEditor.enrichHTML(this.content, {async: true, rollData: this.getRollData()});
    const isWhisper = this.whisper.length;

    // Construct message data
    const messageData = {
      message: data,
      user: game.user,
      author: this.user,
      alias: this.alias,
      cssClass: [
        this.type === CONST.CHAT_MESSAGE_TYPES.IC ? "ic" : null,
        this.type === CONST.CHAT_MESSAGE_TYPES.EMOTE ? "emote" : null,
        isWhisper ? "whisper" : null,
        this.blind ? "blind": null
      ].filterJoin(" "),
      isWhisper: this.whisper.length,
      canDelete: game.user.isGM,  // Only GM users are allowed to have the trash-bin icon in the chat log itself
      whisperTo: this.whisper.map(u => {
        let user = game.users.get(u);
        return user ? user.name : null;
      }).filterJoin(", ")
    };

    // Render message data specifically for ROLL type messages
    if ( this.isRoll ) {
      await this._renderRollContent(messageData);
    }

    // Define a border color
    if ( this.type === CONST.CHAT_MESSAGE_TYPES.OOC ) {
      messageData.borderColor = this.user?.color;
    }

    // Render the chat message
    let html = await renderTemplate(CONFIG.ChatMessage.template, messageData);
    html = $(html);

    // Flag expanded state of dice rolls
    if ( this._rollExpanded ) html.find(".dice-tooltip").addClass("expanded");
    Hooks.call("renderChatMessage", this, html, messageData);
    return html;
  }

  /* -------------------------------------------- */

  /**
   * Render the inner HTML content for ROLL type messages.
   * @param {object} messageData      The chat message data used to render the message HTML
   * @returns {Promise}
   * @private
   */
  async _renderRollContent(messageData) {
    const data = messageData.message;
    const renderRolls = async isPrivate => {
      let html = "";
      for ( const r of this.rolls ) {
        html += await r.render({isPrivate});
      }
      return html;
    };

    // Suppress the "to:" whisper flavor for private rolls
    if ( this.blind || this.whisper.length ) messageData.isWhisper = false;

    // Display standard Roll HTML content
    if ( this.isContentVisible ) {
      const el = document.createElement("div");
      el.innerHTML = data.content;  // Ensure the content does not already contain custom HTML
      if ( !el.childElementCount && this.rolls.length ) data.content = await this._renderRollHTML(false);
    }

    // Otherwise, show "rolled privately" messages for Roll content
    else {
      const name = this.user?.name ?? game.i18n.localize("CHAT.UnknownUser");
      data.flavor = game.i18n.format("CHAT.PrivateRollContent", {user: name});
      data.content = await renderRolls(true);
      messageData.alias = name;
    }
  }

  /* -------------------------------------------- */

  /**
   * Render HTML for the array of Roll objects included in this message.
   * @param {boolean} isPrivate   Is the chat message private?
   * @returns {Promise<string>}   The rendered HTML string
   * @private
   */
  async _renderRollHTML(isPrivate) {
    let html = "";
    for ( const roll of this.rolls ) {
      html += await roll.render({isPrivate});
    }
    return html;
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @override */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);
    if ( foundry.utils.getType(data.content) === "string" ) {
      // Evaluate any immediately-evaluated inline rolls.
      const matches = data.content.matchAll(/\[\[[^/].*?]{2,3}/g);
      let content = data.content;
      for ( const [expression] of matches ) {
        content = content.replace(expression, await TextEditor.enrichHTML(expression, {
          async: true,
          documents: false,
          secrets: false,
          links: false,
          rolls: true,
          rollData: this.getRollData()
        }));
      }
      this.updateSource({content});
    }
    if ( this.isRoll ) {
      if ( !("sound" in data) ) this.updateSource({sound: CONFIG.Dice.sound});
      const rollMode = options.rollMode || data.rollMode || game.settings.get("core", "rollMode");
      if ( rollMode ) this.applyRollMode(rollMode);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if ( options.temporary ) return;
    ui.chat.postOne(this, {notify: true});
    if ( options.chatBubble && canvas.ready ) {
      game.messages.sayBubble(this);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data, options, userId) {
    if ( !this.visible ) ui.chat.deleteMessage(this.id);
    else ui.chat.updateMessage(this);
    super._onUpdate(data, options, userId);
  }

  /* -------------------------------------------- */

  /** @override */
  _onDelete(options, userId) {
    ui.chat.deleteMessage(this.id, options);
    super._onDelete(options, userId);
  }

  /* -------------------------------------------- */
  /*  Importing and Exporting                     */
  /* -------------------------------------------- */

  /**
   * Export the content of the chat message into a standardized log format
   * @returns {string}
   */
  export() {
    let content = [];

    // Handle HTML content
    if ( this.content ) {
      const html = $("<article>").html(this.content.replace(/<\/div>/g, "</div>|n"));
      const text = html.length ? html.text() : this.content;
      const lines = text.replace(/\n/g, "").split("  ").filter(p => p !== "").join(" ");
      content = lines.split("|n").map(l => l.trim());
    }

    // Add Roll content
    for ( const roll of this.rolls ) {
      content.push(`${roll.formula} = ${roll.result} = ${roll.total}`);
    }

    // Author and timestamp
    const time = new Date(this.timestamp).toLocaleDateString("en-US", {
      hour: "numeric",
      minute: "numeric",
      second: "numeric"
    });

    // Format logged result
    return `[${time}] ${this.alias}\n${content.filterJoin("\n")}`;
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * Return the first Roll instance contained in this chat message, if one is present
   * @deprecated since v10
   * @ignore
   * @type {Roll|null}
   */
  get roll() {
    const msg = "You are calling ChatMessage#roll which is deprecated in V10 in favor of ChatMessage#rolls.";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return this.rolls[0] || null;
  }
}
