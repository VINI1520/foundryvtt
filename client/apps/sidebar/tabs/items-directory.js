/**
 * The sidebar directory which organizes and displays world-level Item documents.
 */
class ItemDirectory extends DocumentDirectory {

  /** @override */
  static documentName = "Item";

  /* -------------------------------------------- */

  /** @override */
  _canDragDrop(selector) {
    return game.user.can("ITEM_CREATE");
  }

  /* -------------------------------------------- */

  /** @override */
  _getEntryContextOptions() {
    const options = super._getEntryContextOptions();
    return [
      {
        name: "ITEM.ViewArt",
        icon: '<i class="fas fa-image"></i>',
        condition: li => {
          const item = game.items.get(li.data("documentId"));
          return item.img !== CONST.DEFAULT_TOKEN;
        },
        callback: li => {
          const item = game.items.get(li.data("documentId"));
          new ImagePopout(item.img, {
            title: item.name,
            uuid: item.uuid
          }).render(true);
        }
      }
    ].concat(options);
  }
}
