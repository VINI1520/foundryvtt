import Document from "../abstract/document.mjs";
import {deepClone, mergeObject} from "../utils/helpers.mjs";
import * as documents from "./module.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @typedef {object} ActorDeltaData
 * @property {string} _id                              The _id which uniquely identifies this ActorDelta document.
 * @property {string} [name]                           The name override, if any.
 * @property {string} [type]                           The type override, if any.
 * @property {string} [img]                            The image override, if any.
 * @property {object} [system]                         The system data model override.
 * @property {Collection<BaseItem>} [items]            An array of embedded item data overrides.
 * @property {Collection<BaseActiveEffect>} [effects]  An array of embedded active effect data overrides.
 * @property {object} [ownership]                      Ownership overrides.
 * @property {object} [flags]                          An object of actor flag overrides.
 */

/**
 * The Document definition for an ActorDelta.
 * Defines the DataSchema and common behaviors for an ActorDelta which are shared between both client and server.
 * ActorDeltas store a delta that can be applied to a particular Actor in order to produce a new Actor.
 * @extends abstract.Document
 * @mixes ActorDeltaData
 * @memberof document
 *
 * @param {ActorDeltaData} data                  Initial data used to construct the ActorDelta.
 * @param {DocumentConstructionContext} context  Construction context options.
 */
class BaseActorDelta extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "ActorDelta",
    collection: "delta",
    label: "DOCUMENT.ActorDelta",
    labelPlural: "DOCUMENT.ActorDeltas",
    isEmbedded: true,
    embedded: {
      Item: "items",
      ActiveEffect: "effects"
    }
  }, {inplace: false}));

  /** @override */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: false, nullable: true, initial: null}),
      type: new fields.StringField({required: false, nullable: true, initial: null}),
      img: new fields.FilePathField({categories: ["IMAGE"], nullable: true, initial: null, required: false}),
      system: new fields.ObjectField(),
      items: new fields.EmbeddedCollectionDeltaField(documents.BaseItem),
      effects: new fields.EmbeddedCollectionDeltaField(documents.BaseActiveEffect),
      ownership: new fields.DocumentOwnershipField({required: false, nullable: true, initial: null}),
      flags: new fields.ObjectField()
    };
  }

  /* -------------------------------------------- */

  /** @override */
  canUserModify(user, action, data={}) {
    return this.parent.canUserModify(user, action, data);
  }

  /* -------------------------------------------- */

  /** @override */
  testUserPermission(user, permission, { exact=false }={}) {
    return this.parent.testUserPermission(user, permission, { exact });
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Retrieve the base actor's collection, if it exists.
   * @param {string} collectionName  The collection name.
   * @returns {Collection}
   */
  getBaseCollection(collectionName) {
    const baseActor = this.parent?.baseActor;
    return baseActor?.getEmbeddedCollection(collectionName);
  }

  /* -------------------------------------------- */

  /**
   * Apply an ActorDelta to an Actor and return the resultant synthetic Actor.
   * @param {ActorDelta} delta  The ActorDelta.
   * @param {Actor} baseActor   The base Actor.
   * @param {object} [context]  Context to supply to synthetic Actor instantiation.
   * @returns {Actor|null}
   */
  static applyDelta(delta, baseActor, context={}) {
    if ( !baseActor ) return null;
    if ( delta.parent?.isLinked ) return baseActor;

    // Get base actor data.
    const cls = game?.actors?.documentClass ?? db.Actor;
    const actorData = baseActor.toObject();
    const deltaData = delta.toObject();
    delete deltaData._id;

    // Merge embedded collections.
    BaseActorDelta.#mergeEmbeddedCollections(cls, actorData, deltaData);

    // Merge the rest of the delta.
    mergeObject(actorData, deltaData);
    return new cls(actorData, {parent: delta.parent, ...context});
  }

  /* -------------------------------------------- */

  /**
   * Merge delta Document embedded collections with the base Document.
   * @param {typeof Document} documentClass  The parent Document class.
   * @param {object} baseData                The base Document data.
   * @param {object} deltaData               The delta Document data.
   */
  static #mergeEmbeddedCollections(documentClass, baseData, deltaData) {
    for ( const collectionName of Object.keys(documentClass.hierarchy) ) {
      const baseCollection = baseData[collectionName];
      const deltaCollection = deltaData[collectionName];
      baseData[collectionName] = BaseActorDelta.#mergeEmbeddedCollection(baseCollection, deltaCollection);
      delete deltaData[collectionName];
    }
  }

  /* -------------------------------------------- */

  /**
   * Apply an embedded collection delta.
   * @param {object[]} base   The base embedded collection.
   * @param {object[]} delta  The delta embedded collection.
   * @returns {object[]}
   */
  static #mergeEmbeddedCollection(base=[], delta=[]) {
    const deltaIds = new Set();
    const records = [];
    for ( const record of delta ) {
      if ( !record._tombstone ) records.push(record);
      deltaIds.add(record._id);
    }
    for ( const record of base ) {
      if ( !deltaIds.has(record._id) ) records.push(record);
    }
    return records;
  }

  /* -------------------------------------------- */
  /*  Serialization                               */
  /* -------------------------------------------- */

  /** @override */
  toObject(source=true) {
    const data = {};
    const value = source ? this._source : this;
    for ( const [name, field] of this.schema.entries() ) {
      if ( !field.required && (value[name] === null) ) continue;
      data[name] = source ? deepClone(value[name]) : field.toObject(value[name]);
    }
    return data;
  }
}

export default BaseActorDelta;
