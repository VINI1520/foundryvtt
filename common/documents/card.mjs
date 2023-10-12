import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as documents from "./module.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @typedef {Object} CardData
 * @property {string} _id                 The _id which uniquely identifies this Card document
 * @property {string} name                The text name of this card
 * @property {string} [description]       A text description of this card which applies to all faces
 * @property {string} type                A category of card (for example, a suit) to which this card belongs
 * @property {object} [system]            Game system data which is defined by the system template.json model
 * @property {string} [suit]              An optional suit designation which is used by default sorting
 * @property {number} [value]             An optional numeric value of the card which is used by default sorting
 * @property {CardFaceData} back          An object of face data which describes the back of this card
 * @property {CardFaceData[]} faces       An array of face data which represent displayable faces of this card
 * @property {number|null} face           The index of the currently displayed face, or null if the card is face-down
 * @property {boolean} drawn              Whether this card is currently drawn from its source deck
 * @property {string} origin              The document ID of the origin deck to which this card belongs
 * @property {number} width               The visible width of this card
 * @property {number} height              The visible height of this card
 * @property {number} rotation            The angle of rotation of this card
 * @property {number} sort                The sort order of this card relative to others in the same stack
 * @property {object} [flags]             An object of optional key/value flags
 */

/**
 * @typedef {Object} CardFaceData
 * @property {string} [name]              A name for this card face
 * @property {string} [text]              Displayed text that belongs to this face
 * @property {string} [img]               A displayed image or video file which depicts the face
 */

/**
 * The Document definition for a Card.
 * Defines the DataSchema and common behaviors for a Card which are shared between both client and server.
 * @extends abstract.Document
 * @mixes CardData
 * @memberof documents
 *
 * @param {CardData} data                         Initial data from which to construct the Card
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseCard extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Card",
    collection: "cards",
    indexed: true,
    label: "DOCUMENT.Card",
    labelPlural: "DOCUMENT.Cards",
    permissions: {
      create: this.#canCreate,
      update: this.#canUpdate
    }
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, label: "CARD.Name"}),
      description: new fields.HTMLField({label: "CARD.Description"}),
      type: new fields.StringField({required: true, label: "CARD.Type", choices: () => this.TYPES,
        initial: () => this.TYPES[0]}),
      system: new fields.TypeDataField(this),
      suit: new fields.StringField({label: "CARD.Suit"}),
      value: new fields.NumberField({label: "CARD.Value"}),
      back: new fields.SchemaField({
        name: new fields.StringField({label: "CARD.BackName"}),
        text: new fields.HTMLField({label: "CARD.BackText"}),
        img: new fields.FilePathField({categories: ["IMAGE", "VIDEO"], label: "CARD.BackImage"}),
      }),
      faces: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({label: "CARD.FaceName"}),
        text: new fields.HTMLField({label: "CARD.FaceText"}),
        img: new fields.FilePathField({categories: ["IMAGE", "VIDEO"], initial: () => this.DEFAULT_ICON,
          label: "CARD.FaceImage"}),
      })),
      face: new fields.NumberField({required: true, initial: null, integer: true, min: 0, label: "CARD.Face"}),
      drawn: new fields.BooleanField({label: "CARD.Drawn"}),
      origin: new fields.ForeignDocumentField(documents.BaseCards),
      width: new fields.NumberField({integer: true, positive: true, label: "Width"}),
      height: new fields.NumberField({integer: true, positive: true, label: "Height"}),
      rotation: new fields.AngleField({label: "Rotation"}),
      sort: new fields.IntegerSortField(),
      flags: new fields.ObjectField()
    }
  }

  /**
   * The default icon used for a Card face that does not have a custom image set
   * @type {string}
   */
  static DEFAULT_ICON = "icons/svg/card-joker.svg";

  /**
   * The allowed set of Card types which may exist
   * @type {string[]}
   */
  static get TYPES() {
    return game.documentTypes.Card;
  }

  /**
   * Is a User able to create a new Card within this parent?
   * @private
   */
  static #canCreate(user, doc, data) {
    if ( user.isGM ) return true;                             // GM users can always create
    if ( doc.parent.type !== "deck" ) return true;            // Users can pass cards to card hands or piles
    return doc.parent.canUserModify(user, "create", data);    // Otherwise require parent document permission
  }

  /**
   * Is a user able to update an existing Card?
   * @private
   */
  static #canUpdate(user, doc, data) {
    if ( user.isGM ) return true;                               // GM users can always update
    const wasDrawn = new Set(["drawn", "_id"]);                 // Users can draw cards from a deck
    if ( new Set(Object.keys(data)).equals(wasDrawn) ) return true;
    return doc.parent.canUserModify(user, "update", data);      // Otherwise require parent document permission
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
     * Rename data to system
     * @deprecated since v10
     */
    this._addDataFieldMigration(data, "data", "system");
    return super.migrateData(data);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static shimData(data, options) {
    this._addDataFieldShim(data, "data", "system", {since: 10, until: 12});
    return super.shimData(data, options);
  }
}
export default BaseCard;
