import {getType, mergeObject} from "../utils/helpers.mjs";
import {ObjectField} from "../data/fields.mjs";

/**
 * A special [ObjectField]{@link ObjectField} available to packages which configures any additional Document sub-types
 * provided by the package.
 */
export default class AdditionalTypesField extends ObjectField {
  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      required: false,
      readonly: true,
      validationError: "is not a valid sub-types configuration"
    });
  }

  /** @inheritdoc */
  _validateType(value, options={}) {
    super._validateType(value, options);
    const documents = foundry?.documents ? Object.values(foundry.documents) : db.documents;
    const documentClasses = Object.fromEntries(documents.map(cls => [cls.documentName, cls]));
    for ( const [k, v] of Object.entries(value) ) {
      const cls = documentClasses[k];
      if ( !cls ) throw new Error(`${this.validationError}: '${k}' is not a valid Document type`);
      if ( !cls.hasTypeData ) {
        throw new Error(`${this.validationError}: ${k} Documents do not support sub-types`);
      }
      if ( (getType(v) !== "Object") || Object.values(v).some(type => getType(type) !== "Object") ) {
        throw new Error(`${this.validationError}: Sub-type declaration for '${k}' malformed`);
      }
    }
  }
}
