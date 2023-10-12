import Document from "../abstract/document.mjs";
import * as CONST from "../constants.mjs";
import * as documents from "./module.mjs";
import * as fields from "../data/fields.mjs";
import {mergeObject} from "../utils/helpers.mjs";

/**
 * @typedef {Object} ActiveEffectData
 * @property {string} _id                 The _id which uniquely identifies the ActiveEffect within a parent Actor or Item
 * @property {string} name                The name of the which describes the name of the ActiveEffect
 * @property {EffectChangeData[]} changes The array of EffectChangeData objects which the ActiveEffect applies
 * @property {boolean} [disabled=false]   Is this ActiveEffect currently disabled?
 * @property {EffectDurationData} [duration] An EffectDurationData object which describes the duration of the ActiveEffect
 * @property {string} [description]       The HTML text description for this ActiveEffect document.
 * @property {string} [icon]              An icon image path used to depict the ActiveEffect
 * @property {string} [origin]            A UUID reference to the document from which this ActiveEffect originated
 * @property {string} [tint=null]         A color string which applies a tint to the ActiveEffect icon
 * @property {boolean} [transfer=false]   Does this ActiveEffect automatically transfer from an Item to an Actor?
 * @property {Set<string>} [statuses]     Special status IDs that pertain to this effect
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
      name: new fields.StringField({required: true, blank: false, label: "EFFECT.Name", textSearch: true}),
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
      description: new fields.HTMLField({label: "EFFECT.Description", textSearch: true}),
      icon: new fields.FilePathField({categories: ["IMAGE"], label: "EFFECT.Icon"}),
      origin: new fields.StringField({nullable: true, blank: false, initial: null, label: "EFFECT.Origin"}),
      tint: new fields.ColorField({label: "EFFECT.IconTint"}),
      transfer: new fields.BooleanField({initial: true, label: "EFFECT.Transfer"}),
      statuses: new fields.SetField(new fields.StringField({required: true, blank: false})),
      flags: new fields.ObjectField()
    }
  }

  /* -------------------------------------------- */
  /*  Model Methods                               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  canUserModify(user, action, data={}) {
    if ( this.isEmbedded ) return this.parent.canUserModify(user, "update");
    return super.canUserModify(user, action, data);
  }

  /* ---------------------------------------- */

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
  _initialize(options) {
    super._initialize(options);

    /**
     * label -> name
     * @deprecated since v11
     */
    Object.defineProperty(this, "label", {
      get() {
        this.constructor._logDataFieldMigration("label", "name", {since: 11, until: 13});
        return this.name;
      },
      configurable: true,
      enumerable: false
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static migrateData(data) {

    /**
     * data -> system
     * @deprecated since v10
     */
    if ( "changes" in data ) {
      for ( const change of data.changes ) {
        change.key = change.key.replace(/^data\./, "system.");
      }
    }

    /**
     * label -> name
     * @deprecated since v11
     */
    this._addDataFieldMigration(data, "label", "name", d => d.label || "Unnamed Effect");

    return data;
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static shimData(data, options) {

    // label -> name
    this._addDataFieldShim(data, "label", "name", {since: 11, until: 13});

    return super.shimData(data, options);
  }
}
