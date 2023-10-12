/**
 * A collection of world-level Document objects with a singleton instance per primary Document type.
 * Each primary Document type has an associated subclass of WorldCollection which contains them.
 * @extends {DocumentCollection}
 * @abstract
 * @see {Game#collections}
 *
 * @param {object[]} data      An array of data objects from which to create Document instances
 */
class WorldCollection extends DirectoryCollectionMixin(DocumentCollection) {
  /* -------------------------------------------- */
  /*  Collection Properties                       */
  /* -------------------------------------------- */

  /**
   * Reference the set of Folders which contain documents in this collection
   * @type {Collection<string, Folder>}
   */
  get folders() {
    return game.folders.reduce((collection, folder) => {
      if (folder.type === this.documentName) {
        collection.set(folder.id, folder);
      }
      return collection;
    }, new Collection());
  }

  /**
   * Return a reference to the SidebarDirectory application for this WorldCollection.
   * @type {DocumentDirectory}
   */
  get directory() {
    const doc = getDocumentClass(this.constructor.documentName);
    return ui[doc.metadata.collection];
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the singleton instance of this WorldCollection, or null if it has not yet been created.
   * @type {WorldCollection}
   */
  static get instance() {
    return game.collections.get(this.documentName);
  }

  /* -------------------------------------------- */
  /*  Collection Methods                          */
  /* -------------------------------------------- */

  /** @override */
  _getVisibleTreeContents(entry) {
    return this.contents.filter(c => c.visible);
  }

  /* -------------------------------------------- */

  /**
   * Import a Document from a Compendium collection, adding it to the current World.
   * @param {CompendiumCollection} pack The CompendiumCollection instance from which to import
   * @param {string} id             The ID of the compendium entry to import
   * @param {object} [updateData]   Optional additional data used to modify the imported Document before it is created
   * @param {object} [options]      Optional arguments passed to the {@link WorldCollection#fromCompendium} and
   *                                {@link Document.create} methods
   * @returns {Promise<Document>}   The imported Document instance
   */
  async importFromCompendium(pack, id, updateData={}, options={}) {
    const cls = this.documentClass;
    if (pack.documentName !== cls.documentName) {
      throw new Error(`The ${pack.documentName} Document type provided by Compendium ${pack.collection} is incorrect for this Collection`);
    }

    // Prepare the source data from which to create the Document
    const document = await pack.getDocument(id);
    const sourceData = this.fromCompendium(document, options);
    const createData = foundry.utils.mergeObject(sourceData, updateData);

    // Create the Document
    console.log(`${vtt} | Importing ${cls.documentName} ${document.name} from ${pack.collection}`);
    this.directory.activate();
    options.fromCompendium = true;
    return this.documentClass.create(createData, options);
  }

  /* -------------------------------------------- */

  /**
   * Apply data transformations when importing a Document from a Compendium pack
   * @param {Document|object} document    The source Document, or a plain data object
   * @param {object} [options]            Additional options which modify how the document is imported
   * @param {boolean} [options.addFlags=true]         Add flags which track the import source
   * @param {boolean} [options.clearFolder=false]     Clear the currently assigned folder
   * @param {boolean} [options.clearSort=true]        Clear the currently assigned folder and sort order
   * @param {boolean} [options.clearOwnership=true]   Clear document ownership
   * @param {boolean} [options.keepId=false]          Retain the Document id from the source Compendium
   * @returns {object}                    The processed data ready for world Document creation
   */
  fromCompendium(document, {addFlags=true, clearFolder=false, clearSort=true, clearOwnership=true, keepId=false}={}) {

    // Prepare the data structure
    let data = document;
    if (document instanceof foundry.abstract.Document) {
      data = document.toObject();
      if ( document.pack && addFlags ) foundry.utils.setProperty(data, "flags.core.sourceId", document.uuid);
    }

    // Eliminate certain fields
    if ( !keepId ) delete data._id;
    if ( clearFolder ) delete data.folder;
    if ( clearSort ) delete data.sort;
    if ( clearOwnership && ("ownership" in data) ) {
      data.ownership = {
        default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
        [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
      };
    }
    return data;
  }

  /* -------------------------------------------- */
  /*  Sheet Registration Methods                  */
  /* -------------------------------------------- */

  /**
   * Register a Document sheet class as a candidate which can be used to display Documents of a given type.
   * See {@link DocumentSheetConfig.registerSheet} for details.
   * @static
   * @param {Array<*>} args      Arguments forwarded to the DocumentSheetConfig.registerSheet method
   *
   * @example Register a new ActorSheet subclass for use with certain Actor types.
   * ```js
   * Actors.registerSheet("dnd5e", ActorSheet5eCharacter, { types: ["character], makeDefault: true });
   * ```
   */
  static registerSheet(...args) {
    DocumentSheetConfig.registerSheet(getDocumentClass(this.documentName), ...args);
  }

  /* -------------------------------------------- */

  /**
   * Unregister a Document sheet class, removing it from the list of available sheet Applications to use.
   * See {@link DocumentSheetConfig.unregisterSheet} for detauls.
   * @static
   * @param {Array<*>} args      Arguments forwarded to the DocumentSheetConfig.unregisterSheet method
   *
   * @example Deregister the default ActorSheet subclass to replace it with others.
   * ```js
   * Actors.unregisterSheet("core", ActorSheet);
   * ```
   */
  static unregisterSheet(...args) {
    DocumentSheetConfig.unregisterSheet(getDocumentClass(this.documentName), ...args);
  }

  /* -------------------------------------------- */

  /**
   * Return an array of currently registered sheet classes for this Document type.
   * @static
   * @type {DocumentSheet[]}
   */
  static get registeredSheets() {
    const sheets = new Set();
    for ( let t of Object.values(CONFIG[this.documentName].sheetClasses) ) {
      for ( let s of Object.values(t) ) {
        sheets.add(s.cls);
      }
    }
    return Array.from(sheets);
  }
}
