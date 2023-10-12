/**
 * @typedef {Object} AdventureImportData
 * @property {Object<object[]>} toCreate    Arrays of document data to create, organized by document name
 * @property {Object<object[]>} toUpdate    Arrays of document data to update, organized by document name
 * @property {number} documentCount         The total count of documents to import
 */

/**
 * @typedef {Object} AdventureImportResult
 * @property {Object<Document[]>} created   Documents created as a result of the import, organized by document name
 * @property {Object<Document[]>} updated   Documents updated as a result of the import, organized by document name
 */

/**
 * The client-side Adventure document which extends the common {@link foundry.documents.BaseAdventure} model.
 * @extends documents.BaseAdventure
 * @mixes ClientDocumentMixin
 *
 * ### Hook Events
 * {@link hookEvents.preImportAdventure} emitted by Adventure#import
 * {@link hookEvents.importAdventure} emitted by Adventure#import
 */
class Adventure extends ClientDocumentMixin(foundry.documents.BaseAdventure) {

  /**
   * Perform a full import workflow of this Adventure.
   * Create new and update existing documents within the World.
   * @param {object} [options]                  Options which configure and customize the import process
   * @param {boolean} [options.dialog=true]       Display a warning dialog if existing documents would be overwritten
   * @returns {Promise<AdventureImportResult>}  The import result
   */
  async import({dialog=true, ...importOptions}={}) {
    const importData = await this.prepareImport(importOptions);

    // Allow modules to preprocess adventure data or to intercept the import process
    const allowed = Hooks.call("preImportAdventure", this, importOptions, importData.toCreate, importData.toUpdate);
    if ( allowed === false ) {
      console.log(`"${this.name}" Adventure import was prevented by the "preImportAdventure" hook`);
      return {created: [], updated: []};
    }

    // Warn the user if the import operation will overwrite existing World content
    if ( !foundry.utils.isEmpty(importData.toUpdate) && dialog ) {
      const confirm = await Dialog.confirm({
        title: game.i18n.localize("ADVENTURE.ImportOverwriteTitle"),
        content: `<h4><strong>${game.i18n.localize("Warning")}:</strong></h4>
        <p>${game.i18n.format("ADVENTURE.ImportOverwriteWarning", {name: this.name})}</p>`
      });
      if ( !confirm ) return {created: [], updated: []};
    }

    // Perform the import
    const {created, updated} = await this.importContent(importData);

    // Refresh the sidebar display
    ui.sidebar.render();

    // Allow modules to perform additional post-import workflows
    Hooks.callAll("importAdventure", this, importOptions, created, updated);

    // Update the imported state of the adventure.
    const imports = game.settings.get("core", "adventureImports");
    imports[this.uuid] = true;
    await game.settings.set("core", "adventureImports", imports);

    return {created, updated};
  }

  /* -------------------------------------------- */

  /**
   * Prepare Adventure data for import into the World.
   * @param {object} [options]                 Options passed in from the import dialog to configure the import
   *                                           behavior.
   * @param {string[]} [options.importFields]  A subset of adventure fields to import.
   * @returns {Promise<AdventureImportData>}
   */
  async prepareImport({ importFields=[] }={}) {
    importFields = new Set(importFields);
    const adventureData = this.toObject();
    const toCreate = {};
    const toUpdate = {};
    let documentCount = 0;
    const importAll = !importFields.size || importFields.has("all");
    const keep = new Set();
    for ( const [field, cls] of Object.entries(Adventure.contentFields) ) {
      if ( !importAll && !importFields.has(field) ) continue;
      keep.add(cls.documentName);
      const collection = game.collections.get(cls.documentName);
      let [c, u] = adventureData[field].partition(d => collection.has(d._id));
      if ( (field === "folders") && !importAll ) {
        c = c.filter(f => keep.has(f.type));
        u = u.filter(f => keep.has(f.type));
      }
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
   * Execute an Adventure import workflow, creating and updating documents in the World.
   * @param {AdventureImportData} data          Prepared adventure data to import
   * @returns {Promise<AdventureImportResult>}  The import result
   */
  async importContent({toCreate, toUpdate, documentCount}={}) {
    const created = {};
    const updated = {};

    // Display importer progress
    const importMessage = game.i18n.localize("ADVENTURE.ImportProgress");
    let nImported = 0;
    SceneNavigation.displayProgressBar({label: importMessage, pct: 1});

    // Create new documents
    for ( const [documentName, createData] of Object.entries(toCreate) ) {
      const cls = getDocumentClass(documentName);
      const docs = await cls.createDocuments(createData, {keepId: true, keepEmbeddedId: true, renderSheet: false});
      created[documentName] = docs;
      nImported += docs.length;
      SceneNavigation.displayProgressBar({label: importMessage, pct: Math.floor(nImported * 100 / documentCount)});
    }

    // Update existing documents
    for ( const [documentName, updateData] of Object.entries(toUpdate) ) {
      const cls = getDocumentClass(documentName);
      const docs = await cls.updateDocuments(updateData, {diff: false, recursive: false, noHook: true});
      updated[documentName] = docs;
      nImported += docs.length;
      SceneNavigation.displayProgressBar({label: importMessage, pct: Math.floor(nImported * 100 / documentCount)});
    }
    SceneNavigation.displayProgressBar({label: importMessage, pct: 100});
    return {created, updated};
  }
}
