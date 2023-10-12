import {deepClone, expandObject, flattenObject, getType, mergeObject} from "../utils/helpers.mjs";
import {
  DataField,
  SchemaField,
  EmbeddedDataField,
  EmbeddedCollectionField,
  SystemDataField,
  ObjectField
} from "../data/fields.mjs";
import {ModelValidationError} from "../data/fields.mjs";

/**
 * @typedef {Object<DataField>}  DataSchema
 */

/**
 * @typedef {Object} DataValidationOptions
 * @property {boolean} [fallback=false]  Attempt to replace invalid values with valid defaults?
 * @property {boolean} [partial=false]   Allow partial source data, ignoring absent fields?
 */

/**
 * The abstract base class which defines the data schema contained within a Document.
 * @param {object} [data={}]          Initial data used to construct the data object. The provided object will be owned
 *                                    by the constructed model instance and may be mutated.
 * @param {object} [options={}]       Options which affect DataModel construction
 * @param {Document} [options.parent]     A parent DataModel instance to which this DataModel belongs
 * @param {boolean} [options.strict=true] Control the strictness of validation for initially provided data
 * @abstract
 */
export default class DataModel {
  constructor(data={}, {parent=null, strict=true, ...options}={}) {

    // Parent model
    Object.defineProperty(this, "parent", {
      value: (() => {
        if ( parent === null ) return null;
        if ( parent instanceof DataModel ) return parent;
        throw new Error("The provided parent must be a DataModel instance");
      })(),
      writable: false,
      enumerable: false
    });

    // Source data
    Object.defineProperty(this, "_source", {
      value: this._initializeSource(data, {strict, ...options}),
      writable: false,
      enumerable: false
    });
    Object.seal(this._source);

    // Additional subclass configurations
    this._configure(options);

    // Data validation and initialization
    this.#valid = this.validate({strict, fallback: !strict, fields: true, joint: true});
    this._initialize({strict, ...options});
  }

  /**
   * Configure the data model instance before validation and initialization workflows are performed.
   * @protected
   */
  _configure(options={}) {}

  /* -------------------------------------------- */

  /**
   * The source data object for this DataModel instance.
   * Once constructed, the source object is sealed such that no keys may be added nor removed.
   * @type {object}
   */
  _source;

  /**
   * The defined and cached Data Schema for all instances of this DataModel.
   * @type {SchemaField}
   * @private
   */
  static _schema;

  /**
   * An immutable reverse-reference to a parent DataModel to which this model belongs.
   * @type {DataModel|null}
   */
  parent;

  /**
   * Is the current state of the DataModel valid?
   * @type {boolean}
   * @private
   */
  #valid;

  /* ---------------------------------------- */
  /*  Data Schema                             */
  /* ---------------------------------------- */

  /**
   * Define the data schema for documents of this type.
   * The schema is populated the first time it is accessed and cached for future reuse.
   * @virtual
   * @returns {DataSchema}
   */
  static defineSchema() {
    throw new Error(`The ${this["name"]} subclass of DataModel must define its Document schema`);
  }

  /* ---------------------------------------- */

  /**
   * Define the data schema for documents of this type.
   * @type {SchemaField}
   */
  static get schema() {
    if ( this.hasOwnProperty("_schema") ) return this._schema;
    const schema = new SchemaField(Object.freeze(this.defineSchema()));
    schema.name = this.name;
    Object.defineProperty(this, "_schema", {value: schema, writable: false});
    return schema;
  }

  /* ---------------------------------------- */

  /**
   * Define the data schema for this document instance.
   * @type {SchemaField}
   */
  get schema() {
    return this.constructor.schema;
  }

  /* ---------------------------------------- */

  /**
   * Is the current state of this DataModel invalid?
   * @type {boolean}
   */
  get invalid() {
    return !this.#valid;
  }

  /* ---------------------------------------- */
  /*  Data Cleaning Methods                   */
  /* ---------------------------------------- */

  /**
   * Initialize the source data for a new DataModel instance.
   * One-time migrations and initial cleaning operations are applied to the source data.
   * @param {object|DataModel} data   The candidate source data from which the model will be constructed
   * @param {object} [options]        Options provided to the model constructor
   * @returns {object}                Migrated and cleaned source data which will be stored to the model instance
   * @protected
   */
  _initializeSource(data, options={}) {
    if ( data instanceof DataModel ) data = data.toObject();
    const dt = getType(data);
    if ( dt !== "Object" ) {
      logger.error(`${this.constructor.name} was incorrectly constructed with a ${dt} instead of an object. 
      Attempting to fall back to default values.`)
      data = {};
    }
    data = this.constructor.migrateDataSafe(data);    // Migrate old data to the new format
    data = this.constructor.cleanData(data);          // Clean the data in the new format
    return this.constructor.shimData(data);           // Apply shims which preserve backwards compatibility
  }

  /* ---------------------------------------- */

  /**
   * Clean a data source object to conform to a specific provided schema.
   * @param {object} [source]         The source data object
   * @param {object} [options={}]     Additional options which are passed to field cleaning methods
   * @returns {object}                The cleaned source data
   */
  static cleanData(source={}, options={}) {
    return this.schema.clean(source, options);
  }

  /* ---------------------------------------- */
  /*  Data Initialization                     */
  /* ---------------------------------------- */

  /**
   * Initialize the instance by copying data from the source object to instance attributes.
   * This mirrors the workflow of SchemaField#initialize but with some added functionality.
   * @param {object} [options]        Options provided to the model constructor
   * @protected
   */
  _initialize(options={}) {
    for ( let [name, field] of this.schema.entries() ) {
      const sourceValue = this._source[name];

      // Field initialization
      const value = field.initialize(sourceValue, this, options);

      // Special handling for Document IDs.
      if ( (name === "_id") && (value === null) ) {
        Object.defineProperty(this, name, {value, writable: false, configurable: true});
      }

      // Readonly fields
      else if ( field.readonly ) {
        if ( this[name] !== undefined ) continue;
        Object.defineProperty(this, name, {value, writable: false});
      }

      // Getter fields
      else if ( value instanceof Function ) {
        Object.defineProperty(this, name, {get: value, set() {}, configurable: true});
      }

      // Writable fields
      else this[name] = value;
    }
  }

  /* ---------------------------------------- */

  /**
   * Reset the state of this data instance back to mirror the contained source data, erasing any changes.
   */
  reset() {
    this._initialize();
  }

  /* ---------------------------------------- */

  /**
   * Clone a model, creating a new data model by combining current data with provided overrides.
   * @param {Object} [data={}]                    Additional data which overrides current document data at the time of creation
   * @param {object} [context={}]                 Context options passed to the data model constructor
   * @returns {Document|Promise<Document>}        The cloned Document instance
   */
  clone(data={}, context={}) {
    data = mergeObject(this.toObject(), data, {insertKeys: false, performDeletions: true, inplace: true});
    return new this.constructor(data, context);
  }

  /* ---------------------------------------- */
  /*  Data Validation Methods                 */
  /* ---------------------------------------- */

  /**
   * Validate the data contained in the document to check for type and content
   * This function throws an error if data within the document is not valid
   *
   * @param {object} options          Optional parameters which customize how validation occurs.
   * @param {object} [options.changes]          A specific set of proposed changes to validate, rather than the full
   *                                            source data of the model.
   * @param {boolean} [options.clean=false]     If changes are provided, attempt to clean the changes before validating
   *                                            them?
   * @param {boolean} [options.fallback=false]  Allow replacement of invalid values with valid defaults?
   * @param {boolean} [options.strict=true]     Throw if an invalid value is encountered, otherwise log a warning?
   * @param {boolean} [options.fields=true]     Perform validation on individual fields?
   * @param {boolean} [options.joint]           Perform joint validation on the full data model?
   *                                            Joint validation will be performed by default if no changes are passed.
   *                                            Joint validation will be disabled by default if changes are passed.
   *                                            Joint validation can be performed on a complete set of changes (for
   *                                            example testing a complete data model) by explicitly passing true.
   * @return {boolean}                An indicator for whether the document contains valid data
   */
  validate({changes, clean=false, fallback=false, strict=true, fields=true, joint}={}) {
    let isValid = true;
    const source = changes ?? this._source;

    // Determine whether we are performing partial or joint validation
    const partial = !!changes;
    joint = joint ?? !changes;
    if ( partial && joint ) {
      throw new Error("It is not supported to perform joint data model validation with only a subset of changes");
    }

    // Optionally clean the data before validating
    if ( partial && clean ) this.constructor.cleanData(source, {partial});

    // Validate individual fields in the data or in a specific change-set, throwing errors if validation fails
    if ( fields ) {
      const error = this.schema.validate(source, {partial, fallback});
      if ( error ) {
        isValid = false;
        const id = this._source._id ? `[${this._source._id}] ` : "";
        error.message = `${this.constructor.name} ${id}${error.message}`;
        if ( strict ) throw error;
        else logger.warn(error);
      }
    }

    // Perform joint document-level validations which consider all fields together
    if ( joint ) {
      try {
        this._validateModel(source);
      } catch (err) {
        isValid = false;
        const prefix = this["_id"] ? `[${this["_id"]}] ` : "";
        const e = new ModelValidationError(`${prefix}Model Validation Error:\n${err.message}`)
        if ( strict ) throw e;
        else logger.warn(e);
      }
    }
    return isValid;
  }

  /* ---------------------------------------- */

  /**
   * Get an array of validation errors from the provided error structure
   * @param {object} errors
   * @param {object} [options={}]
   * @param {string} [options.label]      A prefix label that should prepend any error messages
   * @param {string} [options.namespace]  A field namespace that should prepend key names with dot-notation
   * @returns {string}
   */
  static formatValidationErrors(errors, {label, namespace}={}) {
    const arr = label ? [label] : [];
    return arr.concat(Object.entries(flattenObject(errors)).map(([key, err]) => {
      let msg = `${key}: ${err.message}`;
      if ( namespace ) msg = `${namespace}.${msg}`;
      return msg;
    })).join("\n");
  }

  /* ---------------------------------------- */

  /**
   * Jointly validate the overall data model after each field has been individually validated.
   * @param {object} data     The candidate data object to validate
   * @throws                  An error if a validation failure is detected
   * @protected
   */
  _validateModel(data) {}

  /* ---------------------------------------- */
  /*  Data Management                         */
  /* ---------------------------------------- */

  /**
   * Update the DataModel locally by applying an object of changes to its source data.
   * The provided changes are cleaned, validated, and stored to the source data object for this model.
   * The source data is then re-initialized to apply those changes to the prepared data.
   * The method returns an object of differential changes which modified the original data.
   *
   * @param {object} changes          New values which should be applied to the data model
   * @param {object} [options={}]     Options which determine how the new data is merged
   * @returns {object}                An object containing the changed keys and values
   */
  updateSource(changes={}, options={}) {
    const schema = this.schema;
    const source = this._source;
    const _diff = {};
    const _backup = {};
    const _collections = this.collections;

    // Expand the object, if dot-notation keys are provided
    if ( Object.keys(changes).some(k => /\./.test(k)) ) changes = expandObject(changes);

    // Clean and validate the provided changes, throwing an error if any change is invalid
    this.validate({changes, clean: true, fallback: options.fallback, strict: true, fields: true, joint: false});

    // Update the source data for all fields and validate the final combined model
    try {
      DataModel.#updateData(schema, source, changes, {_backup, _collections, _diff, ...options});
      this.#valid = this.validate({fields: !this.#valid, joint: true, strict: true});
    }

    // If any error occurred, restore the backup
    catch(err) {
      mergeObject(this._source, _backup);
      throw err;
    }

    // Re-initialize the updated data
    this._initialize();
    return _diff;
  }

  /* ---------------------------------------- */

  /**
   * Update the source data for a specific DataSchema.
   * @param {SchemaField} schema      The data schema to update
   * @param {object} source           Source data to be updated
   * @param {object} changes          Changes to apply to the source data
   * @param {object} [options={}]     Options which modify the update workflow
   * @returns {object}                The updated source data
   * @throws                          An error if the update operation was unsuccessful
   * @private
   */
  static #updateData(schema, source, changes, options) {
    const {_backup, _diff} = options;
    for ( let [name, value] of Object.entries(changes) ) {
      const field = schema.get(name);
      if ( !field ) continue;

      // Only apply differences in the cleaned data
      const current = source[name];
      if ( current === value ) continue; // no diff

      // Record backup and diff
      _backup[name] = current;
      _diff[name] = value;

      // Field-specific updating logic
      this.#updateField(name, field, source, value, options);
    }
    return source;
  }

  /* ---------------------------------------- */

  /**
   * Update the source data for a specific DataField.
   * @param {string} name             The field name being updated
   * @param {DataField} field         The field definition being updated
   * @param {object} source           The source object being updated
   * @param {*} value                 The new value for the field
   * @param {object} options          Options which modify the update workflow
   * @throws                          An error if the new candidate value is invalid
   * @private
   */
  static #updateField(name, field, source, value, options) {
    const {fallback, recursive, _collections, _diff} = options;
    const current = source[name];

    // Special Case: Update Embedded Collection
    if ( field instanceof EmbeddedCollectionField ) {
      return _collections[name].update(value, {fallback, recursive});
    }

    // Special Case: Inner Data Schema
    let innerSchema;
    if ( (field instanceof SchemaField) || (field instanceof EmbeddedDataField) ) innerSchema = field;
    else if ( field instanceof SystemDataField ) {
      const cls = field.getModelForType(source.type);
      if ( cls ) innerSchema = cls.schema;
    }
    if ( innerSchema ) {
      _diff[name] = {};
      const recursiveOptions = {fallback, recursive, _backup: current, _collections, _diff: _diff[name]};
      return this.#updateData(innerSchema, current, value, recursiveOptions);
    }

    // Special Case: Object Field
    if ( field instanceof ObjectField ) {
      if ( recursive === false ) source[name] = value;
      else mergeObject(current, value, {insertKeys: true, insertValues: true, performDeletions: true});
    }

    // Standard Case: Update Directly
    else source[name] = value;
  }

  /* ---------------------------------------- */
  /*  Serialization and Storage               */
  /* ---------------------------------------- */

  /**
   * Copy and transform the DataModel into a plain object.
   * Draw the values of the extracted object from the data source (by default) otherwise from its transformed values.
   * @param {boolean} [source=true]     Draw values from the underlying data source rather than transformed values
   * @returns {object}                  The extracted primitive object
   */
  toObject(source=true) {
    if ( source ) return deepClone(this._source);
    return this.schema.toObject(this);
  }

  /* ---------------------------------------- */

  /**
   * Extract the source data for the DataModel into a simple object format that can be serialized.
   * @returns {object}          The document source data expressed as a plain object
   */
  toJSON() {
    return this.toObject(true);
  }

  /* -------------------------------------------- */

  /**
   * Create a new instance of this DataModel from a source record.
   * The source is presumed to be trustworthy and is not strictly validated.
   * @param {object} source       Initial document data which comes from a trusted source.
   * @param {object} [context]    Model construction context
   * @param {boolean} [context.strict=false]  Models created from trusted source data are validated non-strictly
   * @returns {DataModel}
   */
  static fromSource(source, {strict=false, ...context}={}) {
    return new this(source, {strict, ...context});
  }

  /* ---------------------------------------- */

  /**
   * Create a DataModel instance using a provided serialized JSON string.
   * @param {string} json       Serialized document data in string format
   * @returns {DataModel}       A constructed data model instance
   */
  static fromJSON(json) {
    return this.fromSource(JSON.parse(json))
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * Migrate candidate source data for this DataModel which may require initial cleaning or transformations.
   * @param {object} source           The candidate source data from which the model will be constructed
   * @returns {object}                Migrated source data, if necessary
   */
  static migrateData(source) {
    const schema = this.schema;
    for ( const [name, value] of Object.entries(source) ) {
      const field = schema.get(name);
      if ( !field ) continue;
      if ( field instanceof EmbeddedDataField ) {
        source[name] = field.model.migrateDataSafe(value || {});
      }
      else if ( field instanceof EmbeddedCollectionField ) {
        (value || []).forEach(d => field.model.migrateDataSafe(d));
      } else if ( field instanceof SystemDataField ) {
        const cls = field.getModelForType(source.type);
        if ( cls ) source[name] = cls.migrateDataSafe(value);
      }
    }
    return source;
  }

  /* ---------------------------------------- */

  /**
   * Wrap data migration in a try/catch which attempts it safely
   * @param {object} source           The candidate source data from which the model will be constructed
   * @returns {object}                Migrated source data, if necessary
   */
  static migrateDataSafe(source) {
    try {
      this.migrateData(source);
    } catch(err) {
      err.message = `Failed data migration for ${this.name}: ${err.message}`;
      logger.warn(err);
    }
    return source;
  }

  /* ---------------------------------------- */

  /**
   * Take data which conforms to the current data schema and add backwards-compatible accessors to it in order to
   * support older code which uses this data.
   * @param {object} data         Data which matches the current schema
   * @param {object} [options={}] Additional shimming options
   * @param {boolean} [options.embedded=true] Apply shims to embedded models?
   * @returns {object}            Data with added backwards-compatible properties
   */
  static shimData(data, {embedded=true}={}) {
    if ( Object.isSealed(data) ) return data;
    const schema = this.schema;
    if ( embedded ) {
      for ( const [name, value] of Object.entries(data) ) {
        const field = schema.get(name);
        if ( (field instanceof EmbeddedDataField) && !Object.isSealed(value) ) {
          data[name] = field.model.shimData(value || {});
        }
        else if ( field instanceof EmbeddedCollectionField ) {
          for ( const d of (value || []) ) {
            if ( !Object.isSealed(d) ) field.model.shimData(d)
          }
        }
      }
    }
    return data;
  }

  /* ---------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  update(changes, options) {
    globalThis.logger.warn("You are calling DataModel#update which is renamed to DataModel#updateSource");
    return this.updateSource(changes, options);
  }
}

export {DataModel};
