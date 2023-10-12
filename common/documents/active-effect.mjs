import Document from "../abstract/document.mjs";
import * as CONST from "../constants.mjs";
import * as documents from "./module.mjs";
import * as fields from "../data/fields.mjs";
import {mergeObject, setProperty} from "../utils/helpers.mjs";

/**
 * @typedef {Object} ActiveEffectData
 * @property {string} _id                 The _id which uniquely identifies the ActiveEffect within a parent Actor or Item
 * @property {string} label               A text label which describes the name of the ActiveEffect
 * @property {EffectChangeData[]} changes The array of EffectChangeData objects which the ActiveEffect applies
 * @property {boolean} [disabled=false]   Is this ActiveEffect currently disabled?
 * @property {EffectDurationData} [duration] An EffectDurationData object which describes the duration of the ActiveEffect
 * @property {string} [icon]              An icon image path used to depict the ActiveEffect
 * @property {string} [origin]            A UUID reference to the document from which this ActiveEffect originated
 * @property {string} [tint=null]         A color string which applies a tint to the ActiveEffect icon
 * @property {boolean} [transfer=false]   Does this ActiveEffect automatically transfer from an Item to an Actor?
 * @property {object} [flags]             An object of optional key/value flags
 */

/**
 * @typedef {Object} EffectDurationData
 * @property {number} [startTime]         The world time when the active effect first started
 * @property {number} [seconds]           The maximum duration of the effect, in seconds
 * @property {string} [combat]            The _id of the CombatEncounter in which the effect first started
 * @property {number} [rounds]            The maximum duration of the effect, in combat rounds
 * @property {number} [turns]             The maximum duration of the effect, in combat turns
 * @property {number} [startRound]        The round of the CombatEncounter in which the effect first started
 * @property {number} [startTurn]         The turn of the CombatEncounter in which the effect first started
 */

/**
 * @typedef {Object} EffectChangeData
 * @property {string} key                 The attribute path in the Actor or Item data which the change modifies
 * @property {string} value               The value of the change effect
 * @property {number} mode                The modification mode with which the change is applied
 * @property {number} priority            The priority level with which this change is applied
 */

/**
 * The data schema for an ActiveEffect document.
 * @extends abstract.Document
 * @mixes ActiveEffectData
 * @memberof documents
 *
 * @param {ActiveEffectData} data                 Initial data from which to construct the ActiveEffect
 * @param {DocumentConstructionContext} context   Construction context options
 */
export default class BaseActiveEffect extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "ActiveEffect",
    collection: "effects",
    label: "DOCUMENT.ActiveEffect",
    labelPlural: "DOCUMENT.ActiveEffects"
  }, {inplace: false}));

  /* -------------------------------------------- */

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      changes: new fields.ArrayField(new fields.SchemaField({
        key: new fields.StringField({required: true, label: "EFFECT.ChangeKey"}),
        value: new fields.StringField({required: true, label: "EFFECT.ChangeValue"}),
        mode: new fields.NumberField({integer: true, initial: CONST.ACTIVE_EFFECT_MODES.ADD,
          label: "EFFECT.ChangeMode"}),
        priority: new fields.NumberField()
      })),
      disabled: new fields.BooleanField(),
      duration: new fields.SchemaField({
        startTime: new fields.NumberField({initial: null, label: "EFFECT.StartTime"}),
        seconds: new fields.NumberField({integer: true, min: 0, label: "EFFECT.DurationSecs"}),
        combat: new fields.ForeignDocumentField(documents.BaseCombat, {label: "EFFECT.Combat"}),
        rounds: new fields.NumberField({integer: true, min: 0}),
        turns: new fields.NumberField({integer: true, min: 0, label: "EFFECT.DurationTurns"}),
        startRound: new fields.NumberField({integer: true, min: 0}),
        startTurn: new fields.NumberField({integer: true, min: 0, label: "EFFECT.StartTurns"})
      }),
      icon: new fields.FilePathField({categories: ["IMAGE"], label: "EFFECT.Icon"}),
      label: new fields.StringField({required: true, label: "EFFECT.Label"}),
      origin: new fields.StringField({nullable: true, blank: false, initial: null, label: "EFFECT.Origin"}),
      tint: new fields.ColorField({label: "EFFECT.IconTint"}),
      transfer: new fields.BooleanField({initial: true, label: "EFFECT.Transfer"}),
      flags: new fields.ObjectField()
    }
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
  /*  Database Event Handlers                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _preCreate(data, options, user) {
    if ( this.parent instanceof documents.BaseActor ) {
      this.updateSource({transfer: false});
    }
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static migrateData(data) {
    if ( "changes" in data ) {
      for ( const change of data.changes ) {
        change.key = change.key.replace(/^data\./, "system.");
      }
    }
    return data;
  }
}
