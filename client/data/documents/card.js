/**
 * The client-side Card document which extends the common BaseCard document model.
 * @extends documents.BaseCard
 * @mixes ClientDocumentMixin
 *
 * @see {@link Cards}                    The Cards document type which contains Card embedded documents
 * @see {@link CardConfig}               The Card configuration application
 */
class Card extends ClientDocumentMixin(foundry.documents.BaseCard) {

  /**
   * The current card face
   * @type {CardFaceData|null}
   */
  get currentFace() {
    if ( this.face === null ) return null;
    const n = Math.clamped(this.face, 0, this.faces.length-1);
    return this.faces[n] || null;
  }

  /**
   * The image of the currently displayed card face or back
   * @type {string}
   */
  get img() {
    return this.currentFace?.img || this.back.img || Card.DEFAULT_ICON;
  }

  /**
   * A reference to the source Cards document which defines this Card.
   * @type {Cards|null}
   */
  get source() {
    return this.parent?.type === "deck" ? this.parent : this.origin;
  }

  /**
   * A convenience property for whether the Card is within its source Cards stack. Cards in decks are always
   * considered home.
   * @type {boolean}
   */
  get isHome() {
    return (this.parent?.type === "deck") || (this.origin === this.parent);
  }

  /**
   * Whether to display the face of this card?
   * @type {boolean}
   */
  get showFace() {
    return this.faces[this.face] !== undefined;
  }

  /**
   * Does this Card have a next face available to flip to?
   * @type {boolean}
   */
  get hasNextFace() {
    return (this.face === null) || (this.face < this.faces.length - 1);
  }

  /**
   * Does this Card have a previous face available to flip to?
   * @type {boolean}
   */
  get hasPreviousFace() {
    return this.face !== null;
  }

  /* -------------------------------------------- */
  /*  Core Methods                                */
  /* -------------------------------------------- */

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.back.img ||= this.source.img || Card.DEFAULT_ICON;
    this.name = (this.showFace ? (this.currentFace.name || this._source.name) : this.back.name)
      || game.i18n.format("CARD.Unknown", {source: this.source.name});
  }

  /* -------------------------------------------- */
  /*  API Methods                                 */
  /* -------------------------------------------- */

  /**
   * Flip this card to some other face. A specific face may be requested, otherwise:
   * If the card currently displays a face the card is flipped to the back.
   * If the card currently displays the back it is flipped to the first face.
   * @param {number|null} [face]      A specific face to flip the card to
   * @returns {Promise<Card>}         A reference to this card after the flip operation is complete
   */
  async flip(face) {

    // Flip to an explicit face
    if ( Number.isNumeric(face) || (face === null) ) return this.update({face});

    // Otherwise, flip to default
    return this.update({face: this.face === null ? 0 : null});
  }

  /* -------------------------------------------- */

  /**
   * Pass this Card to some other Cards document.
   * @param {Cards} to                A new Cards document this card should be passed to
   * @param {object} [options={}]     Options which modify the pass operation
   * @param {object} [options.updateData={}]  Modifications to make to the Card as part of the pass operation,
   *                                  for example the displayed face
   * @returns {Promise<Card>}         A reference to this card after it has been passed to another parent document
   */
  async pass(to, {updateData={}, ...options}={}) {
    const created = await this.parent.pass(to, [this.id], {updateData, action: "pass", ...options});
    return created[0];
  }

  /* -------------------------------------------- */

  /**
   * @alias Card#pass
   * @see Card#pass
   * @inheritdoc
   */
  async play(to, {updateData={}, ...options}={}) {
    const created = await this.parent.pass(to, [this.id], {updateData, action: "play", ...options});
    return created[0];
  }

  /* -------------------------------------------- */

  /**
   * @alias Card#pass
   * @see Card#pass
   * @inheritdoc
   */
  async discard(to, {updateData={}, ...options}={}) {
    const created = await this.parent.pass(to, [this.id], {updateData, action: "discard", ...options});
    return created[0];
  }

  /* -------------------------------------------- */

  /**
   * Recall this Card to its original Cards parent.
   * @param {object} [options={}]   Options which modify the recall operation
   * @returns {Promise<Card>}       A reference to the recalled card belonging to its original parent
   */
  async recall(options={}) {

    // Mark the original card as no longer drawn
    const original = this.isHome ? this : this.source?.cards.get(this.id);
    if ( original ) await original.update({drawn: false});

    // Delete this card if it's not the original
    if ( !this.isHome ) await this.delete();
    return original;
  }

  /* -------------------------------------------- */

  /**
   * Create a chat message which displays this Card.
   * @param {object} [messageData={}] Additional data which becomes part of the created ChatMessageData
   * @param {object} [options={}]     Options which modify the message creation operation
   * @returns {Promise<ChatMessage>}  The created chat message
   */
  async toMessage(messageData={}, options={}) {
    messageData = foundry.utils.mergeObject({
      content: `<div class="card-draw flexrow">
        <img class="card-face" src="${this.img}" alt="${this.name}"/>
        <h4 class="card-name">${this.name}</h4>
      </div>`
    }, messageData);
    return ChatMessage.implementation.create(messageData, options);
  }
}
