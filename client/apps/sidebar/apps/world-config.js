/**
 * @typedef {FormApplicationOptions} WorldConfigOptions
 * @property {boolean} [create=false]  Whether the world is being created or updated.
 */

/**
 * The World Management setup application
 * @param {World} object                      The world being configured.
 * @param {WorldConfigOptions} [options]      Application configuration options.
 */
class WorldConfig extends FormApplication {
  /**
   * @override
   * @returns {WorldConfigOptions}
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "world-config",
      template: "templates/setup/world-config.hbs",
      width: 620,
      height: "auto",
      create: false
    });
  }

  /**
   * A semantic alias for the World object which is being configured by this form.
   * @type {World}
   */
  get world() {
    return this.object;
  }

  /**
   * The website knowledge base URL.
   * @type {string}
   * @private
   */
  static #WORLD_KB_URL = "https://foundryvtt.com/article/game-worlds/";

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return this.options.create ? game.i18n.localize("WORLD.TitleCreate")
      : `${game.i18n.localize("WORLD.TitleEdit")}: ${this.world.title}`;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.find('[name="title"]').on("input", this.#onTitleChange.bind(this));
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options={}) {
    const ac = CONST.PACKAGE_AVAILABILITY_CODES;
    const nextDate = new Date(this.world.nextSession || undefined);
    const context = {
      world: this.world,
      isCreate: this.options.create,
      submitText: game.i18n.localize(this.options.create ? "WORLD.TitleCreate" : "WORLD.SubmitEdit"),
      nextDate: nextDate.isValid() ? nextDate.toDateInputString() : "",
      nextTime: nextDate.isValid() ? nextDate.toTimeInputString() : "",
      worldKbUrl: WorldConfig.#WORLD_KB_URL,
      inWorld: !!game.world,
      themes: CONST.WORLD_JOIN_THEMES
    };
    context.showEditFields = !context.isCreate && !context.inWorld;
    if ( game.systems ) {
      context.systems = game.systems.filter(system => {
        if ( this.world.system === system.id ) return true;
        return ( system.availability <= ac.UNVERIFIED_GENERATION );
      }).sort((a, b) => a.title.localeCompare(b.title));
    }
    return context;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _getSubmitData(updateData={}) {
    const data = super._getSubmitData(updateData);

    // Augment submission actions
    if ( this.options.create ) {
      data.action = "createWorld";
      if ( !data.id.length ) data.id = data.title.slugify({strict: true});
    }
    else {
      data.id = this.world.id;
      if ( !data.resetKeys ) delete data.resetKeys;
      if ( !data.safeMode ) delete data.safeMode;
    }

    // Handle next session schedule fields
    if ( data.nextSession.some(t => !!t) ) {
      const now = new Date();
      const dateStr = `${data.nextSession[0] || now.toDateString()} ${data.nextSession[1] || now.toTimeString()}`;
      const date = new Date(dateStr);
      data.nextSession = isNaN(Number(date)) ? null : date.toISOString();
    }
    else data.nextSession = null;

    if ( data.joinTheme === CONST.WORLD_JOIN_THEMES.default ) delete data.joinTheme;
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    formData = foundry.utils.expandObject(formData);
    const form = event.target || this.form;
    form.disable = true;

    // Validate the submission data
    try {
      this.world.validate({changes: formData, clean: true});
      formData.action = this.options.create ? "createWorld" : "editWorld";
    } catch(err) {
      ui.notifications.error(err.message.replace("\n", ". "));
      throw err;
    }

    // Dispatch the POST request
    let response;
    try {
      response = await foundry.utils.fetchJsonWithTimeout(foundry.utils.getRoute("setup"), {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(formData)
      });
      form.disabled = false;

      // Display error messages
      if (response.error) return ui.notifications.error(response.error);
    }
    catch(e) {
      return ui.notifications.error(e);
    }

    // Handle successful creation
    if ( formData.action === "createWorld" ) {
      const world = new this.world.constructor(response);
      game.worlds.set(world.id, world);
    }
    else this.world.updateSource(response);
    if ( ui.setup ) ui.setup.refresh(); // TODO old V10
    if ( ui.setupPackages ) ui.setupPackages.render(); // New v11
  }

  /* -------------------------------------------- */

  /**
   * Update the world name placeholder when the title is changed.
   * @param {Event} event       The input change event
   * @private
   */
  #onTitleChange(event) {
    let slug = this.form.elements.title.value.slugify({strict: true});
    if ( !slug.length ) slug = "world-name";
    this.form.elements.id?.setAttribute("placeholder", slug);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async activateEditor(name, options={}, initialContent="") {
    const toolbar = CONFIG.TinyMCE.toolbar.split(" ").filter(t => t !== "save").join(" ");
    foundry.utils.mergeObject(options, {toolbar});
    return super.activateEditor(name, options, initialContent);
  }
}
