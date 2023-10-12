/**
 * Document Sheet Configuration Application
 */
class DocumentSheetConfig extends FormApplication {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["form", "sheet-config"],
      template: "templates/sheets/sheet-config.html",
      width: 400
    });
  }

  /**
   * An array of pending sheet assignments which are submitted before other elements of the framework are ready.
   * @type {object[]}
   * @private
   */
  static #pending = [];

  /* -------------------------------------------- */

  /** @inheritdoc */
  get title() {
    const name = this.object.name ?? game.i18n.localize(this.object.constructor.metadata.label);
    return `${name}: Sheet Configuration`;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  getData(options={}) {
    const {sheetClasses, defaultClasses, defaultClass} = this.constructor.getSheetClassesForSubType(
      this.object.documentName,
      this.object.type || CONST.BASE_DOCUMENT_TYPE
    );

    // Return data
    return {
      isGM: game.user.isGM,
      object: this.object.toObject(),
      options: this.options,
      sheetClass: this.object.getFlag("core", "sheetClass") ?? "",
      blankLabel: game.i18n.localize("SHEETS.DefaultSheet"),
      sheetClasses, defaultClass, defaultClasses
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {
    event.preventDefault();
    const original = this.getData({});
    const defaultSheetChanged = formData.defaultClass !== original.defaultClass;
    const documentSheetChanged = formData.sheetClass !== original.sheetClass;

    // Update world settings
    if ( game.user.isGM && defaultSheetChanged ) {
      const setting = game.settings.get("core", "sheetClasses") || {};
      const type = this.object.type || CONST.BASE_DOCUMENT_TYPE;
      foundry.utils.mergeObject(setting, {[`${this.object.documentName}.${type}`]: formData.defaultClass});
      await game.settings.set("core", "sheetClasses", setting);

      // Trigger a sheet change manually if it wouldn't be triggered by the normal ClientDocument#_onUpdate workflow.
      if ( !documentSheetChanged ) return this.object._onSheetChange({ sheetOpen: true });
    }

    // Update the document-specific override
    if ( documentSheetChanged ) return this.object.setFlag("core", "sheetClass", formData.sheetClass);
  }

  /* -------------------------------------------- */

  /**
   * Marshal information on the available sheet classes for a given document type and sub-type, and format it for
   * display.
   * @param {string} documentName  The Document type.
   * @param {string} subType       The Document sub-type.
   * @returns {{sheetClasses: object, defaultClasses: object, defaultClass: string}}
   */
  static getSheetClassesForSubType(documentName, subType) {
    const config = CONFIG[documentName];
    const defaultClasses = {};
    let defaultClass = null;
    const sheetClasses = Object.values(config.sheetClasses[subType]).reduce((obj, cfg) => {
      if ( cfg.canConfigure ) obj[cfg.id] = cfg.label;
      if ( cfg.default && !defaultClass ) defaultClass = cfg.id;
      if ( cfg.canConfigure && cfg.canBeDefault ) defaultClasses[cfg.id] = cfg.label;
      return obj;
    }, {});
    return {sheetClasses, defaultClasses, defaultClass};
  }

  /* -------------------------------------------- */
  /*  Configuration Methods
  /* -------------------------------------------- */

  /**
   * Initialize the configured Sheet preferences for Documents which support dynamic Sheet assignment
   * Create the configuration structure for supported documents
   * Process any pending sheet registrations
   * Update the default values from settings data
   */
  static initializeSheets() {
    for ( let cls of Object.values(foundry.documents) ) {
      const types = this._getDocumentTypes(cls);
      CONFIG[cls.documentName].sheetClasses = types.reduce((obj, type) => {
        obj[type] = {};
        return obj;
      }, {});
    }

    // Register any pending sheets
    this.#pending.forEach(p => {
      if ( p.action === "register" ) this.#registerSheet(p);
      else if ( p.action === "unregister" ) this.#unregisterSheet(p);
    });
    this.#pending = [];

    // Update default sheet preferences
    const defaults = game.settings.get("core", "sheetClasses");
    this.updateDefaultSheets(defaults);
  }

  /* -------------------------------------------- */

  static _getDocumentTypes(cls, types=[]) {
    if ( types.length ) return types;
    return game.documentTypes[cls.documentName];
  }

  /* -------------------------------------------- */

  /**
   * Register a sheet class as a candidate which can be used to display documents of a given type
   * @param {typeof ClientDocument} documentClass  The Document class for which to register a new Sheet option
   * @param {string} scope                         Provide a unique namespace scope for this sheet
   * @param {typeof DocumentSheet} sheetClass      A defined Application class used to render the sheet
   * @param {object} [config]                      Additional options used for sheet registration
   * @param {string|Function} [config.label]       A human-readable label for the sheet name, which will be localized
   * @param {string[]} [config.types]              An array of document types for which this sheet should be used
   * @param {boolean} [config.makeDefault=false]   Whether to make this sheet the default for provided types
   * @param {boolean} [config.canBeDefault=true]   Whether this sheet is available to be selected as a default sheet for
   *                                               all Documents of that type.
   * @param {boolean} [config.canConfigure=true]   Whether this sheet appears in the sheet configuration UI for users.
   */
  static registerSheet(documentClass, scope, sheetClass, {
    label, types, makeDefault=false, canBeDefault=true, canConfigure=true
  }={}) {
    const id = `${scope}.${sheetClass.name}`;
    const config = {documentClass, id, label, sheetClass, types, makeDefault, canBeDefault, canConfigure};
    if ( game.ready ) this.#registerSheet(config);
    else {
      config.action = "register";
      this.#pending.push(config);
    }
  }

  /**
   * Perform the sheet registration.
   * @param {object} config                               Configuration for how the sheet should be registered
   * @param {typeof ClientDocument} config.documentClass  The Document class being registered
   * @param {string} config.id                            The sheet ID being registered
   * @param {string} config.label                         The human-readable sheet label
   * @param {typeof DocumentSheet} config.sheetClass      The sheet class definition being registered
   * @param {object[]} config.types                       An array of types for which this sheet is added
   * @param {boolean} config.makeDefault                  Make this sheet the default for provided types?
   * @param {boolean} config.canBeDefault                 Whether this sheet is available to be selected as a default
   *                                                      sheet for all Documents of that type.
   * @param {boolean} config.canConfigure                 Whether the sheet appears in the sheet configuration UI for
   *                                                      users.
   */
  static #registerSheet({documentClass, id, label, sheetClass, types, makeDefault, canBeDefault, canConfigure}={}) {
    types = this._getDocumentTypes(documentClass, types);
    const classes = CONFIG[documentClass.documentName]?.sheetClasses;
    const defaults = game.ready ? game.settings.get("core", "sheetClasses") : {};
    if ( typeof classes !== "object" ) return;
    for ( const t of types ) {
      classes[t] ||= {};
      const existingDefault = defaults[documentClass.documentName]?.[t];
      const isDefault = existingDefault ? (existingDefault === id) : makeDefault;
      if ( isDefault ) Object.values(classes[t]).forEach(s => s.default = false);
      if ( label instanceof Function ) label = label();
      else if ( label ) label = game.i18n.localize(label);
      else label = id;
      classes[t][id] = {
        id, label, canBeDefault, canConfigure,
        cls: sheetClass,
        default: isDefault
      };
    }
  }

  /* -------------------------------------------- */

  /**
   * Unregister a sheet class, removing it from the list of available Applications to use for a Document type
   * @param {typeof ClientDocument} documentClass  The Document class for which to register a new Sheet option
   * @param {string} scope                         Provide a unique namespace scope for this sheet
   * @param {typeof DocumentSheet} sheetClass      A defined DocumentSheet subclass used to render the sheet
   * @param {object} [config]
   * @param {object[]} [config.types]              An Array of types for which this sheet should be removed
   */
  static unregisterSheet(documentClass, scope, sheetClass, {types}={}) {
    const id = `${scope}.${sheetClass.name}`;
    const config = {documentClass, id, types};
    if ( game.ready ) this.#unregisterSheet(config);
    else {
      config.action = "unregister";
      this.#pending.push(config);
    }
  }

  /**
   * Perform the sheet de-registration.
   * @param {object} config                               Configuration for how the sheet should be un-registered
   * @param {typeof ClientDocument} config.documentClass  The Document class being unregistered
   * @param {string} config.id                            The sheet ID being unregistered
   * @param {object[]} config.types                       An array of types for which this sheet is removed
   */
  static #unregisterSheet({documentClass, id, types}={}) {
    types = this._getDocumentTypes(documentClass, types);
    const classes = CONFIG[documentClass.documentName]?.sheetClasses;
    if ( typeof classes !== "object" ) return;
    for ( let t of types ) {
      delete classes[t][id];
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the current default Sheets using a new core world setting.
   * @param {object} setting
   */
  static updateDefaultSheets(setting={}) {
    if ( !Object.keys(setting).length ) return;
    for ( let cls of Object.values(foundry.documents) ) {
      const documentName = cls.documentName;
      const cfg = CONFIG[documentName];
      const classes = cfg.sheetClasses;
      const collection = cfg.collection?.instance ?? [];
      const defaults = setting[documentName];
      if ( !defaults ) continue;

      // Update default preference for registered sheets
      for ( let [type, sheetId] of Object.entries(defaults) ) {
        const sheets = Object.values(classes[type] || {});
        let requested = sheets.find(s => s.id === sheetId);
        if ( requested ) sheets.forEach(s => s.default = s.id === sheetId);
      }

      // Close and de-register any existing sheets
      for ( let document of collection ) {
        for ( const [id, app] of Object.entries(document.apps) ) {
          app.close();
          delete document.apps[id];
        }
        document._sheet = null;
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Initialize default sheet configurations for all document types.
   * @private
   */
  static _registerDefaultSheets() {
    const defaultSheets = {
      // Documents
      Actor: ActorSheet,
      Adventure: AdventureImporter,
      Folder: FolderConfig,
      Item: ItemSheet,
      JournalEntry: JournalSheet,
      Macro: MacroConfig,
      Playlist: PlaylistConfig,
      RollTable: RollTableConfig,
      Scene: SceneConfig,
      User: UserConfig,
      // Embedded Documents
      ActiveEffect: ActiveEffectConfig,
      AmbientLight: AmbientLightConfig,
      AmbientSound: AmbientSoundConfig,
      Card: CardConfig,
      Combatant: CombatantConfig,
      Drawing: DrawingConfig,
      MeasuredTemplate: MeasuredTemplateConfig,
      Note: NoteConfig,
      PlaylistSound: PlaylistSoundConfig,
      Tile: TileConfig,
      Token: TokenConfig,
      Wall: WallConfig
    };

    Object.values(foundry.documents).forEach(base => {
      const type = base.documentName;
      const cfg = CONFIG[type];
      cfg.sheetClasses = {};
      const defaultSheet = defaultSheets[type];
      if ( !defaultSheet ) return;
      DocumentSheetConfig.registerSheet(cfg.documentClass, "core", defaultSheet, {
        makeDefault: true,
        label: () => game.i18n.format("SHEETS.DefaultDocumentSheet", {document: game.i18n.localize(`DOCUMENT.${type}`)})
      });
    });
    DocumentSheetConfig.registerSheet(Cards, "core", CardsConfig, {
      label: "CARDS.CardsDeck",
      types: ["deck"],
      makeDefault: true
    });
    DocumentSheetConfig.registerSheet(Cards, "core", CardsHand, {
      label: "CARDS.CardsHand",
      types: ["hand"],
      makeDefault: true
    });
    DocumentSheetConfig.registerSheet(Cards, "core", CardsPile, {
      label: "CARDS.CardsPile",
      types: ["pile"],
      makeDefault: true
    });
    DocumentSheetConfig.registerSheet(JournalEntryPage, "core", JournalTextTinyMCESheet, {
      types: ["text"],
      label: () => game.i18n.localize("EDITOR.TinyMCE")
    });
    DocumentSheetConfig.registerSheet(JournalEntryPage, "core", JournalImagePageSheet, {
      types: ["image"],
      makeDefault: true,
      label: () =>
        game.i18n.format("JOURNALENTRYPAGE.DefaultPageSheet", {page: game.i18n.localize("JOURNALENTRYPAGE.TypeImage")})
    });
    DocumentSheetConfig.registerSheet(JournalEntryPage, "core", JournalVideoPageSheet, {
      types: ["video"],
      makeDefault: true,
      label: () =>
        game.i18n.format("JOURNALENTRYPAGE.DefaultPageSheet", {page: game.i18n.localize("JOURNALENTRYPAGE.TypeVideo")})
    });
    DocumentSheetConfig.registerSheet(JournalEntryPage, "core", JournalPDFPageSheet, {
      types: ["pdf"],
      makeDefault: true,
      label: () =>
        game.i18n.format("JOURNALENTRYPAGE.DefaultPageSheet", {page: game.i18n.localize("JOURNALENTRYPAGE.TypePDF")})
    });
    DocumentSheetConfig.registerSheet(JournalEntryPage, "core", JournalTextPageSheet, {
      types: ["text"],
      makeDefault: true,
      label: () => {
        return game.i18n.format("JOURNALENTRYPAGE.DefaultPageSheet", {
          page: game.i18n.localize("JOURNALENTRYPAGE.TypeText")
        });
      }
    });
    DocumentSheetConfig.registerSheet(JournalEntryPage, "core", MarkdownJournalPageSheet, {
      types: ["text"],
      label: () => game.i18n.localize("EDITOR.Markdown")
    });
  }
}
