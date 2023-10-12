/**
 * The Application responsible for displaying and editing the client and world settings for this world.
 * This form renders the settings defined via the game.settings.register API which have config = true
 */
class SettingsConfig extends PackageConfiguration {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: game.i18n.localize("SETTINGS.Title"),
      id: "client-settings",
      categoryTemplate: "templates/sidebar/apps/settings-config-category.html",
      submitButton: true
    });
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareCategoryData() {
    const gs = game.settings;
    const canConfigure = game.user.can("SETTINGS_MODIFY");
    let categories = new Map();
    let total = 0;

    const getCategory = category => {
      let cat = categories.get(category.id);
      if ( !cat ) {
        cat = {
          id: category.id,
          title: category.title,
          menus: [],
          settings: [],
          count: 0
        };
        categories.set(category.id, cat);
      }
      return cat;
    };

    // Classify all menus
    for ( let menu of gs.menus.values() ) {
      if ( menu.restricted && !canConfigure ) continue;
      const category = getCategory(this._categorizeEntry(menu.namespace));
      category.menus.push(menu);
      total++;
    }

    // Classify all settings
    for ( let setting of gs.settings.values() ) {
      if ( !setting.config || (!canConfigure && (setting.scope !== "client")) ) continue;

      // Update setting data
      const s = foundry.utils.deepClone(setting);
      s.id = `${s.namespace}.${s.key}`;
      s.name = game.i18n.localize(s.name);
      s.hint = game.i18n.localize(s.hint);
      s.value = game.settings.get(s.namespace, s.key);
      s.type = setting.type instanceof Function ? setting.type.name : "String";
      s.isCheckbox = setting.type === Boolean;
      s.isSelect = s.choices !== undefined;
      s.isRange = (setting.type === Number) && s.range;
      s.isNumber = setting.type === Number;
      s.filePickerType = s.filePicker === true ? "any" : s.filePicker;

      const category = getCategory(this._categorizeEntry(setting.namespace));
      category.settings.push(s);
      total++;
    }

    // Sort categories by priority and assign Counts
    for ( let category of categories.values() ) {
      category.count = category.menus.length + category.settings.length;
    }
    categories = Array.from(categories.values()).sort(this._sortCategories.bind(this));
    return {categories, total, user: game.user, canConfigure};
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".submenu button").click(this._onClickSubmenu.bind(this));
    html.find('[name="core.fontSize"]').change(this._previewFontScaling.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle activating the button to configure User Role permissions
   * @param {Event} event   The initial button click event
   * @private
   */
  _onClickSubmenu(event) {
    event.preventDefault();
    const menu = game.settings.menus.get(event.currentTarget.dataset.key);
    if ( !menu ) return ui.notifications.error("No submenu found for the provided key");
    const app = new menu.type();
    return app.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Preview font scaling as the setting is changed.
   * @param {Event} event  The triggering event.
   * @private
   */
  _previewFontScaling(event) {
    const scale = Number(event.currentTarget.value);
    game.scaleFonts(scale);
    this.setPosition();
  }

  /* --------------------------------------------- */

  /** @inheritdoc */
  async close(options={}) {
    game.scaleFonts();
    return super.close(options);
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    let requiresClientReload = false;
    let requiresWorldReload = false;
    for ( let [k, v] of Object.entries(foundry.utils.flattenObject(formData)) ) {
      let s = game.settings.settings.get(k);
      let current = game.settings.get(s.namespace, s.key);
      if ( v === current ) continue;
      requiresClientReload ||= (s.scope === "client") && s.requiresReload;
      requiresWorldReload ||= (s.scope === "world") && s.requiresReload;
      await game.settings.set(s.namespace, s.key, v);
    }
    if ( requiresClientReload || requiresWorldReload ) this.constructor.reloadConfirm({world: requiresWorldReload});
  }

  /* -------------------------------------------- */

  /**
   * Handle button click to reset default settings
   * @param {Event} event   The initial button click event
   * @private
   */
  _onResetDefaults(event) {
    event.preventDefault();
    const form = this.element.find("form")[0];
    for ( let [k, v] of game.settings.settings.entries() ) {
      if ( !v.config ) continue;
      const input = form[k];
      if ( !input ) continue;
      if ( input.type === "checkbox" ) input.checked = v.default;
      else input.value = v.default;
      $(input).change();
    }
    ui.notifications.info("SETTINGS.ResetInfo", {localize: true});
  }

  /* -------------------------------------------- */

  /**
   * Confirm if the user wishes to reload the application.
   * @param {object} [options]               Additional options to configure the prompt.
   * @param {boolean} [options.world=false]  Whether to reload all connected clients as well.
   * @returns {Promise<void>}
   */
  static async reloadConfirm({world=false}={}) {
    const reload = await Dialog.confirm({
      title: game.i18n.localize("SETTINGS.ReloadPromptTitle"),
      content: `<p>${game.i18n.localize("SETTINGS.ReloadPromptBody")}</p>`
    });
    if ( !reload ) return;
    if ( world && game.user.isGM ) game.socket.emit("reload");
    foundry.utils.debouncedReload();
  }
}
