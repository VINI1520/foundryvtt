import EmbeddedCollection from "./embedded-collection.mjs";
import {deepClone, randomID} from "../utils/helpers.mjs";

/**
 * An embedded collection delta contains delta source objects that can be compared against other objects inside a base
 * embedded collection, and generate new embedded Documents by combining them.
 */
export default class EmbeddedCollectionDelta extends EmbeddedCollection {
  /**
   * Maintain a list of IDs that are managed by this collection delta to distinguish from those IDs that are inherited
   * from the base collection.
   * @type {Set<string>}
   */
  #managedIds = new Set();

  /* -------------------------------------------- */

  /**
   * Maintain a list of IDs that are tombstone Documents.
   * @type {Set<string>}
   */
  #tombstones = new Set();

  /* -------------------------------------------- */

  /**
   * A convenience getter to return the corresponding base collection.
   * @type {EmbeddedCollection}
   */
  get baseCollection() {
    return this.model.getBaseCollection?.(this.name);
  }

  /* -------------------------------------------- */

  /**
   * A convenience getter to return the corresponding synthetic collection.
   * @type {EmbeddedCollection}
   */
  get syntheticCollection() {
    return this.model.syntheticActor?.getEmbeddedCollection(this.name);
  }

  /* -------------------------------------------- */

  /** @override */
  createDocument(data, context={}) {
    return new this.documentClass(data, {
      ...context,
      parent: this.model.syntheticActor ?? this.model,
      parentCollection: this.name,
      pack: this.model.pack
    });
  }

  /* -------------------------------------------- */

  /** @override */
  initialize({strict=true, full=false, ...options} = {}) {
    // Repeat initialization.
    if ( this._initialized && !full ) return;

    // First-time initialization.
    this.clear();
    if ( !this.baseCollection ) return;

    // Initialize the deltas.
    for ( const d of this._source ) {
      if ( d._tombstone ) this.#tombstones.add(d._id);
      else this._initializeDocument(d, {strict});
      this.#managedIds.add(d._id);
    }

    // Include the Documents from the base collection.
    for ( const d of this.baseCollection._source ) {
      if ( this.has(d._id) || this.isTombstone(d._id) ) continue;
      this._initializeDocument(deepClone(d), {strict});
    }

    this._initialized = true;
  }

  /* -------------------------------------------- */

  /** @override */
  _initializeDocument(data, {strict=true}) {
    if ( !data._id ) data._id = randomID(16);
    let doc;
    if ( this.syntheticCollection ) doc = this.syntheticCollection.get(data._id);
    else {
      try {
        doc = this.createDocument(data);
      } catch(err) {
        this._handleInvalidDocument(data._id, err, {strict});
      }
    }
    if ( doc ) super.set(doc.id, doc, {modifySource: false});
  }

  /* -------------------------------------------- */

  /** @override */
  _createOrUpdate(data, options) {
    if ( options.recursive === false ) {
      if ( data._tombstone ) return this.delete(data._id);
      else if ( this.isTombstone(data._id) ) return this.set(data._id, this.createDocument(data));
    }
    else if ( this.isTombstone(data._id) || data._tombstone ) return;
    let doc = this.get(data._id);
    if ( doc ) doc.updateSource(data, options);
    else doc = this.createDocument(data);
    this.set(doc.id, doc);
  }

  /* -------------------------------------------- */

  /**
   * Determine whether a given ID is managed directly by this collection delta or inherited from the base collection.
   * @param {string} key  The Document ID.
   * @returns {boolean}
   */
  manages(key) {
    return this.#managedIds.has(key);
  }

  /* -------------------------------------------- */

  /**
   * Determine whether a given ID exists as a tombstone Document in the collection delta.
   * @param {string} key  The Document ID.
   * @returns {boolean}
   */
  isTombstone(key) {
    return this.#tombstones.has(key);
  }

  /* -------------------------------------------- */

  /**
   * Restore a Document so that it is no longer managed by the collection delta and instead inherits from the base
   * Document.
   * @param {string} id            The Document ID.
   * @returns {Promise<Document>}  The restored Document.
   */
  async restoreDocument(id) {
    const docs = await this.restoreDocuments([id]);
    return docs.shift();
  }

  /* -------------------------------------------- */

  /**
   * Restore the given Documents so that they are no longer managed by the collection delta and instead inherit directly
   * from their counterparts in the base Actor.
   * @param {string[]} ids           The IDs of the Documents to restore.
   * @returns {Promise<Document[]>}  An array of updated Document instances.
   */
  async restoreDocuments(ids) {
    if ( !this.model.syntheticActor ) return [];
    const baseActor = this.model.parent.baseActor;
    const embeddedName = this.documentClass.documentName;
    const {deltas, tombstones} = ids.reduce((obj, id) => {
      if ( !this.manages(id) ) return obj;
      const doc = baseActor.getEmbeddedCollection(this.name).get(id);
      if ( this.isTombstone(id) ) obj.tombstones.push(doc.toObject());
      else obj.deltas.push(doc.toObject());
      return obj;
    }, {deltas: [], tombstones: []});

    // For the benefit of downstream CRUD workflows, we emulate events from the perspective of the synthetic Actor.
    // Restoring an Item to the version on the base Actor is equivalent to updating that Item on the synthetic Actor
    // with the version of the Item on the base Actor.
    // Restoring an Item that has been deleted on the synthetic Actor is equivalent to creating a new Item on the
    // synthetic Actor with the contents of the version on the base Actor.
    // On the ActorDelta, those Items are removed from this collection delta so that they are once again 'linked' to the
    // base Actor's Item, as though they had never been modified from the original in the first place.

    let updated = [];
    if ( deltas.length ) {
      updated = await this.model.syntheticActor.updateEmbeddedDocuments(embeddedName, deltas, {
        diff: false, recursive: false, restoreDelta: true
      });
    }

    let created = [];
    if ( tombstones.length ) {
      created = await this.model.syntheticActor.createEmbeddedDocuments(embeddedName, tombstones, {
        keepId: true, restoreDelta: true
      });
    }

    return updated.concat(created);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  set(key, value, options={}) {
    super.set(key, value, options);
    this.syntheticCollection?.set(key, value, options);
  }

  /* -------------------------------------------- */

  /** @override */
  _set(key, value, {restoreDelta=false}={}) {
    if ( restoreDelta ) {
      this._source.findSplice(entry => entry._id === key);
      this.#managedIds.delete(key);
      this.#tombstones.delete(key);
      return;
    }

    if ( this.manages(key) ) this._source.findSplice(d => d._id === key, value._source);
    else this._source.push(value._source);
    this.#managedIds.add(key);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  delete(key, options={}) {
    super.delete(key, options);
    this.syntheticCollection?.delete(key, options);
  }

  /* -------------------------------------------- */

  /** @override */
  _delete(key, {restoreDelta=false}={}) {
    if ( !this.baseCollection ) return;

    // Remove the document from this collection, if it exists.
    if ( this.manages(key) ) {
      this._source.findSplice(entry => entry._id === key);
      this.#managedIds.delete(key);
      this.#tombstones.delete(key);
    }

    // If the document exists in the base collection, push a tombstone in its place.
    if ( !restoreDelta && this.baseCollection.has(key) ) {
      this._source.push({_id: key, _tombstone: true});
      this.#managedIds.add(key);
      this.#tombstones.add(key);
    }
  }
}
