import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as documents from "./module.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @typedef {Object} CombatantData
 * @property {string} _id                 The _id which uniquely identifies this Combatant embedded document
 * @property {string} [actorId]           The _id of an Actor associated with this Combatant
 * @property {string} [tokenId]           The _id of a Token associated with this Combatant
 * @property {string} [name]              A customized name which replaces the name of the Token in the tracker
 * @property {string} [img]               A customized image which replaces the Token image in the tracker
 * @property {number} [initiative]        The initiative score for the Combatant which determines its turn order
 * @property {boolean} [hidden=false]     Is this Combatant currently hidden?
 * @property {boolean} [defeated=false]   Has this Combatant been defeated?
 * @property {object} [flags]             An object of optional key/value flags
 */

/**
 * The Document definition for a Combatant.
 * Defines the DataSchema and common behaviors for a Combatant which are shared between both client and server.
 * @extends abstract.Document
 * @mixes CombatantData
 * @memberof documents
 *
 * @param {CombatantData} data                    Initial data from which to construct the Combatant
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseCombatant extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Combatant",
    collection: "combatants",
    label: "DOCUMENT.Combatant",
    labelPlural: "DOCUMENT.Combatants",
    isEmbedded: true,
    permissions: {
      create: this.#canCreate,
      update: this.#canUpdate
    }
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      actorId: new fields.ForeignDocumentField(documents.BaseActor, {label: "COMBAT.CombatantActor", idOnly: true}),
      tokenId: new fields.ForeignDocumentField(documents.BaseToken, {label: "COMBAT.CombatantToken", idOnly: true}),
      sceneId: new fields.ForeignDocumentField(documents.BaseScene, {label: "COMBAT.CombatantScene", idOnly: true}),
      name: new fields.StringField({label: "COMBAT.CombatantName"}),
      img: new fields.FilePathField({categories: ["IMAGE"], label: "COMBAT.CombatantImage"}),
      initiative: new fields.NumberField({label: "COMBAT.CombatantInitiative"}),
      hidden: new fields.BooleanField({label: "COMBAT.CombatantHidden"}),
      defeated: new fields.BooleanField({label: "COMBAT.CombatantDefeated"}),
      flags: new fields.ObjectField()
    }
  }

  /**
   * Is a user able to update an existing Combatant?
   * @private
   */
  static #canUpdate(user, doc, data) {
    if ( user.isGM ) return true; // GM users can do anything
    if ( doc.actor && !doc.actor.canUserModify(user, "update", data) ) return false;
    const updateKeys = new Set(Object.keys(data));
    const allowedKeys = new Set(["_id", "initiative", "flags", "defeated"]);
    return updateKeys.isSubset(allowedKeys); // Players may only update initiative scores, flags, and the defeated state
  }

  /**
   * Is a user able to create this Combatant?
   * @private
   */
  static #canCreate(user, doc, data) {
    if ( user.isGM ) return true;
    if ( doc.actor ) return doc.actor.canUserModify(user, "update", data);
    return true;
  }
}
export default BaseCombatant;
