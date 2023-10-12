
/**
 * Export data content to be saved to a local file
 * @param {string} data       Data content converted to a string
 * @param {string} type       The type of
 * @param {string} filename   The filename of the resulting download
 */
function saveDataToFile(data, type, filename) {
  const blob = new Blob([data], {type: type});

  // Create an element to trigger the download
  let a = document.createElement('a');
  a.href = window.URL.createObjectURL(blob);
  a.download = filename;

  // Dispatch a click event to the element
  a.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, view: window}));
  setTimeout(() => window.URL.revokeObjectURL(a.href), 100);
}


/* -------------------------------------------- */


/**
 * Read text data from a user provided File object
 * @param {File} file           A File object
 * @return {Promise.<String>}   A Promise which resolves to the loaded text data
 */
function readTextFromFile(file) {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = ev => {
      resolve(reader.result);
    };
    reader.onerror = ev => {
      reader.abort();
      reject();
    };
    reader.readAsText(file);
  });
}

/* -------------------------------------------- */

/**
 * Retrieve a Document by its Universally Unique Identifier (uuid).
 * @param {string} uuid                 The uuid of the Document to retrieve.
 * @param {ClientDocument} [relative]   A document to resolve relative UUIDs against.
 * @returns {Promise<Document|null>}    Returns the Document if it could be found, otherwise null.
 */
async function fromUuid(uuid, relative) {
  let {collection, documentId, embedded, doc} = _parseUuid(uuid, relative);
  if ( collection instanceof CompendiumCollection ) doc = await collection.getDocument(documentId);
  else doc = doc ?? collection?.get(documentId);
  if ( embedded.length ) doc = _resolveEmbedded(doc, embedded);
  return doc || null;
}

/* -------------------------------------------- */

/**
 * Retrieve a Document by its Universally Unique Identifier (uuid) synchronously. If the uuid resolves to a compendium
 * document, that document's index entry will be returned instead.
 * @param {string} uuid                The uuid of the Document to retrieve.
 * @param {ClientDocument} [relative]  A document to resolve relative UUIDs against.
 * @returns {Document|object|null}     The Document or its index entry if it resides in a Compendium, otherwise null.
 * @throws If the uuid resolves to a Document that cannot be retrieved synchronously.
 */
function fromUuidSync(uuid, relative) {
  let {collection, documentId, embedded, doc} = _parseUuid(uuid, relative);
  if ( (collection instanceof CompendiumCollection) && embedded.length ) {
    throw new Error(
      `fromUuidSync was invoked on UUID '${uuid}' which references an Embedded Document and cannot be retrieved `
      + "synchronously.");
  }

  if ( collection instanceof CompendiumCollection ) {
    doc = doc ?? collection.index.get(documentId);
    if ( doc ) doc.pack = collection.collection;
  } else {
    doc = doc ?? collection?.get(documentId);
    if ( embedded.length ) doc = _resolveEmbedded(doc, embedded);
  }
  return doc || null;
}

/* -------------------------------------------- */

/**
 * @typedef {object} ResolvedUUID
 * @property {DocumentCollection} [collection]  The parent collection.
 * @property {string} [documentId]              The parent document.
 * @property {ClientDocument} [doc]             An already-resolved document.
 * @property {string[]} embedded                Any remaining Embedded Document parts.
 */

/**
 * Parse a UUID into its constituent parts.
 * @param {string} uuid                The UUID to parse.
 * @param {ClientDocument} [relative]  A document to resolve relative UUIDs against.
 * @returns {ResolvedUUID}             Returns the Collection and the Document ID to resolve the parent document, as
 *                                     well as the remaining Embedded Document parts, if any.
 * @private
 */
function _parseUuid(uuid, relative) {
  if ( uuid.startsWith(".") && relative ) return _resolveRelativeUuid(uuid, relative);
  let parts = uuid.split(".");
  let collection;
  let documentId;

  // Compendium Documents
  if ( parts[0] === "Compendium" ) {
    parts.shift();
    const [scope, packName, id] = parts.splice(0, 3);
    collection = game.packs.get(`${scope}.${packName}`);
    documentId = id;
  }

  // World Documents
  else {
    const [documentName, id] = parts.splice(0, 2);
    collection = CONFIG[documentName]?.collection.instance;
    documentId = id;
  }

  return {collection, documentId, embedded: parts};
}

/* -------------------------------------------- */

/**
 * Resolve a series of embedded document UUID parts against a parent Document.
 * @param {Document} parent  The parent Document.
 * @param {string[]} parts   A series of Embedded Document UUID parts.
 * @returns {Document}       The resolved Embedded Document.
 * @private
 */
function _resolveEmbedded(parent, parts) {
  let doc = parent;
  while ( doc && (parts.length > 1) ) {
    const [embeddedName, embeddedId] = parts.splice(0, 2);
    doc = doc.getEmbeddedDocument(embeddedName, embeddedId);
  }
  return doc;
}

/* -------------------------------------------- */

/**
 * Resolve a UUID relative to another document.
 * The general-purpose algorithm for resolving relative UUIDs is as follows:
 * 1. If the number of parts is odd, remove the first part and resolve it against the current document and update the
 *    current document.
 * 2. If the number of parts is even, resolve embedded documents against the current document.
 * @param {string} uuid              The UUID to resolve.
 * @param {ClientDocument} relative  The document to resolve against.
 * @returns {ResolvedUUID}
 * @private
 */
function _resolveRelativeUuid(uuid, relative) {
  uuid = uuid.substring(1);
  const parts = uuid.split(".");

  // A child document. If we don't have a reference to an actual embedded collection, it will not be resolved in
  // _resolveEmbedded.
  if ( parts.length % 2 === 0 ) return {doc: relative, embedded: parts};

  // A sibling document.
  const documentId = parts.shift();
  const collection = (relative.compendium && !relative.isEmbedded) ? relative.compendium : relative.collection;
  return {collection, documentId, embedded: parts};
}

/* -------------------------------------------- */

/**
 * Return a reference to the Document class implementation which is configured for use.
 * @param {string} documentName     The canonical Document name, for example "Actor"
 * @returns {typeof ClientDocument} The configured Document class implementation
 */
function getDocumentClass(documentName) {
  return CONFIG[documentName]?.documentClass;
}

/* -------------------------------------------- */
