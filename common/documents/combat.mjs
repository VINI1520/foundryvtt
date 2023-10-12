import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import * as documents from "./module.mjs";

/**
 * @typedef {Object} CombatData
 * @property {string} _id                 The _id which uniquely identifies this Combat document
 * @property {string} scene               The _id of a Scene within which this Combat occurs
 * @property {Collection<BaseCombatant>} combatants A Collection of Combatant embedded Documents
 * @property {boolean} [active=false]     Is the Combat encounter currently active?
 * @property {number} [round=0]           The current round of the Combat encounter
 * @property {number|null} [turn=0]       The current turn in the Combat round
 * @property {number} [sort=0]            The current sort order of this Combat relative to others in the same Scene
 * @property {object} [flags]             An object of optional key/value flags
 * @property {DocumentStats} [_stats]     An object of creation and access information
 */

/**
 * The Document definition for a Combat.
 * Defines the DataSchema and common behaviors for a Combat which are shared between both client and server.
 * @extends abstract.Document
 * @mixes CombatData
 * @memberof documents
 *
 * @param {CombatData} data                       Initial data from which to construct the Combat
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseCombat extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Combat",
    collection: "combats",
    label: "DOCUMENT.Combat",
    labelPlural: "DOCUMENT.Combats",
    embedded: {
      Combatant: "combatants"
    },
    permissions: {
      update: this.#canUpdate
    }
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      scene: new fields.ForeignDocumentField(documents.BaseScene),
      combatants: new fields.EmbeddedCollectionField(documents.BaseCombatant),
      active: new fields.BooleanField(),
      round: new fields.NumberField({required: true, nullable: false, integer: true, min: 0, initial: 0,
        label: "COMBAT.Round"}),
      turn: new fields.NumberField({required: true, integer: true, min: 0, initial: null, label: "COMBAT.Turn"}),
      sort: new fields.IntegerSortField(),
      flags: new fields.ObjectField(),
      _stats: new fields.DocumentStatsField()
    }
  }

  /**
   * Is a user able to update an existing Combat?
   * @protected
   */
  static #canUpdate(user, doc, data) {
    if ( user.isGM ) return true;                     // GM users can do anything
    const turnOnly = ["_id", "round", "turn"];        // Players can only update the round or turn
    return Object.keys(data).every(k => turnOnly.includes(k));
  }
}
export default BaseCombat;
