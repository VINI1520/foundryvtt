/**
 * A mixin which extends each Document definition with specialized client-side behaviors.
 * This mixin defines the client-side interface for database operations and common document behaviors.
 * @param {typeof abstract.Document} Base     The base Document class to be mixed
 * @returns {typeof ClientDocument}           The mixed client-side document class definition
 * @category - Mixins
 * @mixin
 */
function ClientDocumentMixin(Base) {
  /**
   * The ClientDocument extends the base Document class by adding client-specific behaviors to all Document types.
   * @extends {abstract.Document}
   */
  return class ClientDocument extends Base {
    constructor(data, context) {
      super(data, context);

      /**
       * A collection of Application instances which should be re-rendered whenever this document is updated.
       * The keys of this object are the application ids and the values are Application instances. Each
       * Application in this object will have its render method called by {@link Document#render}.
       * @type {Object<Application>}
       * @see {@link Document#render}
       * @memberof ClientDocumentMixin#
       */
      Object.defineProperty(this, "apps", {
        value: {},
        writable: false,
        enumerable: false
      });

      /**
       * A cached reference to the FormApplication instance used to configure this Document.
       * @type {FormApplication|null}
       * @private
       */
      Object.defineProperty(this, "_sheet", {value: null, writable: true, enumerable: false});
    }

    /** @inheritdoc */
    static name = "ClientDocumentMixin";

    /* -------------------------------------------- */

    /**
     * @inheritDoc
     * @this {ClientDocument}
     */
    _initialize(options={}) {
      super._initialize(options);
      if ( !game._documentsReady ) return;
      return this._safePrepareData();
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Return a reference to the parent Collection instance which contains this Document.
     * @memberof ClientDocumentMixin#
     * @this {ClientDocument}
     * @type {Collection}
     */
    get collection() {
      if ( this.isEmbedded ) return this.parent[this.parentCollection];
      else return CONFIG[this.documentName].collection.instance;
    }

    /* -------------------------------------------- */

    /**
     * A reference to the Compendium Collection which contains this Document, if any, otherwise undefined.
     * @memberof ClientDocumentMixin#
     * @this {ClientDocument}
     * @type {CompendiumCollection}
     */
    get compendium() {
      return game.packs.get(this.pack);
    }

    /* -------------------------------------------- */

    /**
     * A boolean indicator for whether or not the current game User has ownership rights for this Document.
     * Different Document types may have more specialized rules for what constitutes ownership.
     * @type {boolean}
     * @memberof ClientDocumentMixin#
     */
    get isOwner() {
      return this.testUserPermission(game.user, "OWNER");
    }

    /* -------------------------------------------- */

    /**
     * Test whether this Document is owned by any non-Gamemaster User.
     * @type {boolean}
     * @memberof ClientDocumentMixin#
     */
    get hasPlayerOwner() {
      return game.users.some(u => !u.isGM && this.testUserPermission(u, "OWNER"));
    }

    /* ---------------------------------------- */

    /**
     * A boolean indicator for whether the current game User has exactly LIMITED visibility (and no greater).
     * @type {boolean}
     * @memberof ClientDocumentMixin#
     */
    get limited() {
      return this.testUserPermission(game.user, "LIMITED", {exact: true});
    }

    /* -------------------------------------------- */

    /**
     * Return a string which creates a dynamic link to this Document instance.
     * @returns {string}
     * @memberof ClientDocumentMixin#
     */
    get link() {
      return `@UUID[${this.uuid}]{${this.name}}`;
    }

    /* ---------------------------------------- */

    /**
     * Return the permission level that the current game User has over this Document.
     * See the CONST.DOCUMENT_OWNERSHIP_LEVELS object for an enumeration of these levels.
     * @type {number}
     * @memberof ClientDocumentMixin#
     *
     * @example Get the permission level the current user has for a document
     * ```js
     * game.user.id; // "dkasjkkj23kjf"
     * actor.data.permission; // {default: 1, "dkasjkkj23kjf": 2};
     * actor.permission; // 2
     * ```
     */
    get permission() {
      if ( game.user.isGM ) return CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
      if ( this.isEmbedded ) return this.parent.permission;
      return this.getUserLevel(game.user);
    }

    /* -------------------------------------------- */

    /**
     * Lazily obtain a FormApplication instance used to configure this Document, or null if no sheet is available.
     * @type {FormApplication|null}
     * @memberof ClientDocumentMixin#
     */
    get sheet() {
      if ( !this._sheet ) {
        const cls = this._getSheetClass();
        if ( !cls ) return null;
        this._sheet = new cls(this, {editable: this.isOwner});
      }
      return this._sheet;
    }

    /* -------------------------------------------- */

    /**
     * A Universally Unique Identifier (uuid) for this Document instance.
     * @type {string}
     * @memberof ClientDocumentMixin#
     */
    get uuid() {
      let parts = [this.documentName, this.id];
      if ( this.parent ) parts = [this.parent.uuid].concat(parts);
      else if ( this.pack ) parts = ["Compendium", this.pack].concat(parts);
      return parts.join(".");
    }

    /* -------------------------------------------- */

    /**
     * A boolean indicator for whether the current game User has at least limited visibility for this Document.
     * Different Document types may have more specialized rules for what determines visibility.
     * @type {boolean}
     * @memberof ClientDocumentMixin#
     */
    get visible() {
      if ( this.isEmbedded ) return this.parent.visible;
      return this.testUserPermission(game.user, "LIMITED");
    }

    /* -------------------------------------------- */
    /*  Methods                                     */

    /* -------------------------------------------- */

    /**
     * Obtain the FormApplication class constructor which should be used to configure this Document.
     * @returns {Function|null}
     * @private
     */
    _getSheetClass() {
      const cfg = CONFIG[this.documentName];
      const type = this.type ?? CONST.BASE_DOCUMENT_TYPE;
      const sheets = cfg.sheetClasses[type] || {};

      // Sheet selection overridden at the instance level
      const override = this.getFlag("core", "sheetClass");
      if ( sheets[override] ) return sheets[override].cls;

      // Default sheet selection for the type
      const classes = Object.values(sheets);
      if ( !classes.length ) return BaseSheet;
      return (classes.find(s => s.default) ?? classes.pop()).cls;
    }

    /* -------------------------------------------- */

    /**
     * Safely prepare data for a Document, catching any errors.
     * @internal
     */
    _safePrepareData() {
      try {
        this.prepareData();
      } catch(err) {
        Hooks.onError("ClientDocumentMixin#_initialize", err, {
          msg: `Failed data preparation for ${this.uuid}`,
          log: "error",
          uuid: this.uuid
        });
      }
    }

    /* -------------------------------------------- */

    /**
     * Prepare data for the Document. This method is called automatically by the DataModel#_initialize workflow.
     * This method provides an opportunity for Document classes to define special data preparation logic.
     * The work done by this method should be idempotent. There are situations in which prepareData may be called more
     * than once.
     * @memberof ClientDocumentMixin#
     */
    prepareData() {
      const isTypeData = this.system instanceof foundry.abstract.TypeDataModel;
      if ( isTypeData || (this.system?.prepareBaseData instanceof Function) ) this.system.prepareBaseData();
      this.prepareBaseData();
      this.prepareEmbeddedDocuments();
      if ( isTypeData || (this.system?.prepareDerivedData instanceof Function) ) this.system.prepareDerivedData();
      this.prepareDerivedData();
    }

    /* -------------------------------------------- */

    /**
     * Prepare data related to this Document itself, before any embedded Documents or derived data is computed.
     * @memberof ClientDocumentMixin#
     */
    prepareBaseData() {
    }

    /* -------------------------------------------- */

    /**
     * Prepare all embedded Document instances which exist within this primary Document.
     * @memberof ClientDocumentMixin#
     */
    prepareEmbeddedDocuments() {
      for ( const collectionName of Object.keys(this.constructor.hierarchy || {}) ) {
        for ( let e of this.getEmbeddedCollection(collectionName) ) {
          e._safePrepareData();
        }
      }
    }

    /* -------------------------------------------- */

    /**
     * Apply transformations or derivations to the values of the source data object.
     * Compute data fields whose values are not stored to the database.
     * @memberof ClientDocumentMixin#
     */
    prepareDerivedData() {
    }

    /* -------------------------------------------- */

    /**
     * Render all of the Application instances which are connected to this document by calling their respective
     * @see Application#render
     * @param {boolean} [force=false]     Force rendering
     * @param {object} [context={}]       Optional context
     * @memberof ClientDocumentMixin#
     */
    render(force=false, context={}) {
      for ( let app of Object.values(this.apps) ) {
        app.render(force, context);
      }
    }

    /* -------------------------------------------- */

    /**
     * Determine the sort order for this Document by positioning it relative a target sibling.
     * See SortingHelper.performIntegerSort for more details
     * @param {object} [options]          Sorting options provided to SortingHelper.performIntegerSort
     * @param {object} [updateData]       Additional data changes which are applied to each sorted document
     * @param {object} [sortOptions]      Options which are passed to the SortingHelpers.performIntegerSort method
     * @returns {Promise<Document>}       The Document after it has been re-sorted
     * @memberof ClientDocumentMixin#
     */
    async sortRelative({updateData={}, ...sortOptions}={}) {
      const sorting = SortingHelpers.performIntegerSort(this, sortOptions);
      const updates = [];
      for ( let s of sorting ) {
        const doc = s.target;
        const update = foundry.utils.mergeObject(updateData, s.update, {inplace: false});
        update._id = doc._id;
        if ( doc.sheet && doc.sheet.rendered ) await doc.sheet.submit({updateData: update});
        else updates.push(update);
      }
      if ( updates.length ) await this.constructor.updateDocuments(updates, {parent: this.parent, pack: this.pack});
      return this;
    }

    /* -------------------------------------------- */

    /**
     * Construct a UUID relative to another document.
     * @param {ClientDocument} doc  The document to compare against.
     */
    getRelativeUUID(doc) {
      if ( this.compendium && (this.compendium !== doc.compendium) ) return this.uuid;

      // This Document is a child of the relative Document.
      if ( doc === this.parent ) return `.${this.documentName}.${this.id}`;

      // This Document is a sibling of the relative Document.
      if ( this.isEmbedded && (this.collection === doc.collection) ) return `.${this.id}`;
      return this.uuid;
    }

    /* -------------------------------------------- */

    /**
     * Create a content link for this document.
     * @param {object} eventData                     The parsed object of data provided by the drop transfer event.
     * @param {object} [options]                     Additional options to configure link generation.
     * @param {ClientDocument} [options.relativeTo]  A document to generate a link relative to.
     * @param {string} [options.label]               A custom label to use instead of the document's name.
     * @returns {string}
     * @internal
     */
    _createDocumentLink(eventData, {relativeTo, label}={}) {
      if ( !relativeTo && !label ) return this.link;
      label ??= this.name;
      if ( relativeTo ) return `@UUID[${this.getRelativeUUID(relativeTo)}]{${label}}`;
      return `@UUID[${this.uuid}]{${label}}`;
    }

    /* -------------------------------------------- */

    /**
     * Handle clicking on a content link for this document.
     * @param {MouseEvent} event    The triggering click event.
     * @returns {any}
     * @protected
     */
    _onClickDocumentLink(event) {
      return this.sheet.render(true);
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /** @override */
    _onCreate(data, options, userId) {
      if ( options.renderSheet && (userId === game.user.id) ) {
        if ( this.sheet ) this.sheet.render(true, {
          action: "create",
          data: data
        });
      }
      game.issues._countDocumentSubType(this.documentName, this._source);

      // Update global index
      if ( this.constructor.metadata.indexed ) game.documentIndex.addDocument(this);
    }

    /* -------------------------------------------- */

    /** @override */
    _onUpdate(data, options, userId) {
      // Clear cached sheet if a new sheet is chosen, or the Document's sub-type changes.
      const sheetChange = ("type" in data) || ("sheetClass" in (data.flags?.core || {}));
      if ( !options.preview && sheetChange ) this._onSheetChange();

      // Otherwise re-render associated applications.
      else if ( options.render !== false ) {
        this.render(false, {
          action: "update",
          data: data
        });
      }

      // Update Compendium index
      if ( this.pack && !this.isEmbedded ) {
        if ( options.type === "Folder" ) this.compendium.folders.set(this.id, this);
        else this.compendium.indexDocument(this);
      }

      // Update global index.
      if ( "name" in data ) game.documentIndex.replaceDocument(this);
    }

    /* -------------------------------------------- */

    /** @override */
    _onDelete(options, userId) {
      Object.values(this.apps).forEach(a => a.close({submit: false}));
      game.issues._countDocumentSubType(this.documentName, this._source, {decrement: true});
      game.documentIndex.removeDocument(this);
    }

    /* -------------------------------------------- */

    /**
     * Orchestrate dispatching descendant document events to parent documents when embedded children are modified.
     * @param {string} event                The event name, preCreate, onCreate, etc...
     * @param {string} collection           The collection name being modified within this parent document
     * @param {Array<*>} args               Arguments passed to each dispatched function
     * @param {ClientDocument} [_parent]    The document with directly modified embedded documents.
     *                                      Either this document or a descendant of this one.
     * @internal
     */
    _dispatchDescendantDocumentEvents(event, collection, args, _parent) {
      _parent ||= this;

      // Dispatch the event to this Document
      const fn = this[`_${event}DescendantDocuments`];
      if ( !(fn instanceof Function) ) throw new Error(`Invalid descendant document event "${event}"`);
      fn.call(this, _parent, collection, ...args);

      // Dispatch the legacy "EmbeddedDocuments" event to the immediate parent only
      if ( _parent === this ) {
        /** @deprecated since v11 */
        const legacyFn = `_${event}EmbeddedDocuments`;
        const isOverridden = foundry.utils.getDefiningClass(this, legacyFn)?.name !== "ClientDocumentMixin";
        if ( isOverridden && (this[legacyFn] instanceof Function) ) {
          const documentName = this.constructor.hierarchy[collection].model.documentName;
          const warning = `The ${this.documentName} class defines the _${event}EmbeddedDocuments method which is `
            + `deprecated in favor of a new _${event}DescendantDocuments method.`;
          foundry.utils.logCompatibilityWarning(warning, {since: 11, until: 13});
          this[legacyFn](documentName, ...args);
        }
      }

      // Bubble the event to the parent Document
      /** @type ClientDocument */
      const parent = this.parent;
      if ( !parent ) return;
      parent._dispatchDescendantDocumentEvents(event, collection, args, _parent);
    }

    /* -------------------------------------------- */

    /**
     * Actions taken after descendant documents have been created, but before changes are applied to the client data.
     * @param {Document} parent         The direct parent of the created Documents, may be this Document or a child
     * @param {string} collection       The collection within which documents are being created
     * @param {object[]} data           The source data for new documents that are being created
     * @param {object} options          Options which modified the creation operation
     * @param {string} userId           The ID of the User who triggered the operation
     * @protected
     */
    _preCreateDescendantDocuments(parent, collection, data, options, userId) {}

    /* -------------------------------------------- */

    /**
     * Actions taken after descendant documents have been created and changes have been applied to client data.
     * @param {Document} parent         The direct parent of the created Documents, may be this Document or a child
     * @param {string} collection       The collection within which documents were created
     * @param {Document[]} documents    The array of created Documents
     * @param {object[]} data           The source data for new documents that were created
     * @param {object} options          Options which modified the creation operation
     * @param {string} userId           The ID of the User who triggered the operation
     * @protected
     */
    _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
      if ( options.render === false ) return;
      this.render(false, {renderContext: `create.${collection}`});
    }

    /* -------------------------------------------- */

    /**
     * Actions taken after descendant documents have been updated, but before changes are applied to the client data.
     * @param {Document} parent         The direct parent of the updated Documents, may be this Document or a child
     * @param {string} collection       The collection within which documents are being updated
     * @param {object[]} changes        The array of differential Document updates to be applied
     * @param {object} options          Options which modified the update operation
     * @param {string} userId           The ID of the User who triggered the operation
     * @protected
     */
    _preUpdateDescendantDocuments(parent, collection, changes, options, userId) {}

    /* -------------------------------------------- */

    /**
     * Actions taken after descendant documents have been updated and changes have been applied to client data.
     * @param {Document} parent         The direct parent of the updated Documents, may be this Document or a child
     * @param {string} collection       The collection within which documents were updated
     * @param {Document[]} documents    The array of updated Documents
     * @param {object[]} changes        The array of differential Document updates which were applied
     * @param {object} options          Options which modified the update operation
     * @param {string} userId           The ID of the User who triggered the operation
     * @protected
     */
    _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
      if ( options.render === false ) return;
      this.render(false, {renderContext: `update.${collection}`});
    }

    /* -------------------------------------------- */

    /**
     * Actions taken after descendant documents have been deleted, but before deletions are applied to the client data.
     * @param {Document} parent         The direct parent of the deleted Documents, may be this Document or a child
     * @param {string} collection       The collection within which documents were deleted
     * @param {string[]} ids            The array of document IDs which were deleted
     * @param {object} options          Options which modified the deletion operation
     * @param {string} userId           The ID of the User who triggered the operation
     * @protected
     */
    _preDeleteDescendantDocuments(parent, collection, ids, options, userId) {}

    /* -------------------------------------------- */

    /**
     * Actions taken after descendant documents have been deleted and those deletions have been applied to client data.
     * @param {Document} parent         The direct parent of the deleted Documents, may be this Document or a child
     * @param {string} collection       The collection within which documents were deleted
     * @param {Document[]} documents    The array of Documents which were deleted
     * @param {string[]} ids            The array of document IDs which were deleted
     * @param {object} options          Options which modified the deletion operation
     * @param {string} userId           The ID of the User who triggered the operation
     * @protected
     */
    _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
      if ( options.render === false ) return;
      this.render(false, {renderContext: `delete.${collection}`});
    }

    /* -------------------------------------------- */

    /**
     * Whenever the Document's sheet changes, close any existing applications for this Document, and re-render the new
     * sheet if one was already open.
     * @param {object} [options]
     * @param {boolean} [options.sheetOpen]  Whether the sheet was originally open and needs to be re-opened.
     * @internal
     */
    async _onSheetChange({ sheetOpen }={}) {
      sheetOpen ??= this.sheet.rendered;
      await Promise.all(Object.values(this.apps).map(app => app.close()));
      this._sheet = null;
      if ( sheetOpen ) this.sheet.render(true);

      // Re-draw the parent sheet in case of a dependency on the child sheet.
      this.parent?.sheet?.render(false);
    }

    /* -------------------------------------------- */

    /**
     * Gets the default new name for a Document
     * @returns {string}
     */
    static defaultName() {
      const label = game.i18n.localize(this.metadata.label);
      const documentName = this.metadata.name;
      const count = game.collections.get(documentName)?.size;
      let defaultName = game.i18n.format("DOCUMENT.New", {type: label});
      if ( count > 0 ) defaultName += ` (${count + 1})`;
      return defaultName;
    }

    /* -------------------------------------------- */
    /*  Importing and Exporting                     */
    /* -------------------------------------------- */

    /**
     * Present a Dialog form to create a new Document of this type.
     * Choose a name and a type from a select menu of types.
     * @param {object} data              Initial data with which to populate the creation form
     * @param {object} [context={}]      Additional context options or dialog positioning options
     * @param {Document|null} [context.parent]   A parent document within which the created Document should belong
     * @param {string|null} [context.pack]       A compendium pack within which the Document should be created
     * @returns {Promise<Document|null>} A Promise which resolves to the created Document, or null if the dialog was
     *                                   closed.
     * @memberof ClientDocumentMixin
     */
    static async createDialog(data={}, {parent=null, pack=null, ...options}={}) {

      // Collect data
      const documentName = this.metadata.name;
      const types = game.documentTypes[documentName].filter(t => t !== CONST.BASE_DOCUMENT_TYPE);
      let collection;
      if ( !parent ) {
        if ( pack ) collection = game.packs.get(pack);
        else collection = game.collections.get(documentName);
      }
      const folders = collection?._formatFolderSelectOptions() ?? [];
      const label = game.i18n.localize(this.metadata.label);
      const title = game.i18n.format("DOCUMENT.Create", {type: label});
      // Render the document creation form
      const html = await renderTemplate("templates/sidebar/document-create.html", {
        folders,
        name: data.name || game.i18n.format("DOCUMENT.New", {type: label}),
        folder: data.folder,
        hasFolders: folders.length >= 1,
        type: data.type || CONFIG[documentName]?.defaultType || types[0],
        types: types.reduce((obj, t) => {
          const label = CONFIG[documentName]?.typeLabels?.[t] ?? t;
          obj[t] = game.i18n.has(label) ? game.i18n.localize(label) : t;
          return obj;
        }, {}),
        hasTypes: types.length > 1
      });

      // Render the confirmation dialog window
      return Dialog.prompt({
        title: title,
        content: html,
        label: title,
        callback: html => {
          const form = html[0].querySelector("form");
          const fd = new FormDataExtended(form);
          foundry.utils.mergeObject(data, fd.object, {inplace: true});
          if ( !data.folder ) delete data.folder;
          if ( types.length === 1 ) data.type = types[0];
          if ( !data.name?.trim() ) data.name = this.defaultName();
          return this.create(data, {parent, pack, renderSheet: true});
        },
        rejectClose: false,
        options
      });
    }

    /* -------------------------------------------- */

    /**
     * Present a Dialog form to confirm deletion of this Document.
     * @param {object} [options]    Positioning and sizing options for the resulting dialog
     * @returns {Promise<Document>} A Promise which resolves to the deleted Document
     */
    async deleteDialog(options={}) {
      const type = game.i18n.localize(this.constructor.metadata.label);
      return Dialog.confirm({
        title: `${game.i18n.format("DOCUMENT.Delete", {type})}: ${this.name}`,
        content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.format("SIDEBAR.DeleteWarning", {type})}</p>`,
        yes: this.delete.bind(this),
        options: options
      });
    }

    /* -------------------------------------------- */

    /**
     * Export document data to a JSON file which can be saved by the client and later imported into a different session.
     * @param {object} [options]      Additional options passed to the {@link ClientDocumentMixin#toCompendium} method
     * @memberof ClientDocumentMixin#
     */
    exportToJSON(options) {
      const data = this.toCompendium(null, options);
      data.flags.exportSource = {
        world: game.world.id,
        system: game.system.id,
        coreVersion: game.version,
        systemVersion: game.system.version
      };
      const filename = ["fvtt", this.documentName, this.name?.slugify(), this.id].filterJoin("-");
      saveDataToFile(JSON.stringify(data, null, 2), "text/json", `${filename}.json`);
    }

    /* -------------------------------------------- */

    /**
     * Create a content link for this Document.
     * @param {object} [options]                  Additional options to configure how the link is constructed.
     * @param {object<string>} [options.attrs]    Attributes to set on the link.
     * @param {object<string>} [options.dataset]  Custom data- attributes to set on the link.
     * @param {string[]} [options.classes]        Additional classes to add to the link.
     *                                            The `content-link` class is added by default.
     * @param {string} [options.name]             A name to use for the Document, if different from the Document's name.
     * @param {string} [options.icon]             A font-awesome icon class to use as the icon, if different to the
     *                                            Document's configured sidebarIcon.
     * @returns {HTMLAnchorElement}
     */
    toAnchor({attrs={}, dataset={}, classes=[], name, icon}={}) {

      // Build dataset
      const documentConfig = CONFIG[this.documentName];
      const documentName = game.i18n.localize(`DOCUMENT.${this.documentName}`);
      let anchorIcon = icon ?? documentConfig.sidebarIcon;
      dataset = foundry.utils.mergeObject({
        uuid: this.uuid,
        id: this.id,
        type: this.documentName,
        pack: this.pack,
        tooltip: documentName
      }, dataset);

      // If this is a typed document, add the type to the dataset
      if ( this.type ) {
        const typeLabel = documentConfig.typeLabels[this.type];
        const typeName = game.i18n.has(typeLabel) ? `${game.i18n.localize(typeLabel)}` : "";
        dataset.tooltip = typeName ? game.i18n.format("DOCUMENT.TypePageFormat", {type: typeName, page: documentName})
          : documentName;
        anchorIcon = icon ?? documentConfig.typeIcons?.[this.type] ?? documentConfig.sidebarIcon;
      }

      // Construct Link
      const a = document.createElement("a");
      a.classList.add("content-link", ...classes);
      Object.entries(attrs).forEach(([k, v]) => a.setAttribute(k, v));
      for ( const [k, v] of Object.entries(dataset) ) {
        if ( v !== null ) a.dataset[k] = v;
      }
      a.innerHTML = `<i class="${anchorIcon}"></i>${name ?? this.name}`;
      return a;
    }

    /* -------------------------------------------- */

    /**
     * Serialize salient information about this Document when dragging it.
     * @returns {object}  An object of drag data.
     */
    toDragData() {
      const dragData = {type: this.documentName};
      if ( this.id ) dragData.uuid = this.uuid;
      else dragData.data = this.toObject();
      return dragData;
    }

    /* -------------------------------------------- */

    /**
     * A helper function to handle obtaining the relevant Document from dropped data provided via a DataTransfer event.
     * The dropped data could have:
     * 1. A data object explicitly provided
     * 2. A UUID
     * @memberof ClientDocumentMixin
     *
     * @param {object} data           The data object extracted from a DataTransfer event
     * @param {object} options        Additional options which affect drop data behavior
     * @returns {Promise<Document>}   The resolved Document
     * @throws If a Document could not be retrieved from the provided data.
     */
    static async fromDropData(data, options={}) {
      let document = null;

      /**
       * @deprecated since v10
       */
      if ( options.importWorld ) {
        const msg = "The importWorld option for ClientDocumentMixin.fromDropData is deprecated. The Document returned "
          + "by fromDropData should instead be persisted using the normal Document creation API.";
        foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
      }

      // Case 1 - Data explicitly provided
      if ( data.data ) document = new this(data.data);

      // Case 2 - UUID provided
      else if ( data.uuid ) document = await fromUuid(data.uuid);

      // Ensure that we retrieved a valid document
      if ( !document ) {
        throw new Error("Failed to resolve Document from provided DragData. Either data or a UUID must be provided.");
      }
      if ( document.documentName !== this.documentName ) {
        throw new Error(`Invalid Document type '${document.type}' provided to ${this.name}.fromDropData.`);
      }

      // Flag the source UUID
      if ( document.id && !document.getFlag("core", "sourceId") ) {
        document.updateSource({"flags.core.sourceId": document.uuid});
      }
      return document;
    }

    /* -------------------------------------------- */

    /**
     * Update this Document using a provided JSON string.
     * @this {ClientDocument}
     * @param {string} json                 Raw JSON data to import
     * @returns {Promise<ClientDocument>}   The updated Document instance
     */
    async importFromJSON(json) {
      if ( !CONFIG[this.documentName]?.collection ) throw new Error("Only primary Documents may be imported from JSON");

      // Construct a document class to (strictly) clean and validate the source data
      const doc = new this.constructor(JSON.parse(json), {strict: true});

      // Treat JSON import using the same workflows that are used when importing from a compendium pack
      const data = this.collection.fromCompendium(doc, {addFlags: false});

      // Preserve certain fields from the destination document
      const preserve = Object.fromEntries(this.constructor.metadata.preserveOnImport.map(k => {
        return [k, foundry.utils.getProperty(this, k)];
      }));
      preserve.folder = this.folder?.id;
      foundry.utils.mergeObject(data, preserve);

      // Commit the import as an update to this document
      await this.update(data, {diff: false, recursive: false, noHook: true});
      ui.notifications.info(game.i18n.format("DOCUMENT.Imported", {document: this.documentName, name: this.name}));
      return this;
    }

    /* -------------------------------------------- */

    /**
     * Render an import dialog for updating the data related to this Document through an exported JSON file
     * @returns {Promise<void>}
     * @memberof ClientDocumentMixin#
     */
    async importFromJSONDialog() {
      new Dialog({
        title: `Import Data: ${this.name}`,
        content: await renderTemplate("templates/apps/import-data.html", {
          hint1: game.i18n.format("DOCUMENT.ImportDataHint1", {document: this.documentName}),
          hint2: game.i18n.format("DOCUMENT.ImportDataHint2", {name: this.name})
        }),
        buttons: {
          import: {
            icon: '<i class="fas fa-file-import"></i>',
            label: "Import",
            callback: html => {
              const form = html.find("form")[0];
              if ( !form.data.files.length ) return ui.notifications.error("You did not upload a data file!");
              readTextFromFile(form.data.files[0]).then(json => this.importFromJSON(json));
            }
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "import"
      }, {
        width: 400
      }).render(true);
    }

    /* -------------------------------------------- */

    /**
     * Transform the Document data to be stored in a Compendium pack.
     * Remove any features of the data which are world-specific.
     * @param {CompendiumCollection} [pack]   A specific pack being exported to
     * @param {object} [options]              Additional options which modify how the document is converted
     * @param {boolean} [options.clearFlags=false]      Clear the flags object
     * @param {boolean} [options.clearSource=true]      Clear any prior sourceId flag
     * @param {boolean} [options.clearSort=true]        Clear the currently assigned sort order
     * @param {boolean} [options.clearFolder=false]     Clear the currently assigned folder
     * @param {boolean} [options.clearOwnership=true]   Clear document ownership
     * @param {boolean} [options.clearState=true]       Clear fields which store document state
     * @param {boolean} [options.keepId=false]          Retain the current Document id
     * @returns {object}                      A data object of cleaned data suitable for compendium import
     * @memberof ClientDocumentMixin#
     */
    toCompendium(pack, {clearSort=true, clearFolder=false, clearFlags=false, clearSource=true, clearOwnership=true,
      clearState=true, keepId=false} = {}) {
      const data = this.toObject();
      if ( !keepId ) delete data._id;
      if ( clearSort ) delete data.sort;
      if ( clearFolder ) delete data.folder;
      if ( clearFlags ) delete data.flags;
      if ( clearSource ) delete data.flags?.core?.sourceId;
      if ( clearOwnership ) delete data.ownership;
      if ( clearState ) delete data.active;
      return data;
    }

    /* -------------------------------------------- */
    /*  Deprecations                                */
    /* -------------------------------------------- */

    /**
     * The following are stubs to prevent errors where existing classes may be attempting to call them via super.
     */

    /**
     * @deprecated since v11
     * @ignore
     */
    _preCreateEmbeddedDocuments() {}

    /**
     * @deprecated since v11
     * @ignore
     */
    _preUpdateEmbeddedDocuments() {}

    /**
     * @deprecated since v11
     * @ignore
     */
    _preDeleteEmbeddedDocuments() {}

    /**
     * @deprecated since v11
     * @ignore
     */
    _onCreateEmbeddedDocuments() {}

    /**
     * @deprecated since v11
     * @ignore
     */
    _onUpdateEmbeddedDocuments() {}

    /**
     * @deprecated since v11
     * @ignore
     */
    _onDeleteEmbeddedDocuments() {}
  };
}
