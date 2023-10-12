/**
 * @typedef {ApplicationOptions} DocumentDirectoryOptions
 * @property {string[]} [renderUpdateKeys]   A list of data property keys that will trigger a rerender of the tab if
 *                                           they are updated on a Document that this tab is responsible for.
 * @property {string} [contextMenuSelector]  The CSS selector that activates the context menu for displayed Documents.
 * @property {string} [entryClickSelector]   The CSS selector for the clickable area of an entry in the tab.
 */

/**
 * A shared pattern for the sidebar directory which Actors, Items, and Scenes all use
 * @extends {SidebarTab}
 * @abstract
 * @interface
 *
 * @param {DocumentDirectoryOptions} [options]  Application configuration options.
 */
class DocumentDirectory extends DirectoryApplicationMixin(SidebarTab) {
  constructor(options={}) {
    super(options);

    /**
     * References to the set of Documents which are displayed in the Sidebar
     * @type {ClientDocument[]}
     */
    this.documents = null;

    /**
     * Reference the set of Folders which exist in this Sidebar
     * @type {Folder[]}
     */
    this.folders = null;

    // If a collection was provided, use it instead of the default
    this.#collection = options.collection ?? this.constructor.collection;

    // Initialize sidebar content
    this.initialize();

    // Record the directory as an application of the collection if it is not a popout
    if ( !this.options.popOut ) this.collection.apps.push(this);
  }

  /* -------------------------------------------- */

  /**
   * A reference to the named Document type that this Sidebar Directory instance displays
   * @type {string}
   */
  static documentName = "Document";

  /** @override */
  static entryPartial = "templates/sidebar/partials/document-partial.html";

  /** @override */
  get entryType() {
    return this.constructor.documentName;
  }

  /* -------------------------------------------- */

  /**
   * @override
   * @returns {DocumentDirectoryOptions}
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "templates/sidebar/document-directory.html",
      renderUpdateKeys: ["name", "img", "thumb", "ownership", "sort", "sorting", "folder"]
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get title() {
    const cls = getDocumentClass(this.constructor.documentName);
    return `${game.i18n.localize(cls.metadata.labelPlural)} Directory`;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get id() {
    const cls = getDocumentClass(this.constructor.documentName);
    const pack = cls.metadata.collection;
    return `${pack}${this._original ? "-popout" : ""}`;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get tabName() {
    const cls = getDocumentClass(this.constructor.documentName);
    return cls.metadata.collection;
  }

  /* -------------------------------------------- */

  /**
   * The WorldCollection instance which this Sidebar Directory displays.
   * @type {WorldCollection}
   */
  static get collection() {
    return game.collections.get(this.documentName);
  }

  /* -------------------------------------------- */

  /**
   * The collection of Documents which are displayed in this Sidebar Directory
   * @type {DocumentCollection}
   */
  get collection() {
    return this.#collection;
  }

  /* -------------------------------------------- */

  /**
   * A per-instance reference to a collection of documents which are displayed in this Sidebar Directory. If set, supersedes the World Collection
   * @private
   */
  #collection;

  /* -------------------------------------------- */
  /*  Initialization Helpers                      */

  /* -------------------------------------------- */

  /**
   * Initialize the content of the directory by categorizing folders and documents into a hierarchical tree structure.
   */
  initialize() {

    // Assign Folders
    this.folders = this.collection.folders.contents;

    // Assign Documents
    this.documents = this.collection.filter(e => e.visible);

    // Build Tree
    this.collection.initializeTree();
  }


  /* -------------------------------------------- */
  /*  Application Rendering
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, context={}) {

    // Only re-render the sidebar directory for certain types of updates
    const {action, data, documentType} = context;
    if ( action && !["create", "update", "delete"].includes(action) ) return this;
    if ( (documentType !== "Folder") && (action === "update") && !data.some(d => {
      return this.options.renderUpdateKeys.some(k => k in d);
    }) ) return;

    // Re-build the tree and render
    this.initialize();
    return super._render(force, context);
  }

  /* -------------------------------------------- */

  /** @override */
  get canCreateEntry() {
    const cls = getDocumentClass(this.constructor.documentName);
    return cls.canUserCreate(game.user);
  }

  /* -------------------------------------------- */

  /** @override */
  get canCreateFolder() {
    return this.canCreateEntry;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    const context = await super.getData(options);
    const cfg = CONFIG[this.collection.documentName];
    const cls = cfg.documentClass;
    return foundry.utils.mergeObject(context, {
      documentCls: cls.documentName.toLowerCase(),
      tabName: cls.metadata.collection,
      sidebarIcon: cfg.sidebarIcon,
      folderIcon: CONFIG.Folder.sidebarIcon,
      label: game.i18n.localize(cls.metadata.label),
      labelPlural: game.i18n.localize(cls.metadata.labelPlural),
      unavailable: game.user.isGM ? cfg.collection?.instance?.invalidDocumentIds?.size : 0
    });
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".show-issues").on("click", () => new SupportDetails().render(true, {tab: "documents"}));
  }

  /* -------------------------------------------- */

  /** @override */
  async _onClickEntryName(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const documentId = element.parentElement.dataset.documentId;
    const document = this.collection.get(documentId) ?? await this.collection.getDocument(documentId);
    document.sheet.render(true);
  }

  /* -------------------------------------------- */

  /** @override */
  async _onCreateEntry(event, { _skipDeprecated=false }={}) {
    /**
     * @deprecated since v11
     */
    if ( (this._onCreateDocument !== DocumentDirectory.prototype._onCreateDocument) && !_skipDeprecated ) {
      foundry.utils.logCompatibilityWarning("DocumentDirectory#_onCreateDocument is deprecated. "
        + "Please use DocumentDirectory#_onCreateEntry instead.", {since: 11, until: 13});
      return this._onCreateDocument(event);
    }

    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const li = button.closest(".directory-item");
    const data = {folder: li?.dataset?.folderId};
    const options = {width: 320, left: window.innerWidth - 630, top: button.offsetTop };
    if ( this.collection instanceof CompendiumCollection ) options.pack = this.collection.collection;
    const cls = getDocumentClass(this.collection.documentName);
    return cls.createDialog(data, options);
  }

  /* -------------------------------------------- */

  /** @override */
  _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    if ( !data.type ) return;
    const target = event.target.closest(".directory-item") || null;

    // Call the drop handler
    switch ( data.type ) {
      case "Folder":
        return this._handleDroppedFolder(target, data);
      case this.collection.documentName:
        return this._handleDroppedEntry(target, data);
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _handleDroppedEntry(target, data, { _skipDeprecated=false }={}) {
    /**
     * @deprecated since v11
     */
    if ( (this._handleDroppedDocument !== DocumentDirectory.prototype._handleDroppedDocument) && !_skipDeprecated ) {
      foundry.utils.logCompatibilityWarning("DocumentDirectory#_handleDroppedDocument is deprecated. "
        + "Please use DocumentDirectory#_handleDroppedEntry instead.", {since: 11, until: 13});
      return this._handleDroppedDocument(target, data);
    }

    return super._handleDroppedEntry(target, data);
  }

  /* -------------------------------------------- */

  /** @override */
  async _getDroppedEntryFromData(data) {
    const cls = this.collection.documentClass;
    return cls.fromDropData(data);
  }

  /* -------------------------------------------- */

  /** @override */
  async _sortRelative(entry, sortData) {
    return entry.sortRelative(sortData);
  }

  /* -------------------------------------------- */

  /** @override */
  async _createDroppedEntry(document, folderId) {
    const data = document.toObject();
    data.folder = folderId || null;
    return document.constructor.create(data, {fromCompendium: !!document.compendium });
  }

  /* -------------------------------------------- */

  /** @override */
  async _handleDroppedForeignFolder(folder, closestFolderId, sortData) {
    const createdFolders = await this._createDroppedFolderContent(folder, this.collection.folders.get(closestFolderId));
    if ( createdFolders.length ) folder = createdFolders[0];
    return {
      sortNeeded: true,
      folder: folder
    };
  }

  /* -------------------------------------------- */

  /**
   * Create a dropped Folder and its children in this Collection, if they do not already exist
   * @param {Folder} folder                  The Folder being dropped
   * @param {Folder} targetFolder            The Folder to which the Folder should be added
   * @returns {Promise<Array<Folder>>}       The created Folders
   * @protected
   */
  async _createDroppedFolderContent(folder, targetFolder) {

    const {foldersToCreate, documentsToCreate} = await this._organizeDroppedFoldersAndDocuments(folder, targetFolder);

    // Create Folders
    let createdFolders;
    try {
      createdFolders = await Folder.createDocuments(foldersToCreate, {
        pack: this.collection.collection,
        keepId: true
      });
    }
    catch (err) {
      ui.notifications.error(err.message);
      throw err;
    }

    // Create Documents
    await this._createDroppedFolderDocuments(folder, documentsToCreate);

    return createdFolders;
  }

  /* -------------------------------------------- */

  /**
   * Organize a dropped Folder and its children into a list of folders to create and documents to create
   * @param {Folder} folder                  The Folder being dropped
   * @param {Folder} targetFolder            The Folder to which the Folder should be added
   * @returns {Promise<{foldersToCreate: Array<Folder>, documentsToCreate: Array<Document>}>}
   * @private
   */
  async _organizeDroppedFoldersAndDocuments(folder, targetFolder) {
    let foldersToCreate = [];
    let documentsToCreate = [];
    let exceededMaxDepth = false;
    const addFolder = (folder, currentDepth) => {
      if ( !folder ) return;

      // If the Folder does not already exist, add it to the list of folders to create
      if ( this.collection.folders.get(folder.id) !== folder ) {
        const createData = folder.toObject();
        if ( targetFolder ) {
          createData.folder = targetFolder.id;
          targetFolder = undefined;
        }
        if ( currentDepth > this.maxFolderDepth ) {
          exceededMaxDepth = true;
          return;
        }
        createData.pack = this.collection.collection;
        foldersToCreate.push(createData);
      }

      // If the Folder has documents, check those as well
      if ( folder.contents?.length ) {
        for ( const document of folder.contents ) {
          const createData = document.toObject ? document.toObject() : foundry.utils.deepClone(document);
          documentsToCreate.push(createData);
        }
      }

      // Recursively check child folders
      for ( const child of folder.children ) {
        addFolder(child.folder, currentDepth + 1);
      }
    };

    const currentDepth = (targetFolder?.ancestors.length ?? 0) + 1;
    addFolder(folder, currentDepth);
    if ( exceededMaxDepth ) {
      ui.notifications.error(game.i18n.format("FOLDER.ExceededMaxDepth", {depth: this.maxFolderDepth}), {console: false});
      foldersToCreate.length = documentsToCreate.length = 0;
    }
    return {foldersToCreate, documentsToCreate};
  }

  /* -------------------------------------------- */

  /**
   * Create a list of documents in a dropped Folder
   * @param {Folder} folder                  The Folder being dropped
   * @param {Array<Document>} documentsToCreate   The documents to create
   * @returns {Promise<void>}
   * @protected
   */
  async _createDroppedFolderDocuments(folder, documentsToCreate) {
    if ( folder.pack ) {
      const pack = game.packs.get(folder.pack);
      if ( pack ) {
        const ids = documentsToCreate.map(d => d._id);
        documentsToCreate = await pack.getDocuments({_id__in: ids});
      }
    }

    try {
      await this.collection.documentClass.createDocuments(documentsToCreate, {
        pack: this.collection.collection,
        keepId: true
      });
    }
    catch (err) {
      ui.notifications.error(err.message);
      throw err;
    }
  }

  /* -------------------------------------------- */

  /**
   * Get the set of ContextMenu options which should be used for Folders in a SidebarDirectory
   * @returns {object[]}   The Array of context options passed to the ContextMenu instance
   * @protected
   */
  _getFolderContextOptions() {
    const options = super._getFolderContextOptions();
    return options.concat([
      {
        name: "OWNERSHIP.Configure",
        icon: '<i class="fas fa-lock"></i>',
        condition: () => game.user.isGM,
        callback: async header => {
          const li = header.closest(".directory-item")[0];
          const folder = await fromUuid(li.dataset.uuid);
          new DocumentOwnershipConfig(folder, {
            top: Math.min(li.offsetTop, window.innerHeight - 350),
            left: window.innerWidth - 720
          }).render(true);
        }
      },
      {
        name: "FOLDER.Export",
        icon: '<i class="fas fa-atlas"></i>',
        condition: header => {
          const folder = fromUuidSync(header.parent().data("uuid"));
          return CONST.COMPENDIUM_DOCUMENT_TYPES.includes(folder.type);
        },
        callback: async header => {
          const li = header.closest(".directory-item")[0];
          const folder = await fromUuid(li.dataset.uuid);
          return folder.exportDialog(null, {
            top: Math.min(li.offsetTop, window.innerHeight - 350),
            left: window.innerWidth - 720,
            width: 400
          });
        }
      }
    ]);
  }

  /* -------------------------------------------- */

  /**
   * Get the set of ContextMenu options which should be used for Documents in a SidebarDirectory
   * @returns {object[]}   The Array of context options passed to the ContextMenu instance
   * @protected
   */
  _getEntryContextOptions() {
    const options = super._getEntryContextOptions();
    return [
      {
        name: "OWNERSHIP.Configure",
        icon: '<i class="fas fa-lock"></i>',
        condition: () => game.user.isGM,
        callback: header => {
          const li = header.closest(".directory-item");
          const document = this.collection.get(li.data("documentId"));
          new DocumentOwnershipConfig(document, {
            top: Math.min(li[0].offsetTop, window.innerHeight - 350),
            left: window.innerWidth - 720
          }).render(true);
        }
      },
      {
        name: "SIDEBAR.Export",
        icon: '<i class="fas fa-file-export"></i>',
        condition: header => {
          const li = header.closest(".directory-item");
          const document = this.collection.get(li.data("documentId"));
          return document.isOwner;
        },
        callback: header => {
          const li = header.closest(".directory-item");
          const document = this.collection.get(li.data("documentId"));
          return document.exportToJSON();
        }
      },
      {
        name: "SIDEBAR.Import",
        icon: '<i class="fas fa-file-import"></i>',
        condition: header => {
          const li = header.closest(".directory-item");
          const document = this.collection.get(li.data("documentId"));
          return document.isOwner;
        },
        callback: header => {
          const li = header.closest(".directory-item");
          const document = this.collection.get(li.data("documentId"));
          return document.importFromJSONDialog();
        }
      }
    ].concat(options);
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  async _onCreateDocument(event) {
    foundry.utils.logCompatibilityWarning("DocumentDirectory#_onCreateDocument is deprecated. "
      + "Please use DocumentDirectory#_onCreateEntry instead.", {since: 11, until: 13});
    return this._onCreateEntry(event, { _skipDeprecated: true });
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  async _handleDroppedDocument(target, data) {
    foundry.utils.logCompatibilityWarning("DocumentDirectory#_handleDroppedDocument is deprecated. "
      + "Please use DocumentDirectory#_handleDroppedEntry instead.", {since: 11, until: 13});
    return this._handleDroppedEntry(target, data, { _skipDeprecated: true });
  }
}

/**
 * @deprecated since v11
 */
Object.defineProperty(globalThis, "SidebarDirectory", {
  get() {
    foundry.utils.logCompatibilityWarning("SidebarDirectory has been deprecated. Please use DocumentDirectory instead.",
      {since: 11, until: 13});
    return DocumentDirectory;
  }
});
