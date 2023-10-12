/**
 * An interface for importing an adventure from a compendium pack.
 */
class AdventureImporter extends DocumentSheet {

  /**
   * An alias for the Adventure document
   * @type {Adventure}
   */
  adventure = this.object;

  /** @override */
  get isEditable() {
    return game.user.isGM;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "templates/adventure/importer.html",
      id: "adventure-importer",
      classes: ["sheet", "adventure", "adventure-importer"],
      width: 800,
      height: "auto",
      submitOnClose: false,
      closeOnSubmit: true
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    return {
      adventure: this.adventure,
      contents: this._getContentList(),
      imported: !!game.settings.get("core", "adventureImports")?.[this.adventure.uuid]
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.find('[value="all"]').on("change", this._onToggleImportAll.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the import all checkbox.
   * @param {Event} event  The change event.
   * @protected
   */
  _onToggleImportAll(event) {
    const target = event.currentTarget;
    const section = target.closest(".import-controls");
    const checked = target.checked;
    section.querySelectorAll("input").forEach(input => {
      if ( input === target ) return;
      if ( input.value !== "folders" ) input.disabled = checked;
      if ( checked ) input.checked = true;
    });
  }

  /* -------------------------------------------- */

  /**
   * Prepare a list of content types provided by this adventure.
   * @returns {{icon: string, label: string, count: number}[]}
   * @protected
   */
  _getContentList() {
    return Object.entries(Adventure.contentFields).reduce((arr, [field, cls]) => {
      const count = this.adventure[field].size;
      if ( !count ) return arr;
      arr.push({
        icon: CONFIG[cls.documentName].sidebarIcon,
        label: game.i18n.localize(count > 1 ? cls.metadata.labelPlural : cls.metadata.label),
        count, field
      });
      return arr;
    }, []);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    buttons.findSplice(b => b.class === "import");
    return buttons;
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {

    // Backwards compatibility. If the AdventureImporter subclass defines _prepareImportData or _importContent
    /** @deprecated since v11 */
    const prepareImportDefined = foundry.utils.getDefiningClass(this, "_prepareImportData");
    const importContentDefined = foundry.utils.getDefiningClass(this, "_importContent");
    if ( (prepareImportDefined !== AdventureImporter) || (importContentDefined !== AdventureImporter) ) {
      const warning = `The ${this.name} class overrides the AdventureImporter#_prepareImportData or 
      AdventureImporter#_importContent methods. As such a legacy import workflow will be used, but this workflow is 
      deprecated. Your importer should now call the new Adventure#import, Adventure#prepareImport, 
      or Adventure#importContent methods.`;
      foundry.utils.logCompatibilityWarning(warning, {since: 11, until: 13});
      return this._importLegacy(formData);
    }

    // Perform the standard Adventure import workflow
    return this.adventure.import(formData);
  }

  /* -------------------------------------------- */

  /**
   * Mirror Adventure#import but call AdventureImporter#_importContent and AdventureImport#_prepareImportData
   * @deprecated since v11
   * @ignore
   */
  async _importLegacy(formData) {

    // Prepare the content for import
    const {toCreate, toUpdate, documentCount} = await this._prepareImportData(formData);

    // Allow modules to preprocess adventure data or to intercept the import process
    const allowed = Hooks.call("preImportAdventure", this.adventure, formData, toCreate, toUpdate);
    if ( allowed === false ) {
      return console.log(`"${this.adventure.name}" Adventure import was prevented by the "preImportAdventure" hook`);
    }

    // Warn the user if the import operation will overwrite existing World content
    if ( !foundry.utils.isEmpty(toUpdate) ) {
      const confirm = await Dialog.confirm({
        title: game.i18n.localize("ADVENTURE.ImportOverwriteTitle"),
        content: `<h4><strong>${game.i18n.localize("Warning")}:</strong></h4>
        <p>${game.i18n.format("ADVENTURE.ImportOverwriteWarning", {name: this.adventure.name})}</p>`
      });
      if ( !confirm ) return;
    }

    // Perform the import
    const {created, updated} = await this._importContent(toCreate, toUpdate, documentCount);

    // Refresh the sidebar display
    ui.sidebar.render();

    // Allow modules to react to the import process
    Hooks.callAll("importAdventure", this.adventure, formData, created, updated);
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  async _prepareImportData(formData) {
    foundry.utils.logCompatibilityWarning("AdventureImporter#_prepareImportData is deprecated. "
      + "Please use Adventure#prepareImport instead.", {since: 11, until: 13});
    return this.adventure.prepareImport(formData);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  async _importContent(toCreate, toUpdate, documentCount) {
    foundry.utils.logCompatibilityWarning("AdventureImporter#_importContent is deprecated. "
      + "Please use Adventure#importContent instead.", {since: 11, until: 13});
    return this.adventure.importContent({ toCreate, toUpdate, documentCount });
  }
}
