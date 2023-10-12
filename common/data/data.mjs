/**
 * The collection of data schema and document definitions for primary documents which are shared between the both the
 * client and the server.
 * @namespace data
 */

import {DataModel} from "../abstract/module.mjs";
import * as fields from "./fields.mjs";
import * as documents from "../documents/module.mjs";

/**
 * @typedef {Object} LightAnimationData
 * @property {string} type          The animation type which is applied
 * @property {number} speed         The speed of the animation, a number between 0 and 10
 * @property {number} intensity     The intensity of the animation, a number between 1 and 10
 * @property {boolean} reverse      Reverse the direction of animation.
 */

/**
 * A reusable document structure for the internal data used to render the appearance of a light source.
 * This is re-used by both the AmbientLightData and TokenData classes.
 * @extends DataModel
 * @memberof data
 *
 * @property {number} alpha               An opacity for the emitted light, if any
 * @property {number} angle               The angle of emission for this point source
 * @property {number} bright              The allowed radius of bright vision or illumination
 * @property {number} color               A tint color for the emitted light, if any
 * @property {number} coloration          The coloration technique applied in the shader
 * @property {number} contrast            The amount of contrast this light applies to the background texture
 * @property {number} dim                 The allowed radius of dim vision or illumination
 * @property {number} attenuation         Fade the difference between bright, dim, and dark gradually?
 * @property {number} luminosity          The luminosity applied in the shader
 * @property {number} saturation          The amount of color saturation this light applies to the background texture
 * @property {number} shadows             The depth of shadows this light applies to the background texture
 * @property {LightAnimationData} animation  An animation configuration for the source
 * @property {{min: number, max: number}} darkness  A darkness range (min and max) for which the source should be active
 */
class LightData extends DataModel {
  static defineSchema() {
    return {
      alpha: new fields.AlphaField({initial: 0.5, label: "LIGHT.Alpha"}),
      angle: new fields.AngleField({initial: 360, base: 360, label: "LIGHT.Angle"}),
      bright: new fields.NumberField({required: true, initial: 0, min: 0, step: 0.01, label: "LIGHT.Bright"}),
      color: new fields.ColorField({label: "LIGHT.Color"}),
      coloration: new fields.NumberField({required: true, integer: true, initial: 1,
        label: "LIGHT.ColorationTechnique", hint: "LIGHT.ColorationTechniqueHint"}),
      dim: new fields.NumberField({required: true, initial: 0, min: 0, step: 0.01, label: "LIGHT.Dim"}),
      attenuation: new fields.AlphaField({initial: 0.5, label: "LIGHT.Attenuation", hint: "LIGHT.AttenuationHint"}),
      luminosity: new fields.NumberField({required: true, nullable: false, initial: 0.5, min: -1, max: 1,
        label: "LIGHT.Luminosity", hint: "LIGHT.LuminosityHint"}),
      saturation: new fields.NumberField({required: true, nullable: false, initial: 0, min: -1, max: 1,
        label: "LIGHT.Saturation", hint: "LIGHT.SaturationHint"}),
      contrast: new fields.NumberField({required: true, nullable: false, initial: 0, min: -1, max: 1,
        label: "LIGHT.Contrast", hint: "LIGHT.ContrastHint"}),
      shadows: new fields.NumberField({required: true, nullable: false, initial: 0, min: 0, max: 1,
        label: "LIGHT.Shadows", hint: "LIGHT.ShadowsHint"}),
      animation: new fields.SchemaField({
        type: new fields.StringField({nullable: true, blank: false, initial: null, label: "LIGHT.AnimationType"}),
        speed: new fields.NumberField({required: true, integer: true, initial: 5, min: 0, max: 10,
          label: "LIGHT.AnimationSpeed", validationError: "Light animation speed must be an integer between 0 and 10"}),
        intensity: new fields.NumberField({required: true, integer: true, initial: 5, min: 0, max: 10,
          label: "LIGHT.AnimationIntensity",
          validationError: "Light animation intensity must be an integer between 1 and 10"}),
        reverse: new fields.BooleanField({label: "LIGHT.AnimationReverse"})
      }),
      darkness: new fields.SchemaField({
        min: new fields.AlphaField({initial: 0}),
        max: new fields.AlphaField({initial: 1})
      }, {
        label: "LIGHT.DarknessRange", hint: "LIGHT.DarknessRangeHint", validate: d => (d.min ?? 0) <= (d.max ?? 1),
        validationError: "darkness.max may not be less than darkness.min"
      })
    }
  }

  /** @inheritdoc */
  static migrateData(data) {

    // Migrate negative radius to luminosity slider
    let isDarkness = false;
    if ( data.angle === 0 ) data.angle = 360;
    if ( data.dim < 0 ) {
      data.dim = Math.abs(data.dim);
      isDarkness = true;
    }
    if ( data.bright < 0 ) {
      data.bright = Math.abs(data.bright);
      isDarkness = true;
    }
    if ( isDarkness ) data.luminosity = Math.abs(data.luminosity) * -1;

    // Migrate gradual checkbox into attenuation slider
    if ( "gradual" in data ) {
      data.attenuation = data.gradual ? 0.5 : 0.3;
      delete data.gradual;
    }
    return super.migrateData(data);
  }
}

/* ---------------------------------------- */

/**
 * A data model intended to be used as an inner EmbeddedDataField which defines a geometric shape.
 * @extends DataModel
 * @memberof data
 *
 * @property {string} type                The type of shape, a value in ShapeData.TYPES.
 *                                        For rectangles, the x/y coordinates are the top-left corner.
 *                                        For circles, the x/y coordinates are the center of the circle.
 *                                        For polygons, the x/y coordinates are the first point of the polygon.
 * @property {number} [width]             For rectangles, the pixel width of the shape.
 * @property {number} [height]            For rectangles, the pixel width of the shape.
 * @property {number} [radius]            For circles, the pixel radius of the shape.
 * @property {number[]} [points]          For polygons, the array of polygon coordinates which comprise the shape.
 */
class ShapeData extends DataModel {
  static defineSchema() {
    return {
      type: new fields.StringField({required: true, blank: false, choices: Object.values(this.TYPES), initial: "r"}),
      width: new fields.NumberField({required: false, integer: true, min: 0}),
      height: new fields.NumberField({required: false, integer: true, min: 0}),
      radius: new fields.NumberField({required: false, integer: true, positive: true}),
      points: new fields.ArrayField(new fields.NumberField({nullable: false}))
    }
  }

  /**
   * The primitive shape types which are supported
   * @enum {string}
   */
  static TYPES = {
    RECTANGLE: "r",
    CIRCLE: "c",
    ELLIPSE: "e",
    POLYGON: "p"
  }
}

/* ---------------------------------------- */


/**
 * A {@link fields.SchemaField} subclass used to represent texture data.
 * @property {string|null} src          The URL of the texture source.
 * @property {number} [scaleX=1]        The scale of the texture in the X dimension.
 * @property {number} [scaleY=1]        The scale of the texture in the Y dimension.
 * @property {number} [offsetX=0]       The X offset of the texture with (0,0) in the top left.
 * @property {number} [offsetY=0]       The Y offset of the texture with (0,0) in the top left.
 * @property {number} [rotation]        An angle of rotation by which this texture is rotated around its center.
 * @property {string|null} [tint=null]  An optional color string used to tint the texture.
 */
class TextureData extends fields.SchemaField {
  /**
   * @param {DataFieldOptions} options          Options which are forwarded to the SchemaField constructor
   * @param {FilePathFieldOptions} srcOptions   Additional options for the src field
   */
  constructor(options={}, {categories=["IMAGE", "VIDEO"], initial=null, wildcard=false, label=""}={}) {
    super({
      src: new fields.FilePathField({categories, initial, label, wildcard}),
      scaleX: new fields.NumberField({nullable: false, initial: 1}),
      scaleY: new fields.NumberField({nullable: false, initial: 1}),
      offsetX: new fields.NumberField({nullable: false, integer: true, initial: 0}),
      offsetY: new fields.NumberField({nullable: false, integer: true, initial: 0}),
      rotation: new fields.AngleField(),
      tint: new fields.ColorField()
    }, options);
  }
}

/* ---------------------------------------- */

/**
 * Extend the base TokenData to define a PrototypeToken which exists within a parent Actor.
 * @extends abstract.DataModel
 * @memberof data
 * @property {boolean} randomImg      Does the prototype token use a random wildcard image?
 */
class PrototypeToken extends DataModel {
  constructor(data={}, options={}) {
    super(data, options);
    Object.defineProperty(this, "apps", {value: {}});
  }

  /* -------------------------------------------- */

  static defineSchema() {
    const schema = documents.BaseToken.defineSchema();
    const excluded = ["_id", "actorId", "delta", "x", "y", "elevation", "effects", "overlayEffect", "hidden"];
    for ( let x of excluded ) {
      delete schema[x];
    }
    schema.name = new fields.StringField({required: true, blank: true});  // Prototype token name can be blank
    schema.randomImg = new fields.BooleanField();
    return schema;
  }

  /**
   * The Actor which owns this Prototype Token
   * @type {documents.BaseActor}
   */
  get actor() {
    return this.parent;
  }

  /** @inheritdoc */
  toObject(source=true) {
    const data = super.toObject(source);
    data["actorId"] = this.document?.id;
    return data;
  }

  /**
   * @see ClientDocument.database
   * @ignore
   */
  static get database() {
    return globalThis.CONFIG.DatabaseBackend;
  }

  /** @inheritdoc */
  static migrateData(data) {
    return documents.BaseToken.migrateData(data);
  }

  /** @inheritdoc */
  static shimData(data, options) {
    return documents.BaseToken.shimData(data, options);
  }

  /* -------------------------------------------- */
  /*  Document Compatibility Methods              */
  /* -------------------------------------------- */

  /**
   * @see abstract.Document#update
   * @ignore
   */
  update(data, options) {
    return this.actor.update({prototypeToken: data}, options);
  }

  /* -------------------------------------------- */

  /**
   * @see abstract.Document#getFlag
   * @ignore
   */
  getFlag(...args) {
    return foundry.abstract.Document.prototype.getFlag.call(this, ...args);
  }

  /* -------------------------------------------- */

  /**
   * @see abstract.Document#getFlag
   * @ignore
   */
  setFlag(...args) {
    return foundry.abstract.Document.prototype.setFlag.call(this, ...args);
  }

  /* -------------------------------------------- */

  /**
   * @see abstract.Document#unsetFlag
   * @ignore
   */
  async unsetFlag(...args) {
    return foundry.abstract.Document.prototype.unsetFlag.call(this, ...args);
  }

  /* -------------------------------------------- */

  /**
   * @see abstract.Document#testUserPermission
   * @ignore
   */
  testUserPermission(user, permission, {exact=false}={}) {
    return this.actor.testUserPermission(user, permission, {exact});
  }

  /* -------------------------------------------- */

  /**
   * @see documents.BaseActor#isOwner
   * @ignore
   */
  get isOwner() {
    return this.actor.isOwner;
  }
}

/* -------------------------------------------- */

/**
 * A minimal data model used to represent a tombstone entry inside an {@link EmbeddedCollectionDelta}.
 * @see {EmbeddedCollectionDelta}
 * @extends DataModel
 * @memberof data
 *
 * @property {string} _id              The _id of the base Document that this tombstone represents.
 * @property {boolean} _tombstone      A property that identifies this entry as a tombstone.
 * @property {DocumentStats} [_stats]  An object of creation and access information.
 */
class TombstoneData extends DataModel {
  /** @override */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      _tombstone: new fields.BooleanField({initial: true, validate: v => v === true, validationError: "must be true"}),
      _stats: new fields.DocumentStatsField()
    };
  }
}

/* -------------------------------------------- */

/**
 * @deprecated since v10
 * @see PrototypeToken
 * @ignore
 */
class PrototypeTokenData extends PrototypeToken {
  constructor(...args) {
    foundry.utils.logCompatibilityWarning("You are using the PrototypeTokenData class which has been renamed to" +
      " PrototypeToken and will be removed.", {since: 10, until: 12});
    super(...args);
  }
}

// Exports need to be at the bottom so that class names appear correctly in JSDoc
export {
  LightData,
  PrototypeToken,
  PrototypeTokenData,
  ShapeData,
  TextureData,
  TombstoneData
}
