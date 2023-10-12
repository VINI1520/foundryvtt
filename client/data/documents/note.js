/**
 * The client-side Note document which extends the common BaseNote document model.
 * @extends documents.BaseNote
 * @mixes ClientDocumentMixin
 *
 * @see {@link Scene}                     The Scene document type which contains Note documents
 * @see {@link NoteConfig}                The Note configuration application
 */
class NoteDocument extends CanvasDocumentMixin(foundry.documents.BaseNote) {

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The associated JournalEntry which is referenced by this Note
   * @type {JournalEntry}
   */
  get entry() {
    return game.journal.get(this.entryId);
  }

  /* -------------------------------------------- */

  /**
   * The specific JournalEntryPage within the associated JournalEntry referenced by this Note.
   * @type {JournalEntryPage}
   */
  get page() {
    return this.entry?.pages.get(this.pageId);
  }

  /* -------------------------------------------- */

  /**
   * The text label used to annotate this Note
   * @type {string}
   */
  get label() {
    return this.text || this.page?.name || this.entry?.name || game?.i18n?.localize("NOTE.Unknown") || "Unknown";
  }
}
