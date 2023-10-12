/**
 * An Application responsible for allowing GMs to configure the default sheets that are used for the Documents in their
 * world.
 */
class DefaultSheetsConfig extends PackageConfiguration {
  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: game.i18n.localize("SETTINGS.DefaultSheetsL"),
      id: "default-sheets-config",
      categoryTemplate: "templates/sidebar/apps/default-sheets-config.html",
      submitButton: true
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _prepareCategoryData() {
    let total = 0;
    const categories = [];
    for ( const cls of Object.values(foundry.documents) ) {
      const documentName = cls.documentName;
      if ( !cls.hasTypeData ) continue;
      const subTypes = game.documentTypes[documentName].filter(t => t !== CONST.BASE_DOCUMENT_TYPE);
      if ( !subTypes.length ) continue;
      const title = game.i18n.localize(cls.metadata.labelPlural);
      categories.push({
        title,
        id: documentName,
        count: subTypes.length,
        subTypes: subTypes.map(t => {
          const typeLabel = CONFIG[documentName].typeLabels?.[t];
          const name = typeLabel ? game.i18n.localize(typeLabel) : t;
          const {defaultClasses, defaultClass} = DocumentSheetConfig.getSheetClassesForSubType(documentName, t);
          return {type: t, name, defaultClasses, defaultClass};
        })
      });
      total += subTypes.length;
    }
    return {categories, total};
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {
    const settings = Object.entries(formData).reduce((obj, [name, sheetId]) => {
      const [documentName, ...rest] = name.split(".");
      const subType = rest.join(".");
      const cfg = CONFIG[documentName].sheetClasses?.[subType]?.[sheetId];
      // Do not create an entry in the settings object if the class is already the default.
      if ( cfg?.default ) return obj;
      const entry = obj[documentName] ??= {};
      entry[subType] = sheetId;
      return obj;
    }, {});
    return game.settings.set("core", "sheetClasses", settings);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onResetDefaults(event) {
    event.preventDefault();
    await game.settings.set("core", "sheetClasses", {});
    return SettingsConfig.reloadConfirm({world: true});
  }
}
