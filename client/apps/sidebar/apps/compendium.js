/**
 * An interface for displaying the content of a CompendiumCollection.
 * @param {CompendiumCollection} collection  The {@link CompendiumCollection} object represented by this interface.
 * @param {ApplicationOptions} [options]     Application configuration options.
 */
class Compendium extends DocumentDirectory {
  constructor(...args) {
    if ( args[0] instanceof Collection ) {
      foundry.utils.logCompatibilityWarning("Compendium constructor should now be passed a CompendiumCollection "
        + "instance via {collection: compendiumCollection}", {
        since: 11,
        until: 13
      });
      args[1] ||= {};
      args[1].collection = args.shift();
    }
    super(...args);
  }

  /* -------------------------------------------- */

  /** @override */
  get entryType() {
    return this.metadata.type;
  }

  /* -------------------------------------------- */

  /** @override */
  static entryPartial = "templates/sidebar/partials/compendium-index-partial.html";

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "templates/apps/compendium.html",
      width: 350,
      height: window.innerHeight - 100,
      top: 70,
      left: 120,
      popOut: true
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get id() {
    return `compendium-${this.collection.collection}`;
  }

  /* ----------------------------------------- */

  /** @inheritdoc */
  get title() {
    return [this.collection.title, this.collection.locked ? "[Locked]" : null].filterJoin(" ");
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get tabName() {
    return "Compendium";
  }

  /* -------------------------------------------- */

  /** @override */
  get canCreateEntry() {
    const cls = getDocumentClass(this.collection.documentName);
    const isOwner = this.collection.testUserPermission(game.user, "OWNER");
    return !this.collection.locked && isOwner && cls.canUserCreate(game.user);
  }

  /* -------------------------------------------- */

  /** @override */
  get canCreateFolder() {
    return this.canCreateEntry;
  }

  /* ----------------------------------------- */

  /**
   * A convenience redirection back to the metadata object of the associated CompendiumCollection
   * @returns {object}
   */
  get metadata() {
    return this.collection.metadata;
  }

  /* -------------------------------------------- */

  /** @override */
  initialize() {
    this.collection.initializeTree();
  }

  /* ----------------------------------------- */
  /*  Rendering                                */
  /* ----------------------------------------- */

  /** @inheritDoc */
  render(force, options) {
    if ( !this.collection.visible ) {
      if ( force ) ui.notifications.warn("COMPENDIUM.CannotViewWarning", {localize: true});
      return this;
    }
    return super.render(force, options);
  }

  /* ----------------------------------------- */

  /** @inheritdoc */
  async getData(options={}) {
    const context = await super.getData(options);
    return foundry.utils.mergeObject(context, {
      collection: this.collection,
      index: this.collection.index,
      name: game.i18n.localize(this.metadata.label),
      footerButtons: []
    });
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  _entryAlreadyExists(document) {
    return (document.pack === this.collection.collection) && this.collection.index.has(document.id);
  }

  /* -------------------------------------------- */

  /** @override */
  async _createDroppedEntry(document, folderId) {
    document = document.clone({folder: folderId || null}, {keepId: true});
    return this.collection.importDocument(document);
  }

  /* -------------------------------------------- */

  /** @override */
  _getEntryDragData(entryId) {
    return {
      type: this.collection.documentName,
      uuid: this.collection.getUuid(entryId)
    };
  }

  /* -------------------------------------------- */

  /** @override */
  _onCreateEntry(event) {
    // If this is an Adventure, use the Adventure Exporter application
    if ( this.collection.documentName === "Adventure" ) {
      const adventure = new Adventure({name: "New Adventure"}, {pack: this.collection.collection});
      return new AdventureExporter(adventure).render(true);
    }
    return super._onCreateEntry(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle clicks on a footer button
   * @param {PointerEvent} event    The originating pointer event
   * @private
   */
  _onClickFooterButton(event) {
    const button = event.currentTarget;
    switch ( button.dataset.action ) {
      case "createAdventure":
        const adventure = new Adventure({name: "New Adventure"}, {pack: this.collection.collection});
        return new AdventureExporter(adventure).render(true);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _getDocumentDragData(documentId) {
    return {
      type: this.collection.documentName,
      uuid: this.collection.getUuid(documentId)
    };
  }

  /* -------------------------------------------- */

  /** @override */
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
  _getFolderContextOptions() {
    const toRemove = ["OWNERSHIP.Configure", "FOLDER.Export"];
    return super._getFolderContextOptions().filter(o => !toRemove.includes(o.name));
  }

  /* -------------------------------------------- */

  /** @override */
  _getEntryContextOptions() {
    const isAdventure = this.collection.documentName === "Adventure";
    return [
      {
        name: "COMPENDIUM.ImportEntry",
        icon: '<i class="fas fa-download"></i>',
        condition: () => !isAdventure && this.collection.documentClass.canUserCreate(game.user),
        callback: li => {
          const collection = game.collections.get(this.collection.documentName);
          const id = li.data("document-id");
          return collection.importFromCompendium(this.collection, id, {}, {renderSheet: true});
        }
      },
      {
        name: "ADVENTURE.ExportEdit",
        icon: '<i class="fa-solid fa-edit"></i>',
        condition: () => isAdventure && game.user.isGM && !this.collection.locked,
        callback: async li => {
          const id = li.data("document-id");
          const document = await this.collection.getDocument(id);
          return new AdventureExporter(document.clone({}, {keepId: true})).render(true);
        }
      },
      {
        name: "SCENES.GenerateThumb",
        icon: '<i class="fas fa-image"></i>',
        condition: () => !this.collection.locked && (this.collection.documentName === "Scene"),
        callback: async li => {
          const scene = await this.collection.getDocument(li.data("document-id"));
          scene.createThumbnail().then(data => {
            scene.update({thumb: data.thumb}, {diff: false});
            ui.notifications.info(game.i18n.format("SCENES.GenerateThumbSuccess", {name: scene.name}));
          }).catch(err => ui.notifications.error(err.message));
        }
      },
      {
        name: "COMPENDIUM.DeleteEntry",
        icon: '<i class="fas fa-trash"></i>',
        condition: () => game.user.isGM && !this.collection.locked,
        callback: async li => {
          const id = li.data("document-id");
          const document = await this.collection.getDocument(id);
          return Dialog.confirm({
            title: `${game.i18n.localize("COMPENDIUM.DeleteEntry")} ${document.name}`,
            content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("COMPENDIUM.DeleteEntryWarning")}</p>`,
            yes: () => document.delete()
          });
        }
      }
    ];
  }
}
