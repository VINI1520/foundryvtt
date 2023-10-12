import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import * as documents from "./module.mjs";
import * as CONST from "../constants.mjs";

/**
 * @typedef {Object} JournalEntryData
 * @property {string} _id                 The _id which uniquely identifies this JournalEntry document
 * @property {string} name                The name of this JournalEntry
 * @property {JournalEntryPageData[]} pages   The pages contained within this JournalEntry document
 * @property {string|null} folder         The _id of a Folder which contains this JournalEntry
 * @property {number} [sort]              The numeric sort value which orders this JournalEntry relative to its siblings
 * @property {object} [ownership]         An object which configures ownership of this JournalEntry
 * @property {object} [flags]             An object of optional key/value flags
 * @property {DocumentStats} [_stats]     An object of creation and access information
 */

/**
 * The Document definition for a JournalEntry.
 * Defines the DataSchema and common behaviors for a JournalEntry which are shared between both client and server.
 * @extends abstract.Document
 * @mixes JournalEntryData
 * @memberof documents
 *
 * @param {JournalEntryData} data                 Initial data from which to construct the JournalEntry
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseJournalEntry extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "JournalEntry",
    collection: "journal",
    indexed: true,
    compendiumIndexFields: ["_id", "name", "sort", "folder"],
    embedded: {JournalEntryPage: "pages"},
    label: "DOCUMENT.JournalEntry",
    labelPlural: "DOCUMENT.JournalEntries",
    permissions: {
      create: "JOURNAL_CREATE"
    }
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      pages: new fields.EmbeddedCollectionField(documents.BaseJournalEntryPage),
      folder: new fields.ForeignDocumentField(documents.BaseFolder),
      sort: new fields.IntegerSortField(),
      ownership: new fields.DocumentOwnershipField(),
      flags: new fields.ObjectField(),
      _stats: new fields.DocumentStatsField()
    }
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

  /* -------------------------------------------- */

  /** @inheritdoc */
  _initializeSource(source, options={}) {
    if ( source.content || source.img ) {
      source.pages = this.constructor.migrateContentToPages(source);
    }
    return super._initializeSource(source, options);
  }

  /* -------------------------------------------- */

  /**
   * Migrate old content and img field to individual pages.
   * @param {object} source     Old source data which will be mutated in-place
   * @returns {object[]}        Page data that should be added to the document
   * @deprecated since v10
   */
  static migrateContentToPages(source) {
    const addPages = [];
    const multiplePages = source.img && source.content;
    if ( source.img ) {
      addPages.push({
        name: `${multiplePages ? "Figure: " : ""}${source.name}`,
        type: "image",
        src: source.img,
        title: {
          show: false
        }
      });
      delete source.img;
    }
    if ( source.content ) {
      addPages.push({
        name: source.name,
        type: "text",
        title: {
          show: false
        },
        text: {
          format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML,
          content: source.content
        }
      });
      delete source.content;
    }
    return addPages;
  }
}
export default BaseJournalEntry;
