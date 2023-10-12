/**
 * @typedef {Object} DirectoryMixinEntry
 * @property {string} id                The unique id of the entry
 * @property {Folder|string} folder     The folder id or folder object to which this entry belongs
 * @property {string} [img]             An image path to display for the entry
 * @property {string} [sort]            A numeric sort value which orders this entry relative to others
 * @interface
 */

/**
 * Augment an Application instance with functionality that supports rendering as a directory of foldered entries.
 * @param {typeof Application} Base           The base Application class definition
 * @returns {typeof DirectoryApplication}     The decorated DirectoryApplication class definition
 */
function DirectoryApplicationMixin(Base) {
  return class DirectoryApplication extends Base {

    /**
     * The path to the template partial which renders a single Entry within this directory
     * @type {string}
     */
    static entryPartial = "templates/sidebar/partials/entry-partial.html";

    /**
     * The path to the template partial which renders a single Folder within this directory
     * @type {string}
     */
    static folderPartial = "templates/sidebar/folder-partial.html";

    /* -------------------------------------------- */

    /**
     * @inheritdoc
     * @returns {DocumentDirectoryOptions}
     */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        renderUpdateKeys: ["name", "sort", "sorting", "folder"],
        height: "auto",
        scrollY: ["ol.directory-list"],
        dragDrop: [{dragSelector: ".directory-item", dropSelector: ".directory-list"}],
        filters: [{inputSelector: 'input[name="search"]', contentSelector: ".directory-list"}],
        contextMenuSelector: ".directory-item.document",
        entryClickSelector: ".entry-name"
      });
    }

    /* -------------------------------------------- */

    /**
     * The type of Entry that is contained in this DirectoryTab.
     * @type {string}
     */
    get entryType() {
      throw new Error("You must implement the entryType getter for this DirectoryTab");
    }

    /* -------------------------------------------- */

    /**
     * The maximum depth of folder nesting which is allowed in this DirectoryTab
     * @returns {number}
     */
    get maxFolderDepth() {
      return this.collection.maxFolderDepth;
    }

    /* -------------------------------------------- */

    /**
     * Can the current User create new Entries in this DirectoryTab?
     * @returns {boolean}
     */
    get canCreateEntry() {
      return game.user.isGM;
    }

    /* -------------------------------------------- */

    /**
     * Can the current User create new Folders in this DirectoryTab?
     * @returns {boolean}
     */
    get canCreateFolder() {
      return this.canCreateEntry;
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    _onSearchFilter(event, query, rgx, html) {
      const isSearch = !!query;
      let entryIds = new Set();
      const folderIds = new Set();
      const autoExpandFolderIds = new Set();

      // Match entries and folders
      if ( isSearch ) {

        // Include folders and their parents, auto-expanding parent folders
        const includeFolder = (folder, autoExpand = true) => {
          if ( !folder ) return;
          if ( typeof folder === "string" ) folder = this.collection.folders.get(folder);
          if ( !folder ) return;
          const folderId = folder._id;
          if ( folderIds.has(folderId) ) {
            // If this folder is not already auto-expanding, but it should be, add it to the set
            if ( autoExpand && !autoExpandFolderIds.has(folderId) ) autoExpandFolderIds.add(folderId);
            return;
          }
          folderIds.add(folderId);
          if ( autoExpand ) autoExpandFolderIds.add(folderId);
          if ( folder.folder ) includeFolder(folder.folder);
        };

        // First match folders
        this._matchSearchFolders(rgx, includeFolder);

        // Next match entries
        this._matchSearchEntries(rgx, entryIds, folderIds, includeFolder);
      }

      // Toggle each directory item
      for ( let el of html.querySelectorAll(".directory-item") ) {
        if ( el.classList.contains("hidden") ) continue;
        if ( el.classList.contains("folder") ) {
          let match = isSearch && folderIds.has(el.dataset.folderId);
          el.style.display = (!isSearch || match) ? "flex" : "none";
          if ( autoExpandFolderIds.has(el.dataset.folderId) ) {
            if ( isSearch && match ) el.classList.remove("collapsed");
          }
          else el.classList.toggle("collapsed", !game.folders._expanded[el.dataset.uuid]);
        }
        else el.style.display = (!isSearch || entryIds.has(el.dataset.entryId)) ? "flex" : "none";
      }
    }

    /* -------------------------------------------- */

    /**
     * Identify folders in the collection which match a provided search query.
     * This method is factored out to be extended by subclasses, for example to support compendium indices.
     * @param {RegExp} query              The search query
     * @param {Function} includeFolder    A callback function to include the folder of any matched entry
     * @protected
     */
    _matchSearchFolders(query, includeFolder) {
      for ( const folder of this.collection.folders ) {
        if ( query.test(SearchFilter.cleanQuery(folder.name)) ) {
          includeFolder(folder, false);
        }
      }
    }

    /* -------------------------------------------- */

    /**
     * Identify entries in the collection which match a provided search query.
     * This method is factored out to be extended by subclasses, for example to support compendium indices.
     * @param {RegExp} query              The search query
     * @param {Set<string>} entryIds      The set of matched Entry IDs
     * @param {Set<string>} folderIds     The set of matched Folder IDs
     * @param {Function} includeFolder    A callback function to include the folder of any matched entry
     * @protected
     */
    _matchSearchEntries(query, entryIds, folderIds, includeFolder) {
      const nameOnlySearch = (this.collection.searchMode === CONST.DIRECTORY_SEARCH_MODES.NAME);
      const entries = this.collection.index ?? this.collection.contents;

      // Copy the folderIds to a new set so we can add to the original set without incorrectly adding child entries
      const matchedFolderIds = new Set(folderIds);

      for ( const entry of entries ) {
        const entryId = this._getEntryId(entry);

        // If we matched a folder, add its children entries
        if ( matchedFolderIds.has(entry.folder?._id ?? entry.folder) ) entryIds.add(entryId);

        // Otherwise, if we are searching by name, match the entry name
        else if ( nameOnlySearch && query.test(SearchFilter.cleanQuery(this._getEntryName(entry))) ) {
          entryIds.add(entryId);
          includeFolder(entry.folder);
        }

      }
      if ( nameOnlySearch ) return;

      // Full Text Search
      const matches = this.collection.search({query: query.source, exclude: Array.from(entryIds)});
      for ( const match of matches ) {
        if ( entryIds.has(match._id) ) continue;
        entryIds.add(match._id);
        includeFolder(match.folder);
      }
    }

    /* -------------------------------------------- */

    /**
     * Get the name to search against for a given entry
     * @param {Document|object} entry     The entry to get the name for
     * @returns {string}                  The name of the entry
     * @protected
     */
    _getEntryName(entry) {
      return entry.name;
    }

    /* -------------------------------------------- */

    /**
     * Get the ID for a given entry
     * @param {Document|object} entry     The entry to get the id for
     * @returns {string}                  The id of the entry
     * @protected
     */
    _getEntryId(entry) {
      return entry._id;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async getData(options) {
      const data = await super.getData(options);
      return foundry.utils.mergeObject(data, {
        tree: this.collection.tree,
        entryPartial: this.#getEntryPartial(),
        folderPartial: this.constructor.folderPartial,
        canCreateEntry: this.canCreateEntry,
        canCreateFolder: this.canCreateFolder,
        sortIcon: this.collection.sortingMode === "a" ? "fa-arrow-down-a-z" : "fa-arrow-down-short-wide",
        sortTooltip: this.collection.sortingMode === "a" ? "SIDEBAR.SortModeAlpha" : "SIDEBAR.SortModeManual",
        searchIcon: this.collection.searchMode === CONST.DIRECTORY_SEARCH_MODES.NAME ? "fa-search" :
          "fa-file-magnifying-glass",
        searchTooltip: this.collection.searchMode === CONST.DIRECTORY_SEARCH_MODES.NAME ? "SIDEBAR.SearchModeName" :
          "SIDEBAR.SearchModeFull"
      });
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _render(force, options) {
      await loadTemplates([this.#getEntryPartial(), this.constructor.folderPartial]);
      return super._render(force, options);
    }

    /* -------------------------------------------- */

    /**
     * Retrieve the entry partial.
     * @returns {string}
     */
    #getEntryPartial() {
      /**
       * @deprecated since v11
       */
      if ( this.constructor.documentPartial ) {
        foundry.utils.logCompatibilityWarning("Your sidebar application defines the documentPartial static property"
          + " which is deprecated. Please use entryPartial instead.", {since: 11, until: 13});
        return this.constructor.documentPartial;
      }
      return this.constructor.entryPartial;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    activateListeners(html) {
      super.activateListeners(html);
      const directory = html.find(".directory-list");
      const entries = directory.find(".directory-item");

      // Handle folder depth and collapsing
      html.find(`[data-folder-depth="${this.maxFolderDepth}"] .create-folder`).remove();
      html.find(".toggle-sort").click(this.#onToggleSort.bind(this));
      html.find(".toggle-search-mode").click(this.#onToggleSearchMode.bind(this));
      html.find(".collapse-all").click(this.collapseAll.bind(this));

      // Intersection Observer
      const observer = new IntersectionObserver(this._onLazyLoadImage.bind(this), { root: directory[0] });
      entries.each((i, li) => observer.observe(li));

      // Entry-level events
      directory.on("click", this.options.entryClickSelector, this._onClickEntryName.bind(this));
      directory.on("click", ".folder-header", this._toggleFolder.bind(this));
      const dh = this._onDragHighlight.bind(this);
      html.find(".folder").on("dragenter", dh).on("dragleave", dh);
      this._contextMenu(html);

      // Allow folder and entry creation
      if ( this.canCreateFolder ) html.find(".create-folder").click(this._onCreateFolder.bind(this));
      if ( this.canCreateEntry ) html.find(".create-entry").click(this._onCreateEntry.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Swap the sort mode between "a" (Alphabetical) and "m" (Manual by sort property)
     * @param {PointerEvent} event    The originating pointer event
     */
    #onToggleSort(event) {
      event.preventDefault();
      this.collection.toggleSortingMode();
      this.render();
    }

    /* -------------------------------------------- */

    /**
     * Swap the search mode between "name" and "full"
     * @param {PointerEvent} event    The originating pointer event
     */
    #onToggleSearchMode(event) {
      event.preventDefault();
      this.collection.toggleSearchMode();
      this.render();
    }

    /* -------------------------------------------- */

    /**
     * Collapse all subfolders in this directory
     */
    collapseAll() {
      this.element.find("li.folder").addClass("collapsed");
      for ( let f of this.collection.folders ) {
        game.folders._expanded[f.uuid] = false;
      }
      if ( this.popOut ) this.setPosition();
    }

    /* -------------------------------------------- */

    /**
     * Create a new Folder in this SidebarDirectory
     * @param {PointerEvent} event    The originating button click event
     * @protected
     */
    _onCreateFolder(event) {
      event.preventDefault();
      event.stopPropagation();
      const button = event.currentTarget;
      const li = button.closest(".directory-item");
      const data = {folder: li?.dataset?.folderId || null, type: this.entryType};
      const options = {top: button.offsetTop, left: window.innerWidth - 310 - FolderConfig.defaultOptions.width};
      if ( this.collection instanceof CompendiumCollection ) options.pack = this.collection.collection;
      Folder.createDialog(data, options);
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling the collapsed or expanded state of a folder within the directory tab
     * @param {PointerEvent} event    The originating click event
     * @protected
     */
    _toggleFolder(event) {
      let folder = $(event.currentTarget.parentElement);
      let collapsed = folder.hasClass("collapsed");
      const folderUuid = folder[0].dataset.uuid;
      game.folders._expanded[folderUuid] = collapsed;

      // Expand
      if ( collapsed ) folder.removeClass("collapsed");

      // Collapse
      else {
        folder.addClass("collapsed");
        const subs = folder.find(".folder").addClass("collapsed");
        subs.each((i, f) => game.folders._expanded[folderUuid] = false);
      }

      // Resize container
      if ( this.popOut ) this.setPosition();
    }

    /* -------------------------------------------- */

    /**
     * Handle clicking on a Document name in the Sidebar directory
     * @param {PointerEvent} event   The originating click event
     * @protected
     */
    async _onClickEntryName(event) {
      event.preventDefault();
      const element = event.currentTarget;
      const entryId = element.parentElement.dataset.entryId;
      const entry = this.collection.get(entryId);
      entry.sheet.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle new Entry creation request
     * @param {PointerEvent} event    The originating button click event
     * @protected
     */
    async _onCreateEntry(event) {
      throw new Error("You must implement the _onCreateEntry method");
    }

    /* -------------------------------------------- */

    /** @override */
    _onDragStart(event) {
      if ( ui.context ) ui.context.close({animate: false});
      const li = event.currentTarget.closest(".directory-item");
      const isFolder = li.classList.contains("folder");
      const dragData = isFolder
        ? this._getFolderDragData(li.dataset.folderId)
        : this._getEntryDragData(li.dataset.entryId);
      if ( !dragData ) return;
      event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }

    /* -------------------------------------------- */

    /**
     * Get the data transfer object for a Entry being dragged from this SidebarDirectory
     * @param {string} entryId     The Entry's _id being dragged
     * @returns {Object}
     * @private
     */
    _getEntryDragData(entryId) {
      const entry = this.collection.get(entryId);
      return entry?.toDragData();
    }

    /* -------------------------------------------- */

    /**
     * Get the data transfer object for a Folder being dragged from this SidebarDirectory
     * @param {string} folderId       The Folder _id being dragged
     * @returns {Object}
     * @private
     */
    _getFolderDragData(folderId) {
      const folder = this.collection.folders.get(folderId);
      if ( !folder ) return null;
      return {
        type: "Folder",
        uuid: folder.uuid
      };
    }

    /* -------------------------------------------- */

    /** @override */
    _canDragStart(selector) {
      return true;
    }

    /* -------------------------------------------- */

    /**
     * Highlight folders as drop targets when a drag event enters or exits their area
     * @param {DragEvent} event     The DragEvent which is in progress
     */
    _onDragHighlight(event) {
      const li = event.currentTarget;
      if ( !li.classList.contains("folder") ) return;
      event.stopPropagation();  // Don't bubble to parent folders

      // Remove existing drop targets
      if ( event.type === "dragenter" ) {
        for ( let t of li.closest(".directory-list").querySelectorAll(".droptarget") ) {
          t.classList.remove("droptarget");
        }
      }

      // Remove current drop target
      if ( event.type === "dragleave" ) {
        const el = document.elementFromPoint(event.clientX, event.clientY);
        const parent = el.closest(".folder");
        if ( parent === li ) return;
      }

      // Add new drop target
      li.classList.toggle("droptarget", event.type === "dragenter");
    }

    /* -------------------------------------------- */

    /** @override */
    _onDrop(event) {
      const data = TextEditor.getDragEventData(event);
      if ( !data.type ) return;
      const target = event.target.closest(".directory-item") || null;
      switch ( data.type ) {
        case "Folder":
          return this._handleDroppedFolder(target, data);
        case this.entryType:
          return this._handleDroppedEntry(target, data);
      }
    }

    /* -------------------------------------------- */

    /**
     * Handle Folder data being dropped into the directory.
     * @param {HTMLElement} target    The target element
     * @param {object} data           The data being dropped
     * @protected
     */
    async _handleDroppedFolder(target, data) {

      // Determine the closest Folder
      const closestFolder = target ? target.closest(".folder") : null;
      if ( closestFolder ) closestFolder.classList.remove("droptarget");
      const closestFolderId = closestFolder ? closestFolder.dataset.folderId : null;

      // Obtain the dropped Folder
      let folder = await fromUuid(data.uuid);
      if ( !folder ) return;
      if ( folder?.type !== this.entryType ) {
        ui.notifications.warn(game.i18n.format("FOLDER.InvalidDocumentType", {type: this.collection.documentName}));
        return;
      }

      // Sort into another Folder
      const sortData = {sortKey: "sort", sortBefore: true};
      const isRelative = target && target.dataset.folderId;
      if ( isRelative ) {
        const targetFolder = await fromUuid(target.dataset.uuid);

        // Sort relative to a collapsed Folder
        if ( target.classList.contains("collapsed") ) {
          sortData.target = targetFolder;
          sortData.parentId = targetFolder.folder?.id;
          sortData.parentUuid = targetFolder.folder?.uuid;
        }

        // Drop into an expanded Folder
        else {
          sortData.target = null;
          sortData.parentId = targetFolder.id;
          sortData.parentUuid = targetFolder.uuid;
        }
      }

      // Sort relative to existing Folder contents
      else {
        sortData.parentId = closestFolderId;
        sortData.parentUuid = closestFolder?.dataset?.uuid;
        sortData.target = closestFolder && closestFolder.classList.contains("collapsed") ? closestFolder : null;
      }

      if ( sortData.parentId ) {
        const parentFolder = await fromUuid(sortData.parentUuid);
        if ( parentFolder === folder ) return; // Prevent assigning a folder as its own parent.
        if ( parentFolder.ancestors.includes(folder) ) return; // Prevent creating a cycle.
        // Prevent going beyond max depth
        const maxDepth = f => Math.max(f.depth, ...f.children.filter(n => n.folder).map(n => maxDepth(n.folder)));
        if ( (parentFolder.depth + (maxDepth(folder) - folder.depth + 1)) > this.maxFolderDepth ) {
          ui.notifications.error(game.i18n.format("FOLDER.ExceededMaxDepth", {depth: this.maxFolderDepth}), {console: false});
          return;
        }
      }

      // Determine siblings
      sortData.siblings = this.collection.folders.filter(f => {
        return (f.folder?.id === sortData.parentId) && (f.type === folder.type) && (f !== folder);
      });

      // Handle dropping of some folder that is foreign to this collection
      if ( this.collection.folders.get(folder.id) !== folder ) {
        const dropped = await this._handleDroppedForeignFolder(folder, closestFolderId, sortData);
        if ( !dropped || !dropped.sortNeeded ) return;
        folder = dropped.folder;
      }

      // Resort the collection
      sortData.updateData = { folder: sortData.parentId };
      return folder.sortRelative(sortData);
    }

    /* -------------------------------------------- */

    /**
     * Handle a new Folder being dropped into the directory.
     * This case is not handled by default, but subclasses may implement custom handling here.
     * @param {Folder} folder               The Folder being dropped
     * @param {string} closestFolderId      The closest Folder _id to the drop target
     * @param {object} sortData             The sort data for the Folder
     * @param {string} sortData.sortKey     The sort key to use for sorting
     * @param {boolean} sortData.sortBefore Sort before the target?
     * @returns {Promise<{folder: Folder, sortNeeded: boolean}|null>} The handled folder creation, or null
     * @protected
     */
    async _handleDroppedForeignFolder(folder, closestFolderId, sortData) {
      return null;
    }

    /* -------------------------------------------- */

    /**
     * Handle Entry data being dropped into the directory.
     * @param {HTMLElement} target    The target element
     * @param {object} data           The data being dropped
     * @protected
     */
    async _handleDroppedEntry(target, data) {
      // Determine the closest Folder
      const closestFolder = target ? target.closest(".folder") : null;
      if ( closestFolder ) closestFolder.classList.remove("droptarget");
      let folder = closestFolder ? await fromUuid(closestFolder.dataset.uuid) : null;

      let entry = await this._getDroppedEntryFromData(data);
      if ( !entry ) return;

      // Sort relative to another Document
      const collection = this.collection.index ?? this.collection;
      const sortData = {sortKey: "sort"};
      const isRelative = target && target.dataset.entryId;
      if ( isRelative ) {
        if ( entry.id === target.dataset.entryId ) return; // Don't drop on yourself
        const targetDocument = collection.get(target.dataset.entryId);
        sortData.target = targetDocument;
        folder = targetDocument?.folder;
      }

      // Sort within to the closest Folder
      else sortData.target = null;

      // Determine siblings
      if ( folder instanceof foundry.abstract.Document ) folder = folder.id;
      sortData.siblings = collection.filter(d => !this._entryIsSelf(d, entry) && this._entryBelongsToFolder(d, folder));

      if ( !this._entryAlreadyExists(entry) ) {
        // Try to predetermine the sort order
        const sorted = SortingHelpers.performIntegerSort(entry, sortData);
        if ( sorted.length === 1 ) entry = entry.clone({sort: sorted[0].update[sortData.sortKey]}, {keepId: true});
        entry = await this._createDroppedEntry(entry, folder);

        // No need to resort other documents if the document was created with a specific sort order
        if ( sorted.length === 1 ) return;
      }

      // Resort the collection
      sortData.updateData = {folder: folder || null};
      return this._sortRelative(entry, sortData);
    }

    /* -------------------------------------------- */

    /**
     * Determine if an Entry is being compared to itself
     * @param {DirectoryMixinEntry} entry          The Entry
     * @param {DirectoryMixinEntry} otherEntry     The other Entry
     * @returns {boolean}                          Is the Entry being compared to itself?
     * @protected
     */
    _entryIsSelf(entry, otherEntry) {
      return entry._id === otherEntry._id;
    }

    /* -------------------------------------------- */

    /**
     * Determine whether an Entry belongs to the target folder
     * @param {DirectoryMixinEntry} entry   The Entry
     * @param {Folder} folder               The target folder
     * @returns {boolean}                   Is the Entry a sibling?
     * @protected
     */
    _entryBelongsToFolder(entry, folder) {
      if ( !entry.folder && !folder ) return true;
      if ( entry.folder instanceof foundry.abstract.Document ) return entry.folder.id === folder;
      return entry.folder === folder;
    }

    /* -------------------------------------------- */

    /**
     * Check if an Entry is already present in the Collection
     * @param {DirectoryMixinEntry} entry     The Entry being dropped
     * @returns {boolean}                     Is the Entry already present?
     * @private
     */
    _entryAlreadyExists(entry) {
      return this.collection.get(entry.id) === entry;
    }

    /* -------------------------------------------- */

    /**
     * Get the dropped Entry from the drop data
     * @param {object} data                      The data being dropped
     * @returns {Promise<DirectoryMixinEntry>}   The dropped Entry
     * @protected
     */
    async _getDroppedEntryFromData(data) {
      throw new Error("The _getDroppedEntryFromData method must be implemented");
    }

    /* -------------------------------------------- */

    /**
     * Create a dropped Entry in this Collection
     * @param {DirectoryMixinEntry} entry       The Entry being dropped
     * @param {string} [folderId]               The ID of the Folder to which the Entry should be added
     * @returns {Promise<DirectoryMixinEntry>}  The created Entry
     * @protected
     */
    async _createDroppedEntry(entry, folderId) {
      throw new Error("The _createDroppedEntry method must be implemented");
    }

    /* -------------------------------------------- */

    /**
     * Sort a relative entry within a collection
     * @param {DirectoryMixinEntry} entry   The entry to sort
     * @param {object} sortData             The sort data
     * @param {string} sortData.sortKey     The sort key to use for sorting
     * @param {boolean} sortData.sortBefore Sort before the target?
     * @param {object} sortData.updateData  Additional data to update on the entry
     * return {Promise<object>}             The sorted entry
     */
    async _sortRelative(entry, sortData) {
      throw new Error("The _sortRelative method must be implemented");
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    _contextMenu(html) {
      /**
       * A hook event that fires when the context menu for folders in this DocumentDirectory is constructed.
       * Substitute the class name in the hook event, for example "getActorDirectoryFolderContext".
       * @function getSidebarTabFolderContext
       * @memberof hookEvents
       * @param {jQuery} html                     The HTML element to which the context options are attached
       * @param {ContextMenuEntry[]} entryOptions The context menu entries
       */
      ContextMenu.create(this, html, ".folder .folder-header", this._getFolderContextOptions(), {
        hookName: "FolderContext"
      });
      ContextMenu.create(this, html, this.options.contextMenuSelector, this._getEntryContextOptions());
    }

    /* -------------------------------------------- */

    /**
     * Get the set of ContextMenu options which should be used for Folders in a SidebarDirectory
     * @returns {object[]}   The Array of context options passed to the ContextMenu instance
     * @protected
     */
    _getFolderContextOptions() {
      return [
        {
          name: "FOLDER.Edit",
          icon: '<i class="fas fa-edit"></i>',
          condition: game.user.isGM,
          callback: async header => {
            const li = header.closest(".directory-item")[0];
            const folder = await fromUuid(li.dataset.uuid);
            const r = li.getBoundingClientRect();
            const options = {top: r.top, left: r.left - FolderConfig.defaultOptions.width - 10};
            new FolderConfig(folder, options).render(true);
          }
        },
        {
          name: "FOLDER.CreateTable",
          icon: `<i class="${CONFIG.RollTable.sidebarIcon}"></i>`,
          condition: header => {
            const li = header.closest(".directory-item")[0];
            const folder = fromUuidSync(li.dataset.uuid);
            return CONST.COMPENDIUM_DOCUMENT_TYPES.includes(folder.type);
          },
          callback: async header => {
            const li = header.closest(".directory-item")[0];
            const folder = await fromUuid(li.dataset.uuid);
            return Dialog.confirm({
              title: `${game.i18n.localize("FOLDER.CreateTable")}: ${folder.name}`,
              content: game.i18n.localize("FOLDER.CreateTableConfirm"),
              yes: () => RollTable.fromFolder(folder),
              options: {
                top: Math.min(li.offsetTop, window.innerHeight - 350),
                left: window.innerWidth - 680,
                width: 360
              }
            });
          }
        },
        {
          name: "FOLDER.Remove",
          icon: '<i class="fas fa-trash"></i>',
          condition: game.user.isGM,
          callback: async header => {
            const li = header.closest(".directory-item")[0];
            const folder = await fromUuid(li.dataset.uuid);
            return Dialog.confirm({
              title: `${game.i18n.localize("FOLDER.Remove")} ${folder.name}`,
              content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("FOLDER.RemoveWarning")}</p>`,
              yes: () => folder.delete({deleteSubfolders: false, deleteContents: false}),
              options: {
                top: Math.min(li.offsetTop, window.innerHeight - 350),
                left: window.innerWidth - 720,
                width: 400
              }
            });
          }
        },
        {
          name: "FOLDER.Delete",
          icon: '<i class="fas fa-dumpster"></i>',
          condition: game.user.isGM,
          callback: async header => {
            const li = header.closest(".directory-item")[0];
            const folder = await fromUuid(li.dataset.uuid);
            return Dialog.confirm({
              title: `${game.i18n.localize("FOLDER.Delete")} ${folder.name}`,
              content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("FOLDER.DeleteWarning")}</p>`,
              yes: () => folder.delete({deleteSubfolders: true, deleteContents: true}),
              options: {
                top: Math.min(li.offsetTop, window.innerHeight - 350),
                left: window.innerWidth - 720,
                width: 400
              }
            });
          }
        }
      ];
    }

    /* -------------------------------------------- */

    /**
     * Get the set of ContextMenu options which should be used for Entries in a SidebarDirectory
     * @returns {object[]}   The Array of context options passed to the ContextMenu instance
     * @protected
     */
    _getEntryContextOptions() {
      return [
        {
          name: "FOLDER.Clear",
          icon: '<i class="fas fa-folder"></i>',
          condition: header => {
            const li = header.closest(".directory-item");
            const entry = this.collection.get(li.data("entryId"));
            return game.user.isGM && !!entry.folder;
          },
          callback: header => {
            const li = header.closest(".directory-item");
            const entry = this.collection.get(li.data("entryId"));
            entry.update({folder: null});
          }
        },
        {
          name: "SIDEBAR.Delete",
          icon: '<i class="fas fa-trash"></i>',
          condition: () => game.user.isGM,
          callback: header => {
            const li = header.closest(".directory-item");
            const entry = this.collection.get(li.data("entryId"));
            if ( !entry ) return;
            return entry.deleteDialog({
              top: Math.min(li[0].offsetTop, window.innerHeight - 350),
              left: window.innerWidth - 720
            });
          }
        },
        {
          name: "SIDEBAR.Duplicate",
          icon: '<i class="far fa-copy"></i>',
          condition: () => game.user.isGM || this.collection.documentClass.canUserCreate(game.user),
          callback: header => {
            const li = header.closest(".directory-item");
            const original = this.collection.get(li.data("entryId"));
            return original.clone({name: `${original._source.name} (Copy)`}, {save: true});
          }
        }
      ];
    }
  };
}
