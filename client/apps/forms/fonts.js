/**
 * @typedef {object} NewFontDefinition
 * @property {string} [family]          The font family.
 * @property {number} [weight=400]      The font weight.
 * @property {string} [style="normal"]  The font style.
 * @property {string} [src=""]          The font file.
 * @property {string} [preview]         The text to preview the font.
 */

/**
 * A class responsible for configuring custom fonts for the world.
 * @extends {FormApplication}
 */
class FontConfig extends FormApplication {
  /**
   * An application for configuring custom world fonts.
   * @param {NewFontDefinition} [object]  The default settings for new font definition creation.
   * @param {object} [options]            Additional options to configure behaviour.
   */
  constructor(object={}, options={}) {
    foundry.utils.mergeObject(object, {
      family: "",
      weight: 400,
      style: "normal",
      src: "",
      preview: game.i18n.localize("FONTS.FontPreview"),
      type: FontConfig.FONT_TYPES.FILE
    });
    super(object, options);
  }

  /* -------------------------------------------- */

  /**
   * Whether fonts have been modified since opening the application.
   * @type {boolean}
   */
  #fontsModified = false;

  /* -------------------------------------------- */

  /**
   * The currently selected font.
   * @type {{family: string, index: number}|null}
   */
  #selected = null;

  /* -------------------------------------------- */

  /**
   * Whether the given font is currently selected.
   * @param {{family: string, index: number}} selection  The font selection information.
   * @returns {boolean}
   */
  #isSelected({family, index}) {
    if ( !this.#selected ) return false;
    return (family === this.#selected.family) && (index === this.#selected.index);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: game.i18n.localize("SETTINGS.FontConfigL"),
      id: "font-config",
      template: "templates/sidebar/apps/font-config.html",
      popOut: true,
      width: 600,
      height: "auto",
      closeOnSubmit: false,
      submitOnChange: true
    });
  }

  /* -------------------------------------------- */

  /**
   * Whether a font is distributed to connected clients or found on their OS.
   * @enum {string}
   */
  static FONT_TYPES = {
    FILE: "file",
    SYSTEM: "system"
  };

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const definitions = game.settings.get("core", this.constructor.SETTING);
    const fonts = Object.entries(definitions).flatMap(([family, definition]) => {
      return this._getDataForDefinition(family, definition);
    });
    let selected;
    if ( (this.#selected === null) && fonts.length ) {
      fonts[0].selected = true;
      this.#selected = {family: fonts[0].family, index: fonts[0].index};
    }
    if ( fonts.length ) selected = definitions[this.#selected.family].fonts[this.#selected.index];
    return {
      fonts, selected,
      font: this.object,
      family: this.#selected?.family,
      weights: Object.entries(CONST.FONT_WEIGHTS).map(([k, v]) => ({value: v, label: `${k} ${v}`}))
    };
  }

  /* -------------------------------------------- */

  /**
   * Template data for a given font definition.
   * @param {string} family                    The font family.
   * @param {FontFamilyDefinition} definition  The font family definition.
   * @returns {object[]}
   * @protected
   */
  _getDataForDefinition(family, definition) {
    const fonts = definition.fonts.length ? definition.fonts : [{}];
    return fonts.map((f, i) => {
      const data = {family, index: i};
      if ( this.#isSelected(data) ) data.selected = true;
      data.font = this.constructor._formatFont(family, f);
      return data;
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.find("[contenteditable]").on("blur", this._onSubmit.bind(this));
    html.find(".control").on("click", this._onClickControl.bind(this));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {
    foundry.utils.mergeObject(this.object, formData);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options={}) {
    await super.close(options);
    if ( this.#fontsModified ) return SettingsConfig.reloadConfirm({world: true});
  }

  /* -------------------------------------------- */

  /**
   * Handle application controls.
   * @param {MouseEvent} event  The click event.
   * @protected
   */
  _onClickControl(event) {
    switch ( event.currentTarget.dataset.action ) {
      case "add": return this._onAddFont();
      case "delete": return this._onDeleteFont(event);
      case "select": return this._onSelectFont(event);
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onChangeInput(event) {
    this._updateFontFields();
    return super._onChangeInput(event);
  }

  /* -------------------------------------------- */

  /**
   * Update available font fields based on the font type selected.
   * @protected
   */
  _updateFontFields() {
    const type = this.form.elements.type.value;
    const isSystemFont = type === this.constructor.FONT_TYPES.SYSTEM;
    ["weight", "style", "src"].forEach(name => {
      const input = this.form.elements[name];
      if ( input ) input.closest(".form-group")?.classList.toggle("hidden", isSystemFont);
    });
    this.setPosition();
  }

  /* -------------------------------------------- */

  /**
   * Add a new custom font definition.
   * @protected
   */
  async _onAddFont() {
    const {family, src, weight, style, type} = this._getSubmitData();
    const definitions = game.settings.get("core", this.constructor.SETTING);
    definitions[family] ??= {editor: true, fonts: []};
    const definition = definitions[family];
    const count = type === this.constructor.FONT_TYPES.FILE ? definition.fonts.push({urls: [src], weight, style}) : 1;
    await game.settings.set("core", this.constructor.SETTING, definitions);
    await this.constructor.loadFont(family, definition);
    this.#selected = {family, index: count - 1};
    this.#fontsModified = true;
    this.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Delete a font.
   * @param {MouseEvent} event  The click event.
   * @protected
   */
  async _onDeleteFont(event) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget.closest("[data-family]");
    const {family, index} = target.dataset;
    const definitions = game.settings.get("core", this.constructor.SETTING);
    const definition = definitions[family];
    if ( !definition ) return;
    this.#fontsModified = true;
    definition.fonts.splice(Number(index), 1);
    if ( !definition.fonts.length ) delete definitions[family];
    await game.settings.set("core", this.constructor.SETTING, definitions);
    if ( this.#isSelected({family, index: Number(index)}) ) this.#selected = null;
    this.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Select a font to preview.
   * @param {MouseEvent} event  The click event.
   * @protected
   */
  _onSelectFont(event) {
    const {family, index} = event.currentTarget.dataset;
    this.#selected = {family, index: Number(index)};
    this.render(true);
  }

  /* -------------------------------------------- */
  /*  Font Management Methods                     */
  /* -------------------------------------------- */

  /**
   * Define the setting key where this world's font information will be stored.
   * @type {string}
   */
  static SETTING = "fonts";

  /* -------------------------------------------- */

  /**
   * A list of fonts that were correctly loaded and are available for use.
   * @type {Set<string>}
   * @private
   */
  static #available = new Set();

  /* -------------------------------------------- */

  /**
   * Get the list of fonts that successfully loaded.
   * @returns {string[]}
   */
  static getAvailableFonts() {
    return Array.from(this.#available);
  }

  /* -------------------------------------------- */

  /**
   * Get the list of fonts formatted for display with selectOptions.
   * @returns {Object<string>}
   */
  static getAvailableFontChoices() {
    return this.getAvailableFonts().reduce((obj, f) => {
      obj[f] = f;
      return obj;
    }, {});
  }

  /* -------------------------------------------- */

  /**
   * Load a font definition.
   * @param {string} family                    The font family name (case-sensitive).
   * @param {FontFamilyDefinition} definition  The font family definition.
   * @returns {Promise<boolean>}               Returns true if the font was successfully loaded.
   */
  static async loadFont(family, definition) {
    const font = `1rem "${family}"`;
    try {
      for ( const font of definition.fonts ) {
        const fontFace = this._createFontFace(family, font);
        await fontFace.load();
        document.fonts.add(fontFace);
      }
      await document.fonts.load(font);
    } catch(err) {
      console.warn(`Font family "${family}" failed to load: `, err);
      return false;
    }
    if ( !document.fonts.check(font) ) {
      console.warn(`Font family "${family}" failed to load.`);
      return false;
    }
    if ( definition.editor ) this.#available.add(family);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Ensure that fonts have loaded and are ready for use.
   * Enforce a maximum timeout in milliseconds.
   * Proceed after that point even if fonts are not yet available.
   * @param {number} [ms=4500]  The maximum time to spend loading fonts before proceeding.
   * @returns {Promise<void>}
   * @internal
   */
  static async _loadFonts(ms=4500) {
    const allFonts = this._collectDefinitions();
    const promises = [];
    for ( const definitions of allFonts ) {
      for ( const [family, definition] of Object.entries(definitions) ) {
        promises.push(this.loadFont(family, definition));
      }
    }
    const timeout = new Promise(resolve => setTimeout(resolve, ms));
    const ready = Promise.all(promises).then(() => document.fonts.ready);
    return Promise.race([ready, timeout]).then(() => console.log(`${vtt} | Fonts loaded and ready.`));
  }

  /* -------------------------------------------- */

  /**
   * Collect all the font definitions and combine them.
   * @returns {Object<FontFamilyDefinition>[]}
   * @protected
   */
  static _collectDefinitions() {
    /**
     * @deprecated since v10.
     */
    const legacyFamilies = CONFIG._fontFamilies.reduce((obj, f) => {
      obj[f] = {editor: true, fonts: []};
      return obj;
    }, {});
    return [CONFIG.fontDefinitions, game.settings.get("core", this.SETTING), legacyFamilies];
  }

  /* -------------------------------------------- */

  /**
   * Create FontFace object from a FontDefinition.
   * @param {string} family        The font family name.
   * @param {FontDefinition} font  The font definition.
   * @returns {FontFace}
   * @protected
   */
  static _createFontFace(family, font) {
    const urls = font.urls.map(url => `url("${url}")`).join(", ");
    return new FontFace(family, urls, font);
  }

  /* -------------------------------------------- */

  /**
   * Format a font definition for display.
   * @param {string} family              The font family.
   * @param {FontDefinition} definition  The font definition.
   * @returns {string}                   The formatted definition.
   * @private
   */
  static _formatFont(family, definition) {
    if ( foundry.utils.isEmpty(definition) ) return family;
    const {weight, style} = definition;
    const byWeight = Object.fromEntries(Object.entries(CONST.FONT_WEIGHTS).map(([k, v]) => [v, k]));
    return `
      ${family},
      <span style="font-weight: ${weight}">${byWeight[weight]} ${weight}</span>,
      <span style="font-style: ${style}">${style.toLowerCase()}</span>
    `;
  }
}
