import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as documents from "./module.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @typedef {Object} ItemData
 * @property {string} _id                 The _id which uniquely identifies this Item document
 * @property {string} name                The name of this Item
 * @property {string} type                An Item subtype which configures the system data model applied
 * @property {string} [img]               An image file path which provides the artwork for this Item
 * @property {object} [system]            The system data object which is defined by the system template.json model
 * @property {Collection<BaseActiveEffect>} effects A collection of ActiveEffect embedded Documents
 * @property {string|null} folder         The _id of a Folder which contains this Item
 * @property {number} [sort]              The numeric sort value which orders this Item relative to its siblings
 * @property {object} [ownership]         An object which configures ownership of this Item
 * @property {object} [flags]             An object of optional key/value flags
 * @property {DocumentStats} [_stats]     An object of creation and access information
 */

/**
 * The Document definition for an Item.
 * Defines the DataSchema and common behaviors for an Item which are shared between both client and server.
 * @extends abstract.Document
 * @mixes ItemData
 * @memberof documents
 *
 * @param {ItemData} data                         Initial data from which to construct the Item
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseItem extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(Object.defineProperty(mergeObject(super.metadata, {
    name: "Item",
    collection: "items",
    indexed: true,
    compendiumIndexFields: ["_id", "name", "img", "type", "sort", "folder"],
    embedded: {ActiveEffect: "effects"},
    label: "DOCUMENT.Item",
    labelPlural: "DOCUMENT.Items",
    permissions: {create: "ITEM_CREATE"}
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
        validationError: "must be in the array of Item types defined by the game system"}),
      img: new fields.FilePathField({categories: ["IMAGE"], initial: data => this.getDefaultArtwork(data).img}),
      system: new fields.TypeDataField(this),
      effects: new fields.EmbeddedCollectionField(documents.BaseActiveEffect),
      folder: new fields.ForeignDocumentField(documents.BaseFolder),
      sort: new fields.IntegerSortField(),
      ownership: new fields.DocumentOwnershipField(),
      flags: new fields.ObjectField(),
      _stats: new fields.DocumentStatsField()
    }
  }

  /* ---------------------------------------- */

  /**
   * The default icon used for newly created Item documents
   * @type {string}
   */
  static DEFAULT_ICON = "icons/svg/item-bag.svg";

  /* -------------------------------------------- */

  /**
   * Determine default artwork based on the provided item data.
   * @param {ItemData} itemData  The source item data.
   * @returns {{img: string}}    Candidate item image.
   */
  static getDefaultArtwork(itemData) {
    return { img: this.DEFAULT_ICON };
  }

  /* ---------------------------------------- */

  /**
   * The allowed set of Item types which may exist.
   * @type {string[]}
   */
  static get TYPES() {
    return game.documentTypes.Item;
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  canUserModify(user, action, data={}) {
    if ( this.isEmbedded ) return this.parent.canUserModify(user, "update");
    return super.canUserModify(user, action, data);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  testUserPermission(user, permission, {exact=false}={}) {
    if ( this.isEmbedded ) return this.parent.testUserPermission(user, permission, {exact});
    return super.testUserPermission(user, permission, {exact});
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
    return super.migrateData(data);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static shimData(data, options) {
    this._addDataFieldShim(data, "data", "system", {since: 10, until: 12});
    this._addDataFieldShim(data, "permission", "ownership", {since: 10, until: 12});
    return super.shimData(data, options);
  }
}
export default BaseItem;
