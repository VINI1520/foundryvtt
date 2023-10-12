import BasePackage from "./base-package.mjs";
import * as fields from "../data/fields.mjs";

/**
 * The data schema used to define System manifest files.
 * Extends the basic PackageData schema with some additional system-specific fields.
 * @property {string} [background]        A web URL or local file path which provides a default background banner for
 *                                        worlds which are created using this system
 * @property {string} [initiative]        A default initiative formula used for this system
 * @property {number} [gridDistance]      A default distance measurement to use for Scenes in this system
 * @property {string} [gridUnits]         A default unit of measure to use for distance measurement in this system
 * @property {string} [primaryTokenAttribute] An Actor data attribute path to use for Token primary resource bars
 * @property {string} [primaryTokenAttribute] An Actor data attribute path to use for Token secondary resource bars
 */
export default class BaseSystem extends BasePackage {

  /** @inheritDoc */
  static defineSchema() {
    return Object.assign({}, super.defineSchema(), {
      background: new fields.StringField({required: false, blank: false}),
      initiative: new fields.StringField(),
      gridDistance: new fields.NumberField(),
      gridUnits: new fields.StringField(),
      primaryTokenAttribute: new fields.StringField(),
      secondaryTokenAttribute: new fields.StringField()
    });
  }

  /** @inheritdoc */
  static type = "system";

  /**
   * The default icon used for this type of Package.
   * @type {string}
   */
  static icon = "fa-dice";

  /**
   * An alias for the document types available in the currently active World.
   * @enum string[]
   */
  get documentTypes() {
    return game.documentTypes;
  }

  /**
   * An alias for the raw template JSON loaded from the game System.
   * @type {object}
   */
  get template() {
    return game.template;
  }

  /**
   * An alias for the structured data model organized by document class and type.
   * @type {object}
   */
  get model() {
    return game.model;
  }
}
