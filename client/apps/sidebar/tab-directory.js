/**
 * @typedef {ApplicationOptions} SidebarDirectoryOptions
 * @property {string[]} [renderUpdateKeys]   A list of data property keys that will trigger a re-render of the tab if
 *                                           they are updated on a Document that this tab is responsible for.
 * @property {string} [contextMenuSelector]  The CSS selector that activates the context menu for displayed Documents.
 */

/**
 * A shared pattern for the sidebar directory which Actors, Items, and Scenes all use
 * @extends {SidebarTab}
 * @abstract
 * @interface
 *
 * @param {SidebarDirectoryOptions} [options]  Application configuration options.
 */
class SidebarDirectory extends SidebarTab {
  constructor(options) {
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

    // Initialize sidebar content
    this.initialize();

    // Record the directory as an application of the collection if it is not a popout
    if ( !this.options.popOut ) this.constructor.collection.apps.push(this);
  }

  /* -------------------------------------------- */

  /**
   * A reference to the named Document type that this Sidebar Directory instance displays
   * @type {string}
   */
  static documentName = "Document";

  /**
   * The path to the template partial which renders a single Document within this directory
   * @type {string}
   */
  static documentPartial = "templates/sidebar/document-partial.html";

  /**
   * The path to the template partial which renders a single Folder within this directory
   * @type {string}
   */
  static folderPartial = "templates/sidebar/folder-partial.html";

  /* -------------------------------------------- */

  /**
   * @override
   * @returns {SidebarDirectoryOptions}
   */
  static get defaultOptions() {
    const cls = getDocumentClass(this.documentName);
    const collection = cls.metadata.collection;
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: collection,
      template: "templates/sidebar/document-directory.html",
      title: `${game.i18n.localize(cls.metadata.labelPlural)} Directory`,
      renderUpdateKeys: ["name", "img", "thumb", "ownership", "sort", "sorting", "folder"],
      height: "auto",
      scrollY: ["ol.directory-list"],
      dragDrop: [{dragSelector: ".directory-item", dropSelector: ".directory-list"}],
      filters: [{inputSelector: 'input[name="search"]', contentSelector: ".directory-list"}],
      contextMenuSelector: ".document"
    });
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
  /*  Initialization Helpers                      */

  /* -------------------------------------------- */

  /**
   * Initialize the content of the directory by categorizing folders and documents into a hierarchical tree structure.
   */
  initialize() {

    // Assign Folders
    this.folders = game.folders.filter(f => f.type === this.constructor.documentName);

    // Assign Documents
    this.documents = this.constructor.collection.filter(e => e.visible);

    // Build Tree
    this.tree = this.constructor.setupFolders(this.folders, this.documents);
  }

  /* -------------------------------------------- */

  /**
   * Given a Document type and a list of Document instances, set up the Folder tree
   * @param {Folder[]} folders        The Array of Folder objects to organize
   * @param {ClientDocument[]} documents  The Array of Document objects to organize
   * @returns {object}                A tree structure containing the folders and documents
   */
  static setupFolders(folders, documents) {
    documents = documents.filter(d => d.visible);
    const handled = new Set();
    const createNode = (root, folder, depth) => {
      return {root, folder, depth, visible: false, children: [], documents: []};
    };

    // Create the tree structure
    const tree = createNode(true, null, 0);
    const depths = [[tree]];

    // Iterate by folder depth, populating content
    for ( let depth=1; depth<=CONST.FOLDER_MAX_DEPTH+1; depth++ ) {
      const allowChildren = depth <= CONST.FOLDER_MAX_DEPTH;
      depths[depth] = [];
      const nodes = depths[depth-1];
      if ( !nodes.length ) break;
      for ( const node of nodes ) {
        const folder = node.folder;
        if ( !node.root ) { // Ensure we don't encounter any infinite loop
          if ( handled.has(folder.id) ) continue;
          handled.add(folder.id);
        }

        // Classify content for this folder
        const classified = this._classifyFolderContent(folder, folders, documents, {allowChildren});
        node.documents = classified.documents;
        node.children = classified.folders.map(folder => createNode(false, folder, depth));
        depths[depth].push(...node.children);

        // Update unassigned content
        folders = classified.unassignedFolders;
        documents = classified.unassignedDocuments;
      }
    }

    // Populate left-over folders at the root level of the tree
    for ( const folder of folders ) {
      const node = createNode(false, folder, 1);
      const classified = this._classifyFolderContent(folder, folders, documents, {allowChildren: false});
      node.documents = classified.documents;
      documents = classified.unassignedDocuments;
      depths[1].push(node);
    }

    // Populate left-over documents at the root level of the tree
    if ( documents.length ) {
      tree.documents.push(...documents);
      tree.documents.sort(this._sortStandard);
    }

    // Recursively filter visibility of the tree
    const filterChildren = node => {
      node.children = node.children.filter(child => {
        filterChildren(child);
        return child.visible;
      });
      node.visible = node.root || game.user.isGM || ((node.children.length + node.documents.length) > 0);

      // Populate some attributes of the Folder document
      if ( node.folder ) {
        node.folder.displayed = node.visible;
        node.folder.depth = node.depth;
        node.folder.children = node.children;
      }
    };
    filterChildren(tree);
    return tree;
  }

  /* -------------------------------------------- */

  /**
   * Populate a single folder with child folders and content
   * This method is called recursively when building the folder tree
   * @param {Folder|null} folder          A parent folder being populated or null for the root node
   * @param {Folder[]} folders            Remaining unassigned folders which may be children of this one
   * @param {ClientDocument[]} documents  Remaining unassigned documents which may be children of this one
   * @param {object} [options={}]         Options which configure population
   * @param {boolean} [options.allowChildren=true]  Allow additional child folders
   * @private
   */
  static _classifyFolderContent(folder, folders, documents, {allowChildren=true}={}) {
    const sort = folder?.sorting === "a" ? this._sortAlphabetical : this._sortStandard;

    // Partition folders into children and unassigned folders
    const [unassignedFolders, subfolders] = folders.partition(f => allowChildren && (f.folder === folder));
    subfolders.sort(sort);

    // Partition documents into folder contents and unassigned documents
    const [unassignedDocuments, contents] = documents.partition(e => e.folder === folder);
    contents.sort(sort);

    // Return the classified content
    return {folders: subfolders, documents: contents, unassignedFolders, unassignedDocuments};
  }

  /* -------------------------------------------- */

  /**
   * Sort two Documents by name, alphabetically.
   * @param {Document} a    Some Document
   * @param {Document} b    Some other Document
   * @returns {number}      The sort order between documents a and b
   * @private
   */
  static _sortAlphabetical(a, b) {
    return a.name.localeCompare(b.name);
  }

  /* -------------------------------------------- */

  /**
   * Sort two Documents using their numeric sort fields.
   * @param {Document} a    Some Document
   * @param {Document} b    Some other Document
   * @returns {number}      The sort order between documents a and b
   * @private
   */
  static _sortStandard(a, b) {
    return a.sort - b.sort;
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

  /** @inheritdoc */
  async getData(options={}) {
    const context = await super.getData(options);
    const cfg = CONFIG[this.constructor.documentName];
    const cls = cfg.documentClass;
    return foundry.utils.mergeObject(context, {
      tree: this.tree,
      canCreate: cls.canUserCreate(game.user),
      documentCls: cls.documentName.toLowerCase(),
      tabName: cls.metadata.collection,
      sidebarIcon: cfg.sidebarIcon,
      folderIcon: CONFIG.Folder.sidebarIcon,
      label: game.i18n.localize(cls.metadata.label),
      labelPlural: game.i18n.localize(cls.metadata.labelPlural),
      documentPartial: this.constructor.documentPartial,
      folderPartial: this.constructor.folderPartial
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _renderInner(data) {
    await loadTemplates([data.documentPartial, data.folderPartial]);
    return super._renderInner(data);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onSearchFilter(event, query, rgx, html) {
    const isSearch = !!query;
    const documentIds = new Set();
    const folderIds = new Set();
    const autoExpandFolderIds = new Set();

    // Match documents and folders
    if ( isSearch ) {

      // Include folders and their parents
      function includeFolder(folder, autoExpand=true) {
        if ( !folder ) return;
        if ( folderIds.has(folder.id) ) return;
        folderIds.add(folder.id);
        if ( autoExpand ) autoExpandFolderIds.add(folder.id);
        if ( folder.folder ) includeFolder(folder.folder); // Always autoexpand parent folders
      }

      // Match documents by name
      for ( let d of this.documents ) {
        if ( rgx.test(SearchFilter.cleanQuery(d.name)) ) {
          documentIds.add(d.id);
          includeFolder(d.folder);
        }
      }

      // Match folders by name
      for ( let f of this.folders ) {
        if ( rgx.test(SearchFilter.cleanQuery(f.name)) ) {
          includeFolder(f, false);
          for ( let d of this.documents.filter(x => x.folder === f) ) {
            documentIds.add(d.id);
          }
        }
      }
    }

    // Toggle each directory item
    for ( let el of html.querySelectorAll(".directory-item") ) {

      // Documents
      if (el.classList.contains("document")) {
        el.style.display = (!isSearch || documentIds.has(el.dataset.documentId)) ? "flex" : "none";
      }

      // Folders
      if (el.classList.contains("folder")) {
        let match = isSearch && folderIds.has(el.dataset.folderId);
        el.style.display = (!isSearch || match) ? "flex" : "none";

        if ( autoExpandFolderIds.has(el.dataset.folderId) ) {
          if ( isSearch && match ) el.classList.remove("collapsed");
        }
        else el.classList.toggle("collapsed", !game.folders._expanded[el.dataset.folderId]);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Collapse all subfolders in this directory
   */
  collapseAll() {
    this.element.find("li.folder").addClass("collapsed");
    for ( let f of this.folders ) {
      game.folders._expanded[f.id] = false;
    }
    if ( this.popOut ) this.setPosition();
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  activateListeners(html) {
    super.activateListeners(html);
    const directory = html.find(".directory-list");
    const entries = directory.find(".directory-item");

    // Directory-level events
    html.find(".create-document").click(ev => this._onCreateDocument(ev));
    html.find(".collapse-all").click(this.collapseAll.bind(this));
    html.find(".folder .folder .folder .create-folder").remove(); // Prevent excessive folder nesting
    if ( game.user.isGM ) html.find(".create-folder").click(ev => this._onCreateFolder(ev));

    // Entry-level events
    directory.on("click", ".document-name", this._onClickDocumentName.bind(this));
    directory.on("click", ".folder-header", this._toggleFolder.bind(this));
    const dh = this._onDragHighlight.bind(this);
    html.find(".folder").on("dragenter", dh).on("dragleave", dh);
    this._contextMenu(html);

    // Intersection Observer
    const observer = new IntersectionObserver(this._onLazyLoadImage.bind(this), { root: directory[0] });
    entries.each((i, li) => observer.observe(li));
  }

  /* -------------------------------------------- */

  /**
   * Handle clicking on a Document name in the Sidebar directory
   * @param {Event} event   The originating click event
   * @protected
   */
  _onClickDocumentName(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const documentId = element.parentElement.dataset.documentId;
    const document = this.constructor.collection.get(documentId);
    const sheet = document.sheet;

    // If the sheet is already rendered:
    if ( sheet.rendered ) {
      sheet.bringToTop();
      return sheet.maximize();
    }

    // Otherwise render the sheet
    else sheet.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle new Document creation request
   * @param {MouseEvent} event    The originating button click event
   * @protected
   */
  async _onCreateDocument(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const data = {folder: button.dataset.folder};
    const options = {width: 320, left: window.innerWidth - 630, top: button.offsetTop };
    const cls = getDocumentClass(this.constructor.documentName);
    return cls.createDialog(data, options);
  }

  /* -------------------------------------------- */

  /**
   * Create a new Folder in this SidebarDirectory
   * @param {MouseEvent} event    The originating button click event
   * @protected
   */
  _onCreateFolder(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const parent = button.dataset.parentFolder;
    const data = {folder: parent || null, type: this.constructor.documentName};
    const options = {top: button.offsetTop, left: window.innerWidth - 310 - FolderConfig.defaultOptions.width};
    Folder.createDialog(data, options);
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the collapsed or expanded state of a folder within the directory tab
   * @param {MouseEvent} event    The originating click event
   * @protected
   */
  _toggleFolder(event) {
    let folder = $(event.currentTarget.parentElement);
    let collapsed = folder.hasClass("collapsed");
    game.folders._expanded[folder.attr("data-folder-id")] = collapsed;

    // Expand
    if ( collapsed ) folder.removeClass("collapsed");

    // Collapse
    else {
      folder.addClass("collapsed");
      const subs = folder.find(".folder").addClass("collapsed");
      subs.each((i, f) => game.folders._expanded[f.dataset.folderId] = false);
    }

    // Resize container
    if ( this.popOut ) this.setPosition();
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragStart(event) {
    if ( ui.context ) ui.context.close({animate: false});
    const li = event.currentTarget.closest(".directory-item");
    const documentName = this.constructor.documentName;
    const isFolder = li.classList.contains("folder");
    const doc = isFolder
      ? game.folders.get(li.dataset.folderId)
      : CONFIG[documentName].collection.instance.get(li.dataset.documentId);
    const dragData = doc.toDragData();
    if ( isFolder ) foundry.utils.mergeObject(dragData, {documentName});
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  /* -------------------------------------------- */

  /** @override */
  _canDragStart(selector) {
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Highlight folders as drop targets when a drag event enters or exits their area
   * @param {DragEvent} event     The DragEvent which is in progress
   */
  _onDragHighlight(event) {
    const li = event.currentTarget;
    if ( !li.classList.contains("folder") ) return;
    event.stopPropagation();  // Don't bubble to parent folders

    // Remove existing drop targets
    if ( event.type === "dragenter" ) {
      for ( let t of li.closest(".directory-list").querySelectorAll(".droptarget") ) {
        t.classList.remove("droptarget");
      }
    }

    // Remove current drop target
    if ( event.type === "dragleave" ) {
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const parent = el.closest(".folder");
      if ( parent === li ) return;
    }

    // Add new drop target
    li.classList.toggle("droptarget", event.type === "dragenter");
  }

  /* -------------------------------------------- */

  /** @override */
  _onDrop(event) {
    const cls = this.constructor.documentName;
    const data = TextEditor.getDragEventData(event);
    if ( !data.type ) return;
    const target = event.target.closest(".directory-item") || null;

    // Call the drop handler
    switch ( data.type ) {
      case "Folder":
        return this._handleDroppedFolder(target, data);
      case cls:
        return this._handleDroppedDocument(target, data);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle Document data being dropped into the directory.
   * @param {HTMLElement} target    The target element
   * @param {object} data           The data being dropped
   * @protected
   */
  async _handleDroppedDocument(target, data) {

    // Determine the closest Folder
    const closestFolder = target ? target.closest(".folder") : null;
    if ( closestFolder ) closestFolder.classList.remove("droptarget");
    let folder = closestFolder ? game.folders.get(closestFolder.dataset.folderId) : null;

    // Obtain the dropped Document
    const cls = getDocumentClass(this.constructor.documentName);
    const collection = this.constructor.collection;
    let document = await cls.fromDropData(data);
    if ( !document ) return;
    if ( !document.id || document.pack || document.isEmbedded ) document = await cls.create(document.toObject());

    // Sort relative to another Document
    const sortData = {sortKey: "sort"};
    const isRelative = target && target.dataset.documentId;
    if ( isRelative ) {
      if ( document.id === target.dataset.documentId ) return; // Don't drop on yourself
      const targetDocument = collection.get(target.dataset.documentId);
      sortData.target = targetDocument;
      folder = targetDocument.folder;
    }

    // Sort within to the closest Folder
    else sortData.target = null;

    // Determine siblings and perform sort
    sortData.siblings = collection.filter(doc => (doc.id !== document.id) && (doc.folder === folder));
    sortData.updateData = {folder: folder?.id || null};
    return document.sortRelative(sortData);
  }

  /* -------------------------------------------- */

  /**
   * Handle Folder data being dropped into the directory.
   * @param {HTMLElement} target    The target element
   * @param {object} data           The data being dropped
   * @protected
   */
  async _handleDroppedFolder(target, data) {
    if ( data.documentName !== this.constructor.documentName ) return;
    const folder = await Folder.implementation.fromDropData(data);

    // Determine the closest folder ID
    const closestFolder = target ? target.closest(".folder") : null;
    if ( closestFolder ) closestFolder.classList.remove("droptarget");
    const closestFolderId = closestFolder ? closestFolder.dataset.folderId : null;

    // Sort into another Folder
    const sortData = {sortKey: "sort", sortBefore: true};
    const isFolder = target && target.dataset.folderId;
    if ( isFolder ) {
      const targetFolder = game.folders.get(target.dataset.folderId);

      // Sort relative to a collapsed Folder
      if ( target.classList.contains("collapsed") ) {
        sortData.target = targetFolder;
        sortData.parentId = targetFolder.folder?.id;
      }

      // Drop into an expanded Folder
      else {
        sortData.target = null;
        sortData.parentId = targetFolder.id;
      }
    }

    // Sort relative to existing Folder contents
    else {
      sortData.parentId = closestFolderId;
      sortData.target = closestFolder && closestFolder.classList.contains("collapsed") ? closestFolder : null;
    }

    if ( sortData.parentId ) {
      const parentFolder = game.folders.get(sortData.parentId);
      if ( parentFolder === folder ) return; // Prevent assigning a folder as its own parent.
      if ( (parentFolder.ancestors.length + 1) >= CONST.FOLDER_MAX_DEPTH ) return; // Prevent going beyond max depth
      if ( parentFolder.ancestors.includes(folder) ) return; // Prevent creating a cycle.
    }

    // Determine siblings and perform sort
    sortData.siblings = game.folders.filter(f => {
      return (f.folder?.id === sortData.parentId) && (f.type === folder.type) && (f !== folder);
    });
    sortData.updateData = { folder: sortData.parentId };
    return folder.sortRelative(sortData);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _contextMenu(html) {
    /**
     * A hook event that fires when the context menu for folders in a SidebarTab is constructed. Substitute the
     * SidebarTab name in the hook event to target a specific SidebarTab, for example "getActorDirectoryFolderContext".
     * @function getSidebarTabFolderContext
     * @memberof hookEvents
     * @param {jQuery} html                     The HTML element to which the context options are attached
     * @param {ContextMenuEntry[]} entryOptions The context menu entries
     */
    ContextMenu.create(this, html, ".folder .folder-header", this._getFolderContextOptions(), {
      hookName: "FolderContext"
    });
    ContextMenu.create(this, html, this.options.contextMenuSelector, this._getEntryContextOptions());
  }

  /* -------------------------------------------- */

  /**
   * Get the set of ContextMenu options which should be used for Folders in a SidebarDirectory
   * @returns {object[]}   The Array of context options passed to the ContextMenu instance
   * @protected
   */
  _getFolderContextOptions() {
    return [
      {
        name: "FOLDER.Edit",
        icon: '<i class="fas fa-edit"></i>',
        condition: game.user.isGM,
        callback: header => {
          const li = header.parent()[0];
          const folder = game.folders.get(li.dataset.folderId);
          const options = {top: li.offsetTop, left: window.innerWidth - 310 - FolderConfig.defaultOptions.width};
          new FolderConfig(folder, options).render(true);
        }
      },
      {
        name: "OWNERSHIP.Configure",
        icon: '<i class="fas fa-lock"></i>',
        condition: () => game.user.isGM,
        callback: header => {
          const li = header.parent()[0];
          const folder = game.folders.get(li.dataset.folderId);
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
          const folder = game.folders.get(header.parent().data("folderId"));
          return CONST.COMPENDIUM_DOCUMENT_TYPES.includes(folder.type);
        },
        callback: header => {
          const li = header.parent();
          const folder = game.folders.get(li.data("folderId"));
          return folder.exportDialog(null, {
            top: Math.min(li[0].offsetTop, window.innerHeight - 350),
            left: window.innerWidth - 720,
            width: 400
          });
        }
      },
      {
        name: "FOLDER.CreateTable",
        icon: `<i class="${CONFIG.RollTable.sidebarIcon}"></i>`,
        condition: header => {
          const folder = game.folders.get(header.parent().data("folderId"));
          return CONST.COMPENDIUM_DOCUMENT_TYPES.includes(folder.type);
        },
        callback: header => {
          const li = header.parent()[0];
          const folder = game.folders.get(li.dataset.folderId);
          return Dialog.confirm({
            title: `${game.i18n.localize("FOLDER.CreateTable")}: ${folder.name}`,
            content: game.i18n.localize("FOLDER.CreateTableConfirm"),
            yes: () => RollTable.fromFolder(folder),
            options: {
              top: Math.min(li.offsetTop, window.innerHeight - 350),
              left: window.innerWidth - 680,
              width: 360
            }
          });
        }
      },
      {
        name: "FOLDER.Remove",
        icon: '<i class="fas fa-trash"></i>',
        condition: game.user.isGM,
        callback: header => {
          const li = header.parent();
          const folder = game.folders.get(li.data("folderId"));
          return Dialog.confirm({
            title: `${game.i18n.localize("FOLDER.Remove")} ${folder.name}`,
            content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("FOLDER.RemoveWarning")}</p>`,
            yes: () => folder.delete({deleteSubfolders: false, deleteContents: false}),
            options: {
              top: Math.min(li[0].offsetTop, window.innerHeight - 350),
              left: window.innerWidth - 720,
              width: 400
            }
          });
        }
      },
      {
        name: "FOLDER.Delete",
        icon: '<i class="fas fa-dumpster"></i>',
        condition: game.user.isGM,
        callback: header => {
          const li = header.parent();
          const folder = game.folders.get(li.data("folderId"));
          return Dialog.confirm({
            title: `${game.i18n.localize("FOLDER.Delete")} ${folder.name}`,
            content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("FOLDER.DeleteWarning")}</p>`,
            yes: () => folder.delete({deleteSubfolders: true, deleteContents: true}),
            options: {
              top: Math.min(li[0].offsetTop, window.innerHeight - 350),
              left: window.innerWidth - 720,
              width: 400
            }
          });
        }
      }
    ];
  }

  /* -------------------------------------------- */

  /**
   * Get the set of ContextMenu options which should be used for Documents in a SidebarDirectory
   * @returns {object[]}   The Array of context options passed to the ContextMenu instance
   * @protected
   */
  _getEntryContextOptions() {
    return [
      {
        name: "FOLDER.Clear",
        icon: '<i class="fas fa-folder"></i>',
        condition: li => {
          const document = this.constructor.collection.get(li.data("documentId"));
          return game.user.isGM && !!document.folder;
        },
        callback: li => {
          const document = this.constructor.collection.get(li.data("documentId"));
          document.update({folder: null});
        }
      },
      {
        name: "SIDEBAR.Delete",
        icon: '<i class="fas fa-trash"></i>',
        condition: () => game.user.isGM,
        callback: li => {
          const document = this.constructor.collection.get(li.data("documentId"));
          if ( !document ) return;
          return document.deleteDialog({
            top: Math.min(li[0].offsetTop, window.innerHeight - 350),
            left: window.innerWidth - 720
          });
        }
      },
      {
        name: "SIDEBAR.Duplicate",
        icon: '<i class="far fa-copy"></i>',
        condition: () => game.user.isGM,
        callback: li => {
          const original = this.constructor.collection.get(li.data("documentId"));
          return original.clone({name: `${original.name} (Copy)`}, {save: true});
        }
      },
      {
        name: "OWNERSHIP.Configure",
        icon: '<i class="fas fa-lock"></i>',
        condition: () => game.user.isGM,
        callback: li => {
          const document = this.constructor.collection.get(li.data("documentId"));
          new DocumentOwnershipConfig(document, {
            top: Math.min(li[0].offsetTop, window.innerHeight - 350),
            left: window.innerWidth - 720
          }).render(true);
        }
      },
      {
        name: "SIDEBAR.Export",
        icon: '<i class="fas fa-file-export"></i>',
        condition: li => {
          const document = this.constructor.collection.get(li.data("documentId"));
          return document.isOwner;
        },
        callback: li => {
          const document = this.constructor.collection.get(li.data("documentId"));
          return document.exportToJSON();
        }
      },
      {
        name: "SIDEBAR.Import",
        icon: '<i class="fas fa-file-import"></i>',
        condition: li => {
          const document = this.constructor.collection.get(li.data("documentId"));
          return document.isOwner;
        },
        callback: li => {
          const document = this.constructor.collection.get(li.data("documentId"));
          return document.importFromJSONDialog();
        }
      }
    ];
  }
}
