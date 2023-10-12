import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";

/**
 * @typedef {Object} SettingData
 * @property {string} _id                 The _id which uniquely identifies this Setting document
 * @property {string} key                 The setting key, a composite of {scope}.{name}
 * @property {*} value                    The setting value, which is serialized to JSON
 * @property {DocumentStats} [_stats]     An object of creation and access information
 */

/**
 * The Document definition for a Setting.
 * Defines the DataSchema and common behaviors for a Setting which are shared between both client and server.
 * @extends abstract.Document
 * @mixes SettingData
 * @memberof documents
 *
 * @param {SettingData} data                      Initial data from which to construct the Setting
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseSetting extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Setting",
    collection: "settings",
    label: "DOCUMENT.Setting",
    labelPlural: "DOCUMENT.Settings",
    permissions: {
      create: "SETTINGS_MODIFY",
      update: "SETTINGS_MODIFY",
      delete: "SETTINGS_MODIFY"
    }
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      key: new fields.StringField({required: true, nullable: false, blank: false,
        validate: k => k.split(".").length >= 2,
        validationError: "must have the format {scope}.{field}"}),
      value: new fields.JSONField({required: true, nullable: true}),
      _stats: new fields.DocumentStatsField()
    }
  }
}
export default BaseSetting;
