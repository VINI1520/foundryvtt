import DataModel from "./data.mjs";
import {getProperty, hasProperty, setProperty, mergeObject} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import {logCompatibilityWarning} from "../utils/logging.mjs";
import {TypeDataField} from "../data/fields.mjs";

/**
 * An extension of the base DataModel which defines a Document.
 * Documents are special in that they are persisted to the database and referenced by _id.
 * @extends abstract.DataModel
 * @memberof abstract
 * @abstract
 *
 * @param {object} data                           Initial data from which to construct the Document
 * @param {DocumentConstructionContext} context   Construction context options
 */
export default class Document extends DataModel {

  /** @override */
  _configure({pack=null, parentCollection=null}={}) {
    /**
     * An immutable reverse-reference to the name of the collection that this Document exists in on its parent, if any.
     * @type {string|null}
     */
    Object.defineProperty(this, "parentCollection", {
      value: this._getParentCollection(parentCollection),
      writable: false
    });

    /**
     * An immutable reference to a containing Compendium collection to which this Document belongs.
     * @type {string|null}
     */
    Object.defineProperty(this, "pack", {
      value: (() => {
        if ( typeof pack === "string" ) return pack;
        if ( this.parent?.pack ) return this.parent.pack;
        if ( pack === null ) return null;
        throw new Error("The provided compendium pack ID must be a string");
      })(),
      writable: false
    });

    // Construct Embedded Collections
    const collections = {};
    for ( const [fieldName, field] of Object.entries(this.constructor.hierarchy) ) {
      if ( !field.constructor.implementation ) continue;
      const data = this._source[fieldName];
      const c = collections[fieldName] = new field.constructor.implementation(fieldName, this, data);
      Object.defineProperty(this, fieldName, {value: c, writable: false});
    }

    /**
     * A mapping of embedded Document collections which exist in this model.
     * @type {Object<EmbeddedCollection>}
     */
    Object.defineProperty(this, "collections", {value: Object.seal(collections), writable: false});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _initialize(options={}) {
    super._initialize(options);

    const singletons = {};
    for ( const [fieldName, field] of Object.entries(this.constructor.hierarchy) ) {
      if ( field instanceof foundry.data.fields.EmbeddedDocumentField ) {
        Object.defineProperty(singletons, fieldName, { get: () => this[fieldName] });
      }
    }

    /**
     * A mapping of singleton embedded Documents which exist in this model.
     * @type {Object<Document>}
     */
    Object.defineProperty(this, "singletons", {value: Object.seal(singletons), configurable: true});
  }

  /* -------------------------------------------- */

  /** @override */
  static *_initializationOrder() {
    const hierarchy = this.hierarchy;

    // Initialize non-hierarchical fields first
    for ( const [name, field] of this.schema.entries() ) {
      if ( name in hierarchy ) continue;
      yield [name, field];
    }

    // Initialize hierarchical fields last
    for ( const [name, field] of Object.entries(hierarchy) ) {
      yield [name, field];
    }
  }

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /**
   * Default metadata which applies to each instance of this Document type.
   * @type {object}
   */
  static metadata = Object.freeze({
    name: "Document",
    collection: "documents",
    indexed: false,
    compendiumIndexFields: [],
    label: "DOCUMENT.Document",
    coreTypes: [],
    embedded: {},
    permissions: {
      create: "ASSISTANT",
      update: "ASSISTANT",
      delete: "ASSISTANT"
    },
    preserveOnImport: ["_id", "sort", "ownership"]
  });

  /* -------------------------------------------- */

  /**
   * The database backend used to execute operations and handle results.
   * @type {abstract.DatabaseBackend}
   */
  static get database() {
    return globalThis.CONFIG.DatabaseBackend;
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the configured subclass of this base Document type.
   * @type {Class}
   */
  static get implementation() {
    return globalThis.CONFIG[this.documentName]?.documentClass || this;
  }

  /* -------------------------------------------- */

  /**
   * The named collection to which this Document belongs.
   * @type {string}
   */
  static get collectionName() {
    return this.metadata.collection;
  }
  get collectionName() {
    return this.constructor.collectionName;
  }

  /* -------------------------------------------- */

  /**
   * The canonical name of this Document type, for example "Actor".
   * @type {string}
   */
  static get documentName() {
    return this.metadata.name;
  }
  get documentName() {
    return this.constructor.documentName;
  }

  /* -------------------------------------------- */

  /**
   * Does this Document support additional sub-types?
   * @type {boolean}
   */
  static get hasTypeData() {
    return this.schema.get("system") instanceof TypeDataField;
  }

  /* -------------------------------------------- */
  /*  Model Properties                            */
  /* -------------------------------------------- */

  /**
   * The Embedded Document hierarchy for this Document.
   * @returns {Object<DataField>}
   */
  static get hierarchy() {
    const hierarchy = {};
    for ( const [fieldName, field] of this.schema.entries() ) {
      if ( field.constructor.hierarchical ) hierarchy[fieldName] = field;
    }
    Object.defineProperty(this, "hierarchy", {value: Object.freeze(hierarchy), writable: false});
    return this.hierarchy;
  }

  /* -------------------------------------------- */

  /**
   * Determine the collection this Document exists in on its parent, if any.
   * @param {string} [parentCollection]  An explicitly provided parent collection name.
   * @returns {string|null}
   * @private
   */
  _getParentCollection(parentCollection) {
    if ( !this.parent ) return null;
    if ( parentCollection ) return parentCollection;
    return this.parent.constructor.getCollectionName(this.documentName);
  }

  /**
   * The canonical identifier for this Document.
   * @type {string|null}
   */
  get id() {
    return this._id;
  }

  /**
   * Test whether this Document is embedded within a parent Document
   * @type {boolean}
   */
  get isEmbedded() {
    return !!(this.parent && this.parentCollection);
  }

  /* ---------------------------------------- */
  /*  Model Permissions                       */
  /* ---------------------------------------- */

  /**
   * Test whether a given User has a sufficient role in order to create Documents of this type in general.
   * @param {documents.BaseUser} user       The User being tested
   * @return {boolean}                      Does the User have a sufficient role to create?
   */
  static canUserCreate(user) {
    const perm = this.metadata.permissions.create;
    if ( perm instanceof Function ) {
      throw new Error('Document.canUserCreate is not supported for this document type. ' +
        'Use Document#canUserModify(user, "create") to test whether a user is permitted to create a ' +
        'specific document instead.');
    }
    return user.hasPermission(perm) || user.hasRole(perm, {exact: false});
  }

  /* ---------------------------------------- */

  /**
   * Get the explicit permission level that a User has over this Document, a value in CONST.DOCUMENT_OWNERSHIP_LEVELS.
   * This method returns the value recorded in Document ownership, regardless of the User's role.
   * To test whether a user has a certain capability over the document, testUserPermission should be used.
   * @param {documents.BaseUser} user     The User being tested
   * @returns {number|null}               A numeric permission level from CONST.DOCUMENT_OWNERSHIP_LEVELS or null
   */
  getUserLevel(user) {
    user = user || game.user;

    // Compendium content uses role-based ownership
    if ( this.pack ) return this.compendium.getUserLevel(user);

    // World content uses granular per-User ownership
    const ownership = this["ownership"] || {};
    return ownership[user.id] ?? ownership.default ?? null;
  }

  /* ---------------------------------------- */

  /**
   * Test whether a certain User has a requested permission level (or greater) over the Document
   * @param {documents.BaseUser} user       The User being tested
   * @param {string|number} permission      The permission level from DOCUMENT_OWNERSHIP_LEVELS to test
   * @param {object} options                Additional options involved in the permission test
   * @param {boolean} [options.exact=false]     Require the exact permission level requested?
   * @return {boolean}                      Does the user have this permission level over the Document?
   */
  testUserPermission(user, permission, {exact=false}={}) {
    const perms = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    const level = user.isGM ? perms.OWNER : this.getUserLevel(user);
    const target = (typeof permission === "string") ? (perms[permission] ?? perms.OWNER) : permission;
    return exact ? level === target : level >= target;
  }

  /* ---------------------------------------- */

  /**
   * Test whether a given User has permission to perform some action on this Document
   * @param {documents.BaseUser} user   The User attempting modification
   * @param {string} action             The attempted action
   * @param {object} [data]             Data involved in the attempted action
   * @return {boolean}                  Does the User have permission?
   */
  canUserModify(user, action, data={}) {
    const permissions = this.constructor.metadata.permissions;
    const perm = permissions[action];

    // Specialized permission test function
    if ( perm instanceof Function ) return perm(user, this, data);

    // User-level permission
    else if ( perm in CONST.USER_PERMISSIONS ) return user.hasPermission(perm);

    // Document-level permission
    const isOwner = this.testUserPermission(user, "OWNER");
    const hasRole = (perm in CONST.USER_ROLES) && user.hasRole(perm);
    return isOwner || hasRole;
  }

  /* ---------------------------------------- */
  /*  Model Methods                           */
  /* ---------------------------------------- */

  /**
   * Clone a document, creating a new document by combining current data with provided overrides.
   * The cloned document is ephemeral and not yet saved to the database.
   * @param {Object} [data={}]                    Additional data which overrides current document data at the time of creation
   * @param {DocumentConstructionContext} [context={}] Additional context options passed to the create method
   * @param {boolean} [context.save=false]             Save the clone to the World database?
   * @param {boolean} [context.keepId=false]           Keep the same ID of the original document
   * @returns {Document|Promise<Document>}        The cloned Document instance
   */
  clone(data={}, {save=false, keepId=false, ...context}={}) {
    if ( !keepId ) data["-=_id"] = null;
    context.parent = this.parent;
    context.pack = this.pack;
    context.strict = false;
    const doc = super.clone(data, context);
    return save ? this.constructor.create(doc, context) : doc;
  }

  /* -------------------------------------------- */

  /**
   * For Documents which include game system data, migrate the system data object to conform to its latest data model.
   * The data model is defined by the template.json specification included by the game system.
   * @returns {object}              The migrated system data object
   */
  migrateSystemData() {
    if ( !this.constructor.hasTypeData ) {
      throw new Error(`The ${this.documentName} Document does not include a TypeDataField.`);
    }
    if ( (this.system instanceof DataModel) && !(this.system.modelProvider instanceof System) ) {
      throw new Error(`The ${this.documentName} Document does not have system-provided package data.`);
    }
    const model = game.model[this.documentName]?.[this["type"]] || {};
    return mergeObject(model, this["system"], {
      insertKeys: false,
      insertValues: true,
      enforceTypes: false,
      overwrite: true,
      inplace: false
    });
  }

  /* -------------------------------------------- */
  /*  Database Operations                         */
  /* -------------------------------------------- */

  /**
   * Create multiple Documents using provided input data.
   * Data is provided as an array of objects where each individual object becomes one new Document.
   *
   * @param {object[]} data                     An array of data objects used to create multiple documents
   * @param {DocumentModificationContext} [context={}] Additional context which customizes the creation workflow
   * @return {Promise<Document[]>}              An array of created Document instances
   *
   * @example Create a single Document
   * ```js
   * const data = [{name: "New Actor", type: "character", img: "path/to/profile.jpg"}];
   * const created = await Actor.createDocuments(data);
   * ```
   *
   * @example Create multiple Documents
   * ```js
   * const data = [{name: "Tim", type: "npc"], [{name: "Tom", type: "npc"}];
   * const created = await Actor.createDocuments(data);
   * ```
   *
   * @example Create multiple embedded Documents within a parent
   * ```js
   * const actor = game.actors.getName("Tim");
   * const data = [{name: "Sword", type: "weapon"}, {name: "Breastplate", type: "equipment"}];
   * const created = await Item.createDocuments(data, {parent: actor});
   * ```
   *
   * @example Create a Document within a Compendium pack
   * ```js
   * const data = [{name: "Compendium Actor", type: "character", img: "path/to/profile.jpg"}];
   * const created = await Actor.createDocuments(data, {pack: "mymodule.mypack"});
   * ```
   */
  static async createDocuments(data=[], context={}) {
    if ( context.parent?.pack ) context.pack = context.parent.pack;
    const {parent, pack, ...options} = context;
    const created = await this.database.create(this.implementation, {data, options, parent, pack});
    await this._onCreateDocuments(created, context);
    return created;
  }

  /* -------------------------------------------- */

  /**
   * Update multiple Document instances using provided differential data.
   * Data is provided as an array of objects where each individual object updates one existing Document.
   *
   * @param {object[]} updates                  An array of differential data objects, each used to update a single Document
   * @param {DocumentModificationContext} [context={}] Additional context which customizes the update workflow
   * @return {Promise<Document[]>}              An array of updated Document instances
   *
   * @example Update a single Document
   * ```js
   * const updates = [{_id: "12ekjf43kj2312ds", name: "Timothy"}];
   * const updated = await Actor.updateDocuments(updates);
   * ```
   *
   * @example Update multiple Documents
   * ```js
   * const updates = [{_id: "12ekjf43kj2312ds", name: "Timothy"}, {_id: "kj549dk48k34jk34", name: "Thomas"}]};
   * const updated = await Actor.updateDocuments(updates);
   * ```
   *
   * @example Update multiple embedded Documents within a parent
   * ```js
   * const actor = game.actors.getName("Timothy");
   * const updates = [{_id: sword.id, name: "Magic Sword"}, {_id: shield.id, name: "Magic Shield"}];
   * const updated = await Item.updateDocuments(updates, {parent: actor});
   * ```
   *
   * @example Update Documents within a Compendium pack
   * ```js
   * const actor = await pack.getDocument(documentId);
   * const updated = await Actor.updateDocuments([{_id: actor.id, name: "New Name"}], {pack: "mymodule.mypack"});
   * ```
   */
  static async updateDocuments(updates=[], context={}) {
    if ( context.parent?.pack ) context.pack = context.parent.pack;
    const {parent, pack, ...options} = context;
    const updated = await this.database.update(this.implementation, {updates, options, parent, pack});
    await this._onUpdateDocuments(updated, context);
    return updated;
  }

  /* -------------------------------------------- */

  /**
   * Delete one or multiple existing Documents using an array of provided ids.
   * Data is provided as an array of string ids for the documents to delete.
   *
   * @param {string[]} ids                      An array of string ids for the documents to be deleted
   * @param {DocumentModificationContext} [context={}] Additional context which customizes the deletion workflow
   * @return {Promise<Document[]>}              An array of deleted Document instances
   *
   * @example Delete a single Document
   * ```js
   * const tim = game.actors.getName("Tim");
   * const deleted = await Actor.deleteDocuments([tim.id]);
   * ```
   *
   * @example Delete multiple Documents
   * ```js
   * const tim = game.actors.getName("Tim");
   * const tom = game.actors.getName("Tom");
   * const deleted = await Actor.deleteDocuments([tim.id, tom.id]);
   * ```
   *
   * @example Delete multiple embedded Documents within a parent
   * ```js
   * const tim = game.actors.getName("Tim");
   * const sword = tim.items.getName("Sword");
   * const shield = tim.items.getName("Shield");
   * const deleted = await Item.deleteDocuments([sword.id, shield.id], parent: actor});
   * ```
   *
   * @example Delete Documents within a Compendium pack
   * ```js
   * const actor = await pack.getDocument(documentId);
   * const deleted = await Actor.deleteDocuments([actor.id], {pack: "mymodule.mypack"});
   * ```
   */
  static async deleteDocuments(ids=[], context={}) {
    if ( context.parent?.pack ) context.pack = context.parent.pack;
    const {parent, pack, ...options} = context;
    const deleted = await this.database.delete(this.implementation, {ids, options, parent, pack});
    await this._onDeleteDocuments(deleted, context);
    return deleted;
  }

  /* -------------------------------------------- */

  /**
   * Create a new Document using provided input data, saving it to the database.
   * @see {@link Document.createDocuments}
   * @param {object} [data={}]                  Initial data used to create this Document
   * @param {DocumentModificationContext} [context={}] Additional context which customizes the creation workflow
   * @return {Promise<Document>}                The created Document instance
   *
   * @example Create a World-level Item
   * ```js
   * const data = [{name: "Special Sword", type: "weapon"}];
   * const created = await Item.create(data);
   * ```
   *
   * @example Create an Actor-owned Item
   * ```js
   * const data = [{name: "Special Sword", type: "weapon"}];
   * const actor = game.actors.getName("My Hero");
   * const created = await Item.create(data, {parent: actor});
   * ```
   *
   * @example Create an Item in a Compendium pack
   * ```js
   * const data = [{name: "Special Sword", type: "weapon"}];
   * const created = await Item.create(data, {pack: "mymodule.mypack"});
   * ```
   */
  static async create(data, context={}) {
    const createData = data instanceof Array ? data : [data];
    const created = await this.createDocuments(createData, context);
    return data instanceof Array ? created : created.shift();
  }

  /* -------------------------------------------- */

  /**
   * Update this Document using incremental data, saving it to the database.
   * @see {@link Document.updateDocuments}
   * @param {object} [data={}]                  Differential update data which modifies the existing values of this document data
   * @param {DocumentModificationContext} [context={}] Additional context which customizes the update workflow
   * @returns {Promise<Document>}               The updated Document instance
   */
  async update(data={}, context={}) {
    data._id = this.id;
    context.parent = this.parent;
    context.pack = this.pack;
    const updates = await this.constructor.updateDocuments([data], context);
    return updates.shift();
  }

  /* -------------------------------------------- */

  /**
   * Delete this Document, removing it from the database.
   * @see {@link Document.deleteDocuments}
   * @param {DocumentModificationContext} [context={}] Additional context which customizes the deletion workflow
   * @returns {Promise<Document>}               The deleted Document instance
   */
  async delete(context={}) {
    context.parent = this.parent;
    context.pack = this.pack;
    const deleted = await this.constructor.deleteDocuments([this.id], context);
    return deleted.shift();
  }

  /* -------------------------------------------- */

  /**
   * Get a World-level Document of this type by its id.
   * @param {string} documentId         The Document ID
   * @param {object} [options={}]       Additional options which customize the request
   * @returns {abstract.Document|null}  The retrieved Document, or null
   */
  static get(documentId, options={}) {
    if ( !documentId ) return null;
    if ( options.pack ) {
      const pack = game.packs.get(options.pack);
      return pack?.index.get(documentId) || null;
    }
    else {
      const collection = game.collections?.get(this.documentName);
      return collection?.get(documentId) || null;
    }
  }

  /* -------------------------------------------- */
  /*  Embedded Operations                         */
  /* -------------------------------------------- */

  /**
   * A compatibility method that returns the appropriate name of an embedded collection within this Document.
   * @param {string} name    An existing collection name or a document name.
   * @returns {string|null}  The provided collection name if it exists, the first available collection for the
   *                         document name provided, or null if no appropriate embedded collection could be found.
   * @example Passing an existing collection name.
   * ```js
   * Actor.getCollectionName("items");
   * // returns "items"
   * ```
   *
   * @example Passing a document name.
   * ```js
   * Actor.getCollectionName("Item");
   * // returns "items"
   * ```
   */
  static getCollectionName(name) {
    if ( name in this.hierarchy ) return name;
    for ( const [collectionName, field] of Object.entries(this.hierarchy) ) {
      if ( field.model.documentName === name ) return collectionName;
    }
    return null;
  }

  /* -------------------------------------------- */

  /**
   * Obtain a reference to the Array of source data within the data object for a certain embedded Document name
   * @param {string} embeddedName   The name of the embedded Document type
   * @return {DocumentCollection}   The Collection instance of embedded Documents of the requested type
   */
  getEmbeddedCollection(embeddedName) {
    const collectionName = this.constructor.getCollectionName(embeddedName);
    if ( !collectionName ) {
      throw new Error(`${embeddedName} is not a valid embedded Document within the ${this.documentName} Document`);
    }
    const field = this.constructor.hierarchy[collectionName];
    return field.getCollection(this);
  }

  /* -------------------------------------------- */

  /**
   * Get an embedded document by its id from a named collection in the parent document.
   * @param {string} embeddedName              The name of the embedded Document type
   * @param {string} id                        The id of the child document to retrieve
   * @param {object} [options]                 Additional options which modify how embedded documents are retrieved
   * @param {boolean} [options.strict=false]   Throw an Error if the requested id does not exist. See Collection#get
   * @param {boolean} [options.invalid=false]  Allow retrieving an invalid Embedded Document.
   * @return {Document}                        The retrieved embedded Document instance, or undefined
   * @throws If the embedded collection does not exist, or if strict is true and the Embedded Document could not be
   *         found.
   */
  getEmbeddedDocument(embeddedName, id, {invalid=false, strict=false}={}) {
    const collection = this.getEmbeddedCollection(embeddedName);
    return collection.get(id, {invalid, strict});
  }

  /* -------------------------------------------- */

  /**
   * Create multiple embedded Document instances within this parent Document using provided input data.
   * @see {@link Document.createDocuments}
   * @param {string} embeddedName               The name of the embedded Document type
   * @param {object[]} data                     An array of data objects used to create multiple documents
   * @param {DocumentModificationContext} [context={}] Additional context which customizes the creation workflow
   * @return {Promise<Document[]>}              An array of created Document instances
   */
  async createEmbeddedDocuments(embeddedName, data=[], context={}) {
    this.getEmbeddedCollection(embeddedName); // Validation only
    context.parent = this;
    context.pack = this.pack;
    const cls = getDocumentClass(embeddedName);
    return cls.createDocuments(data, context);
  }

  /* -------------------------------------------- */

  /**
   * Update multiple embedded Document instances within a parent Document using provided differential data.
   * @see {@link Document.updateDocuments}
   * @param {string} embeddedName               The name of the embedded Document type
   * @param {object[]} updates                  An array of differential data objects, each used to update a single Document
   * @param {DocumentModificationContext} [context={}] Additional context which customizes the update workflow
   * @return {Promise<Document[]>}              An array of updated Document instances
   */
  async updateEmbeddedDocuments(embeddedName, updates=[], context={}) {
    this.getEmbeddedCollection(embeddedName); // Validation only
    context.parent = this;
    context.pack = this.pack;
    const cls = getDocumentClass(embeddedName);
    return cls.updateDocuments(updates, context);
  }

  /* -------------------------------------------- */

  /**
   * Delete multiple embedded Document instances within a parent Document using provided string ids.
   * @see {@link Document.deleteDocuments}
   * @param {string} embeddedName               The name of the embedded Document type
   * @param {string[]} ids                      An array of string ids for each Document to be deleted
   * @param {DocumentModificationContext} [context={}] Additional context which customizes the deletion workflow
   * @return {Promise<Document[]>}              An array of deleted Document instances
   */
  async deleteEmbeddedDocuments(embeddedName, ids, context={}) {
    this.getEmbeddedCollection(embeddedName); // Validation only
    context.parent = this;
    context.pack = this.pack;
    const cls = getDocumentClass(embeddedName);
    return cls.deleteDocuments(ids, context);
  }

  /* -------------------------------------------- */
  /*  Flag Operations                             */
  /* -------------------------------------------- */

  /**
   * Get the value of a "flag" for this document
   * See the setFlag method for more details on flags
   *
   * @param {string} scope        The flag scope which namespaces the key
   * @param {string} key          The flag key
   * @return {*}                  The flag value
   */
  getFlag(scope, key) {
    const scopes = this.constructor.database.getFlagScopes();
    if ( !scopes.includes(scope) ) throw new Error(`Flag scope "${scope}" is not valid or not currently active`);
    return getProperty(this.flags?.[scope], key);
  }

  /* -------------------------------------------- */

  /**
   * Assign a "flag" to this document.
   * Flags represent key-value type data which can be used to store flexible or arbitrary data required by either
   * the core software, game systems, or user-created modules.
   *
   * Each flag should be set using a scope which provides a namespace for the flag to help prevent collisions.
   *
   * Flags set by the core software use the "core" scope.
   * Flags set by game systems or modules should use the canonical name attribute for the module
   * Flags set by an individual world should "world" as the scope.
   *
   * Flag values can assume almost any data type. Setting a flag value to null will delete that flag.
   *
   * @param {string} scope        The flag scope which namespaces the key
   * @param {string} key          The flag key
   * @param {*} value             The flag value
   * @return {Promise<Document>}  A Promise resolving to the updated document
   */
  async setFlag(scope, key, value) {
    const scopes = this.constructor.database.getFlagScopes();
    if ( !scopes.includes(scope) ) throw new Error(`Flag scope "${scope}" is not valid or not currently active`);
    return this.update({
      flags: {
        [scope]: {
          [key]: value
        }
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Remove a flag assigned to the document
   * @param {string} scope        The flag scope which namespaces the key
   * @param {string} key          The flag key
   * @return {Promise<Document>}  The updated document instance
   */
  async unsetFlag(scope, key) {
    const scopes = this.constructor.database.getFlagScopes();
    if ( !scopes.includes(scope) ) throw new Error(`Flag scope "${scope}" is not valid or not currently active`);
    const head = key.split(".");
    const tail = `-=${head.pop()}`;
    key = ["flags", scope, ...head, tail].join(".");
    return this.update({[key]: null});
  }

  /* -------------------------------------------- */
  /*  Socket Event Handlers                       */
  /* -------------------------------------------- */

  /**
   * Perform preliminary operations before a Document of this type is created.
   * Pre-creation operations only occur for the client which requested the operation.
   * Modifications to the pending document before it is persisted should be performed with this.updateSource().
   * @param {object} data               The initial data object provided to the document creation request
   * @param {object} options            Additional options which modify the creation request
   * @param {documents.BaseUser} user   The User requesting the document creation
   * @returns {Promise<boolean|void>}   A return value of false indicates the creation operation should be cancelled.
   * @protected
   */
  async _preCreate(data, options, user) {}

  /**
   * Perform preliminary operations before a Document of this type is updated.
   * Pre-update operations only occur for the client which requested the operation.
   * @param {object} changed            The differential data that is changed relative to the documents prior values
   * @param {object} options            Additional options which modify the update request
   * @param {documents.BaseUser} user   The User requesting the document update
   * @returns {Promise<boolean|void>}   A return value of false indicates the update operation should be cancelled.
   * @protected
   */
  async _preUpdate(changed, options, user) {}

  /**
   * Perform preliminary operations before a Document of this type is deleted.
   * Pre-delete operations only occur for the client which requested the operation.
   * @param {object} options            Additional options which modify the deletion request
   * @param {documents.BaseUser} user   The User requesting the document deletion
   * @returns {Promise<boolean|void>}   A return value of false indicates the deletion operation should be cancelled.
   * @protected
   */
  async _preDelete(options, user) {}

  /**
   * Perform follow-up operations after a Document of this type is created.
   * Post-creation operations occur for all clients after the creation is broadcast.
   * @param {object} data               The initial data object provided to the document creation request
   * @param {object} options            Additional options which modify the creation request
   * @param {string} userId             The id of the User requesting the document update
   * @protected
   */
  _onCreate(data, options, userId) {}

  /**
   * Perform follow-up operations after a Document of this type is updated.
   * Post-update operations occur for all clients after the update is broadcast.
   * @param {object} changed            The differential data that was changed relative to the documents prior values
   * @param {object} options            Additional options which modify the update request
   * @param {string} userId             The id of the User requesting the document update
   * @protected
   */
  _onUpdate(changed, options, userId) {}

  /**
   * Perform follow-up operations after a Document of this type is deleted.
   * Post-deletion operations occur for all clients after the deletion is broadcast.
   * @param {object} options            Additional options which modify the deletion request
   * @param {string} userId             The id of the User requesting the document update
   * @protected
   */
  _onDelete(options, userId) {}

  /**
   * Perform follow-up operations when a set of Documents of this type are created.
   * This is where side effects of creation should be implemented.
   * Post-creation side effects are performed only for the client which requested the operation.
   * @param {Document[]} documents                    The Document instances which were created
   * @param {DocumentModificationContext} context     The context for the modification operation
   * @protected
   */
  static async _onCreateDocuments(documents, context) {}

  /**
   * Perform follow-up operations when a set of Documents of this type are updated.
   * This is where side effects of updates should be implemented.
   * Post-update side effects are performed only for the client which requested the operation.
   * @param {Document[]} documents                    The Document instances which were updated
   * @param {DocumentModificationContext} context     The context for the modification operation
   * @protected
   */
  static async _onUpdateDocuments(documents, context) {}

  /**
   * Perform follow-up operations when a set of Documents of this type are deleted.
   * This is where side effects of deletion should be implemented.
   * Post-deletion side effects are performed only for the client which requested the operation.
   * @param {Document[]} documents                    The Document instances which were deleted
   * @param {DocumentModificationContext} context     The context for the modification operation
   * @protected
   */
  static async _onDeleteDocuments(documents, context) {}

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * Configure whether V10 Document Model migration warnings should be logged for this class.
   * @ignore
   */
  static LOG_V10_COMPATIBILITY_WARNINGS = true;

  /**
   * @deprecated since v10
   * @ignore
   */
  get data() {
    this.constructor._logV10CompatibilityWarning();
    const data = {
      constructor: this.constructor,
      document: this,
      reset: () => this.reset(),
      schema: this.schema,
      update: (changes, options) => {
        this.constructor.migrateData(foundry.utils.expandObject(changes));
        this.updateSource(changes, options)
      },
      validate: options => this.validate(options),
      _source: this._source,
      toObject: source => this.toObject(source),
      toJSON: () => this.toJSON(),
    };
    for ( const k of this.schema.keys() ) {
      data[k] = this[k];
    }
    return this.constructor.shimData(data, {embedded: false});
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  static get hasSystemData() {
    foundry.utils.logCompatibilityWarning(`You are accessing ${this.name}.hasSystemData which is deprecated. `
    + `Please use ${this.name}.hasTypeData instead.`, {since: 11, until: 13});
    return this.hasTypeData;
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  toObject(source=true) {
    const data = super.toObject(source);
    return this.constructor.shimData(data);
  }

  /* ---------------------------------------- */

  /**
   * A reusable helper for adding migration shims.
   * @protected
   * @ignore
   */
  static _addDataFieldShims(data, shims, options) {
    for ( const [oldKey, newKey] of Object.entries(shims) ) {
      this._addDataFieldShim(data, oldKey, newKey, options);
    }
  }

  /* ---------------------------------------- */

  /**
   * A reusable helper for adding a migration shim
   * @protected
   * @ignore
   */
  static _addDataFieldShim(data, oldKey, newKey, options={}) {
    if ( hasProperty(data, newKey) && !data.hasOwnProperty(oldKey) ) {
      Object.defineProperty(data, oldKey, {
        get: () => {
          this._logDataFieldMigration(oldKey, newKey, options);
          return ("value" in options) ? options.value : getProperty(data, newKey);
        },
        set: value => setProperty(data, newKey, value),
        configurable: true,
        enumerable: false
      })
    }
  }

  /* ---------------------------------------- */

  /**
   * Define a simple migration from one field name to another.
   * The value of the data can be transformed during the migration by an optional application function.
   * @param {object} data     The data object being migrated
   * @param {string} oldKey   The old field name
   * @param {string} newKey   The new field name
   * @param {function(data: object): any} [apply] An application function, otherwise the old value is applied
   * @internal
   */
  static _addDataFieldMigration(data, oldKey, newKey, apply) {
    if ( !hasProperty(data, newKey) && hasProperty(data, oldKey) ) {
      const prop = Object.getOwnPropertyDescriptor(data, oldKey);
      if ( !prop.writable ) return;
      setProperty(data, newKey, apply ? apply(data) : getProperty(data, oldKey));
      delete data[oldKey];
    }
  }

  /* ---------------------------------------- */

  /** @protected */
  static _logDataFieldMigration(oldKey, newKey, options={}) {
    const mode = this.LOG_V10_COMPATIBILITY_WARNINGS ? undefined : CONST.COMPATIBILITY_MODES.SILENT;
    const msg = `You are accessing ${this.name}#${oldKey} which has been migrated to ${this.name}#${newKey}`;
    return logCompatibilityWarning(msg, {mode, ...options})
  }

  /* ---------------------------------------- */

  /** @protected */
  static _logV10CompatibilityWarning(options) {
    const mode = this.LOG_V10_COMPATIBILITY_WARNINGS ? undefined : CONST.COMPATIBILITY_MODES.SILENT;
    const msg = `You are accessing the ${this.name}#data object which is no longer used. ` +
      "Since V10 the Document class and its contained DataModel are merged into a combined data structure. " +
      "You should now reference keys which were previously contained within the data object directly.";
    return logCompatibilityWarning(msg, {mode, ...options});
  }
}
