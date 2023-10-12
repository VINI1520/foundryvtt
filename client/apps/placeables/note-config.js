/**
 * The Application responsible for configuring a single Note document within a parent Scene.
 * @param {NoteDocument} note               The Note object for which settings are being configured
 * @param {DocumentSheetOptions} [options]  Additional Application configuration options
 */
class NoteConfig extends DocumentSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: game.i18n.localize("NOTE.ConfigTitle"),
      template: "templates/scene/note-config.html",
      width: 480
    });
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options={}) {
    const data = super.getData(options);
    if ( !this.object.id ) data.data.global = !canvas.scene.tokenVision;
    const entry = game.journal.get(this.object.entryId);
    const pages = entry?.pages.contents.sort((a, b) => a.sort - b.sort);
    const icons = Object.entries(CONFIG.JournalEntry.noteIcons).map(([label, src]) => {
      return {label, src};
    }).sort((a, b) => a.label.localeCompare(b.label));
    icons.unshift({label: game.i18n.localize("NOTE.Custom"), src: ""});
    const customIcon = !Object.values(CONFIG.JournalEntry.noteIcons).includes(this.document.texture.src);
    const icon = {
      selected: customIcon ? "" : this.document.texture.src,
      custom: customIcon ? this.document.texture.src : ""
    };
    return foundry.utils.mergeObject(data, {
      icon, icons,
      label: this.object.label,
      entry: entry || {},
      pages: pages || [],
      entries: game.journal.filter(e => e.isOwner).sort((a, b) => a.name.localeCompare(b.name)),
      fontFamilies: FontConfig.getAvailableFontChoices(),
      textAnchors: Object.entries(CONST.TEXT_ANCHOR_POINTS).reduce((obj, e) => {
        obj[e[1]] = game.i18n.localize(`JOURNAL.Anchor${e[0].titleCase()}`);
        return obj;
      }, {}),
      submitText: game.i18n.localize(this.id ? "NOTE.Update" : "NOTE.Create")
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    this._updateCustomIcon();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onChangeInput(event) {
    this._updateCustomIcon();
    if ( event.currentTarget.name === "entryId" ) this._updatePageList();
    return super._onChangeInput(event);
  }

  /* -------------------------------------------- */

  /**
   * Update disabled state of the custom icon field.
   * @protected
   */
  _updateCustomIcon() {
    const selected = this.form?.querySelector('[name="icon.selected"]');
    const custom = this.form?.querySelector('[name="icon.custom"]');
    if ( custom ) {
      custom.disabled = selected.value.length;
      this.form.querySelector('[data-target="icon.custom"]').disabled = selected.value.length;
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the list of pages.
   * @protected
   */
  _updatePageList() {
    const entryId = this.form.elements.entryId?.value;
    const pages = game.journal.get(entryId)?.pages.contents.sort((a, b) => a.sort - b.sort) ?? [];
    const options = pages.map(page => {
      const selected = (entryId === this.object.entryId) && (page.id === this.object.pageId);
      return `<option value="${page.id}"${selected ? " selected" : ""}>${page.name}</option>`;
    });
    this.form.elements.pageId.innerHTML = `<option></option>${options}`;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getSubmitData(updateData={}) {
    const data = super._getSubmitData(updateData);
    data["texture.src"] = data["icon.selected"] || data["icon.custom"];
    delete data["icon.selected"];
    delete data["icon.custom"];
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    if ( this.object.id ) return this.object.update(formData);
    else return this.object.constructor.create(formData, {parent: canvas.scene});
  }

  /* -------------------------------------------- */

  /** @override */
  async close(options) {
    if ( !this.object.id ) canvas.notes.clearPreviewContainer();
    return super.close(options);
  }
}
