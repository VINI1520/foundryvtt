
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
 * @param {string} uuid                      The uuid of the Document to retrieve.
 * @param {object} [options]                 Options to configure how a UUID is resolved.
 * @param {Document} [options.relative]      A Document to resolve relative UUIDs against.
 * @param {boolean} [options.invalid=false]  Allow retrieving an invalid Document.
 * @returns {Promise<Document|null>}         Returns the Document if it could be found, otherwise null.
 */
async function fromUuid(uuid, options={}) {
  /** @deprecated since v11 */
  if ( foundry.utils.getType(options) !== "Object" ) {
    foundry.utils.logCompatibilityWarning("Passing a relative document as the second parameter to fromUuid is "
      + "deprecated. Please pass it within an options object instead.", {since: 11, until: 13});
    options = {relative: options};
  }
  const {relative, invalid=false} = options;
  let {collection, documentId, documentType, embedded, doc} = foundry.utils.parseUuid(uuid, {relative});
  if ( collection instanceof CompendiumCollection ) {
    if ( documentType === "Folder" ) return collection.folders.get(documentId);
    doc = await collection.getDocument(documentId);
  }
  else doc = doc ?? collection?.get(documentId, {invalid});
  if ( embedded.length ) doc = _resolveEmbedded(doc, embedded, {invalid});
  return doc || null;
}

/* -------------------------------------------- */

/**
 * Retrieve a Document by its Universally Unique Identifier (uuid) synchronously. If the uuid resolves to a compendium
 * document, that document's index entry will be returned instead.
 * @param {string} uuid                      The uuid of the Document to retrieve.
 * @param {object} [options]                 Options to configure how a UUID is resolved.
 * @param {Document} [options.relative]      A Document to resolve relative UUIDs against.
 * @param {boolean} [options.invalid=false]  Allow retrieving an invalid Document.
 * @param {boolean} [options.strict=true]    Throw an error if the UUID cannot be resolved synchronously.
 * @returns {Document|object|null}           The Document or its index entry if it resides in a Compendium, otherwise
 *                                           null.
 * @throws If the uuid resolves to a Document that cannot be retrieved synchronously, and the strict option is true.
 */
function fromUuidSync(uuid, options={}) {
  /** @deprecated since v11 */
  if ( foundry.utils.getType(options) !== "Object" ) {
    foundry.utils.logCompatibilityWarning("Passing a relative document as the second parameter to fromUuidSync is "
      + "deprecated. Please pass it within an options object instead.", {since: 11, until: 13});
    options = {relative: options};
  }
  const {relative, invalid=false, strict=true} = options;
  let {collection, documentId, documentType, embedded, doc} = foundry.utils.parseUuid(uuid, {relative});
  if ( (collection instanceof CompendiumCollection) && embedded.length ) {
    if ( !strict ) return null;
    throw new Error(
      `fromUuidSync was invoked on UUID '${uuid}' which references an Embedded Document and cannot be retrieved `
      + "synchronously.");
  }

  if ( collection instanceof CompendiumCollection ) {
    if ( documentType === "Folder" ) return collection.folders.get(documentId);
    doc = doc ?? collection.get(documentId, {invalid}) ?? collection.index.get(documentId);
    if ( doc ) doc.pack = collection.collection;
  } else {
    doc = doc ?? collection?.get(documentId, {invalid});
    if ( embedded.length ) doc = _resolveEmbedded(doc, embedded, {invalid});
  }
  return doc || null;
}

/* -------------------------------------------- */

/**
 * Resolve a series of embedded document UUID parts against a parent Document.
 * @param {Document} parent                  The parent Document.
 * @param {string[]} parts                   A series of Embedded Document UUID parts.
 * @param {object} [options]                 Additional options to configure Embedded Document resolution.
 * @param {boolean} [options.invalid=false]  Allow retrieving an invalid Embedded Document.
 * @returns {Document}                       The resolved Embedded Document.
 * @private
 */
function _resolveEmbedded(parent, parts, {invalid=false}={}) {
  let doc = parent;
  while ( doc && (parts.length > 1) ) {
    const [embeddedName, embeddedId] = parts.splice(0, 2);
    doc = doc.getEmbeddedDocument(embeddedName, embeddedId, {invalid});
  }
  return doc;
}

/* -------------------------------------------- */

/**
 * Return a reference to the Document class implementation which is configured for use.
 * @param {string} documentName     The canonical Document name, for example "Actor"
 * @returns {typeof Document}       The configured Document class implementation
 */
function getDocumentClass(documentName) {
  return CONFIG[documentName]?.documentClass;
}

/* -------------------------------------------- */
