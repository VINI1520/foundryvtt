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
   * Return an array of the Document instances which are contained within this Folder.
   * @type {ClientDocument[]}
   */
  get contents() {
    if ( this.#contents ) return this.#contents;
    return this.documentCollection.filter(d => d.folder === this);
  }

  set contents(value) {
    this.#contents = value;
  }

  #contents;

  /* -------------------------------------------- */

  /**
   * Return a reference to the Document type which is contained within this Folder.
   * @returns {Function}
   */
  get documentClass() {
    return CONFIG[this.type].documentClass;
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the WorldCollection instance which provides Documents to this Folder.
   * @returns {WorldCollection}
   */
  get documentCollection() {
    return game.collections.get(this.type);
  }

  /* -------------------------------------------- */

  /**
   * Return whether the folder is currently expanded within the sidebar interface.
   * @type {boolean}
   */
  get expanded() {
    return game.folders._expanded[this.id] || false;
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

  /**
   * Present a Dialog form to create a new Folder.
   * @see ClientDocumentMixin.createDialog
   * @param {object} data              Initial data with which to populate the creation form
   * @param {object} [context={}]      Additional context options or dialog positioning options
   * @param {object} [context.options={}] Dialog options
   * @returns {Promise<Folder|null>}   A Promise which resolves to the created Folder, or null if the dialog was
   *                                   closed.
   */
  static async createDialog(data={}, options={}) {
    const folder = new Folder(foundry.utils.mergeObject({
      name: Folder.defaultName(),
      sorting: "a"
    }, data));
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
   * @returns {Promise<CompendiumCollection>}  The updated Compendium Collection instance
   */
  async exportToCompendium(pack, options={}) {
    const updateByName = options.updateByName ?? false;
    const index = await pack.getIndex();
    const documents = this.contents;
    ui.notifications.info(game.i18n.format("FOLDER.Exporting", {
      n: documents.length,
      type: this.type,
      compendium: pack.collection
    }));

    // Classify creations and updates
    const creations = [];
    const updates = [];
    for ( let d of this.contents ) {
      const data = d.toCompendium(pack, options);
      let existing = updateByName ? index.find(i => i.name === d.name) : index.find(i => i._id === d.id);
      if (existing) {
        if ( this.type === "Scene" ) {
          const thumb = await d.createThumbnail({img: data.background.src});
          data.thumb = thumb.thumb;
        }
        data._id = existing._id;
        updates.push(data);
      }
      else creations.push(data);
      console.log(`Prepared ${d.name} for export to ${pack.collection}`);
    }

    // Create new Documents
    const cls = pack.documentClass;
    if ( creations.length ) await cls.createDocuments(creations, {
      pack: pack.collection,
      keepId: options.keepId
    });

    // Update existing Documents
    if ( updates.length ) await cls.updateDocuments(updates, {
      pack: pack.collection,
      diff: false,
      recursive: false,
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
      keepId: options.keepId ?? true
    });

    // Display it as a dialog prompt
    return Dialog.prompt({
      title: `${game.i18n.localize("FOLDER.ExportTitle")}: ${this.name}`,
      content: html,
      label: game.i18n.localize("FOLDER.ExportTitle"),
      callback: html => {
        const form = html[0].querySelector("form");
        const pack = game.packs.get(form.pack.value);
        return this.exportToCompendium(pack, {
          updateByName: form.merge.checked,
          keepId: form.keepId.checked
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
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDelete(options, userId) {
    const parentFolder = this.folder;
    const db = CONFIG.DatabaseBackend;
    const {deleteSubfolders, deleteContents} = options;

    // Delete or move sub-Folders
    const deleteFolderIds = [];
    for ( let f of this.getSubfolders() ) {
      if ( deleteSubfolders ) deleteFolderIds.push(f.id);
      else f.updateSource({folder: parentFolder});
    }
    if ( deleteFolderIds.length ) {
      db._handleDeleteDocuments({
        request: { type: "Folder", options: { deleteSubfolders, deleteContents, render: false } },
        result: deleteFolderIds,
        userId
      });
    }

    // Delete or move contained Documents
    const deleteDocumentIds = [];
    for ( let d of this.documentCollection ) {
      if ( d._source.folder !== this.id ) continue;
      if ( deleteContents ) deleteDocumentIds.push(d.id);
      else d.updateSource({folder: parentFolder});
    }
    if ( deleteDocumentIds.length ) {
      db._handleDeleteDocuments({
        request: { type: this.type, options: { render: false } },
        result: deleteDocumentIds,
        userId
      });
    }
    return super._onDelete(options, userId);
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
