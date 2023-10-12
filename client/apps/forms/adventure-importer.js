/**
 * An interface for importing an adventure from a compendium pack.
 *
 * ### Hook Events
 * {@link hookEvents.preImportAdventure} emitted by AdventureImporter#_updateObject
 * {@link hookEvents.importAdventure} emitted by AdventureImporter#_updateObject
 */
class AdventureImporter extends DocumentSheet {

  /**
   * An alias for the Adventure document
   * @type {Adventure}
   */
  adventure = this.object;

  /** @override */
  get isEditable() {
    return game.user.isGM;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "templates/adventure/importer.html",
      id: "adventure-importer",
      classes: ["sheet", "adventure", "adventure-importer"],
      width: 800,
      height: "auto",
      submitOnClose: false,
      closeOnSubmit: true
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    return {
      adventure: this.adventure,
      contents: this._getContentList()
    };
  }

  /* -------------------------------------------- */

  /**
   * Prepare a list of content types provided by this adventure.
   * @returns {{icon: string, label: string, count: number}[]}
   * @protected
   */
  _getContentList() {
    return Object.entries(Adventure.contentFields).reduce((arr, [field, cls]) => {
      const count = this.adventure[field].size;
      if ( !count ) return arr;
      arr.push({
        icon: CONFIG[cls.documentName].sidebarIcon,
        label: game.i18n.localize(count > 1 ? cls.metadata.labelPlural : cls.metadata.label),
        count
      });
      return arr;
    }, []);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    buttons.findSplice(b => b.class === "import");
    return buttons;
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {

    // Prepare the content for import
    const {toCreate, toUpdate, documentCount} = await this._prepareImportData(formData);

    // Allow modules to preprocess adventure data or to intercept the import process
    const allowed = Hooks.call("preImportAdventure", this.adventure, formData, toCreate, toUpdate);
    if ( allowed === false ) {
      return console.log(`"${this.adventure.name}" Adventure import was prevented by the "preImportAdventure" hook`);
    }

    // Warn the user if the import operation will overwrite existing World content
    if ( !foundry.utils.isEmpty(toUpdate) ) {
      const confirm = await Dialog.confirm({
        title: game.i18n.localize("ADVENTURE.ImportOverwriteTitle"),
        content: `<h4><strong>${game.i18n.localize("Warning")}:</strong></h4>
        <p>${game.i18n.format("ADVENTURE.ImportOverwriteWarning", {name: this.adventure.name})}</p>`
      });
      if ( !confirm ) return;
    }

    // Perform the import
    const {created, updated} = await this._importContent(toCreate, toUpdate, documentCount);

    // Refresh the sidebar display
    ui.sidebar.render();

    // Allow modules to react to the import process
    Hooks.callAll("importAdventure", this.adventure, formData, created, updated);
  }

  /* -------------------------------------------- */

  /**
   * Categorize data which requires import as new document creations or updates to existing documents.
   * @param {object} formData   Processed options from the importer form
   * @returns {Promise<{toCreate: Object<object[]>, toUpdate: Object<object[]>, documentCount: number}>}
   * @protected
   */
  async _prepareImportData(formData) {
    const adventureData = this.adventure.toObject();
    const toCreate = {};
    const toUpdate = {};
    let documentCount = 0;
    for ( const [field, cls] of Object.entries(Adventure.contentFields) ) {
      const collection = game.collections.get(cls.documentName);
      const [c, u] = adventureData[field].partition(d => collection.has(d._id));
      if ( c.length ) {
        toCreate[cls.documentName] = c;
        documentCount += c.length;
      }
      if ( u.length ) {
        toUpdate[cls.documentName] = u;
        documentCount += u.length;
      }
    }
    return {toCreate, toUpdate, documentCount};
  }

  /* -------------------------------------------- */

  /**
   * Perform database operations to import content into the World.
   * @param {Object<object[]>} toCreate     Adventure data to be created
   * @param {Object<object[]>} toUpdate     Adventure data to be updated
   * @param {number} documentCount          The total number of Documents being modified
   * @returns {Promise<{created: Object<Document[]>, updated: Object<Document[]>}>} The created and updated Documents
   * @protected
   */
  async _importContent(toCreate, toUpdate, documentCount) {
    const created = {};
    const updated = {};

    // Display importer progress
    const importMessage = game.i18n.localize("ADVENTURE.ImportProgress");
    let nImported = 0;
    SceneNavigation.displayProgressBar({label: importMessage, pct: 1});

    // Create new documents
    for ( const [documentName, createData] of Object.entries(toCreate) ) {
      const cls = getDocumentClass(documentName);
      const c = await cls.createDocuments(createData, {keepId: true, keepEmbeddedId: true, renderSheet: false});
      created[documentName] = c;
      nImported += c.length;
      SceneNavigation.displayProgressBar({label: importMessage, pct: Math.floor(nImported * 100 / documentCount)});
    }

    // Update existing documents
    for ( const [documentName, updateData] of Object.entries(toUpdate) ) {
      const cls = getDocumentClass(documentName);
      const u = await cls.updateDocuments(updateData, {diff: false, recursive: false, noHook: true});
      updated[documentName] = u;
      nImported += u.length;
      SceneNavigation.displayProgressBar({label: importMessage, pct: Math.floor(nImported * 100 / documentCount)});
    }
    SceneNavigation.displayProgressBar({label: importMessage, pct: 100});
    return {created, updated};
  }
}
