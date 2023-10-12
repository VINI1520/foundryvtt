/**
 * The client-side Folder document which extends the common BaseFolder model.
 * @extends documents.BaseFolder
 * @mixes ClientDocumentMixin
 *
 * @see {@link Folders}                     The world-level collection of Folder documents
 * @see {@link FolderConfig}                The Folder configuration application
 */
class Folder extends ClientDocumentMixin(foundry.documents.BaseFolder) {

  /**
   * The depth of this folder in its sidebar tree
   * @type {number}
   */
  depth;

  /**
   * An array of other Folders which are the displayed children of this one. This differs from the results of
   * {@link Folder.getSubfolders} because reports the subset of child folders which  are displayed to the current User
   * in the UI.
   * @type {Folder[]}
   */
  children;

  /**
   * Return whether the folder is displayed in the sidebar to the current User.
   * @type {boolean}
   */
  displayed = false;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The array of the Document instances which are contained within this Folder,
   * unless it's a Folder inside a Compendium pack, in which case it's the array
   * of objects inside the index of the pack that are contained in this Folder.
   * @type {(ClientDocument|object)[]}
   */
  get contents() {
    if ( this.#contents ) return this.#contents;
    if ( this.pack ) return game.packs.get(this.pack).index.filter(d => d.folder === this.id );
    return this.documentCollection.filter(d => d.folder === this);
  }

  set contents(value) {
    this.#contents = value;
  }

  #contents;

  /* -------------------------------------------- */

  /**
   * The reference to the Document type which is contained within this Folder.
   * @type {Function}
   */
  get documentClass() {
    return CONFIG[this.type].documentClass;
  }

  /* -------------------------------------------- */

  /**
   * The reference to the WorldCollection instance which provides Documents to this Folder,
   * unless it's a Folder inside a Compendium pack, in which case it's the index of the pack.
   * @type {WorldCollection|Collection}
   */
  get documentCollection() {
    if ( this.pack ) return game.packs.get(this.pack).index;
    return game.collections.get(this.type);
  }

  /* -------------------------------------------- */

  /**
   * Return whether the folder is currently expanded within the sidebar interface.
   * @type {boolean}
   */
  get expanded() {
    return game.folders._expanded[this.uuid] || false;
  }

  /* -------------------------------------------- */

  /**
   * Return the list of ancestors of this folder, starting with the parent.
   * @type {Folder[]}
   */
  get ancestors() {
    if ( !this.folder ) return [];
    return [this.folder, ...this.folder.ancestors];
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @override */
  async _preCreate(data, options, user) {

    // If the folder would be created past the maximum depth, throw an error
    if ( data.folder ) {
      const collection = data.pack ? game.packs.get(data.pack).folders : game.folders;
      const parent = collection.get(data.folder);
      if ( !parent ) return;
      const maxDepth = data.pack ? (CONST.FOLDER_MAX_DEPTH - 1) : CONST.FOLDER_MAX_DEPTH;
      if ( (parent.ancestors.length + 1) >= maxDepth ) throw new Error(game.i18n.format("FOLDER.ExceededMaxDepth", {depth: maxDepth}));
    }

    super._preCreate(data, options, user);
  }

  /* -------------------------------------------- */

  /**
   * Present a Dialog form to create a new Folder.
   * @see ClientDocumentMixin.createDialog
   * @param {object} data              Initial data with which to populate the creation form
   * @param {object} [context={}]      Additional context options or dialog positioning options
   * @param {object} [context.options={}] Dialog options
   * @param {string} [context.options.pack=""] The name of a Compendium pack to which the folder should be created in
   * @returns {Promise<Folder|null>}   A Promise which resolves to the created Folder, or null if the dialog was
   *                                   closed.
   */
  static async createDialog(data={}, options={}) {
    const folder = new Folder.implementation(foundry.utils.mergeObject({
      name: Folder.defaultName(),
      sorting: "a"
    }, data), { pack: options.pack });
    return new Promise(resolve => {
      options.resolve = resolve;
      new FolderConfig(folder, options).render(true);
    });
  }

  /* -------------------------------------------- */

  /**
   * Export all Documents contained in this Folder to a given Compendium pack.
   * Optionally update existing Documents within the Pack by name, otherwise append all new entries.
   * @param {CompendiumCollection} pack       A Compendium pack to which the documents will be exported
   * @param {object} [options]                Additional options which customize how content is exported.
   *                                          See {@link ClientDocumentMixin#toCompendium}
   * @param {boolean} [options.updateByName=false]    Update existing entries in the Compendium pack, matching by name
   * @param {boolean} [options.keepId=false]          Retain the original _id attribute when updating an entity
   * @param {boolean} [options.keepFolders=false]     Retain the existing Folder structure
   * @param {string} [options.folder]                 A target folder id to which the documents will be exported
   * @returns {Promise<CompendiumCollection>}  The updated Compendium Collection instance
   */
  async exportToCompendium(pack, options={}) {
    const updateByName = options.updateByName ?? false;
    const index = await pack.getIndex();
    ui.notifications.info(game.i18n.format("FOLDER.Exporting", {
      type: this.type,
      compendium: pack.collection
    }));
    options.folder ||= null;

    // Classify creations and updates
    const foldersToCreate = [];
    const foldersToUpdate = [];
    const documentsToCreate = [];
    const documentsToUpdate = [];

    // Ensure we do not overflow maximum allowed folder depth
    const originDepth = this.ancestors.length;
    const targetDepth = options.folder ? ((pack.folders.get(options.folder)?.ancestors.length ?? 0) + 1) : 0;

    /**
     * Recursively extract the contents and subfolders of a Folder into the Pack
     * @param {Folder} folder       The Folder to extract
     * @param {number} [_depth]     An internal recursive depth tracker
     * @private
     */
    const _extractFolder = async (folder, _depth=0) => {
      const folderData = folder.toCompendium(pack, {...options, clearSort: false, keepId: true});

      if ( options.keepFolders ) {
        // Ensure that the exported folder is within the maximum allowed folder depth
        const currentDepth = _depth + targetDepth - originDepth;
        const exceedsDepth = currentDepth > pack.maxFolderDepth;
        if ( exceedsDepth ) {
          throw new Error(`Folder "${folder.name}" exceeds maximum allowed folder depth of ${pack.maxFolderDepth}`);
        }

        // Re-parent child folders into the target folder or into the compendium root
        if ( folderData.folder === this.id ) folderData.folder = options.folder;

        // Classify folder data for creation or update
        if ( folder !== this ) {
          const existing = updateByName ? pack.folders.find(f => f.name === folder.name) : pack.folders.get(folder.id);
          if ( existing ) {
            folderData._id = existing._id;
            foldersToUpdate.push(folderData);
          }
          else foldersToCreate.push(folderData);
        }
      }

      // Iterate over Documents in the Folder, preparing each for export
      for ( let doc of folder.contents ) {
        const data = doc.toCompendium(pack, options);

        // Re-parent immediate child documents into the target folder.
        if ( data.folder === this.id ) data.folder = options.folder;

        // Otherwise retain their folder structure if keepFolders is true.
        else data.folder = options.keepFolders ? folderData._id : options.folder;

        // Generate thumbnails for Scenes
        if ( doc instanceof Scene ) {
          const { thumb } = await doc.createThumbnail({ img: data.background.src });
          data.thumb = thumb;
        }

        // Classify document data for creation or update
        const existing = updateByName ? index.find(i => i.name === data.name) : index.find(i => i._id === data._id);
        if ( existing ) {
          data._id = existing._id;
          documentsToUpdate.push(data);
        }
        else documentsToCreate.push(data);
        console.log(`Prepared "${data.name}" for export to "${pack.collection}"`);
      }

      // Iterate over subfolders of the Folder, preparing each for export
      for ( let c of folder.children ) await _extractFolder(c.folder, _depth+1);
    };

    // Prepare folders for export
    try {
      await _extractFolder(this, 0);
    } catch(err) {
      const msg = `Cannot export Folder "${this.name}" to Compendium pack "${pack.collection}":\n${err.message}`;
      return ui.notifications.error(msg, {console: true});
    }

    // Create and update Folders
    if ( foldersToUpdate.length ) {
      await this.constructor.updateDocuments(foldersToUpdate, {
        pack: pack.collection,
        diff: false,
        recursive: false,
        render: false
      });
    }
    if ( foldersToCreate.length ) {
      await this.constructor.createDocuments(foldersToCreate, {
        pack: pack.collection,
        keepId: true,
        render: false
      });
    }

    // Create and update Documents
    const cls = pack.documentClass;
    if ( documentsToUpdate.length ) await cls.updateDocuments(documentsToUpdate, {
      pack: pack.collection,
      diff: false,
      recursive: false,
      render: false
    });
    if ( documentsToCreate.length ) await cls.createDocuments(documentsToCreate, {
      pack: pack.collection,
      keepId: options.keepId,
      render: false
    });

    // Re-render the pack
    ui.notifications.info(game.i18n.format("FOLDER.ExportDone", {type: this.type, compendium: pack.collection}));
    pack.render(false);
    return pack;
  }

  /* -------------------------------------------- */

  /**
   * Provide a dialog form that allows for exporting the contents of a Folder into an eligible Compendium pack.
   * @param {string} pack       A pack ID to set as the default choice in the select input
   * @param {object} options    Additional options passed to the Dialog.prompt method
   * @returns {Promise<void>}   A Promise which resolves or rejects once the dialog has been submitted or closed
   */
  async exportDialog(pack, options={}) {

    // Get eligible pack destinations
    const packs = game.packs.filter(p => (p.documentName === this.type) && !p.locked);
    if ( !packs.length ) {
      return ui.notifications.warn(game.i18n.format("FOLDER.ExportWarningNone", {type: this.type}));
    }

    // Render the HTML form
    const html = await renderTemplate("templates/sidebar/apps/folder-export.html", {
      packs: packs.reduce((obj, p) => {
        obj[p.collection] = p.title;
        return obj;
      }, {}),
      pack: options.pack ?? null,
      merge: options.merge ?? true,
      keepId: options.keepId ?? true,
      keepFolders: options.keepFolders ?? true,
      hasFolders: options.pack?.folders?.length ?? false,
      folders: options.pack?.folders?.map(f => ({id: f.id, name: f.name})) || [],
    });

    // Display it as a dialog prompt
    return FolderExport.prompt({
      title: `${game.i18n.localize("FOLDER.ExportTitle")}: ${this.name}`,
      content: html,
      label: game.i18n.localize("FOLDER.ExportTitle"),
      callback: html => {
        const form = html[0].querySelector("form");
        const pack = game.packs.get(form.pack.value);
        return this.exportToCompendium(pack, {
          updateByName: form.merge.checked,
          keepId: form.keepId.checked,
          keepFolders: form.keepFolders.checked,
          folder: form.folder.value
        });
      },
      rejectClose: false,
      options
    });
  }

  /* -------------------------------------------- */

  /**
   * Get the Folder documents which are sub-folders of the current folder, either direct children or recursively.
   * @param {boolean} [recursive=false] Identify child folders recursively, if false only direct children are returned
   * @returns {Folder[]}  An array of Folder documents which are subfolders of this one
   */
  getSubfolders(recursive=false) {
    let subfolders = game.folders.filter(f => f._source.folder === this.id);
    if ( recursive && subfolders.length ) {
      for ( let f of subfolders ) {
        const children = f.getSubfolders(true);
        subfolders = subfolders.concat(children);
      }
    }
    return subfolders;
  }

  /* -------------------------------------------- */

  /**
   * Get the Folder documents which are parent folders of the current folder or any if its parents.
   * @returns {Folder[]}    An array of Folder documents which are parent folders of this one
   */
  getParentFolders() {
    let folders = [];
    let parent = this.folder;
    while ( parent ) {
      folders.push(parent);
      parent = parent.folder;
    }
    return folders;
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  get content() {
    foundry.utils.logCompatibilityWarning("Folder#content is deprecated in favor of Folder#contents.",
      {since: 10, until: 12});
    return this.contents;
  }
}
