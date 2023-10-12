import Document from "../abstract/document.mjs";
import * as CONST from "../constants.mjs";
import * as documents from "./module.mjs";
import * as fields from "../data/fields.mjs";
import {getProperty, mergeObject, setProperty} from "../utils/helpers.mjs";
import {PrototypeToken} from "../data/data.mjs";

/**
 * @typedef {Object} ActorData
 * @property {string} _id                 The _id which uniquely identifies this Actor document
 * @property {string} name                The name of this Actor
 * @property {string} type                An Actor subtype which configures the system data model applied
 * @property {string} [img]               An image file path which provides the artwork for this Actor
 * @property {object} [system]            The system data object which is defined by the system template.json model
 * @property {data.PrototypeToken} [prototypeToken] Default Token settings which are used for Tokens created from
 *                                        this Actor
 * @property {Collection<documents.BaseItem>} items A Collection of Item embedded Documents
 * @property {Collection<documents.BaseActiveEffect>} effects A Collection of ActiveEffect embedded Documents
 * @property {string|null} folder         The _id of a Folder which contains this Actor
 * @property {number} [sort]              The numeric sort value which orders this Actor relative to its siblings
 * @property {object} [ownership]         An object which configures ownership of this Actor
 * @property {object} [flags]             An object of optional key/value flags
 * @property {DocumentStats} [_stats]     An object of creation and access information.
 */

/**
 * The Document definition for an Actor.
 * Defines the DataSchema and common behaviors for an Actor which are shared between both client and server.
 * @extends abstract.Document
 * @mixes ActorData
 * @memberof documents
 *
 * @param {ActorData} data                        Initial data from which to construct the Actor
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseActor extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(Object.defineProperty(mergeObject(super.metadata, {
    name: "Actor",
    collection: "actors",
    indexed: true,
    compendiumIndexFields: ["_id", "name", "img", "type", "sort", "folder"],
    embedded: {ActiveEffect: "effects", Item: "items"},
    label: "DOCUMENT.Actor",
    labelPlural: "DOCUMENT.Actors",
    permissions: {
      create: this.#canCreate,
      update: this.#canUpdate
    }
  }, {inplace: false}), "types", {
    get: () => {
      /** @deprecated since v10 */
      globalThis.logger.warn(`${this.name}.metadata.types is deprecated since v10 in favor of ${this.name}.TYPES.`);
      return this.TYPES
    },
    enumerable: false
  }));

  /* ---------------------------------------- */

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      type: new fields.StringField({required: true, choices: () => this.TYPES,
        validationError: "must be in the array of Actor types defined by the game system"}),
      img: new fields.FilePathField({categories: ["IMAGE"], initial: data => this.getDefaultArtwork(data).img}),
      system: new fields.TypeDataField(this),
      prototypeToken: new fields.EmbeddedDataField(PrototypeToken),
      items: new fields.EmbeddedCollectionField(documents.BaseItem),
      effects: new fields.EmbeddedCollectionField(documents.BaseActiveEffect),
      folder: new fields.ForeignDocumentField(documents.BaseFolder),
      sort: new fields.IntegerSortField(),
      ownership: new fields.DocumentOwnershipField(),
      flags: new fields.ObjectField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /* ---------------------------------------- */

  /**
   * The default icon used for newly created Actor documents.
   * @type {string}
   */
  static DEFAULT_ICON = CONST.DEFAULT_TOKEN;

  /* -------------------------------------------- */

  /**
   * Determine default artwork based on the provided actor data.
   * @param {ActorData} actorData                      The source actor data.
   * @returns {{img: string, texture: {src: string}}}  Candidate actor image and prototype token artwork.
   */
  static getDefaultArtwork(actorData) {
    return {
      img: this.DEFAULT_ICON,
      texture: {
        src: this.DEFAULT_ICON
      }
    };
  }

  /* ---------------------------------------- */

  /**
   * The allowed set of Actor types which may exist.
   * @type {string[]}
   */
  static get TYPES() {
    return game.documentTypes.Actor;
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  _initializeSource(source, options) {
    source = super._initializeSource(source, options);
    source.prototypeToken.name = source.prototypeToken.name || source.name;
    source.prototypeToken.texture.src = source.prototypeToken.texture.src || source.img;
    return source;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static canUserCreate(user) {
    return user.hasPermission("ACTOR_CREATE");
  }

  /* ---------------------------------------- */

  /**
   * Is a user able to create this actor?
   * @param {User} user  The user attempting the creation operation.
   * @param {Actor} doc  The Actor being created.
   * @private
   */
  static #canCreate(user, doc) {
    if ( user.isGM ) return true;
    if ( doc.prototypeToken.randomImg ) return user.hasPermission("FILES_BROWSE");
    return user.hasPermission("ACTOR_CREATE");
  }

  /* -------------------------------------------- */

  /**
   * Is a user able to update an existing actor?
   * @param {User} user    The user attempting the update operation.
   * @param {Actor} doc    The Actor being updated.
   * @param {object} data  The update delta being applied.
   * @private
   */
  static #canUpdate(user, doc, data) {
    if ( user.isGM ) return true; // GMs can always make changes.
    if ( !doc.testUserPermission(user, "OWNER") ) return false; // Otherwise, ownership is required.

    // Users can only enable token wildcard images if they have FILES_BROWSE permission.
    const tokenChange = data?.prototypeToken || {};
    const enablingRandomImage = tokenChange.randomImg === true;
    if ( enablingRandomImage ) return user.hasPermission("FILES_BROWSE");

    // Users can only change a token wildcard path if they have FILES_BROWSE permission.
    const randomImageEnabled = doc.prototypeToken.randomImg && (tokenChange.randomImg !== false);
    const changingRandomImage = ("img" in tokenChange) && randomImageEnabled;
    if ( changingRandomImage ) return user.hasPermission("FILES_BROWSE");
    return true;
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  async _preCreate(data, options, user) {
    if ( !this.prototypeToken.name ) this.prototypeToken.updateSource({name: this.name});
    if ( !this.prototypeToken.texture.src || (this.prototypeToken.texture.src === CONST.DEFAULT_TOKEN)) {
      const { texture } = this.constructor.getDefaultArtwork(this.toObject());
      this.prototypeToken.updateSource("img" in data ? { img: this.img } : { texture });
    }
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);
    if ( changed.img && !getProperty(changed, "prototypeToken.texture.src") ) {
      const { texture } = this.constructor.getDefaultArtwork(foundry.utils.mergeObject(this.toObject(), changed));
      if ( !this.prototypeToken.texture.src || (this.prototypeToken.texture.src === texture?.src) ) {
        setProperty(changed, "prototypeToken.texture.src", changed.img);
      }
    }
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(data) {
    /**
     * Rename data to system
     * @deprecated since v10
     */
    this._addDataFieldMigration(data, "data", "system");

    /**
     * Rename permission to ownership
     * @deprecated since v10
     */
    this._addDataFieldMigration(data, "permission", "ownership");

    /**
     * Prototype token migration
     * @deprecated since v10
     */
    this._addDataFieldMigration(data, "token", "prototypeToken");
    return super.migrateData(data);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static shimData(data, options) {
    this._addDataFieldShim(data, "data", "system", {since: 10, until: 12});
    this._addDataFieldShim(data, "permission", "ownership", {since: 10, until: 12});
    this._addDataFieldShim(data, "token", "prototypeToken", {since: 10, until: 12});
    return super.shimData(data, options);
  }
}
export default BaseActor;
