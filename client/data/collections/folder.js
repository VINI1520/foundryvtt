/**
 * The singleton collection of Folder documents which exist within the active World.
 * This Collection is accessible within the Game object as game.folders.
 * @extends {WorldCollection}
 *
 * @see {@link Folder} The Folder document
 */
class Folders extends WorldCollection {
  constructor(...args) {
    super(...args);

    /**
     * Track which Folders are currently expanded in the UI
     */
    this._expanded = {};
  }

	/* -------------------------------------------- */

  /** @override */
  static documentName = "Folder";

  /* -------------------------------------------- */

  /** @override */
  render(force, context) {
	  if ( context && context.documents.length ) {
      const folder = context.documents[0];
      if ( folder.type === "Compendium" ) {
        return ui.sidebar.tabs.compendium.render(force);
      }
      const collection = game.collections.get(folder.type);
      collection.render(force, context);
      if ( folder.type === "JournalEntry" ) {
        this._refreshJournalEntrySheets();
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of any active JournalSheet instances where the folder list will change.
   * @private
   */
  _refreshJournalEntrySheets() {
    for ( let app of Object.values(ui.windows) ) {
      if ( !(app instanceof JournalSheet) ) continue;
      app.submit();
    }
  }
}
