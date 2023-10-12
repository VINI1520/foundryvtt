import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as documents from "./module.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @typedef {Object} PlaylistSoundData
 * @property {string} _id                 The _id which uniquely identifies this PlaylistSound document
 * @property {string} name                The name of this sound
 * @property {string} description         The description of this sound
 * @property {string} path                The audio file path that is played by this sound
 * @property {boolean} [playing=false]    Is this sound currently playing?
 * @property {number} [pausedTime=null]   The time in seconds at which playback was paused
 * @property {boolean} [repeat=false]     Does this sound loop?
 * @property {number} [volume=0.5]        The audio volume of the sound, from 0 to 1
 * @property {number} [fade]              A duration in milliseconds to fade volume transition
 * @property {number} [sort=0]            The sort order of the PlaylistSound relative to others in the same collection
 * @property {object} [flags]             An object of optional key/value flags
 */

/**
 * The Document definition for a PlaylistSound.
 * Defines the DataSchema and common behaviors for a PlaylistSound which are shared between both client and server.
 * @extends abstract.Document
 * @mixes PlaylistSoundData
 * @memberof documents
 *
 * @param {PlaylistSoundData} data                Initial data from which to construct the PlaylistSound
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BasePlaylistSound extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "PlaylistSound",
    collection: "sounds",
    indexed: true,
    label: "DOCUMENT.PlaylistSound",
    labelPlural: "DOCUMENT.PlaylistSounds"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false}),
      description: new fields.StringField(),
      path: new fields.FilePathField({categories: ["AUDIO"]}),
      playing: new fields.BooleanField(),
      pausedTime: new fields.NumberField({min: 0}),
      repeat: new fields.BooleanField(),
      volume: new fields.AlphaField({initial: 0.5, step: 0.01}),
      fade: new fields.NumberField({integer: true, min: 0}),
      sort: new fields.IntegerSortField(),
      flags: new fields.ObjectField(),
    }
  }

  /* -------------------------------------------- */
  /*  Model Methods                               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  testUserPermission(user, permission, {exact = false} = {}) {
    if ( this.isEmbedded ) return this.parent.testUserPermission(user, permission, {exact});
    return super.testUserPermission(user, permission, {exact});
  }
}
export default BasePlaylistSound;
