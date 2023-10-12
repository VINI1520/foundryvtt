/**
 * An interface for packaging Adventure content and loading it to a compendium pack.
 * // TODO - add a warning if you are building the adventure with any missing content
 * // TODO - add a warning if you are building an adventure that sources content from a different package' compendium
 */
class AdventureExporter extends DocumentSheet {
  constructor(document, options={}) {
    super(document, options);
    if ( !document.pack ) {
      throw new Error("You may not export an Adventure that does not belong to a Compendium pack");
    }
  }

  /** @inheritDoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "templates/adventure/exporter.html",
      id: "adventure-exporter",
      classes: ["sheet", "adventure", "adventure-exporter"],
      width: 560,
      height: "auto",
      tabs: [{navSelector: ".tabs", contentSelector: "form", initial: "summary"}],
      dragDrop: [{ dropSelector: "form" }],
      scrollY: [".tab.contents"],
      submitOnClose: false,
      closeOnSubmit: true
    });
  }

  /**
   * An alias for the Adventure document
   * @type {Adventure}
   */
  adventure = this.object;

  /**
   * @typedef {Object} AdventureContentTreeNode
   * @property {string} id        An alias for folder.id
   * @property {string} name      An alias for folder.name
   * @property {Folder} folder    The Folder at this node level
   * @property {string} state     The modification state of the Folder
   * @property {AdventureContentTreeNode[]} children  An array of child nodes
   * @property {{id: string, name: string, document: ClientDocument, state: string}[]} documents  An array of documents
   */
  /**
   * @typedef {AdventureContentTreeNode} AdventureContentTreeRoot
   * @property {null} id                The folder ID is null at the root level
   * @property {string} documentName    The Document name contained in this tree
   * @property {string} collection      The Document collection name of this tree
   * @property {string} name            The name displayed at the root level of the tree
   * @property {string} icon            The icon displayed at the root level of the tree
   * @property {string} collapseIcon    The icon which represents the current collapsed state of the tree
   * @property {string} cssClass        CSS classes which describe the display of the tree
   * @property {number} documentCount   The number of documents which are present in the tree
   */
  /**
   * The prepared document tree which is displayed in the form.
   * @type {Object<AdventureContentTreeRoot>}
   */
  contentTree = {};

  /**
   * A mapping which allows convenient access to content tree nodes by their folder ID
   * @type {Object<AdventureContentTreeNode>}
   */
  #treeNodes = {};

  /**
   * Track data for content which has been added to the adventure.
   * @type {Object<Set<ClientDocument>>}
   */
  #addedContent = Object.keys(Adventure.contentFields).reduce((obj, f) => {
    obj[f] = new Set();
    return obj;
  }, {});

  /**
   * Track the IDs of content which has been removed from the adventure.
   * @type {Object<Set<string>>}
   */
  #removedContent = Object.keys(Adventure.contentFields).reduce((obj, f) => {
    obj[f] = new Set();
    return obj;
  }, {});

  /**
   * Track which sections of the contents are collapsed.
   * @type {Set<string>}
   * @private
   */
  #collapsedSections = new Set();

  /** @override */
  get isEditable() {
    return game.user.isGM;
  }

  /* -------------------------------------------- */
  /*  Application Rendering                       */
  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    this.contentTree = this.#organizeContentTree();
    return {
      adventure: this.adventure,
      contentTree: this.contentTree
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async activateEditor(name, options={}, initialContent="") {
    options.plugins = {
      menu: ProseMirror.ProseMirrorMenu.build(ProseMirror.defaultSchema),
      keyMaps: ProseMirror.ProseMirrorKeyMaps.build(ProseMirror.defaultSchema)
    };
    return super.activateEditor(name, options, initialContent);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getHeaderButtons() {
    return super._getHeaderButtons().filter(btn => btn.label !== "Import");
  }

  /* -------------------------------------------- */

  /**
   * Organize content in the adventure into a tree structure which is displayed in the UI.
   * @returns {Object<AdventureContentTreeRoot>}
   */
  #organizeContentTree() {
    const content = {};
    let remainingFolders = Array.from(this.adventure.folders).concat(Array.from(this.#addedContent.folders || []));

    // Prepare each content section
    for ( const [name, cls] of Object.entries(Adventure.contentFields) ) {
      if ( name === "folders" ) continue;

      // Partition content for the section
      let documents = Array.from(this.adventure[name]).concat(Array.from(this.#addedContent[name] || []));
      let folders;
      [remainingFolders, folders] = remainingFolders.partition(f => f.type === cls.documentName);
      if ( !(documents.length || folders.length) ) continue;

      // Prepare the root node
      const collapsed = this.#collapsedSections.has(cls.documentName);
      const section = content[name] = {
        documentName: cls.documentName,
        collection: cls.collectionName,
        id: null,
        name: game.i18n.localize(cls.metadata.labelPlural),
        icon: CONFIG[cls.documentName].sidebarIcon,
        collapseIcon: collapsed ? "fa-solid fa-angle-up" : "fa-solid fa-angle-down",
        cssClass: [cls.collectionName, collapsed ? "collapsed" : ""].filterJoin(" "),
        documentCount: documents.length - this.#removedContent[name].size,
        folder: null,
        state: "root",
        children: [],
        documents: []
      };

      // Recursively populate the tree
      [folders, documents] = this.#populateNode(section, folders, documents);

      // Add leftover documents to the section root
      for ( const d of documents ) {
        const state = this.#getDocumentState(d);
        section.documents.push({document: d, id: d.id, name: d.name, state: state, stateLabel: `ADVENTURE.Document${state.titleCase()}`});
      }
    }
    return content;
  }

  /* -------------------------------------------- */

  /**
   * Populate one node of the content tree with folders and documents
   * @param {AdventureContentTreeNode }node         The node being populated
   * @param {Folder[]} remainingFolders             Folders which have yet to be populated to a node
   * @param {ClientDocument[]} remainingDocuments   Documents which have yet to be populated to a node
   * @returns {Array<Folder[], ClientDocument[]>}   Folders and Documents which still have yet to be populated
   */
  #populateNode(node, remainingFolders, remainingDocuments) {

    // Allocate Documents to this node
    let documents;
    [remainingDocuments, documents] = remainingDocuments.partition(d => d._source.folder === node.id );
    for ( const d of documents ) {
      const state = this.#getDocumentState(d);
      node.documents.push({document: d, id: d.id, name: d.name, state: state, stateLabel: `ADVENTURE.Document${state.titleCase()}`});
    }

    // Allocate Folders to this node
    let folders;
    [remainingFolders, folders] = remainingFolders.partition(f => f._source.folder === node.id);
    for ( const folder of folders ) {
      const state = this.#getDocumentState(folder);
      const child = {folder, id: folder.id, name: folder.name, state: state, stateLabel: `ADVENTURE.Document${state.titleCase()}`,
        children: [], documents: []};
      [remainingFolders, remainingDocuments] = this.#populateNode(child, remainingFolders, remainingDocuments);
      node.children.push(child);
      this.#treeNodes[folder.id] = child;
    }
    return [remainingFolders, remainingDocuments];
  }

  /* -------------------------------------------- */

  /**
   * Flag the current state of each document which is displayed
   * @param {ClientDocument} document The document being modified
   * @returns {string}                The document state
   */
  #getDocumentState(document) {
    const cn = document.collectionName;
    if ( this.#removedContent[cn].has(document.id) ) return "remove";
    if ( this.#addedContent[cn].has(document) ) return "add";
    const worldCollection = game.collections.get(document.documentName);
    if ( !worldCollection.has(document.id) ) return "missing";
    return "update";
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async close(options = {}) {
    this.adventure.reset();  // Reset any pending changes
    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.on("click", "a.control", this.#onClickControl.bind(this));
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, adventureData) {

    // Build the adventure data content
    for ( const [name, cls] of Object.entries(Adventure.contentFields) ) {
      const collection = game.collections.get(cls.documentName);
      adventureData[name] = [];
      const addDoc = id => {
        if ( this.#removedContent[name].has(id) ) return;
        const doc = collection.get(id);
        if ( !doc ) return;
        adventureData[name].push(doc.toObject());
      };
      for ( const d of this.adventure[name] ) addDoc(d.id);
      for ( const d of this.#addedContent[name] ) addDoc(d.id);
    }

    const pack = game.packs.get(this.adventure.pack);
    const restrictedDocuments = adventureData.actors?.length || adventureData.items?.length;
    if ( restrictedDocuments && !pack?.metadata.system ) {
      return ui.notifications.error("ADVENTURE.ExportPackNoSystem", {localize: true, permanent: true});
    }

    // Create or update the document
    if ( this.adventure.id ) {
      const updated = await this.adventure.update(adventureData, {diff: false, recursive: false});
      pack.indexDocument(updated);
      ui.notifications.info(game.i18n.format("ADVENTURE.UpdateSuccess", {name: this.adventure.name}));
    } else {
      await this.adventure.constructor.createDocuments([adventureData], {
        pack: this.adventure.pack,
        keepId: true,
        keepEmbeddedIds: true
      });
      ui.notifications.info(game.i18n.format("ADVENTURE.CreateSuccess", {name: this.adventure.name}));
    }
  }

  /* -------------------------------------------- */

  /**
   * Save editing progress so that re-renders of the form do not wipe out un-saved changes.
   */
  #saveProgress() {
    const formData = this._getSubmitData();
    this.adventure.updateSource(formData);
  }

  /* -------------------------------------------- */

  /**
   * Handle pointer events on a control button
   * @param {PointerEvent} event    The originating pointer event
   */
  #onClickControl(event) {
    event.preventDefault();
    const button = event.currentTarget;
    switch ( button.dataset.action ) {
      case "clear":
        return this.#onClearSection(button);
      case "collapse":
        return this.#onCollapseSection(button);
      case "remove":
        return this.#onRemoveContent(button);
    }
  }

  /* -------------------------------------------- */

  /**
   * Clear all content from a particular document-type section.
   * @param {HTMLAnchorElement} button      The clicked control button
   */
  #onClearSection(button) {
    const section = button.closest(".document-type");
    const documentType = section.dataset.documentType;
    const cls = getDocumentClass(documentType);
    this.#removeNode(this.contentTree[cls.collectionName]);
    this.#saveProgress();
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Toggle the collapsed or expanded state of a document-type section
   * @param {HTMLAnchorElement} button      The clicked control button
   */
  #onCollapseSection(button) {
    const section = button.closest(".document-type");
    const icon = button.firstElementChild;
    const documentType = section.dataset.documentType;
    const isCollapsed = this.#collapsedSections.has(documentType);
    if ( isCollapsed ) {
      this.#collapsedSections.delete(documentType);
      section.classList.remove("collapsed");
      icon.classList.replace("fa-angle-up", "fa-angle-down");
    } else {
      this.#collapsedSections.add(documentType);
      section.classList.add("collapsed");
      icon.classList.replace("fa-angle-down", "fa-angle-up");
    }
  }

  /* -------------------------------------------- */

  /**
   * Remove a single piece of content.
   * @param {HTMLAnchorElement} button      The clicked control button
   */
  #onRemoveContent(button) {
    const h4 = button.closest("h4");
    const isFolder = h4.classList.contains("folder");
    const documentName = isFolder ? "Folder" : button.closest(".document-type").dataset.documentType;
    const document = this.#getDocument(documentName, h4.dataset.documentId);
    if ( document ) {
      this.removeContent(document);
      this.#saveProgress();
      this.render();
    }
  }

  /* -------------------------------------------- */

  /**
   * Get the Document instance from the clicked content tag.
   * @param {string} documentName         The document type
   * @param {string} documentId           The document ID
   * @returns {ClientDocument|null}       The Document instance, or null
   */
  #getDocument(documentName, documentId) {
    const cls = getDocumentClass(documentName);
    const cn = cls.collectionName;
    const existing = this.adventure[cn].find(d => d.id === documentId);
    if ( existing ) return existing;
    const added = this.#addedContent[cn].find(d => d.id === documentId);
    return added || null;
  }

  /* -------------------------------------------- */
  /*  Content Drop Handling                       */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    const cls = getDocumentClass(data?.type);
    if ( !cls || !(cls.collectionName in Adventure.contentFields) ) return;
    const document = await cls.fromDropData(data);
    if ( document.pack || document.isEmbedded ) {
      return ui.notifications.error("ADVENTURE.ExportPrimaryDocumentsOnly", {localize: true});
    }
    const pack = game.packs.get(this.adventure.pack);
    const type = data?.type === "Folder" ? document.type : data?.type;
    if ( !pack?.metadata.system && CONST.SYSTEM_SPECIFIC_COMPENDIUM_TYPES.includes(type) ) {
      return ui.notifications.error("ADVENTURE.ExportPackNoSystem", {localize: true});
    }
    this.addContent(document);
    this.#saveProgress();
    this.render();
  }

  /* -------------------------------------------- */
  /*  Content Management Workflows                */
  /* -------------------------------------------- */

  /**
   * Stage a document for addition to the Adventure.
   * This adds the document locally, the change is not yet submitted to the database.
   * @param {Folder|ClientDocument} document    Some document to be added to the Adventure.
   */
  addContent(document) {
    if ( document instanceof foundry.documents.BaseFolder ) this.#addFolder(document);
    if ( document.folder ) this.#addDocument(document.folder);
    this.#addDocument(document);
  }

  /* -------------------------------------------- */

  /**
   * Remove a single Document from the Adventure.
   * @param {ClientDocument} document       The Document being removed from the Adventure.
   */
  removeContent(document) {
    if ( document instanceof foundry.documents.BaseFolder ) {
      const node = this.#treeNodes[document.id];
      if ( !node ) return;
      if ( this.#removedContent.folders.has(node.id) ) return this.#restoreNode(node);
      return this.#removeNode(node);
    }
    else this.#removeDocument(document);
  }

  /* -------------------------------------------- */

  /**
   * Remove a single document from the content tree
   * @param {AdventureContentTreeNode} node     The node to remove
   */
  #removeNode(node) {
    for ( const child of node.children ) this.#removeNode(child);
    for ( const d of node.documents ) this.#removeDocument(d.document);
    if ( node.folder ) this.#removeDocument(node.folder);
  }

  /* -------------------------------------------- */

  /**
   * Restore a removed node back to the content tree
   * @param {AdventureContentTreeNode} node     The node to restore
   */
  #restoreNode(node) {
    for ( const child of node.children ) this.#restoreNode(child);
    for ( const d of node.documents ) this.#removedContent[d.document.collectionName].delete(d.id);
    return this.#removedContent.folders.delete(node.id);
  }

  /* -------------------------------------------- */

  /**
   * Remove a single document from the content tree
   * @param {ClientDocument} document     The document to remove
   */
  #removeDocument(document) {
    const cn = document.collectionName;

    // If the Document was already removed, re-add it
    if ( this.#removedContent[cn].has(document.id) ) {
      this.#removedContent[cn].delete(document.id);
    }

    // If the content was temporarily added, remove it
    else if ( this.#addedContent[cn].has(document) ) {
      this.#addedContent[cn].delete(document);
    }

    // Otherwise, mark the content as removed
    else this.#removedContent[cn].add(document.id);
  }

  /* -------------------------------------------- */

  /**
   * Add an entire folder tree including contained documents and subfolders to the Adventure.
   * @param {Folder} folder   The folder to add
   * @private
   */
  #addFolder(folder) {
    this.#addDocument(folder);
    for ( const doc of folder.contents ) {
      this.#addDocument(doc);
    }
    for ( const sub of folder.getSubfolders() ) {
      this.#addFolder(sub);
    }
  }

  /* -------------------------------------------- */

  /**
   * Add a single document to the Adventure.
   * @param {ClientDocument} document   The Document to add
   * @private
   */
  #addDocument(document) {
    const cn = document.collectionName;

    // If the document was previously removed, restore it
    if ( this.#removedContent[cn].has(document.id) ) {
      return this.#removedContent[cn].delete(document.id);
    }

    // Otherwise, add documents which don't yet exist
    const existing = this.adventure[cn].find(d => d.id === document.id);
    if ( !existing ) this.#addedContent[cn].add(document);
  }
}
