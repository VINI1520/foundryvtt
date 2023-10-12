/**
 * @typedef {SocketRequest} ManageCompendiumRequest
 * @property {string} action                      The request action.
 * @property {PackageCompendiumData|string} data  The compendium creation data, or the ID of the compendium to delete.
 * @property {object} [options]                   Additional options.
 */

/**
 * @typedef {SocketResponse} ManageCompendiumResponse
 * @property {ManageCompendiumRequest} request      The original request.
 * @property {PackageCompendiumData|string} result  The compendium creation data, or the collection name of the
 *                                                  deleted compendium.
 */

/**
 * A collection of Document objects contained within a specific compendium pack.
 * Each Compendium pack has its own associated instance of the CompendiumCollection class which contains its contents.
 * @extends {DocumentCollection}
 * @abstract
 * @see {Game#packs}
 *
 * @param {object} metadata   The compendium metadata, an object provided by game.data
 */
class CompendiumCollection extends DirectoryCollectionMixin(DocumentCollection) {
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
     * A subsidiary collection which contains the folders within the pack
     * @type {Collection<string, Folder>}
     */
    this.#folders = new CompendiumFolderCollection(this);

    /**
     * A debounced function which will clear the contents of the Compendium pack if it is not accessed frequently.
     * @type {Function}
     * @private
     */
    this._flush = foundry.utils.debounce(this.clear.bind(this), this.constructor.CACHE_LIFETIME_SECONDS * 1000);

    // Initialize a provided Compendium index
    this.#indexedFields = new Set(this.documentClass.metadata.compendiumIndexFields);
    for ( let i of metadata.index ) {
      i.uuid = this.getUuid(i._id);
      this.index.set(i._id, i);
    }
    delete metadata.index;
    for ( let f of metadata.folders.sort((a, b) => a.sort - b.sort) ) {
      this.#folders.set(f._id, new Folder.implementation(f, {pack: this.collection}));
    }
    delete metadata.folders;
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
   * The banner image for this Compendium pack, or the default image for the pack type if no image is set.
   * @returns {string}
   */
  get banner() {
    return this.metadata.banner ?? CONFIG[this.metadata.type]?.compendiumBanner;
  }

  /**
   * A reference to the Application class which provides an interface to interact with this compendium content.
   * @type {typeof Application}
   */
  applicationClass = Compendium;

  /**
   * The set of Compendium Folders
   */
  #folders;

  get folders() {
    return this.#folders;
  }

  /** @override */
  get maxFolderDepth() {
    return super.maxFolderDepth - 1;
  }

  /* -------------------------------------------- */

  /**
   * Get the Folder that this Compendium is displayed within
   * @returns {Folder|null}
   */
  get folder() {
    return game.folders.get(this.config.folder) ?? null;
  }

  /* -------------------------------------------- */

  /**
   * Assign this CompendiumCollection to be organized within a specific Folder.
   * @param {Folder|string|null} folder     The desired Folder within the World or null to clear the folder
   * @returns {Promise<void>}               A promise which resolves once the transaction is complete
   */
  async setFolder(folder) {
    const current = this.config.folder;

    // Clear folder
    if ( folder === null ) {
      if ( current === null ) return;
      return this.configure({folder: null});
    }

    // Set folder
    if ( typeof folder === "string" ) folder = game.folders.get(folder);
    if ( !(folder instanceof Folder) ) throw new Error("You must pass a valid Folder or Folder ID.");
    if ( folder.type !== "Compendium" ) throw new Error(`Folder "${folder.id}" is not of the required Compendium type`);
    if ( folder.id === current ) return;
    await this.configure({folder: folder.id});
  }

  /* -------------------------------------------- */

  /**
   * Get the sort order for this Compendium
   * @returns {number}
   */
  get sort() {
    return this.config.sort ?? 0;
  }

  /* -------------------------------------------- */

  /** @override */
  _getVisibleTreeContents() {
    return this.index.contents;
  }

  /** @override */
  static _sortStandard(a, b) {
    return a.sort - b.sort;
  }

  /**
   * Access the compendium configuration data for this pack
   * @type {object}
   */
  get config() {
    const setting = game.settings.get("core", "compendiumConfiguration");
    const config = setting[this.collection] || {};
    /** @deprecated since v11 */
    if ( "private" in config ) {
      if ( config.private === true ) config.ownership = {PLAYER: "LIMITED", ASSISTANT: "OWNER"};
      delete config.private;
    }
    return config;
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
   * The visibility configuration of this compendium pack.
   * A value in CONST.USER_ROLES
   * @type {number}
   */
  get ownership() {
    return this.config.ownership ?? this.metadata.ownership ?? {...Module.schema.getField("packs.ownership").initial};
  }

  /**
   * Is this Compendium pack visible to the current game User?
   * @type {boolean}
   */
  get visible() {
    return this.getUserLevel() >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
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
    if ( document instanceof Folder ) {
      return this.#folders.set(id, document);
    }
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
      const indexed = x ? foundry.utils.mergeObject(x, i) : i;
      indexed.uuid = this.getUuid(indexed._id);
      this.index.set(i._id, indexed);
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
   *
   * @example Get Documents that match the given value only.
   * ```js
   * await pack.getDocuments({ type: "weapon" });
   * ```
   *
   * @example Get several Documents by their IDs.
   * ```js
   * await pack.getDocuments({ _id__in: arrayOfIds });
   * ```
   *
   * @example Get Documents by their sub-types.
   * ```js
   * await pack.getDocuments({ type__in: ["weapon", "armor"] });
   * ```
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
   * Get the ownership level that a User has for this Compendium pack.
   * @param {documents.User} user     The user being tested
   * @returns {number}                The ownership level in CONST.DOCUMENT_OWNERSHIP_LEVELS
   */
  getUserLevel(user=game.user) {
    const levels = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    let level = levels.NONE;
    for ( const [role, l] of Object.entries(this.ownership) ) {
      if ( user.hasRole(role) ) level = Math.max(level, levels[l]);
    }
    return level;
  }

  /* -------------------------------------------- */

  /**
   * Test whether a certain User has a requested permission level (or greater) over the Compendium pack
   * @param {documents.BaseUser} user       The User being tested
   * @param {string|number} permission      The permission level from DOCUMENT_OWNERSHIP_LEVELS to test
   * @param {object} options                Additional options involved in the permission test
   * @param {boolean} [options.exact=false]     Require the exact permission level requested?
   * @returns {boolean}                      Does the user have this permission level over the Compendium pack?
   */
  testUserPermission(user, permission, {exact=false}={}) {
    const perms = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    const level = user.isGM ? perms.OWNER : this.getUserLevel(user);
    const target = (typeof permission === "string") ? (perms[permission] ?? perms.OWNER) : permission;
    return exact ? level === target : level >= target;
  }

  /* -------------------------------------------- */

  /**
   * Import a Document into this Compendium Collection.
   * @param {Document} document     The existing Document you wish to import
   * @param {object} [options]      Additional options which modify how the data is imported.
   *                                See {@link ClientDocumentMixin#toCompendium}
   * @returns {Promise<Document>}   The imported Document instance
   */
  async importDocument(document, options={}) {
    if ( !(document instanceof this.documentClass) && !(document instanceof Folder) ) {
      const err = Error(`You may not import a ${document.constructor.name} Document into the ${this.collection} Compendium which contains ${this.documentClass.name} Documents.`);
      ui.notifications.error(err.message);
      throw err;
    }
    options.clearOwnership = options.clearOwnership ?? (this.metadata.packageType === "world");
    const data = document.toCompendium(this, options);

    return document.constructor.create(data, {pack: this.collection});
  }

  /* -------------------------------------------- */

  /**
   * Import a Folder into this Compendium Collection.
   * @param {Folder} folder                         The existing Folder you wish to import
   * @param {object} [options]                      Additional options which modify how the data is imported.
   * @param {boolean} [options.importParents=true]  Import any parent folders which are not already present in the Compendium
   * @returns {Promise<void>}
   */
  async importFolder(folder, {importParents=true, ...options}={}) {
    if ( !(folder instanceof Folder) ) {
      const err = Error(`You may not import a ${folder.constructor.name} Document into the folders collection of the ${this.collection} Compendium.`);
      ui.notifications.error(err.message);
      throw err;
    }

    const toCreate = [folder];
    if ( importParents ) toCreate.push(...folder.getParentFolders().filter(f => !this.folders.has(f.id)));
    await Folder.createDocuments(toCreate, {pack: this.collection, keepId: true});
  }

  /* -------------------------------------------- */

  /**
   * Import an array of Folders into this Compendium Collection.
   * @param {Folder[]} folders                      The existing Folders you wish to import
   * @param {object} [options]                      Additional options which modify how the data is imported.
   * @param {boolean} [options.importParents=true]  Import any parent folders which are not already present in the Compendium
   * @returns {Promise<void>}
   */
  async importFolders(folders, {importParents=true, ...options}={}) {
    if ( folders.some(f => !(f instanceof Folder)) ) {
      const err = Error(`You can only import Folder documents into the folders collection of the ${this.collection} Compendium.`);
      ui.notifications.error(err.message);
      throw err;
    }

    const toCreate = new Set(folders);
    if ( importParents ) {
      for ( const f of folders ) {
        for ( const p of f.getParentFolders() ) {
          if ( !this.folders.has(p.id) ) toCreate.add(p);
        }
      }
    }
    await Folder.createDocuments(Array.from(toCreate), {pack: this.collection, keepId: true});
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
    let parentFolder;

    // Optionally, create a top level folder
    if ( CONST.FOLDER_DOCUMENT_TYPES.includes(this.documentName) ) {

      // Re-use an existing folder
      if ( folderId ) parentFolder = game.folders.get(folderId, {strict: true});

      // Create a new Folder
      if ( !parentFolder ) {
        parentFolder = await Folder.create({
          name: folderName || this.title,
          type: this.documentName,
          parent: null,
          color: this.folder?.color ?? null
        });
      }
    }

    // Load all content
    const folders = this.folders;
    const documents = await this.getDocuments();
    ui.notifications.info(game.i18n.format("COMPENDIUM.ImportAllStart", {
      number: documents.length,
      folderNumber: folders.size,
      type: this.documentName,
      folder: parentFolder.name
    }));

    // Create any missing Folders
    const folderCreateData = folders.map(f => {
        if ( game.folders.has(f.id) ) return null;
        const data = f.toObject();

        // If this folder has no parent folder, assign it to the new folder
        if ( !data.folder ) data.folder = parentFolder.id;
        return data;
    }).filter(f => f);
    await Folder.createDocuments(folderCreateData, {keepId: true});

    // Prepare import data
    const collection = game.collections.get(this.documentName);
    const createData = documents.map(doc => {
      const data = collection.fromCompendium(doc, options);

      // If this document has no folder, assign it to the new folder
      if ( !data.folder) data.folder = parentFolder.id;
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
      folderNumber: folders.size,
      type: this.documentName,
      folder: parentFolder.name
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
    const collection = CONFIG[this.documentName]?.collection?.instance;
    const html = await renderTemplate("templates/sidebar/apps/compendium-import.html", {
      folderName: this.title,
      keepId: options.keepId ?? false,
      folders: collection?._formatFolderSelectOptions() ?? []
    });

    // Present the Dialog
    options.jQuery = false;
    return Dialog.confirm({
      title: `${game.i18n.localize("COMPENDIUM.ImportAll")}: ${this.title}`,
      content: html,
      render: html => {
        const form = html.querySelector("form");
        form.elements.folder.addEventListener("change", event => {
          form.elements.folderName.disabled = !!event.currentTarget.value;
        }, { passive: true });
      },
      yes: html => {
        const form = html.querySelector("form");
        return this.importAll({
          folderId: form.elements.folder.value,
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
    index.img = data.thumb ?? data.img;
    index._id = data._id;
    index.uuid = document.uuid;
    this.index.set(document.id, index);
  }

  /* -------------------------------------------- */

  /**
   * Prompt the gamemaster with a dialog to configure ownership of this Compendium pack.
   * @returns {Promise<Object<string>>}   The configured ownership for the pack
   */
  async configureOwnershipDialog() {
    if ( !game.user.isGM ) throw new Error("You do not have permission to configure ownership for this Compendium pack");
    const current = this.ownership;
    const levels = {
      "": game.i18n.localize("COMPENDIUM.OwnershipInheritBelow"),
      NONE: game.i18n.localize("OWNERSHIP.NONE"),
      LIMITED: game.i18n.localize("OWNERSHIP.LIMITED"),
      OBSERVER: game.i18n.localize("OWNERSHIP.OBSERVER"),
      OWNER: game.i18n.localize("OWNERSHIP.OWNER")
    };
    const roles = {
      ASSISTANT: {label: "USER.RoleAssistant", value: current.ASSISTANT, levels: { ...levels }},
      TRUSTED: {label: "USER.RoleTrusted", value: current.TRUSTED, levels: { ...levels }},
      PLAYER: {label: "USER.RolePlayer", value: current.PLAYER, levels: { ...levels }}
    };
    delete roles.PLAYER.levels[""];
    await Dialog.wait({
      title: `${game.i18n.localize("OWNERSHIP.Title")}: ${this.metadata.label}`,
      content: await renderTemplate("templates/sidebar/apps/compendium-ownership.hbs", {roles}),
      default: "ok",
      buttons: {
        reset: {
          label: game.i18n.localize("COMPENDIUM.OwnershipReset"),
          icon: '<i class="fas fa-undo"></i>',
          callback: () => this.configure({ ownership: undefined })
        },
        ok: {
          label: game.i18n.localize("OWNERSHIP.Configure"),
          icon: '<i class="fas fa-check"></i>',
          callback: async html => {
            const fd = new FormDataExtended(html.querySelector("form.compendium-ownership-dialog"));
            let ownership = Object.entries(fd.object).reduce((obj, [r, l]) => {
              if ( l ) obj[r] = l;
              return obj;
            }, {});
            ownership.GAMEMASTER = "OWNER";
            await this.configure({ownership});
          }
        }
      }
    }, { jQuery: false });
    return this.ownership;
  }

  /* -------------------------------------------- */
  /*  Compendium Management                       */
  /* -------------------------------------------- */

  /**
   * Activate the Socket event listeners used to receive responses to compendium management events.
   * @param {Socket} socket  The active game socket.
   * @internal
   */
  static _activateSocketListeners(socket) {
    socket.on("manageCompendium", response => {
      const { request } = response;
      switch ( request.action ) {
        case "create":
          CompendiumCollection.#handleCreateCompendium(response);
          break;
        case "delete":
          CompendiumCollection.#handleDeleteCompendium(response);
          break;
        default:
          throw new Error(`Invalid Compendium modification action ${request.action} provided.`);
      }
    });
  }

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

    return this.#handleCreateCompendium(response);
  }

  /* -------------------------------------------- */

  /**
   * Generate a UUID for a given primary document ID within this Compendium pack
   * @param {string} id     The document ID to generate a UUID for
   * @returns {string}      The generated UUID, in the form of "Compendium.<collection>.<documentName>.<id>"
   */
  getUuid(id) {
    return `Compendium.${this.collection}.${this.documentName}.${id}`;
  }

  /* ----------------------------------------- */

  /**
   * Assign configuration metadata settings to the compendium pack
   * @param {object} configuration  The object of compendium settings to define
   * @returns {Promise}             A Promise which resolves once the setting is updated
   */
  configure(configuration={}) {
    const settings = game.settings.get("core", "compendiumConfiguration");
    const config = this.config;
    for ( const [k, v] of Object.entries(configuration) ) {
      if ( v === undefined ) delete config[k];
      else config[k] = v;
    }
    settings[this.collection] = config;
    return game.settings.set("core", this.constructor.CONFIG_SETTING, settings);
  }

  /* ----------------------------------------- */

  /**
   * Delete an existing world-level Compendium Collection.
   * This action may only be performed for world-level packs by a Gamemaster User.
   * @returns {Promise<CompendiumCollection>}
   */
  async deleteCompendium() {
    this.#assertUserCanManage();
    this.apps.forEach(app => app.close());
    const response = await SocketInterface.dispatch("manageCompendium", {
      action: "delete",
      data: this.metadata.name
    });

    return CompendiumCollection.#handleDeleteCompendium(response);
  }

  /* ----------------------------------------- */

  /**
   * Duplicate a compendium pack to the current World.
   * @param {string} label    A new Compendium label
   * @returns {Promise<CompendiumCollection>}
   */
  async duplicateCompendium({label}={}) {
    this.#assertUserCanManage({requireUnlocked: false});
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
  #assertUserCanManage({requireUnlocked=true}={}) {
    const config = this.config;
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
    this.#assertUserCanManage();
    ui.notifications.info(`Beginning migration for Compendium pack ${this.collection}, please be patient.`);
    await SocketInterface.dispatch("manageCompendium", {
      type: this.collection,
      action: "migrate",
      data: this.collection,
      options: { broadcast: false }
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
    // Remove deleted documents from index
    result.forEach(d => this.index.delete(d));
    this._onModifyContents(documents, options, userId);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDeleteFolder(parentFolder, deleteFolderId, deleteContents) {
    const deleteDocumentIds = [];
    for ( let d of this.index ) {
      if ( d.folder !== deleteFolderId ) continue;
      if ( deleteContents ) deleteDocumentIds.push(d.id ?? d._id);
      else {
        const existingDoc = this.get(d.id ?? d._id);
        d.folder = parentFolder;
        if ( existingDoc ) existingDoc.updateSource({folder: parentFolder});
      }
    }
    return deleteDocumentIds;
  }

  /* -------------------------------------------- */

  /**
   * Follow-up actions taken when Documents within this Compendium pack are modified
   * @private
   */
  _onModifyContents(documents, options, userId) {
    Hooks.callAll("updateCompendium", this, documents, options, userId);
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle a response from the server where a compendium was created.
   * @param {ManageCompendiumResponse} response  The server response.
   * @returns {CompendiumCollection}
   */
  static #handleCreateCompendium({ result }) {
    game.data.packs.push(result);
    const pack = new this(result);
    game.packs.set(pack.collection, pack);
    pack.apps.push(new Compendium({collection: pack}));
    ui.compendium.render();
    return pack;
  }

  /**
   * Handle a response from the server where a compendium was deleted.
   * @param {ManageCompendiumResponse} response  The server response.
   * @returns {CompendiumCollection}
   */
  static #handleDeleteCompendium({ result }) {
    const pack = game.packs.get(result);
    if ( !pack ) throw new Error(`Compendium pack '${result}' did not exist to be deleted.`);
    game.data.packs.findSplice(p => p.id === result);
    game.packs.delete(result);
    ui.compendium.render();
    return pack;
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  get private() {
    foundry.utils.logCompatibilityWarning("CompendiumCollection#private is deprecated in favor of the new "
      + "CompendiumCollection#ownership, CompendiumCollection#getUserLevel, CompendiumCollection#visible properties");
    return !this.visible;
  }

  /**
   * @deprecated since v11
   * @ignore
   */
  get isOpen() {
    foundry.utils.logCompatibilityWarning("CompendiumCollection#isOpen is deprecated and will be removed in V13");
    return this.apps.some(app => app._state > Application.RENDER_STATES.NONE);
  }
}
