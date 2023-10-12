/**
 * A compendium of knowledge arcane and mystical!
 */
class CompendiumDirectory extends SidebarTab {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "compendium",
      template: "templates/sidebar/compendium-directory.html",
      title: "COMPENDIUM.SidebarTitle"
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    const context = await super.getData(options);

    // Filter packs for visibility
    let packs = game.packs.filter(p => game.user.isGM || !p.private);

    // Sort packs by Document type
    const packData = packs.sort((a, b) => a.documentName.localeCompare(b.documentName)).reduce((obj, pack) => {
      const documentName = pack.documentName;
      if ( !obj.hasOwnProperty(documentName) ) obj[documentName] = {
        label: documentName,
        packs: []
      };
      obj[documentName].packs.push(pack);
      return obj;
    }, {});

    // Sort packs within type
    for ( let p of Object.values(packData) ) {
      p.packs = p.packs.sort((a, b) => a.title.localeCompare(b.title));
    }

    // Return data to the sidebar
    return foundry.utils.mergeObject(context, {packs: packData});
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {

    // Click to open
    html.find(".compendium-pack").click(ev => {
      const li = ev.currentTarget;
      const pack = game.packs.get(li.dataset.pack);
      if ( li.dataset.open === "1" ) pack.apps.forEach(app => app.close());
      else {
        this._toggleOpenState(li.dataset.pack);
        pack.render(true);
      }
    });

    // Options below are GM only
    if ( !game.user.isGM ) return;

    // Create Compendium
    html.find(".create-compendium").click(this._onCreateCompendium.bind(this));

    // Compendium context menu
    this._contextMenu(html);
  }

  /* -------------------------------------------- */

  /**
   * Compendium sidebar Context Menu creation
   * @param {jQuery} html     The HTML being rendered for the compendium directory
   * @protected
   */
  _contextMenu(html) {
    ContextMenu.create(this, html, ".compendium-pack", this._getEntryContextOptions());
  }

  /* -------------------------------------------- */

  /**
   * Get the sidebar directory entry context options
   * @returns {Object}   The sidebar entry context options
   * @private
   */
  _getEntryContextOptions() {
    return [
      {
        name: "COMPENDIUM.ToggleVisibility",
        icon: '<i class="fas fa-eye"></i>',
        callback: li => {
          let pack = game.packs.get(li.data("pack"));
          return pack.configure({private: !pack.private});
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
                <input type="text" name="label" value="${pack.title}"/>
                <p class="notes">${game.i18n.localize("COMPENDIUM.DuplicateHint")}</p>
            </div>
          </form>`;
          return Dialog.confirm({
            title: `${game.i18n.localize("COMPENDIUM.ToggleLocked")}: ${pack.title}`,
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

  /**
   * Handle a Compendium Pack creation request
   * @param {PointerEvent} event      The originating click event
   * @private
   */
  async _onCreateCompendium(event) {
    event.preventDefault();
    const types = CONST.COMPENDIUM_DOCUMENT_TYPES.reduce((types, documentName) => {
      types[documentName] = game.i18n.localize(getDocumentClass(documentName).metadata.label);
      return types;
    }, {});
    const html = await renderTemplate("templates/sidebar/compendium-create.html", {types});
    return Dialog.prompt({
      title: game.i18n.localize("COMPENDIUM.Create"),
      content: html,
      label: game.i18n.localize("COMPENDIUM.Create"),
      callback: html => {
        const form = html.querySelector("#compendium-create");
        const fd = new FormDataExtended(form);
        const metadata = fd.object;
        if ( !metadata.label ) {
          let defaultName = game.i18n.format("DOCUMENT.New", {type: game.i18n.localize("PACKAGE.TagCompendium")});
          const count = game.packs.size;
          if ( count > 0 ) defaultName += ` (${count + 1})`;
          metadata.label = defaultName;
        }
        CompendiumCollection.createCompendium(metadata).then(() => this.render());
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

  /* -------------------------------------------- */

  /**
   * Toggle the compendium entry open/closed state in the sidebar.
   * @param {string} pack  The name of the compendium pack.
   * @internal
   */
  _toggleOpenState(pack) {
    document.querySelectorAll(`.compendium-pack[data-pack="${pack}"]`).forEach(li => {
      const isOpen = li.dataset.open === "1";
      li.dataset.open = isOpen ? "0" : "1";
      const icon = li.querySelector("i.folder");
      icon.classList.remove("fa-folder", "fa-folder-open");
      icon.classList.add(isOpen ? "fa-folder" : "fa-folder-open");
    });
  }
}
