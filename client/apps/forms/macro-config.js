/**
 * A Macro configuration sheet
 * @extends {DocumentSheet}
 *
 * @param {Macro} object                    The Macro Document which is being configured
 * @param {DocumentSheetOptions} [options]  Application configuration options.
 */
class MacroConfig extends DocumentSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sheet", "macro-sheet"],
      template: "templates/sheets/macro-config.html",
      width: 560,
      height: 480,
      resizable: true
    });
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options={}) {
    const data = super.getData();
    data.macroTypes = foundry.utils.deepClone(game.documentTypes.Macro);
    if ( !game.user.can("MACRO_SCRIPT") ) data.macroTypes.findSplice(t => t === "script");
    data.macroScopes = CONST.MACRO_SCOPES;
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find("button.execute").click(this._onExecute.bind(this));
    if ( this.isEditable ) html.find('img[data-edit="img"]').click(ev => this._onEditImage(ev));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _disableFields(form) {
    super._disableFields(form);
    if ( this.object.canExecute ) form.querySelector("button.execute").disabled = false;
  }

  /* -------------------------------------------- */

  /**
   * Handle changing the actor profile image by opening a FilePicker
   * @private
   */
  _onEditImage(event) {
    const fp = new FilePicker({
      type: "image",
      current: this.object.img,
      callback: path => {
        event.currentTarget.src = path;
        this._onSubmit(event, {preventClose: true});
      },
      top: this.position.top + 40,
      left: this.position.left + 10
    });
    return fp.browse();
  }

  /* -------------------------------------------- */

  /**
   * Save and execute the macro using the button on the configuration sheet
   * @param {MouseEvent} event      The originating click event
   * @return {Promise<void>}
   * @private
   */
  async _onExecute(event) {
    event.preventDefault();
    await this._onSubmit(event, {preventClose: true}); // Submit pending changes
    this.object.execute(); // Execute the macro
  }


  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    if ( !this.object.id ) {
      return Macro.create(formData);
    } else {
      return super._updateObject(event, formData);
    }
  }
}
