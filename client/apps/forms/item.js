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

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    if ( this.isEditable) html.find("img[data-edit]").click(ev => this._onEditImage(ev));
  }

  /* -------------------------------------------- */

  /**
   * Handle changing the item image
   * @param {PointerEvent} event     The image click event
   * @private
   */
  _onEditImage(event) {
    const attr = event.currentTarget.dataset.edit;
    const current = foundry.utils.getProperty(this.item, attr);
    const fp = new FilePicker({
      type: "image",
      current: current,
      callback: path => {
        event.currentTarget.src = path;
        if ( this.options.submitOnChange ) {
          this._onSubmit(event);
        }
      },
      top: this.position.top + 40,
      left: this.position.left + 10
    });
    return fp.browse();
  }
}
