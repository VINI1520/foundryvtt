import Document from "../abstract/document.mjs";
import {mergeObject, setProperty} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import {LightData} from "../data/data.mjs";

/**
 * @typedef {Object} AmbientLightData
 * @property {string} _id                 The _id which uniquely identifies this BaseAmbientLight embedded document
 * @property {number} [x=0]               The x-coordinate position of the origin of the light
 * @property {number} [y=0]               The y-coordinate position of the origin of the light
 * @property {number} [rotation=0]        The angle of rotation for the tile between 0 and 360
 * @property {boolean} [walls=true]       Whether or not this light source is constrained by Walls
 * @property {boolean} [vision=false]     Whether or not this light source provides a source of vision
 * @property {LightData} config           Light configuration data
 * @property {boolean} [hidden=false]     Is the light source currently hidden?
 * @property {object} [flags]             An object of optional key/value flags
 */

/**
 * The Document definition for an AmbientLight.
 * Defines the DataSchema and common behaviors for an AmbientLight which are shared between both client and server.
 * @extends abstract.Document
 * @mixes AmbientLightData
 * @memberof documents
 *
 * @param {AmbientLightData} data                 Initial data from which to construct the AmbientLight
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseAmbientLight extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "AmbientLight",
    collection: "lights",
    label: "DOCUMENT.AmbientLight",
    labelPlural: "DOCUMENT.AmbientLights"
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      x: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0, label: "XCoord"}),
      y: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0, label: "YCoord"}),
      rotation: new fields.AngleField({label: "LIGHT.Rotation"}),
      walls: new fields.BooleanField({initial: true, label: "LIGHT.Walls", hint: "LIGHT.WallsHint"}),
      vision: new fields.BooleanField({label: "LIGHT.Vision", hint: "LIGHT.VisionHint"}),
      config: new fields.EmbeddedDataField(LightData),
      hidden: new fields.BooleanField({label: "Hidden"}),
      flags: new fields.ObjectField()
    }
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(data) {

    /**
     * Migrate darkness threshold to inner object
     * @deprecated since v8
     */
    this._addDataFieldMigration(data, "darknessThreshold", "darkness.min");

    /**
     * Migrate light parameters to inner config object
     * @deprecated since v9
     */
    for ( const [oldKey, newKey] of Object.entries({
      dim: "config.dim",
      bright: "config.bright",
      angle: "config.angle",
      tintColor: "config.color",
      tintAlpha: "config.alpha",
      lightAnimation: "config.animation",
      darkness: "config.darkness"
    }) ) this._addDataFieldMigration(data, oldKey, newKey);

    /**
     * Migrate source types to boolean flags
     * @deprecated since v9
     */
    if ( "t" in data ) {
      data.walls = data.t !== "u"; // formerly CONST.SOURCE_TYPES
      data.vision = data.t !== "l"; // formerly CONST.SOURCE_TYPES
    }
    return super.migrateData(data);
  }
}
export default BaseAmbientLight;
