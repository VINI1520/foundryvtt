/**
 * A mixin which adds directory functionality to a DocumentCollection, such as folders, tree structures, and sorting.
 * @param {typeof Collection} BaseCollection      The base collection class to extend
 * @returns {typeof DirectoryCollection}          A Collection mixed with DirectoryCollection functionality
 * @category - Mixins
 * @mixin
 */
function DirectoryCollectionMixin(BaseCollection) {

  /**
   * An extension of the Collection class which adds behaviors specific to tree-based collections of entries and folders.
   * @extends {Collection}
   */
  return class DirectoryCollection extends BaseCollection {

    /**
     * Reference the set of Folders which contain documents in this collection
     * @type {Collection<string, Folder>}
     */
    get folders() {
      throw new Error("You must implement the folders getter for this DirectoryCollection");
    }

    /* -------------------------------------------- */

    /**
     * The built tree structure of the DocumentCollection
     * @type {object}
     */
    get tree() {
      if ( !this.#tree ) this.initializeTree();
      return this.#tree;
    }

    /**
     * The built tree structure of the DocumentCollection. Lazy initialized.
     * @type {object}
     */
    #tree;

    /* -------------------------------------------- */

    /**
     * The current search mode for this collection
     * @type {string}
     */
    get searchMode() {
      const searchModes = game.settings.get("core", "collectionSearchModes");
      return searchModes[this.collection ?? this.name] || CONST.DIRECTORY_SEARCH_MODES.NAME;
    }

    /**
     * Toggle the search mode for this collection between "name" and "full" text search
     */
    toggleSearchMode() {
      const name = this.collection ?? this.name;
      const searchModes = game.settings.get("core", "collectionSearchModes");
      searchModes[name] = searchModes[name] === CONST.DIRECTORY_SEARCH_MODES.FULL
        ? CONST.DIRECTORY_SEARCH_MODES.NAME
        : CONST.DIRECTORY_SEARCH_MODES.FULL;
      game.settings.set("core", "collectionSearchModes", searchModes);
    }

    /* -------------------------------------------- */

    /**
     * The current sort mode used to order the top level entries in this collection
     * @type {string}
     */
    get sortingMode() {
      const sortingModes = game.settings.get("core", "collectionSortingModes");
      return sortingModes[this.collection ?? this.name] || "a";
    }

    /**
     * Toggle the sorting mode for this collection between "a" (Alphabetical) and "m" (Manual by sort property)
     */
    toggleSortingMode() {
      const name = this.collection ?? this.name;
      const sortingModes = game.settings.get("core", "collectionSortingModes");
      const updatedSortingMode = sortingModes[name] === "a" ? "m" : "a";
      sortingModes[name] = updatedSortingMode;
      game.settings.set("core", "collectionSortingModes", sortingModes);
      this.initializeTree();
    }

    /* -------------------------------------------- */

    /**
     * The maximum depth of folder nesting which is allowed in this collection
     * @returns {number}
     */
    get maxFolderDepth() {
      return CONST.FOLDER_MAX_DEPTH;
    }

    /* -------------------------------------------- */

    /**
     * Return a reference to list of entries which are visible to the User in this tree
     * @returns {Array<*>}
     * @private
     */
    _getVisibleTreeContents() {
      return this.contents;
    }

    /* -------------------------------------------- */

    /**
     * Initialize the tree by categorizing folders and entries into a hierarchical tree structure.
     */
    initializeTree() {
      const folders = this.folders.contents;
      const entries = this._getVisibleTreeContents();
      this.#tree = this.#buildTree(folders, entries);
    }

    /* -------------------------------------------- */

    /**
     * Given a list of Folders and a list of Entries, set up the Folder tree
     * @param {Folder[]} folders        The Array of Folder objects to organize
     * @param {Object[]} entries        The Array of Entries objects to organize
     * @returns {object}                A tree structure containing the folders and entries
     */
    #buildTree(folders, entries) {
      const handled = new Set();
      const createNode = (root, folder, depth) => {
        return {root, folder, depth, visible: false, children: [], entries: []};
      };

      // Create the tree structure
      const tree = createNode(true, null, 0);
      const depths = [[tree]];

      // Iterate by folder depth, populating content
      for ( let depth = 1; depth <= this.maxFolderDepth + 1; depth++ ) {
        const allowChildren = depth <= this.maxFolderDepth;
        depths[depth] = [];
        const nodes = depths[depth - 1];
        if ( !nodes.length ) break;
        for ( const node of nodes ) {
          const folder = node.folder;
          if ( !node.root ) { // Ensure we don't encounter any infinite loop
            if ( handled.has(folder.id) ) continue;
            handled.add(folder.id);
          }

          // Classify content for this folder
          const classified = this.#classifyFolderContent(folder, folders, entries, {allowChildren});
          node.entries = classified.entries;
          node.children = classified.folders.map(folder => createNode(false, folder, depth));
          depths[depth].push(...node.children);

          // Update unassigned content
          folders = classified.unassignedFolders;
          entries = classified.unassignedEntries;
        }
      }

      // Populate left-over folders at the root level of the tree
      for ( const folder of folders ) {
        const node = createNode(false, folder, 1);
        const classified = this.#classifyFolderContent(folder, folders, entries, {allowChildren: false});
        node.entries = classified.entries;
        entries = classified.unassignedEntries;
        depths[1].push(node);
      }

      // Populate left-over entries at the root level of the tree
      if ( entries.length ) {
        tree.entries.push(...entries);
      }

      // Sort the top level entries and folders
      const sort = this.sortingMode === "a" ? this.constructor._sortAlphabetical : this.constructor._sortStandard;
      tree.entries.sort(sort);
      tree.children.sort((a, b) => sort(a.folder, b.folder));

      // Recursively filter visibility of the tree
      const filterChildren = node => {
        node.children = node.children.filter(child => {
          filterChildren(child);
          return child.visible;
        });
        node.visible = node.root || game.user.isGM || ((node.children.length + node.entries.length) > 0);

        // Populate some attributes of the Folder document
        if ( node.folder ) {
          node.folder.displayed = node.visible;
          node.folder.depth = node.depth;
          node.folder.children = node.children;
        }
      };
      filterChildren(tree);
      return tree;
    }

    /* -------------------------------------------- */

    /**
     * Creates the list of Folder options in this Collection in hierarchical order
     * for populating the options of a select tag.
     * @returns {{id: string, name: string}[]}
     * @internal
     */
    _formatFolderSelectOptions() {
      const options = [];
      const traverse = node => {
        if ( !node ) return;
        const folder = node.folder;
        if ( folder?.visible ) options.push({
          id: folder.id,
          name: `${"─".repeat(folder.depth - 1)} ${folder.name}`.trim()
        });
        node.children.forEach(traverse);
      };
      traverse(this.tree);
      return options;
    }

    /* -------------------------------------------- */

    /**
     * Populate a single folder with child folders and content
     * This method is called recursively when building the folder tree
     * @param {Folder|null} folder                    A parent folder being populated or null for the root node
     * @param {Folder[]} folders                      Remaining unassigned folders which may be children of this one
     * @param {Object[]} entries                      Remaining unassigned entries which may be children of this one
     * @param {object} [options={}]                   Options which configure population
     * @param {boolean} [options.allowChildren=true]  Allow additional child folders
     */
    #classifyFolderContent(folder, folders, entries, {allowChildren = true} = {}) {
      const sort = folder?.sorting === "a" ? this.constructor._sortAlphabetical : this.constructor._sortStandard;

      // Determine whether an entry belongs to a folder, via folder ID or folder reference
      function folderMatches(entry) {
        if ( entry.folder?._id ) return entry.folder._id === folder?._id;
        return (entry.folder === folder) || (entry.folder === folder?._id);
      }

      // Partition folders into children and unassigned folders
      const [unassignedFolders, subfolders] = folders.partition(f => allowChildren && folderMatches(f));
      subfolders.sort(sort);

      // Partition entries into folder contents and unassigned entries
      const [unassignedEntries, contents] = entries.partition(e => folderMatches(e));
      contents.sort(sort);

      // Return the classified content
      return {folders: subfolders, entries: contents, unassignedFolders, unassignedEntries};
    }

    /* -------------------------------------------- */

    /**
     * Sort two Entries by name, alphabetically.
     * @param {Object} a    Some Entry
     * @param {Object} b    Some other Entry
     * @returns {number}    The sort order between entries a and b
     * @protected
     */
    static _sortAlphabetical(a, b) {
      if ( a.name === undefined ) throw new Error(`Missing name property for ${a.constructor.name} ${a.id}`);
      if ( b.name === undefined ) throw new Error(`Missing name property for ${b.constructor.name} ${b.id}`);
      return a.name.localeCompare(b.name);
    }

    /* -------------------------------------------- */

    /**
     * Sort two Entries using their numeric sort fields.
     * @param {Object} a    Some Entry
     * @param {Object} b    Some other Entry
     * @returns {number}    The sort order between Entries a and b
     * @protected
     */
    static _sortStandard(a, b) {
      if ( a.sort === undefined ) throw new Error(`Missing sort property for ${a.constructor.name} ${a.id}`);
      if ( b.sort === undefined ) throw new Error(`Missing sort property for ${b.constructor.name} ${b.id}`);
      return a.sort - b.sort;
    }
  }
}
