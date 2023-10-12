/**
 * A form application for managing core server configuration options.
 * @extends FormApplication
 * @see config.ApplicationConfiguration
 */
class ApplicationConfigurationForm extends FormApplication {

  /**
   * An ApplicationConfiguration instance which is used for validation and processing of form changes.
   * @type {config.ApplicationConfiguration}
   */
  config = new foundry.config.ApplicationConfiguration(this.object);

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "configuration",
      template: "templates/setup/application-configuration.html",
      popOut: false
    });
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options={}) {
    const worlds = Array.from(game.worlds.values());
    worlds.sort((a, b) => a.title.localeCompare(b.title));
    return {
      config: this.config.toObject(),
      cssClass: ["tab", "flexcol", ui.setup?.activeTab === this.options.id ? "active": ""].filterJoin(" "),
      cssId: this.options.id,
      languages: game.data.languages,
      fields: this.config.schema.fields,
      worlds: worlds
    };
  }

  /* -------------------------------------------- */

  /** @override */
  async _onSubmit(event, options={}) {
    event.preventDefault();
    const original = this.config.toObject();

    // Validate the proposed changes
    const formData = this._getSubmitData();
    let changes;
    try {
      changes = this.config.updateSource(formData);
    } catch(err) {
      return ui.notifications.error(err.message);
    }
    if ( foundry.utils.isEmpty(changes) ) return;

    // Confirm that a server restart is okay
    const confirm = await Dialog.confirm({
      title: game.i18n.localize("SETUP.ConfigSave"),
      content: `<p>${game.i18n.localize("SETUP.ConfigSaveWarning")}</p>`,
      defaultYes: false
    });

    // Submit the form
    if ( confirm ) {
      this.element.html(`<p class="notification warning">${game.i18n.localize("SETUP.ConfigSaveRestart")}</p>`);
      return ui.setup._post({action: "adminConfigure", config: changes});
    }

    // Reset the form
    else {
      this.config.updateSource(original);
      return this.render();
    }
  }
}
