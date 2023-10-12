import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import * as CONST from "../constants.mjs";

/**
 * @typedef {object} JournalEntryPageImageData
 * @property {string} [caption]  A caption for the image.
 */

/**
 * @typedef {object} JournalEntryPageTextData
 * @property {string} [content]   The content of the JournalEntryPage in a format appropriate for its type.
 * @property {string} [markdown]  The original markdown source, if applicable.
 * @property {number} format      The format of the page's content, in {@link CONST.JOURNAL_ENTRY_PAGE_FORMATS}.
 */

/**
 * @typedef {object} JournalEntryPageVideoData
 * @property {boolean} [loop]      Automatically loop the video?
 * @property {boolean} [autoplay]  Should the video play automatically?
 * @property {number} [volume]     The volume level of any audio that the video file contains.
 * @property {number} [timestamp]  The starting point of the video, in seconds.
 * @property {number} [width]      The width of the video, otherwise it will fill the available container width.
 * @property {number} [height]     The height of the video, otherwise it will use the aspect ratio of the source video,
 *                                 or 16:9 if that aspect ratio is not available.
 */

/**
 * @typedef {object} JournalEntryPageTitleData
 * @property {boolean} show  Whether to render the page's title in the overall journal view.
 * @property {number} level  The heading level to render this page's title at in the overall journal view.
 */

/**
 * @typedef {object} JournalEntryPageData
 * @property {string} _id          The _id which uniquely identifies this JournalEntryPage embedded document.
 * @property {string} name         The text name of this page.
 * @property {string} type         The type of this page, in {@link BaseJournalEntryPage.TYPES}.
 * @property {JournalEntryPageTitleData} title  Data that control's the display of this page's title.
 * @property {JournalEntryPageImageData} image  Data particular to image journal entry pages.
 * @property {JournalEntryPageTextData} text    Data particular to text journal entry pages.
 * @property {JournalEntryPageVideoData} video  Data particular to video journal entry pages.
 * @property {string} [src]        The URI of the image or other external media to be used for this page.
 * @property {object} system       System-specific data.
 * @property {number} sort         The numeric sort value which orders this page relative to its siblings.
 * @property {object} [ownership]  An object which configures the ownership of this page.
 * @property {object} [flags]      An object of optional key/value flags.
 */

/**
 * The Document definition for a JournalEntryPage.
 * Defines the data schema and common behaviours for a JournalEntryPage which are shared between both client and server.
 * @extends abstract.Document
 * @mixes JournalEntryPageData
 * @memberof documents
 *
 * @param {JournalEntryPageData} data            Initial data from which to construct the JournalEntryPage.
 * @param {DocumentConstructionContext} context  Construction context options.
 */
class BaseJournalEntryPage extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "JournalEntryPage",
    collection: "pages",
    indexed: true,
    label: "DOCUMENT.JournalEntryPage",
    labelPlural: "DOCUMENT.JournalEntryPages",
    coreTypes: ["image", "pdf", "text", "video"]
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, label: "JOURNALENTRYPAGE.PageTitle", textSearch: true}),
      type: new fields.StringField({required: true, label: "JOURNALENTRYPAGE.Type", choices: () => this.TYPES,
        initial: "text",
        validationError: "The JournalEntryPage type must be in the array of types supported by the game system."}),
      title: new fields.SchemaField({
        show: new fields.BooleanField({initial: true}),
        level: new fields.NumberField({required: true, initial: 1, min: 1, max: 6, integer: true, nullable: false})
      }),
      image: new fields.SchemaField({
        caption: new fields.StringField({required: false, initial: undefined})
      }),
      text: new fields.SchemaField({
        content: new fields.HTMLField({required: false, initial: undefined, textSearch: true}),
        markdown: new fields.StringField({required: false, initial: undefined}),
        format: new fields.NumberField({label: "JOURNALENTRYPAGE.Format",
          initial: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML, choices: Object.values(CONST.JOURNAL_ENTRY_PAGE_FORMATS)})
      }),
      video: new fields.SchemaField({
        controls: new fields.BooleanField({initial: true}),
        loop: new fields.BooleanField({required: false, initial: undefined}),
        autoplay: new fields.BooleanField({required: false, initial: undefined}),
        volume: new fields.AlphaField({required: true, step: 0.01, initial: .5}),
        timestamp: new fields.NumberField({required: false, min: 0, initial: undefined}),
        width: new fields.NumberField({required: false, positive: true, integer: true, initial: undefined}),
        height: new fields.NumberField({required: false, positive: true, integer: true, initial: undefined})
      }),
      src: new fields.StringField({required: false, blank: false, nullable: true, initial: null,
        label: "JOURNALENTRYPAGE.Source"}),
      system: new fields.TypeDataField(this),
      sort: new fields.IntegerSortField(),
      ownership: new fields.DocumentOwnershipField({initial: {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT}}),
      flags: new fields.ObjectField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /**
   * The allowed set of JournalEntryPageData types which may exist.
   * @type {string[]}
   */
  static get TYPES() {
    return game.documentTypes.JournalEntryPage;
  }

  /** @inheritdoc */
  getUserLevel(user) {
    user = user || game.user;
    const ownership = this.ownership[user.id] ?? this.ownership.default;
    const inherited = ownership === CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT;
    return inherited ? this.parent.getUserLevel(user) : ownership;
  }
}
export default BaseJournalEntryPage;
