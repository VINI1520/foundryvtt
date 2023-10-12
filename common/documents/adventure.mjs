import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as documents from "./module.mjs";
import * as fields from "../data/fields.mjs"

/**
 * @typedef {Object} AdventureData
 * @property {string} _id                 The _id which uniquely identifies this Adventure document
 * @property {string} name                The human-readable name of the Adventure
 * @property {string} img                 The file path for the primary image of the adventure
 * @property {string} caption             A string caption displayed under the primary image banner
 * @property {string} description         An HTML text description for the adventure
 * @property {documents.BaseActor[]} actors         An array of Actor documents which are included in the adventure
 * @property {documents.BaseCombat[]} combats       An array of Combat documents which are included in the adventure
 * @property {documents.BaseItem[]} items           An array of Item documents which are included in the adventure
 * @property {documents.BaseScene[]} scenes         An array of Scene documents which are included in the adventure
 * @property {documents.BaseJournalEntry[]} journal An array of JournalEntry documents which are included in the adventure
 * @property {documents.BaseRollTable[]} tables     An array of RollTable documents which are included in the adventure
 * @property {documents.BaseMacro[]} macros         An array of Macro documents which are included in the adventure
 * @property {documents.BaseCards[]} cards          An array of Cards documents which are included in the adventure
 * @property {documents.BasePlaylist[]} playlists   An array of Playlist documents which are included in the adventure
 * @property {documents.BaseFolder[]} folders       An array of Folder documents which are included in the adventure
 * @property {number} sort                The sort order of this adventure relative to its siblings
 * @property {object} flags={}            An object of optional key/value flags
 * @property {DocumentStats} [_stats]     An object of creation and access information
 */

/**
 * The Document definition for an Adventure.
 * Defines the DataSchema and common behaviors for an Adventure which are shared between both client and server.
 * @extends abstract.Document
 * @mixes AdventureData
 * @memberof documents
 *
 * @param {AdventureData} data                    Initial data from which to construct the Actor
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseAdventure extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Adventure",
    collection: "adventures",
    compendiumIndexFields: ["_id", "name", "description", "img", "sort", "folder"],
    label: "DOCUMENT.Adventure",
    labelPlural: "DOCUMENT.Adventures"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, label: "ADVENTURE.Name", hint: "ADVENTURE.NameHint", textSearch: true}),
      img: new fields.FilePathField({categories: ["IMAGE"], label: "ADVENTURE.Image", hint: "ADVENTURE.ImageHint"}),
      caption: new fields.HTMLField({label: "ADVENTURE.Caption", hint: "ADVENTURE.CaptionHint"}),
      description: new fields.HTMLField({label: "ADVENTURE.Description", hint: "ADVENTURE.DescriptionHint", textSearch: true}),
      actors: new fields.SetField(new fields.EmbeddedDataField(documents.BaseActor)),
      combats: new fields.SetField(new fields.EmbeddedDataField(documents.BaseCombat)),
      items: new fields.SetField(new fields.EmbeddedDataField(documents.BaseItem)),
      journal: new fields.SetField(new fields.EmbeddedDataField(documents.BaseJournalEntry)),
      scenes: new fields.SetField(new fields.EmbeddedDataField(documents.BaseScene)),
      tables: new fields.SetField(new fields.EmbeddedDataField(documents.BaseRollTable)),
      macros: new fields.SetField(new fields.EmbeddedDataField(documents.BaseMacro)),
      cards: new fields.SetField(new fields.EmbeddedDataField(documents.BaseCards)),
      playlists: new fields.SetField(new fields.EmbeddedDataField(documents.BasePlaylist)),
      folders: new fields.SetField(new fields.EmbeddedDataField(documents.BaseFolder)),
      folder: new fields.ForeignDocumentField(documents.BaseFolder),
      sort: new fields.IntegerSortField(),
      flags: new fields.ObjectField(),
      _stats: new fields.DocumentStatsField()
    };
  }

  /* -------------------------------------------- */
  /*  Model Properties                            */
  /* -------------------------------------------- */

  /**
   * An array of the fields which provide imported content from the Adventure.
   * @type {Object<Document>}
   */
  static get contentFields() {
    const content = {};
    for ( const field of this.schema ) {
      if ( field instanceof fields.SetField ) content[field.name] = field.element.model.implementation;
    }
    return content;
  }

  /**
   * Provide a thumbnail image path used to represent the Adventure document.
   * @type {string}
   */
  get thumbnail() {
    return this.img;
  }

  /** @inheritdoc */
  static fromSource(source, options={}) {
    const pack = game?.packs?.get(options.pack) ?? db?.packs?.get(options.pack);
    const system = pack.metadata?.system ?? pack.packData?.system;
    if ( pack && !system ) {
      // Omit system-specific documents from this Adventure's data.
      source.actors = [];
      source.items = [];
      source.folders = source.folders.filter(f => !CONST.SYSTEM_SPECIFIC_COMPENDIUM_TYPES.includes(f.type));
    }
    return super.fromSource(source, options);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(data) {
    for ( const [field, cls] of Object.entries(this.contentFields) ) {
      for ( const d of (data[field] || []) ) {
        cls.migrateDataSafe(d);
        /** @deprecated since v10 */
        if ( (field === "journal") && (d.content || d.img) ) d.pages = cls.migrateContentToPages(d);
      }
    }
    return super.migrateData(data);
  }
}
export default BaseAdventure;
