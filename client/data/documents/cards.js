/**
 * The client-side Cards document which extends the common BaseCards model.
 * Each Cards document contains CardsData which defines its data schema.
 * @extends documents.BaseCards
 * @mixes ClientDocumentMixin
 *
 * @see {@link CardStacks}                        The world-level collection of Cards documents
 * @see {@link CardsConfig}                       The Cards configuration application
 */
class Cards extends ClientDocumentMixin(foundry.documents.BaseCards) {

  /**
   * Provide a thumbnail image path used to represent this document.
   * @type {string}
   */
  get thumbnail() {
    return this.img;
  }

  /**
   * The Card documents within this stack which are available to be drawn.
   * @type {Card[]}
   */
  get availableCards() {
    return this.cards.filter(c => (this.type !== "deck") || !c.drawn);
  }

  /**
   * The Card documents which belong to this stack but have already been drawn.
   * @type {Card[]}
   */
  get drawnCards() {
    return this.cards.filter(c => c.drawn);
  }

  /**
   * Returns the localized Label for the type of Card Stack this is
   * @type {string}
   */
  get typeLabel() {
    switch ( this.type ) {
      case "deck": return game.i18n.localize("CARDS.TypeDeck");
      case "hand": return game.i18n.localize("CARDS.TypeHand");
      case "pile": return game.i18n.localize("CARDS.TypePile");
      default: throw new Error(`Unexpected type ${this.type}`);
    }
  }

  /**
   * Can this Cards document be cloned in a duplicate workflow?
   * @type {boolean}
   */
  get canClone() {
    if ( this.type === "deck" ) return true;
    else return this.cards.size === 0;
  }

  /* -------------------------------------------- */
  /*  API Methods                                 */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static async createDocuments(data=[], context={}) {
    if ( context.keepEmbeddedIds === undefined ) context.keepEmbeddedIds = false;
    return super.createDocuments(data, context);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);
    for ( const card of this.cards ) {
      card.updateSource({drawn: false});
    }
  }

  /* -------------------------------------------- */

  /**
   * Deal one or more cards from this Cards document to each of a provided array of Cards destinations.
   * Cards are allocated from the top of the deck in cyclical order until the required number of Cards have been dealt.
   * @param {Cards[]} to              An array of other Cards documents to which cards are dealt
   * @param {number} [number=1]       The number of cards to deal to each other document
   * @param {object} [options={}]     Options which modify how the deal operation is performed
   * @param {number} [options.how=0]          How to draw, a value from CONST.CARD_DRAW_MODES
   * @param {object} [options.updateData={}]  Modifications to make to each Card as part of the deal operation,
   *                                          for example the displayed face
   * @param {string} [options.action=deal]    The name of the action being performed, used as part of the dispatched
   *                                          Hook event
   * @param {boolean} [options.chatNotification=true] Create a ChatMessage which notifies that this action has occurred
   * @returns {Promise<Cards>}        This Cards document after the deal operation has completed
   */
  async deal(to, number=1, {action="deal", how=0, updateData={}, chatNotification=true}={}) {

    // Validate the request
    if ( !to.every(d => d instanceof Cards) ) {
      throw new Error("You must provide an array of Cards documents as the destinations for the Cards#deal operation");
    }

    // Draw from the sorted stack
    const total = number * to.length;
    const drawn = this._drawCards(total, how);

    // Allocate cards to each destination
    const toCreate = to.map(() => []);
    const toUpdate = [];
    const toDelete = [];
    for ( let i=0; i<total; i++ ) {
      const n = i % to.length;
      const card = drawn[i];
      const createData = foundry.utils.mergeObject(card.toObject(), updateData);
      if ( card.isHome || !createData.origin ) createData.origin = this.id;
      createData.drawn = true;
      toCreate[n].push(createData);
      if ( card.isHome ) toUpdate.push({_id: card.id, drawn: true});
      else toDelete.push(card.id);
    }

    const allowed = Hooks.call("dealCards", this, to, {
      action: action,
      toCreate: toCreate,
      fromUpdate: toUpdate,
      fromDelete: toDelete
    });
    if ( allowed === false ) {
      console.debug(`${vtt} | The Cards#deal operation was prevented by a hooked function`);
      return this;
    }

    // Perform database operations
    const promises = to.map((cards, i) => {
      return cards.createEmbeddedDocuments("Card", toCreate[i], {keepId: true});
    });
    promises.push(this.updateEmbeddedDocuments("Card", toUpdate));
    promises.push(this.deleteEmbeddedDocuments("Card", toDelete));
    await Promise.all(promises);

    // Dispatch chat notification
    if ( chatNotification ) {
      const chatActions = {
        deal: "CARDS.NotifyDeal",
        pass: "CARDS.NotifyPass"
      };
      this._postChatNotification(this, chatActions[action], {number, link: to.map(t => t.link).join(", ")});
    }
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Pass an array of specific Card documents from this document to some other Cards stack.
   * @param {Cards} to                Some other Cards document that is the destination for the pass operation
   * @param {string[]} ids            The embedded Card ids which should be passed
   * @param {object} [options={}]     Additional options which modify the pass operation
   * @param {object} [options.updateData={}]  Modifications to make to each Card as part of the pass operation,
   *                                          for example the displayed face
   * @param {string} [options.action=pass]    The name of the action being performed, used as part of the dispatched
   *                                          Hook event
   * @param {boolean} [options.chatNotification=true] Create a ChatMessage which notifies that this action has occurred
   * @returns {Promise<Card[]>}       An array of the Card embedded documents created within the destination stack
   */
  async pass(to, ids, {updateData={}, action="pass", chatNotification=true}={}) {
    if ( !(to instanceof Cards) ) {
      throw new Error("You must provide a Cards document as the recipient for the Cards#pass operation");
    }

    // Allocate cards to different required operations
    const toCreate = [];
    const toUpdate = [];
    const fromUpdate = [];
    const fromDelete = [];

    // Validate the provided cards
    for ( let id of ids ) {
      const card = this.cards.get(id, {strict: true});

      // Prevent drawing cards from decks multiple times
      if ( (this.type === "deck") && card.isHome && card.drawn ) {
        throw new Error(`You may not pass Card ${id} which has already been drawn`);
      }

      // Return drawn cards to their origin deck
      if ( card.origin === to ) {
        toUpdate.push({_id: card.id, drawn: false});
      }

      // Create cards in a new destination
      else {
        const createData = foundry.utils.mergeObject(card.toObject(), updateData);
        const copyCard = card.isHome && (to.type === "deck");
        if ( copyCard ) createData.origin = to.id;
        else if ( card.isHome || !createData.origin ) createData.origin = this.id;
        if ( !copyCard ) createData.drawn = true;
        toCreate.push(createData);
      }

      // Update cards in their home deck
      if ( card.isHome && (to.type !== "deck") ) fromUpdate.push({_id: card.id, drawn: true});

      // Remove cards from their current stack
      else if ( !card.isHome ) fromDelete.push(card.id);
    }

    const allowed = Hooks.call("passCards", this, to, {action, toCreate, toUpdate, fromUpdate, fromDelete});
    if ( allowed === false ) {
      console.debug(`${vtt} | The Cards#pass operation was prevented by a hooked function`);
      return [];
    }

    // Perform database operations
    const created = to.createEmbeddedDocuments("Card", toCreate, {keepId: true});
    await Promise.all([
      created,
      to.updateEmbeddedDocuments("Card", toUpdate),
      this.updateEmbeddedDocuments("Card", fromUpdate),
      this.deleteEmbeddedDocuments("Card", fromDelete)
    ]);

    // Dispatch chat notification
    if ( chatNotification ) {
      const chatActions = {
        pass: "CARDS.NotifyPass",
        play: "CARDS.NotifyPlay",
        discard: "CARDS.NotifyDiscard",
        draw: "CARDS.NotifyDraw"
      };
      const chatFrom = action === "draw" ? to : this;
      const chatTo = action === "draw" ? this : to;
      this._postChatNotification(chatFrom, chatActions[action], {number: ids.length, link: chatTo.link});
    }
    return created;
  }

  /* -------------------------------------------- */

  /**
   * Draw one or more cards from some other Cards document.
   * @param {Cards} from              Some other Cards document from which to draw
   * @param {number} [number=1]       The number of cards to draw
   * @param {object} [options={}]     Options which modify how the draw operation is performed
   * @param {number} [options.how=0]          How to draw, a value from CONST.CARD_DRAW_MODES
   * @param {object} [options.updateData={}]  Modifications to make to each Card as part of the draw operation,
   *                                          for example the displayed face
   * @returns {Promise<Card[]>}       An array of the Card documents which were drawn
   */
  async draw(from, number=1, {how=0, updateData={}, ...options}={}) {
    if ( !(from instanceof Cards) || (from === this) ) {
      throw new Error("You must provide some other Cards document as the source for the Cards#draw operation");
    }
    const toDraw = from._drawCards(number, how);
    return from.pass(this, toDraw.map(c => c.id), {updateData, action: "draw", ...options});
  }

  /* -------------------------------------------- */

  /**
   * Shuffle this Cards stack, randomizing the sort order of all the cards it contains.
   * @param {object} [options={}]     Options which modify how the shuffle operation is performed.
   * @param {object} [options.updateData={}]  Modifications to make to each Card as part of the shuffle operation,
   *                                          for example the displayed face.
   * @param {boolean} [options.chatNotification=true] Create a ChatMessage which notifies that this action has occurred
   * @returns {Promise<Cards>}        The Cards document after the shuffle operation has completed
   */
  async shuffle({updateData={}, chatNotification=true}={}) {
    const order = this.cards.map(c => [twist.random(), c]);
    order.sort((a, b) => a[0] - b[0]);
    const toUpdate = order.map((x, i) => {
      const card = x[1];
      return foundry.utils.mergeObject({_id: card.id, sort: i}, updateData);
    });

    // Post a chat notification and return
    await this.updateEmbeddedDocuments("Card", toUpdate);
    if ( chatNotification ) {
      this._postChatNotification(this, "CARDS.NotifyShuffle", {link: this.link});
    }
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Recall the Cards stack, retrieving all original cards from other stacks where they may have been drawn if this is a
   * deck, otherwise returning all the cards in this stack to the decks where they originated.
   * @param {object} [options={}]             Options which modify the recall operation
   * @param {object} [options.updateData={}]  Modifications to make to each Card as part of the recall operation,
   *                                          for example the displayed face
   * @param {boolean} [options.chatNotification=true] Create a ChatMessage which notifies that this action has occurred
   * @returns {Promise<Cards>}                The Cards document after the recall operation has completed.
   */
  async recall(options) {
    if ( this.type === "deck" ) return this._resetDeck(options);
    return this._resetStack(options);
  }

  /* -------------------------------------------- */

  /**
   * Perform a reset operation for a deck, retrieving all original cards from other stacks where they may have been
   * drawn.
   * @param {object} [options={}]              Options which modify the reset operation.
   * @param {object} [options.updateData={}]           Modifications to make to each Card as part of the reset operation
   * @param {boolean} [options.chatNotification=true]  Create a ChatMessage which notifies that this action has occurred
   * @returns {Promise<Cards>}                 The Cards document after the reset operation has completed.
   * @private
   */
  async _resetDeck({updateData={}, chatNotification=true}={}) {

    // Recover all cards which belong to this stack
    for ( let cards of game.cards ) {
      if ( cards === this ) continue;
      const toDelete = [];
      for ( let c of cards.cards ) {
        if ( c.origin === this ) {
          toDelete.push(c.id);
        }
      }
      if ( toDelete.length ) await cards.deleteEmbeddedDocuments("Card", toDelete);
    }

    // Mark all cards as not drawn
    const cards = this.cards.contents;
    cards.sort(this.sortStandard.bind(this));
    const toUpdate = cards.map(card => {
      return foundry.utils.mergeObject({_id: card.id, drawn: false}, updateData);
    });

    // Post a chat notification and return
    await this.updateEmbeddedDocuments("Card", toUpdate);
    if ( chatNotification ) {
      this._postChatNotification(this, "CARDS.NotifyReset", {link: this.link});
    }
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Return all cards in this stack to their original decks.
   * @param {object} [options={}]              Options which modify the return operation.
   * @param {object} [options.updateData={}]          Modifications to make to each Card as part of the return operation
   * @param {boolean} [options.chatNotification=true] Create a ChatMessage which notifies that this action has occurred
   * @returns {Promise<Cards>}                 The Cards document after the return operation has completed.
   * @private
   */
  async _resetStack({updateData={}, chatNotification=true}={}) {

    // Allocate cards to different required operations.
    const toUpdate = {};
    const fromDelete = [];
    for ( const card of this.cards ) {
      if ( card.isHome || !card.origin ) continue;

      // Return drawn cards to their origin deck.
      if ( !toUpdate[card.origin.id] ) toUpdate[card.origin.id] = [];
      const update = foundry.utils.mergeObject(updateData, {_id: card.id, drawn: false}, {inplace: false});
      toUpdate[card.origin.id].push(update);

      // Remove cards from the current stack.
      fromDelete.push(card.id);
    }

    const allowed = Hooks.call("returnCards", this, fromDelete.map(id => this.cards.get(id)), {toUpdate, fromDelete});
    if ( allowed === false ) {
      console.debug(`${vtt} | The Cards#return operation was prevented by a hooked function.`);
      return this;
    }

    // Perform database operations.
    const updates = Object.entries(toUpdate).map(([origin, u]) => {
      return game.cards.get(origin).updateEmbeddedDocuments("Card", u);
    });
    await Promise.all([...updates, this.deleteEmbeddedDocuments("Card", fromDelete)]);

    // Dispatch chat notification
    if ( chatNotification ) this._postChatNotification(this, "CARDS.NotifyReturn", {link: this.link});
    return this;
  }

  /* -------------------------------------------- */

  /**
   * A sorting function that is used to determine the standard order of Card documents within an un-shuffled stack.
   * @param {Card} a     The card being sorted
   * @param {Card} b     Another card being sorted against
   * @returns {number}
   * @protected
   */
  sortStandard(a, b) {
    if ( a.suit === b.suit ) return a.value - b.value;
    return a.suit.localeCompare(b.suit);
  }

  /* -------------------------------------------- */

  /**
   * A sorting function that is used to determine the order of Card documents within a shuffled stack.
   * @param {Card} a     The card being sorted
   * @param {Card} b     Another card being sorted against
   * @returns {number}
   * @protected
   */
  sortShuffled(a, b) {
    return a.sort - b.sort;
  }

  /* -------------------------------------------- */

  /**
   * An internal helper method for drawing a certain number of Card documents from this Cards stack.
   * @param {number} number       The number of cards to draw
   * @param {number} how          A draw mode from CONST.CARD_DRAW_MODES
   * @returns {Card[]}            An array of drawn Card documents
   * @protected
   */
  _drawCards(number, how) {

    // Confirm that sufficient cards are available
    let available = this.availableCards;
    if ( available.length < number ) {
      throw new Error(`There are not ${number} available cards remaining in Cards [${this.id}]`);
    }

    // Draw from the stack
    let drawn;
    switch ( how ) {
      case CONST.CARD_DRAW_MODES.FIRST:
        available.sort(this.sortShuffled.bind(this));
        drawn = available.slice(0, number);
        break;
      case CONST.CARD_DRAW_MODES.LAST:
        available.sort(this.sortShuffled.bind(this));
        drawn = available.slice(-number);
        break;
      case CONST.CARD_DRAW_MODES.RANDOM:
        const shuffle = available.map(c => [Math.random(), c]);
        shuffle.sort((a, b) => a[0] - b[0]);
        drawn = shuffle.slice(-number).map(x => x[1]);
        break;
    }
    return drawn;
  }

  /* -------------------------------------------- */

  /**
   * Create a ChatMessage which provides a notification of the operation which was just performed.
   * Visibility of the resulting message is linked to the default roll mode selected in the chat log dropdown.
   * @param {Cards} source        The source Cards document from which the action originated
   * @param {string} action       The localization key which formats the chat message notification
   * @param {object} context      Data passed to the Localization#format method for the localization key
   * @returns {ChatMessage}       A created ChatMessage document
   * @private
   */
  _postChatNotification(source, action, context) {
    const messageData = {
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      speaker: {user: game.user},
      content: `
      <div class="cards-notification flexrow">
        <img class="icon" src="${source.thumbnail}" alt="${source.name}">
        <p>${game.i18n.format(action, context)}</p>
      </div>`
    };
    ChatMessage.applyRollMode(messageData, game.settings.get("core", "rollMode"));
    return ChatMessage.implementation.create(messageData);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data, options, userId) {
    if ( "type" in data ) {
      this.sheet?.close();
      this._sheet = undefined;
    }
    super._onUpdate(data, options, userId);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _preDelete(options, user) {
    await this.recall();
    return super._preDelete(options, user);
  }

  /* -------------------------------------------- */
  /*  Interaction Dialogs                         */
  /* -------------------------------------------- */

  /**
   * Display a dialog which prompts the user to deal cards to some number of hand-type Cards documents.
   * @see {@link Cards#deal}
   * @returns {Promise<Cards|null>}
   */
  async dealDialog() {
    const hands = game.cards.filter(c => (c.type !== "deck") && c.testUserPermission(game.user, "LIMITED"));
    if ( !hands.length ) return ui.notifications.warn("CARDS.DealWarnNoTargets", {localize: true});

    // Construct the dialog HTML
    const html = await renderTemplate("templates/cards/dialog-deal.html", {
      hands: hands,
      modes: {
        [CONST.CARD_DRAW_MODES.TOP]: "CARDS.DrawModeTop",
        [CONST.CARD_DRAW_MODES.BOTTOM]: "CARDS.DrawModeBottom",
        [CONST.CARD_DRAW_MODES.RANDOM]: "CARDS.DrawModeRandom"
      }
    });

    // Display the prompt
    return Dialog.prompt({
      title: game.i18n.localize("CARDS.DealTitle"),
      label: game.i18n.localize("CARDS.Deal"),
      content: html,
      callback: html => {
        const form = html.querySelector("form.cards-dialog");
        const fd = new FormDataExtended(form).object;
        if ( !fd.to ) return this;
        const toIds = fd.to instanceof Array ? fd.to : [fd.to];
        const to = toIds.reduce((arr, id) => {
          const c = game.cards.get(id);
          if ( c ) arr.push(c);
          return arr;
        }, []);
        const options = {how: fd.how, updateData: fd.down ? {face: null} : {}};
        return this.deal(to, fd.number, options).catch(err => {
          ui.notifications.error(err.message);
          return this;
        });
      },
      rejectClose: false,
      options: {jQuery: false}
    });
  }

  /* -------------------------------------------- */

  /**
   * Display a dialog which prompts the user to draw cards from some other deck-type Cards documents.
   * @see {@link Cards#draw}
   * @returns {Promise<Card[]|null>}
   */
  async drawDialog() {
    const decks = game.cards.filter(c => (c.type === "deck") && c.testUserPermission(game.user, "LIMITED"));
    if ( !decks.length ) return ui.notifications.warn("CARDS.DrawWarnNoSources", {localize: true});

    // Construct the dialog HTML
    const html = await renderTemplate("templates/cards/dialog-draw.html", {
      decks: decks,
      modes: {
        [CONST.CARD_DRAW_MODES.TOP]: "CARDS.DrawModeTop",
        [CONST.CARD_DRAW_MODES.BOTTOM]: "CARDS.DrawModeBottom",
        [CONST.CARD_DRAW_MODES.RANDOM]: "CARDS.DrawModeRandom"
      }
    });

    // Display the prompt
    return Dialog.prompt({
      title: game.i18n.localize("CARDS.DrawTitle"),
      label: game.i18n.localize("CARDS.Draw"),
      content: html,
      callback: html => {
        const form = html.querySelector("form.cards-dialog");
        const fd = new FormDataExtended(form).object;
        const from = game.cards.get(fd.from);
        const options = {how: fd.how, updateData: fd.down ? {face: null} : {}};
        return this.draw(from, fd.number, options).catch(err => {
          ui.notifications.error(err.message);
          return [];
        });
      },
      rejectClose: false,
      options: {jQuery: false}
    });
  }

  /* -------------------------------------------- */

  /**
   * Display a dialog which prompts the user to pass cards from this document to some other Cards document.
   * @see {@link Cards#deal}
   * @returns {Promise<Cards|null>}
   */
  async passDialog() {
    const cards = game.cards.filter(c => (c !== this) && (c.type !== "deck") && c.testUserPermission(game.user, "LIMITED"));
    if ( !cards.length ) return ui.notifications.warn("CARDS.PassWarnNoTargets", {localize: true});

    // Construct the dialog HTML
    const html = await renderTemplate("templates/cards/dialog-pass.html", {
      cards: cards,
      modes: {
        [CONST.CARD_DRAW_MODES.TOP]: "CARDS.DrawModeTop",
        [CONST.CARD_DRAW_MODES.BOTTOM]: "CARDS.DrawModeBottom",
        [CONST.CARD_DRAW_MODES.RANDOM]: "CARDS.DrawModeRandom"
      }
    });

    // Display the prompt
    return Dialog.prompt({
      title: game.i18n.localize("CARDS.PassTitle"),
      label: game.i18n.localize("CARDS.Pass"),
      content: html,
      callback: html => {
        const form = html.querySelector("form.cards-dialog");
        const fd = new FormDataExtended(form).object;
        const to = game.cards.get(fd.to);
        const options = {action: "pass", how: fd.how, updateData: fd.down ? {face: null} : {}};
        return this.deal([to], fd.number, options).catch(err => {
          ui.notifications.error(err.message);
          return this;
        });
      },
      rejectClose: false,
      options: {jQuery: false}
    });
  }

  /* -------------------------------------------- */

  /**
   * Display a dialog which prompts the user to play a specific Card to some other Cards document
   * @see {@link Cards#pass}
   * @param {Card} card     The specific card being played as part of this dialog
   * @returns {Promise<Card[]|null>}
   */
  async playDialog(card) {
    const cards = game.cards.filter(c => (c !== this) && (c.type !== "deck") && c.testUserPermission(game.user, "LIMITED"));
    if ( !cards.length ) return ui.notifications.warn("CARDS.PassWarnNoTargets", {localize: true});

    // Construct the dialog HTML
    const html = await renderTemplate("templates/cards/dialog-play.html", {card, cards});

    // Display the prompt
    return Dialog.prompt({
      title: game.i18n.localize("CARD.Play"),
      label: game.i18n.localize("CARD.Play"),
      content: html,
      callback: html => {
        const form = html.querySelector("form.cards-dialog");
        const fd = new FormDataExtended(form).object;
        const to = game.cards.get(fd.to);
        const options = {action: "play", updateData: fd.down ? {face: null} : {}};
        return this.pass(to, [card.id], options).catch(err => {
          return ui.notifications.error(err.message);
        });
      },
      rejectClose: false,
      options: {jQuery: false}
    });
  }

  /* -------------------------------------------- */

  /**
   * Display a confirmation dialog for whether or not the user wishes to reset a Cards stack
   * @see {@link Cards#recall}
   * @returns {Promise<Cards|false|null>}
   */
  async resetDialog() {
    return Dialog.confirm({
      title: game.i18n.localize("CARDS.Reset"),
      content: `<p>${game.i18n.format(`CARDS.${this.type === "deck" ? "Reset" : "Return"}Confirm`, {name: this.name})}</p>`,
      yes: () => this.recall()
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async deleteDialog(options={}) {
    if ( !this.drawnCards.length ) return super.deleteDialog(options);
    const type = this.typeLabel;
    return new Promise(resolve => {
      const dialog = new Dialog({
        title: `${game.i18n.format("DOCUMENT.Delete", {type})}: ${this.name}`,
        content: `
          <h4>${game.i18n.localize("CARDS.DeleteCannot")}</h4>
          <p>${game.i18n.format("CARDS.DeleteMustReset", {type})}</p>
        `,
        buttons: {
          reset: {
            icon: '<i class="fas fa-undo"></i>',
            label: game.i18n.localize("CARDS.DeleteReset"),
            callback: () => resolve(this.delete())
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("Cancel"),
            callback: () => resolve(false)
          }
        },
        close: () => resolve(null),
        default: "reset"
      }, options);
      dialog.render(true);
    });
  }

  /* -------------------------------------------- */

  /** @override */
  static async createDialog(data={}, {parent=null, pack=null, ...options}={}) {

    // Collect data
    const types = game.documentTypes[this.documentName].filter(t => t !== CONST.BASE_DOCUMENT_TYPE);
    const folders = parent ? [] : game.cards._formatFolderSelectOptions();
    const label = game.i18n.localize(this.metadata.label);
    const title = game.i18n.format("DOCUMENT.Create", {type: label});

    // Render the document creation form
    const html = await renderTemplate("templates/sidebar/cards-create.html", {
      folders,
      name: data.name || game.i18n.format("DOCUMENT.New", {type: label}),
      folder: data.folder,
      hasFolders: folders.length >= 1,
      type: data.type || types[0],
      types: types.reduce((obj, t) => {
        const label = CONFIG[this.documentName]?.typeLabels?.[t] ?? t;
        obj[t] = game.i18n.has(label) ? game.i18n.localize(label) : t;
        return obj;
      }, {}),
      hasTypes: types.length > 1,
      presets: CONFIG.Cards.presets
    });

    // Render the confirmation dialog window
    return Dialog.prompt({
      title: title,
      content: html,
      label: title,
      callback: async html => {
        const form = html[0].querySelector("form");
        const fd = new FormDataExtended(form);
        foundry.utils.mergeObject(data, fd.object, {inplace: true});
        if ( !data.folder ) delete data.folder;
        if ( !data.name?.trim() ) data.name = this.defaultName();
        const preset = CONFIG.Cards.presets[data.preset];
        if ( preset && (preset.type === data.type) ) {
          const presetData = await fetch(preset.src).then(r => r.json());
          data = foundry.utils.mergeObject(presetData, data);
        }
        return this.create(data, {parent, pack, renderSheet: true});
      },
      rejectClose: false,
      options
    });
  }
}
