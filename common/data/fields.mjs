/**
 * This module contains data field classes which are used to define a data schema.
 * A data field is responsible for cleaning, validation, and initialization of the value assigned to it.
 * Each data field extends the [DataField]{@link DataField} class to implement logic specific to its
 * contained data type.
 * @module fields
 */

import {
  BASE_DOCUMENT_TYPE,
  DOCUMENT_OWNERSHIP_LEVELS,
  FILE_CATEGORIES
} from "../constants.mjs";
import DataModel from "../abstract/data.mjs";
import {
  isColorString,
  isValidId,
  isJSON,
  hasFileExtension,
  isBase64Data
} from "./validators.mjs";
import {deepClone, getType, isEmpty, isSubclass, mergeObject} from "../utils/helpers.mjs";
import {logCompatibilityWarning} from "../utils/logging.mjs";
import {DataModelValidationFailure} from "./validation-failure.mjs";
import SingletonEmbeddedCollection from "../abstract/singleton-collection.mjs";
import EmbeddedCollection from "../abstract/embedded-collection.mjs";
import EmbeddedCollectionDelta from "../abstract/embedded-collection-delta.mjs";

/* ---------------------------------------- */
/*  Abstract Data Field                     */
/* ---------------------------------------- */

/**
 * @typedef {Object} DataFieldOptions
 * @property {boolean} [required=false]   Is this field required to be populated?
 * @property {boolean} [nullable=false]   Can this field have null values?
 * @property {Function|*} [initial]       The initial value of a field, or a function which assigns that initial value.
 * @property {Function} [validate]        A data validation function which accepts one argument with the current value.
 * @property {string} [label]             A localizable label displayed on forms which render this field.
 * @property {string} [hint]              Localizable help text displayed on forms which render this field.
 * @property {string} [validationError]   A custom validation error string. When displayed will be prepended with the
 *                                        document name, field name, and candidate value.
 */

/**
 * @typedef {object} DataFieldValidationOptions
 * @property {boolean} [partial]   Whether this is a partial schema validation, or a complete one.
 * @property {boolean} [fallback]  Whether to allow replacing invalid values with valid fallbacks.
 * @property {object} [source]     The full source object being evaluated.
 * @property {boolean} [dropInvalidEmbedded]  If true, invalid embedded documents will emit a warning and be placed in
 *                                            the invalidDocuments collection rather than causing the parent to be
 *                                            considered invalid.
 */

/**
 * An abstract class that defines the base pattern for a data field within a data schema.
 * @abstract
 *
 * @property {string} name                The name of this data field within the schema that contains it
 *
 * @property {boolean} required=false     Is this field required to be populated?
 * @property {boolean} nullable=false     Can this field have null values?
 * @property {Function|*} initial         The initial value of a field, or a function which assigns that initial value.
 * @property {Function} validate          A data validation function which accepts one argument with the current value.
 * @property {boolean} [readonly=false]   Should the prepared value of the field be read-only, preventing it from being
 *                                        changed unless a change to the _source data is applied.
 * @property {string} label               A localizable label displayed on forms which render this field.
 * @property {string} hint                Localizable help text displayed on forms which render this field.
 * @property {string} validationError     A custom validation error string. When displayed will be prepended with the
 *                                        document name, field name, and candidate value.
 */
class DataField {
  /**
   * @param {DataFieldOptions} options    Options which configure the behavior of the field
   */
  constructor(options={}) {
    /**
     * The initially provided options which configure the data field
     * @type {DataFieldOptions}
     */
    this.options = options;
    for ( let k in this.constructor._defaults ) {
      this[k] = k in this.options ? this.options[k] : this.constructor._defaults[k];
    }
  }

  /**
   * The field name of this DataField instance.
   * This is assigned by SchemaField#initialize.
   * @internal
   */
  name;

  /**
   * A reference to the parent schema to which this DataField belongs.
   * This is assigned by SchemaField#initialize.
   * @internal
   */
  parent;

  /**
   * Whether this field defines part of a Document/Embedded Document hierarchy.
   * @type {boolean}
   */
  static hierarchical = false;

  /**
   * Does this field type contain other fields in a recursive structure?
   * Examples of recursive fields are SchemaField, ArrayField, or TypeDataField
   * Examples of non-recursive fields are StringField, NumberField, or ObjectField
   * @type {boolean}
   */
  static recursive = false;

  /**
   * Default parameters for this field type
   * @return {DataFieldOptions}
   * @protected
   */
  static get _defaults() {
    return {
      required: false,
      nullable: false,
      initial: undefined,
      readonly: false,
      label: "",
      hint: "",
      validationError: "is not a valid value"
    }
  }

  /**
   * A dot-separated string representation of the field path within the parent schema.
   * @type {string}
   */
  get fieldPath() {
    return [this.parent?.fieldPath, this.name].filterJoin(".");
  }

  /**
   * Apply a function to this DataField which propagates through recursively to any contained data schema.
   * @param {string|function} fn          The function to apply
   * @param {*} value                     The current value of this field
   * @param {object} [options={}]         Additional options passed to the applied function
   * @returns {object}                    The results object
   */
  apply(fn, value, options={}) {
    if ( typeof fn === "string" ) fn = this[fn];
    return fn.call(this, value, options);
  }

  /* -------------------------------------------- */
  /*  Field Cleaning                              */
  /* -------------------------------------------- */

  /**
   * Coerce source data to ensure that it conforms to the correct data type for the field.
   * Data coercion operations should be simple and synchronous as these are applied whenever a DataModel is constructed.
   * For one-off cleaning of user-provided input the sanitize method should be used.
   * @param {*} value           The initial value
   * @param {object} [options]  Additional options for how the field is cleaned
   * @param {boolean} [options.partial]   Whether to perform partial cleaning?
   * @param {object} [options.source]     The root data model being cleaned
   * @returns {*}               The cast value
   */
  clean(value, options) {

    // Permit explicitly null values for nullable fields
    if ( value === null ) {
      if ( this.nullable ) return value;
      value = undefined;
    }

    // Get an initial value for the field
    if ( value === undefined ) return this.getInitialValue(options.source);

    // Cast a provided value to the correct type
    value = this._cast(value);

    // Cleaning logic specific to the DataField.
    return this._cleanType(value, options);
  }

  /* -------------------------------------------- */

  /**
   * Apply any cleaning logic specific to this DataField type.
   * @param {*} value           The appropriately coerced value.
   * @param {object} [options]  Additional options for how the field is cleaned.
   * @returns {*}               The cleaned value.
   * @protected
   */
  _cleanType(value, options) {
    return value;
  }

  /* -------------------------------------------- */

  /**
   * Cast a non-default value to ensure it is the correct type for the field
   * @param {*} value       The provided non-default value
   * @returns {*}           The standardized value
   * @protected
   */
  _cast(value) {
    throw new Error(`Subclasses of DataField must implement the _cast method`);
  }

  /* -------------------------------------------- */

  /**
   * Attempt to retrieve a valid initial value for the DataField.
   * @param {object} data   The source data object for which an initial value is required
   * @returns {*}           A valid initial value
   * @throws                An error if there is no valid initial value defined
   */
  getInitialValue(data) {
    return this.initial instanceof Function ? this.initial(data) : this.initial;
  }

  /* -------------------------------------------- */
  /*  Field Validation                            */
  /* -------------------------------------------- */

  /**
   * Validate a candidate input for this field, ensuring it meets the field requirements.
   * A validation failure can be provided as a raised Error (with a string message), by returning false, or by returning
   * a DataModelValidationFailure instance.
   * A validator which returns true denotes that the result is certainly valid and further validations are unnecessary.
   * @param {*} value                                  The initial value
   * @param {DataFieldValidationOptions} [options={}]  Options which affect validation behavior
   * @returns {DataModelValidationFailure}             Returns a DataModelValidationFailure if a validation failure
   *                                                   occurred.
   */
  validate(value, options={}) {
    const validators = [this._validateSpecial, this._validateType];
    if ( this.options.validate ) validators.push(this.options.validate);
    try {
      for ( const validator of validators ) {
        const isValid = validator.call(this, value, options);
        if ( isValid === true ) return undefined;
        if ( isValid === false ) {
          return new DataModelValidationFailure({
            invalidValue: value,
            message: this.validationError
          });
        }
        if ( isValid instanceof DataModelValidationFailure ) return isValid;
      }
    } catch(err) {
      return new DataModelValidationFailure({invalidValue: value, message: err.message, unresolved: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Special validation rules which supersede regular field validation.
   * This validator screens for certain values which are otherwise incompatible with this field like null or undefined.
   * @param {*} value               The candidate value
   * @returns {boolean|void}        A boolean to indicate with certainty whether the value is valid.
   *                                Otherwise, return void.
   * @throws                        May throw a specific error if the value is not valid
   * @protected
   */
  _validateSpecial(value) {

    // Allow null values for explicitly nullable fields
    if ( value === null ) {
      if ( this.nullable ) return true;
      else throw new Error("may not be null");
    }

    // Allow undefined if the field is not required
    if ( value === undefined ) {
      if ( this.required ) throw new Error("may not be undefined");
      else return true;
    }
  }

  /* -------------------------------------------- */

  /**
   * A default type-specific validator that can be overridden by child classes
   * @param {*} value                                    The candidate value
   * @param {DataFieldValidationOptions} [options={}]    Options which affect validation behavior
   * @returns {boolean|DataModelValidationFailure|void}  A boolean to indicate with certainty whether the value is
   *                                                     valid, or specific DataModelValidationFailure information,
   *                                                     otherwise void.
   * @throws                                             May throw a specific error if the value is not valid
   * @protected
   */
  _validateType(value, options={}) {}

  /* -------------------------------------------- */

  /**
   * Certain fields may declare joint data validation criteria.
   * This method will only be called if the field is designated as recursive.
   * @param {object} data       Candidate data for joint model validation
   * @param {object} options    Options which modify joint model validation
   * @throws  An error if joint model validation fails
   * @internal
   */
  _validateModel(data, options={}) {}

  /* -------------------------------------------- */
  /*  Initialization and Serialization            */
  /* -------------------------------------------- */

  /**
   * Initialize the original source data into a mutable copy for the DataModel instance.
   * @param {*} value                   The source value of the field
   * @param {Object} model              The DataModel instance that this field belongs to
   * @param {object} [options]          Initialization options
   * @returns {*}                       An initialized copy of the source data
   */
  initialize(value, model, options={}) {
    return value;
  }

  /**
   * Export the current value of the field into a serializable object.
   * @param {*} value                   The initialized value of the field
   * @returns {*}                       An exported representation of the field
   */
  toObject(value) {
    return value;
  }

  /**
   * Recursively traverse a schema and retrieve a field specification by a given path
   * @param {string[]} path             The field path as an array of strings
   * @protected
   */
  _getField(path) {
    return path.length ? undefined : this;
  }
}

/* -------------------------------------------- */
/*  Data Schema Field                           */
/* -------------------------------------------- */

/**
 * A special class of {@link DataField} which defines a data schema.
 */
class SchemaField extends DataField {
  /**
   * @param {DataSchema} fields                 The contained field definitions
   * @param {DataFieldOptions} options          Options which configure the behavior of the field
   */
  constructor(fields, options={}) {
    super(options);
    this.fields = this._initialize(fields);
    if ( !("initial" in options) ) this.initial = () => this.clean({});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      required: true,
      nullable: false,
      initial: {}
    });
  }

  /** @override */
  static recursive = true;

  /* -------------------------------------------- */

  /**
   * The contained field definitions.
   * @type {DataSchema}
   */
  fields;

  /* -------------------------------------------- */

  /**
   * Initialize and validate the structure of the provided field definitions.
   * @param {DataSchema} fields     The provided field definitions
   * @returns {DataSchema}          The validated schema
   * @protected
   */
  _initialize(fields) {
    if ( (typeof fields !== "object") ) {
      throw new Error("A DataFields must be an object with string keys and DataField values.");
    }
    for ( const [name, field] of Object.entries(fields) ) {
      if ( !(field instanceof DataField) ) {
        throw new Error(`The "${name}" field is not an instance of the DataField class.`);
      }
      if ( field.parent !== undefined ) {
        throw new Error(`The "${field.fieldPath}" field already belongs to some other parent and may not be reused.`);
      }
      field.name = name;
      field.parent = this;
    }
    return fields;
  }

  /* -------------------------------------------- */
  /*  Schema Iteration                            */
  /* -------------------------------------------- */

  /**
   * Iterate over a SchemaField by iterating over its fields.
   * @type {Iterable<DataField>}
   */
  *[Symbol.iterator]() {
    for ( const field of Object.values(this.fields) ) {
      yield field;
    }
  }

  /**
   * An array of field names which are present in the schema.
   * @returns {string[]}
   */
  keys() {
    return Object.keys(this.fields);
  }

  /**
   * An array of DataField instances which are present in the schema.
   * @returns {DataField[]}
   */
  values() {
    return Object.values(this.fields);
  }

  /**
   * An array of [name, DataField] tuples which define the schema.
   * @returns {Array<[string, DataField]>}
   */
  entries() {
    return Object.entries(this.fields);
  }

  /**
   * Test whether a certain field name belongs to this schema definition.
   * @param {string} fieldName    The field name
   * @returns {boolean}           Does the named field exist in this schema?
   */
  has(fieldName) {
    return fieldName in this.fields;
  }

  /**
   * Get a DataField instance from the schema by name
   * @param {string} fieldName    The field name
   * @returns {DataField}         The DataField instance or undefined
   */
  get(fieldName) {
    return this.fields[fieldName];
  }

  /**
   * Traverse the schema, obtaining the DataField definition for a particular field.
   * @param {string[]|string} fieldName       A field path like ["abilities", "strength"] or "abilities.strength"
   * @returns {SchemaField|DataField}         The corresponding DataField definition for that field, or undefined
   */
  getField(fieldName) {
    let path;
    if ( typeof fieldName === "string" ) path = fieldName.split(".");
    else if ( Array.isArray(fieldName) ) path = fieldName;
    else throw new Error("A field path must be an array of strings or a dot-delimited string");
    return this._getField(path);
  }

  /** @override */
  _getField(path) {
    if ( !path.length ) return this;
    const field = this.get(path.shift());
    return field?._getField(path);
  }

  /* -------------------------------------------- */
  /*  Data Field Methods                          */
  /* -------------------------------------------- */

  /** @override */
  _cast(value) {
    return typeof value === "object" ? value : {};
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _cleanType(data, options={}) {
    options.source = options.source || data;

    // Clean each field which belongs to the schema
    for ( const [name, field] of this.entries() ) {
      if ( !(name in data) && options.partial ) continue;
      data[name] = field.clean(data[name], options);
    }

    // Delete any keys which do not
    for ( const k of Object.keys(data) ) {
      if ( !this.has(k) ) delete data[k];
    }
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  initialize(value, model, options={}) {
    if ( !value ) return value;
    const data = {};
    for ( let [name, field] of this.entries() ) {
      const v = field.initialize(value[name], model, options);

      // Readonly fields
      if ( field.readonly ) {
        Object.defineProperty(data, name, {value: v, writable: false});
      }

      // Getter fields
      else if ( (typeof v === "function") && !v.prototype ) {
        Object.defineProperty(data, name, {get: v, set() {}, configurable: true});
      }

      // Writable fields
      else data[name] = v;
    }
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  _validateType(data, options={}) {
    if ( !(data instanceof Object) ) throw new Error("must be an object");
    options.source = options.source || data;
    const schemaFailure = new DataModelValidationFailure();
    for ( const [key, field] of this.entries() ) {
      if ( options.partial && !(key in data) ) continue;

      // Validate the field's current value
      const value = data[key];
      const failure = field.validate(value, options);

      // Failure may be permitted if fallback replacement is allowed
      if ( failure ) {
        schemaFailure.fields[field.name] = failure;

        // If the field internally applied fallback logic
        if ( !failure.unresolved ) continue;

        // If fallback is allowed at the schema level
        if ( options.fallback ) {
          const initial = field.getInitialValue(options.source);
          if ( field.validate(initial, {source: options.source}) === undefined ) {  // Ensure initial is valid
            data[key] = initial;
            failure.fallback = initial;
            failure.unresolved = false;
          }
          else failure.unresolved = schemaFailure.unresolved = true;
        }

        // Otherwise the field-level failure is unresolved
        else failure.unresolved = schemaFailure.unresolved = true;
      }
    }
    if ( !isEmpty(schemaFailure.fields) ) return schemaFailure;
  }

  /* ---------------------------------------- */

  /** @override */
  _validateModel(changes, options={}) {
    options.source = options.source || changes;
    if ( !changes ) return;
    for ( const [name, field] of this.entries() ) {
      const change = changes[name];  // May be nullish
      if ( change && field.constructor.recursive ) field._validateModel(change, options);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  toObject(value) {
    if ( (value === undefined) || (value === null) ) return value;
    const data = {};
    for ( const [name, field] of this.entries() ) {
      data[name] = field.toObject(value[name]);
    }
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  apply(fn, data={}, options={}) {
    const results = {};
    for ( const [key, field] of this.entries() ) {
      if ( options.partial && !(key in data) ) continue;
      const r = field.apply(fn, data[key], options);
      if ( !options.filter || !isEmpty(r) ) results[key] = r;
    }
    return results;
  }

  /* -------------------------------------------- */

  /**
   * Migrate this field's candidate source data.
   * @param {object} sourceData   Candidate source data of the root model
   * @param {any} fieldData       The value of this field within the source data
   */
  migrateSource(sourceData, fieldData) {
    for ( const [key, field] of this.entries() ) {
      const canMigrate = field.migrateSource instanceof Function;
      if ( canMigrate && fieldData[key] ) field.migrateSource(sourceData, fieldData[key]);
    }
  }
}

/* -------------------------------------------- */
/*  Basic Field Types                           */
/* -------------------------------------------- */

/**
 * A subclass of [DataField]{@link DataField} which deals with boolean-typed data.
 */
class BooleanField extends DataField {

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      required: true,
      nullable: false,
      initial: false
    });
  }

  /** @override */
  _cast(value) {
    if ( typeof value === "string" ) return value === "true";
    if ( typeof value === "object" ) return false;
    return Boolean(value);
  }

  /** @override */
  _validateType(value) {
    if (typeof value !== "boolean") throw new Error("must be a boolean");
  }
}

/* ---------------------------------------- */

/**
 * @typedef {DataFieldOptions} NumberFieldOptions
 * @property {number} [min]               A minimum allowed value
 * @property {number} [max]               A maximum allowed value
 * @property {number} [step]              A permitted step size
 * @property {boolean} [integer=false]    Must the number be an integer?
 * @property {number} [positive=false]    Must the number be positive?
 * @property {number[]|object|function} [choices]  An array of values or an object of values/labels which represent
 *                                        allowed choices for the field. A function may be provided which dynamically
 *                                        returns the array of choices.
 */

/**
 * A subclass of [DataField]{@link DataField} which deals with number-typed data.
 *
 * @property {number} min                 A minimum allowed value
 * @property {number} max                 A maximum allowed value
 * @property {number} step                A permitted step size
 * @property {boolean} integer=false      Must the number be an integer?
 * @property {number} positive=false      Must the number be positive?
 * @property {number[]|object|function} [choices]  An array of values or an object of values/labels which represent
 *                                        allowed choices for the field. A function may be provided which dynamically
 *                                        returns the array of choices.
 */
class NumberField extends DataField {
  /**
   * @param {NumberFieldOptions} options  Options which configure the behavior of the field
   */
  constructor(options={}) {
    super(options);
    // If choices are provided, the field should not be null by default
    if ( this.choices ) {
      this.nullable = options.nullable ?? false;
    }
  }

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      initial: null,
      nullable: true,
      min: undefined,
      max: undefined,
      step: undefined,
      integer: false,
      positive: false,
      choices: undefined
    });
  }

  /** @override */
  _cast(value) {
    return Number(value);
  }

  /** @inheritdoc */
  _cleanType(value, options) {
    value = super._cleanType(value, options);
    if ( typeof value !== "number" ) return value;
    if ( this.integer ) value = Math.round(value);
    if ( this.positive ) value = Math.abs(value);
    if ( Number.isFinite(this.min) ) value = Math.max(value, this.min);
    if ( Number.isFinite(this.max) ) value = Math.min(value, this.max);
    if ( Number.isFinite(this.step) ) value = value.toNearest(this.step);
    return value;
  }

  /** @override */
  _validateType(value) {
    if ( typeof value !== "number" ) throw new Error("must be a number");
    if ( this.positive && (value <= 0) ) throw new Error("must be a positive number");
    if ( Number.isFinite(this.min) && (value < this.min) ) throw new Error(`must be at least ${this.min}`);
    if ( Number.isFinite(this.max) && (value > this.max) ) throw new Error(`must be at most ${this.max}`);
    if ( Number.isFinite(this.step) && (value.toNearest(this.step) !== value) ) {
      throw new Error(`must be an increment of ${this.step}`);
    }
    if ( this.choices && !this.#isValidChoice(value) ) throw new Error(`${value} is not a valid choice`);
    if ( this.integer ) {
      if ( !Number.isInteger(value) ) throw new Error("must be an integer");
    }
    else if ( !Number.isFinite(value) ) throw new Error("must be a finite number");
  }

  /**
   * Test whether a provided value is a valid choice from the allowed choice set
   * @param {number} value      The provided value
   * @returns {boolean}         Is the choice valid?
   */
  #isValidChoice(value) {
    let choices = this.choices;
    if ( choices instanceof Function ) choices = choices();
    if ( choices instanceof Array ) return choices.includes(value);
    return String(value) in choices;
  }
}

/* ---------------------------------------- */

/**
 * @typedef {DataFieldOptions} StringFieldOptions
 * @property {boolean} [blank=true]       Is the string allowed to be blank (empty)?
 * @property {boolean} [trim=true]        Should any provided string be trimmed as part of cleaning?
 * @property {string[]|object|function} [choices]  An array of values or an object of values/labels which represent
 *                                        allowed choices for the field. A function may be provided which dynamically
 *                                        returns the array of choices.
 */

/**
 * A subclass of [DataField]{@link DataField} which deals with string-typed data.
 *
 * @property {boolean} blank=true         Is the string allowed to be blank (empty)?
 * @property {boolean} trim=true          Should any provided string be trimmed as part of cleaning?
 * @property {string[]|object|function} [choices]  An array of values or an object of values/labels which represent
 *                                        allowed choices for the field. A function may be provided which dynamically
 *                                        returns the array of choices.
 */
class StringField extends DataField {
  /**
   * @param {StringFieldOptions} options  Options which configure the behavior of the field
   */
  constructor(options={}) {
    super(options);

    // If choices are provided, the field should not be null or blank by default
    if ( this.choices ) {
      this.nullable = options.nullable ?? false;
      this.blank = options.blank ?? false;
    }

    // Adjust the default initial value depending on field configuration
    if ( !("initial" in options) ) {
      if ( !this.required ) this.initial = undefined;
      else if ( this.blank ) this.initial = "";
      else if ( this.nullable ) this.initial = null;
    }
  }

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      blank: true,
      trim: true,
      nullable: false,
      choices: undefined,
      textSearch: false
    });
  }

  /** @inheritdoc */
  clean(value, options) {
    if ( (typeof value === "string") && this.trim ) value = value.trim(); // Trim input strings
    if ( value === "" ) {  // Permit empty strings for blank fields
      if ( this.blank ) return value;
      value = undefined;
    }
    return super.clean(value, options);
  }

  /** @override */
  _cast(value) {
    return String(value);
  }

  /** @inheritdoc */
  _validateSpecial(value) {
    if ( value === "" ) {
      if ( this.blank ) return true;
      else throw new Error("may not be a blank string");
    }
    return super._validateSpecial(value);
  }

  /** @override */
  _validateType(value) {
    if ( typeof value !== "string" ) throw new Error("must be a string");
    else if ( this.choices ) {
      if ( this._isValidChoice(value) ) return true;
      else throw new Error(`${value} is not a valid choice`);
    }
  }

  /**
   * Test whether a provided value is a valid choice from the allowed choice set
   * @param {string} value      The provided value
   * @returns {boolean}         Is the choice valid?
   * @protected
   */
  _isValidChoice(value) {
    let choices = this.choices;
    if ( choices instanceof Function ) choices = choices();
    if ( choices instanceof Array ) return choices.includes(value);
    return String(value) in choices;
  }
}

/* ---------------------------------------- */

/**
 * A subclass of [DataField]{@link DataField} which deals with object-typed data.
 */
class ObjectField extends DataField {

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      required: true,
      nullable: false,
      initial: () => ({}) // To ensure each instance is independent
    });
  }

  /** @override */
  _cast(value) {
    return foundry.utils.getType(value) === "Object" ? value : {};
  }

  /** @override */
  initialize(value, model, options={}) {
    if ( !value ) return value;
    return deepClone(value);
  }

  /** @override */
  toObject(value) {
    return deepClone(value);
  }

  /** @override */
  _validateType(value, options={}) {
    if ( foundry.utils.getType(value) !== "Object" ) throw new Error("must be an object");
  }
}

/* -------------------------------------------- */

/**
 * A subclass of [DataField]{@link DataField} which deals with array-typed data.
 */
class ArrayField extends DataField {
  /**
   * @param {DataField} element         A DataField instance which defines the type of element contained in the Array.
   * @param {DataFieldOptions} options  Options which configure the behavior of the field
   */
  constructor(element, options={}) {
    super(options);
    /**
     * The data type of each element in this array
     * @type {DataField}
     */
    this.element = this.constructor._validateElementType(element);
  }

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      required: true,
      nullable: false,
      initial: () => []
    });
  }

  /** @override */
  static recursive = true;

  /* ---------------------------------------- */

  /**
   * Validate the contained element type of the ArrayField
   * @param {*} element       The type of Array element
   * @returns {*}             The validated element type
   * @throws                  An error if the element is not a valid type
   * @protected
   */
  static _validateElementType(element) {
    if ( !(element instanceof DataField) ) {
      throw new Error(`${this.name} must have a DataField as its contained element`);
    }
    return element;
  }

  /* ---------------------------------------- */

  /** @override */
  _validateModel(changes, options) {
    if ( !this.element.constructor.recursive ) return;
    for ( const element of changes ) {
      this.element._validateModel(element, options);
    }
  }

  /* ---------------------------------------- */

  /** @override */
  _cast(value) {

    // Convert objects with numeric keys to arrays
    if ( getType(value) === "Object" ) {
      const arr = [];
      for ( const [k, v] of Object.entries(value) ) {
        const i = Number(k);
        if ( Number.isInteger(i) && (i >= 0) ) arr[i] = v;
      }
      return arr;
    }

    // Return values as an array structure
    return value instanceof Array ? value : [value];
  }

  /** @override */
  _cleanType(value, options) {
    return value.map(v => this.element.clean(v, options));
  }

  /** @override */
  _validateType(value, options={}) {
    if ( !(value instanceof Array) ) throw new Error("must be an Array");
    return this._validateElements(value, options);
  }

  /**
   * Validate every element of the ArrayField
   * @param {Array} value                         The array to validate
   * @param {DataFieldValidationOptions} options  Validation options
   * @returns {DataModelValidationFailure|void}   A validation failure if any of the elements failed validation,
   *                                              otherwise void.
   * @protected
   */
  _validateElements(value, options) {
    const arrayFailure = new DataModelValidationFailure();
    for ( let i=0; i<value.length; i++ ) {
      const failure = this._validateElement(value[i], options);
      if ( failure ) arrayFailure.elements.push({id: i, failure});
    }
    if ( arrayFailure.elements.length ) return arrayFailure;
  }

  /**
   * Validate a single element of the ArrayField.
   * @param {*} value                       The value of the array element
   * @param {DataFieldValidationOptions} options  Validation options
   * @returns {DataModelValidationFailure}  A validation failure if the element failed validation
   * @protected
   */
  _validateElement(value, options) {
    return this.element.validate(value, options);
  }

  /** @override */
  initialize(value, model, options={}) {
    if ( !value ) return value;
    return value.map(v => this.element.initialize(v, model, options));
  }

  /** @override */
  toObject(value) {
    return value.map(v => this.element.toObject(v));
  }

  /** @override */
  apply(fn, value=[], options={}) {
    const results = [];
    if ( !value.length && options.initializeArrays ) value = [undefined];
    for ( const v of value ) {
      const r = this.element.apply(fn, v, options);
      if ( !options.filter || !isEmpty(r) ) results.push(r);
    }
    return results;
  }

  /** @override */
  _getField(path) {
    if ( !path.length ) return this;
    if ( path[0] === "element" ) path.shift();
    return this.element._getField(path);
  }

  /**
   * Migrate this field's candidate source data.
   * @param {object} sourceData   Candidate source data of the root model
   * @param {any} fieldData       The value of this field within the source data
   */
  migrateSource(sourceData, fieldData) {
    const canMigrate = this.element.migrateSource instanceof Function;
    if ( canMigrate && (fieldData instanceof Array) ) {
      for ( const entry of fieldData ) this.element.migrateSource(sourceData, entry);
    }
  }
}

/* -------------------------------------------- */
/*  Specialized Field Types                     */
/* -------------------------------------------- */

/**
 * A subclass of [ArrayField]{@link ArrayField} which supports a set of contained elements.
 * Elements in this set are treated as fungible and may be represented in any order or discarded if invalid.
 */
class SetField extends ArrayField {

  /** @override */
  _validateElements(value, options) {
    const setFailure = new DataModelValidationFailure();
    for ( let i=value.length-1; i>=0; i-- ) {  // iterate backwards so we can splice as we go
      const failure = this._validateElement(value[i], options);
      if ( failure ) {
        setFailure.elements.unshift({id: i, failure});

        // The failure may have been internally resolved by fallback logic
        if ( !failure.unresolved && failure.fallback ) continue;

        // If fallback is allowed, remove invalid elements from the set
        if ( options.fallback ) {
          value.splice(i, 1);
          failure.dropped = true;
        }

        // Otherwise the set failure is unresolved
        else setFailure.unresolved = true;
      }
    }

    // Return a record of any failed set elements
    if ( setFailure.elements.length ) {
      if ( options.fallback && !setFailure.unresolved ) setFailure.fallback = value;
      return setFailure;
    }
  }

  /** @override */
  initialize(value, model, options={}) {
    return new Set(super.initialize(value, model, options));
  }

  /** @override */
  toObject(value) {
    return Array.from(value).map(v => this.element.toObject(v));
  }
}

/* ---------------------------------------- */

/**
 * A subclass of [ObjectField]{@link ObjectField} which embeds some other DataModel definition as an inner object.
 */
class EmbeddedDataField extends SchemaField {
  /**
   * @param {typeof DataModel} model          The class of DataModel which should be embedded in this field
   * @param {DataFieldOptions} options        Options which configure the behavior of the field
   */
  constructor(model, options) {
    if ( !isSubclass(model, DataModel) ) {
      throw new Error("An EmbeddedDataField must specify a DataModel class as its type");
    }
    super(model.schema.fields, options);

    /**
     * The embedded DataModel definition which is contained in this field.
     * @type {typeof DataModel}
     */
    this.model = model;
  }

  /** @override */
  _initialize(schema) {
    return schema;
  }

  /** @override */
  initialize(value, model, options={}) {
    if ( !value ) return value;
    return new this.model(value, {parent: model, ...options});
  }

  /** @override */
  toObject(value) {
    if ( !value ) return value;
    return value.toObject(false);
  }

  /**
   * Migrate this field's candidate source data.
   * @param {object} sourceData   Candidate source data of the root model
   * @param {any} fieldData       The value of this field within the source data
   */
  migrateSource(sourceData, fieldData) {
    if ( fieldData ) this.model.migrateDataSafe(fieldData);
  }

  /** @override */
  _validateModel(changes, options) {
    this.model.validateJoint(changes);
  }
}

/* ---------------------------------------- */

/**
 * A subclass of [ArrayField]{@link ArrayField} which supports an embedded Document collection.
 * Invalid elements will be dropped from the collection during validation rather than failing for the field entirely.
 */
class EmbeddedCollectionField extends ArrayField {
  /**
   * @param {typeof Document} element     The type of Document which belongs to this embedded collection
   * @param {DataFieldOptions} [options]  Options which configure the behavior of the field
   */
  constructor(element, options={}) {
    super(element, options);
    this.readonly = true; // Embedded collections are always immutable
  }

  /** @override */
  static _validateElementType(element) {
    if ( isSubclass(element, foundry.abstract.Document) ) return element;
    throw new Error("An EmbeddedCollectionField must specify a Document subclass as its type");
  }

  /**
   * The Collection implementation to use when initializing the collection.
   * @type {typeof EmbeddedCollection}
   */
  static get implementation() {
    return EmbeddedCollection;
  }

  /** @override */
  static hierarchical = true;

  /**
   * A reference to the DataModel subclass of the embedded document element
   * @type {typeof Document}
   */
  get model() {
    return this.element.implementation;
  }

  /**
   * The DataSchema of the contained Document model.
   * @type {SchemaField}
   */
  get schema() {
    return this.model.schema;
  }

  /** @override */
  _cleanType(value, options) {
    return value.map(v => this.schema.clean(v, {...options, source: v}));
  }

  /** @override */
  _validateElements(value, options) {
    const collectionFailure = new DataModelValidationFailure();
    for ( const v of value ) {
      const failure = this.schema.validate(v, {...options, source: v});
      if ( failure && !options.dropInvalidEmbedded) collectionFailure.elements.push({id: v._id, name: v.name, failure});
    }
    if ( collectionFailure.elements.length ) return collectionFailure;
  }

  /** @override */
  initialize(value, model, options={}) {
    const collection = model.collections[this.name];
    collection.initialize(options);
    return collection;
  }

  /** @override */
  toObject(value) {
    return value.toObject(false);
  }

  /** @override */
  apply(fn, value=[], options={}) {
    const results = [];
    if ( !value.length && options.initializeArrays ) value = [undefined];
    for ( const v of value ) {
      const r = this.schema.apply(fn, v, options);
      if ( !options.filter || !isEmpty(r) ) results.push(r);
    }
    return results;
  }

  /**
   * Migrate this field's candidate source data.
   * @param {object} sourceData   Candidate source data of the root model
   * @param {any} fieldData       The value of this field within the source data
   */
  migrateSource(sourceData, fieldData) {
    if ( fieldData instanceof Array ) {
      for ( const entry of fieldData ) this.model.migrateDataSafe(entry);
    }
  }

  /* -------------------------------------------- */
  /*  Embedded Document Operations                */
  /* -------------------------------------------- */

  /**
   * Return the embedded document(s) as a Collection.
   * @param {Document} parent  The parent document.
   * @returns {Collection<Document>}
   */
  getCollection(parent) {
    return parent[this.name];
  }
}

/* -------------------------------------------- */

/**
 * A subclass of {@link EmbeddedCollectionField} which manages a collection of delta objects relative to another
 * collection.
 */
class EmbeddedCollectionDeltaField extends EmbeddedCollectionField {
  /** @override */
  static get implementation() {
    return EmbeddedCollectionDelta;
  }

  /** @override */
  _cleanType(value, options) {
    return value.map(v => {
      if ( v._tombstone ) return foundry.data.TombstoneData.schema.clean(v, {...options, source: v});
      return this.schema.clean(v, {...options, source: v});
    });
  }

  /** @override */
  _validateElements(value, options) {
    const collectionFailure = new DataModelValidationFailure();
    for ( const v of value ) {
      const validationOptions = {...options, source: v};
      const failure = v._tombstone
        ? foundry.data.TombstoneData.schema.validate(v, validationOptions)
        : this.schema.validate(v, validationOptions);
      if ( failure && !options.fallback ) collectionFailure.elements.push({id: v._id, failure});
    }
    if ( collectionFailure.elements.length ) return collectionFailure;
  }
}

/* -------------------------------------------- */

/**
 * A subclass of {@link EmbeddedDataField} which supports a single embedded Document.
 */
class EmbeddedDocumentField extends EmbeddedDataField {
  /**
   * @param {typeof Document} model     The type of Document which is embedded.
   * @param {DataFieldOptions} options  Options which configure the behavior of the field.
   */
  constructor(model, options={}) {
    if ( !isSubclass(model, foundry.abstract.Document) ) {
      throw new Error("An EmbeddedDocumentField must specify a Document subclass as its type.");
    }
    super(model.implementation, options);
  }

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      nullable: true
    });
  }

  /** @override */
  static hierarchical = true;

  /** @override */
  initialize(value, model, options={}) {
    if ( !value ) return value;
    if ( model[this.name] ) {
      model[this.name]._initialize(options);
      return model[this.name];
    }
    return new this.model(value, {...options, parent: model, parentCollection: this.name});
  }

  /* -------------------------------------------- */
  /*  Embedded Document Operations                */
  /* -------------------------------------------- */

  /**
   * Return the embedded document(s) as a Collection.
   * @param {Document} parent  The parent document.
   * @returns {Collection<Document>}
   */
  getCollection(parent) {
    const collection = new SingletonEmbeddedCollection(this.name, parent, []);
    const doc = parent[this.name];
    if ( !doc ) return collection;
    collection.set(doc.id, doc);
    return collection;
  }
}

/* -------------------------------------------- */
/*  Special Field Types                         */
/* -------------------------------------------- */

/**
 * A subclass of [StringField]{@link StringField} which provides the primary _id for a Document.
 * The field may be initially null, but it must be non-null when it is saved to the database.
 */
class DocumentIdField extends StringField {

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      required: true,
      blank: false,
      nullable: true,
      initial: null,
      readonly: true,
      validationError: "is not a valid Document ID string"
    });
  }

  /** @override */
  _cast(value) {
    if ( value instanceof foundry.abstract.Document ) return value._id;
    else return String(value);
  }

  /** @override */
  _validateType(value) {
    if ( !isValidId(value) ) throw new Error("must be a valid 16-character alphanumeric ID");
  }
}

/* ---------------------------------------- */

/**
 * A special class of [StringField]{@link StringField} field which references another DataModel by its id.
 * This field may also be null to indicate that no foreign model is linked.
 */
class ForeignDocumentField extends DocumentIdField {
  /**
   * @param {typeof Document} model           The foreign DataModel class definition which this field should link to.
   * @param {StringFieldOptions} options      Options which configure the behavior of the field
   */
  constructor(model, options={}) {
    super(options);
    if ( !isSubclass(model, DataModel) ) {
      throw new Error("A ForeignDocumentField must specify a DataModel subclass as its type");
    }
    /**
     * A reference to the model class which is stored in this field
     * @type {typeof Document}
     */
    this.model = model;
  }

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      nullable: true,
      readonly: false,
      idOnly: false
    });
  }

  /** @override */
  _cast(value) {
    if ( typeof value === "string" ) return value;
    if ( (value instanceof this.model) ) return value._id;
    throw new Error(`The value provided to a ForeignDocumentField must be a ${this.model.name} instance.`);
  }

  /** @inheritdoc */
  initialize(value, model, options={}) {
    if ( this.idOnly ) return value;
    if ( model?.pack && !foundry.utils.isSubclass(this.model, foundry.documents.BaseFolder) ) return null;
    if ( !game.collections ) return value; // server-side
    return () => this.model?.get(value, {pack: model?.pack, ...options}) ?? null;
  }

  /** @inheritdoc */
  toObject(value) {
    return value?._id ?? value
  }
}

/* -------------------------------------------- */

/**
 * A special [StringField]{@link StringField} which records a standardized CSS color string.
 */
class ColorField extends StringField {

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      nullable: true,
      initial: null,
      blank: false,
      validationError: "is not a valid hexadecimal color string"
    });
  }

  /** @inheritDoc */
  clean(value, options) {
    if ( (value === "") && (this.nullable) ) value = null;
    return super.clean(value, options);
  }

  /** @inheritdoc */
  _validateType(value) {
    if ( !isColorString(value) ) throw new Error("must be a valid color string");
  }
}

/* -------------------------------------------- */

/**
 * @typedef {StringFieldOptions} FilePathFieldOptions
 * @property {string[]} [categories]    A set of categories in CONST.FILE_CATEGORIES which this field supports
 * @property {boolean} [base64=false]   Is embedded base64 data supported in lieu of a file path?
 * @property {boolean} [wildcard=false] Does this file path field allow wildcard characters?
 */

/**
 * A special [StringField]{@link StringField} which records a file path or inline base64 data.
 * @property {string[]} categories      A set of categories in CONST.FILE_CATEGORIES which this field supports
 * @property {boolean} base64=false     Is embedded base64 data supported in lieu of a file path?
 * @property {boolean} wildcard=false   Does this file path field allow wildcard characters?
 */
class FilePathField extends StringField {
  /**
   * @param {FilePathFieldOptions} options  Options which configure the behavior of the field
   */
  constructor(options={}) {
    super(options);
    if ( !this.categories.length || this.categories.some(c => !(c in FILE_CATEGORIES)) ) {
      throw new Error("The categories of a FilePathField must be keys in CONST.FILE_CATEGORIES");
    }
  }

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      categories: [],
      base64: false,
      wildcard: false,
      nullable: true,
      blank: false,
      initial: null
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  clean(value, options) {
    if ( (value === "") && (this.nullable) ) value = null;
    return super.clean(value, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _validateType(value) {

    // Wildcard paths
    if ( this.wildcard && value.includes("*") ) return true;

    // Allowed extension or base64
    const isValid = this.categories.some(c => {
      const category = FILE_CATEGORIES[c];
      if ( hasFileExtension(value, Object.keys(category)) ) return true;
      /**
       * If the field contains base64 data, it is allowed (for now) regardless of the base64 setting for the field.
       * Eventually, this will become more strict and only be valid if base64 is configured as true for the field.
       * @deprecated since v10
       */
      return isBase64Data(value, Object.values(category));
    });

    // Throw an error for invalid paths
    if ( !isValid ) {
      let err = "does not have a valid file extension";
      if ( this.base64 ) err += " or provide valid base64 data";
      throw new Error(err);
    }
  }
}

/* -------------------------------------------- */

/**
 * A special [NumberField]{@link NumberField} which represents an angle of rotation in degrees between 0 and 360.
 * @property {number} base                  Whether the base angle should be treated as 360 or as 0
 */
class AngleField extends NumberField {

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      required: true,
      nullable: false,
      initial: 0,
      base: 0,
      min: 0,
      max: 360,
      validationError: "is not a number between 0 and 360"
    });
  }

  /** @inheritdoc */
  _cast(value) {
    value = Number(value);
    return Math.normalizeDegrees(value, this.base);
  }
}

/* -------------------------------------------- */

/**
 * A special [NumberField]{@link NumberField} represents a number between 0 and 1.
 */
class AlphaField extends NumberField {
  static get _defaults() {
    return mergeObject(super._defaults, {
      required: true,
      nullable: false,
      initial: 1,
      min: 0,
      max: 1,
      validationError: "is not a number between 0 and 1"
    });
  }
}

/* -------------------------------------------- */

/**
 * A special [ObjectField]{@link ObjectField} which captures a mapping of User IDs to Document permission levels.
 */
class DocumentOwnershipField extends ObjectField {

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      initial: {"default": DOCUMENT_OWNERSHIP_LEVELS.NONE},
      validationError: "is not a mapping of user IDs and document permission levels"
    });
  }

  /** @override */
  _validateType(value) {
    for ( let [k, v] of Object.entries(value) ) {
      if ( (k !== "default") && !isValidId(k) ) return false;
      if ( !Object.values(DOCUMENT_OWNERSHIP_LEVELS).includes(v) ) return false;
    }
  }
}

/* -------------------------------------------- */

/**
 * A special [StringField]{@link StringField} which contains serialized JSON data.
 */
class JSONField extends StringField {

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      blank: false,
      initial: undefined,
      validationError: "is not a valid JSON string"
    });
  }

  /** @override */
  clean(value, options) {
    if ( value === undefined ) return this.getInitialValue(options.source);
    return isJSON(value) ? value : JSON.stringify(value);
  }

  /** @override */
  _validateType(value) {
    if ( !isJSON(value) ) throw new Error("must be a serialized JSON string");
  }

  /** @override */
  initialize(value, model, options={}) {
    if ( value === undefined ) return value;
    return JSON.parse(value);
  }

  /** @override */
  toObject(value) {
    return JSON.stringify(value);
  }
}

/* -------------------------------------------- */

/**
 * A subclass of [StringField]{@link StringField} which contains a sanitized HTML string.
 * This class does not override any StringField behaviors, but is used by the server-side to identify fields which
 * require sanitization of user input.
 */
class HTMLField extends StringField {

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      required: true,
      blank: true
    });
  }
}

/* ---------------------------------------- */

/**
 * A subclass of {@link NumberField} which is used for storing integer sort keys.
 */
class IntegerSortField extends NumberField {
  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
      label: "FOLDER.DocumentSort",
      hint: "FOLDER.DocumentSortHint"
    });
  }
}

/* ---------------------------------------- */

/** @typedef {Object} DocumentStats
 * @property {string} systemId  The package name of the system the Document was created in.
 * @property {string} systemVersion  The version of the system the Document was created in.
 * @property {string} coreVersion  The core version the Document was created in.
 * @property {number} createdTime  A timestamp of when the Document was created.
 * @property {number} modifiedTime  A timestamp of when the Document was last modified.
 * @property {string} lastModifiedBy  The ID of the user who last modified the Document.
 */

/**
 * A subclass of {@link SchemaField} which stores document metadata in the _stats field.
 * @mixes DocumentStats
 */
class DocumentStatsField extends SchemaField {
  constructor(options) {
    super({
      systemId: new StringField({required: true, blank: false, nullable: true, initial: null}),
      systemVersion: new StringField({required: true, blank: false, nullable: true, initial: null}),
      coreVersion: new StringField({required: true, blank: false, nullable: true, initial: null}),
      createdTime: new NumberField(),
      modifiedTime: new NumberField(),
      lastModifiedBy: new ForeignDocumentField(foundry.documents.BaseUser, {idOnly: true})
    }, options);
  }
}

/* ---------------------------------------- */

/**
 * A subclass of [ObjectField]{@link ObjectField} which supports a type-specific data object.
 */
class TypeDataField extends ObjectField {
  /**
   * @param {typeof Document} document      The base document class which belongs in this field
   * @param {DataFieldOptions} options      Options which configure the behavior of the field
   */
  constructor(document, options={}) {
    super(options);
    /**
     * The canonical document name of the document type which belongs in this field
     * @type {typeof Document}
     */
    this.document = document;
  }

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {required: true});
  }

  /** @override */
  static recursive = true;

  /**
   * Return the package that provides the sub-type for the given model.
   * @param {DataModel} model       The model instance created for this sub-type.
   * @returns {System|Module|null}
   */
  static getModelProvider(model) {
    const type = model.parent?.type;
    const modules = game.modules ?? game.world?.modules;
    if ( !game.system || !modules || !type ) return null;
    const [moduleId] = type.split(".");
    if ( type.indexOf(".") < 0 ) {
      const coreTypes = model.parent.constructor.metadata?.coreTypes ?? [];
      if ( !coreTypes.includes(type) ) return game.system;
    }
    return game.modules.get(moduleId) ?? null;
  }

  /**
   * A convenience accessor for the name of the document type associated with this TypeDataField
   * @type {string}
   */
  get documentName() {
    return this.document.documentName;
  }

  /**
   * Get the DataModel definition that should be used for this type of document.
   * @param {string} type              The Document instance type
   * @returns {typeof DataModel|null}  The DataModel class or null
   */
  getModelForType(type) {
    if ( !type ) return null;
    return globalThis.CONFIG?.[this.documentName]?.dataModels?.[type] ?? null;
  }

  /** @override */
  getInitialValue(data) {
    const cls = this.getModelForType(data.type);
    return cls?.cleanData() || foundry.utils.deepClone(game?.model[this.documentName]?.[data.type] || {});
  }

  /** @override */
  _cleanType(value, options) {
    if ( !(typeof value === "object") ) value = {};

    // Use a defined DataModel
    const type = options.source?.type;
    const cls = this.getModelForType(type);
    if ( cls ) return cls.cleanData(value, options);
    if ( options.partial ) return value;

    // Use the defined template.json
    const template = this.getInitialValue(options.source);
    const insertKeys = (type === BASE_DOCUMENT_TYPE) || !game?.system?.template.strictDataCleaning;
    return mergeObject(template, value, {insertKeys, inplace: true});
  }

  /** @override */
  initialize(value, model, options={}) {
    const cls = this.getModelForType(model._source.type);
    if ( cls ) {
      const instance = new cls(value, {parent: model, ...options});
      if ( !("modelProvider" in instance) ) Object.defineProperty(instance, "modelProvider", {
        value: this.constructor.getModelProvider(instance),
        writable: false
      });
      return instance;
    }
    return deepClone(value);
  }

  /** @inheritdoc */
  _validateType(data, options={}) {
    super._validateType(data);
    options.source = options.source || data;
    const cls = this.getModelForType(options.source.type);
    const schema = cls?.schema;
    return schema?.validate(data, options);
  }

  /* ---------------------------------------- */

  /** @override */
  _validateModel(changes, options) {
    options.source ||= changes;
    const cls = this.getModelForType(options.source.type);
    return cls?.validateJoint(changes);
  }

  /* ---------------------------------------- */

  /** @override */
  toObject(value) {
    return value.toObject instanceof Function ? value.toObject(false) : deepClone(value);
  }

  /**
   * Migrate this field's candidate source data.
   * @param {object} sourceData   Candidate source data of the root model
   * @param {any} fieldData       The value of this field within the source data
   */
  migrateSource(sourceData, fieldData) {
    const cls = this.getModelForType(sourceData.type);
    if ( cls ) cls.migrateDataSafe(fieldData);
  }
}

/* ---------------------------------------- */
/*  DEPRECATIONS                            */
/* ---------------------------------------- */

/**
 * @deprecated since v11
 * @see DataModelValidationError
 * @ignore
 */
class ModelValidationError extends Error {
  constructor(errors) {
    logCompatibilityWarning(
      "ModelValidationError is deprecated. Please use DataModelValidationError instead.",
      {since: 11, until: 13});
    const message = ModelValidationError.formatErrors(errors);
    super(message);
    this.errors = errors;
  }

  /**
   * Collect all the errors into a single message for consumers who do not handle the ModelValidationError specially.
   * @param {Object<Error>|Error[]|string} errors   The raw error structure
   * @returns {string}                              A formatted error message
   */
  static formatErrors(errors) {
    if ( typeof errors === "string" ) return errors;
    const message = ["Model Validation Errors"];
    if ( errors instanceof Array ) message.push(...errors.map(e => e.message));
    else message.push(...Object.entries(errors).map(([k, e]) => `[${k}]: ${e.message}`));
    return message.join("\n");
  }
}

/**
 * @deprecated since v10
 * @see TypeDataField
 * @ignore
 */
export function systemDataField(document) {
  const msg = "fields.systemDataField is deprecated and replaced by the TypeDataField class";
  logCompatibilityWarning(msg, {since: 10, until: 12});
  return new TypeDataField(document);
}

/**
 * @deprecated since v10
 * @see ForeignDocumentField
 * @ignore
 */
export function foreignDocumentField(options) {
  const msg = "fields.foreignDocumentField is deprecated and replaced by the ForeignDocumentField class";
  logCompatibilityWarning(msg, {since: 10, until: 12});
  return new ForeignDocumentField(options.type.model, options)
}

/**
 * @deprecated since v10
 * @see EmbeddedCollectionField
 * @ignore
 */
export function embeddedCollectionField(document, options={}) {
  const msg = "fields.embeddedCollectionField is deprecated and replaced by the EmbeddedCollectionField class";
  logCompatibilityWarning(msg, {since: 10, until: 12});
  return new EmbeddedCollectionField(document, options);
}

/**
 * @deprecated since v10
 * @ignore
 */
export function field(field, options={}) {
  const msg = "fields.field() is deprecated since v10 and should be replaced with explicit use of new field classes";
  logCompatibilityWarning(msg, {since: 10, until: 12});
  const type = field.type;
  switch(type) {
    case String:
      return new StringField(options);
    case Number:
      return new NumberField(options);
    case Boolean:
      return new BooleanField(options);
    case Object:
      return new ObjectField(options);
  }
  if ( type instanceof Array ) return new ArrayField(type[0], options);
  else if ( typeof type === "object" ) return new EmbeddedCollectionField(Array.from(Object.values(type))[0]);
}

// Exports need to be at the bottom so that class names appear correctly in JSDoc
export {
  AlphaField,
  AngleField,
  ArrayField,
  BooleanField,
  ColorField,
  DataField,
  DocumentIdField,
  DocumentOwnershipField,
  DocumentStatsField,
  EmbeddedDataField,
  EmbeddedCollectionField,
  EmbeddedCollectionDeltaField,
  EmbeddedDocumentField,
  FilePathField,
  ForeignDocumentField,
  HTMLField,
  IntegerSortField,
  JSONField,
  NumberField,
  ObjectField,
  SchemaField,
  SetField,
  StringField,
  TypeDataField,
  ModelValidationError
}
