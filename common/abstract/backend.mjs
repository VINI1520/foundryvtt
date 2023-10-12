import Document from "./document.mjs";
import {mergeObject} from "../utils/helpers.mjs";

/**
 * An interface shared by both the client and server-side which defines how creation, update, and deletion operations are transacted.
 * @abstract
 * @interface
 * @memberof abstract
 */
class DatabaseBackend {

  /* -------------------------------------------- */
  /*  Get Operations                              */
  /* -------------------------------------------- */

  /**
   * Retrieve Documents based on provided query parameters
   * @param {Function} documentClass        The Document definition
   * @param {object} context                Context for the requested operation
   * @param {BaseUser} [user]               The requesting User
   * @returns {Promise<Document[]>}         The created Document instances
   */
  async get(documentClass, context, user) {
    context = await this._getArgs(context);
    return this._getDocuments(documentClass, context, user);
  }

  /* -------------------------------------------- */

  /**
   * Validate the arguments passed to the get operation
   * @param {object} context                The requested operation
   * @param {object} [context.query={}]     A document search query to execute
   * @param {object} [context.options={}]   Operation options
   * @param {string} [context.pack]         A Compendium pack identifier
   * @private
   */
  async _getArgs({query={}, options={}, pack, ...context}={}) {
    const parent = await this._getParent(context);
    options = mergeObject({index: false}, options);
    if ( pack && !this.getCompendiumScopes().includes(pack) ) {
      throw new Error(`Compendium pack ${pack} is not a valid Compendium identifier`);
    }
    options.broadcast = false; // never broadcast get requests
    return {query, options, pack, parent, parentUuid: context.parentUuid};
  }

  /* -------------------------------------------- */

  /**
   * Get primary Document instances
   * @protected
   */
  async _getDocuments(documentClass, request, user) {}

  /* -------------------------------------------- */

  /**
   * Get the parent Document (if any) associated with a request context.
   * @param {object} context                The requested operation
   * @return {Promise<Document|null>}       The parent Document, or null
   * @private
   */
  async _getParent(context) {
    if ( !context.parent ) return null;
    if ( !(context.parent instanceof Document) ) {
      throw new Error("A parent Document provided to the database operation must be a Document instance");
    }
    return context.parent;
  }

  /* -------------------------------------------- */
  /*  Create Operations                           */
  /* -------------------------------------------- */

  /**
   * Perform document creation operations
   * @param {Function} documentClass        The Document definition
   * @param {object} context                Context for the requested operation
   * @param {BaseUser} [user]               The requesting User
   * @returns {Promise<Document[]>}         The created Document instances
   */
  async create(documentClass, context, user) {
    context = await this._createArgs(context);
    return this._createDocuments(documentClass, context, user);
  }

  /* -------------------------------------------- */

  /**
   * Validate the arguments passed to the create operation
   * @param {object} context                The requested operation
   * @param {object[]} context.data         An array of document data
   * @param {object} [context.options={}]   Operation options
   * @param {string} [context.pack]         A Compendium pack identifier
   * @private
   */
  async _createArgs({data=[], options={}, pack, ...context}={}) {
    if ( !(data instanceof Array) ) {
      throw new Error("The data provided to the DatabaseBackend#create operation must be an array of data objects");
    }
    const parent = await this._getParent(context);
    options = mergeObject({temporary: false, renderSheet: false, render: true}, options);
    if ( pack && !this.getCompendiumScopes().includes(pack) ) {
      throw new Error(`Compendium pack ${pack} is not a valid Compendium identifier`);
    }
    if ( options.temporary ) options.noHook = true;
    return {data, options, pack, parent, parentUuid: context.parentUuid};
  }

  /* -------------------------------------------- */

  /**
   * Create primary Document instances
   * @returns {Promise<Document[]>}
   * @protected
   */
  async _createDocuments(documentClass, context, user) {}

  /* -------------------------------------------- */
  /*  Update Operations                           */
  /* -------------------------------------------- */

  /**
   * Perform document update operations
   * @param {Function} documentClass        The Document definition
   * @param {object} context                Context for the requested operation
   * @param {BaseUser} [user]               The requesting User
   * @returns {Promise<Document[]>}         The updated Document instances
   */
  async update(documentClass, context, user) {
    context = await this._updateArgs(context);
    return this._updateDocuments(documentClass, context, user);
  }

  /* -------------------------------------------- */

  /**
   * Validate the arguments passed to the update operation
   * @param {object} context                The requested operation
   * @param {object[]} context.updates      An array of document data
   * @param {object} [context.options={}]   Operation options
   * @param {string} [context.pack]         A Compendium pack identifier
   * @private
   */
  async _updateArgs({updates=[], options={}, pack, ...context}={}) {
    if ( !(updates instanceof Array) ) {
      throw new Error("The updates provided to the DatabaseBackend#update operation must be an array of data objects");
    }
    const parent = await this._getParent(context);
    options = mergeObject({diff: true, render: true}, options);
    if ( pack && !this.getCompendiumScopes().includes(pack) ) {
      throw new Error(`Compendium pack ${pack} is not a valid Compendium identifier`);
    }
    return {updates, options, pack, parent, parentUuid: context.parentUuid};
  }

  /* -------------------------------------------- */

  /**
   * Update primary Document instances
   * @returns {Promise<Document[]>}
   * @protected
   */
  async _updateDocuments(documentClass, context, user) {
    throw new Error("An implementation of the DatabaseBackend must define the _updateDocuments method");
  }

  /* -------------------------------------------- */
  /*  Delete Operations                           */
  /* -------------------------------------------- */

  /**
   * Perform document deletion operations
   * @param {Function} documentClass        The Document definition
   * @param {object} context                Context for the requested operation
   * @param {BaseUser} [user]               The requesting User
   * @returns {Promise<Document[]>}         The deleted Document instances
   */
  async delete(documentClass, context, user) {
    context = await this._deleteArgs(context);
    return this._deleteDocuments(documentClass, context, user);
  }

  /* -------------------------------------------- */

  /**
   * Validate the arguments passed to the delete operation
   * @param {object} context                The requested operation
   * @param {string[]} context.ids          An array of document ids
   * @param {object} [context.options={}]   Operation options
   * @param {string} [context.pack]         A Compendium pack identifier
   * @private
   */
  async _deleteArgs({ids=[], options={}, pack, ...context}={}) {
    if ( !(ids instanceof Array) ) {
      throw new Error("The document ids provided to the DatabaseBackend#delete operation must be an array of strings");
    }
    const parent = await this._getParent(context);
    options = mergeObject({render: true}, options);
    if ( pack && !this.getCompendiumScopes().includes(pack) ) {
      throw new Error(`Compendium pack ${pack} is not a valid Compendium identifier`);
    }
    return {ids, options, pack, parent, parentUuid: context.parentUuid};
  }

  /* -------------------------------------------- */

  /**
   * Delete primary Document instances
   * @returns {Promise<Document[]>}
   * @protected
   */
  async _deleteDocuments(documentClass, context, user) {}

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /**
   * Describe the scopes which are suitable as the namespace for a flag key
   * @returns {string[]}
   */
  getFlagScopes() {}

  /* -------------------------------------------- */

  /**
   * Describe the scopes which are suitable as the namespace for a flag key
   * @returns {string[]}
   */
  getCompendiumScopes() {}

  /* -------------------------------------------- */

  /**
   * Provide the Logger implementation that should be used for database operations
   * @return {Logger|Console}
   * @protected
   */
  _getLogger() {
    return globalThis?.config?.logger ?? console;
  }

  /* -------------------------------------------- */

  /**
   * Log a database operation for an embedded document, capturing the action taken and relevant IDs
   * @param {string} action                       The action performed
   * @param {string} type                         The document type
   * @param {abstract.Document[]} documents       The documents modified
   * @param {string} [level=info]                 The logging level
   * @param {abstract.Document} [parent]          A parent document
   * @param {string} [pack]                       A compendium pack within which the operation occurred
   * @protected
   */
  _logOperation(action, type, documents, {parent, pack, level="info"}={}) {
    const logger = this._getLogger();
    let msg = (documents.length === 1) ? `${action} ${type}` : `${action} ${documents.length} ${type} documents`;
    if (documents.length === 1) msg += ` with id [${documents[0].id}]`;
    else if (documents.length <= 5) msg += ` with ids: [${documents.map(d => d.id)}]`;
    msg += this._logContext({parent, pack});
    logger[level](`${vtt} | ${msg}`);
  }

  /* -------------------------------------------- */

  /**
   * Construct a standardized error message given the context of an attempted operation
   * @returns {string}
   * @protected
   */
  _logError(user, action, subject, {parent, pack}={}) {
    if ( subject instanceof Document ) {
      subject = subject.id ? `${subject.documentName} [${subject.id}]` : `a new ${subject.documentName}`;
    }
    let msg = `User ${user.name} lacks permission to ${action} ${subject}`;
    return msg + this._logContext({parent, pack});
  }

  /* -------------------------------------------- */

  /**
   * Determine a string suffix for a log message based on the parent and/or compendium context.
   * @returns {string}
   * @private
   */
  _logContext({parent, pack}={}) {
    let context = "";
    if ( parent ) {
      const parentName = parent.constructor.metadata.name;
      context += ` in parent ${parentName} [${parent.id}]`;
    }
    if ( pack ) {
      context += ` in Compendium ${pack}`;
    }
    return context;
  }
}

// Export default at the end to allow for JSDoc indexing
export default DatabaseBackend;
