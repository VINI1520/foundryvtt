/**
 * The Application responsible for displaying and editing a single Item document.
 * @param {Item} item                       The Item instance being displayed within the sheet.
 * @param {DocumentSheetOptions} [options]  Additional application configuration options.
 */
class ItemSheet extends DocumentSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "templates/sheets/item-sheet.html",
      width: 500,
      closeOnSubmit: false,
      submitOnClose: true,
      submitOnChange: true,
      resizable: true,
      baseApplication: "ItemSheet",
      id: "item",
      secrets: [{parentSelector: ".editor"}]
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get title() {
    return this.item.name;
  }

  /* -------------------------------------------- */

  /**
   * A convenience reference to the Item document
   * @type {Item}
   */
  get item() {
    return this.object;
  }

  /* -------------------------------------------- */

  /**
   * The Actor instance which owns this item. This may be null if the item is unowned.
   * @type {Actor}
   */
  get actor() {
    return this.item.actor;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const data = super.getData(options);
    data.item = data.document;
    return data;
  }
}
