/**
 * The Application responsible for configuring a single Folder document.
 * @extends {DocumentSheet}
 * @param {Folder} object                   The {@link Folder} object to configure.
 * @param {DocumentSheetOptions} [options]  Application configuration options.
 */
class FolderConfig extends DocumentSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sheet", "folder-edit"],
      template: "templates/sidebar/folder-edit.html",
      width: 360
    });
  }

  /* -------------------------------------------- */

  /** @override */
  get id() {
    return this.object.id ? super.id : "folder-create";
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    if ( this.object.id ) return `${game.i18n.localize("FOLDER.Update")}: ${this.object.name}`;
    return game.i18n.localize("FOLDER.Create");
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options={}) {
    if ( !this.options.submitOnClose ) this.options.resolve?.(null);
    return super.close(options);
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    const folder = this.document.toObject();
    const label = game.i18n.localize(Folder.implementation.metadata.label);
    return {
      folder: folder,
      name: folder._id ? folder.name : "",
      newName: game.i18n.format("DOCUMENT.New", {type: label}),
      safeColor: folder.color ?? "#000000",
      sortingModes: {a: "FOLDER.SortAlphabetical", m: "FOLDER.SortManual"},
      submitText: game.i18n.localize(folder._id ? "FOLDER.Update" : "FOLDER.Create")
    };
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    let doc = this.object;
    if ( !formData.name?.trim() ) formData.name = Folder.implementation.defaultName();
    if ( this.object.id ) await this.object.update(formData);
    else {
      this.object.updateSource(formData);
      doc = await Folder.create(this.object, { pack: this.object.pack });
    }
    this.options.resolve?.(doc);
    return doc;
  }
}
