/**
 * A compendium of knowledge arcane and mystical!
 * Renders the sidebar directory of compendium packs
 * @extends {SidebarTab}
 * @mixes {DirectoryApplication}
 */
class CompendiumDirectory extends DirectoryApplicationMixin(SidebarTab) {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "compendium",
      template: "templates/sidebar/compendium-directory.html",
      title: "COMPENDIUM.SidebarTitle",
      contextMenuSelector: ".directory-item.compendium",
      entryClickSelector: ".compendium"
    });
  }

  /**
   * A reference to the currently active compendium types. If empty, all types are shown.
   * @type {string[]}
   */
  #activeFilters = [];

  get activeFilters() {
    return this.#activeFilters;
  }

  /* -------------------------------------------- */

  /** @override */
  entryType = "Compendium";

  /* -------------------------------------------- */

  /** @override */
  static entryPartial = "templates/sidebar/partials/pack-partial.html";

  /* -------------------------------------------- */

  /** @override */
  _entryAlreadyExists(entry) {
    return this.collection.has(entry.collection);
  }

  /* -------------------------------------------- */

  /** @override */
  _getEntryDragData(entryId) {
    const pack = this.collection.get(entryId);
    return {
      type: "Compendium",
      id: pack.collection
    };
  }

  /* -------------------------------------------- */

  /** @override */
  _entryIsSelf(entry, otherEntry) {
    return entry.metadata.id === otherEntry.metadata.id;
  }

  /* -------------------------------------------- */

  /** @override */
  async _sortRelative(entry, sortData) {
    // We build up a single update object for all compendiums to prevent multiple re-renders
    const packConfig = game.settings.get("core", "compendiumConfiguration");
    const targetFolderId = sortData.updateData.folder;
    if ( targetFolderId ) {
      packConfig[entry.collection] = foundry.utils.mergeObject(packConfig[entry.collection] || {}, {
        folder: targetFolderId
      });
    }

    // Update sorting
    const sorting = SortingHelpers.performIntegerSort(entry, sortData);
    for ( const s of sorting ) {
      const pack = s.target;
      const existingConfig = packConfig[pack.collection] || {};
      existingConfig.sort = s.update.sort;
    }
    await game.settings.set("core", "compendiumConfiguration", packConfig);
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".filter").click(this._displayFilterCompendiumMenu.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Display a menu of compendium types to filter by
   * @param {PointerEvent} event    The originating pointer event
   * @returns {Promise<void>}
   * @protected
   */
  async _displayFilterCompendiumMenu(event) {
    // If there is a current dropdown menu, remove it
    const dropdown = document.getElementsByClassName("dropdown-menu")[0];
    if ( dropdown ) {
      dropdown.remove();
      return;
    }
    const button = event.currentTarget;

    // Display a menu of compendium types to filter by
    const choices = CONST.COMPENDIUM_DOCUMENT_TYPES.map(t => {
      const config = CONFIG[t];
      return {
        name: game.i18n.localize(config.documentClass.metadata.label),
        icon: config.sidebarIcon,
        type: t,
        callback: (event) => this._onToggleCompendiumFilterType(event, t)
      };
    });

    // If there are active filters, add a "Clear Filters" option
    if ( this.#activeFilters.length ) {
      choices.unshift({
        name: game.i18n.localize("COMPENDIUM.ClearFilters"),
        icon: "fas fa-times",
        type: null,
        callback: (event) => this._onToggleCompendiumFilterType(event, null)
      });
    }

    // Create a vertical list of buttons contained in a div
    const menu = document.createElement("div");
    menu.classList.add("dropdown-menu");
    const list = document.createElement("div");
    list.classList.add("dropdown-list", "flexcol");
    menu.appendChild(list);
    for ( let c of choices ) {
      const dropdownItem = document.createElement("a");
      dropdownItem.classList.add("dropdown-item");
      if ( this.#activeFilters.includes(c.type) ) dropdownItem.classList.add("active");
      dropdownItem.innerHTML = `<i class="${c.icon}"></i> ${c.name}`;
      dropdownItem.addEventListener("click", c.callback);
      list.appendChild(dropdownItem);
    }

    // Position the menu
    const pos = {
      top: button.offsetTop + 10,
      left: button.offsetLeft + 10
    };
    menu.style.top = `${pos.top}px`;
    menu.style.left = `${pos.left}px`;
    button.parentElement.appendChild(menu);
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling a compendium type filter
   * @param {PointerEvent} event    The originating pointer event
   * @param {string|null} type      The compendium type to filter by. If null, clear all filters.
   * @protected
   */
  _onToggleCompendiumFilterType(event, type) {
    if ( type === null ) this.#activeFilters = [];
    else this.#activeFilters = this.#activeFilters.includes(type) ?
      this.#activeFilters.filter(t => t !== type) : this.#activeFilters.concat(type);
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * The collection of Compendium Packs which are displayed in this Directory
   * @returns {CompendiumPacks<string, CompendiumCollection>}
   */
  get collection() {
    return game.packs;
  }

  /* -------------------------------------------- */

  /**
   * Get the dropped Entry from the drop data
   * @param {object} data         The data being dropped
   * @returns {Promise<object>}   The dropped Entry
   * @protected
   */
  async _getDroppedEntryFromData(data) {
    return game.packs.get(data.id);
  }

  /* -------------------------------------------- */

  /** @override */
  async _createDroppedEntry(document, folder) {
    throw new Error("The _createDroppedEntry shouldn't be called for CompendiumDirectory");
  }

  /* -------------------------------------------- */

  /** @override */
  _getEntryName(entry) {
    return entry.metadata.label;
  }

  /* -------------------------------------------- */

  /** @override */
  _getEntryId(entry) {
    return entry.metadata.id;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    let context = await super.getData(options);

    // For each document, assign a default image if one is not already present, and calculate the style string
    const packageTypeIcons = {
      "world": World.icon,
      "system": System.icon,
      "module": Module.icon
    };
    const packContext = {};
    for ( const pack of this.collection ) {
      packContext[pack.collection] = {
        locked: pack.locked,
        customOwnership: "ownership" in pack.config,
        collection: pack.collection,
        name: pack.metadata.packageName,
        label: pack.metadata.label,
        icon: CONFIG[pack.metadata.type].sidebarIcon,
        hidden: this.#activeFilters?.length ? !this.#activeFilters.includes(pack.metadata.type) : false,
        banner: pack.banner,
        sourceIcon: packageTypeIcons[pack.metadata.packageType]
      };
    }

    // Return data to the sidebar
    context = foundry.utils.mergeObject(context, {
      folderIcon: CONFIG.Folder.sidebarIcon,
      label: game.i18n.localize("PACKAGE.TagCompendium"),
      labelPlural: game.i18n.localize("SIDEBAR.TabCompendium"),
      sidebarIcon: "fas fa-atlas",
      filtersActive: !!this.#activeFilters.length
    });
    context.packContext = packContext;
    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  async render(force=false, options={}) {
    game.packs.initializeTree();
    return super.render(force, options);
  }

  /* -------------------------------------------- */

  /** @override */
  _getEntryContextOptions() {
    if ( !game.user.isGM ) return [];
    return [
      {
        name: "OWNERSHIP.Configure",
        icon: '<i class="fa-solid fa-user-lock"></i>',
        callback: li => {
          const pack = game.packs.get(li.data("pack"));
          return pack.configureOwnershipDialog();
        }
      },
      {
        name: "FOLDER.Clear",
        icon: '<i class="fas fa-folder"></i>',
        condition: header => {
          const li = header.closest(".directory-item");
          const entry = this.collection.get(li.data("entryId"));
          return !!entry.folder;
        },
        callback: header => {
          const li = header.closest(".directory-item");
          const entry = this.collection.get(li.data("entryId"));
          entry.setFolder(null);
        }
      },
      {
        name: "COMPENDIUM.ToggleLocked",
        icon: '<i class="fas fa-lock"></i>',
        callback: li => {
          let pack = game.packs.get(li.data("pack"));
          const isUnlock = pack.locked;
          if ( isUnlock && (pack.metadata.packageType !== "world")) {
            return Dialog.confirm({
              title: `${game.i18n.localize("COMPENDIUM.ToggleLocked")}: ${pack.title}`,
              content: `<p><strong>${game.i18n.localize("Warning")}:</strong> ${game.i18n.localize("COMPENDIUM.ToggleLockedWarning")}</p>`,
              yes: () => pack.configure({locked: !pack.locked}),
              options: {
                top: Math.min(li[0].offsetTop, window.innerHeight - 350),
                left: window.innerWidth - 720,
                width: 400
              }
            });
          }
          else return pack.configure({locked: !pack.locked});
        }
      },
      {
        name: "COMPENDIUM.Duplicate",
        icon: '<i class="fas fa-copy"></i>',
        callback: li => {
          let pack = game.packs.get(li.data("pack"));
          const html = `<form>
            <div class="form-group">
                <label>${game.i18n.localize("COMPENDIUM.DuplicateTitle")}</label>
                <input type="text" name="label" value="${game.i18n.format("DOCUMENT.CopyOf", {name: pack.title})}"/>
                <p class="notes">${game.i18n.localize("COMPENDIUM.DuplicateHint")}</p>
            </div>
          </form>`;
          return Dialog.confirm({
            title: `${game.i18n.localize("COMPENDIUM.Duplicate")}: ${pack.title}`,
            content: html,
            yes: html => {
              const label = html.querySelector('input[name="label"]').value;
              return pack.duplicateCompendium({label});
            },
            options: {
              top: Math.min(li[0].offsetTop, window.innerHeight - 350),
              left: window.innerWidth - 720,
              width: 400,
              jQuery: false
            }
          });
        }
      },
      {
        name: "COMPENDIUM.ImportAll",
        icon: '<i class="fas fa-download"></i>',
        condition: li => game.packs.get(li.data("pack"))?.documentName !== "Adventure",
        callback: li => {
          let pack = game.packs.get(li.data("pack"));
          return pack.importDialog({
            top: Math.min(li[0].offsetTop, window.innerHeight - 350),
            left: window.innerWidth - 720,
            width: 400
          });
        }
      },
      {
        name: "COMPENDIUM.Delete",
        icon: '<i class="fas fa-trash"></i>',
        condition: li => {
          let pack = game.packs.get(li.data("pack"));
          return pack.metadata.packageType === "world";
        },
        callback: li => {
          let pack = game.packs.get(li.data("pack"));
          return this._onDeleteCompendium(pack);
        }
      }
    ];
  }

  /* -------------------------------------------- */

  /** @override */
  async _onClickEntryName(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const packId = element.closest("[data-pack]").dataset.pack;
    const pack = game.packs.get(packId);
    pack.render(true);
  }

  /* -------------------------------------------- */

  /** @override */
  async _onCreateEntry(event) {
    event.preventDefault();
    event.stopPropagation();
    const li = event.currentTarget.closest(".directory-item");
    const targetFolderId = li ? li.dataset.folderId : null;
    const types = CONST.COMPENDIUM_DOCUMENT_TYPES.map(documentName => {
      return { value: documentName, label: game.i18n.localize(getDocumentClass(documentName).metadata.label) };
    });
    game.i18n.sortObjects(types, "label");
    const folders = this.collection._formatFolderSelectOptions();
    const html = await renderTemplate("templates/sidebar/compendium-create.html",
      {types, folders, folder: targetFolderId, hasFolders: folders.length >= 1});
    return Dialog.prompt({
      title: game.i18n.localize("COMPENDIUM.Create"),
      content: html,
      label: game.i18n.localize("COMPENDIUM.Create"),
      callback: async html => {
        const form = html.querySelector("#compendium-create");
        const fd = new FormDataExtended(form);
        const metadata = fd.object;
        let targetFolderId = metadata.folder;
        if ( metadata.folder ) delete metadata.folder;
        if ( !metadata.label ) {
          let defaultName = game.i18n.format("DOCUMENT.New", {type: game.i18n.localize("PACKAGE.TagCompendium")});
          const count = game.packs.size;
          if ( count > 0 ) defaultName += ` (${count + 1})`;
          metadata.label = defaultName;
        }
        const pack = await CompendiumCollection.createCompendium(metadata);
        if ( targetFolderId ) await pack.setFolder(targetFolderId);
      },
      rejectClose: false,
      options: { jQuery: false }
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle a Compendium Pack deletion request
   * @param {object} pack   The pack object requested for deletion
   * @private
   */
  _onDeleteCompendium(pack) {
    return Dialog.confirm({
      title: `${game.i18n.localize("COMPENDIUM.Delete")}: ${pack.title}`,
      content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("COMPENDIUM.DeleteWarning")}</p>`,
      yes: () => pack.deleteCompendium(),
      defaultYes: false
    });
  }
}
