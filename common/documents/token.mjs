import Document from "../abstract/document.mjs";
import {mergeObject, setProperty} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import * as documents from "./module.mjs";
import * as fields from "../data/fields.mjs";
import {LightData, TextureData} from "../data/data.mjs";

/**
 * @typedef {Object} TokenSightData
 * @property {boolean} enabled            Should vision computation and rendering be active for this Token?
 * @property {number} range               How far in distance units the Token can see without the aid of a light source
 * @property {number} [angle=360]         An angle at which the Token can see relative to their direction of facing
 * @property {string} [visionMode=basic]  The vision mode which is used to render the appearance of the visible area
 * @property {string} [color]             A special color which applies a hue to the visible area
 * @property {number} [attenuation]       A degree of attenuation which gradually fades the edges of the visible area
 * @property {number} [brightness=0]      An advanced customization for the perceived brightness of the visible area
 * @property {number} [saturation=0]      An advanced customization of color saturation within the visible area
 * @property {number} [contrast=0]        An advanced customization for contrast within the visible area
 */

/**
 * @typedef {Object} TokenDetectionMode
 * @property {string} id                  The id of the detection mode, a key from CONFIG.Canvas.detectionModes
 * @property {boolean} enabled            Whether or not this detection mode is presently enabled
 * @property {number} range               The maximum range in distance units at which this mode can detect targets
 */

/**
 * @typedef {Object} TokenData
 * @property {string} _id                 The Token _id which uniquely identifies it within its parent Scene
 * @property {string} name                The name used to describe the Token
 * @property {number} [displayName=0]     The display mode of the Token nameplate, from CONST.TOKEN_DISPLAY_MODES
 * @property {string|null} actorId        The _id of an Actor document which this Token represents
 * @property {boolean} [actorLink=false]  Does this Token uniquely represent a singular Actor, or is it one of many?
 * @property {object} [actorData]         Token-level data which overrides the base data of the associated Actor
 * @property {TextureData} texture        The token's texture on the canvas.
 * @property {number} [width=1]           The width of the Token in grid units
 * @property {number} [height=1]          The height of the Token in grid units
 * @property {number} [x=0]               The x-coordinate of the top-left corner of the Token
 * @property {number} [y=0]               The y-coordinate of the top-left corner of the Token
 * @property {number} [elevation=0]       The vertical elevation of the Token, in distance units
 * @property {boolean} [lockRotation=false]  Prevent the Token image from visually rotating?
 * @property {number} [rotation=0]        The rotation of the Token in degrees, from 0 to 360. A value of 0 represents a southward-facing Token.
 * @property {string[]} [effects]         An array of effect icon paths which are displayed on the Token
 * @property {string} [overlayEffect]     A single icon path which is displayed as an overlay on the Token
 * @property {number} [alpha=1]           The opacity of the token image
 * @property {boolean} [hidden=false]     Is the Token currently hidden from player view?
 * @property {number} [disposition=-1]    A displayed Token disposition from CONST.TOKEN_DISPOSITIONS
 * @property {number} [displayBars=0]     The display mode of Token resource bars, from CONST.TOKEN_DISPLAY_MODES
 * @property {TokenBarData} [bar1]        The configuration of the Token's primary resource bar
 * @property {TokenBarData} [bar2]        The configuration of the Token's secondary resource bar
 * @property {data.LightData} [light]     Configuration of the light source that this Token emits
 * @property {TokenSightData} sight       Configuration of sight and vision properties for the Token
 * @property {TokenDetectionMode[]} detectionModes  An array of detection modes which are available to this Token
 * @property {object} [flags]             An object of optional key/value flags
 */

/**
 * @typedef {Object} TokenBarData
 * @property {string} [attribute]         The attribute path within the Token's Actor data which should be displayed
 */

/**
 * The base Token model definition which defines common behavior of a Token document between both client and server.
 * @extends Document
 * @mixes {TokenData}
 * @memberof documents
 */
class BaseToken extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Token",
    collection: "tokens",
    label: "DOCUMENT.Token",
    labelPlural: "DOCUMENT.Tokens",
    isEmbedded: true,
    permissions: {
      create: "TOKEN_CREATE",
      update: this.#canUpdate,
      delete: "TOKEN_DELETE"
    }
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: true}),
      displayName: new fields.NumberField({required: true, initial: CONST.TOKEN_DISPLAY_MODES.NONE,
        choices: Object.values(CONST.TOKEN_DISPLAY_MODES),
        validationError: "must be a value in CONST.TOKEN_DISPLAY_MODES"
      }),
      actorId: new fields.ForeignDocumentField(documents.BaseActor, {idOnly: true}),
      actorLink: new fields.BooleanField(),
      actorData: new fields.ObjectField(),
      texture: new TextureData({}, {initial: () => this.DEFAULT_ICON, wildcard: true}),
      width: new fields.NumberField({positive: true, initial: 1, label: "Width"}),
      height: new fields.NumberField({positive: true, initial: 1, label: "Height"}),
      x: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0, label: "XCoord"}),
      y: new fields.NumberField({required: true, integer: true, nullable: false, initial: 0, label: "YCoord"}),
      elevation: new fields.NumberField({required: true, nullable: false, initial: 0}),
      lockRotation: new fields.BooleanField(),
      rotation: new fields.AngleField(),
      effects: new fields.ArrayField(new fields.StringField()),
      overlayEffect: new fields.StringField(),
      alpha: new fields.AlphaField(),
      hidden: new fields.BooleanField(),
      disposition: new fields.NumberField({required: true, choices: Object.values(CONST.TOKEN_DISPOSITIONS),
        initial: CONST.TOKEN_DISPOSITIONS.HOSTILE,
        validationError: "must be a value in CONST.TOKEN_DISPOSITIONS"
      }),
      displayBars: new fields.NumberField({required: true, choices: Object.values(CONST.TOKEN_DISPLAY_MODES),
        initial: CONST.TOKEN_DISPLAY_MODES.NONE,
        validationError: "must be a value in CONST.TOKEN_DISPLAY_MODES"
      }),
      bar1: new fields.SchemaField({
        attribute: new fields.StringField({required: true, nullable: true, blank: false,
          initial: () => game?.system.primaryTokenAttribute || null})
      }),
      bar2: new fields.SchemaField({
        attribute: new fields.StringField({required: true, nullable: true, blank: false,
          initial: () => game?.system.secondaryTokenAttribute || null})
      }),
      light: new fields.EmbeddedDataField(LightData),
      sight: new fields.SchemaField({
        enabled: new fields.BooleanField({initial: data => Number(data?.sight?.range) > 0}),
        range: new fields.NumberField({required: true, min: 0, step: 0.01}),
        angle: new fields.AngleField({initial: 360, base: 360}),
        visionMode: new fields.StringField({required: true, blank: false, initial: "basic",
          label: "TOKEN.VisionMode", hint: "TOKEN.VisionModeHint"}),
        color: new fields.ColorField({label: "TOKEN.VisionColor"}),
        attenuation: new fields.AlphaField({initial: 0.1, label: "TOKEN.VisionAttenuation", hint: "TOKEN.VisionAttenuationHint"}),
        brightness: new fields.NumberField({required: true, nullable: false, initial: 0, min: -1, max: 1,
          label: "TOKEN.VisionBrightness", hint: "TOKEN.VisionBrightnessHint"}),
        saturation: new fields.NumberField({required: true, nullable: false, initial: 0, min: -1, max: 1,
          label: "TOKEN.VisionSaturation", hint: "TOKEN.VisionSaturationHint"}),
        contrast: new fields.NumberField({required: true, nullable: false, initial: 0, min: -1, max: 1,
          label: "TOKEN.VisionContrast", hint: "TOKEN.VisionContrastHint"})
      }),
      detectionModes: new fields.ArrayField(new fields.SchemaField({
        id: new fields.StringField(),
        enabled: new fields.BooleanField({initial: true}),
        range: new fields.NumberField({required: true, min: 0, step: 0.01, initial: 0})
      }), {
        validate: BaseToken.#validateDetectionModes
      }),
      flags: new fields.ObjectField()
    }
  }

  /* -------------------------------------------- */

  /**
   * Validate the structure of the detection modes array
   * @param {object[]} modes    Configured detection modes
   * @throws                    An error if the array is invalid
   */
  static #validateDetectionModes(modes) {
    const seen = new Set();
    for ( const mode of modes ) {
      if ( mode.id === "" ) continue;
      if ( seen.has(mode.id) ) {
        throw new Error(`may not have more than one configured detection mode of type "${mode.id}"`);
      }
      seen.add(mode.id);
    }
  }

  /* -------------------------------------------- */

  /**
   * The default icon used for newly created Token documents
   * @type {string}
   */
  static DEFAULT_ICON = CONST.DEFAULT_TOKEN;

  /**
   * Is a user able to update an existing Token?
   * @private
   */
  static #canUpdate(user, doc, data) {
    if ( user.isGM ) return true;                     // GM users can do anything
    if ( doc.actor ) {                                // You can update Tokens for Actors you control
      return doc.actor.canUserModify(user, "update", data);
    }
    return !!doc.actorId;                             // It would be good to harden this in the future
  }

  /** @override */
  testUserPermission(user, permission, {exact=false} = {}) {
    if ( this.actor ) return this.actor.testUserPermission(user, permission, {exact});
    else return super.testUserPermission(user, permission, {exact});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static cleanData(source={}, options={}) {
    const cleaned = super.cleanData(source, options);
    if ( "actorData" in cleaned ) {  // Prevent actor data overrides from circularly referencing the prototype token
      delete cleaned.actorData["token"];
      delete cleaned.actorData["prototypeToken"];
    }
    return cleaned;
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static migrateData(data) {
    const keys = new Set(Object.keys(data));

    /**
     * Migration of actor data to system data
     * @deprecated since v10
     */
    if ( data.actorData ) {
      foundry.documents.BaseActor.migrateData(data.actorData);
    }
    if ( data.actorData?.items ) {
      for ( const item of data.actorData.items ) foundry.documents.BaseItem.migrateData(item);
    }
    if ( data.actorData?.effects ) {
      for ( const effect of data.actorData.effects ) foundry.documents.BaseActiveEffect.migrateData(effect);
    }

    /**
     * Light config migration
     * @deprecated since v9
     */
    for ( const [oldKey, newKey] of Object.entries({
      "dimLight": "light.dim",
      "brightLight": "light.bright",
      "lightAngle": "light.angle",
      "lightColor": "light.color",
      "lightAlpha": "light.alpha",
      "lightAnimation": "light.animation"
    })) {
      if ( keys.has(oldKey) ) {
        setProperty(data, newKey, data[oldKey]);
        delete data[oldKey];
      }
    }

    /**
     * Migration to TextureData.
     * @deprecated since v10
     */
    for ( const [oldKey, newKey] of Object.entries({"img": "texture.src", "tint": "texture.tint"})) {
      if ( keys.has(oldKey) ) {
        setProperty(data, newKey, data[oldKey]);
        delete data[oldKey];
      }
    }

    let scaleX = data.texture?.scaleX ?? 1;
    let scaleY = data.texture?.scaleY ?? 1;

    /**
     * Texture scale migration
     * @deprecated since v10
     */
    if ( keys.has("scale") ) {
      scaleX = scaleY = data.scale;
      setProperty(data, "texture.scaleX", data.scale);
      setProperty(data, "texture.scaleY", data.scale);
      delete data.scale;
    }
    if ( keys.has("mirrorX") ) {
      setProperty(data, "texture.scaleX", data.mirrorX ? -Math.abs(scaleX) : Math.abs(scaleX));
      delete data.mirrorX;
    }
    if ( keys.has("mirrorY") ) {
      setProperty(data, "texture.scaleY", data.mirrorY ? -Math.abs(scaleY) : Math.abs(scaleY));
      delete data.mirrorY;
    }

    /**
     * Sight migration
     * @deprecated since v10
     */
    for ( const [oldKey, newKey] of Object.entries({"sightAngle": "sight.angle", "vision": "sight.enabled"})) {
      if ( keys.has(oldKey) ) {
        setProperty(data, newKey, data[oldKey]);
        delete data[oldKey];
      }
    }
    if ( keys.has("dimSight") || keys.has("brightSight") ) {
      const oldDimSight = data?.dimSight ?? 0;
      const oldBrightSight = data?.brightSight ?? 0;
      const newRange = Math.max(oldDimSight, oldBrightSight);
      setProperty(data, "sight.range", newRange);
      for ( const oldKey of ["dimSight", "brightSight"] ) {
        if ( keys.has(oldKey) ) delete data[oldKey];
      }
      // Compute brightness with old dim/bright values
      let brightness = 0;
      if ( oldBrightSight >= oldDimSight ) brightness = 1;
      setProperty(data, "sight.brightness", brightness);
    }
    // Parent class migrations
    return super.migrateData(data);
  }

  /* ----------------------------------------- */

  /** @inheritdoc */
  static shimData(data, options) {
    const shims = {
      img: "texture.src",
      tint: "texture.tint",
      vision: "sight.enabled"
    };
    this._addDataFieldShims(data, shims, {since: 10, until: 12});
    if ( "texture" in data ) {
      this._addDataFieldShim(data, "mirrorX", "texture.scaleX", {value: data.texture.scaleX < 0, since: 10, until: 12});
      this._addDataFieldShim(data, "mirrorY", "texture.scaleY", {value: data.texture.scaleY < 0, since: 10, until: 12});
    }
    if ( !data.hasOwnProperty("scale") && ("texture" in data) ) {
      Object.defineProperty(data, "scale", {
        get: () => {
          this._logDataFieldMigration("scale", "texture#scaleX/scaleY", {since: 10, until: 12});
          return Math.abs(data.texture.scaleX);
        },
        set: value => {
          data.texture.scaleX = value;
          data.texture.scaleY = value;
        },
        configurable: true,
        enumerable: false
      });
    }
    return super.shimData(data, options);
  }
}
export default BaseToken;
