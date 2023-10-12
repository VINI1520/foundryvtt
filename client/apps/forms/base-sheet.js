/**
 * The Application responsible for displaying a basic sheet for any Document sub-types that do not have a sheet
 * registered.
 * @extends {DocumentSheet}
 */
class BaseSheet extends DocumentSheet {
  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "templates/sheets/base-sheet.html",
      classes: ["sheet", "base-sheet"],
      width: 450,
      height: "auto",
      resizable: true,
      submitOnChange: true,
      closeOnSubmit: false
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async getData(options={}) {
    const context = await super.getData(options);
    context.hasName = "name" in this.object;
    context.hasImage = "img" in this.object;
    context.hasDescription = "description" in this.object;
    if ( context.hasDescription ) {
      context.descriptionHTML = await TextEditor.enrichHTML(this.object.description, {
        async: true,
        secrets: this.object.isOwner,
        relativeTo: this.object
      });
    }
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, options) {
    await super._render(force, options);
    await this._waitForImages();
    this.setPosition();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async activateEditor(name, options={}, initialContent="") {
    options.relativeLinks = true;
    options.plugins = {
      menu: ProseMirror.ProseMirrorMenu.build(ProseMirror.defaultSchema, {
        compact: true,
        destroyOnSave: false,
        onSave: () => this.saveEditor(name, {remove: false})
      })
    };
    return super.activateEditor(name, options, initialContent);
  }
}
