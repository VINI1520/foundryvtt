import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import * as documents from "./module.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @typedef {Object} PlaylistData
 * @property {string} _id                 The _id which uniquely identifies this Playlist document
 * @property {string} name                The name of this playlist
 * @property {string} description         The description of this playlist
 * @property {Collection<BasePlaylistSound>} sounds A Collection of PlaylistSounds embedded documents which belong to this playlist
 * @property {number} [mode=0]            The playback mode for sounds in this playlist
 * @property {boolean} [playing=false]    Is this playlist currently playing?
 * @property {number} [fade]              A duration in milliseconds to fade volume transition
 * @property {string|null} folder         The _id of a Folder which contains this playlist
 * @property {string} sorting             The sorting mode used for this playlist.
 * @property {number} [sort]              The numeric sort value which orders this playlist relative to its siblings
 * @property {number} [seed]              A seed used for playlist randomization to guarantee that all clients generate the same random order.
 * @property {object} [ownership]         An object which configures ownership of this Playlist
 * @property {object} [flags]             An object of optional key/value flags
 * @property {DocumentStats} [_stats]     An object of creation and access information
 */

/**
 * The Document definition for a Playlist.
 * Defines the DataSchema and common behaviors for a Playlist which are shared between both client and server.
 * @extends abstract.Document
 * @mixes PlaylistData
 * @memberof documents
 *
 * @param {PlaylistData} data                     Initial data from which to construct the Playlist
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BasePlaylist extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Playlist",
    collection: "playlists",
    indexed: true,
    compendiumIndexFields: ["_id", "name", "description", "sort", "folder"],
    embedded: {PlaylistSound: "sounds"},
    label: "DOCUMENT.Playlist",
    labelPlural: "DOCUMENT.Playlists",
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),
      description: new fields.StringField({textSearch: true}),
      sounds: new fields.EmbeddedCollectionField(documents.BasePlaylistSound),
      mode: new fields.NumberField({required: true, choices: Object.values(CONST.PLAYLIST_MODES),
        initial: CONST.PLAYLIST_MODES.SEQUENTIAL, validationError: "must be a value in CONST.PLAYLIST_MODES"}),
      playing: new fields.BooleanField(),
      fade: new fields.NumberField({positive: true}),
      folder: new fields.ForeignDocumentField(documents.BaseFolder),
      sorting: new fields.StringField({required: true, choices: Object.values(CONST.PLAYLIST_SORT_MODES),
        initial: CONST.PLAYLIST_SORT_MODES.ALPHABETICAL,
        validationError: "must be a value in CONST.PLAYLIST_SORTING_MODES"}),
      seed: new fields.NumberField({integer: true, min: 0}),
      sort: new fields.IntegerSortField(),
      ownership: new fields.DocumentOwnershipField(),
      flags: new fields.ObjectField(),
      _stats: new fields.DocumentStatsField()
    }
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(data) {
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
    this._addDataFieldShim(data, "permission", "ownership", {since: 10, until: 12});
    return super.shimData(data, options);
  }
}
export default BasePlaylist;
