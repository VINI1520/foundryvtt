/**
 * The client-side Macro document which extends the common BaseMacro model.
 * @extends documents.BaseMacro
 * @mixes ClientDocumentMixin
 *
 * @see {@link Macros}                       The world-level collection of Macro documents
 * @see {@link MacroConfig}                  The Macro configuration application
 */
class Macro extends ClientDocumentMixin(foundry.documents.BaseMacro) {

  /* -------------------------------------------- */
  /*  Model Properties                            */
  /* -------------------------------------------- */

  /**
   * Is the current User the author of this macro?
   * @type {boolean}
   */
  get isAuthor() {
    return game.user === this.author;
  }

  /* -------------------------------------------- */

  /**
   * Test whether the current user is capable of executing a Macro script
   * @type {boolean}
   */
  get canExecute() {
    if ( !this.testUserPermission(game.user, "LIMITED") ) return false;
    return this.type === "script" ? game.user.can("MACRO_SCRIPT") : true;
  }

  /* -------------------------------------------- */

  /**
   * Provide a thumbnail image path used to represent this document.
   * @type {string}
   */
  get thumbnail() {
    return this.img;
  }

  /* -------------------------------------------- */
  /*  Model Methods                               */
  /* -------------------------------------------- */

  /**
   * Execute the Macro command.
   * @param {object} [scope={}]     Provide some additional scope configuration for the Macro
   * @param {Actor} [scope.actor]   An Actor who is the protagonist of the executed action
   * @param {Token} [scope.token]   A Token which is the protagonist of the executed action
   */
  execute({actor, token}={}) {
    if ( !this.canExecute ) {
      return ui.notifications.warn(`You do not have permission to execute Macro "${this.name}".`);
    }
    switch ( this.type ) {
      case "chat":
        return this._executeChat();
      case "script":
        return this._executeScript({actor, token});
    }
  }

  /* -------------------------------------------- */

  /**
   * Execute the command as a chat macro.
   * Chat macros simulate the process of the command being entered into the Chat Log input textarea.
   * @private
   */
  _executeChat() {
    ui.chat.processMessage(this.command).catch(err => {
      Hooks.onError("Macro#_executeChat", err, {
        msg: "There was an error in your chat message syntax.",
        log: "error",
        notify: "error",
        command: this.command
      });
    });
  }

  /* -------------------------------------------- */

  /**
   * Execute the command as a script macro.
   * Script Macros are wrapped in an async IIFE to allow the use of asynchronous commands and await statements.
   * @param {object} [options={}]
   * @param {Actor} [options.actor]
   * @param {Token} [options.token]
   * @private
   */
  _executeScript({actor, token}={}) {

    // Add variables to the evaluation scope
    const speaker = ChatMessage.implementation.getSpeaker();
    const character = game.user.character;
    actor = actor || game.actors.get(speaker.actor);
    token = token || (canvas.ready ? canvas.tokens.get(speaker.token) : null);

    // Attempt script execution
    const AsyncFunction = (async function(){}).constructor;
    // eslint-disable-next-line no-new-func
    const fn = new AsyncFunction("speaker", "actor", "token", "character", this.command);
    try {
      return fn.call(this, speaker, actor, token, character);
    } catch(err) {
      ui.notifications.error("There was an error in your macro syntax. See the console (F12) for details");
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickDocumentLink(event) {
    return this.execute();
  }
}
