/**
 * The Application responsible for configuring a single AmbientLight document within a parent Scene.
 * @param {AmbientLight} light              The AmbientLight object for which settings are being configured
 * @param {DocumentSheetOptions} [options]  Additional application configuration options
 */
class AmbientLightConfig extends DocumentSheet {
  /**
   * Maintain a copy of the original to show a real-time preview of changes.
   * @type {AmbientLightDocument}
   */
  preview;

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

  /** @inheritdoc */
  async _render(force, options) {
    const states = Application.RENDER_STATES;
    if ( force && [states.CLOSED, states.NONE].includes(this._state) && this.document.object ) {
      if ( !this.preview ) {
        const clone = this.document.object.clone();
        this.preview = clone.document;
      }
      await this.preview.object.draw();
      this.document.object.renderable = false;
      this.preview.object.layer.preview.addChild(this.preview.object);
      this._previewChanges();
    }
    return super._render(force, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const context = super.getData(options);
    delete context.document; // Replaced below
    return foundry.utils.mergeObject(context, {
      data: this.preview.toObject(false),
      document: this.preview,
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
    const states = Application.RENDER_STATES;
    if ( options.force || [states.RENDERED, states.ERROR].includes(this._state) ) {
      this._resetPreview();
    }
    await super.close(options);
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
   * @param {object} [change]  A change to preview.
   * @protected
   */
  _previewChanges(change) {
    if ( !this.preview ) return;
    if ( change ) this.preview.updateSource(change);
    if ( this.preview.object?.destroyed === false ) {
      this.preview.object.renderFlags.set({refresh: true});
      this.preview.object.updateSource();
    }
  }

  /* -------------------------------------------- */

  /**
   * Restore the true data for the AmbientLight document when the form is submitted or closed.
   * @protected
   */
  _resetPreview() {
    if ( !this.preview ) return;
    if ( this.preview.object?.destroyed === false ) {
      this.preview.object.destroy({children: true});
    }
    this.preview = null;
    if ( this.document.object?.destroyed === false ) {
      this.document.object.renderable = true;
      this.document.object.renderFlags.set({refresh: true});
      this.document.object.updateSource();
    }
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
