/**
 * A Collection of Compendium Folders
 * @extends {DocumentCollection}
 * @type {DocumentCollection}
 */
class CompendiumFolderCollection extends DocumentCollection {

  constructor(pack, data=[]) {
    super(data);
    this.pack = pack;
  }

  /**
   * The CompendiumPack instance which contains this CompendiumFolderCollection
   * @type {CompendiumPack}
   */
  pack;

  /* -------------------------------------------- */

  /** @inheritdoc */
  get documentName() {
    return "Folder";
  }

  /* -------------------------------------------- */

  /** @override */
  render(force, options) {
    this.pack.render(force, options);
  }
}
