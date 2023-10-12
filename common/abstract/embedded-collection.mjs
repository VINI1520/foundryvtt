import Collection from "../utils/collection.mjs";
import {randomID} from "../utils/helpers.mjs";

/**
 * An extension of the Collection.
 * Used for the specific task of containing embedded Document instances within a parent Document.
 */
export default class EmbeddedCollection extends Collection {
  /**
   * @param {DataModel} model           The parent DataModel instance to which this collection belongs
   * @param {object[]} sourceArray      The source data array for the collection in the parent Document data
   * @param {typeof foundry.abstract.Document} documentClass The Document class contained in the collection
   */
  constructor(model, sourceArray, documentClass) {
    super();
    this.#model = model
    Object.defineProperty(this, "_source", {value: sourceArray, writable: false});
    Object.defineProperty(this, "documentClass", {value: documentClass, writable: false});
  }

  /**
   * The Document implementation used to construct instances within this collection.
   * @type {typeof foundry.abstract.Document}
   */
  documentClass;

  /**
   * The parent DataModel to which this EmbeddedCollection instance belongs.
   * @type {DataModel}
   * @private
   */
  #model;

  /**
   * Has this embedded collection been initialized as a one-time workflow?
   * @type {boolean}
   */
  #initialized = false;

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
   * Initialize the EmbeddedCollection object by constructing its contained Document instances
   * @param {object} [options]  Initialization options.
   * @param {boolean} [options.strict=true]  Whether to log an error or a warning when encountering invalid embedded
   *                                         documents.
   */
  initialize({strict=true, ...options}={}) {

    // Repeat initialization
    if ( this.#initialized ) {
      for ( const doc of this ) {
        doc._initialize();
      }
      return;
    }

    // First-time initialization
    this.clear();
    const docName = this.documentClass["documentName"];
    const parent = this.#model;
    const parentName = this.#model["documentName"] ?? this.#model["name"];
    for ( let d of this._source ) {
      if ( !d._id ) d._id = randomID(16);
      let doc;
      try {
        doc = new this.documentClass(d, {parent});
        this.set(doc.id, doc, {modifySource: false});
      } catch(err) {
        this.invalidDocumentIds.add(d._id);
        err.message = `Failed to initialized ${docName} [${d._id}] in ${parentName} [${parent._id}]: ${err.message}`;
        if ( strict ) globalThis.logger.error(err);
        else globalThis.logger.warn(err);
        if ( globalThis.Hooks && strict ) {
          Hooks.onError("EmbeddedCollection#_initialize", err, {id: d._id, documentName: docName});
        }
      }
    }
    this.#initialized = true;
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  set(key, value, {modifySource=true}={}) {
    if ( modifySource && !this.has(key) ) this._source.push(value._source);
    return super.set(key, value);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  delete(key, {modifySource=true}={}) {
    if ( modifySource && this.has(key) ) this._source.findSplice(d => d._id === key);
    return super.delete(key);
  }

  /* ---------------------------------------- */

  /**
   * Update an EmbeddedCollection using an array of provided document data.
   * @param {DataModel[]} changes         An array of provided Document data
   * @param {object} [options={}]         Additional options which modify how the collection is updated
   */
  update(changes, options={}) {
    const currentIds = Array.from(this.keys());
    const updated = new Set();

    // Create or update documents within the collection
    for ( let data of changes ) {
      if ( !data._id ) data._id = randomID(16);
      const current = this.get(data._id);
      if ( current ) current.updateSource(data, options);
      else {
        const doc = new this.documentClass(data, {parent: this.#model});
        this.set(doc.id, doc);
      }
      updated.add(data._id);
    }

    // If the update was not recursive, remove all non-updated documents
    if ( options.recursive === false ) {
      for ( let id of currentIds ) {
        if ( !updated.has(id) ) this.delete(id);
      }
    }
  }

  /* ---------------------------------------- */

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
    return this.documentClass.fromSource(data, {parent: this.#model});
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
