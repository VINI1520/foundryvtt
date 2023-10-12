import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import * as documents from "./module.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @typedef {Object} MeasuredTemplateData
 * @property {string} _id                 The _id which uniquely identifies this BaseMeasuredTemplate embedded document
 * @property {string} user                The _id of the user who created this measured template
 * @property {string} [t=circle]          The value in CONST.MEASURED_TEMPLATE_TYPES which defines the geometry type of this template
 * @property {number} [x=0]               The x-coordinate position of the origin of the template effect
 * @property {number} [y=0]               The y-coordinate position of the origin of the template effect
 * @property {number} [distance]          The distance of the template effect
 * @property {number} [direction=0]       The angle of rotation for the measured template
 * @property {number} [angle=360]         The angle of effect of the measured template, applies to cone types
 * @property {number} [width]             The width of the measured template, applies to ray types
 * @property {string} [borderColor=#000000] A color string used to tint the border of the template shape
 * @property {string} [fillColor=#FF0000] A color string used to tint the fill of the template shape
 * @property {string} [texture]           A repeatable tiling texture used to add a texture fill to the template shape
 * @property {boolean} [hidden=false]     Is the template currently hidden?
 * @property {object} [flags]             An object of optional key/value flags
 */

/**
 * The Document definition for a MeasuredTemplate.
 * Defines the DataSchema and common behaviors for a MeasuredTemplate which are shared between both client and server.
 * @extends abstract.Document
 * @mixes MeasuredTemplateData
 * @memberof documents
 *
 * @param {MeasuredTemplateData} data             Initial data from which to construct the MeasuredTemplate
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseMeasuredTemplate extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = mergeObject(super.metadata, {
    name: "MeasuredTemplate",
    collection: "templates",
    label: "DOCUMENT.MeasuredTemplate",
    labelPlural: "DOCUMENT.MeasuredTemplates",
    isEmbedded: true,
    permissions: {
      create: this.#canCreate,
      update: this.#canModify,
      delete: this.#canModify
    }
  }, {inplace: false});

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      user: new fields.ForeignDocumentField(documents.BaseUser, {initial: () => game?.user?.id}),
      t: new fields.StringField({required: true, choices: Object.values(CONST.MEASURED_TEMPLATE_TYPES), label: "Type",
        initial: CONST.MEASURED_TEMPLATE_TYPES.CIRCLE,
        validationError: "must be a value in CONST.MEASURED_TEMPLATE_TYPES",
      }),
      x: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0, label: "XCoord"}),
      y: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0, label: "YCoord"}),
      distance: new fields.NumberField({required: true, positive: true, initial: 1, label: "Distance"}),
      direction: new fields.AngleField({label: "Direction"}),
      angle: new fields.AngleField({label: "Angle"}),
      width: new fields.NumberField({integer: true, positive: true, label: "Width"}),
      borderColor: new fields.ColorField({initial: "#000000"}),
      fillColor: new fields.ColorField({initial: "#FF0000"}),
      texture: new fields.FilePathField({categories: ["IMAGE", "VIDEO"]}),
      hidden: new fields.BooleanField({label: "Hidden"}),
      flags: new fields.ObjectField()
    }
  }

  /* ---------------------------------------- */

  /**
   * Is a user able to create a new MeasuredTemplate?
   * @param {User} user                     The user attempting the creation operation.
   * @param {BaseMeasuredTemplate} doc      The MeasuredTemplate being created.
   * @returns {boolean}
   * @private
   */
  static #canCreate(user, doc) {
    if ( user.isGM ) return true;
    if ( !user.hasPermission("TEMPLATE_CREATE") ) return false;
    return doc._source.user === user.id;
  }

  /* ---------------------------------------- */

  /**
   * Is a user able to modify an existing MeasuredTemplate?
   * @param {User} user                     The user attempting the modification.
   * @param {BaseMeasuredTemplate} doc      The MeasuredTemplate being modified.
   * @param {object} [data]                 Data being changed.
   * @returns {boolean}
   * @private
   */
  static #canModify(user, doc, data) {
    if ( user.isGM ) return true;                     // GM users can do anything
    return doc._source.user === user.id;              // Users may only update their own created templates
  }

  /* -------------------------------------------- */
  /*  Model Methods                               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  testUserPermission(user, permission, {exact=false}={}) {
    if ( !exact && (user.id === this._source.user) ) return true; // The user who created the template
    return super.testUserPermission(user, permission, {exact});
  }
}
export default BaseMeasuredTemplate;
