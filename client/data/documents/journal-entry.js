/**
 * The client-side JournalEntry document which extends the common BaseJournalEntry model.
 * @extends documents.BaseJournalEntry
 * @mixes ClientDocumentMixin
 *
 * @see {@link Journal}                       The world-level collection of JournalEntry documents
 * @see {@link JournalSheet}                  The JournalEntry configuration application
 */
class JournalEntry extends ClientDocumentMixin(foundry.documents.BaseJournalEntry) {

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * A boolean indicator for whether the JournalEntry is visible to the current user in the directory sidebar
   * @type {boolean}
   */
  get visible() {
    return this.testUserPermission(game.user, "OBSERVER");
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getUserLevel(user) {
    // Upgrade to OBSERVER ownership if the journal entry is in a LIMITED compendium, as LIMITED has no special meaning
    // for journal entries in this context.
    if ( this.pack && (this.compendium.getUserLevel(user) === CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED) ) {
      return CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    }
    return super.getUserLevel(user);
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the Note instance for this Journal Entry in the current Scene, if any.
   * If multiple notes are placed for this Journal Entry, only the first will be returned.
   * @type {Note|null}
   */
  get sceneNote() {
    if ( !canvas.ready ) return null;
    return canvas.notes.placeables.find(n => n.document.entryId === this.id) || null;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Show the JournalEntry to connected players.
   * By default, the entry will only be shown to players who have permission to observe it.
   * If the parameter force is passed, the entry will be shown to all players regardless of normal permission.
   *
   * @param {boolean} [force=false]    Display the entry to all players regardless of normal permissions
   * @returns {Promise<JournalEntry>}  A Promise that resolves back to the shown entry once the request is processed
   * @alias Journal.show
   */
  async show(force=false) {
    return Journal.show(this, {force});
  }

  /* -------------------------------------------- */

  /**
   * If the JournalEntry has a pinned note on the canvas, this method will animate to that note
   * The note will also be highlighted as if hovered upon by the mouse
   * @param {object} [options={}]         Options which modify the pan operation
   * @param {number} [options.scale=1.5]          The resulting zoom level
   * @param {number} [options.duration=250]       The speed of the pan animation in milliseconds
   * @returns {Promise<void>}             A Promise which resolves once the pan animation has concluded
   */
  panToNote(options={}) {
    return canvas.notes.panToNote(this.sceneNote, options);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _preCreate(data, options, user) {
    /**
     * Migrate content to pages.
     * @deprecated since v10
     */
    if ( (("img" in data) || ("content" in data)) && !this.pages.size ) {
      this.updateSource({pages: this.constructor.migrateContentToPages(data)});
    }
    return super._preCreate(data, options, user);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  async _preUpdate(changed, options, user) {
    /**
     * Migrate content to pages.
     * @deprecated since v10
     */
    if ( ("img" in changed) || ("content" in changed) ) {
      const pages = this.toObject().pages;
      const addPages = this.constructor.migrateContentToPages(changed);
      if ( "img" in changed ) {
        const addImgPage = addPages.shift();
        const imgPage = pages.find(p => p.type === "image");
        if ( imgPage ) foundry.utils.mergeObject(imgPage, addImgPage);
        else pages.push(addImgPage);
      }
      if ( "content" in changed ) {
        const addContentPage = addPages.shift();
        const contentPage = pages.find(p => p.type === "text");
        if ( contentPage ) foundry.utils.mergeObject(contentPage, addContentPage);
        else pages.push(addContentPage);
      }
      this.updateSource({pages});
    }
    return super._preUpdate(changed, options, user);
  }

  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data, options, userId) {
    super._onUpdate(data, options, userId);
    if ( !canvas.ready ) return;
    if ( ["name", "ownership"].some(k => k in data) ) {
      canvas.notes.placeables.filter(n => n.document.entryId === this.id).forEach(n => n.draw());
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( !canvas.ready ) return;
    for ( let n of canvas.notes.placeables ) {
      if ( n.document.entryId === this.id ) n.draw();
    }
  }
}
