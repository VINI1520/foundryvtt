import Document from "../abstract/document.mjs";
import {mergeObject, setProperty} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import * as documents from "./module.mjs";
import * as CONST from "../constants.mjs";
import {ShapeData} from "../data/data.mjs";

/**
 * @typedef {Object} DrawingData
 * @property {string} _id                 The _id which uniquely identifies this BaseDrawing embedded document
 * @property {string} author              The _id of the user who created the drawing
 * @property {data.ShapeData} shape       The geometric shape of the drawing
 * @property {number} x                   The x-coordinate position of the top-left corner of the drawn shape
 * @property {number} y                   The y-coordinate position of the top-left corner of the drawn shape
 * @property {number} [z=0]               The z-index of this drawing relative to other siblings
 * @property {number} [rotation=0]        The angle of rotation for the drawing figure
 * @property {number} [bezierFactor=0]    An amount of bezier smoothing applied, between 0 and 1
 * @property {number} [fillType=0]        The fill type of the drawing shape, a value from CONST.DRAWING_FILL_TYPES
 * @property {string} [fillColor]         An optional color string with which to fill the drawing geometry
 * @property {number} [fillAlpha=0.5]     The opacity of the fill applied to the drawing geometry
 * @property {number} [strokeWidth=8]     The width in pixels of the boundary lines of the drawing geometry
 * @property {number} [strokeColor]       The color of the boundary lines of the drawing geometry
 * @property {number} [strokeAlpha=1]     The opacity of the boundary lines of the drawing geometry
 * @property {string} [texture]           The path to a tiling image texture used to fill the drawing geometry
 * @property {string} [text]              Optional text which is displayed overtop of the drawing
 * @property {string} [fontFamily]        The font family used to display text within this drawing, defaults to
 *                                        CONFIG.defaultFontFamily
 * @property {number} [fontSize=48]       The font size used to display text within this drawing
 * @property {string} [textColor=#FFFFFF] The color of text displayed within this drawing
 * @property {number} [textAlpha=1]       The opacity of text displayed within this drawing
 * @property {boolean} [hidden=false]     Is the drawing currently hidden?
 * @property {boolean} [locked=false]     Is the drawing currently locked?
 * @property {object} [flags]             An object of optional key/value flags
 */

/**
 * The Document definition for a Drawing.
 * Defines the DataSchema and common behaviors for a Drawing which are shared between both client and server.
 * @extends abstract.Document
 * @mixes DrawingData
 * @memberof documents
 *
 * @param {DrawingData} data                      Initial data from which to construct the Drawing
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseDrawing extends Document {

  /* ---------------------------------------- */
  /*  Model Configuration                     */
  /* ---------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Drawing",
    collection: "drawings",
    label: "DOCUMENT.Drawing",
    labelPlural: "DOCUMENT.Drawings",
    isEmbedded: true,
    permissions: {
      create: "DRAWING_CREATE",
      update: this.#canModify,
      delete: this.#canModify
    }
  }, {inplace: false}));

  /* ---------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      author: new fields.ForeignDocumentField(documents.BaseUser, {nullable: false, initial: () => game.user?.id}),
      shape: new fields.EmbeddedDataField(ShapeData),
      x: new fields.NumberField({required: true, nullable: false, initial: 0, label: "XCoord"}),
      y: new fields.NumberField({required: true, nullable: false, initial: 0, label: "YCoord"}),
      z: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0, label: "DRAWING.ZIndex"}),
      rotation: new fields.AngleField({label: "DRAWING.Rotation"}),
      bezierFactor: new fields.AlphaField({initial: 0, label: "DRAWING.SmoothingFactor", max: 0.5,
        hint: "DRAWING.SmoothingFactorHint"}),
      fillType: new fields.NumberField({required: true, initial: CONST.DRAWING_FILL_TYPES.NONE,
        choices: Object.values(CONST.DRAWING_FILL_TYPES), label: "DRAWING.FillTypes",
        validationError: "must be a value in CONST.DRAWING_FILL_TYPES"
      }),
      fillColor: new fields.ColorField({initial: () => game.user?.color, label: "DRAWING.FillColor"}),
      fillAlpha: new fields.AlphaField({initial: 0.5, label: "DRAWING.FillOpacity"}),
      strokeWidth: new fields.NumberField({integer: true, initial: 8, min: 0, label: "DRAWING.LineWidth"}),
      strokeColor: new fields.ColorField({initial: () => game.user?.color, label: "DRAWING.StrokeColor"}),
      strokeAlpha: new fields.AlphaField({initial: 1, label: "DRAWING.LineOpacity"}),
      texture: new fields.FilePathField({categories: ["IMAGE"], label: "DRAWING.FillTexture"}),
      text: new fields.StringField({label: "DRAWING.TextLabel"}),
      fontFamily: new fields.StringField({blank: false, label: "DRAWING.FontFamily",
        initial: () => globalThis.CONFIG?.defaultFontFamily || "Signika"}),
      fontSize: new fields.NumberField({integer: true, min: 8, max: 256, initial: 48, label: "DRAWING.FontSize",
        validationError: "must be an integer between 8 and 256"}),
      textColor: new fields.ColorField({initial: "#FFFFFF", label: "DRAWING.TextColor"}),
      textAlpha: new fields.AlphaField({label: "DRAWING.TextOpacity"}),
      hidden: new fields.BooleanField(),
      locked: new fields.BooleanField(),
      flags: new fields.ObjectField()
    }
  }

  /* ---------------------------------------- */

  /**
   * Validate whether the drawing has some visible content (as required by validation).
   * @returns {boolean}
   */
  static #validateVisibleContent(data) {
    const hasText = (data.text !== "") && (data.textAlpha > 0);
    const hasFill = (data.fillType !== CONST.DRAWING_FILL_TYPES.NONE) && (data.fillAlpha > 0);
    const hasLine = (data.strokeWidth > 0) && (data.strokeAlpha > 0);
    return hasText || hasFill || hasLine;
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static validateJoint(data) {
    if ( !BaseDrawing.#validateVisibleContent(data) ) {
      throw new Error("Drawings must have visible text, a visible fill, or a visible line");
    }
  }

  /* ---------------------------------------- */

  /**
   * Is a user able to update or delete an existing Drawing document??
   * @private
   */
  static #canModify(user, doc, data) {
    if ( user.isGM ) return true;                // GM users can do anything
    return doc._source.author === user.id;       // Users may only update their own created drawings
  }

  /* ---------------------------------------- */
  /*  Model Methods                           */
  /* ---------------------------------------- */

  /** @inheritdoc */
  testUserPermission(user, permission, {exact=false}={}) {
    if ( !exact && (user.id === this._source.author) ) return true; // The user who created the drawing
    return super.testUserPermission(user, permission, {exact});
  }

  /* ---------------------------------------- */
  /*  Deprecations and Compatibility          */
  /* ---------------------------------------- */

  /** @inheritDoc */
  static cleanData(source={}, options={}) {
    if ( !options.partial && !BaseDrawing.#validateVisibleContent(source) ) {
      source.strokeWidth = 8;
      source.strokeColor = "#FFFFFF";
      source.strokeAlpha = 1.0;
    }
    return super.cleanData(source, options);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static migrateData(data) {
    /**
     * V10 migration to ShapeData model
     * @deprecated since v10
     */
    this._addDataFieldMigration(data, "type", "shape.type", d => ({t: "r", f: "p"}[d.type] ?? d.type));
    this._addDataFieldMigration(data, "width", "shape.width");
    this._addDataFieldMigration(data, "height", "shape.height");
    this._addDataFieldMigration(data, "points", "shape.points", d => d.points.flat());
    return super.migrateData(data);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static shimData(data, options) {
    this._addDataFieldShim(data, "type", "shape.type", {since: 10, until: 12});
    this._addDataFieldShim(data, "width", "shape.width", {since: 10, until: 12});
    this._addDataFieldShim(data, "height", "shape.height", {since: 10, until: 12});
    this._addDataFieldShim(data, "points", "shape.points", {since: 10, until: 12});
    return super.shimData(data, options);
  }
}
export default BaseDrawing;
