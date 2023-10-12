/**
 * An abstract subclass of the Collection container which defines a collection of Document instances.
 * @extends {Collection}
 * @abstract
 *
 * @param {object[]} data      An array of data objects from which to create document instances
 */
class DocumentCollection extends foundry.utils.Collection {
  constructor(data=[]) {
    super();

    /**
     * The source data array from which the Documents in the WorldCollection are created
     * @type {object[]}
     * @private
     */
    Object.defineProperty(this, "_source", {
      value: data,
      writable: false
    });

    /**
     * An Array of application references which will be automatically updated when the collection content changes
     * @type {Application[]}
     */
    this.apps = [];

    // Initialize data
    this._initialize();
  }

  /* -------------------------------------------- */

  /**
   * Initialize the DocumentCollection by constructing any initially provided Document instances
   * @private
   */
  _initialize() {
    this.clear();
    for ( let d of this._source ) {
      let doc;
      if ( game.issues ) game.issues._countDocumentSubType(this.documentName, d);
      try {
        doc = this.documentClass.fromSource(d, {strict: true, dropInvalidEmbedded: true});
        super.set(doc.id, doc);
      } catch(err) {
        this.invalidDocumentIds.add(d._id);
        if ( game.issues ) game.issues._trackValidationFailure(this, d, err);
        Hooks.onError(`${this.constructor.name}#_initialize`, err, {
          msg: `Failed to initialize ${this.documentName} [${d._id}]`,
          log: "error",
          id: d._id
        });
      }
    }
  }

  /* -------------------------------------------- */
  /*  Collection Properties                       */
  /* -------------------------------------------- */

  /**
   * A reference to the Document class definition which is contained within this DocumentCollection.
   * @type {Function}
   */
  get documentClass() {
    return getDocumentClass(this.documentName);
  }

  /** @inheritdoc */
  get documentName() {
    const name = this.constructor.documentName;
    if ( !name ) throw new Error("A subclass of DocumentCollection must define its static documentName");
    return name;
  }

  /**
   * The base Document type which is contained within this DocumentCollection
   * @type {string}
   */
  static documentName;

  /**
   * Record the set of document ids where the Document was not initialized because of invalid source data
   * @type {Set<string>}
   */
  invalidDocumentIds = new Set();

  /**
   * The Collection class name
   * @type {string}
   */
  get name() {
    return this.constructor.name;
  }

  /* -------------------------------------------- */
  /*  Collection Methods                          */
  /* -------------------------------------------- */

  /**
   * Instantiate a Document for inclusion in the Collection.
   * @param {object} data       The Document data.
   * @param {object} [context]  Document creation context.
   * @returns {Document}
   */
  createDocument(data, context={}) {
    return new this.documentClass(data, context);
  }

  /* -------------------------------------------- */

  /**
   * Obtain a temporary Document instance for a document id which currently has invalid source data.
   * @param {string} id                      A document ID with invalid source data.
   * @param {object} [options]               Additional options to configure retrieval.
   * @param {boolean} [options.strict=true]  Throw an Error if the requested ID is not in the set of invalid IDs for
   *                                         this collection.
   * @returns {Document}                     An in-memory instance for the invalid Document
   * @throws If strict is true and the requested ID is not in the set of invalid IDs for this collection.
   */
  getInvalid(id, {strict=true}={}) {
    if ( !this.invalidDocumentIds.has(id) ) {
      if ( strict ) throw new Error(`${this.constructor.documentName} id [${id}] is not in the set of invalid ids`);
      return;
    }
    const data = this._source.find(d => d._id === id);
    return this.documentClass.fromSource(foundry.utils.deepClone(data));
  }

  /* -------------------------------------------- */

  /**
   * Get an element from the DocumentCollection by its ID.
   * @param {string} id                        The ID of the Document to retrieve.
   * @param {object} [options]                 Additional options to configure retrieval.
   * @param {boolean} [options.strict=false]   Throw an Error if the requested Document does not exist.
   * @param {boolean} [options.invalid=false]  Allow retrieving an invalid Document.
   * @returns {Document}
   * @throws If strict is true and the Document cannot be found.
   */
  get(id, {invalid=false, strict=false}={}) {
    let result = super.get(id);
    if ( !result && invalid ) result = this.getInvalid(id, { strict: false });
    if ( !result && strict ) throw new Error(`${this.constructor.documentName} id [${id}] does not exist in the `
      + `${this.constructor.name} collection.`);
    return result;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  set(id, document) {
    const cls = this.documentClass;
    if (!(document instanceof cls)) {
      throw new Error(`You may only push instances of ${cls.documentName} to the ${this.name} collection`);
    }
    const replacement = this.has(document.id);
    super.set(document.id, document);
    if ( replacement ) this._source.findSplice(e => e._id === id, document.toObject());
    else this._source.push(document.toObject());
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  delete(id) {
    super.delete(id);
    this._source.findSplice(e => e._id === id);
  }

  /* -------------------------------------------- */

  /**
   * Render any Applications associated with this DocumentCollection.
   */
  render(force, options) {
    for (let a of this.apps) a.render(force, options);
  }

  /* -------------------------------------------- */

  /**
   * The cache of search fields for each data model
   * @type {Map<string, Set<string>>}
   */
  static #dataModelSearchFieldsCache = new Map();

  /**
   * Get the searchable fields for a given document or index, based on its data model
   * @param {string} documentName         The document type name
   * @param {string} [documentSubtype=""] The document subtype name
   * @param {boolean} [isEmbedded=false]  Whether the document is an embedded object
   * @returns {Set<string>}               The dot-delimited property paths of searchable fields
   */
  static getSearchableFields(documentName, documentSubtype="", isEmbedded=false) {
    const isSubtype = !!documentSubtype;
    const cacheName = isSubtype ? `${documentName}.${documentSubtype}` : documentName;

    // If this already exists in the cache, return it
    if ( DocumentCollection.#dataModelSearchFieldsCache.has(cacheName) ) {
      return DocumentCollection.#dataModelSearchFieldsCache.get(cacheName);
    }

    // Load the Document DataModel
    const docConfig = CONFIG[documentName];
    if ( !docConfig ) throw new Error(`Could not find configuration for ${documentName}`);

    // Read the fields that can be searched from the dataModel
    const textSearchFields = new Set(["name"]);
    const dataModel = (isSubtype && !isEmbedded) ? docConfig.dataModels[documentSubtype] : docConfig.documentClass;
    if ( !dataModel ) return textSearchFields;

    dataModel.schema.apply(function() {
      if ( (this instanceof foundry.data.fields.StringField) && this.textSearch ) {
        const [, ...path] = this.fieldPath.split(".");
        const searchPath = (isSubtype && !isEmbedded) ? ["system", ...path].join(".") : [...path].join(".");
        textSearchFields.add(searchPath);
      }
    });

    // Cache the result
    DocumentCollection.#dataModelSearchFieldsCache.set(cacheName, textSearchFields);

    return textSearchFields;
  }

  /* -------------------------------------------- */

  /**
   * Find all Documents which match a given search term using a full-text search against their indexed HTML fields and their name.
   * If filters are provided, results are filtered to only those that match the provided values.
   * @param {object} search                      An object configuring the search
   * @param {string} [search.query]              A case-insensitive search string
   * @param {FieldFilter[]} [search.filters]     An array of filters to apply
   * @param {string[]} [search.exclude]          An array of document IDs to exclude from search results
   * @returns {string[]}
   */
  search({query= "", filters=[], exclude=[]}) {
    query = SearchFilter.cleanQuery(query);
    const regex = new RegExp(RegExp.escape(query), "i");
    const results = [];
    const hasFilters = !foundry.utils.isEmpty(filters);
    for ( const doc of this.index ?? this.contents ) {
      if ( exclude.includes(doc._id) ) continue;
      let isMatch = !query ? true : false;

      // Do a full-text search against any searchable fields based on metadata
      if ( query ) {
        const textSearchFields = DocumentCollection.getSearchableFields(
          doc.constructor.documentName ?? this.documentName, doc.type, !!doc.parentCollection);
        for ( const field of textSearchFields ) {
          const value = foundry.utils.getProperty(doc, field);
          if ( value && regex.test(SearchFilter.cleanQuery(value)) ) {
            isMatch = true;
            break; // No need to evaluate other fields, we already know this is a match
          }
        }
      }

      // Apply filters
      if ( hasFilters ) {
        for ( const filter of filters ) {
          if ( !SearchFilter.evaluateFilter(doc, filter) ) {
            isMatch = false;
            break; // No need to evaluate other filters, we already know this is not a match
          }
        }
      }

      if ( isMatch ) results.push(doc);
    }

    return results;
  }

  /* -------------------------------------------- */
  /*  Database Operations                         */
  /* -------------------------------------------- */

  /**
   * Update all objects in this DocumentCollection with a provided transformation.
   * Conditionally filter to only apply to Entities which match a certain condition.
   * @param {Function|object} transformation    An object of data or function to apply to all matched objects
   * @param {Function|null}  condition          A function which tests whether to target each object
   * @param {object} [options]                  Additional options passed to Document.update
   * @return {Promise<Document[]>}              An array of updated data once the operation is complete
   */
  async updateAll(transformation, condition=null, options={}) {
    const hasTransformer = transformation instanceof Function;
    if ( !hasTransformer && (foundry.utils.getType(transformation) !== "Object") ) {
      throw new Error("You must provide a data object or transformation function");
    }
    const hasCondition = condition instanceof Function;
    const updates = [];
    for ( let doc of this ) {
      if ( hasCondition && !condition(doc) ) continue;
      const update = hasTransformer ? transformation(doc) : foundry.utils.deepClone(transformation);
      update._id = doc.id;
      updates.push(update);
    }
    return this.documentClass.updateDocuments(updates, options);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Preliminary actions taken before a set of Documents in this Collection are created.
   * @param {object[]} result       An Array of created data objects
   * @param {object} options        Options which modified the creation operation
   * @param {string} userId         The ID of the User who triggered the operation
   * @internal
   */
  _preCreateDocuments(result, options, userId) {}

  /* -------------------------------------------- */

  /**
   * Follow-up actions taken after a set of Documents in this Collection are created.
   * @param {Document[]} documents  An Array of created Documents
   * @param {object[]} result       An Array of created data objects
   * @param {object} options        Options which modified the creation operation
   * @param {string} userId         The ID of the User who triggered the operation
   * @internal
   */
  _onCreateDocuments(documents, result, options, userId) {
    if ( options.render !== false ) this.render(false, this._getRenderContext("create", documents, result));
  }

  /* -------------------------------------------- */

  /**
   * Preliminary actions taken before a set of Documents in this Collection are updated.
   * @param {object[]} result       An Array of incremental data objects
   * @param {object} options        Options which modified the update operation
   * @param {string} userId         The ID of the User who triggered the operation
   * @internal
   */
  _preUpdateDocuments(result, options, userId) {}

  /* -------------------------------------------- */

  /**
   * Follow-up actions taken after a set of Documents in this Collection are updated.
   * @param {Document[]} documents  An Array of updated Documents
   * @param {object[]} result       An Array of incremental data objects
   * @param {object} options        Options which modified the update operation
   * @param {string} userId         The ID of the User who triggered the operation
   * @internal
   */
  _onUpdateDocuments(documents, result, options, userId) {
    if ( options.render !== false ) this.render(false, this._getRenderContext("update", documents, result));
  }

  /* -------------------------------------------- */

  /**
   * Preliminary actions taken before a set of Documents in this Collection are deleted.
   * @param {string[]} result       An Array of document IDs being deleted
   * @param {object} options        Options which modified the deletion operation
   * @param {string} userId         The ID of the User who triggered the operation
   * @internal
   */
  _preDeleteDocuments(result, options, userId) {}

  /* -------------------------------------------- */

  /**
   * Follow-up actions taken after a set of Documents in this Collection are deleted.
   * @param {Document[]} documents  An Array of deleted Documents
   * @param {string[]} result       An Array of document IDs being deleted
   * @param {object} options        Options which modified the deletion operation
   * @param {string} userId         The ID of the User who triggered the operation
   * @internal
   */
  _onDeleteDocuments(documents, result, options, userId) {
    if ( options.render !== false ) this.render(false, this._getRenderContext("delete", documents, result));
  }

  /* -------------------------------------------- */

  /**
   * Handle shifting documents in a deleted folder to a new parent folder.
   * @param {Folder} parentFolder     The parent folder to which documents should be shifted
   * @param {string} deleteFolderId   The ID of the folder being deleted
   * @param {boolean} deleteContents  Whether to delete the contents of the folder
   * @returns {string[]}              An array of document IDs to deleted
   * @internal
   */
  _onDeleteFolder(parentFolder, deleteFolderId, deleteContents) {
    const deleteDocumentIds = [];
    for ( let d of this ) {
      if ( d._source.folder !== deleteFolderId ) continue;
      if ( deleteContents ) deleteDocumentIds.push(d.id ?? d._id);
      else d.updateSource({folder: parentFolder});
    }
    return deleteDocumentIds;
  }

  /* -------------------------------------------- */

  /**
   * Generate the render context information provided for CRUD operations.
   * @param {string} action           The CRUD operation.
   * @param {Document[]} documents    The documents being operated on.
   * @param {object[]|string[]} data  An array of creation or update objects, or an array of document IDs, depending on
   *                                  the operation.
   * @returns {{action: string, documentType: string, documents: Document[], data: object[]|string[]}}
   * @private
   */
  _getRenderContext(action, documents, data) {
    const documentType = this.documentName;
    return {action, documentType, documents, data};
  }
}
