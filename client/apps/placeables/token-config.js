/**
 * The Application responsible for configuring a single Token document within a parent Scene.
 * @param {TokenDocument|Actor} object          The {@link TokenDocument} being configured or an {@link Actor} for whom
 *                                              to configure the {@link PrototypeToken}
 * @param {FormApplicationOptions} [options]    Application configuration options.
 */
class TokenConfig extends DocumentSheet {
  constructor(object, options) {
    super(object, options);

    /**
     * The placed Token object in the Scene
     * @type {Token}
     */
    this.token = this.object;

    /**
     * A reference to the Actor which the token depicts
     * @type {Actor}
     */
    this.actor = this.object.actor;

    // Configure options
    if ( this.isPrototype ) this.options.sheetConfig = false;
  }

  /**
   * Preserve a copy of the original document before any changes are made.
   * @type {object}
   */
  original;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sheet", "token-sheet"],
      template: "templates/scene/token-config.html",
      width: 480,
      height: "auto",
      tabs: [
        {navSelector: '.tabs[data-group="main"]', contentSelector: "form", initial: "character"},
        {navSelector: '.tabs[data-group="light"]', contentSelector: '.tab[data-tab="light"]', initial: "basic"},
        {navSelector: '.tabs[data-group="vision"]', contentSelector: '.tab[data-tab="vision"]', initial: "basic"}
      ],
      viewPermission: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
      sheetConfig: true
    });
  }

  /* -------------------------------------------- */

  /**
   * A convenience accessor to test whether we are configuring the prototype Token for an Actor.
   * @type {boolean}
   */
  get isPrototype() {
    return this.object instanceof foundry.data.PrototypeToken;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  get id() {
    if ( this.isPrototype ) return `${this.constructor.name}-${this.actor.uuid}`;
    else return super.id;
  }

  /* -------------------------------------------- */


  /** @inheritdoc */
  get title() {
    if ( this.isPrototype ) return `${game.i18n.localize("TOKEN.TitlePrototype")}: ${this.actor.name}`;
    return `${game.i18n.localize("TOKEN.Title")}: ${this.token.name}`;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  render(force=false, options={}) {
    if ( !this.rendered ) this.original = this.object.toObject();
    if ( this.isPrototype ) {
      this.options.editable = true;
      return FormApplication.prototype.render.call(this, force, options);
    }
    return super.render(force, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _canUserView(user) {
    const canView = super._canUserView(user);
    return canView && game.user.can("TOKEN_CONFIGURE");
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async getData(options={}) {
    const alternateImages = await this._getAlternateTokenImages();
    const attributes = TokenDocument.implementation.getTrackedAttributes(this.actor?.system ?? {});
    const canBrowseFiles = game.user.hasPermission("FILES_BROWSE");
    const gridUnits = (this.isPrototype || !canvas.ready) ? game.system.gridUnits : canvas.scene.grid.units;

    // Prepare Token data
    const token = this.object.toObject();
    const basicDetection = token.detectionModes.find(m => m.id === DetectionMode.BASIC_MODE_ID) ? null
      : this.object.detectionModes.find(m => m.id === DetectionMode.BASIC_MODE_ID);

    // Return rendering context
    return {
      cssClasses: [this.isPrototype ? "prototype" : null].filter(c => !!c).join(" "),
      isPrototype: this.isPrototype,
      hasAlternates: !foundry.utils.isEmpty(alternateImages),
      alternateImages: alternateImages,
      object: token,
      options: this.options,
      gridUnits: gridUnits || game.i18n.localize("GridUnits"),
      barAttributes: TokenDocument.implementation.getTrackedAttributeChoices(attributes),
      bar1: this.token.getBarAttribute?.("bar1"),
      bar2: this.token.getBarAttribute?.("bar2"),
      colorationTechniques: AdaptiveLightingShader.SHADER_TECHNIQUES,
      visionModes: Object.values(CONFIG.Canvas.visionModes).filter(f => f.tokenConfig),
      detectionModes: Object.values(CONFIG.Canvas.detectionModes).filter(f => f.tokenConfig),
      basicDetection,
      displayModes: Object.entries(CONST.TOKEN_DISPLAY_MODES).reduce((obj, e) => {
        obj[e[1]] = game.i18n.localize(`TOKEN.DISPLAY_${e[0]}`);
        return obj;
      }, {}),
      actors: game.actors.reduce((actors, a) => {
        if ( !a.isOwner ) return actors;
        actors.push({_id: a.id, name: a.name});
        return actors;
      }, []).sort((a, b) => a.name.localeCompare(b.name)),
      dispositions: Object.entries(CONST.TOKEN_DISPOSITIONS).reduce((obj, e) => {
        obj[e[1]] = game.i18n.localize(`TOKEN.${e[0]}`);
        return obj;
      }, {}),
      lightAnimations: Object.entries(CONFIG.Canvas.lightAnimations).reduce((obj, e) => {
        obj[e[0]] = game.i18n.localize(e[1].label);
        return obj;
      }, {"": game.i18n.localize("None")}),
      isGM: game.user.isGM,
      randomImgEnabled: this.isPrototype && (canBrowseFiles || this.object.randomImg),
      scale: Math.abs(this.object.texture.scaleX),
      mirrorX: this.object.texture.scaleX < 0,
      mirrorY: this.object.texture.scaleY < 0
    };
  }

  /* --------------------------------------------- */

  /** @inheritdoc */
  async _renderInner(...args) {
    await loadTemplates([
      "templates/scene/parts/token-lighting.html",
      "templates/scene/parts/token-vision.html",
      "templates/scene/parts/token-resources.html"
    ]);
    return super._renderInner(...args);
  }

  /* -------------------------------------------- */

  /**
   * Get an Object of image paths and filenames to display in the Token sheet
   * @returns {Promise<object>}
   * @private
   */
  async _getAlternateTokenImages() {
    if ( !this.actor?.prototypeToken.randomImg ) return {};
    const alternates = await this.actor.getTokenImages();
    return alternates.reduce((obj, img) => {
      obj[img] = img.split("/").pop();
      return obj;
    }, {});
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".action-button").click(this._onClickActionButton.bind(this));
    html.find(".bar-attribute").change(this._onBarChange.bind(this));
    html.find(".alternate-images").change(ev => ev.target.form["texture.src"].value = ev.target.value);
    html.find("button.assign-token").click(this._onAssignToken.bind(this));
    this._disableEditImage();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options={}) {
    if ( !options.force ) this._resetPreview();
    await super.close(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getSubmitData(updateData={}) {
    const formData = super._getSubmitData(updateData);

    // Mirror token scale
    if ( "scale" in formData ) {
      formData["texture.scaleX"] = formData.scale * (formData.mirrorX ? -1 : 1);
      formData["texture.scaleY"] = formData.scale * (formData.mirrorY ? -1 : 1);
    }
    ["scale", "mirrorX", "mirrorY"].forEach(k => delete formData[k]);

    // Clear detection modes array
    if ( !("detectionModes.0.id" in formData) ) formData.detectionModes = [];

    // Treat "None" as null for bar attributes
    formData["bar1.attribute"] ||= null;
    formData["bar2.attribute"] ||= null;
    return formData;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onChangeInput(event) {
    await super._onChangeInput(event);

    // Disable image editing for wildcards
    this._disableEditImage();

    // Pre-populate vision mode defaults
    const element = event.target;
    if ( element.name === "sight.visionMode" ) {
      const visionDefaults = CONFIG.Canvas.visionModes[element.value]?.vision?.defaults || {};
      const update = fieldName => {
        const field = this.form.querySelector(`[name="sight.${fieldName}"]`);
        if ( fieldName in visionDefaults ) {
          field.valueAsNumber = visionDefaults[fieldName];
          field.nextElementSibling.innerText = visionDefaults[fieldName];
        }
      };
      for ( const fieldName of ["attenuation", "brightness", "saturation", "contrast"] ) update(fieldName);
    }

    // Preview token changes
    const previewData = this._getSubmitData();
    this._previewChanges(previewData);
  }

  /* -------------------------------------------- */

  /**
   * Mimic changes to the Token document as if they were true document updates.
   * @param {object} change         Data which simulates a document update
   * @param {boolean} [reset=false] To know if this preview change is a reset
   * @protected
   */
  _previewChanges(change, reset=false) {
    // Don't trigger updates for these values if we're just previewing or resetting after closing the form
    delete change.actorId;
    delete change.actorLink;
    this.object.updateSource(foundry.utils.mergeObject(this.original, change, {inplace: false}), {recursive: false});
    if ( this.isPrototype || reset ) return;
    this.object._onUpdate(change, {animate: false, render: false, preview: true}, game.user.id);
  }

  /* -------------------------------------------- */

  /**
   * Reset the temporary preview of the Token when the form is submitted or closed.
   * @protected
   */
  _resetPreview() {
    this._previewChanges(this.original, this._state === this.constructor.RENDER_STATES.CLOSING);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {
    this._resetPreview();
    return this.token.update(formData);
  }

  /* -------------------------------------------- */

  /**
   * Handle Token assignment requests to update the default prototype Token
   * @param {MouseEvent} event  The left-click event on the assign token button
   * @private
   */
  async _onAssignToken(event) {
    event.preventDefault();

    // Get controlled Token data
    let tokens = canvas.ready ? canvas.tokens.controlled : [];
    if ( tokens.length !== 1 ) {
      ui.notifications.warn("TOKEN.AssignWarn", {localize: true});
      return;
    }
    const token = tokens.pop().document.toObject();
    token.tokenId = token.x = token.y = null;

    // Update the prototype token for the actor using the existing Token instance
    await this.actor.update({prototypeToken: token}, {diff: false, recursive: false, noHook: true});
    ui.notifications.info(game.i18n.format("TOKEN.AssignSuccess", {name: this.actor.name}));

    // Update the source of truth data and re-render
    this.original = this.object.toObject();
    return this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle changing the attribute bar in the drop-down selector to update the default current and max value
   * @param {Event} event  The select input change event
   * @private
   */
  async _onBarChange(event) {
    const form = event.target.form;
    const attr = this.token.getBarAttribute("", {alternative: event.target.value});
    const bar = event.target.name.split(".").shift();
    form.querySelector(`input.${bar}-value`).value = attr !== null ? attr.value : "";
    form.querySelector(`input.${bar}-max`).value = ((attr !== null) && (attr.type === "bar")) ? attr.max : "";
  }

  /* -------------------------------------------- */

  /**
   * Handle click events on a token configuration sheet action button
   * @param {PointerEvent} event    The originating click event
   * @protected
   */
  _onClickActionButton(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const action = button.dataset.action;
    game.tooltip.deactivate();

    // Get pending changes to modes
    const modes = Object.values(foundry.utils.expandObject(this._getSubmitData())?.detectionModes || {});

    // Manipulate the array
    switch ( action ) {
      case "addDetectionMode":
        modes.push({id: "", range: 0, enabled: true});
        break;
      case "removeDetectionMode":
        let idx = button.closest(".detection-mode").dataset.index;
        modes.splice(idx, 1);
        break;
    }

    // Preview the detection mode change
    this._previewChanges({detectionModes: modes});
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Disable the user's ability to edit the token image field if wildcard images are enabled and that user does not have
   * file browser permissions.
   * @private
   */
  _disableEditImage() {
    const img = this.form.querySelector('[name="texture.src"]');
    const randomImg = this.form.querySelector('[name="randomImg"]');
    if ( randomImg ) img.disabled = !game.user.hasPermission("FILES_BROWSE") && randomImg.checked;
  }
}

/**
 * A sheet that alters the values of the default Token configuration used when new Token documents are created.
 * @extends {TokenConfig}
 */
class DefaultTokenConfig extends TokenConfig {
  constructor(object, options) {
    const setting = game.settings.get("core", DefaultTokenConfig.SETTING);
    const cls = getDocumentClass("Token");
    object = new cls({name: "Default Token", ...setting}, {actor: null, strict: false});
    super(object, options);
  }

  /**
   * The named world setting that stores the default Token configuration
   * @type {string}
   */
  static SETTING = "defaultToken";

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "templates/scene/default-token-config.html",
      sheetConfig: false
    });
  }

  /* --------------------------------------------- */

  /** @inheritdoc */
  get id() {
    return "default-token-config";
  }

  /* --------------------------------------------- */

  /** @inheritdoc */
  get title() {
    return game.i18n.localize("SETTINGS.DefaultTokenN");
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    const context = await super.getData(options);
    return Object.assign(context, {
      object: this.token.toObject(false),
      isDefault: true,
      barAttributes: TokenDocument.implementation.getTrackedAttributeChoices(),
      bar1: this.token.bar1,
      bar2: this.token.bar2
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getSubmitData(updateData = {}) {
    const formData = foundry.utils.expandObject(super._getSubmitData(updateData));
    formData.light.color = formData.light.color || undefined;
    formData.bar1.attribute = formData.bar1.attribute || null;
    formData.bar2.attribute = formData.bar2.attribute || null;
    return formData;
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {

    // Validate the default data
    try {
      this.object.updateSource(formData);
      formData = foundry.utils.filterObject(this.token.toObject(), formData);
    } catch(err) {
      Hooks.onError("DefaultTokenConfig#_updateObject", err, {notify: "error"});
    }

    // Diff the form data against normal defaults
    const defaults = foundry.documents.BaseToken.cleanData();
    const delta = foundry.utils.diffObject(defaults, formData);
    return game.settings.set("core", DefaultTokenConfig.SETTING, delta);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.find('button[data-action="reset"]').click(this.reset.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Reset the form to default values
   * @returns {Promise<void>}
   */
  async reset() {
    const cls = getDocumentClass("Token");
    this.object = new cls({}, {actor: null, strict: false});
    this.token = this.object;
    this.render();
  }

  /* --------------------------------------------- */

  /** @inheritdoc */
  async _onBarChange() {}
}
