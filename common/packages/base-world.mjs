import BasePackage from "./base-package.mjs";
import * as fields from "../data/fields.mjs";

/**
 * The data schema used to define World manifest files.
 * Extends the basic PackageData schema with some additional world-specific fields.
 * @property {string} system            The game system name which this world relies upon
 * @property {string} coreVersion       The version of the core software for which this world has been migrated
 * @property {string} systemVersion     The version of the game system for which this world has been migrated
 * @property {string} [background]      A web URL or local file path which provides a background banner image
 * @property {string} [nextSession]     An ISO datetime string when the next game session is scheduled to occur
 * @property {boolean} [resetKeys]      Should user access keys be reset as part of the next launch?
 * @property {boolean} [safeMode]       Should the world launch in safe mode?
 */
export default class BaseWorld extends BasePackage {

  /** @inheritDoc */
  static defineSchema() {
    return Object.assign({}, super.defineSchema(), {
      system: new fields.StringField({required: true, blank: false}),
      background: new fields.StringField({required: false, blank: false, initial: undefined}),
      coreVersion: new fields.StringField({required: true, blank: false}),
      systemVersion: new fields.StringField({required: true, blank: false, initial: "0"}),
      nextSession: new fields.StringField({blank: false, nullable: true, initial: null}),
      resetKeys: new fields.BooleanField({required: false, initial: undefined}),
      safeMode: new fields.BooleanField({required: false, initial: undefined}),
      version: new fields.StringField({required: true, blank: false, nullable: true, initial: null})
    });
  }

  /** @override */
  static type = "world";

  /** @inheritDoc */
  static migrateData(data) {
    super.migrateData(data);
    data.compatibility = data.compatibility || {};
    if ( data.compatibility.maximum === "1.0.0" ) data.compatibility.maximum = undefined;
    if ( data.coreVersion && !data.compatibility.verified ) {
      data.compatibility.minimum = data.compatibility.verified = data.coreVersion;
    }
    return data;
  }
}
