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
    data.macroTypes = game.documentTypes.Macro.reduce((obj, t) => {
      if ( t === CONST.BASE_DOCUMENT_TYPE ) return obj;
      if ( (t === "script") && !game.user.can("MACRO_SCRIPT") ) return obj;
      obj[t] = game.i18n.localize(CONFIG.Macro.typeLabels[t]);
      return obj;
    }, {});
    data.macroScopes = CONST.MACRO_SCOPES;
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find("button.execute").click(this._onExecute.bind(this));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _disableFields(form) {
    super._disableFields(form);
    if ( this.object.canExecute ) form.querySelector("button.execute").disabled = false;
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
