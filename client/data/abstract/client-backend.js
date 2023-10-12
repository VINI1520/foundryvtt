/**
 * The client-side database backend implementation which handles Document modification operations.
 * @extends {abstract.DatabaseBackend}
 * @implements {abstract.DatabaseBackend}
 */
class ClientDatabaseBackend extends foundry.abstract.DatabaseBackend {

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
      const { request } = response;
      const isEmbedded = CONST.DOCUMENT_TYPES.includes(request.parentType);
      switch ( request.action ) {
        case "create":
          if ( isEmbedded ) return this._handleCreateEmbeddedDocuments(response);
          else return this._handleCreateDocuments(response);
        case "update":
          if ( isEmbedded ) return this._handleUpdateEmbeddedDocuments(response);
          else return this._handleUpdateDocuments(response);
        case "delete":
          if ( isEmbedded ) return this._handleDeleteEmbeddedDocuments(response);
          else return this._handleDeleteDocuments(response);
        default:
          throw new Error(`Invalid Document modification action ${request.action} provided`);
      }
    });
  }

  /* -------------------------------------------- */
  /*  Get Operations                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _getDocuments(documentClass, {query, options, pack}, user) {
    const type = documentClass.documentName;

    // Dispatch the request
    const response = await SocketInterface.dispatch("modifyDocument", {
      type: type,
      action: "get",
      query: query,
      options: options,
      pack: pack
    });

    // Return the index only
    if ( options.index ) return response.result;

    // Create Document objects
    return response.result.map(data => {
      return documentClass.fromSource(data, {pack});
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _getEmbeddedDocuments(documentClass, parent, {query, options, pack}, user) {
    throw new Error("Get operations for embedded Documents are currently un-supported");
  }

  /* -------------------------------------------- */
  /*  Create Operations                           */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _createDocuments(documentClass, {data, options, pack}, user) {
    const toCreate = await this._preCreateDocumentArray(documentClass, {data, options, pack, user});
    if ( !toCreate.length || options.temporary ) return toCreate;
    const response = await SocketInterface.dispatch("modifyDocument", {
      type: documentClass.documentName,
      action: "create",
      data: toCreate,
      options: options,
      pack: pack
    });
    return this._handleCreateDocuments(response);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _createEmbeddedDocuments(documentClass, parent, {data, options, pack}, user) {

    // Special Case
    if ( parent.parent ) {
      if ( !(parent.parent instanceof TokenDocument) ) {
        throw new Error("Managing embedded Documents which are not direct descendants of a primary Document is "
          + "un-supported at this time.");
      }
      if ( !options.temporary ) {
        return parent.parent.createActorEmbeddedDocuments(documentClass.documentName, data, options);
      }
    }

    // Standard Case
    const toCreate = await this._preCreateDocumentArray(documentClass, {data, options, pack, parent, user});
    if ( !toCreate.length || options.temporary ) return toCreate;
    const response = await SocketInterface.dispatch("modifyDocument", {
      action: "create",
      type: documentClass.documentName,
      parentType: parent.documentName,
      parentId: parent.id,
      data: toCreate,
      options: options,
      pack: pack
    });
    return this._handleCreateEmbeddedDocuments(response);
  }

  /* -------------------------------------------- */

  /**
   * Perform a standardized pre-creation workflow for all Document types. For internal use only.
   * @private
   */
  async _preCreateDocumentArray(documentClass, {data, options, pack, parent, user}) {
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
        Hooks.onError("ClientDatabaseBackend#_preCreateDocumentArray", err, {id: d._id, log: "error", notify: "error"});
        continue;
      }
      await doc._preCreate(createData, options, user);

      const allowed = options.noHook || Hooks.call(`preCreate${type}`, doc, createData, options, user.id);
      if ( allowed === false ) {
        console.debug(`${vtt} | ${type} creation prevented by preCreate hook`);
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
   * @returns {Document[]}                          An Array of created Document instances
   * @private
   */
  _handleCreateDocuments({request, result=[], userId}) {
    const { type, options, pack } = request;

    // Pre-operation collection actions
    const collection = pack ? game.packs.get(pack) : game.collections.get(type);
    collection._preCreateDocuments(result, options, userId);

    // Perform creations and execute callbacks
    const callbacks = this._postCreateDocumentCallbacks(type, collection, result, {options, userId, pack});
    const documents = callbacks.map(fn => fn());

    // Post-operation collection actions
    collection._onCreateDocuments(documents, result, options, userId);
    this._logOperation("Created", type, documents, {level: "info", pack});
    return documents;
  }

  /* -------------------------------------------- */

  /**
   * Handle a SocketResponse from the server when one or multiple documents were created
   * @param {SocketResponse} response               The provided Socket response
   * @param {SocketRequest} [response.request]      The initial socket request
   * @param {object[]} [response.result]            An Array of created data objects
   * @param {string} [response.userId]              The id of the requesting User
   * @returns {Document[]}                          An Array of created Document instances
   * @private
   */
  _handleCreateEmbeddedDocuments({request, result=[], userId}) {
    const {type, parentType, parentId, options, pack} = request;
    const parentCollection = pack ? game.packs.get(pack) : game.collections.get(parentType);
    const parent = parentCollection.get(parentId, {strict: !pack});
    if ( !parent || !result.length ) return [];

    // Pre-operation parent actions
    const collection = parent.getEmbeddedCollection(type);
    parent._preCreateEmbeddedDocuments(type, result, options, userId);

    // Perform creations and execute callbacks
    const callbacks = this._postCreateDocumentCallbacks(type, collection, result, {options, userId, parent, pack});
    parent.reset();
    const documents = callbacks.map(fn => fn());

    // Perform follow-up operations for the parent Document
    parent._onCreateEmbeddedDocuments(type, documents, result, options, userId);
    this._logOperation("Created", type, documents, {level: "info", parent, pack});
    return documents;
  }

  /* -------------------------------------------- */

  /**
   * Perform a standardized post-creation workflow for all Document types. For internal use only.
   * @returns {Function[]}   An array of callback operations to perform once every Document is created
   * @private
   */
  _postCreateDocumentCallbacks(type, collection, result, {options, userId, parent, pack}) {
    const cls = getDocumentClass(type);
    const callback = (doc, data) => {
      doc._onCreate(data, options, userId);
      Hooks.callAll(`create${type}`, doc, options, userId);
      return doc;
    };
    return result.map(data => {
      const doc = new cls(data, {parent, pack});
      collection.set(doc.id, doc);
      return callback.bind(this, doc, data);
    });
  }

  /* -------------------------------------------- */
  /*  Update Operations                           */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateDocuments(documentClass, {updates, options, pack}, user) {
    const collection = pack ? game.packs.get(pack) : game.collections.get(documentClass.documentName);
    const toUpdate = await this._preUpdateDocumentArray(collection, {updates, options, user});
    if ( !toUpdate.length ) return [];
    const response = await SocketInterface.dispatch("modifyDocument", {
      type: documentClass.documentName,
      action: "update",
      updates: toUpdate,
      options: options,
      pack: pack
    });
    return this._handleUpdateDocuments(response);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateEmbeddedDocuments(documentClass, parent, {updates, options, pack}, user) {

    // Special Cases
    if ( (parent instanceof TokenDocument) && (updates.length === 1) ) {
      return parent.modifyActorDocument(updates[0], options);
    }
    if ( parent.parent instanceof TokenDocument ) {
      return parent.parent.updateActorEmbeddedDocuments(documentClass.documentName, updates, options);
    }
    if ( parent.parent ) {
      throw new Error("Managing embedded Documents which are not direct descendants of a primary Document is "
      + "un-supported at this time.");
    }

    // Normal case
    const collection = parent.getEmbeddedCollection(documentClass.documentName);
    const toUpdate = await this._preUpdateDocumentArray(collection, {updates, options, user});
    if ( !toUpdate.length ) return [];
    const response = await SocketInterface.dispatch("modifyDocument", {
      action: "update",
      type: documentClass.documentName,
      parentType: parent.documentName,
      parentId: parent.id,
      updates: toUpdate,
      options: options,
      pack: pack
    });
    return this._handleUpdateEmbeddedDocuments(response);
  }

  /* -------------------------------------------- */

  /**
   * Perform a standardized pre-update workflow for all Document types. For internal use only.
   * @private
   */
  async _preUpdateDocumentArray(collection, {updates, options, user}) {
    user = user || game.user;
    const cls = collection.documentClass;
    const toUpdate = [];
    if ( collection instanceof CompendiumCollection ) {
      const updateIds = updates.reduce((arr, u) => {
        if ( u._id && !collection.has(u._id) ) arr.push(u._id);
        return arr;
      }, []);
      await collection.getDocuments({_id: {$in: updateIds}});
    }

    // Iterate over requested changes
    for ( let update of updates ) {
      if ( !update._id ) throw new Error("You must provide an _id for every object in the update data Array.");

      // Retrieve the change object
      let changes;
      if ( update instanceof foundry.abstract.DataModel ) changes = update.toObject();
      else changes = foundry.utils.expandObject(update);
      changes = cls.migrateData(changes);

      // Get the Document being updated
      let doc;
      try {
        doc = collection.get(update._id, {strict: true});
      } catch(err) {
        if ( collection.invalidDocumentIds?.has(update._id) ) doc = collection.getInvalid(update._id);
        else throw err;
      }

      // Clean and validate the proposed changes
      try {
        // Add type information to allow a system data model to be retrieved, if one exists.
        const hasType = "type" in changes;
        if ( !hasType && ("type" in doc) ) changes.type = doc.type;
        doc.validate({changes, clean: true, strict: true, fallback: false});
        if ( !hasType ) delete changes.type;
      } catch(err) {
        ui.notifications.error(err.message.split("] ").pop());
        Hooks.onError("ClientDatabaseBackend#_preUpdateDocumentArray", err, {id: doc.id, log: "error"});
        continue;
      }

      // Retain only the differences against the current source
      if ( options.diff ) {
        changes = foundry.utils.diffObject(doc._source, changes, {deletionKeys: true});
        if ( foundry.utils.isEmpty(changes) ) continue;
        changes._id = doc.id;
        changes = cls.shimData(changes); // Re-apply the shim for _preUpdate hooks
      }

      // Perform pre-update operations
      await doc._preUpdate(changes, options, user);

      const allowed = options.noHook || Hooks.call(`preUpdate${doc.documentName}`, doc, changes, options, user.id);
      if ( allowed === false ) {
        console.debug(`${vtt} | ${doc.documentName} update prevented by preUpdate hook`);
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
   * @returns {Document[]}                          An Array of updated Document instances
   * @private
   */
  _handleUpdateDocuments({request, result=[], userId}={}) {
    const { type, options, pack } = request;
    const collection = pack ? game.packs.get(pack) : game.collections.get(type);

    // Pre-operation collection actions
    collection._preUpdateDocuments(result, options, userId);

    // Perform updates and execute callbacks
    const callbacks = this._postUpdateDocumentCallbacks(collection, result, {options, userId});
    const documents = callbacks.map(fn => fn());

    // Post-operation collection actions
    collection._onUpdateDocuments(documents, result, options, userId);
    if ( CONFIG.debug.documents ) this._logOperation("Updated", type, documents, {level: "debug", pack});
    return documents;
  }

  /* -------------------------------------------- */

  /**
   * Handle a SocketResponse from the server when embedded Documents are updated in a parent Document.
   * @param {SocketResponse} response               The provided Socket response
   * @param {SocketRequest} [response.request]      The initial socket request
   * @param {object[]} [response.result]            An Array of incremental data objects
   * @param {string} [response.userId]              The id of the requesting User
   * @returns {Document[]}                          An Array of updated Document instances
   * @private
   */
  _handleUpdateEmbeddedDocuments({request, result=[], userId}) {
    const { type, parentType, parentId, options, pack } = request;
    const parentCollection = pack ? game.packs.get(pack) : game.collections.get(parentType);
    let parent;
    try {
      parent = parentCollection.get(parentId, {strict: true});
    } catch(err) {
      if ( parentCollection.invalidDocumentIds.has(parentId) ) parent = parentCollection.getInvalid(parentId);
      else if ( !pack ) throw err;
    }
    if ( !parent || !result.length ) return [];

    // Pre-operation parent actions
    const collection = parent.getEmbeddedCollection(type);
    parent._preUpdateEmbeddedDocuments(type, result, options, userId);

    // Perform updates and execute callbacks
    const callbacks = this._postUpdateDocumentCallbacks(collection, result, {options, userId});
    parent.reset();
    const documents = callbacks.map(fn => fn());

    // Perform follow-up operations for the parent Document
    parent._onUpdateEmbeddedDocuments(type, documents, result, options, userId);
    if ( CONFIG.debug.documents ) this._logOperation("Updated", type, documents, {level: "debug", parent, pack});
    return documents;
  }

  /* -------------------------------------------- */

  /**
   * Perform a standardized post-update workflow for all Document types. For internal use only.
   * @returns {Function[]}   An array of callback operations to perform after every Document is updated
   * @private
   */
  _postUpdateDocumentCallbacks(collection, result, {options, userId}) {
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
      callbacks.push(callback.bind(this, doc, change));
    }
    return callbacks;
  }

  /* -------------------------------------------- */
  /*  Delete Operations                           */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _deleteDocuments(documentClass, {ids, options, pack}, user) {
    user = user || game.user;
    const collection = pack ? game.packs.get(pack) : game.collections.get(documentClass.documentName);
    if ( options.deleteAll ) ids = pack ? collection.index.keys() : collection.keys();
    const toDelete = await this._preDeleteDocumentArray(collection, {ids, options, user});
    if ( !toDelete.length ) return [];
    const response = await SocketInterface.dispatch("modifyDocument", {
      type: documentClass.documentName,
      action: "delete",
      ids: toDelete,
      options: options,
      pack: pack
    });
    return this._handleDeleteDocuments(response);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _deleteEmbeddedDocuments(documentClass, parent, {ids, options, pack}, user) {

    // Special Cases
    if ( parent.parent instanceof TokenDocument ) {
      return parent.parent.deleteActorEmbeddedDocuments(documentClass.documentName, ids, options);
    }
    if ( parent.parent ) {
      throw new Error("Managing embedded Documents which are not direct descendants of a primary Document is "
      + "un-supported at this time.");
    }

    // Normal case
    const collection = parent.getEmbeddedCollection(documentClass.documentName);
    const deleteIds = options.deleteAll ? collection.keys() : ids;
    const toDelete = await this._preDeleteDocumentArray(collection, {ids: deleteIds, options, user});
    if ( !toDelete.length ) return [];
    const response = await SocketInterface.dispatch("modifyDocument", {
      action: "delete",
      type: documentClass.documentName,
      parentType: parent.documentName,
      parentId: parent.id,
      ids: toDelete,
      options: options,
      pack: pack
    });
    return this._handleDeleteEmbeddedDocuments(response);
  }

  /* -------------------------------------------- */

  /**
   * Perform a standardized pre-delete workflow for all Document types. For internal use only.
   * @private
   */
  async _preDeleteDocumentArray(collection, {ids, options, user}) {
    user = user || game.user;
    const toDelete = [];
    if ( collection instanceof CompendiumCollection ) {
      await collection.getDocuments({_id: {$in: ids.filter(id => !collection.has(id))}});
    }

    // Iterate over ids requested for deletion
    for ( let id of ids ) {

      // Get the Document being deleted
      let doc;
      try {
        doc = collection.get(id, {strict: true});
      } catch(err) {
        if ( collection.invalidDocumentIds?.has(id) ) doc = collection.getInvalid(id);
        else throw err;
      }

      // Perform pre-deletion operations
      await doc._preDelete(options, user);

      const allowed = options.noHook || Hooks.call(`preDelete${doc.documentName}`, doc, options, user.id);
      if ( allowed === false ) {
        console.debug(`${vtt} | ${doc.documentName} deletion prevented by preDelete hook`);
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
   * @returns {Document[]}                           An Array of deleted Document instances
   * @private
   */
  _handleDeleteDocuments({request, result=[], userId}={}) {
    const {type, options, pack} = request;
    const collection = pack ? game.packs.get(pack) : game.collections.get(type);
    result = options.deleteAll ? Array.from(collection.keys()) : result;

    // Pre-operation collection actions
    collection._preDeleteDocuments(result, options, userId);

    // Perform deletions and execute callbacks
    const callbacks = this._postDeleteDocumentCallbacks(collection, result, {options, userId});
    const documents = callbacks.map(fn => fn());

    // Post-operation collection actions
    collection._onDeleteDocuments(documents, result, options, userId);
    this._logOperation("Deleted", type, documents, {level: "info", pack});
    return documents;
  }

  /* -------------------------------------------- */

  /**
   * Handle a SocketResponse from the server when embedded Documents are deleted from a parent Document.
   * @param {SocketResponse} response               The provided Socket response
   * @param {SocketRequest} [response.request]      The initial socket request
   * @param {string[]} [response.result]            An Array of deleted Document ids
   * @param {string} [response.userId]              The id of the requesting User
   * @returns {Document[]}                          An Array of deleted Document instances
   * @private
   */
  _handleDeleteEmbeddedDocuments({request, result=[], userId}) {
    const { type, parentType, parentId, options, pack } = request;
    const parentCollection = pack ? game.packs.get(pack) : game.collections.get(parentType);
    const parent = parentCollection.get(parentId, {strict: !pack});
    if ( !parent || !result.length ) return [];

    // Pre-operation parent actions
    const collection = parent.getEmbeddedCollection(type);
    parent._preDeleteEmbeddedDocuments(type, result, options, userId);

    // Perform updates and execute callbacks
    const callbacks = this._postDeleteDocumentCallbacks(collection, result, {options, userId});
    parent.reset();
    const documents = callbacks.map(fn => fn());

    // Perform follow-up operations for the parent Document
    parent._onDeleteEmbeddedDocuments(type, documents, result, options, userId);
    this._logOperation("Deleted", type, documents, {level: "info", parent, pack});
    return documents;
  }

  /* -------------------------------------------- */

  /**
   * Perform a standardized post-deletion workflow for all Document types. For internal use only.
   * @returns {Function[]}   An array of callback operations to perform after every Document is deleted
   * @private
   */
  _postDeleteDocumentCallbacks(collection, result, {options, userId}) {
    const callback = doc => {
      doc._onDelete(options, userId);
      Hooks.callAll(`delete${doc.documentName}`, doc, options, userId);
      return doc;
    };
    const callbacks = [];
    for ( let id of result ) {
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
}
