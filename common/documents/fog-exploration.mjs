import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import * as documents from "./module.mjs";

/**
 * @typedef {Object} FogExplorationData
 * @property {string} _id                 The _id which uniquely identifies this FogExploration document
 * @property {string} scene               The _id of the Scene document to which this fog applies
 * @property {string} user                The _id of the User document to which this fog applies
 * @property {string} explored            The base64 image/jpeg of the explored fog polygon
 * @property {object} positions           The object of scene positions which have been explored at a certain vision radius
 * @property {number} timestamp           The timestamp at which this fog exploration was last updated
 * @property {object} [flags]             An object of optional key/value flags
 */

/**
 * The Document definition for FogExploration.
 * Defines the DataSchema and common behaviors for FogExploration which are shared between both client and server.
 * @extends abstract.Document
 * @mixes FogExplorationData
 * @memberof documents
 *
 * @param {FogExplorationData} data               Initial data from which to construct the FogExploration
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseFogExploration extends Document {

  /* ---------------------------------------- */
  /*  Model Configuration                     */
  /* ---------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "FogExploration",
    collection: "fog",
    label: "DOCUMENT.FogExploration",
    labelPlural: "DOCUMENT.FogExplorations",
    isPrimary: true,
    permissions: {
      create: "PLAYER",
      update: this.#canModify,
      delete: this.#canModify
    }
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      scene: new fields.ForeignDocumentField(documents.BaseScene, {initial: () => canvas?.scene?.id}),
      user: new fields.ForeignDocumentField(documents.BaseUser, {initial: () => game?.user?.id}),
      explored: new fields.FilePathField({categories: ["IMAGE"], required: true, base64: true}),
      positions: new fields.ObjectField(),
      timestamp: new fields.NumberField({nullable: false, initial: Date.now}),
      flags: new fields.ObjectField()
    }
  }

  /**
   * Test whether a User can modify a FogExploration document.
   * @private
   */
  static #canModify(user, doc) {
    return (user.id === doc._source.user) || user.hasRole("ASSISTANT");
  }

  /* ---------------------------------------- */
  /*  Database Event Handlers                 */
  /* ---------------------------------------- */

  /** @inheritdoc */
  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);
    changed.timestamp = Date.now();
  }
}
export default BaseFogExploration;
