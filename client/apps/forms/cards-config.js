/**
 * A DocumentSheet application responsible for displaying and editing a single Cards stack.
 */
class CardsConfig extends DocumentSheet {
  /**
   * The CardsConfig sheet is constructed by providing a Cards document and sheet-level options.
   * @param {Cards} object                    The {@link Cards} object being configured.
   * @param {DocumentSheetOptions} [options]  Application configuration options.
   */
  constructor(object, options) {
    super(object, options);
    this.options.classes.push(object.type);
  }

  /**
   * The allowed sorting methods which can be used for this sheet
   * @enum {string}
   */
  static SORT_TYPES = {
    STANDARD: "standard",
    SHUFFLED: "shuffled"
  };

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sheet", "cards-config"],
      template: "templates/cards/cards-deck.html",
      width: 620,
      height: "auto",
      closeOnSubmit: false,
      viewPermission: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
      dragDrop: [{dragSelector: "ol.cards li.card", dropSelector: "ol.cards"}],
      tabs: [{navSelector: ".tabs", contentSelector: "form", initial: "cards"}],
      scrollY: ["ol.cards"],
      sort: this.SORT_TYPES.SHUFFLED
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {

    // Sort cards
    const sortFn = {
      standard: this.object.sortStandard,
      shuffled: this.object.sortShuffled
    }[options?.sort || "standard"];
    const cards = this.object.cards.contents.sort((a, b) => sortFn.call(this.object, a, b));

    // Return rendering context
    return foundry.utils.mergeObject(super.getData(options), {
      cards: cards,
      types: CONFIG.Cards.typeLabels,
      inCompendium: !!this.object.pack
    });
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);

    // Card Actions
    html.find(".card-control").click(this._onCardControl.bind(this));

    // Intersection Observer
    const cards = html.find("ol.cards");
    const entries = cards.find("li.card");
    const observer = new IntersectionObserver(this._onLazyLoadImage.bind(this), {root: cards[0]});
    entries.each((i, li) => observer.observe(li));
  }

  /* -------------------------------------------- */

  /**
   * Handle card control actions which modify single cards on the sheet.
   * @param {PointerEvent} event          The originating click event
   * @returns {Promise}                   A Promise which resolves once the handler has completed
   * @protected
   */
  async _onCardControl(event) {
    const button = event.currentTarget;
    const li = button.closest(".card");
    const card = li ? this.object.cards.get(li.dataset.cardId) : null;
    const cls = getDocumentClass("Card");

    // Save any pending change to the form
    await this._onSubmit(event, {preventClose: true, preventRender: true});

    // Handle the control action
    switch ( button.dataset.action ) {
      case "create":
        return cls.createDialog({ faces: [{}], face: 0 }, {parent: this.object, pack: this.object.pack});
      case "edit":
        return card.sheet.render(true);
      case "delete":
        return card.deleteDialog();
      case "deal":
        return this.object.dealDialog();
      case "draw":
        return this.object.drawDialog();
      case "pass":
        return this.object.passDialog();
      case "play":
        return this.object.playDialog(card);
      case "reset":
        return this.object.resetDialog();
      case "shuffle":
        this.options.sort = this.constructor.SORT_TYPES.SHUFFLED;
        return this.object.shuffle();
      case "toggleSort":
        this.options.sort = {standard: "shuffled", shuffled: "standard"}[this.options.sort];
        return this.render();
      case "nextFace":
        return card.update({face: card.face === null ? 0 : card.face+1});
      case "prevFace":
        return card.update({face: card.face === 0 ? null : card.face-1});
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle lazy-loading card face images.
   * See {@link SidebarTab#_onLazyLoadImage}
   * @param {IntersectionObserverEntry[]} entries   The entries which are now in the observer frame
   * @param {IntersectionObserver} observer         The intersection observer instance
   * @protected
   */
  _onLazyLoadImage(entries, observer) {
    return ui.cards._onLazyLoadImage.call(this, entries, observer);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _canDragStart(selector) {
    return this.isEditable;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragStart(event) {
    const li = event.currentTarget;
    const card = this.object.cards.get(li.dataset.cardId);
    if ( !card ) return;

    // Set data transfer
    event.dataTransfer.setData("text/plain", JSON.stringify(card.toDragData()));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _canDragDrop(selector) {
    return this.isEditable;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    if ( data.type !== "Card" ) return;
    const card = await Card.implementation.fromDropData(data);
    if ( card.parent.id === this.object.id ) return this._onSortCard(event, card);
    try {
      return await card.pass(this.object);
    } catch(err) {
      Hooks.onError("CardsConfig#_onDrop", err, {log: "error", notify: "error"});
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle sorting a Card relative to other siblings within this document
   * @param {Event} event     The drag drop event
   * @param {Card} card       The card being dragged
   * @private
   */
  _onSortCard(event, card) {

    // Identify a specific card as the drop target
    let target = null;
    const li = event.target.closest("[data-card-id]");
    if ( li ) target = this.object.cards.get(li.dataset.cardId) ?? null;

    // Identify the set of siblings
    const siblings = this.object.cards.filter(c => c.id !== card.id);

    // Perform an integer-based sort
    const updateData = SortingHelpers.performIntegerSort(card, {target, siblings}).map(u => {
      return {_id: u.target.id, sort: u.update.sort};
    });
    return this.object.updateEmbeddedDocuments("Card", updateData);
  }
}

/**
 * A subclass of CardsConfig which provides a sheet representation for Cards documents with the "hand" type.
 */
class CardsHand extends CardsConfig {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "templates/cards/cards-hand.html"
    });
  }
}

/**
 * A subclass of CardsConfig which provides a sheet representation for Cards documents with the "pile" type.
 */
class CardsPile extends CardsConfig {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "templates/cards/cards-pile.html"
    });
  }
}
