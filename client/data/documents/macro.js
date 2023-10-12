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
   * @param {object} [scope={}]     Macro execution scope which is passed to script macros
   * @param {Actor} [scope.actor]     An Actor who is the protagonist of the executed action
   * @param {Token} [scope.token]     A Token which is the protagonist of the executed action
   * @returns {ChatMessage|*}       A created ChatMessage from chat macros or returned value from script macros
   */
  execute(scope={}) {
    if ( !this.canExecute ) {
      return ui.notifications.warn(`You do not have permission to execute Macro "${this.name}".`);
    }
    switch ( this.type ) {
      case "chat":
        return this.#executeChat();
      case "script":
        if ( foundry.utils.getType(scope) !== "Object" ) {
          throw new Error("Invalid scope parameter passed to Macro#execute which must be an object");
        }
        return this.#executeScript(scope);
    }
  }

  /* -------------------------------------------- */

  /**
   * Execute the command as a chat macro.
   * Chat macros simulate the process of the command being entered into the Chat Log input textarea.
   */
  #executeChat() {
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
   * @param {object} [scope={}]     Macro execution scope which is passed to script macros
   * @param {Actor} [scope.actor]     An Actor who is the protagonist of the executed action
   * @param {Token} [scope.token]     A Token which is the protagonist of the executed action
   */
  #executeScript({actor, token, ...scope}={}) {

    // Add variables to the evaluation scope
    const speaker = ChatMessage.implementation.getSpeaker({actor, token});
    const character = game.user.character;
    token = token || (canvas.ready ? canvas.tokens.get(speaker.token) : null);
    actor = actor || token?.actor || game.actors.get(speaker.actor);

    // Unpack argument names and values
    const argNames = Object.keys(scope);
    if ( argNames.some(k => Number.isNumeric(k)) ) {
      throw new Error("Illegal numeric Macro parameter passed to execution scope.");
    }
    const argValues = Object.values(scope);

    // Define an AsyncFunction that wraps the macro content
    const AsyncFunction = (async function() {}).constructor;
    // eslint-disable-next-line no-new-func
    const fn = new AsyncFunction("speaker", "actor", "token", "character", "scope", ...argNames, `{${this.command}\n}`);

    // Attempt macro execution
    try {
      return fn.call(this, speaker, actor, token, character, scope, ...argValues);
    } catch(err) {
      ui.notifications.error("MACRO.Error", { localize: true });
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickDocumentLink(event) {
    return this.execute();
  }
}
