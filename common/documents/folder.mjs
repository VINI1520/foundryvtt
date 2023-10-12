import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import * as fields from "../data/fields.mjs";
import * as documents from "./module.mjs";

/**
 * @typedef {Object} FolderData
 * @property {string} _id                 The _id which uniquely identifies this Folder document
 * @property {string} name                The name of this Folder
 * @property {string} type                The document type which this Folder contains, from CONST.FOLDER_DOCUMENT_TYPES
 * @property {string} [description]       An HTML description of the contents of this folder
 * @property {string|null} [folder]       The _id of a parent Folder which contains this Folder
 * @property {string} [sorting=a]         The sorting mode used to organize documents within this Folder, in ["a", "m"]
 * @property {number} [sort]              The numeric sort value which orders this Folder relative to its siblings
 * @property {string|null} [color]        A color string used for the background color of this Folder
 * @property {object} [flags]             An object of optional key/value flags
 * @property {DocumentStats} [_stats]     An object of creation and access information
 */

/**
 * The Document definition for a Folder.
 * Defines the DataSchema and common behaviors for a Folder which are shared between both client and server.
 * @extends abstract.Document
 * @mixes FolderData
 * @memberof documents
 *
 * @param {FolderData} data                       Initial data from which to construct the Folder
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseFolder extends Document {

  /* ---------------------------------------- */
  /*  Model Configuration                     */
  /* ---------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Folder",
    collection: "folders",
    label: "DOCUMENT.Folder",
    labelPlural: "DOCUMENT.Folders",
    coreTypes: CONST.FOLDER_DOCUMENT_TYPES
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      type: new fields.StringField({required: true, choices: CONST.FOLDER_DOCUMENT_TYPES}),
      description: new fields.StringField({textSearch: true}),
      folder: new fields.ForeignDocumentField(BaseFolder),
      sorting: new fields.StringField({required: true, initial: "a", choices: this.SORTING_MODES}),
      sort: new fields.IntegerSortField(),
      color: new fields.ColorField(),
      flags: new fields.ObjectField(),
      _stats: new fields.DocumentStatsField()
    }
  }

  /** @inheritdoc */
  static validateJoint(data) {
    if ( (data.folder !== null) && (data.folder === data._id) ) {
      throw new Error("A Folder may not contain itself");
    }
  }

  /**
   * Allow folder sorting modes
   * @type {string[]}
   */
  static SORTING_MODES = ["a", "m"];

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(data) {
    /**
     * Remove parent collision
     * @deprecated since v10
     */
    this._addDataFieldMigration(data, "parent", "folder");
    return super.migrateData(data);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static shimData(data, options) {
    this._addDataFieldShim(data, "parent", "folder", {since: 10, until: 12});
    return super.shimData(data, options);
  }

  /* -------------------------------------------- */

  /** @override */
  static get(documentId, options={}) {
    if ( !documentId ) return null;
    if ( !options.pack ) return super.get(documentId, options);
    const pack = game.packs.get(options.pack);
    if ( !pack ) {
      console.error(`The ${this.name} model references a non-existent pack ${options.pack}.`);
      return null;
    }
    return pack.folders.get(documentId);
  }
}
export default BaseFolder;
