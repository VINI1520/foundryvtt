import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @typedef {Object} TableResultData
 * @property {string} _id                 The _id which uniquely identifies this TableResult embedded document
 * @property {number} [type=0]            A result subtype from CONST.TABLE_RESULT_TYPES
 * @property {string} [text]              The text which describes the table result
 * @property {string} [img]               An image file url that represents the table result
 * @property {string} [documentCollection] A named collection from which this result is drawn
 * @property {string} [documentId]        The _id of a Document within the collection this result references
 * @property {number} [weight=1]          The probabilistic weight of this result relative to other results
 * @property {number[]} [range]           A length 2 array of ascending integers which defines the range of dice roll
 *                                        totals which produce this drawn result
 * @property {boolean} [drawn=false]      Has this result already been drawn (without replacement)
 * @property {object} [flags]             An object of optional key/value flags
 */

/**
 * The Document definition for a TableResult.
 * Defines the DataSchema and common behaviors for a TableResult which are shared between both client and server.
 * @extends abstract.Document
 * @mixes TableResultData
 * @memberof documents
 *
 * @param {TableResultData} data                  Initial data from which to construct the TableResult
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseTableResult extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "TableResult",
    collection: "results",
    label: "DOCUMENT.TableResult",
    labelPlural: "DOCUMENT.TableResults",
    coreTypes: Object.values(CONST.TABLE_RESULT_TYPES).map(t => String(t)),
    permissions: {
      update: this.#canUpdate
    }
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      type: new fields.NumberField({required: true, choices: Object.values(CONST.TABLE_RESULT_TYPES),
        initial: CONST.TABLE_RESULT_TYPES.TEXT, validationError: "must be a value in CONST.TABLE_RESULT_TYPES"}),
      text: new fields.HTMLField({textSearch: true}),
      img: new fields.FilePathField({categories: ["IMAGE"]}),
      documentCollection: new fields.StringField(),
      documentId: new fields.ForeignDocumentField(Document, {idOnly: true}),
      weight: new fields.NumberField({required: true, integer: true, positive: true, nullable: false, initial: 1}),
      range: new fields.ArrayField(new fields.NumberField({integer: true}), {
        validate: r => (r.length === 2) && (r[1] >= r[0]),
        validationError: "must be a length-2 array of ascending integers"
      }),
      drawn: new fields.BooleanField(),
      flags: new fields.ObjectField()
    }
  }

  /**
   * Is a user able to update an existing TableResult?
   * @private
   */
  static #canUpdate(user, doc, data) {
    if ( user.isGM ) return true;                               // GM users can do anything
    const wasDrawn = new Set(["drawn", "_id"]);                 // Users can update the drawn status of a result
    if ( new Set(Object.keys(data)).equals(wasDrawn) ) return true;
    return doc.parent.canUserModify(user, "update", data);      // Otherwise, go by parent document permission
  }

  /* -------------------------------------------- */
  /*  Model Methods                               */
  /* -------------------------------------------- */

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
     * Rename collection to resultCollection
     * @deprecated since v10
     */
    this._addDataFieldMigration(data, "collection", "documentCollection");
    this._addDataFieldMigration(data, "resultCollection", "documentCollection");
    this._addDataFieldMigration(data, "resultId", "documentId");
    return super.migrateData(data);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static shimData(data, options) {
    this._addDataFieldShim(data, "collection", "resultCollection", {since: 10, until: 12});
    return super.shimData(data, options);
  }
}
export default BaseTableResult;
