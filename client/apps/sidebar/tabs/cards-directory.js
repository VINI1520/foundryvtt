/**
 * The sidebar directory which organizes and displays world-level Cards documents.
 * @extends {SidebarDirectory}
 */
class CardsDirectory extends SidebarDirectory {

  /** @override */
  static documentName = "Cards";

  /** @inheritDoc */
  _getEntryContextOptions() {
    const options = super._getEntryContextOptions();
    const duplicate = options.find(o => o.name === "SIDEBAR.Duplicate");
    duplicate.condition = li => {
      if ( !game.user.isGM ) return false;
      const cards = this.constructor.collection.get(li.data("documentId"));
      return cards.canClone;
    };
    return options;
  }
}
