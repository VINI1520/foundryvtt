import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import * as documents from "./module.mjs";

/**
 * @typedef {Object} CardsData
 * @property {string} _id                 The _id which uniquely identifies this stack of Cards document
 * @property {string} name                The text name of this stack
 * @property {string} type                The type of this stack, in BaseCards.metadata.types
 * @property {string} [description]       A text description of this stack
 * @property {string} [img]               An image or video which is used to represent the stack of cards
 * @property {object} [system]            Game system data which is defined by the system template.json model
 * @property {Collection<BaseCard>} cards A collection of Card documents which currently belong to this stack
 * @property {number} width               The visible width of this stack
 * @property {number} height              The visible height of this stack
 * @property {number} rotation            The angle of rotation of this stack
 * @property {boolean} [displayCount]     Whether or not to publicly display the number of cards in this stack
 * @property {string|null} folder         The _id of a Folder which contains this document
 * @property {number} sort                The sort order of this stack relative to others in its parent collection
 * @property {object} [ownership]         An object which configures ownership of this Cards
 * @property {object} [flags]             An object of optional key/value flags
 * @property {DocumentStats} [_stats]     An object of creation and access information
 */

/**
 * The Document definition for Cards.
 * Defines the DataSchema and common behaviors for Cards which are shared between both client and server.
 * @extends abstract.Document
 * @mixes CardsData
 * @memberof documents
 *
 * @param {CardsData} data                        Initial data from which to construct the Cards
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseCards extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(Object.defineProperty(mergeObject(super.metadata, {
    name: "Cards",
    collection: "cards",
    indexed: true,
    compendiumIndexFields: ["_id", "name", "description", "img", "type", "sort", "folder"],
    embedded: {Card: "cards"},
    label: "DOCUMENT.Cards",
    labelPlural: "DOCUMENT.CardsPlural",
    permissions: {create: "CARDS_CREATE"},
    coreTypes: ["deck", "hand", "pile"]
  }, {inplace: false}), "types", {
    get: () => {
      /** @deprecated since v10 */
      globalThis.logger.warn(`${this.name}.metadata.types is deprecated since v10 in favour of ${this.name}.TYPES.`);
      return this.TYPES;
    },
    enumerable: false
  }));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, label: "CARDS.Name", textSearch: true}),
      type: new fields.StringField({required: true, label: "CARDS.Type", choices: () => this.TYPES,
        initial: () => this.TYPES[0],
        validationError: "The Cards type must be in the array of types supported by the game system"}),
      description: new fields.HTMLField({label: "CARDS.Description", textSearch: true}),
      img: new fields.FilePathField({categories: ["IMAGE", "VIDEO"], initial: () => this.DEFAULT_ICON,
        label: "CARDS.Image"}),
      system: new fields.TypeDataField(this),
      cards: new fields.EmbeddedCollectionField(documents.BaseCard),
      width: new fields.NumberField({integer: true, positive: true, label: "Width"}),
      height: new fields.NumberField({integer: true, positive: true, label: "Height"}),
      rotation: new fields.AngleField({label: "Rotation"}),
      displayCount: new fields.BooleanField(),
      folder: new fields.ForeignDocumentField(documents.BaseFolder),
      sort: new fields.IntegerSortField(),
      ownership: new fields.DocumentOwnershipField(),
      flags: new fields.ObjectField(),
      _stats: new fields.DocumentStatsField()
    }
  }

  /**
   * The default icon used for a cards stack that does not have a custom image set
   * @type {string}
   */
  static DEFAULT_ICON = "icons/svg/card-hand.svg";

  /**
   * The allowed set of CardsData types which may exist
   * @type {string[]}
   */
  static get TYPES() {
    return game.documentTypes.Cards;
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
export default BaseCards;
