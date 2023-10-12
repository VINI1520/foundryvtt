/**
 * The Application responsible for configuring a single AmbientLight document within a parent Scene.
 * @param {AmbientLight} light              The AmbientLight object for which settings are being configured
 * @param {DocumentSheetOptions} [options]  Additional application configuration options
 */
class AmbientLightConfig extends DocumentSheet {

  /**
   * Preserve a copy of the original document before any changes are made.
   * @type {object}
   */
  original;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "ambient-light-config",
      classes: ["sheet", "ambient-light-config"],
      title: "LIGHT.ConfigTitle",
      template: "templates/scene/ambient-light-config.html",
      width: 480,
      height: "auto",
      tabs: [{navSelector: ".tabs", contentSelector: "form", initial: "basic"}]
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async _render(force, options) {
    if ( !this.rendered ) this.original = this.object.toObject();
    return super._render(force, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    return foundry.utils.mergeObject(super.getData(options), {
      isAdvanced: this._tabs[0].active === "advanced",
      colorationTechniques: AdaptiveLightingShader.SHADER_TECHNIQUES,
      lightAnimations: CONFIG.Canvas.lightAnimations,
      gridUnits: canvas.scene.grid.units || game.i18n.localize("GridUnits"),
      submitText: game.i18n.localize(this.options.preview ? "LIGHT.Create" : "LIGHT.Update")
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options={}) {
    if ( !options.force ) this._resetPreview();
    return super.close(options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    html.find('button[type="reset"]').click(this._onResetForm.bind(this));
    return super.activateListeners(html);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onChangeInput(event) {
    await super._onChangeInput(event);
    const previewData = this._getSubmitData();
    this._previewChanges(previewData);
  }

  /* -------------------------------------------- */

  /**
   * Reset the values of advanced attributes to their default state.
   * @param {PointerEvent} event    The originating click event
   * @private
   */
  _onResetForm(event) {
    event.preventDefault();
    const defaults = AmbientLightDocument.cleanData();
    const keys = ["walls", "vision", "config"];
    const configKeys = ["coloration", "contrast", "attenuation", "luminosity", "saturation", "shadows"];
    for ( const k in defaults ) {
      if ( !keys.includes(k) ) delete defaults[k];
    }
    for ( const k in defaults.config ) {
      if ( !configKeys.includes(k) ) delete defaults.config[k];
    }
    this._previewChanges(defaults);
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Preview changes to the AmbientLight document as if they were true document updates.
   * @param {object} change         Data which simulates a document update
   * @param {boolean} [reset=false] To know if this preview change is a reset
   * @protected
   */
  _previewChanges(change, reset=false) {
    // Don't trigger updates for these values if we're just resetting after closing the form
    this.object.updateSource(foundry.utils.mergeObject(this.original, change, {inplace: false}), {recursive: false});
    if ( reset ) return;
    this.object._onUpdate(change, {render: false, preview: true}, game.user.id);
  }

  /* -------------------------------------------- */

  /**
   * Restore the true data for the AmbientLight document when the form is submitted or closed.
   * @protected
   */
  _resetPreview() {
    this._previewChanges(this.original, this._state === this.constructor.RENDER_STATES.CLOSING);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onChangeTab(event, tabs, active) {
    super._onChangeTab(event, tabs, active);
    this.element.find('button[type="reset"]').toggleClass("hidden", active !== "advanced");
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getSubmitData(updateData={}) {
    const formData = super._getSubmitData(updateData);
    if ( formData["config.color"] === "" ) formData["config.color"] = null;
    return formData;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {
    this._resetPreview();
    if ( this.object.id ) return this.object.update(formData);
    return this.object.constructor.create(formData, {parent: canvas.scene});
  }
}
