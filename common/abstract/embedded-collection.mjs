import Collection from "../utils/collection.mjs";
import {randomID} from "../utils/helpers.mjs";

/**
 * An extension of the Collection.
 * Used for the specific task of containing embedded Document instances within a parent Document.
 */
export default class EmbeddedCollection extends Collection {
  /**
   * @param {string} name           The name of this collection in the parent Document.
   * @param {DataModel} parent      The parent DataModel instance to which this collection belongs.
   * @param {object[]} sourceArray  The source data array for the collection in the parent Document data.
   */
  constructor(name, parent, sourceArray) {
    if ( typeof name !== "string" ) throw new Error("The signature of EmbeddedCollection has changed in v11.");
    super();
    Object.defineProperties(this, {
      _source: {value: sourceArray, writable: false},
      documentClass: {value: parent.constructor.hierarchy[name].model, writable: false},
      name: {value: name, writable: false},
      model: {value: parent, writable: false}
    });
  }

  /**
   * The Document implementation used to construct instances within this collection.
   * @type {typeof foundry.abstract.Document}
   */
  documentClass;

  /**
   * The name of this collection in the parent Document.
   * @type {string}
   */
  name;

  /**
   * The parent DataModel to which this EmbeddedCollection instance belongs.
   * @type {DataModel}
   */
  model;

  /**
   * Has this embedded collection been initialized as a one-time workflow?
   * @type {boolean}
   * @protected
   */
  _initialized = false;

  /**
   * The source data array from which the embedded collection is created
   * @type {object[]}
   * @private
   */
  _source;

  /**
   * Record the set of document ids where the Document was not initialized because of invalid source data
   * @type {Set<string>}
   */
  invalidDocumentIds = new Set();

  /* -------------------------------------------- */

  /**
   * Instantiate a Document for inclusion in the Collection.
   * @param {object} data       The Document data.
   * @param {object} [context]  Document creation context.
   * @returns {Document}
   */
  createDocument(data, context={}) {
    return new this.documentClass(data, {
      ...context,
      parent: this.model,
      parentCollection: this.name,
      pack: this.model.pack
    });
  }

  /* -------------------------------------------- */

  /**
   * Initialize the EmbeddedCollection object by constructing its contained Document instances
   * @param {object} [options]  Initialization options.
   * @param {boolean} [options.strict=true]  Whether to log an error or a warning when encountering invalid embedded
   *                                         documents.
   */
  initialize({strict=true, ...options}={}) {

    // Repeat initialization
    if ( this._initialized ) {
      for ( const doc of this ) {
        doc._initialize(options);
      }
      return;
    }

    // First-time initialization
    this.clear();
    for ( let d of this._source ) {
      this._initializeDocument(d, {strict});
    }

    this._initialized = true;
  }

  /* -------------------------------------------- */

  /**
   * Initialize an embedded document and store it in the collection.
   * @param {object} data                    The Document data.
   * @param {object} [options]               Options to configure Document initialization.
   * @param {boolean} [options.strict=true]  Whether to log an error or warning if the Document fails to initialize.
   * @protected
   */
  _initializeDocument(data, {strict=true}) {
    if ( !data._id ) data._id = randomID(16);
    let doc;
    try {
      doc = this.createDocument(data);
      super.set(doc.id, doc);
    } catch(err) {
      this._handleInvalidDocument(data._id, err, {strict});
    }
  }

  /* -------------------------------------------- */

  /**
   * Log warnings or errors when a Document is found to be invalid.
   * @param {string} id                      The invalid Document's ID.
   * @param {Error} err                      The validation error.
   * @param {object} [options]               Options to configure invalid Document handling.
   * @param {boolean} [options.strict=true]  Whether to throw an error or only log a warning.
   * @protected
   */
  _handleInvalidDocument(id, err, {strict=true}={}) {
    const docName = this.documentClass.documentName;
    const parent = this.model;
    const parentName = this.model.documentName ?? this.model.name;
    this.invalidDocumentIds.add(id);
    err.message = `Failed to initialize ${docName} [${id}] in ${parentName} [${parent._id}]: ${err.message}`;
    if ( strict ) globalThis.logger.error(err);
    else globalThis.logger.warn(err);
    if ( globalThis.Hooks && strict ) {
      Hooks.onError(`${this.constructor.name}#_initializeDocument`, err, {id, documentName: docName});
    }
  }

  /* -------------------------------------------- */

  /**
   * Get an element from the EmbeddedCollection by its ID.
   * @param {string} id                        The ID of the Embedded Document to retrieve.
   * @param {object} [options]                 Additional options to configure retrieval.
   * @param {boolean} [options.strict=false]   Throw an Error if the requested Embedded Document does not exist.
   * @param {boolean} [options.invalid=false]  Allow retrieving an invalid Embedded Document.
   * @returns {Document}
   * @throws If strict is true and the Embedded Document cannot be found.
   */
  get(id, {invalid=false, strict=false}={}) {
    let result = super.get(id);
    if ( !result && invalid ) result = this.getInvalid(id, { strict: false });
    if ( !result && strict ) throw new Error(`${this.constructor.documentName} id [${id}] does not exist in the `
      + `${this.constructor.name} collection.`);
    return result;
  }

  /* ---------------------------------------- */

  /**
   * Add an item to the collection.
   * @param {string} key                           The embedded Document ID.
   * @param {Document} value                       The embedded Document instance.
   * @param {object} [options]                     Additional options to the set operation.
   * @param {boolean} [options.modifySource=true]  Whether to modify the collection's source as part of the operation.
   * */
  set(key, value, {modifySource=true, ...options}={}) {
    if ( modifySource ) this._set(key, value, options);
    return super.set(key, value);
  }

  /* -------------------------------------------- */

  /**
   * Modify the underlying source array to include the Document.
   * @param {string} key      The Document ID key.
   * @param {Document} value  The Document.
   * @protected
   */
  _set(key, value) {
    if ( this.has(key) ) this._source.findSplice(d => d._id === key, value._source);
    else this._source.push(value._source);
  }

  /* ---------------------------------------- */

  /**
   * @param {string} key                           The embedded Document ID.
   * @param {object} [options]                     Additional options to the delete operation.
   * @param {boolean} [options.modifySource=true]  Whether to modify the collection's source as part of the operation.
   * */
  delete(key, {modifySource=true, ...options}={}) {
    if ( modifySource ) this._delete(key, options);
    return super.delete(key);
  }

  /* -------------------------------------------- */

  /**
   * Remove the value from the underlying source array.
   * @param {string} key        The Document ID key.
   * @param {object} [options]  Additional options to configure deletion behavior.
   * @protected
   */
  _delete(key, options={}) {
    if ( this.has(key) ) this._source.findSplice(d => d._id === key);
  }

  /* ---------------------------------------- */

  /**
   * Update an EmbeddedCollection using an array of provided document data.
   * @param {DataModel[]} changes         An array of provided Document data
   * @param {object} [options={}]         Additional options which modify how the collection is updated
   */
  update(changes, options={}) {
    const updated = new Set();

    // Create or update documents within the collection
    for ( let data of changes ) {
      if ( !data._id ) data._id = randomID(16);
      this._createOrUpdate(data, options);
      updated.add(data._id);
    }

    // If the update was not recursive, remove all non-updated documents
    if ( options.recursive === false ) {
      for ( const id of this._source.map(d => d._id) ) {
        if ( !updated.has(id) ) this.delete(id, options);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Create or update an embedded Document in this collection.
   * @param {DataModel} data       The update delta.
   * @param {object} [options={}]  Additional options which modify how the collection is updated.
   * @protected
   */
  _createOrUpdate(data, options) {
    const current = this.get(data._id);
    if ( current ) current.updateSource(data, options);
    else {
      const doc = this.createDocument(data);
      this.set(doc.id, doc);
    }
  }

  /* ---------------------------------------- */

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
    return this.documentClass.fromSource(foundry.utils.deepClone(data), {parent: this.model});
  }

  /* ---------------------------------------- */

  /**
   * Convert the EmbeddedCollection to an array of simple objects.
   * @param {boolean} [source=true]     Draw data for contained Documents from the underlying data source?
   * @returns {object[]}                The extracted array of primitive objects
   */
  toObject(source=true) {
    const arr = [];
    for ( let doc of this.values() ) {
      arr.push(doc.toObject(source));
    }
    return arr;
  }
}
