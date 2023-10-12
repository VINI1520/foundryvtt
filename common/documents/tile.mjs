import Document from "../abstract/document.mjs";
import {mergeObject, setProperty} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import * as fields from "../data/fields.mjs";
import {TextureData} from "../data/data.mjs";

/**
 * @typedef {Object} TileOcclusionData
 * @property {number} mode        The occlusion mode from CONST.TILE_OCCLUSION_MODES
 * @property {number} alpha       The occlusion alpha between 0 and 1
 * @property {number} [radius]    An optional radius of occlusion used for RADIAL mode
 */

/**
 * @typedef {Object} TileVideoData
 * @property {boolean} loop       Automatically loop the video?
 * @property {boolean} autoplay   Should the video play automatically?
 * @property {number} volume      The volume level of any audio that the video file contains
 */

/**
 * @typedef {Object} TileData
 * @property {string} _id                 The _id which uniquely identifies this Tile embedded document
 * @property {TextureData} [texture]      An image or video texture which this tile displays.
 * @property {number} [width=0]           The pixel width of the tile
 * @property {number} [height=0]          The pixel height of the tile
 * @property {number} [x=0]               The x-coordinate position of the top-left corner of the tile
 * @property {number} [y=0]               The y-coordinate position of the top-left corner of the tile
 * @property {number} [z=100]             The z-index ordering of this tile relative to its siblings
 * @property {number} [rotation=0]        The angle of rotation for the tile between 0 and 360
 * @property {number} [alpha=1]           The tile opacity
 * @property {boolean} [hidden=false]     Is the tile currently hidden?
 * @property {boolean} [locked=false]     Is the tile currently locked?
 * @property {boolean} [overhead=false]   Is the tile an overhead tile?
 * @property {TileOcclusionData} [occlusion]  The tile's occlusion settings
 * @property {TileVideoData} [video]      The tile's video settings
 * @property {object} [flags]             An object of optional key/value flags
 */

/**
 * The Document definition for a Tile.
 * Defines the DataSchema and common behaviors for a Tile which are shared between both client and server.
 * @extends abstract.Document
 * @mixes TileData
 * @memberof documents
 *
 * @param {TileData} data                         Initial data from which to construct the Tile
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseTile extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Tile",
    collection: "tiles",
    label: "DOCUMENT.Tile",
    labelPlural: "DOCUMENT.Tiles"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      texture: new TextureData(),
      width: new fields.NumberField({required: true, min: 0, nullable: false, step: 0.1}),
      height: new fields.NumberField({required: true, min: 0, nullable: false, step: 0.1}),
      x: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0, label: "XCoord"}),
      y: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0, label: "YCoord"}),
      z: new fields.NumberField({required: true, integer: true, nullable: false, initial: 100}),
      rotation: new fields.AngleField(),
      alpha: new fields.AlphaField(),
      hidden: new fields.BooleanField(),
      locked: new fields.BooleanField(),
      overhead: new fields.BooleanField(),
      roof: new fields.BooleanField(),
      occlusion: new fields.SchemaField({
        mode: new fields.NumberField({choices: Object.values(CONST.OCCLUSION_MODES),
          initial: CONST.OCCLUSION_MODES.FADE,
          validationError: "must be a value in CONST.TILE_OCCLUSION_MODES"}),
        alpha: new fields.AlphaField({initial: 0}),
        radius: new fields.NumberField({positive: true})
      }),
      video: new fields.SchemaField({
        loop: new fields.BooleanField({initial: true}),
        autoplay: new fields.BooleanField({initial: true}),
        volume: new fields.AlphaField({initial: 0, step: 0.01})
      }),
      flags: new fields.ObjectField()
    }
  }

  /** @inheritdoc */
  static migrateData(data) {
    /**
     * Migration to TextureData.
     * @deprecated since v10
     */
    this._addDataFieldMigration(data, "img", "texture.src");
    this._addDataFieldMigration(data, "tint", "texture.tint");

    data.texture = data.texture || {};
    if ( ("width" in data) && (data.width < 0) ) {
      data.width = Math.abs(data.width);
      data.texture.scaleX = -1;
    }
    if ( ("height" in data) && (data.height < 0) ) {
      data.height = Math.abs(data.height);
      data.texture.scaleY = -1;
    }
    /**
     * Migration from roof occlusion mode to fade occlusion mode and roof -> true.
     * @deprecated since v10
     */
    if ( Number(data?.occlusion?.mode) === 2 ) {
      data.occlusion.mode = 1;
      data.roof = true;
    }
    return super.migrateData(data);
  }

  /** @inheritdoc */
  static shimData(data, options) {
    /**
     * Migration to TextureData.
     * @deprecated since v10
     */
    const shims = {
      img: "texture.src",
      tint: "texture.tint"
    };
    this._addDataFieldShims(data, shims, {since: 10, until: 12});
    return super.shimData(data, options);
  }
}
export default BaseTile;
