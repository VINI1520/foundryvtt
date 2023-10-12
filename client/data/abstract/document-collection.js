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
      try {
        doc = this.documentClass.fromSource(d, {strict: true});
        super.set(doc.id, doc);
      } catch(err) {
        this.invalidDocumentIds.add(d._id);
        Hooks.onError(`${this.constructor.name}#_initialize`, err, {
          msg: `Failed to initialized ${this.documentName} [${d._id}]`,
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
   * Obtain a temporary Document instance for a document id which currently has invalid source data.
   * @param {string} id         A document ID with invalid source data.
   * @returns {Document}        An in-memory instance for the invalid Document
   */
  getInvalid(id) {
    if ( !this.invalidDocumentIds.has(id) ) {
      throw new Error(`${this.constructor.documentName} id [${id}] is not in the set of invalid ids`);
    }
    const data = this._source.find(d => d._id === id);
    return this.documentClass.fromSource(foundry.utils.deepClone(data));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  set(id, document) {
    const cls = this.documentClass;
    if (!(document instanceof cls)) {
      throw new Error(`You may only push instances of ${cls.documentName} to the ${this.name} collection`);
    }
    super.set(document.id, document);
    this._source.push(document.toJSON());
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
   * @protected
   */
  _preCreateDocuments(result, options, userId) {}

  /* -------------------------------------------- */

  /**
   * Follow-up actions taken after a set of Documents in this Collection are created.
   * @param {Document[]} documents  An Array of created Documents
   * @param {object[]} result       An Array of created data objects
   * @param {object} options        Options which modified the creation operation
   * @param {string} userId         The ID of the User who triggered the operation
   * @protected
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
   * @protected
   */
  _preUpdateDocuments(result, options, userId) {}

  /* -------------------------------------------- */

  /**
   * Follow-up actions taken after a set of Documents in this Collection are updated.
   * @param {Document[]} documents  An Array of updated Documents
   * @param {object[]} result       An Array of incremental data objects
   * @param {object} options        Options which modified the update operation
   * @param {string} userId         The ID of the User who triggered the operation
   * @protected
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
   * @protected
   */
  _preDeleteDocuments(result, options, userId) {}

  /* -------------------------------------------- */

  /**
   * Follow-up actions taken after a set of Documents in this Collection are deleted.
   * @param {Document[]} documents  An Array of deleted Documents
   * @param {string[]} result       An Array of document IDs being deleted
   * @param {object} options        Options which modified the deletion operation
   * @param {string} userId         The ID of the User who triggered the operation
   * @protected
   */
  _onDeleteDocuments(documents, result, options, userId) {
    if ( options.render !== false ) this.render(false, this._getRenderContext("delete", documents, result));
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
