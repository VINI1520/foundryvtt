/**
 * @typedef {FormApplicationOptions} DrawingConfigOptions
 * @property {boolean} [configureDefault=false]  Configure the default drawing settings, instead of a specific Drawing
 */

/**
 * The Application responsible for configuring a single Drawing document within a parent Scene.
 * @extends {DocumentSheet}
 *
 * @param {Drawing} drawing               The Drawing object being configured
 * @param {DrawingConfigOptions} options  Additional application rendering options
 */
class DrawingConfig extends DocumentSheet {
  /**
   * @override
   * @returns {DrawingConfigOptions}
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "drawing-config",
      template: "templates/scene/drawing-config.html",
      width: 480,
      height: "auto",
      configureDefault: false,
      tabs: [{navSelector: ".tabs", contentSelector: "form", initial: "position"}]
    });
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    if ( this.options.configureDefault ) return game.i18n.localize("DRAWING.ConfigDefaultTitle");
    return super.title;
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options={}) {

    // Submit text
    let submit;
    if ( this.options.configureDefault ) submit = "DRAWING.SubmitDefault";
    else submit = this.document.id ? "DRAWING.SubmitUpdate" : "DRAWING.SubmitCreate";

    // Rendering context
    return {
      author: this.document.author?.name || "",
      isDefault: this.options.configureDefault,
      fillTypes: Object.entries(CONST.DRAWING_FILL_TYPES).reduce((obj, v) => {
        obj[v[1]] = `DRAWING.FillType${v[0].titleCase()}`;
        return obj;
      }, {}),
      scaledBezierFactor: this.document.bezierFactor * 2,
      fontFamilies: FontConfig.getAvailableFontChoices(),
      object: this.document.toObject(),
      options: this.options,
      submitText: submit
    };
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    if ( !this.object.isOwner ) throw new Error("You do not have the ability to configure this Drawing object.");

    // Un-scale the bezier factor
    formData.bezierFactor /= 2;

    // Configure the default Drawing settings
    if ( this.options.configureDefault ) {
      formData = foundry.utils.expandObject(formData);
      const defaults = DrawingDocument.cleanData(formData, {partial: true});
      return game.settings.set("core", DrawingsLayer.DEFAULT_CONFIG_SETTING, defaults);
    }

    // Rescale dimensions if needed
    const shape = this.object.shape;
    const w = formData["shape.width"];
    const h = formData["shape.height"];
    if ( shape && ((w !== shape.width) || (h !== shape.height)) ) {
      const dx = w - shape.width;
      const dy = h - shape.height;
      formData = foundry.utils.expandObject(formData);
      foundry.utils.mergeObject(formData, Drawing.rescaleDimensions(this.object, dx, dy));
    }

    // Create or update a Drawing
    if ( this.object.id ) return this.object.update(formData);
    return this.object.constructor.create(formData);
  }

  /* -------------------------------------------- */

  /** @override */
  async close(options) {
    await super.close(options);
    if ( this.preview ) {
      this.preview.removeChildren();
      this.preview = null;
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find('button[name="reset"]').click(this._onResetDefaults.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Reset the user Drawing configuration settings to their default values
   * @param {PointerEvent} event      The originating mouse-click event
   * @protected
   */
  _onResetDefaults(event) {
    event.preventDefault();
    this.object = DrawingDocument.fromSource({});
    this.render();
  }
}
