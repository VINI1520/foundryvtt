/**
 * The client-side Item document which extends the common BaseItem model.
 * @extends documents.BaseItem
 * @mixes ClientDocumentMixin
 *
 * @see {@link documents.Items}            The world-level collection of Item documents
 * @see {@link applications.ItemSheet}     The Item configuration application
 */
class Item extends ClientDocumentMixin(foundry.documents.BaseItem) {

  /**
   * A convenience alias of Item#parent which is more semantically intuitive
   * @type {Actor|null}
   */
  get actor() {
    return this.parent instanceof Actor ? this.parent : null;
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

  /**
   * A convenience alias of Item#isEmbedded which is preserves legacy support
   * @type {boolean}
   */
  get isOwned() {
    return this.isEmbedded;
  }

  /* -------------------------------------------- */

  /**
   * Return an array of the Active Effect instances which originated from this Item.
   * The returned instances are the ActiveEffect instances which exist on the Item itself.
   * @type {ActiveEffect[]}
   */
  get transferredEffects() {
    return this.effects.filter(e => e.transfer === true);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Prepare a data object which defines the data schema used by dice roll commands against this Item
   * @returns {object}
   */
  getRollData() {
    return this.system;
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _preCreate(data, options, user) {
    if ( (this.parent instanceof Actor) && !CONFIG.ActiveEffect.legacyTransferral ) {
      for ( const effect of this.effects ) {
        if ( effect.transfer ) effect.updateSource(ActiveEffect.implementation.getInitialDuration());
      }
    }
    return super._preCreate(data, options, user);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static async _onCreateDocuments(items, context) {
    if ( !(context.parent instanceof Actor) || !CONFIG.ActiveEffect.legacyTransferral ) return;
    const toCreate = [];
    for ( let item of items ) {
      for ( let e of item.effects ) {
        if ( !e.transfer ) continue;
        const effectData = e.toJSON();
        effectData.origin = item.uuid;
        toCreate.push(effectData);
      }
    }
    if ( !toCreate.length ) return [];
    const cls = getDocumentClass("ActiveEffect");
    return cls.createDocuments(toCreate, context);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static async _onDeleteDocuments(items, context) {
    if ( !(context.parent instanceof Actor) || !CONFIG.ActiveEffect.legacyTransferral ) return;
    const actor = context.parent;
    const deletedUUIDs = new Set(items.map(i => {
      if ( actor.isToken ) return i.uuid.split(".").slice(-2).join(".");
      return i.uuid;
    }));
    const toDelete = [];
    for ( const e of actor.effects ) {
      let origin = e.origin || "";
      if ( actor.isToken ) origin = origin.split(".").slice(-2).join(".");
      if ( deletedUUIDs.has(origin) ) toDelete.push(e.id);
    }
    if ( !toDelete.length ) return [];
    const cls = getDocumentClass("ActiveEffect");
    return cls.deleteDocuments(toDelete, context);
  }
}
