import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import * as documents from "./module.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @typedef {Object} MacroData
 * @property {string} _id                 The _id which uniquely identifies this Macro document
 * @property {string} name                The name of this Macro
 * @property {string} type                A Macro subtype from CONST.MACRO_TYPES
 * @property {string} author              The _id of a User document which created this Macro *
 * @property {string} [img]               An image file path which provides the thumbnail artwork for this Macro
 * @property {string} [scope=global]      The scope of this Macro application from CONST.MACRO_SCOPES
 * @property {string} command             The string content of the macro command
 * @property {string|null} folder         The _id of a Folder which contains this Macro
 * @property {number} [sort]              The numeric sort value which orders this Macro relative to its siblings
 * @property {object} [ownership]         An object which configures ownership of this Macro
 * @property {object} [flags]             An object of optional key/value flags
 * @property {DocumentStats} [_stats]     An object of creation and access information
 */

/**
 * The Document definition for a Macro.
 * Defines the DataSchema and common behaviors for a Macro which are shared between both client and server.
 * @extends abstract.Document
 * @mixes MacroData
 * @memberof documents
 *
 * @param {MacroData} data                        Initial data from which to construct the Macro
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseMacro extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Macro",
    collection: "macros",
    indexed: true,
    compendiumIndexFields: ["_id", "name", "img", "sort", "folder"],
    label: "DOCUMENT.Macro",
    labelPlural: "DOCUMENT.Macros",
    coreTypes: Array.from(Object.values(CONST.MACRO_TYPES)),
    permissions: {create: "PLAYER"}
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, label: "Name", textSearch: true}),
      type: new fields.StringField({required: true, choices: Object.values(CONST.MACRO_TYPES),
        initial: CONST.MACRO_TYPES.CHAT, validationError: "must be a value in CONST.MACRO_TYPES", label: "Type"}),
      author: new fields.ForeignDocumentField(documents.BaseUser, {initial: () => game?.user?.id}),
      img: new fields.FilePathField({categories: ["IMAGE"], initial: () => this.DEFAULT_ICON, label: "Image"}),
      scope: new fields.StringField({required: true, choices: CONST.MACRO_SCOPES, initial: CONST.MACRO_SCOPES[0],
        validationError: "must be a value in CONST.MACRO_SCOPES", label: "Scope"}),
      command: new fields.StringField({required: true, blank: true, label: "Command"}),
      folder: new fields.ForeignDocumentField(documents.BaseFolder),
      sort: new fields.IntegerSortField(),
      ownership: new fields.DocumentOwnershipField(),
      flags: new fields.ObjectField(),
      _stats: new fields.DocumentStatsField()
    }
  }

  /**
   * The default icon used for newly created Macro documents.
   * @type {string}
   */
  static DEFAULT_ICON = "icons/svg/dice-target.svg";

  /* -------------------------------------------- */
  /*  Model Methods                               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  testUserPermission(user, permission, {exact=false}={}) {
    if ( user.id === this._source.author ) return true; // Macro authors can edit
    return super.testUserPermission(user, permission, {exact});
  }

  /* -------------------------------------------- */
  /*  Database Event Handlers                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _preCreate(data, options, user) {
    this.updateSource({author: user.id});
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(data) {
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
    this._addDataFieldShim(data, "permission", "ownership", {since: 10, until: 12});
    return super.shimData(data, options);
  }
}
export default BaseMacro;
