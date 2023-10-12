/**
 * An interface for displaying the content of a CompendiumCollection.
 * @extends {Application}
 * @param {CompendiumCollection} collection  The {@link CompendiumCollection} object represented by this interface.
 * @param {ApplicationOptions} [options]     Application configuration options.
 */
class Compendium extends Application {
  constructor(collection, options) {
    super(options);

    /**
     * The CompendiumCollection instance which is represented in this Compendium interface.
     * @type {CompendiumCollection}
     */
    this.collection = collection;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "templates/apps/compendium.html",
      width: 350,
      height: window.innerHeight - 100,
      top: 70,
      left: 120,
      scrollY: [".directory-list"],
      dragDrop: [{dragSelector: ".directory-item", dropSelector: ".directory-list"}],
      filters: [{inputSelector: 'input[name="search"]', contentSelector: ".directory-list"}]
    });
  }
  /* ----------------------------------------- */

  /** @inheritdoc */
  get title() {
    return [this.collection.title, this.collection.locked ? "[Locked]" : null].filterJoin(" ");
  }

  /* ----------------------------------------- */

  /**
   * A convenience redirection back to the metadata object of the associated CompendiumCollection
   * @returns {object}
   */
  get metadata() {
    return this.collection.metadata;
  }

  /* ----------------------------------------- */
  /*  Rendering                                */
  /* ----------------------------------------- */

  /** @inheritdoc */
  async getData(options={}) {
    if ( !this.collection.indexed ) await this.collection.getIndex();
    const footerButtons = [];
    if ( (this.collection.documentName === "Adventure") && game.user.isGM && !this.collection.locked ) {
      footerButtons.push({action: "createAdventure", label: "ADVENTURE.Create", icon: CONFIG.Adventure.sidebarIcon});
    }

    // Sort index entries
    const index = this.collection.index.contents;
    index.sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));

    // Return rendering data
    return {
      collection: this.collection,
      documentCls: this.collection.documentName.toLowerCase(),
      index: index,
      documentPartial: SidebarDirectory.documentPartial,
      footerButtons
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options) {
    ui.compendium._toggleOpenState(this.collection.collection);
    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    const directory = html.find(".directory-list");
    const entries = directory.find(".directory-item");

    // Open sheets
    html.find(".document-name").click(this._onClickEntry.bind(this));

    // Context menu for each entry
    this._contextMenu(html);

    // Intersection Observer for Compendium avatars
    const observer = new IntersectionObserver(SidebarTab.prototype._onLazyLoadImage.bind(this), {root: directory[0]});
    entries.each((i, li) => observer.observe(li));

    // Footer buttons
    html.find("button[data-action]").on("click", this._onClickFooterButton.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle opening a single compendium entry by invoking the configured document class and its sheet
   * @param {MouseEvent} event      The originating click event
   * @private
   */
  async _onClickEntry(event) {
    let li = event.currentTarget.parentElement;
    const document = await this.collection.getDocument(li.dataset.documentId);
    const sheet = document.sheet;
    if ( sheet._minimized ) return sheet.maximize();
    else return sheet.render(true, {editable: game.user.isGM && !this.collection.locked});
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

  /** @inheritdoc */
  _onSearchFilter(event, query, rgx, html) {
    for (let li of html.children) {
      const name = li.querySelector(".document-name").textContent;
      const match = rgx.test(SearchFilter.cleanQuery(name));
      li.style.display = match ? "flex" : "none";
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _canDragStart(selector) {
    return true;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _canDragDrop(selector) {
    return game.user.isGM;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragStart(event) {
    const li = event.currentTarget;
    const pack = this.collection;
    event.dataTransfer.setData("text/plain", JSON.stringify({
      type: pack.documentName,
      uuid: `Compendium.${pack.collection}.${li.dataset.documentId}`
    }));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    if ( !data.type ) throw new Error("You must define the type of document data being dropped");

    // Import the dropped Document
    const cls = this.collection.documentClass;
    const document = await cls.fromDropData(data);
    if ( document.pack === this.collection.collection ) return false; // Prevent drop on self
    return this.collection.importDocument(document);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _contextMenu(html) {
    ContextMenu.create(this, html, ".directory-item", this._getEntryContextOptions());
  }

  /* -------------------------------------------- */

  /**
   * Get Compendium entry context options
   * @returns {object[]}  The Compendium entry context options
   * @private
   */
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
