/**
 * The sidebar directory which organizes and displays world-level RollTable documents.
 * @extends {DocumentDirectory}
 */
class RollTableDirectory extends DocumentDirectory {

  /** @override */
  static documentName = "RollTable";

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getEntryContextOptions() {
    let options = super._getEntryContextOptions();

    // Add the "Roll" option
    options = [
        {
            name: "TABLE.Roll",
            icon: '<i class="fas fa-dice-d20"></i>',
            callback: li => {
                const table = game.tables.get(li.data("documentId"));
                table.draw({roll: true, displayChat: true});
            }
        }
      ].concat(options);
    return options;
  }
}
