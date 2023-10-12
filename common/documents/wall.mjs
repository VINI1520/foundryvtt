import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @typedef {Object} WallThresholdData
 * @property {number} [light=0]           Minimum distance from a light source for which this wall blocks light
 * @property {number} [sight=0]           Minimum distance from a vision source for which this wall blocks vision
 * @property {number} [sound=0]           Minimum distance from a sound source for which this wall blocks sound
 * @property {boolean} [attenuation=true] Whether to attenuate the source radius when passing through the wall
 */

/**
 * @typedef {Object} WallData
 * @property {string} _id                 The _id which uniquely identifies the embedded Wall document
 * @property {number[]} c                 The wall coordinates, a length-4 array of finite numbers [x0,y0,x1,y1]
 * @property {number} [light=0]           The illumination restriction type of this wall
 * @property {number} [move=0]            The movement restriction type of this wall
 * @property {number} [sight=0]           The visual restriction type of this wall
 * @property {number} [sound=0]           The auditory restriction type of this wall
 * @property {number} [dir=0]             The direction of effect imposed by this wall
 * @property {number} [door=0]            The type of door which this wall contains, if any
 * @property {number} [ds=0]              The state of the door this wall contains, if any
 * @property {WallThresholdData} threshold  Configuration of threshold data for this wall
 * @property {object} [flags]             An object of optional key/value flags
 */

/**
 * The Document definition for a Wall.
 * Defines the DataSchema and common behaviors for a Wall which are shared between both client and server.
 * @extends abstract.Document
 * @mixes WallData
 * @memberof documents
 *
 * @param {WallData} data                         Initial data from which to construct the Wall
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseWall extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Wall",
    collection: "walls",
    label: "DOCUMENT.Wall",
    labelPlural: "DOCUMENT.Walls",
    permissions: {
      update: this.#canUpdate
    }
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      c: new fields.ArrayField(new fields.NumberField({required: true, integer: true, nullable: false}), {
        validate: c => (c.length === 4),
        validationError: "must be a length-4 array of integer coordinates"}),
      light: new fields.NumberField({required: true, choices: Object.values(CONST.WALL_SENSE_TYPES),
        initial: CONST.WALL_SENSE_TYPES.NORMAL,
        validationError: "must be a value in CONST.WALL_SENSE_TYPES"}),
      move: new fields.NumberField({required: true, choices: Object.values(CONST.WALL_MOVEMENT_TYPES),
        initial: CONST.WALL_MOVEMENT_TYPES.NORMAL,
        validationError: "must be a value in CONST.WALL_MOVEMENT_TYPES"}),
      sight: new fields.NumberField({required: true, choices: Object.values(CONST.WALL_SENSE_TYPES),
        initial: CONST.WALL_SENSE_TYPES.NORMAL,
        validationError: "must be a value in CONST.WALL_SENSE_TYPES"}),
      sound: new fields.NumberField({required: true, choices: Object.values(CONST.WALL_SENSE_TYPES),
        initial: CONST.WALL_SENSE_TYPES.NORMAL,
        validationError: "must be a value in CONST.WALL_SENSE_TYPES"}),
      dir: new fields.NumberField({required: true, choices: Object.values(CONST.WALL_DIRECTIONS),
        initial: CONST.WALL_DIRECTIONS.BOTH,
        validationError: "must be a value in CONST.WALL_DIRECTIONS"}),
      door: new fields.NumberField({required: true, choices: Object.values(CONST.WALL_DOOR_TYPES),
        initial: CONST.WALL_DOOR_TYPES.NONE,
        validationError: "must be a value in CONST.WALL_DOOR_TYPES"}),
      ds: new fields.NumberField({required: true, choices: Object.values(CONST.WALL_DOOR_STATES),
        initial: CONST.WALL_DOOR_STATES.CLOSED,
        validationError: "must be a value in CONST.WALL_DOOR_STATES"}),
      doorSound: new fields.StringField({required: false, blank: true, initial: undefined}),
      threshold: new fields.SchemaField({
        light: new fields.NumberField({required: true, nullable: true, initial: null, positive: true}),
        sight: new fields.NumberField({required: true, nullable: true, initial: null, positive: true}),
        sound: new fields.NumberField({required: true, nullable: true, initial: null, positive: true}),
        attenuation: new fields.BooleanField()
      }),
      flags: new fields.ObjectField()
    };
  }

  /**
   * Is a user able to update an existing Wall?
   * @private
   */
  static #canUpdate(user, doc, data) {
    if ( user.isGM ) return true;                     // GM users can do anything
    const dsOnly = Object.keys(data).every(k => ["_id", "ds"].includes(k));
    if ( dsOnly && (doc.ds !== CONST.WALL_DOOR_STATES.LOCKED) && (data.ds !== CONST.WALL_DOOR_STATES.LOCKED) ) {
      return user.hasRole("PLAYER");                  // Players may open and close unlocked doors
    }
    return false;
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(data) {
    /**
     * Separate sense restriction into light and sound
     * @deprecated since v9
     */
    if ( "sense" in data ) {
      if ( !("sight" in data) ) data.sight = data.sense;
      if ( !("light" in data) ) data.light = data.sense;
      delete data.sense;
    }

    const reMap = {1: CONST.WALL_SENSE_TYPES.NORMAL, 2: CONST.WALL_SENSE_TYPES.LIMITED};
    /**
     * Migrate limited restriction to be less than normal
     * @deprecated since v9
     */
    for ( let t of ["light", "move", "sight", "sound"] ) {
      if ( t in data ) {
        data[t] = reMap[data[t]] ?? data[t];
      }
    }
    return super.migrateData(data);
  }
}
export default BaseWall;
