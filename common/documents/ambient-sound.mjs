import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @typedef {Object} AmbientSoundData
 * @property {string} _id                 The _id which uniquely identifies this AmbientSound document
 * @property {number} x=0                 The x-coordinate position of the origin of the sound.
 * @property {number} y=0                 The y-coordinate position of the origin of the sound.
 * @property {number} radius=0            The radius of the emitted sound.
 * @property {string} path                The audio file path that is played by this sound
 * @property {boolean} [repeat=false]     Does this sound loop?
 * @property {number} [volume=0.5]        The audio volume of the sound, from 0 to 1
 * @property {boolean} walls=true         Whether or not this sound source is constrained by Walls.
 * @property {boolean} easing=true        Whether to adjust the volume of the sound heard by the listener based on how
 *                                        close the listener is to the center of the sound source.
 * @property {boolean} hidden=false       Is the sound source currently hidden?
 * @property {{min: number, max: number}} darkness  A darkness range (min and max) for which the source should be active
 * @property {object} [flags]             An object of optional key/value flags
 */

/**
 * The Document definition for an AmbientSound.
 * Defines the DataSchema and common behaviors for an AmbientSound which are shared between both client and server.
 * @extends abstract.Document
 * @mixes AmbientSoundData
 * @memberof documents
 *
 * @param {AmbientSoundData} data                 Initial data from which to construct the AmbientSound
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseAmbientSound extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "AmbientSound",
    collection: "sounds",
    label: "DOCUMENT.AmbientSound",
    labelPlural: "DOCUMENT.AmbientSounds",
    isEmbedded: true
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      x: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0, label: "XCoord"}),
      y: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0, label: "YCoord"}),
      radius: new fields.NumberField({required: true, nullable: false, initial: 0, min: 0, step: 0.01,
        label: "SOUND.Radius"}),
      path: new fields.FilePathField({categories: ["AUDIO"], label: "SOUND.SourcePath"}),
      repeat: new fields.BooleanField(),
      volume: new fields.AlphaField({initial: 0.5, step: 0.01, label: "SOUND.MaxVol", hint: "SOUND.MaxVolHint"}),
      walls: new fields.BooleanField({initial: true, label: "SOUND.Walls", hint: "SOUND.WallsHint"}),
      easing: new fields.BooleanField({initial: true, label: "SOUND.Easing", hint: "SOUND.EasingHint"}),
      hidden: new fields.BooleanField({label: "Hidden"}),
      darkness: new fields.SchemaField({
        min: new fields.AlphaField({initial: 0}),
        max: new fields.AlphaField({initial: 1})
      }, {label: "SOUND.DarknessRange", hint: "SOUND.DarknessRangeHint"}),
      flags: new fields.ObjectField()
    }
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(data) {
    /**
     * Migrate legacy wall type attributes
     * @deprecated since v9
     */
    if ( "t" in data ) {
      data.walls = data.t === "l";
    }
    return super.migrateData(data);
  }
}
export default BaseAmbientSound;
