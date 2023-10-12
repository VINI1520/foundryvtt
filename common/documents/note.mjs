import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import * as documents from "./module.mjs";
import * as CONST from "../constants.mjs";
import {TextureData} from "../data/data.mjs";

/**
 * @typedef {Object} NoteData
 * @property {string} _id                 The _id which uniquely identifies this BaseNote embedded document
 * @property {string|null} [entryId=null] The _id of a JournalEntry document which this Note represents
 * @property {string|null} [pageId=null]  The _id of a specific JournalEntryPage document which this Note represents
 * @property {number} [x=0]               The x-coordinate position of the center of the note icon
 * @property {number} [y=0]               The y-coordinate position of the center of the note icon
 * @property {TextureData} [texture]      An image icon used to represent this note
 * @property {number} [iconSize=40]       The pixel size of the map note icon
 * @property {string} [text]              Optional text which overrides the title of the linked Journal Entry
 * @property {string} [fontFamily]        The font family used to display the text label on this note, defaults to
 *                                        CONFIG.defaultFontFamily
 * @property {number} [fontSize=36]       The font size used to display the text label on this note
 * @property {number} [textAnchor=1]      A value in CONST.TEXT_ANCHOR_POINTS which defines where the text label anchors
 *                                        to the note icon.
 * @property {string} [textColor=#FFFFFF] The string that defines the color with which the note text is rendered
 * @property {boolean} [global=false]     Whether this map pin is globally visible or requires LoS to see.
 * @property {object} [flags]             An object of optional key/value flags
 */

/**
 * The Document definition for a Note.
 * Defines the DataSchema and common behaviors for a Note which are shared between both client and server.
 * @extends abstract.Document
 * @mixes NoteData
 * @memberof documents
 *
 * @param {NoteData} data                         Initial data from which to construct the Note
 * @param {DocumentConstructionContext} context   Construction context options
 *
 * @property {documents.BaseJournalEntry} entry   The JournalEntry document that this Note references
 */
class BaseNote extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Note",
    collection: "notes",
    label: "DOCUMENT.Note",
    labelPlural: "DOCUMENT.Notes",
    permissions: {
      create: "NOTE_CREATE"
    }
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      entryId: new fields.ForeignDocumentField(documents.BaseJournalEntry, {idOnly: true}),
      pageId: new fields.ForeignDocumentField(documents.BaseJournalEntryPage, {idOnly: true}),
      x: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0, label: "XCoord"}),
      y: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0, label: "YCoord"}),
      texture: new TextureData({}, {categories: ["IMAGE"], initial: () => this.DEFAULT_ICON, label: "NOTE.EntryIcon"}),
      iconSize: new fields.NumberField({required: true, integer: true, min: 32, initial: 40,
        validationError: "must be an integer greater than 32", label: "NOTE.IconSize"}),
      text: new fields.StringField({label: "NOTE.TextLabel", textSearch: true}),
      fontFamily: new fields.StringField({required: true, label: "NOTE.FontFamily",
        initial: () => globalThis.CONFIG?.defaultFontFamily || "Signika"}),
      fontSize: new fields.NumberField({required: true, integer: true, min: 8, max: 128, initial: 32,
        validationError: "must be an integer between 8 and 128", label: "NOTE.FontSize"}),
      textAnchor: new fields.NumberField({required: true, choices: Object.values(CONST.TEXT_ANCHOR_POINTS),
        initial: CONST.TEXT_ANCHOR_POINTS.BOTTOM, label: "NOTE.AnchorPoint",
        validationError: "must be a value in CONST.TEXT_ANCHOR_POINTS"}),
      textColor: new fields.ColorField({initial: "#FFFFFF", label: "NOTE.TextColor"}),
      global: new fields.BooleanField(),
      flags: new fields.ObjectField()
    }
  }

  /**
   * The default icon used for newly created Note documents.
   * @type {string}
   */
  static DEFAULT_ICON = "icons/svg/book.svg";

  /* -------------------------------------------- */
  /*  Model Methods                               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  testUserPermission(user, permission, {exact=false}={}) {
    if ( user.isGM ) return true;                             // Game-masters always have control
    // Players can create and edit unlinked notes with the appropriate permission.
    if ( !this.entryId ) return user.hasPermission("NOTE_CREATE");
    if ( !this.entry ) return false;                          // Otherwise, permission comes through the JournalEntry
    return this.entry.testUserPermission(user, permission, {exact});
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(data) {
    /**
     * Migration to TextureData.
     * @deprecated since v10
     */
    for ( const [oldKey, newKey] of Object.entries({
      "icon": "texture.src",
      "iconTint": "texture.tint"
    }) ) this._addDataFieldMigration(data, oldKey, newKey);
    return super.migrateData(data);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static shimData(data, options) {
    /**
     * Migration to TextureData.
     * @deprecated since v10
     */
    const shims = {
      icon: "texture.src",
      iconTint: "texture.tint"
    };
    this._addDataFieldShims(data, shims, {since: 10, until: 12});
    return super.shimData(data, options);
  }
}
export default BaseNote;
