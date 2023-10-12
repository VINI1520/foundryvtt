/**
 * The client-side database backend implementation which handles Document modification operations.
 */
class ClientDatabaseBackend extends foundry.abstract.DatabaseBackend {

  /* -------------------------------------------- */
  /*  Document Modification Operations            */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _getDocuments(documentClass, {query, options, pack}, user) {
    const type = documentClass.documentName;

    // Dispatch the request
    const request = {action: "get", type, query, options, pack};
    const response = await SocketInterface.dispatch("modifyDocument", request);

    // Return the index only
    if ( options.index ) return response.result;

    // Create Document objects
    return response.result.map(data => {
      return documentClass.fromSource(data, {pack});
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _createDocuments(documentClass, context, user) {
    const {options, pack, parent} = context;

    // Prepare to create documents
    const toCreate = await ClientDatabaseBackend.#preCreateDocumentArray(documentClass, context, user);
    if ( !toCreate.length || options.temporary ) return toCreate;

    // Dispatch the request
    const request = ClientDatabaseBackend.#buildRequest({action: "create", data: toCreate, documentClass,
      options, pack, parent});
    const response = await SocketInterface.dispatch("modifyDocument", request);

    // Handle document creation
    return this.#handleCreateDocuments(response);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateDocuments(documentClass, context, user) {
    const {options, parent, pack} = context;
    const type = documentClass.documentName;
    const collection = ClientDatabaseBackend.#getCollection(type, parent, pack);

    // Prepare to update documents
    const toUpdate = await ClientDatabaseBackend.#preUpdateDocumentArray(collection, context, user);
    if ( !toUpdate.length ) return [];

    // Dispatch the request
    const request = ClientDatabaseBackend.#buildRequest({action: "update", updates: toUpdate, documentClass,
      options, pack, parent});
    const response = await SocketInterface.dispatch("modifyDocument", request);

    // Handle document update
    return this.#handleUpdateDocuments(response);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _deleteDocuments(documentClass, context, user) {
    const {ids, options, parent, pack} = context;
    const type = documentClass.documentName;
    const collection = ClientDatabaseBackend.#getCollection(type, parent, pack);

    // Prepare to delete documents
    const deleteIds = options.deleteAll ? Array.from(collection instanceof CompendiumCollection
      ? collection.index.keys() : collection.keys()) : ids;
    const toDelete = await ClientDatabaseBackend.#preDeleteDocumentArray(collection, deleteIds, options, user);
    if ( !toDelete.length ) return [];

    // Dispatch the request
    const request = ClientDatabaseBackend.#buildRequest({action: "delete", ids: toDelete, documentClass,
      options, pack, parent});
    const response = await SocketInterface.dispatch("modifyDocument", request);

    // Handle document deletions
    return this.#handleDeleteDocuments(response);
  }

  /* -------------------------------------------- */
  /*  Socket Workflows                            */
  /* -------------------------------------------- */

  /**
   * Activate the Socket event listeners used to receive responses from events which modify database documents
   * @param {Socket} socket   The active game socket
   */
  activateSocketListeners(socket) {

    // Document Operations
    socket.on("modifyDocument", response => {
      const {request} = response;
      switch ( request.action ) {
        case "create": return this.#handleCreateDocuments(response);
        case "update": return this.#handleUpdateDocuments(response);
        case "delete": return this.#handleDeleteDocuments(response);
        default:
          throw new Error(`Invalid Document modification action ${request.action} provided`);
      }
    });
  }

  /* -------------------------------------------- */
  /*  Internal Helper Methods                     */
  /* -------------------------------------------- */

  /**
   * Perform a standardized pre-creation workflow for all Document types. For internal use only.
   * @param {typeof Document} documentClass
   * @param {SocketRequest} request
   * @param {User} user
   */
  static async #preCreateDocumentArray(documentClass, request, user) {
    const {data, options, pack, parent} = request;
    user = user || game.user;
    const type = documentClass.documentName;
    const toCreate = [];
    for ( let d of data ) {

      // Handle DataModel instances
      if ( d instanceof foundry.abstract.DataModel ) d = d.toObject();
      else if ( Object.keys(d).some(k => k.indexOf(".") !== -1) ) d = foundry.utils.expandObject(d);
      else d = foundry.utils.deepClone(d);

      // Migrate the creation data specifically for downstream compatibility
      const createData = foundry.utils.deepClone(documentClass.migrateData(d));

      // Perform pre-creation operations
      let doc;
      try {
        doc = new documentClass(d, {parent, pack});
      } catch(err) {
        Hooks.onError("ClientDatabaseBackend##preCreateDocumentArray", err, {id: d._id, log: "error", notify: "error"});
        continue;
      }

      let allowed = await doc._preCreate(createData, options, user) ?? true;
      allowed &&= (options.noHook || Hooks.call(`preCreate${type}`, doc, createData, options, user.id));
      if ( allowed === false ) {
        console.debug(`${vtt} | ${type} creation prevented during pre-create`);
        continue;
      }
      toCreate.push(doc);
    }
    return toCreate;
  }

  /* -------------------------------------------- */

  /**
   * Handle a SocketResponse from the server when one or multiple documents were created
   * @param {SocketResponse} response               The provided Socket response
   * @param {SocketRequest} [response.request]      The initial socket request
   * @param {object[]} [response.result]            An Array of created data objects
   * @param {string} [response.userId]              The id of the requesting User
   * @returns {Promise<Document[]>}                 An Array of created Document instances
   */
  async #handleCreateDocuments({request, result=[], userId}) {
    const {type, options, pack, parentUuid} = request;
    const parent = await ClientDatabaseBackend.#getParent(parentUuid);
    const collection = ClientDatabaseBackend.#getCollection(type, parent, pack);

    // Pre-operation actions
    const preArgs = [result, options, userId];
    if ( parent ) parent._dispatchDescendantDocumentEvents("preCreate", collection.name, preArgs);
    else collection._preCreateDocuments(...preArgs);

    // Perform creations and execute callbacks
    const callbacks = ClientDatabaseBackend.#postCreateDocumentCallbacks(collection, result, parent, pack, options,
      userId);
    parent?.reset();
    const documents = callbacks.map(fn => fn());

    // Post-operation actions
    const postArgs = [documents, result, options, userId];
    if ( parent ) parent._dispatchDescendantDocumentEvents("onCreate", collection.name, postArgs);
    else collection._onCreateDocuments(...postArgs);

    // Log and return result
    this._logOperation("Created", type, documents, {level: "info", parent, pack});
    return ClientDatabaseBackend.#buildResponse({ action: "create", documents, options });
  }

  /* -------------------------------------------- */

  /**
   * Perform a standardized post-creation workflow for all Document types. For internal use only.
   * @param {DocumentCollection} collection
   * @param {object[]} result
   * @param {ClientDocument} parent
   * @param {string} pack
   * @param {object} options
   * @param {string} userId
   * @returns {Array<function():Document>} An array of callback operations performed after every Document is created
   */
  static #postCreateDocumentCallbacks(collection, result, parent, pack, options, userId) {
    const cls = collection.documentClass;
    const callback = (doc, data) => {
      doc._onCreate(data, options, userId);
      Hooks.callAll(`create${cls.documentName}`, doc, options, userId);
      return doc;
    };
    return result.map(data => {
      const doc = collection.createDocument(data, {parent, pack});
      collection.set(doc.id, doc, options);
      return callback.bind(this, doc, data);
    });
  }

  /* -------------------------------------------- */

  /**
   * Perform a standardized pre-update workflow for all Document types.
   * @param {DocumentCollection} collection
   * @param {SocketRequest} request
   * @param {User} user
   */
  static async #preUpdateDocumentArray(collection, request, user) {
    const {updates, options} = request;
    user = user || game.user;
    const cls = collection.documentClass;
    const toUpdate = [];
    if ( collection instanceof CompendiumCollection ) {
      const updateIds = updates.reduce((arr, u) => {
        if ( u._id && !collection.has(u._id) ) arr.push(u._id);
        return arr;
      }, []);
      await collection.getDocuments({_id__in: updateIds});
    }

    // Iterate over requested changes
    for ( let update of updates ) {
      if ( !update._id ) throw new Error("You must provide an _id for every object in the update data Array.");

      // Retrieve the change object
      let changes;
      if ( update instanceof foundry.abstract.DataModel ) changes = update.toObject();
      else changes = foundry.utils.expandObject(update);

      // Get the Document being updated
      const doc = collection.get(update._id, {strict: true, invalid: true});

      // Ensure that Document sub-type is included
      const addType = ("type" in doc) && !("type" in changes);
      if ( addType ) changes.type = doc.type;

      // Migrate changes
      changes = cls.migrateData(changes);

      // Attempt updating the document to validate the changes
      let diff = {};
      try {
        diff = doc.updateSource(changes, {dryRun: true, fallback: false, restoreDelta: options.restoreDelta});
      } catch(err) {
        ui.notifications.error(err.message.split("] ").pop());
        Hooks.onError("ClientDatabaseBackend##preUpdateDocumentArray", err, {id: doc.id, log: "error"});
        continue;
      }

      // Retain only the differences against the current source
      if ( options.diff ) {
        if ( foundry.utils.isEmpty(diff) ) continue;
        diff._id = doc.id;
        changes = cls.shimData(diff); // Re-apply shims for backwards compatibility in _preUpdate hooks
      }
      else if ( addType ) delete changes.type;

      // Perform pre-update operations
      let allowed = await doc._preUpdate(changes, options, user) ?? true;
      allowed &&= (options.noHook || Hooks.call(`preUpdate${doc.documentName}`, doc, changes, options, user.id));
      if ( allowed === false ) {
        console.debug(`${vtt} | ${doc.documentName} update prevented during pre-update`);
        continue;
      }
      toUpdate.push(changes);
    }
    return toUpdate;
  }

  /* -------------------------------------------- */

  /**
   * Handle a SocketResponse from the server when one or multiple documents were updated
   * @param {SocketResponse} response               The provided Socket response
   * @param {SocketRequest} [response.request]      The initial socket request
   * @param {object[]} [response.result]            An Array of incremental data objects
   * @param {string} [response.userId]              The id of the requesting User
   * @returns {Promise<Document[]>}                 An Array of updated Document instances
   */
  async #handleUpdateDocuments({request, result=[], userId}={}) {
    const { type, options, parentUuid, pack} = request;
    const parent = await ClientDatabaseBackend.#getParent(parentUuid, {invalid: true});
    if ( parentUuid && !parent ) {
      throw new Error(`Unable to update embedded documents in parent '${parentUuid}'. The parent does not exist.`);
    }
    const collection = ClientDatabaseBackend.#getCollection(type, parent, pack);

    // Pre-operation actions
    const preArgs = [result, options, userId];
    if ( parent ) parent._dispatchDescendantDocumentEvents("preUpdate", collection.name, preArgs);
    else collection._preUpdateDocuments(...preArgs);

    // Perform updates and execute callbacks
    options.type = type;
    const callbacks = ClientDatabaseBackend.#postUpdateDocumentCallbacks(collection, result, options, userId);
    parent?.reset();
    const documents = callbacks.map(fn => fn());

    // Post-operation actions
    const postArgs = [documents, result, options, userId];
    if ( parent ) parent._dispatchDescendantDocumentEvents("onUpdate", collection.name, postArgs);
    else collection._onUpdateDocuments(...postArgs);

    // Log and return result
    if ( CONFIG.debug.documents ) this._logOperation("Updated", type, documents, {level: "debug", parent, pack});
    return ClientDatabaseBackend.#buildResponse({ action: "update", documents, options });
  }

  /* -------------------------------------------- */

  /**
   * Perform a standardized post-update workflow for all Document types.
   * @param {DocumentCollection} collection
   * @param {object[]} result
   * @param {object} options
   * @param {string} userId
   * @returns {Array<function():Document>} An array of callback operations performed after every Document is updated
   */
  static #postUpdateDocumentCallbacks(collection, result, options, userId) {
    const cls = collection.documentClass;
    const callback = (doc, change) => {
      change = cls.shimData(change);
      doc._onUpdate(change, options, userId);
      Hooks.callAll(`update${doc.documentName}`, doc, change, options, userId);
      return doc;
    };
    const callbacks = [];
    for ( let change of result ) {
      const doc = collection.get(change._id, {strict: false});
      if ( !doc ) continue;
      doc.updateSource(change, options);
      collection.set(doc.id, doc, options);
      callbacks.push(callback.bind(this, doc, change));
    }
    return callbacks;
  }

  /* -------------------------------------------- */

  /**
   * Perform a standardized pre-delete workflow for all Document types.
   * @param {DocumentCollection} collection
   * @param {string[]} ids
   * @param {object} options
   * @param {User} user
   */
  static async #preDeleteDocumentArray(collection, ids, options, user) {
    user = user || game.user;
    const toDelete = [];
    if ( collection instanceof CompendiumCollection ) {
      await collection.getDocuments({_id__in: ids.filter(id => !collection.has(id))});
    }

    // Iterate over ids requested for deletion
    for ( let id of ids ) {

      // Get the Document being deleted
      const doc = collection.get(id, {strict: true, invalid: true});

      // Perform pre-deletion operations
      let allowed = await doc._preDelete(options, user) ?? true;
      allowed &&= (options.noHook || Hooks.call(`preDelete${doc.documentName}`, doc, options, user.id));
      if ( allowed === false ) {
        console.debug(`${vtt} | ${doc.documentName} deletion prevented during pre-delete`);
        continue;
      }
      toDelete.push(id);
    }
    return toDelete;
  }

  /* -------------------------------------------- */

  /**
   * Handle a SocketResponse from the server where Documents are deleted.
   * @param {SocketResponse} response               The provided Socket response
   * @param {SocketRequest} [response.request]      The initial socket request
   * @param {string[]} [response.result]            An Array of deleted Document ids
   * @param {string} [response.userId]              The id of the requesting User
   * @returns {Promise<Document[]>}                 An Array of deleted Document instances
   */
  async #handleDeleteDocuments({request, result=[], userId}={}) {
    const {type, options, parentUuid, pack} = request;
    const parent = await ClientDatabaseBackend.#getParent(parentUuid);
    const collection = ClientDatabaseBackend.#getCollection(type, parent, pack);
    result = options.deleteAll ? Array.from(collection instanceof CompendiumCollection
      ? collection.index.keys() : collection.keys()) : result;
    if ( !result.length ) return [];

    // Pre-operation actions
    const preArgs = [result, options, userId];
    if ( parent ) parent._dispatchDescendantDocumentEvents("preDelete", collection.name, preArgs);
    else collection._preDeleteDocuments(...preArgs);

    // Perform deletions and execute callbacks
    const callbacks = ClientDatabaseBackend.#postDeleteDocumentCallbacks(collection, result, options, userId);
    parent?.reset();
    const documents = callbacks.map(fn => fn());

    // Post-operation actions
    const postArgs = [documents, result, options, userId];
    if ( parent ) parent._dispatchDescendantDocumentEvents("onDelete", collection.name, postArgs);
    else collection._onDeleteDocuments(...postArgs);

    // Log and return result
    this._logOperation("Deleted", type, documents, {level: "info", parent, pack});
    return ClientDatabaseBackend.#buildResponse({ action: "delete", documents, options });
  }

  /* -------------------------------------------- */

  /**
   * Perform a standardized post-deletion workflow for all Document types.
   * @param {DocumentCollection} collection
   * @param {string[]} ids
   * @param {object} options
   * @param {string} userId
   * @returns {Array<function():Document>} An array of callback operations performed after every Document is deleted
   */
  static #postDeleteDocumentCallbacks(collection, ids, options, userId) {
    const callback = doc => {
      doc._onDelete(options, userId);
      Hooks.callAll(`delete${doc.documentName}`, doc, options, userId);
      return doc;
    };
    const callbacks = [];
    for ( let id of ids ) {
      const doc = collection.get(id, {strict: false});
      if ( !doc ) continue;
      collection.delete(id);
      callbacks.push(callback.bind(this, doc));
    }
    return callbacks;
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  getFlagScopes() {
    if ( this.#flagScopes ) return this.#flagScopes;
    const scopes = ["core", "world", game.system.id];
    for ( const module of game.modules ) {
      if ( module.active ) scopes.push(module.id);
    }
    return this.#flagScopes = scopes;
  }

  /**
   * A cached array of valid flag scopes which can be read and written.
   * @type {string[]}
   */
  #flagScopes;

  /* -------------------------------------------- */

  /** @inheritdoc */
  getCompendiumScopes() {
    return Array.from(game.packs.keys());
  }

  /* -------------------------------------------- */

  /**
   * Get the parent document for given request from its provided UUID, if any.
   * @param {string|null} uuid          The parent document UUID, or null
   * @param {object} [options]          Options which customize how the parent document is retrieved by UUID
   * @returns {Promise<ClientDocument>} The parent document for the transaction
   */
  static async #getParent(uuid, options={}) {
    return uuid ? fromUuid(uuid, options) : null;
  }

  /* -------------------------------------------- */

  /**
   * Obtain the document collection for a given Document type, parent, and compendium pack.
   * @param {string} documentName           The Document name
   * @param {ClientDocument|null} parent    A parent Document, if applicable
   * @param {string} pack                   A compendium pack identifier, if applicable
   * @returns {DocumentCollection|CompendiumCollection}  The relevant collection instance for this request
   */
  static #getCollection(documentName, parent, pack) {
    if ( parent ) return parent.getEmbeddedCollection(documentName);
    if ( pack ) {
      const collection = game.packs.get(pack);
      return documentName === "Folder" ? collection.folders : collection;
    }
    return game.collections.get(documentName);
  }

  /* -------------------------------------------- */

  /**
   * Build a CRUD request.
   * @param {SocketRequest} request  The initial request data.
   * @returns {SocketRequest}
   */
  static #buildRequest({documentClass, action, data, updates, ids, options, pack, parent}) {
    let parentUuid = parent?.uuid;
    let type = documentClass.documentName;

    // Translate updates to a token actor to the token's ActorDelta instead.
    if ( foundry.utils.isSubclass(documentClass, Actor) && (parent instanceof TokenDocument) ) {
      type = "ActorDelta";
      updates[0]._id = parent.delta.id;
      options.syntheticActorUpdate = true;
    }

    // Translate operations on a token actor's embedded children to the token's ActorDelta instead.
    const token = ClientDatabaseBackend.#getTokenAncestor(parent);
    if ( token && !(parent instanceof TokenDocument) ) {
      const {embedded} = foundry.utils.parseUuid(parentUuid);
      parentUuid = [token.delta.uuid, embedded.slice(4).join(".")].filterJoin(".");
    }

    return {type, action, data, updates, ids, options, pack, parentUuid};
  }

  /* -------------------------------------------- */

  /**
   * Build a CRUD response.
   * @param {object} response                      The response data.
   * @param {string} response.action               The type of response.
   * @param {ClientDocument[]} response.documents  The initial response result.
   * @param {object} response.options              The response options.
   * @returns {ClientDocument[]}
   */
  static #buildResponse({ action, documents, options }) {
    if ( options.syntheticActorUpdate ) return documents.map(delta => delta.syntheticActor);
    return documents;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve a Document's Token ancestor, if it exists.
   * @param {ClientDocument} parent   The parent Document
   * @returns {TokenDocument|null}    The Token ancestor, or null
   */
  static #getTokenAncestor(parent) {
    if ( !parent ) return null;
    if ( parent instanceof TokenDocument ) return parent;
    return this.#getTokenAncestor(parent.parent);
  }
}
