/**
 * The sidebar directory which organizes and displays world-level JournalEntry documents.
 * @extends {DocumentDirectory}
 */
class JournalDirectory extends DocumentDirectory {

  /** @override */
  static documentName = "JournalEntry";

  /* -------------------------------------------- */

  /** @override */
  _getEntryContextOptions() {
    const options = super._getEntryContextOptions();
    return options.concat([
      {
        name: "SIDEBAR.JumpPin",
        icon: '<i class="fas fa-crosshairs"></i>',
        condition: li => {
          const entry = game.journal.get(li.data("document-id"));
          return !!entry.sceneNote;
        },
        callback: li => {
          const entry = game.journal.get(li.data("document-id"));
          return entry.panToNote();
        }
      }
    ]);
  }
}
