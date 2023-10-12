/**
 * @typedef {ApplicationOptions} ChatLogOptions
 * @property {boolean} [stream]  Is this chat log being rendered as part of the stream view?
 */

/**
 * The sidebar directory which organizes and displays world-level ChatMessage documents.
 * @extends {SidebarTab}
 * @see {Sidebar}
 * @param {ChatLogOptions} [options]  Application configuration options.
 */
class ChatLog extends SidebarTab {
  constructor(options) {
    super(options);

    /**
     * Track any pending text which the user has submitted in the chat log textarea
     * @type {string}
     * @private
     */
    this._pendingText = "";

    /**
     * Track the history of the past 5 sent messages which can be accessed using the arrow keys
     * @type {object[]}
     * @private
     */
    this._sentMessages = [];

    /**
     * Track which remembered message is being currently displayed to cycle properly
     * @type {number}
     * @private
     */
    this._sentMessageIndex = -1;

    /**
     * Track the time when the last message was sent to avoid flooding notifications
     * @type {number}
     * @private
     */
    this._lastMessageTime = 0;

    /**
     * Track the id of the last message displayed in the log
     * @type {string|null}
     * @private
     */
    this._lastId = null;

    /**
     * Track the last received message which included the user as a whisper recipient.
     * @type {ChatMessage|null}
     * @private
     */
    this._lastWhisper = null;

    /**
     * A reference to the chat text entry bound key method
     * @type {Function|null}
     * @private
     */
    this._onChatKeyDownBinding = null;

    // Update timestamps every 15 seconds
    setInterval(this.updateTimestamps.bind(this), 1000 * 15);
  }

  /**
   * A flag for whether the chat log is currently scrolled to the bottom
   * @type {boolean}
   */
  #isAtBottom = true;

  /**
   * A cache of the Jump to Bottom element
   */
  #jumpToBottomElement;

  /* -------------------------------------------- */

  /**
   * Returns if the chat log is currently scrolled to the bottom
   * @returns {boolean}
   */
  get isAtBottom() {
    return this.#isAtBottom;
  }

  /* -------------------------------------------- */

  /**
   * @override
   * @returns {ChatLogOptions}
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "chat",
      template: "templates/sidebar/chat-log.html",
      title: game.i18n.localize("CHAT.Title"),
      stream: false,
      scrollY: ["#chat-log"]
    });
  }

  /* -------------------------------------------- */

  /**
   * An enumeration of regular expression patterns used to match chat messages.
   * @enum {RegExp}
   */
  static MESSAGE_PATTERNS = (() => {
    const dice = "([^#]+)(?:#(.*))?";       // Dice expression with appended flavor text
    const any = "([^]*)";                   // Any character, including new lines
    return {
      roll: new RegExp(`^(\\/r(?:oll)? )${dice}$`, "i"),                   // Regular rolls: /r or /roll
      gmroll: new RegExp(`^(\\/gmr(?:oll)? )${dice}$`, "i"),               // GM rolls: /gmr or /gmroll
      blindroll: new RegExp(`^(\\/b(?:lind)?r(?:oll)? )${dice}$`, "i"),    // Blind rolls: /br or /blindroll
      selfroll: new RegExp(`^(\\/s(?:elf)?r(?:oll)? )${dice}$`, "i"),      // Self rolls: /sr or /selfroll
      publicroll: new RegExp(`^(\\/p(?:ublic)?r(?:oll)? )${dice}$`, "i"),  // Public rolls: /pr or /publicroll
      ic: new RegExp(`^(/ic )${any}`, "i"),
      ooc: new RegExp(`^(/ooc )${any}`, "i"),
      emote: new RegExp(`^(/(?:em(?:ote)?|me) )${any}`, "i"),
      whisper: new RegExp(/^(\/w(?:hisper)?\s)(\[(?:[^\]]+)\]|(?:[^\s]+))\s*([^]*)/, "i"),
      reply: new RegExp(`^(/reply )${any}`, "i"),
      gm: new RegExp(`^(/gm )${any}`, "i"),
      players: new RegExp(`^(/players )${any}`, "i"),
      macro: new RegExp(`^(\\/m(?:acro)? )${any}`, "i"),
      invalid: /^(\/[^\s]+)/ // Any other message starting with a slash command is invalid
    };
  })();

  /* -------------------------------------------- */

  /**
   * The set of commands that can be processed over multiple lines.
   * @type {Set<string>}
   */
  static MULTILINE_COMMANDS = new Set(["roll", "gmroll", "blindroll", "selfroll", "publicroll"]);

  /* -------------------------------------------- */

  /**
   * A reference to the Messages collection that the chat log displays
   * @type {Messages}
   */
  get collection() {
    return game.messages;
  }

  /* -------------------------------------------- */
  /*  Application Rendering                       */
  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    const context = await super.getData(options);
    return foundry.utils.mergeObject(context, {
      rollMode: game.settings.get("core", "rollMode"),
      rollModes: CONFIG.Dice.rollModes,
      isStream: !!this.options.stream
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, options) {
    if ( this.rendered ) return; // Never re-render the Chat Log itself, only its contents
    await super._render(force, options);
    return this.scrollBottom({waitImages: true});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _renderInner(data) {
    const html = await super._renderInner(data);
    await this._renderBatch(html, CONFIG.ChatMessage.batchSize);
    return html;
  }

  /* -------------------------------------------- */

  /**
   * Render a batch of additional messages, prepending them to the top of the log
   * @param {jQuery} html     The rendered jQuery HTML object
   * @param {number} size     The batch size to include
   * @returns {Promise<void>}
   * @private
   */
  async _renderBatch(html, size) {
    const messages = game.messages.contents;
    const log = html.find("#chat-log, #chat-log-popout");

    // Get the index of the last rendered message
    let lastIdx = messages.findIndex(m => m.id === this._lastId);
    lastIdx = lastIdx !== -1 ? lastIdx : messages.length;

    // Get the next batch to render
    let targetIdx = Math.max(lastIdx - size, 0);
    let m = null;
    if ( lastIdx !== 0 ) {
      let html = [];
      for ( let i=targetIdx; i<lastIdx; i++) {
        m = messages[i];
        if (!m.visible) continue;
        m.logged = true;
        try {
          html.push(await m.getHTML());
        } catch(err) {
          err.message = `Chat message ${m.id} failed to render: ${err})`;
          console.error(err);
        }
      }

      // Prepend the HTML
      log.prepend(html);
      this._lastId = messages[targetIdx].id;
    }
  }

  /* -------------------------------------------- */
  /*  Chat Sidebar Methods                        */
  /* -------------------------------------------- */

  /**
   * Delete a single message from the chat log
   * @param {string} messageId    The ChatMessage document to remove from the log
   * @param {boolean} [deleteAll] Is this part of a flush operation to delete all messages?
   */
  deleteMessage(messageId, {deleteAll=false}={}) {

    // Get the chat message being removed from the log
    const message = game.messages.get(messageId, {strict: false});
    if ( message ) message.logged = false;

    // Get the current HTML element for the message
    let li = this.element.find(`.message[data-message-id="${messageId}"]`);
    if ( !li.length ) return;

    // Update the last index
    if ( deleteAll ) {
      this._lastId = null;
    } else if ( messageId === this._lastId ) {
      const next = li[0].nextElementSibling;
      this._lastId = next ? next.dataset.messageId : null;
    }

    // Remove the deleted message
    li.slideUp(100, () => li.remove());

    // Delete from popout tab
    if ( this._popout ) this._popout.deleteMessage(messageId, {deleteAll});
    if ( this.popOut ) this.setPosition();
  }

  /* -------------------------------------------- */

  /**
   * Trigger a notification that alerts the user visually and audibly that a new chat log message has been posted
   * @param {ChatMessage} message         The message generating a notification
   */
  notify(message) {
    this._lastMessageTime = Date.now();
    if ( !this.rendered ) return;

    // Display the chat notification icon and remove it 3 seconds later
    let icon = $("#chat-notification");
    if ( icon.is(":hidden") ) icon.fadeIn(100);
    setTimeout(() => {
      if ( (Date.now() - this._lastMessageTime > 3000) && icon.is(":visible") ) icon.fadeOut(100);
    }, 3001);

    // Play a notification sound effect
    if ( message.sound ) AudioHelper.play({src: message.sound});
  }

  /* -------------------------------------------- */

  /**
   * Parse a chat string to identify the chat command (if any) which was used
   * @param {string} message    The message to match
   * @returns {string[]}        The identified command and regex match
   */
  static parse(message) {
    for ( const [rule, rgx] of Object.entries(this.MESSAGE_PATTERNS) ) {

      // For multi-line matches, the first line must match
      if ( this.MULTILINE_COMMANDS.has(rule) ) {
        const lines = message.split("\n");
        if ( rgx.test(lines[0]) ) return [rule, lines.map(l => l.match(rgx))];
      }

      // For single-line matches, match directly
      else {
        const match = message.match(rgx);
        if ( match ) return [rule, match];
      }
    }
    return ["none", [message, "", message]];
  }

  /* -------------------------------------------- */

  /**
   * Post a single chat message to the log
   * @param {ChatMessage} message   A ChatMessage document instance to post to the log
   * @param {object} [options={}]   Additional options for how the message is posted to the log
   * @param {string} [options.before] An existing message ID to append the message before, by default the new message is
   *                                  appended to the end of the log.
   * @param {boolean} [options.notify] Trigger a notification which shows the log as having a new unread message.
   * @returns {Promise<void>}       A Promise which resolves once the message is posted
   */
  async postOne(message, {before, notify=false}={}) {
    if ( !message.visible ) return;
    message.logged = true;

    // Track internal flags
    if ( !this._lastId ) this._lastId = message.id; // Ensure that new messages don't result in batched scrolling
    if ( (message.whisper || []).includes(game.user.id) && !message.isRoll ) {
      this._lastWhisper = message;
    }

    // Render the message to the log
    const html = await message.getHTML();
    const log = this.element.find("#chat-log");

    // Append the message after some other one
    const existing = before ? this.element.find(`.message[data-message-id="${before}"]`) : [];
    if ( existing.length ) existing.before(html);

    // Otherwise, append the message to the bottom of the log
    else {
      log.append(html);
      if ( this.isAtBottom || (message.user._id === game.user._id) ) this.scrollBottom({waitImages: true});
    }

    // Post notification
    if ( notify ) this.notify(message);

    // Update popout tab
    if ( this._popout ) await this._popout.postOne(message, {before, notify: false});
    if ( this.popOut ) this.setPosition();
  }

  /* -------------------------------------------- */

  /**
   * Scroll the chat log to the bottom
   * @param {object} [options]
   * @param {boolean} [options.popout=false]                 If a popout exists, scroll it to the bottom too.
   * @param {boolean} [options.waitImages=false]             Wait for any images embedded in the chat log to load first
   *                                                         before scrolling?
   * @param {ScrollIntoViewOptions} [options.scrollOptions]  Options to configure scrolling behaviour.
   */
  async scrollBottom({popout=false, waitImages=false, scrollOptions={}}={}) {
    if ( !this.rendered ) return;
    if ( waitImages ) await this._waitForImages();
    const log = this.element[0].querySelector("#chat-log");
    log.lastElementChild?.scrollIntoView(scrollOptions);
    if ( popout ) this._popout?.scrollBottom({waitImages, scrollOptions});
  }

  /* -------------------------------------------- */

  /**
   * Update the content of a previously posted message after its data has been replaced
   * @param {ChatMessage} message   The ChatMessage instance to update
   * @param {boolean} notify        Trigger a notification which shows the log as having a new unread message
   */
  async updateMessage(message, notify=false) {
    let li = this.element.find(`.message[data-message-id="${message.id}"]`);
    if ( li.length ) {
      const html = await message.getHTML();
      li.replaceWith(html);
    }

    // Add a newly visible message to the log
    else {
      const messages = game.messages.contents;
      const messageIndex = messages.findIndex(m => m === message);
      let nextMessage;
      for ( let i = messageIndex + 1; i < messages.length; i++ ) {
        if ( messages[i].visible ) {
          nextMessage = messages[i];
          break;
        }
      }
      await this.postOne(message, {before: nextMessage?.id, notify: false});
    }

    // Post notification of update
    if ( notify ) this.notify(message);

    // Update popout tab
    if ( this._popout ) await this._popout.updateMessage(message, false);
    if ( this.popOut ) this.setPosition();
  }

  /* -------------------------------------------- */

  /**
   * Update the displayed timestamps for every displayed message in the chat log.
   * Timestamps are displayed in a humanized "timesince" format.
   */
  updateTimestamps() {
    const messages = this.element.find("#chat-log .message");
    for ( let li of messages ) {
      const message = game.messages.get(li.dataset.messageId);
      if ( !message?.timestamp ) return;
      const stamp = li.querySelector(".message-timestamp");
      stamp.textContent = foundry.utils.timeSince(message.timestamp);
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers
  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {

    // Load new messages on scroll
    html.find("#chat-log").scroll(this._onScrollLog.bind(this));

    // Chat message entry
    this._onChatKeyDownBinding = this._onChatKeyDown.bind(this);
    html.find("#chat-message").keydown(this._onChatKeyDownBinding);

    // Expand dice roll tooltips
    html.on("click", ".dice-roll", this._onDiceRollClick.bind(this));

    // Modify Roll Type
    html.find('select[name="rollMode"]').change(this._onChangeRollMode.bind(this));

    // Single Message Delete
    html.on("click", "a.message-delete", this._onDeleteMessage.bind(this));

    // Flush log
    html.find("a.chat-flush").click(this._onFlushLog.bind(this));

    // Export log
    html.find("a.export-log").click(this._onExportLog.bind(this));

    // Jump to Bottom
    html.find(".jump-to-bottom > a").click(() => this.scrollBottom());

    // Content Link Dragging
    html[0].addEventListener("drop", ChatLog._onDropTextAreaData);

    // Chat Entry context menu
    this._contextMenu(html);
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping of transferred data onto the chat editor
   * @param {DragEvent} event     The originating drop event which triggered the data transfer
   * @private
   */
  static async _onDropTextAreaData(event) {
    event.preventDefault();
    const textarea = event.target;

    // Drop cross-linked content
    const eventData = TextEditor.getDragEventData(event);
    const link = await TextEditor.getContentLink(eventData);
    if ( link ) textarea.value += link;

    // Record pending text
    this._pendingText = textarea.value;
  }

  /* -------------------------------------------- */

  /**
   * Prepare the data object of chat message data depending on the type of message being posted
   * @param {string} message         The original string of the message content
   * @returns {Promise<Object|void>} The prepared chat data object, or void if we were executing a macro instead
   */
  async processMessage(message) {
    message = message.trim();
    if ( !message ) return;
    const cls = ChatMessage.implementation;

    // Set up basic chat data
    const chatData = {
      user: game.user.id,
      speaker: cls.getSpeaker()
    };

    if ( Hooks.call("chatMessage", this, message, chatData) === false ) return;

    // Parse the message to determine the matching handler
    let [command, match] = this.constructor.parse(message);

    // Special handlers for no command
    if ( command === "invalid" ) throw new Error(game.i18n.format("CHAT.InvalidCommand", {command: match[1]}));
    else if ( command === "none" ) command = chatData.speaker.token ? "ic" : "ooc";

    // Process message data based on the identified command type
    const createOptions = {};
    switch (command) {
      case "roll": case "gmroll": case "blindroll": case "selfroll": case "publicroll":
        await this._processDiceCommand(command, match, chatData, createOptions);
        break;
      case "whisper": case "reply": case "gm": case "players":
        this._processWhisperCommand(command, match, chatData, createOptions);
        break;
      case "ic": case "emote": case "ooc":
        this._processChatCommand(command, match, chatData, createOptions);
        break;
      case "macro":
        this._processMacroCommand(command, match);
        return;
    }

    // Create the message using provided data and options
    return cls.create(chatData, createOptions);
  }

  /* -------------------------------------------- */

  /**
   * Process messages which are posted using a dice-roll command
   * @param {string} command          The chat command type
   * @param {RegExpMatchArray[]} matches Multi-line matched roll expressions
   * @param {Object} chatData         The initial chat data
   * @param {Object} createOptions    Options used to create the message
   * @private
   */
  async _processDiceCommand(command, matches, chatData, createOptions) {
    const actor = ChatMessage.getSpeakerActor(chatData.speaker) || game.user.character;
    const rollData = actor ? actor.getRollData() : {};
    const rolls = [];
    for ( const match of matches ) {
      if ( !match ) continue;
      const [formula, flavor] = match.slice(2, 4);
      if ( flavor && !chatData.flavor ) chatData.flavor = flavor;
      const roll = Roll.create(formula, rollData);
      await roll.evaluate({async: true});
      rolls.push(roll);
    }
    chatData.type = CONST.CHAT_MESSAGE_TYPES.ROLL;
    chatData.rolls = rolls;
    chatData.sound = CONFIG.sounds.dice;
    chatData.content = rolls.reduce((t, r) => t + r.total, 0);
    createOptions.rollMode = command;
  }

  /* -------------------------------------------- */

  /**
   * Process messages which are posted using a chat whisper command
   * @param {string} command          The chat command type
   * @param {RegExpMatchArray} match  The matched RegExp expressions
   * @param {Object} chatData         The initial chat data
   * @param {Object} createOptions    Options used to create the message
   * @private
   */
  _processWhisperCommand(command, match, chatData, createOptions) {

    // Prepare whisper data
    chatData.type = CONST.CHAT_MESSAGE_TYPES.WHISPER;
    delete chatData.speaker;

    // Determine the recipient users
    let users = [];
    let message= "";
    switch(command) {
      case "whisper":
        message = match[3];
        const names = match[2].replace(/[\[\]]/g, "").split(",").map(n => n.trim());
        users = names.reduce((arr, n) => arr.concat(ChatMessage.getWhisperRecipients(n)), []);
        break;
      case "reply":
        message = match[2];
        const w = this._lastWhisper;
        if ( w ) {
          const group = new Set(w.data.whisper);
          group.add(w.data.user);
          group.delete(game.user.id);
          users = Array.from(group).map(id => game.users.get(id));
        }
        break;
      case "gm":
        message = match[2];
        users = ChatMessage.getWhisperRecipients("gm");
        break;
      case "players":
        message = match[2];
        users = ChatMessage.getWhisperRecipients("players");
        break;
    }

    // Add line break elements
    message = message.replace(/\n/g, "<br>");

    // Ensure we have valid whisper targets
    if ( !users.length ) throw new Error(game.i18n.localize("ERROR.NoTargetUsersForWhisper"));
    if ( users.some(u => !u.isGM) && !game.user.can("MESSAGE_WHISPER") ) {
      throw new Error(game.i18n.localize("ERROR.CantWhisper"));
    }

    // Update chat data
    chatData.whisper = users.map(u => u.id);
    chatData.content = message;
    chatData.sound = CONFIG.sounds.notification;
  }

  /* -------------------------------------------- */

  /**
   * Process messages which are posted using a chat whisper command
   * @param {string} command          The chat command type
   * @param {RegExpMatchArray} match  The matched RegExp expressions
   * @param {Object} chatData         The initial chat data
   * @param {Object} createOptions    Options used to create the message
   * @private
   */
  _processChatCommand(command, match, chatData, createOptions) {
    if ( ["ic", "emote"].includes(command) && !(chatData.speaker.actor || chatData.speaker.token) ) {
      throw new Error("You cannot chat in-character without an identified speaker");
    }
    chatData.content = match[2].replace(/\n/g, "<br>");

    // Augment chat data
    if ( command === "ic" ) {
      chatData.type = CONST.CHAT_MESSAGE_TYPES.IC;
      createOptions.chatBubble = true;
    } else if ( command === "emote" ) {
      chatData.type = CONST.CHAT_MESSAGE_TYPES.EMOTE;
      chatData.content = `${chatData.speaker.alias} ${chatData.content}`;
      createOptions.chatBubble = true;
    }
    else {
      chatData.type = CONST.CHAT_MESSAGE_TYPES.OOC;
      delete chatData.speaker;
    }
  }

  /* -------------------------------------------- */

  /**
   * Process messages which execute a macro.
   * @param {string} command  The chat command typed.
   * @param {RegExpMatchArray} match  The RegExp matches.
   * @private
   */
  _processMacroCommand(command, match) {

    // Parse the macro command with the form /macro {macroName} [param1=val1] [param2=val2] ...
    let [macroName, ...params] = match[2].split(" ");
    let expandName = true;
    const scope = {};
    for ( const p of params ) {
      const kv = p.split("=");
      if ( kv.length === 2 ) {
        scope[kv[0]] = kv[1];
        expandName = false;
      }
      else if ( expandName ) macroName += ` ${p}`; // Macro names may contain spaces
    }
    macroName = macroName.trimEnd(); // Eliminate trailing spaces

    // Get the target macro by number or by name
    let macro;
    if ( Number.isNumeric(macroName) ) {
      const macroID = game.user.hotbar[macroName];
      macro = game.macros.get(macroID);
    }
    if ( !macro ) macro = game.macros.getName(macroName);
    if ( !macro ) throw new Error(`Requested Macro "${macroName}" was not found as a named macro or hotbar position`);

    // Execute the Macro with provided scope
    return macro.execute(scope);
  }

  /* -------------------------------------------- */

  /**
   * Add a sent message to an array of remembered messages to be re-sent if the user pages up with the up arrow key
   * @param {string} message    The message text being remembered
   * @private
   */
  _remember(message) {
    if ( this._sentMessages.length === 5 ) this._sentMessages.splice(4, 1);
    this._sentMessages.unshift(message);
    this._sentMessageIndex = -1;
  }

  /* -------------------------------------------- */

  /**
   * Recall a previously sent message by incrementing up (1) or down (-1) through the sent messages array
   * @param {number} direction    The direction to recall, positive for older, negative for more recent
   * @return {string}             The recalled message, or an empty string
   * @private
   */
  _recall(direction) {
    if ( this._sentMessages.length > 0 ) {
      let idx = this._sentMessageIndex + direction;
      this._sentMessageIndex = Math.clamped(idx, -1, this._sentMessages.length-1);
    }
    return this._sentMessages[this._sentMessageIndex] || "";
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _contextMenu(html) {
    ContextMenu.create(this, html, ".message", this._getEntryContextOptions());
  }

  /* -------------------------------------------- */

  /**
   * Get the ChatLog entry context options
   * @return {object[]}   The ChatLog entry context options
   * @private
   */
  _getEntryContextOptions() {
    return [
      {
        name: "CHAT.PopoutMessage",
        icon: '<i class="fas fa-external-link-alt fa-rotate-180"></i>',
        condition: li => {
          const message = game.messages.get(li.data("messageId"));
          return message.getFlag("core", "canPopout") === true;
        },
        callback: li => {
          const message = game.messages.get(li.data("messageId"));
          new ChatPopout(message).render(true);
        }
      },
      {
        name: "CHAT.RevealMessage",
        icon: '<i class="fas fa-eye"></i>',
        condition: li => {
          const message = game.messages.get(li.data("messageId"));
          const isLimited = message.whisper.length || message.blind;
          return isLimited && (game.user.isGM || message.isAuthor) && message.isContentVisible;
        },
        callback: li => {
          const message = game.messages.get(li.data("messageId"));
          return message.update({whisper: [], blind: false});
        }
      },
      {
        name: "CHAT.ConcealMessage",
        icon: '<i class="fas fa-eye-slash"></i>',
        condition: li => {
          const message = game.messages.get(li.data("messageId"));
          const isLimited = message.whisper.length || message.blind;
          return !isLimited && (game.user.isGM || message.isAuthor) && message.isContentVisible;
        },
        callback: li => {
          const message = game.messages.get(li.data("messageId"));
          return message.update({whisper: ChatMessage.getWhisperRecipients("gm").map(u => u.id), blind: false});
        }
      },
      {
        name: "SIDEBAR.Delete",
        icon: '<i class="fas fa-trash"></i>',
        condition: li => {
          const message = game.messages.get(li.data("messageId"));
          return message.canUserModify(game.user, "delete");
        },
        callback: li => {
          const message = game.messages.get(li.data("messageId"));
          return message.delete();
        }
      }
    ];
  }

  /* -------------------------------------------- */

  /**
   * Handle keydown events in the chat entry textarea
   * @param {KeyboardEvent} event
   * @private
   */
  _onChatKeyDown(event) {
    const code = event.code;
    const textarea = event.currentTarget;

    if ( event.originalEvent.isComposing ) return; // Ignore IME composition

    // UP/DOWN ARROW -> Recall Previous Messages
    const isArrow = ["ArrowUp", "ArrowDown"].includes(code);
    if ( isArrow ) {
      if ( this._pendingText ) return;
      event.preventDefault();
      textarea.value = this._recall(code === "ArrowUp" ? 1 : -1);
      return;
    }

    // ENTER -> Send Message
    const isEnter = ( (code === "Enter") || (code === "NumpadEnter") ) && !event.shiftKey;
    if ( isEnter ) {
      event.preventDefault();
      const message = textarea.value;
      if (!message) return;
      this._pendingText = "";

      // Prepare chat message data and handle result
      return this.processMessage(message).then(() => {
        textarea.value = "";
        this._remember(message);
      }).catch(error => {
        ui.notifications.error(error);
        throw error;
      });
    }

    // BACKSPACE -> Remove pending text
    if ( event.key === "Backspace" ) {
      this._pendingText = this._pendingText.slice(0, -1);
      return
    }

    // Otherwise, record that there is pending text
    this._pendingText = textarea.value + (event.key.length === 1 ? event.key : "");
  }

  /* -------------------------------------------- */

  /**
   * Handle setting the preferred roll mode
   * @param {Event} event
   * @private
   */
  _onChangeRollMode(event) {
    event.preventDefault();
    game.settings.set("core", "rollMode", event.target.value);
  }

  /* -------------------------------------------- */

  /**
   * Handle single message deletion workflow
   * @param {Event} event
   * @private
   */
  _onDeleteMessage(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".message");
    const messageId = li.dataset.messageId;
    const message = game.messages.get(messageId);
    return message ? message.delete() : this.deleteMessage(messageId);
  }

  /* -------------------------------------------- */

  /**
   * Handle clicking of dice tooltip buttons
   * @param {Event} event
   * @private
   */
  _onDiceRollClick(event) {
    event.preventDefault();

    // Toggle the message flag
    let roll = event.currentTarget;
    const message = game.messages.get(roll.closest(".message").dataset.messageId);
    message._rollExpanded = !message._rollExpanded;

    // Expand or collapse tooltips
    const tooltips = roll.querySelectorAll(".dice-tooltip");
    for ( let tip of tooltips ) {
      if ( message._rollExpanded ) $(tip).slideDown(200);
      else $(tip).slideUp(200);
      tip.classList.toggle("expanded", message._rollExpanded);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle click events to export the chat log
   * @param {Event} event
   * @private
   */
  _onExportLog(event) {
    event.preventDefault();
    game.messages.export();
  }

  /* -------------------------------------------- */

  /**
   * Handle click events to flush the chat log
   * @param {Event} event
   * @private
   */
  _onFlushLog(event) {
    event.preventDefault();
    game.messages.flush(this.#jumpToBottomElement);
  }

  /* -------------------------------------------- */

  /**
   * Handle scroll events within the chat log container
   * @param {UIEvent} event   The initial scroll event
   * @private
   */
  _onScrollLog(event) {
    if ( !this.rendered ) return;
    const log = event.target;
    const pct = log.scrollTop / (log.scrollHeight - log.clientHeight);
    if ( !this.#jumpToBottomElement ) this.#jumpToBottomElement = this.element.find(".jump-to-bottom")[0];
    this.#isAtBottom = pct > 0.99;
    this.#jumpToBottomElement.classList.toggle("hidden", this.#isAtBottom);
    if ( pct < 0.01 ) return this._renderBatch(this.element, CONFIG.ChatMessage.batchSize);
  }

  /* -------------------------------------------- */

  /**
   * Update roll mode select dropdowns when the setting is changed
   * @param {string} mode     The new roll mode setting
   */
  static _setRollMode(mode) {
    for ( let select of $(".roll-type-select") ) {
      for ( let option of select.options ) {
        option.selected = option.value === mode;
      }
    }
  }
}
