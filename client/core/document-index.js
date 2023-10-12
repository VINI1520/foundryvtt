/**
 * A data structure for quickly retrieving objects by a string prefix.
 * Note that this works well for languages with alphabets (latin, cyrillic, korean, etc.), but may need more nuanced
 * handling for languages that compose characters and letters.
 */
class WordTree {
  /**
   * A leaf entry in the tree.
   * @typedef {object} WordTreeEntry
   * @property {Document|object} entry  An object that this entry represents.
   * @property {string} documentName    The document type.
   * @property {string} uuid            The document's UUID.
   * @property {string} [pack]          The pack ID.
   */

  /**
   * A word tree node consists of zero or more 1-character keys, and a leaves property that contains any objects that
   * terminate at the current string prefix.
   * @typedef {object} WordTreeNode
   * @property {WordTreeEntry[]} leaves  Any leaves at this node.
   */

  /**
   * The tree's root.
   * @type {WordTreeNode}
   * @private
   */
  #root = this.node;

  /* -------------------------------------------- */

  /**
   * Create a new node.
   * @returns {WordTreeNode}
   */
  get node() {
    return {leaves: []};
  }

  /* -------------------------------------------- */

  /**
   * Insert an entry into the tree.
   * @param {string} string        The string key for the entry.
   * @param {WordTreeEntry} entry  The entry to store.
   * @returns {WordTreeNode}       The node the entry was added to.
   */
  addLeaf(string, entry) {
    let node = this.#root;
    string = string.toLocaleLowerCase(game.i18n.lang);
    // Use Array.from here to make sure the string is split up along UTF-8 codepoints rather than individual UTF-16
    // chunks.
    for ( const c of Array.from(string) ) {
      node[c] ??= this.node;
      node = node[c];
    }

    // Once we've traversed the tree, we add our entry.
    node.leaves.push(entry);
    return node;
  }

  /* -------------------------------------------- */

  /**
   * Return entries that match the given string prefix.
   * @param {string} prefix              The prefix.
   * @param {object} [options]           Additional options to configure behaviour.
   * @param {number} [options.limit=10]  The maximum number of items to retrieve. It is important to set this value as
   *                                     very short prefixes will naturally match large numbers of entries.
   * @returns {WordTreeEntry[]}          A number of entries that have the given prefix.
   */
  lookup(prefix, {limit=10}={}) {
    const entries = [];
    const node = this.nodeAtPrefix(prefix);
    if ( !node ) return []; // No matching entries.
    const queue = [node];
    while ( queue.length ) {
      if ( entries.length >= limit ) break;
      this._breadthFirstSearch(queue.shift(), entries, queue, {limit});
    }
    return entries;
  }

  /* -------------------------------------------- */

  /**
   * Returns the node at the given prefix.
   * @param {string} prefix  The prefix.
   * @returns {WordTreeNode}
   */
  nodeAtPrefix(prefix) {
    prefix = prefix.toLocaleLowerCase(game.i18n.lang);
    let node = this.#root;
    for ( const c of Array.from(prefix) ) {
      node = node[c];
      if ( !node ) return;
    }
    return node;
  }

  /* -------------------------------------------- */

  /**
   * Perform a breadth-first search starting from the given node and retrieving any entries along the way, until we
   * reach the limit.
   * @param {WordTreeNode} node          The starting node.
   * @param {WordTreeEntry[]} entries    The accumulated entries.
   * @param {WordTreeNode[]} queue       The working queue of nodes to search.
   * @param {object} [options]           Additional options for the search.
   * @param {number} [options.limit=10]  The maximum number of entries to retrieve before stopping.
   * @protected
   */
  _breadthFirstSearch(node, entries, queue, {limit=10}={}) {
    // Retrieve the entries at this node.
    entries.push(...node.leaves);
    if ( entries.length >= limit ) return;
    // Push this node's children onto the end of the queue.
    for ( const c of Object.keys(node) ) {
      if ( c === "leaves" ) continue;
      queue.push(node[c]);
    }
  }
}

/**
 * This class is responsible for indexing all documents available in the world and storing them in a word tree structure
 * that allows for fast searching.
 */
class DocumentIndex {
  constructor() {
    /**
     * A collection of WordTree structures for each document type.
     * @type {Object<WordTree>}
     */
    Object.defineProperty(this, "trees", {value: {}});

    /**
     * A reverse-lookup of a document's UUID to its parent node in the word tree.
     * @type {Object<WordTreeNode>}
     */
    Object.defineProperty(this, "uuids", {value: {}});
  }

  /**
   * While we are indexing, we store a Promise that resolves when the indexing is complete.
   * @type {Promise<void>|null}
   * @private
   */
  #ready = null;

  /* -------------------------------------------- */

  /**
   * Returns a Promise that resolves when the indexing process is complete.
   * @returns {Promise<void>|null}
   */
  get ready() {
    return this.#ready;
  }

  /* -------------------------------------------- */

  /**
   * Index all available documents in the world and store them in a word tree.
   * @returns {Promise<void>}
   */
  async index() {
    // Conclude any existing indexing.
    await this.#ready;
    const indexedCollections = CONST.DOCUMENT_TYPES.filter(c => CONFIG[c].documentClass.metadata.indexed);
    // TODO: Consider running this process in a web worker.
    const start = performance.now();
    return this.#ready = new Promise(resolve => {
      for ( const documentName of indexedCollections ) {
        this._indexWorldCollection(documentName);
      }

      for ( const pack of game.packs ) {
        if ( !indexedCollections.includes(pack.documentName) ) continue;
        this._indexCompendium(pack);
      }

      resolve();
      console.debug(`${vtt} | Document indexing complete in ${performance.now() - start}ms.`);
    });
  }

  /* -------------------------------------------- */

  /**
   * Return entries that match the given string prefix.
   * @param {string} prefix                     The prefix.
   * @param {object} [options]                  Additional options to configure behaviour.
   * @param {string[]} [options.documentTypes]  Optionally provide an array of document types. Only entries of that type
   *                                            will be searched for.
   * @param {number} [options.limit=10]         The maximum number of items per document type to retrieve. It is
   *                                            important to set this value as very short prefixes will naturally match
   *                                            large numbers of entries.
   * @returns {Object<WordTreeEntry[]>}         A number of entries that have the given prefix, grouped by document
   *                                            type.
   */
  lookup(prefix, {limit=10, documentTypes=[]}={}) {
    const types = documentTypes.length ? documentTypes : Object.keys(this.trees);
    const results = {};
    for ( const type of types ) {
      results[type] = [];
      const tree = this.trees[type];
      if ( !tree ) continue;
      results[type].push(...tree.lookup(prefix, {limit}));
    }
    return results;
  }

  /* -------------------------------------------- */

  /**
   * Add an entry to the index.
   * @param {Document} doc  The document entry.
   */
  addDocument(doc) {
    if ( doc.pack ) {
      if ( doc.isEmbedded ) return; // Only index primary documents inside compendium packs
      const pack = game.packs.get(doc.pack);
      const index = pack.index.get(doc.id);
      if ( index ) this._addLeaf(index, {pack});
    }
    else this._addLeaf(doc);
  }

  /* -------------------------------------------- */

  /**
   * Remove an entry from the index.
   * @param {Document} doc  The document entry.
   */
  removeDocument(doc) {
    const node = this.uuids[doc.uuid];
    if ( !node ) return;
    node.leaves.findSplice(e => e.uuid === doc.uuid);
    delete this.uuids[doc.uuid];
  }

  /* -------------------------------------------- */

  /**
   * Replace an entry in the index with an updated one.
   * @param {Document} doc  The document entry.
   */
  replaceDocument(doc) {
    this.removeDocument(doc);
    this.addDocument(doc);
  }

  /* -------------------------------------------- */

  /**
   * Add a leaf node to the word tree index.
   * @param {Document|object} doc                  The document or compendium index entry to add.
   * @param {object} [options]                     Additional information for indexing.
   * @param {CompendiumCollection} [options.pack]  The compendium that the index belongs to.
   * @protected
   */
  _addLeaf(doc, {pack}={}) {
    const entry = {entry: doc, documentName: doc.documentName, uuid: doc.uuid};
    if ( pack ) foundry.utils.mergeObject(entry, {
      documentName: pack.documentName,
      uuid: `Compendium.${pack.collection}.${doc._id}`,
      pack: pack.collection
    });
    const tree = this.trees[entry.documentName] ??= new WordTree();
    this.uuids[entry.uuid] = tree.addLeaf(doc.name, entry);
  }

  /* -------------------------------------------- */

  /**
   * Aggregate the compendium index and add it to the word tree index.
   * @param {CompendiumCollection} pack  The compendium pack.
   * @protected
   */
  _indexCompendium(pack) {
    for ( const entry of pack.index ) {
      this._addLeaf(entry, {pack});
    }
  }

  /* -------------------------------------------- */

  /**
   * Add all of a parent document's embedded documents to the index.
   * @param {Document} parent  The parent document.
   * @protected
   */
  _indexEmbeddedDocuments(parent) {
    const embedded = parent.constructor.metadata.embedded;
    for ( const embeddedName of Object.keys(embedded) ) {
      if ( !CONFIG[embeddedName].documentClass.metadata.indexed ) continue;
      for ( const doc of parent[embedded[embeddedName]] ) {
        this._addLeaf(doc);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Aggregate all documents and embedded documents in a world collection and add them to the index.
   * @param {string} documentName  The name of the documents to index.
   * @protected
   */
  _indexWorldCollection(documentName) {
    const cls = CONFIG[documentName].documentClass;
    const collection = cls.metadata.collection;
    for ( const doc of game[collection] ) {
      this._addLeaf(doc);
      this._indexEmbeddedDocuments(doc);
    }
  }
}
