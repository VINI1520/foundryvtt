import BasePackage from "./base-package.mjs";
import * as fields from "../data/fields.mjs";

/**
 * The data schema used to define Module manifest files.
 * Extends the basic PackageData schema with some additional module-specific fields.
 * @property {boolean} [coreTranslation]     Does this module provide a translation for the core software?
 * @property {boolean} [library]             A library module provides no user-facing functionality and is solely for
 *                                           use by other modules. Loaded before any system or module scripts.
 */
export default class BaseModule extends BasePackage {

  /** @inheritDoc */
  static defineSchema() {
    const parentSchema = super.defineSchema();
    return Object.assign({}, parentSchema, {
      coreTranslation: new fields.BooleanField(),
      library: new fields.BooleanField()
    });
  }

  /** @override */
  static type = "module";
}
