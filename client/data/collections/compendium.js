/**
 * A collection of Document objects contained within a specific compendium pack.
 * Each Compendium pack has its own associated instance of the CompendiumCollection class which contains its contents.
 * @extends {DocumentCollection}
 * @abstract
 * @see {Game#packs}
 *
 * @param {object} metadata   The compendium metadata, an object provided by game.data
 */
class CompendiumCollection extends DocumentCollection {
  constructor(metadata) {
    super([]);

    /**
     * The compendium metadata which defines the compendium content and location
     * @type {object}
     */
    this.metadata = metadata;

    /**
     * A subsidiary collection which contains the more minimal index of the pack
     * @type {Collection<string, object>}
     */
    this.index = new foundry.utils.Collection();

    /**
     * A debounced function which will clear the contents of the Compendium pack if it is not accessed frequently.
     * @type {Function}
     * @private
     */
    this._flush = foundry.utils.debounce(this.clear.bind(this), this.constructor.CACHE_LIFETIME_SECONDS * 1000);

    // Initialize a provided Compendium index
    this.#indexedFields = new Set(this.documentClass.metadata.compendiumIndexFields);
    if ( metadata.index ) {
      for ( let i of metadata.index ) {
        this.index.set(i._id, i);
      }
      delete metadata.index;
    }

    // Define the Compendium directory application
    this.apps.push(new Compendium(this));
  }

  /* -------------------------------------------- */

  /**
   * The amount of time that Document instances within this CompendiumCollection are held in memory.
   * Accessing the contents of the Compendium pack extends the duration of this lifetime.
   * @type {number}
   */
  static CACHE_LIFETIME_SECONDS = 300;

  /**
   * The named game setting which contains Compendium configurations.
   * @type {string}
   */
  static CONFIG_SETTING = "compendiumConfiguration";

  /* -------------------------------------------- */

  /**
   * The canonical Compendium name - comprised of the originating package and the pack name
   * @type {string}
   */
  get collection() {
    return this.metadata.id;
  }

  /**
   * Access the compendium configuration data for this pack
   * @type {object}
   */
  get config() {
    const setting = game.settings.get("core", "compendiumConfiguration");
    return setting[this.collection] || {};
  }

  /** @inheritdoc */
  get documentName() {
    return this.metadata.type;
  }

  /**
   * Track whether the Compendium Collection is locked for editing
   * @type {boolean}
   */
  get locked() {
    return this.config.locked ?? (this.metadata.packageType !== "world");
  }

  /**
   * Whether the compendium is currently open in the UI.
   * @type {boolean}
   */
  get isOpen() {
    return this.apps.some(app => app._state > Application.RENDER_STATES.NONE);
  }

  /**
   * Track whether the Compendium Collection is private
   * @type {boolean}
   */
  get private() {
    return this.config.private ?? this.metadata.private;
  }

  /**
   * A convenience reference to the label which should be used as the title for the Compendium pack.
   * @type {string}
   */
  get title() {
    return this.metadata.label;
  }

  /**
   * The index fields which should be loaded for this compendium pack
   * @type {Set<string>}
   */
  get indexFields() {
    const coreFields = this.documentClass.metadata.compendiumIndexFields;
    const configFields = CONFIG[this.documentName].compendiumIndexFields || [];
    return new Set([...coreFields, ...configFields]);
  }

  /**
   * Track which document fields have been indexed for this compendium pack
   * @type {Set<string>}
   * @private
   */
  #indexedFields;

  /**
   * Has this compendium pack been fully indexed?
   * @type {boolean}
   */
  get indexed() {
    return this.indexFields.isSubset(this.#indexedFields);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  get(key, options) {
    this._flush();
    return super.get(key, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  set(id, document) {
    this._flush();
    this.indexDocument(document);
    return super.set(id, document);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  delete(id) {
    this.index.delete(id);
    return super.delete(id);
  }

  /* -------------------------------------------- */

  /**
   * Load the Compendium index and cache it as the keys and values of the Collection.
   * @param {object} [options]    Options which customize how the index is created
   * @param {string[]} [options.fields]  An array of fields to return as part of the index
   * @returns {Promise<Collection>}
   */
  async getIndex({fields=[]}={}) {
    const cls = this.documentClass;

    // Maybe reuse the existing index if we have already indexed all fields
    const indexFields = new Set([...this.indexFields, ...fields]);
    if ( indexFields.isSubset(this.#indexedFields) ) return this.index;

    // Request the new index from the server
    const index = await cls.database.get(cls, {
      query: {},
      options: { index: true, indexFields: Array.from(indexFields) },
      pack: this.collection
    }, game.user);

    // Assign the index to the collection
    for ( let i of index ) {
      const x = this.index.get(i._id);
      this.index.set(i._id, x ? foundry.utils.mergeObject(x, i) : i);
    }

    // Record that the pack has been indexed
    console.log(`${vtt} | Constructed index of ${this.collection} Compendium containing ${this.index.size} entries`);
    this.#indexedFields = indexFields;
    return this.index;
  }

  /* -------------------------------------------- */

  /**
   * Get a single Document from this Compendium by ID.
   * The document may already be locally cached, otherwise it is retrieved from the server.
   * @param {string} id               The requested Document id
   * @returns {Promise<Document>|undefined}     The retrieved Document instance
   */
  async getDocument(id) {
    if ( !id ) return undefined;
    const cached = this.get(id);
    if ( cached instanceof foundry.abstract.Document ) return cached;
    const documents = await this.getDocuments({_id: id});
    return documents.length ? documents.shift() : null;
  }

  /* -------------------------------------------- */

  /**
   * Load multiple documents from the Compendium pack using a provided query object.
   * @param {object} query            A database query used to retrieve documents from the underlying database
   * @returns {Promise<Document[]>}   The retrieved Document instances
   */
  async getDocuments(query={}) {
    const cls = this.documentClass;
    const documents = await cls.database.get(cls, {query, pack: this.collection}, game.user);
    for ( let d of documents ) {
      if ( d.invalid && !this.invalidDocumentIds.has(d.id) ) {
        this.invalidDocumentIds.add(d.id);
        this._source.push(d);
      }
      else this.set(d.id, d);
    }
    return documents;
  }

  /* -------------------------------------------- */

  /**
   * Import a Document into this Compendium Collection.
   * @param {Document} document     The existing Document you wish to import
   * @param {object} [options]      Additional options which modify how the data is imported.
   *                                See {@link ClientDocumentMixin#toCompendium}
   * @returns {Promise<Document>}   The imported Document instance
   */
  importDocument(document, options={}) {
    if ( !(document instanceof this.documentClass) ) {
      const err = Error(`You may not import a ${document.constructor.name} Document into the ${this.collection} Compendium which contains ${this.documentClass.name} Documents.`);
      ui.notifications.error(err.message);
      throw err;
    }
    options.clearOwnership = options.clearOwnership ?? (this.metadata.packageType === "world");
    const data = document.toCompendium(this, options);
    return this.documentClass.create(data, {pack: this.collection});
  }

  /* -------------------------------------------- */

  /**
   * Fully import the contents of a Compendium pack into a World folder.
   * @param {object} [options={}]     Options which modify the import operation. Additional options are forwarded to
   *                                  {@link WorldCollection#fromCompendium} and {@link Document.createDocuments}
   * @param {string|null} [options.folderId]  An existing Folder _id to use.
   * @param {string} [options.folderName]     A new Folder name to create.
   * @returns {Promise<Document[]>}   The imported Documents, now existing within the World
   */
  async importAll({folderId=null, folderName="", ...options}={}) {
    let folder;

    // Optionally, create a folder
    if ( CONST.FOLDER_DOCUMENT_TYPES.includes(this.documentName) ) {

      // Re-use an existing folder
      if ( folderId ) folder = game.folders.get(folderId, {strict: true});
      else if ( folderName ) folder = game.folders.find(f => (f.name === folderName) && (f.type === this.documentName));

      // Create a new Folder
      if ( !folder ) {
        folder = await Folder.create({
          name: folderName || this.title,
          type: this.documentName,
          parent: null
        });
      }
    }

    // Load all content
    const documents = await this.getDocuments();
    ui.notifications.info(game.i18n.format("COMPENDIUM.ImportAllStart", {
      number: documents.length,
      type: this.documentName,
      folder: folder.name
    }));

    // Prepare import data
    const collection = game.collections.get(this.documentName);
    const createData = documents.map(doc => {
      const data = collection.fromCompendium(doc, options);
      data.folder = folder.id;
      return data;
    });

    // Create World Documents in batches
    const chunkSize = 100;
    const nBatches = Math.ceil(createData.length / chunkSize);
    let created = [];
    for ( let n=0; n<nBatches; n++ ) {
      const chunk = createData.slice(n*chunkSize, (n+1)*chunkSize);
      const docs = await this.documentClass.createDocuments(chunk, options);
      created = created.concat(docs);
    }

    // Notify of success
    ui.notifications.info(game.i18n.format("COMPENDIUM.ImportAllFinish", {
      number: created.length,
      type: this.documentName,
      folder: folder.name
    }));
    return created;
  }

  /* -------------------------------------------- */

  /**
   * Provide a dialog form that prompts the user to import the full contents of a Compendium pack into the World.
   * @param {object} [options={}] Additional options passed to the Dialog.confirm method
   * @returns {Promise<Document[]|boolean|null>} A promise which resolves in the following ways: an array of imported
   *                            Documents if the "yes" button was pressed, false if the "no" button was pressed, or
   *                            null if the dialog was closed without making a choice.
   */
  async importDialog(options={}) {

    // Render the HTML form
    const html = await renderTemplate("templates/sidebar/apps/compendium-import.html", {
      folderName: this.title,
      keepId: options.keepId ?? false
    });

    // Present the Dialog
    options.jQuery = false;
    return Dialog.confirm({
      title: `${game.i18n.localize("COMPENDIUM.ImportAll")}: ${this.title}`,
      content: html,
      yes: html => {
        const form = html.querySelector("form");
        return this.importAll({
          folderName: form.folderName.value,
          keepId: form.keepId.checked
        });
      },
      options
    });
  }

  /* -------------------------------------------- */

  /**
   * Add a Document to the index, capturing its relevant index attributes
   * @param {Document} document       The document to index
   */
  indexDocument(document) {
    let index = this.index.get(document.id);
    const data = document.toObject();
    if ( index ) foundry.utils.mergeObject(index, data, {insertKeys: false, insertValues: false});
    else {
      index = this.#indexedFields.reduce((obj, field) => {
        foundry.utils.setProperty(obj, field, foundry.utils.getProperty(data, field));
        return obj;
      }, {});
    }
    if ( index.img ) index.img = data.thumb ?? data.img;
    index._id = data._id;
    this.index.set(document.id, index);
  }

  /* -------------------------------------------- */
  /*  Compendium Management                       */
  /* -------------------------------------------- */

  /**
   * Create a new Compendium Collection using provided metadata.
   * @param {object} metadata   The compendium metadata used to create the new pack
   * @param {object} options   Additional options which modify the Compendium creation request
   * @returns {Promise<CompendiumCollection>}
   */
  static async createCompendium(metadata, options={}) {
    if ( !game.user.isGM ) return ui.notifications.error("You do not have permission to modify this compendium pack");
    const response = await SocketInterface.dispatch("manageCompendium", {
      action: "create",
      data: metadata,
      options: options
    });

    // Add the new pack to the World
    game.data.packs.push(response.result);
    const pack = new CompendiumCollection(response.result);
    game.packs.set(pack.collection, pack);
    ui.compendium.render();
    return pack;
  }

  /* ----------------------------------------- */

  /**
   * Assign configuration metadata settings to the compendium pack
   * @param {object} settings   The object of compendium settings to define
   * @returns {Promise}         A Promise which resolves once the setting is updated
   */
  configure(settings={}) {
    const config = game.settings.get("core", this.constructor.CONFIG_SETTING);
    const pack = config[this.collection] || {private: false, locked: this.metadata.packageType !== "world"};
    config[this.collection] = foundry.utils.mergeObject(pack, settings);
    return game.settings.set("core", this.constructor.CONFIG_SETTING, config);
  }
  /* ----------------------------------------- */


  /**
   * Delete an existing world-level Compendium Collection.
   * This action may only be performed for world-level packs by a Gamemaster User.
   * @returns {Promise<CompendiumCollection>}
   */
  async deleteCompendium() {
    this._assertUserCanModify();
    this.apps.forEach(app => app.close());
    await SocketInterface.dispatch("manageCompendium", {
      action: "delete",
      data: this.metadata.name
    });

    // Remove the pack from the game World
    game.data.packs.findSplice(p => p.id === this.collection);
    game.packs.delete(this.collection);
    ui.compendium.render();
    return this;
  }

  /* ----------------------------------------- */

  /**
   * Duplicate a compendium pack to the current World.
   * @param {string} label    A new Compendium label
   * @returns {Promise<CompendiumCollection>}
   */
  async duplicateCompendium({label}={}) {
    this._assertUserCanModify({requireUnlocked: false});
    label = label || this.title;
    const metadata = foundry.utils.mergeObject(this.metadata, {
      name: label.slugify({strict: true}),
      label: label
    }, {inplace: false});
    return this.constructor.createCompendium(metadata, {source: this.collection});
  }

  /* ----------------------------------------- */

  /**
   * Validate that the current user is able to modify content of this Compendium pack
   * @returns {boolean}
   * @private
   */
  _assertUserCanModify({requireUnlocked=true}={}) {
    const config = game.settings.get("core", this.constructor.CONFIG_SETTING)[this.collection] || {};
    let err;
    if ( !game.user.isGM ) err = new Error("You do not have permission to modify this compendium pack");
    if ( requireUnlocked && config.locked ) {
      err = new Error("You cannot modify content in this compendium pack because it is locked.");
    }
    if ( err ) {
      ui.notifications.error(err.message);
      throw err;
    }
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Migrate a compendium pack.
   * This operation re-saves all documents within the compendium pack to disk, applying the current data model.
   * If the document type has system data, the latest system data template will also be applied to all documents.
   * @returns {Promise<CompendiumCollection>}
   */
  async migrate() {
    this._assertUserCanModify();
    ui.notifications.info(`Beginning migration for Compendium pack ${this.collection}, please be patient.`);
    await SocketInterface.dispatch("manageCompendium", {
      type: this.collection,
      action: "migrate",
      data: this.collection
    });
    ui.notifications.info(`Successfully migrated Compendium pack ${this.collection}.`);
    return this;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async updateAll(transformation, condition=null, options={}) {
    await this.getDocuments();
    options.pack = this.collection;
    return super.updateAll(transformation, condition, options);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onCreateDocuments(documents, result, options, userId) {
    super._onCreateDocuments(documents, result, options, userId);
    this._onModifyContents(documents, options, userId);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onUpdateDocuments(documents, result, options, userId) {
    super._onUpdateDocuments(documents, result, options, userId);
    this._onModifyContents(documents, options, userId);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDeleteDocuments(documents, result, options, userId) {
    super._onDeleteDocuments(documents, result, options, userId);
    this._onModifyContents(documents, options, userId);
  }

  /* -------------------------------------------- */

  /**
   * Follow-up actions taken when Documents within this Compendium pack are modified
   * @private
   */
  _onModifyContents(documents, options, userId) {
    /**
     * A hook event that fires whenever the contents of a Compendium pack were modified.
     * This hook fires for all connected clients after the update has been processed.
     *
     * @function updateCompendium
     * @memberof hookEvents
     * @param {CompendiumCollection} pack   The Compendium pack being modified
     * @param {Document[]} documents        The locally-cached Documents which were modified in the operation
     * @param {object} options              Additional options which modified the modification request
     * @param {string} userId               The ID of the User who triggered the modification workflow
     */
    Hooks.callAll("updateCompendium", this, documents, options, userId);
  }
}
