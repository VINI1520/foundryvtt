(function () {
  'use strict';

  /**
   * Display the End User License Agreement and prompt the user to agree before moving forwards.
   */
  class EULA extends Application {

    /** @inheritdoc */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "eula",
        template: "templates/setup/eula.hbs",
        title: "End User License Agreement",
        width: 720,
        popOut: true
      });
    }

    /* -------------------------------------------- */

    /**
     * A reference to the setup URL used under the current route prefix, if any
     * @type {string}
     */
    get licenseURL() {
      return foundry.utils.getRoute("license");
    }

    /* -------------------------------------------- */

    /** @override */
    async getData(options) {
      const html = await foundry.utils.fetchWithTimeout("license.html").then(r => r.text());
      return { html };
    }

    /* -------------------------------------------- */

    /** @override */
    async _renderOuter() {
      const id = this.id;
      const classes = Array.from(this.options.classes).join(" ");

      // Override the normal window app header, so it cannot be closed or minimized
      const html = $(`<div id="${id}" class="app window-app ${classes}" data-appid="${this.appId}">
      <header class="window-header flexrow">
          <h4 class="window-title">${this.title}</h4>
      </header>
      <section class="window-content"></section>
    </div>`);

      // Make the outer window draggable
      const header = html.find("header")[0];
      new Draggable(this, html, header, this.options.resizable);

      // Set the outer frame z-index
      if ( Object.keys(ui.windows).length === 0 ) _maxZ = 100;
      html.css({zIndex: Math.min(++_maxZ, 9999)});
      return html;
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers                */
    /* -------------------------------------------- */

    /** @override */
    activateListeners(html) {
      super.activateListeners(html);
      const form = html.toArray().find(el => el.id === "eula-sign");
      form.querySelector("#decline").addEventListener("click", EULA.#onDecline);
      form.onsubmit = EULA.#onSubmit;
    }

    /* -------------------------------------------- */

    /**
     * Handle refusal of the EULA by checking the decline button
     * @param {MouseEvent} event    The originating click event
     */
    static #onDecline(event) {
      const button = event.currentTarget;
      ui.notifications.error("You have declined the End User License Agreement and cannot use the software.");
      button.form.dataset.clicked = "decline";
    }

    /* -------------------------------------------- */

    /**
     * Validate form submission before sending it onwards to the server
     * @param {Event} event       The originating form submission event
     */
    static #onSubmit(event) {
      /** @type {HTMLFormElement} */
      const form = event.target;
      if ( form.dataset.clicked === "decline" ) {
        return setTimeout(() => window.location.href = CONST.WEBSITE_URL, 1000);
      }
      if ( !form.agree.checked ) {
        event.preventDefault();
        ui.notifications.error("You must indicate your agreement before proceeding.");
      }
    }
  }

  /**
   * The Join Game setup application.
   */
  class JoinGameForm extends FormApplication {
    constructor(object, options) {
      super(object, options);
      game.users.apps.push(this);
    }

    /* -------------------------------------------- */

    /** @override */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "join-game",
        template: "templates/setup/join-game.hbs",
        popOut: false,
        closeOnSubmit: false,
        scrollY: ["#world-description"]
      });
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    getData(options={}) {
      const context = {
        isAdmin: game.data.isAdmin,
        users: game.users,
        world: game.world,
        passwordString: game.data.passwordString,
        usersCurrent: game.users.filter(u => u.active).length,
        usersMax: game.users.contents.length
      };

      // Next session time
      const nextDate = new Date(game.world.nextSession || undefined);
      if ( nextDate.isValid() ) {
        context.nextTime = nextDate.toLocaleTimeString(game.i18n.lang, {
          weekday: "long",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
          timeZoneName: "short"
        });
      }
      return context;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    activateListeners(html) {
      super.activateListeners(html);
      this.form.userid.addEventListener("focus", this.#setMode.bind(this, "join"));
      this.form.password.addEventListener("focus", this.#setMode.bind(this, "join"));
      this.form.adminPassword?.addEventListener("focus", this.#setMode.bind(this, "shutdown"));
      this.form.shutdown.addEventListener("click", this.#onShutdown.bind(this));
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _render(force, options) {
      if ( !this.form ) return super._render(force, options);
      // Preserve form state across re-renders.
      const data = this._getSubmitData();
      const focus = this.form.querySelector(":focus");
      await super._render(force, options);
      Object.entries(data).forEach(([k, v]) => this.form.elements[k].value = v);
      if ( focus?.name ) this.form.elements[focus.name].focus();
      if ( this.form.userid.selectedOptions[0]?.disabled ) this.form.userid.value = "";
    }

    /* -------------------------------------------- */

    /**
     * Toggle the submission mode of the form to alter what pressing the "ENTER" key will do
     * @param {string} mode
     */
    #setMode(mode) {
      switch (mode) {
        case "join":
          this.form.shutdown.type = "button";
          this.form.join.type = "submit";
          break;
        case "shutdown":
          this.form.join.type = "button";
          this.form.shutdown.type = "submit";
          break;
      }
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onSubmit(event, options) {
      event.preventDefault();
      const form = event.target;
      form.submit.disabled = true;
      const data = this._getSubmitData();
      data.action = "join";
      return this.#post(data, form.submit);
    }

    /* -------------------------------------------- */

    /**
     * Handle requests to shut down the currently active world
     * @param {MouseEvent} event    The originating click event
     * @returns {Promise<void>}
     */
    async #onShutdown(event) {
      event.preventDefault();
      const button = this.form.shutdown;
      button.disabled = true;

      // Display a warning if other players are connected
      const othersActive = game.users.filter(u => u.active).length;
      if ( othersActive ) {
        const warning = othersActive > 1 ? "GAME.ReturnSetupActiveUsers" : "GAME.ReturnSetupActiveUser";
        const confirm = await Dialog.confirm({
          title: game.i18n.localize("GAME.ReturnSetup"),
          content: `<p>${game.i18n.format(warning, {number: othersActive})}</p>`
        });
        if ( !confirm ) {
          button.disabled = false;
          return;
        }
      }

      // Submit the request
      const data = this._getSubmitData();
      data.action = "shutdown";
      return this.#post(data, button);
    }

    /* -------------------------------------------- */

    /**
     * Submit join view POST requests to the server for handling.
     * @param {object} formData                         The processed form data
     * @param {EventTarget|HTMLButtonElement} button    The triggering button element
     * @returns {Promise<void>}
     */
    async #post(formData, button) {
      const joinURL = foundry.utils.getRoute("join");
      button.disabled = true;

      // Look up some data
      const user = game.users.get(formData.userid)?.name || formData.userid;

      let response;
      try {
        response = await fetchJsonWithTimeout(joinURL, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(formData)
        });
      }
      catch(e) {
        if (e instanceof HttpError) {
          const error = game.i18n.format(e.displayMessage, {user});
          ui.notifications.error(error);
        }
        else {
          ui.notifications.error(e);
        }
        button.disabled = false;
        return;
      }

      // Redirect on success
      ui.notifications.info(game.i18n.format(response.message, {user}));
      setTimeout(() => window.location.href = response.redirect, 500 );
    }

    /* -------------------------------------------- */

    /** @override */
    async _updateObject(event, formData) {
      throw new Error("Not implemented for this class");
    }
  }

  /**
   * A form application for managing core server configuration options.
   * @see config.ApplicationConfiguration
   */
  class SetupApplicationConfiguration extends FormApplication {

    /**
     * An ApplicationConfiguration instance which is used for validation and processing of form changes.
     * @type {config.ApplicationConfiguration}
     */
    config = new foundry.config.ApplicationConfiguration(this.object);

    /** @inheritdoc */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "setup-configuration",
        template: "templates/setup/app-configuration.hbs",
        title: "SETUP.ConfigTitle",
        popOut: true,
        width: 720
      });
    }

    /**
     * Which CSS theme is currently being previewed
     * @type {string}
     */
    #previewTheme = this.config.cssTheme;

    /* -------------------------------------------- */

    /** @override */
    getData(options={}) {
      const worlds = Array.from(game.worlds.values());
      worlds.sort((a, b) => a.title.localeCompare(b.title));
      return {
        noAdminPW: !game.data.options.adminPassword,
        config: this.config.toObject(),
        cssThemes: CONST.CSS_THEMES,
        languages: game.data.languages,
        fields: this.config.schema.fields,
        worlds: worlds
      };
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async close(options) {
      this.#applyThemeChange(this.config.cssTheme);
      return super.close(options);
    }

    /* -------------------------------------------- */

    /** @override */
    async _onChangeInput(event) {
      this.#applyThemeChange(this.form.cssTheme.value);
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
        defaultYes: false,
        options: {width: 480}
      });

      // Submit the form
      if ( confirm ) {
        const response = await Setup.post({action: "adminConfigure", config: changes});
        if ( response.restart ) ui.notifications.info("SETUP.ConfigSaveRestart", {localize: true, permanent: true});
        return this.close();
      }

      // Reset the form
      this.config.updateSource(original);
      return this.render();
    }

    /* -------------------------------------------- */

    /** @override */
    async _updateObject(event, formData) {}

    /* -------------------------------------------- */

    /**
     * Update the body class with the previewed CSS theme.
     * @param {string} themeId     The theme ID to preview
     */
    #applyThemeChange(themeId) {
      document.body.classList.replace(`theme-${this.#previewTheme}`, `theme-${themeId}`);
      this.#previewTheme = themeId;
    }

    /* -------------------------------------------- */

    /**
     * Prompt the user with a request to share telemetry data if they have not yet chosen an option.
     * @returns {Promise<void>}
     */
    static async telemetryRequestDialog() {
      if ( game.data.options.telemetry !== undefined ) return;
      const response = await Dialog.wait({
        title: game.i18n.localize("SETUP.TelemetryRequestTitle"),
        content: `<p>${game.i18n.localize("SETUP.TelemetryRequest1")}</p>`
          + `<blockquote>${game.i18n.localize("SETUP.TelemetryHint")}</blockquote>`
          + `<p>${game.i18n.localize("SETUP.TelemetryRequest2")}</p>`,
        focus: true,
        close: () => null,
        buttons: {
          yes: {
            icon: '<i class="fas fa-check"></i>',
            label: game.i18n.localize("SETUP.TelemetryAllow"),
            callback: () => true
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("SETUP.TelemetryDecline"),
            callback: () => false
          }
        }
      }, {width: 480});
      if ( response !== null ) {
        const { changes } = await Setup.post({action: "adminConfigure", config: {telemetry: response}});
        foundry.utils.mergeObject(game.data.options, changes);
      }
    }
  }

  /**
   * The Setup Authentication Form.
   */
  class SetupAuthenticationForm extends Application {

    /** @inheritdoc */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "setup-authentication",
        template: "templates/setup/setup-authentication.hbs",
        popOut: false
      });
    }
  }

  /**
   * An application that renders the floating setup menu buttons.
   */
  class SetupWarnings extends Application {

    /** @inheritdoc */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "setup-warnings",
        template: "templates/setup/setup-warnings.hbs",
        title: "SETUP.WarningsTitle",
        popOut: true,
        width: 680
      });
    }

    /* -------------------------------------------- */

    /** @override */
    get title() {
      return `${game.i18n.localize(this.options.title)} (${game.issueCount.total})`;
    }

    /* -------------------------------------------- */

    /** @override */
    async getData(options={}) {
      const categories = {
        world: {label: "SETUP.Worlds", packages: {}},
        system: {label: "SETUP.Systems", packages: {}},
        module: {label: "SETUP.Modules", packages: {}}
      };

      // Organize warnings
      for ( const pkg of Object.values(game.data.packageWarnings) ) {
        const cls = PACKAGE_TYPES[pkg.type];
        const p = game[cls.collection].get(pkg.id);
        categories[pkg.type].packages[pkg.id] = {
          id: pkg.id,
          type: pkg.type,
          name: p ? p.title : "",
          errors: pkg.error.map(e => e.trim()).join("\n"),
          warnings: pkg.warning.map(e => e.trim()).join("\n"),
          reinstallable: pkg.reinstallable,
          installed: p !== undefined
        };
      }

      // Filter categories to ones which have issues
      for ( const [k, v] of Object.entries(categories) ) {
        if ( foundry.utils.isEmpty(v.packages) ) delete categories[k];
      }
      return {categories};
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    activateListeners(html) {
      super.activateListeners(html);
      html.find("a.manage").click(this.#onManagePackage.bind(this));
      html.find("[data-action]").on("click", this.#onAction.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Handle button press actions.
     * @param {PointerEvent} event  The triggering event.
     */
    async #onAction(event) {
      const target = event.currentTarget;
      const action = target.dataset.action;
      const pkg = target.closest("[data-package-id]");
      const id = pkg.dataset.packageId;
      const type = pkg.dataset.packageType;

      switch ( action ) {
        case "reinstallPackage":
          target.querySelector("i").classList.add("fa-spin");
          await this.#reinstallPackage({ id, type });
          break;

        case "uninstallPackage":
          await this.#uninstallPackage({ id, type });
          break;
      }

      this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle button clicks in the warnings view to manage the package.
     * @param {PointerEvent} event      The initiating click event
     */
    #onManagePackage(event) {
      event.preventDefault();
      const li = event.currentTarget.closest(".package");

      // Activate the correct tab:
      const packageType = li.closest("section[data-package-type]").dataset.packageType;
      ui.setupPackages.activateTab(`${packageType}s`);

      // Filter to the target package
      const packageId = li.dataset.packageId;
      const filter = ui.setupPackages._searchFilters.find(f => f._inputSelector === `#${packageType}-filter`)._input;
      filter.value = packageId;
      filter.dispatchEvent(new Event("input", {bubbles: true}));
    }

    /* -------------------------------------------- */

    /**
     * Handle reinstalling a package.
     * @param {object} pkg       The package information.
     * @param {string} pkg.id    The package ID.
     * @param {string} pkg.type  The package type.
     */
    async #reinstallPackage({ id, type }) {
      await this.#uninstallPackage({ id, type });
      await Setup.warmPackages({ type });
      const pkg = Setup.cache[type].packages.get(id);
      const warnInfo = game.data.packageWarnings[id];
      if ( !pkg && !warnInfo?.manifest )  {
        return ui.notifications.error("SETUP.ReinstallPackageNotFound", { localize: true, permanent: true });
      }
      return Setup.installPackage({ type, id, manifest: warnInfo?.manifest ?? pkg.manifest });
    }

    /* -------------------------------------------- */

    /**
     * Handle uninstalling a package.
     * @param {object} pkg       The package information.
     * @param {string} pkg.id    The package ID.
     * @param {string} pkg.type  The package type.
     */
    async #uninstallPackage({ id, type }) {
      await Setup.uninstallPackage({ id, type });
      delete game.data.packageWarnings[id];
    }
  }

  /**
   * @typedef {FormApplicationOptions} CategoryFilterApplicationOptions
   * @property {string} initialCategory  The category that is initially selected when the Application first renders.
   * @property {string[]} inputs         A list of selectors for form inputs that should have their values preserved on
   *                                     re-render.
   */

  /**
   * @typedef {object} CategoryFilterCategoryContext
   * @property {string} id       The category identifier.
   * @property {boolean} active  Whether the category is currently selected.
   * @property {string} label    The localized category label.
   * @property {number} count    The number of entries in this category.
   */

  /**
   * An abstract class responsible for displaying a 2-pane Application that allows for entries to be grouped and filtered
   * by category.
   */
  class CategoryFilterApplication extends FormApplication {
    /**
     * The currently selected category.
     * @type {string}
     */
    #category = this.options.initialCategory;

    /**
     * The currently selected category.
     * @type {string}
     */
    get category() {
      return this.#category;
    }

    /**
     * Record the state of user inputs.
     * @type {string[]}
     * @protected
     */
    _inputs = [];

    /* -------------------------------------------- */

    /** @returns {CategoryFilterApplicationOptions} */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        classes: ["category-filter"],
        width: 920,
        height: 780,
        scrollY: [".categories", ".entry-list"],
        filters: [{ inputSelector: 'input[name="filter"]', contentSelector: ".entries" }]
      });
    }

    /* -------------------------------------------- */

    /** @override */
    async _updateObject(event, formData) {}

    /* -------------------------------------------- */

    /** @inheritdoc */
    async _render(force=false, options={}) {
      this._saveInputs();
      await super._render(force, options);
      this._restoreInputs();
    }

    /* -------------------------------------------- */

    /** @override */
    getData(options={}) {
      const { categories, entries } = this._prepareCategoryData();
      categories.sort(this._sortCategories.bind(this));
      entries.sort(this._sortEntries.bind(this));
      return { categories, entries };
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    activateListeners(html) {
      super.activateListeners(html);
      html[0].children[0].onsubmit = ev => ev.preventDefault();
      html.find(".entry-title h3").on("click", this._onClickEntryTitle.bind(this));
      html.find(".categories .category").on("click", this._onClickCategoryFilter.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Category comparator.
     * @param {CategoryFilterCategoryContext} a
     * @param {CategoryFilterCategoryContext} b
     * @returns {number}
     * @protected
     */
    _sortCategories(a, b) {
      return 0;
    }

    /* -------------------------------------------- */

    /**
     * Entries comparator.
     * @param {object} a
     * @param {object} b
     * @return {number}
     * @protected
     */
    _sortEntries(a, b) {
      return 0;
    }

    /* -------------------------------------------- */

    /**
     * Handle click events to filter by a certain category.
     * @param {PointerEvent} event  The triggering event.
     * @protected
     */
    _onClickCategoryFilter(event) {
      event.preventDefault();
      this.#category = event.currentTarget.dataset.category;
      this.render();
    }

    /* -------------------------------------------- */

    /** @override */
    _onSearchFilter(event, query, rgx, html) {
      if ( html.classList.contains("loading") ) return;
      for ( const entry of html.querySelectorAll(".entry") ) {
        if ( !query ) {
          entry.classList.remove("hidden");
          continue;
        }
        let match = false;
        this._getSearchFields(entry).forEach(field => match ||= rgx.test(SearchFilter.cleanQuery(field)));
        entry.classList.toggle("hidden", !match);
      }
    }

    /* -------------------------------------------- */

    /**
     * Retrieve any additional fields that the entries should be filtered on.
     * @param {HTMLElement} entry  The entry element.
     * @returns {string[]}
     * @protected
     */
    _getSearchFields(entry) {
      return [];
    }

    /* -------------------------------------------- */

    /**
     * Record the state of user inputs.
     * @protected
     */
    _saveInputs() {
      if ( !this.element.length || !this.options.inputs?.length ) return;
      this._inputs = this.options.inputs.map(selector => {
        const input = this.element[0].querySelector(selector);
        return input?.value ?? "";
      });
    }

    /* -------------------------------------------- */

    /**
     * Restore the state of user inputs.
     * @protected
     */
    _restoreInputs() {
      if ( !this.options.inputs?.length || !this.element.length ) return;
      this.options.inputs.forEach((selector, i) => {
        const value = this._inputs[i] ?? "";
        const input = this.element[0].querySelector(selector);
        if ( input ) input.value = value;
      });
    }

    /* -------------------------------------------- */
    /*  Abstract Methods                            */
    /* -------------------------------------------- */

    /**
     * Get category context data.
     * @returns {{categories: CategoryFilterCategoryContext[], entries: object[]}}
     * @abstract
     */
    _prepareCategoryData() {
      return { categories: [], entries: [] };
    }

    /* -------------------------------------------- */

    /**
     * Handle clicking on the entry title.
     * @param {PointerEvent} event  The triggering event.
     * @abstract
     */
    _onClickEntryTitle(event) {}
  }

  /**
   * An application that manages backups for a single package.
   */
  class BackupList extends FormApplication {

    /**
     * The list of available backups for this package.
     * @type {BackupData[]}
     */
    #backups = [];

    /**
     * The backup date formatter.
     * @type {Intl.DateTimeFormat}
     */
    #dateFormatter = new Intl.DateTimeFormat(game.i18n.lang, { dateStyle: "full", timeStyle: "short" });

    /* -------------------------------------------- */

    /** @inheritdoc */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        classes: ["backup-list", "category-filter"],
        template: "templates/setup/backup-list.hbs",
        width: 640,
        height: 780
      });
    }

    /* -------------------------------------------- */

    /** @override */
    get id() {
      return `backup-list-${this.object.type}-${this.object.id}`;
    }

    /** @override */
    get title() {
      return game.i18n.format("SETUP.BACKUPS.ManagePackage", { package: this.object.title });
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    async _render(force=false, options={}) {
      await super._render(force, options);
      if ( !Setup.backups && force ) Setup.listBackups().then(() => this.render());
    }

    /* -------------------------------------------- */

    /** @override */
    getData(options={}) {
      const context = {};
      if ( Setup.backups ) this.#backups = Setup.backups[this.object.type]?.[this.object.id] ?? [];
      else context.progress = { label: "SETUP.BACKUPS.Loading", icon: "fas fa-spinner fa-spin" };
      context.entries = this.#prepareEntries();
      return context;
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    activateListeners(html) {
      super.activateListeners(html);
      html.find("[data-action]").on("click", this.#onAction.bind(this));
      html.find(".entry-title").on("click", this.#onClickEntryTitle.bind(this));
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _getHeaderButtons() {
      const buttons = super._getHeaderButtons();
      buttons.unshift({
        label: "SETUP.BACKUPS.TakeBackup",
        class: "create-backup",
        icon: "fas fa-floppy-disk",
        onclick: this.#onCreateBackup.bind(this)
      });
      return buttons;
    }

    /* -------------------------------------------- */

    /**
     * Delete any selected backups.
     */
    async #deleteSelected() {
      const toDelete = [];
      for ( const el of this.form.elements ) {
        if ( el.checked && (el.name !== "select-all") ) toDelete.push(el.name);
      }
      await Setup.deleteBackups(this.object, toDelete, { dialog: true });
      this.render();
    }

    /* -------------------------------------------- */

    /**
     * Prepare template context data for backup entries.
     * @returns {BackupEntryUIDescriptor[]}
     */
    #prepareEntries() {
      return this.#backups.map(backupData => {
        const { id, size, note, createdAt, snapshotId } = backupData;
        const tags = [
          { label: foundry.utils.formatFileSize(size, { decimalPlaces: 0 }) },
          this.constructor.getVersionTag(backupData)
        ];
        if ( snapshotId ) tags.unshift({ label: game.i18n.localize("SETUP.BACKUPS.Snapshot") });
        return {
          id, tags,
          description: note,
          inSnapshot: !!snapshotId,
          noRestore: !this.constructor.canRestoreBackup(backupData),
          title: this.#dateFormatter.format(createdAt),
        };
      });
    }

    /* -------------------------------------------- */

    /**
     * Determine the version tag for a given backup.
     * @param {BackupData} backupData  The backup.
     * @returns {BackupEntryTagDescriptor}
     */
    static getVersionTag(backupData) {
      const cls = PACKAGE_TYPES[backupData.type];
      const availability = cls.testAvailability(backupData);
      return cls.getVersionBadge(availability, backupData);
    }

    /* -------------------------------------------- */

    /**
     * Determine if a given backup is allowed to be restored.
     * @param {BackupData} backupData  The backup.
     * @returns {boolean}
     */
    static canRestoreBackup(backupData) {
      const { packageId, type } = backupData;
      const cls = PACKAGE_TYPES[type];
      const pkg = game[cls.collection].get(packageId);

      // If there is no currently-installed version of the package, it can always be restored.
      if ( !pkg ) return true;

      const codes = CONST.PACKAGE_AVAILABILITY_CODES;
      const usable = code => (code >= codes.VERIFIED) && (code <= codes.UNVERIFIED_GENERATION);

      // If the installed package is already unusable, there is no harm in restoring a backup, it can't make things worse.
      if ( !usable(pkg.availability) ) return true;

      // Otherwise check if restoring the backup would make the package unusable.
      return usable(cls.testAvailability(backupData));
    }

    /* -------------------------------------------- */

    /**
     * Handle clicking on an action button.
     * @param {PointerEvent} event  The triggering event.
     */
    #onAction(event) {
      const { action } = event.currentTarget.dataset;
      switch ( action ) {
        case "delete":
          this.#deleteSelected();
          break;

        case "restore":
          this.#onRestore(event);
          break;

        case "select-all":
          this.#toggleSelectAll(event.currentTarget.checked);
          break;
      }
    }

    /* -------------------------------------------- */

    /**
     * Handle clicking the backup title in order to toggle its checkbox.
     * @param {PointerEvent} event  The triggering event.
     */
    #onClickEntryTitle(event) {
      const row = event.currentTarget.closest(".checkbox-row");
      const checkbox = row.querySelector("input");
      if ( !checkbox.disabled ) checkbox.checked = !checkbox.checked;
    }

    /* -------------------------------------------- */

    /**
     * Handle creating a new backup.
     */
    async #onCreateBackup() {
      await Setup.createBackup(this.object, { dialog: true });
      this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle restoring a specific backup.
     * @param {PointerEvent} event  The triggering event.
     */
    async #onRestore(event) {
      const { backupId } = event.currentTarget.closest("[data-backup-id]").dataset;
      const backupData = this.#backups.find(entry => entry.id === backupId);
      const pkg = game[`${this.object.type}s`].get(this.object.id);
      await Setup.restoreBackup(backupData, { dialog: !!pkg });
      this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle selecting or deselecting all backups.
     * @param {boolean} select  Whether to select or deselect.
     */
    #toggleSelectAll(select) {
      for ( const el of this.form.elements ) {
        if ( !el.disabled && (el.type === "checkbox") && (el.name !== "select-all") ) el.checked = select;
      }
    }

    /* -------------------------------------------- */

    /**
     * Toggle the locked state of the interface.
     * @param {boolean} locked  Is the interface locked?
     */
    toggleLock(locked) {
      const element = this.element[0];
      if ( !element ) return;
      element.querySelectorAll("a.button, .create-backup").forEach(el => el.classList.toggle("disabled", locked));
      element.querySelectorAll("button").forEach(el => el.disabled = locked);
    }
  }

  /**
   * @typedef {object} BackupEntryTagDescriptor
   * @property {"unsafe"|"warning"|"neutral"|"safe"} [type]  The tag type.
   * @property {string} [icon]                               An icon class.
   * @property {string} label                                The tag text.
   * @property {string} [tooltip]                            Tooltip text.
   */

  /**
   * @typedef {object} BackupEntryUIDescriptor
   * @property {string} [packageId]     The ID of the package this backup represents, if applicable.
   * @property {string} [backupId]      The ID of the package backup, if applicable.
   * @property {string} [snapshotId]    The ID of the snapshot, if applicable.
   * @property {number} [createdAt]     The snapshot's creation timestamp.
   * @property {string} title           The title of the entry. Either a formatted date for snapshots, or the title of the
   *                                    package for package backups.
   * @property {string} [restoreLabel]  The label for the restore button.
   * @property {string} description     The description for the entry. Either the user's note for snapshots, or the
   *                                    package description for package backups.
   * @property {boolean} [inSnapshot]   For package backups, this indicates that it is part of a snapshot.
   * @property {boolean} [noRestore]    Is the backup allowed to be restored.
   * @property {BackupEntryTagDescriptor[]} tags  Tag descriptors for the backup or snapshot.
   */

  /**
   * An Application that manages user backups and snapshots.
   */
  class BackupManager extends CategoryFilterApplication {
    /**
     * The snapshot date formatter.
     * @type {Intl.DateTimeFormat}
     */
    #dateFormatter = new Intl.DateTimeFormat(game.i18n.lang, { dateStyle: "full", timeStyle: "short" });

    /* -------------------------------------------- */

    /** @inheritdoc */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "backup-manager",
        template: "templates/setup/backup-manager.hbs",
        title: "SETUP.BACKUPS.ManageBackups",
        inputs: ['[name="filter"]'],
        initialCategory: "world"
      });
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    async _render(force=false, options={}) {
      await super._render(force, options);
      if ( !Setup.backups && force ) Setup.listBackups().then(() => this.render(false));
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    getData(options={}) {
      const context = super.getData(options);

      // Loading progress.
      if ( Setup.backups ) {
        const totalSize = Object.entries(Setup.backups).reduce((acc, [k, v]) => {
          if ( k === "snapshots" ) return acc;
          return acc + Object.values(v).reduce((acc, arr) => acc + arr.reduce((acc, d) => acc + d.size, 0), 0);
        }, 0);
        context.totalSize = foundry.utils.formatFileSize(totalSize, { decimalPlaces: 0 });
      }
      else context.progress = { label: "SETUP.BACKUPS.Loading", icon: "fas fa-spinner fa-spin" };

      context.hasBulkActions = this.category === "snapshots";
      return context;
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    activateListeners(html) {
      super.activateListeners(html);
      html.find("[data-action]").on("click", this.#onAction.bind(this));
    }

    /* -------------------------------------------- */

    /** @override */
    _prepareCategoryData() {
      const categories = ["snapshots", "world", "module", "system"].map(id => {
        let count;
        if ( id === "snapshots" ) count = Object.keys(Setup.backups?.[id] ?? {}).length;
        else count = Object.values(Setup.backups?.[id] ?? {}).filter(backups => backups.length).length;
        return {
          id, count,
          active: this.category === id,
          label: game.i18n.localize(`SETUP.BACKUPS.TYPE.${id}`)
        };
      });

      let entries;
      if ( this.category === "snapshots" ) entries = this.#getSnapshotsContext();
      else entries = this.#getPackagesContext(this.category);

      return { categories, entries };
    }

    /* -------------------------------------------- */

    /** @override */
    _sortEntries(a, b) {
      if ( this.category === "snapshots" ) return b.createdAt - a.createdAt;
      return a.title.localeCompare(b.title);
    }

    /* -------------------------------------------- */

    /** @override */
    _sortCategories(a, b) {
      const order = ["snapshots", "world", "module", "system"];
      return order.indexOf(a.id) - order.indexOf(b.id);
    }

    /* -------------------------------------------- */

    /**
     * Get snapshot context data.
     * @returns {BackupEntryUIDescriptor[]}
     */
    #getSnapshotsContext() {
      return Object.values(Setup.backups?.snapshots ?? {}).map(snapshotData => {
        const { createdAt } = snapshotData;
        const versionTag = this.#getSnapshotVersionTag(snapshotData);
        return {
          createdAt,
          snapshotId: snapshotData.id,
          title: this.#dateFormatter.format(createdAt),
          restoreLabel: "SETUP.BACKUPS.Restore",
          description: snapshotData.note,
          noRestore: versionTag.noRestore,
          tags: [
            versionTag,
            { label: foundry.utils.formatFileSize(snapshotData.size, { decimalPlaces: 0 }) }
          ]
        };
      });
    }

    /* -------------------------------------------- */

    /**
     * Determine the version tag for a given snapshot.
     * @param {SnapshotData} snapshotData  The snapshot.
     * @returns {BackupEntryTagDescriptor}
     */
    #getSnapshotVersionTag({ generation, build }) {
      const label = game.i18n.format("SETUP.BACKUPS.VersionFormat", { version: `${generation}.${build}` });

      // Safe to restore a snapshot taken in the current generation.
      if ( generation === game.release.generation ) return { label, type: "safe", icon: "fas fa-code-branch" };

      // Potentially safe to restore a snapshot from an older generation into a newer generation software version.
      if ( generation < game.release.generation ) return { label, type: "warning", icon: "fas fa-exclamation-triangle" };

      // Impossible to restore a snapshot from a newer generation than the current software version.
      if ( generation > game.release.generation ) return {
        label,
        type: "error",
        icon: "fa fa-file-slash",
        noRestore: true
      };
    }

    /* -------------------------------------------- */

    /**
     * Get package backup context data.
     * @param {"module"|"system"|"world"} type  The package type.
     * @returns {BackupEntryUIDescriptor[]}
     */
    #getPackagesContext(type) {
      const entries = [];
      for ( const backups of Object.values(Setup.backups?.[type] ?? {}) ) {
        if ( !backups.length ) continue;
        const newest = backups[0];
        const size = backups.reduce((acc, backupData) => acc + backupData.size, 0);
        const { packageId, title, description } = newest;
        const pkg = game[PACKAGE_TYPES[type].collection].get(packageId);
        const tags = [
          { label: game.i18n.format(`SETUP.BACKUPS.Num${backups.length === 1 ? "" : "Pl"}`, { number: backups.length }) },
          { label: foundry.utils.formatFileSize(size, { decimalPlaces: 0 }) },
          BackupList.getVersionTag(newest)
        ];
        entries.push({
          packageId, title, tags,
          packageType: type,
          backupId: newest.id,
          restoreLabel: "SETUP.BACKUPS.RestoreLatest",
          noRestore: !BackupList.canRestoreBackup(newest),
          packageExists: !!pkg,
          description: TextEditor.previewHTML(description, 150)
        });
      }
      return entries;
    }

    /* -------------------------------------------- */

    /** @override */
    _onClickEntryTitle(event) {
      const { packageId, packageType, packageTitle } = event.currentTarget.closest(".entry").dataset;
      return new BackupList({ id: packageId, type: packageType, title: packageTitle }).render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle clicking on an action button.
     * @param {PointerEvent} event  The triggering event.
     */
    #onAction(event) {
      const { action } = event.currentTarget.dataset;
      switch ( action ) {
        case "create":
          this.#onCreateBackup(event);
          break;

        case "delete":
          this.#deleteSelected();
          break;

        case "manage":
          this._onClickEntryTitle(event);
          break;

        case "restore":
          this.#onRestore(event);
          break;

        case "select-all":
          this.#toggleSelectAll(event.currentTarget.checked);
          break;
      }
    }

    /* -------------------------------------------- */

    /**
     * Handle selecting or deleting all snapshots.
     * @param {boolean} select Whether to select or deselect.
     */
    #toggleSelectAll(select) {
      for ( const el of this.form.elements ) {
        if ( !el.disabled && (el.type === "checkbox") && (el.name !== "select-all") ) el.checked = select;
      }
    }

    /* -------------------------------------------- */

    /**
     * Handle creating a new package backup.
     * @param {PointerEvent} event  The triggering event.
     * @returns {Promise<void>}
     */
    async #onCreateBackup(event) {
      const { packageId, packageType } = event.currentTarget.closest(".entry").dataset;
      const pkg = game[PACKAGE_TYPES[packageType].collection].get(packageId);
      if ( !pkg ) return;
      await Setup.createBackup(pkg, { dialog: true });
      this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle restoring a snapshot or the latest backup.
     * @param {PointerEvent} event  The triggering event.
     */
    async #onRestore(event) {
      const { packageId, packageType, snapshotId } = event.currentTarget.closest(".entry").dataset;
      if ( snapshotId ) return Setup.restoreSnapshot(Setup.backups.snapshots[snapshotId], { dialog: true });
      const pkg = game[PACKAGE_TYPES[packageType].collection].get(packageId);
      await Setup.restoreLatestBackup({ id: packageId, type: packageType }, { dialog: !!pkg });
      this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle creating a snapshot.
     */
    async #onCreateSnapshot() {
      await Setup.createSnapshot({ dialog: true });
      this.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Delete any selected snapshots.
     */
    async #deleteSelected() {
      const toDelete = [];
      for ( const el of this.form.elements ) {
        if ( el.checked && (el.name !== "select-all") ) toDelete.push(el.name);
      }
      await Setup.deleteSnapshots(toDelete, { dialog: true });
      this.render(true);
    }

    /* -------------------------------------------- */

    /** @override */
    _getSearchFields(entry) {
      return [entry.dataset.packageId ?? "", entry.querySelector(".entry-title h3")?.textContent ?? ""];
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    _getHeaderButtons() {
      const buttons = super._getHeaderButtons();
      buttons.unshift({
        label: "SETUP.BACKUPS.CreateSnapshot",
        class: "create-snapshot",
        icon: "fas fa-camera-retro",
        onclick: this.#onCreateSnapshot.bind(this)
      });
      return buttons;
    }

    /* -------------------------------------------- */

    /**
     * Toggle the locked state of the interface.
     * @param {boolean} locked  Is the interface locked?
     */
    toggleLock(locked) {
      const element = this.element[0];
      if ( !element ) return;
      element.querySelectorAll("a.control.category, .create-snapshot, a.button, .entry-title h3").forEach(el => {
        el.classList.toggle("disabled", locked);
      });
      element.querySelectorAll("button").forEach(el => el.disabled = locked);
    }
  }

  /**
   * An application that renders the floating setup menu buttons.
   */
  class SetupMenu extends Application {

    /** @inheritdoc */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "setup-menu",
        template: "templates/setup/setup-menu.hbs",
        popOut: false
      });
    }

    /* -------------------------------------------- */

    /** @override */
    async getData(options) {
      const pips = {};

      // Package Warnings Pip
      if ( game.issueCount.total ) {
        pips.warnings = {
          type: game.issueCount.error > 0 ? "error" : "warning",
          label: game.issueCount.total
        };
      }

      // Config Menu Pip
      if ( !game.data.options.adminPassword ) {
        pips.config = {
          type: "warning",
          label: "!"
        };
      }

      // Available Update Pip
      if ( game.data.coreUpdate.hasUpdate ) {
        pips.update = {
          type: "warning",
          label: "!"
        };
      }
      return {
        canBackup: !game.data.options.noBackups,
        canLogOut: !!game.data.options.adminPassword,
        pips
      };
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    activateListeners(html) {
      super.activateListeners(html);
      html.find("button[data-action]").click(this.#onClickButton.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Handle setup menu button clicks
     * @param {PointerEvent} event      The initiating click event
     */
    #onClickButton(event) {
      event.preventDefault();
      const button = event.currentTarget;
      switch ( button.dataset.action ) {
        case "adminLogout":
          Setup.post({action: button.dataset.action}); // redirects
          break;
        case "backups":
          new BackupManager().render(true);
          break;
        case "configure":
          new SetupApplicationConfiguration(game.data.options).render(true);
          break;
        case "update":
          window.location.href = foundry.utils.getRoute("update");
          break;
        case "viewWarnings":
          const warnings = new SetupWarnings();
          const {bottom, right} = button.parentElement.getBoundingClientRect();
          warnings.render(true, {left: right - warnings.options.width, top: bottom + 20});
          break;
      }
    }

    /* -------------------------------------------- */

    /**
     * Toggle the locked state of the interface.
     * @param {boolean} locked  Is the interface locked?
     */
    toggleLock(locked) {
      const element = this.element[0];
      if ( !element ) return;
      element.querySelectorAll("button").forEach(el => el.disabled = locked);
    }
  }

  /**
   * A FormApplication which facilitates the creation of a new Module.
   */
  class ModuleConfigurationForm extends FormApplication {
    constructor(moduleData, options) {
      super(undefined, options);
      this.#module = new Module(moduleData || {
        id: "my-new-module",
        title: "My New Module",
        version: "1.0.0",
        compatibility: {
          minimum: game.release.generation,
          verified: game.release.generation
        }
      });
      this.#source = moduleData ? game.modules.get(this.#module.id) : undefined;
    }

    /** @override */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "module-create",
        template: "templates/setup/module-configuration.hbs",
        width: 760,
        height: "auto",
        tabs: [{navSelector: ".tabs", contentSelector: "form", initial: "basics"}]
      });
    }

    /** @override */
    get title() {
      if ( !this.#source ) return game.i18n.localize("PACKAGE.ModuleCreate");
      return `${game.i18n.localize("PACKAGE.ModuleEdit")}: ${this.#module.title}`;
    }

    /**
     * A Module instance used as the source data for the form and to validate changes.
     * @type {Module}
     */
    #module;

    /**
     * If editing an existing package, track a reference to its persisted data
     * @type {Module}
     */
    #source;

    /**
     * Display a pending relationship which has not yet been confirmed to appear at the bottom of the list?
     * @type {boolean}
     */
    #pendingRelationship = false;

    /* -------------------------------------------- */

    /** @inheritDoc */
    async getData(options={}) {
      const compendiumTypes = CONST.COMPENDIUM_DOCUMENT_TYPES.map(documentName => {
        return { value: documentName, label: game.i18n.localize(getDocumentClass(documentName).metadata.label) };
      });
      game.i18n.sortObjects(compendiumTypes, "label");

      return {
        compendiumTypes,
        isCreation: !this.#source,
        module: this.#module,
        moduleId: this.#source?.id || "",
        packs: this.#getPacks(),
        relatedPackages: {
          systems: Object.fromEntries(Array.from(game.systems.values()).map(s => [s.id, s.title])),
          modules: Object.fromEntries(Array.from(game.modules.values()).map(m => [m.id, m.title]))
        },
        relationships: this.#getFlattenedRelationships(),
        relationshipCategories: {
          requires: "PACKAGE.Relationships.Requires",
          recommends: "PACKAGE.Relationships.Recommends",
          conflicts: "PACKAGE.Relationships.Conflicts"
        },
        submitLabel: this.#source ? "PACKAGE.ModuleEdit" : "PACKAGE.ModuleCreate"
      }
    }

    /* -------------------------------------------- */

    #getPacks() {
      return this.#module.packs.map(pack => {
        return {
          name: pack.name,
          label: pack.label,
          type: pack.type,
          system: pack.system,
          creating: pack.flags?._placeholder,
          existing: this.#source?.packs.find(p => p.name === pack.name)
        }
      });
    }

    /* -------------------------------------------- */

    /**
     * Flatten the relationships object into an array which is more convenient for rendering.
     * @returns {Array<{id: string, type: string, category: string}>}
     */
    #getFlattenedRelationships() {
      const relationships = [];
      for ( const [category, rs] of Object.entries(this.#module.relationships) ) {
        if ( !["systems", "requires", "recommends", "conflicts"].includes(category) ) continue;
        for ( let [i, r] of Object.entries(Array.from(rs)) ) {
          r = foundry.utils.deepClone(r);
          r.category = category;
          r.index = i;
          relationships.push(r);
        }
      }
      if ( this.#pendingRelationship ) relationships.push({id: "", category: "", index: -1});
      return relationships;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    activateListeners(html) {
      super.activateListeners(html);
      html.on("click", "[data-action]", this.#onAction.bind(this));
      html.on("input", "input[data-slugify]", this.#onSlugify.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Handle click events on action buttons within the form.
     * @param {Event} event    The originating click event
     */
    #onAction(event) {
      event.preventDefault();
      const button = event.currentTarget;
      switch ( button.dataset.action ) {
        case "authorAdd":
          return this.#authorAdd();
        case "authorDelete":
          return this.#authorDelete(Number(button.dataset.index));
        case "packAdd":
          return this.#packAdd();
        case "packDelete":
          return this.#packDelete(Number(button.dataset.index));
        case "relationshipAdd":
          return this.#relationshipAdd();
        case "relationshipDelete":
          return this.#relationshipDelete(button.dataset.category, Number(button.dataset.index));
      }
    }

    /* -------------------------------------------- */

    /**
     * Add a new entry to the authors array.
     */
    #authorAdd() {
      const data = this._getSubmitData();
      data.authors.push({name: `Author ${data.authors.length + 1}`});
      this.#tryUpdate(data);
    }

    /* -------------------------------------------- */

    /**
     * Delete an entry from the authors array.
     * @param {number} index      The array index to delete
     */
    #authorDelete(index) {
      const data = this._getSubmitData();
      data.authors.splice(index, 1);
      this.#tryUpdate(data);
    }

    /* -------------------------------------------- */

    /**
     * Add a new entry to the packs array.
     */
    #packAdd() {
      const data = this._getSubmitData();
      let i = data.packs.length;
      let nextName;
      while ( true ) {
        i++;
        nextName = `pack-${i}`;
        if ( !data.packs.find(p => p.name === nextName ) && !this.#source?.packs.find(p => p.name === nextName) ) break;
      }
      data.packs.push({
        name: nextName,
        label: `Pack ${i}`,
        path: `packs/${nextName}`,
        type: "JournalEntry",
        ownership: {PLAYER: "OBSERVER", ASSISTANT: "OWNER"},
        flags: {
          _placeholder: true
        }
      });
      this.#tryUpdate(data);
    }

    /* -------------------------------------------- */

    /**
     * Delete an entry from the packs array.
     * @param {number} index      The array index to delete
     */
    #packDelete(index) {
      const data = this._getSubmitData();
      data.packs.splice(index, 1);
      this.#tryUpdate(data);
    }

    /* -------------------------------------------- */

    /**
     * Add a pending relationship entry to the relationships object.
     */
    #relationshipAdd() {
      this.#pendingRelationship = true;
      const data = this._getSubmitData();
      this.#tryUpdate(data);
    }

    /* -------------------------------------------- */

    /**
     * Remove a relationship, or remove the pending relationship from the relationships object.
     * @param {string} category   The relationship category being removed
     * @param {number} index      The array index to delete
     */
    #relationshipDelete(category, index) {
      const data = this._getSubmitData();
      for ( const c of ["systems", "requires", "recommends", "conflicts"] ) {
        if ( !data.relationships[c] ) continue;
        for ( const [i, r] of Object.entries(data.relationships[c]) ) {
          if ( (r._category === category) && (r._index === index) ) {
            data.relationships[c].splice(i, 1);
            break;
          }
        }
      }
      this.#pendingRelationship = false;
      this.#tryUpdate(data);
    }

    /* -------------------------------------------- */

    /** @override */
    async _onChangeInput(event) {
      await super._onChangeInput(event);

      // If the .relationship select changes, update the category select
      if ( event.target.classList.contains("relationship") ) {
        this.#updateRelationshipOptions(event.currentTarget);
      }
    }

    /* -------------------------------------------- */

    /** @override */
    async _render(force, options) {
      await super._render(force, options);
      this.element[0].querySelectorAll("select.relationship")
        .forEach(select => this.#updateRelationshipOptions(select));
    }

    /* -------------------------------------------- */

    /**
     * Swaps what options are available based on Package type
     * @param {HTMLSelectElement} select     The select element
     */
    #updateRelationshipOptions(select) {
      // If this is a system relationship, the only valid category is "system"
      const selectedOption = select.options[select.selectedIndex];
      const isSystem = selectedOption.parentNode.dataset.category === "system";
      const categorySelect = select.closest("fieldset").querySelector("select[name$='.category']");

      // Remove the system option, if it exists
      categorySelect.querySelector("option[value='systems']")?.remove();

      categorySelect.disabled = isSystem;
      if ( isSystem ) {
        // Create a selected option
        const option = document.createElement("option");
        option.value = "systems";
        option.text = game.i18n.localize("PACKAGE.Relationships.Systems");
        option.selected = true;

        // Prepend the selected option
        categorySelect.prepend(option);
      }
    }

    /* -------------------------------------------- */

    /**
     * Automatically slugify a related input field as text is typed.
     * @param {Event} event       The field input event
     */
    #onSlugify(event) {
      const input = event.currentTarget;
      const target = this.form[input.dataset.slugify];
      if ( target.disabled ) return;
      target.placeholder = input.value.slugify({strict: true});
    }

    /* -------------------------------------------- */

    /** @override */
    _getSubmitData(updateData = {}) {
      const fd = new FormDataExtended(this.form, {disabled: true});
      const formData = foundry.utils.expandObject(fd.object);
      const moduleData = this.#module.toObject();

      // Module ID
      if ( this.#source ) formData.id = this.#source.id;
      else if ( !formData.id ) formData.id = formData.title.slugify({strict: true});

      // Authors
      formData.authors = Object.values(formData.authors || {}).map((author, i) => {
        const moduleAuthor = moduleData.authors[i];
        author = foundry.utils.mergeObject(moduleAuthor, author, {inplace: false});
        if ( foundry.utils.isEmpty(author.flags) ) delete author.flags;
        return author;
      });

      // Packs
      formData.packs = Object.values(formData.packs || {}).map((pack, i) => {
        const modulePack = moduleData.packs[i];
        if ( !pack.name ) pack.name = pack.label.slugify({strict: true});
        const sourcePath = this.#source?.packs.find(p => p.name === pack.name)?.path;
        pack.path = sourcePath?.replace(`modules/${this.#source.id}/`, "") ?? `packs/${pack.name}`;
        pack = foundry.utils.mergeObject(modulePack, pack, {inplace: false});
        if ( pack.flags?._placeholder ) delete pack.flags._placeholder;
        if ( foundry.utils.isEmpty(pack.flags) ) delete pack.flags;
        return pack;
      });

      // Relationships
      const relationships = {};
      for ( let r of Object.values(formData.relationships || {}) ) {
        if ( !(r.category && r.id) ) continue;
        const c = r.category;
        delete r.category;
        if ( r._category ) {
          const moduleRelationship = moduleData.relationships[r._category][r._index];
          r = foundry.utils.mergeObject(moduleRelationship, r, {inplace: false});
        }
        if ( foundry.utils.isEmpty(r.compatibility) ) delete r.compatibility;
        relationships[c] ||= [];
        r.type = game.systems.has(r.id) ? "system" : "module";
        relationships[c].push(r);
      }
      formData.relationships = relationships;
      return formData;
    }

    /* -------------------------------------------- */

    /** @override */
    async _updateObject(event, formData) {

      // Assert that the final data is valid
      this.form.disabled = true;
      this.#tryUpdate(formData, {render: false});

      // Prepare request data
      let requestData;
      if ( this.#source ) {
        requestData = this.#source.updateSource(formData, {dryRun: true});
        requestData.id = this.#source.id;
      }
      else {
        requestData = this.#module.toObject();
        if ( game.modules.has(requestData.id) ) {
          const msg = game.i18n.format("PACKAGE.ModuleCreateErrorAlreadyExists", {id: this.#module.id});
          ui.notifications.error(msg, {console: false});
          throw new Error(msg);
        }
      }
      requestData.action = "manageModule";

      // Submit the module management request
      await Setup.post(requestData);
      const msg = this.#source ? "PACKAGE.ModuleEditSuccess" : "PACKAGE.ModuleCreateSuccess";
      ui.notifications.info(game.i18n.format(msg, {id: this.#module.id}));
      return Setup.reload();
    }

    /* -------------------------------------------- */

    /**
     * Attempt to update the working Module instance, displaying error messages for any validation failures.
     * @param {object} changes    Proposed changes to the Module source
     * @param {object} [options]  Additional options
     * @param {boolean} [options.render]  Re-render the app?
     */
    #tryUpdate(changes, {render=true}={}) {
      try {
        this.#module.updateSource(changes);
      } catch(err) {
        ui.notifications.error(err.message);
        this.form.disabled = false;
        throw err;
      }
      if ( render ) this.render();
    }
  }

  /**
   * The primary application which renders packages on the Setup view.
   */
  class SetupPackages extends Application {
    constructor(...args) {
      super(...args);
      this.#viewModes = this.#initializeViewModes();
    }

    /**
     * Initialize user-designated favorite packages.
     */
    #initializePackageFavorites() {
      const packageFavorites = game.settings.get("core", Setup.FAVORITE_PACKAGES_SETTING);
      for ( const [collectionName, ids] of Object.entries(packageFavorites) ) {
        const c = game[collectionName];
        for ( const id of ids ) {
          const pkg = c.get(id);
          if ( pkg ) pkg.favorite = true;
        }
      }
    }

    /**
     * Retrieve selected view modes from client storage.
     * @returns {{worlds: string, systems: string, modules: string}}
     */
    #initializeViewModes() {
      const vm = game.settings.get("core", "setupViewModes");
      if ( !(vm.worlds in SetupPackages.VIEW_MODES) ) vm.worlds = "GALLERY";
      if ( !(vm.systems in SetupPackages.VIEW_MODES) ) vm.systems = "GALLERY";
      if ( !(vm.modules in SetupPackages.VIEW_MODES) ) vm.modules = "TILES";
      return vm;
    }

    /* -------------------------------------------- */

    /** @override */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "setup-packages",
        template: "templates/setup/setup-packages.hbs",
        popOut: false,
        scrollY: ["#worlds-list", "#systems-list", "#modules-list"],
        tabs: [{navSelector: ".tabs", contentSelector: "#setup-packages", initial: "worlds"}],
        filters: [
          {inputSelector: "#world-filter", contentSelector: "#worlds-list"},
          {inputSelector: "#system-filter", contentSelector: "#systems-list"},
          {inputSelector: "#module-filter", contentSelector: "#modules-list"}
        ]
      });
    }

    /**
     * The set of progress actions eligible for display in the package progress bar.
     * @type {Set<string>}
     */
    static progressActions = new Set([
      CONST.SETUP_PACKAGE_PROGRESS.ACTIONS.INSTALL_PKG,
      CONST.SETUP_PACKAGE_PROGRESS.ACTIONS.LAUNCH_WORLD,
      CONST.SETUP_PACKAGE_PROGRESS.ACTIONS.CREATE_BACKUP,
      CONST.SETUP_PACKAGE_PROGRESS.ACTIONS.RESTORE_BACKUP,
      CONST.SETUP_PACKAGE_PROGRESS.ACTIONS.DELETE_BACKUP,
      CONST.SETUP_PACKAGE_PROGRESS.ACTIONS.CREATE_SNAPSHOT,
      CONST.SETUP_PACKAGE_PROGRESS.ACTIONS.RESTORE_SNAPSHOT
    ]);

    /**
     * A mapping of package IDs to progress bar elements
     * @type {Map<string, HTMLElement>}
     */
    progress = new Map();

    /**
     * The view modes applied to each package tab.
     * @type {{worlds: string, systems: string, modules: string}}
     */
    #viewModes;

    /**
     * Track whether an "Update All" workflow is currently in progress.
     * @type {"world"|"system"|"module"|null}
     */
    #updatingAll = null;

    /**
     * The allowed view modes which can be used for each package-type tab.
     * @enum {Readonly<{id: string, label: string, template: string}>}
     */
    static VIEW_MODES = Object.freeze({
      GALLERY: {
        id: "GALLERY",
        icon: "fa-solid fa-image-landscape",
        label: "PACKAGE.VIEW_MODES.GALLERY",
        template: "templates/setup/parts/package-gallery.hbs"
      },
      TILES: {
        id: "TILES",
        icon: "fa-solid fa-grid-horizontal",
        label: "PACKAGE.VIEW_MODES.TILES",
        template: "templates/setup/parts/package-tiles.hbs"
      },
      DETAILS: {
        id: "DETAILS",
        icon: "fa-solid fa-list",
        label: "PACKAGE.VIEW_MODES.DETAILS",
        template: "templates/setup/parts/package-details.hbs"
      }
    });

    /**
     * The maximum number of progress bars that will be displayed simultaneously.
     * @type {number}
     */
    static MAX_PROGRESS_BARS = 5;

    /* -------------------------------------------- */
    /*  Tabs and Filters                            */
    /* -------------------------------------------- */

    /**
     * The name of the currently active packages tab.
     * @type {string}
     */
    get activeTab() {
      return this._tabs[0].active;
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    _onChangeTab(event, tabs, active) {
      super._onChangeTab(event, tabs, active);
      this._searchFilters.forEach(f => {
        if ( f._input ) f._input.value = "";
        f.filter(null, "");
      });
      this.element.find(".tab.active .filter > input").trigger("focus");
      document.querySelector(".tab.active > header").insertAdjacentElement("afterend", document.getElementById("progress"));
    }

    /* -------------------------------------------- */

    /** @override */
    _onSearchFilter(event, query, rgx, html) {
      if ( !html ) return;
      let anyMatch = !query;
      const noResults = html.closest("section").querySelector(".no-results");
      for ( const li of html.children ) {
        if ( !query ) {
          li.classList.remove("hidden");
          continue;
        }
        const id = li.dataset.packageId;
        const title = li.querySelector(".package-title")?.textContent;
        let match = rgx.test(id) || rgx.test(SearchFilter.cleanQuery(title));
        li.classList.toggle("hidden", !match);
        if ( match ) anyMatch = true;
      }
      const empty = !anyMatch || !html.children.length;
      html.classList.toggle("empty", empty);
      if ( !anyMatch ) {
        const label = game.i18n.localize(`SETUP.${html.closest(".tab").id.titleCase()}`);
        const search = game.i18n.localize("SETUP.PackagesNoResultsSearch", { name: query});
        noResults.innerHTML = `<p>${game.i18n.format("SETUP.PackagesNoResults", {type: label, name: query})}
      <a class="button search-packages" data-action="installPackage" data-query="${query}">${search}</a></p>`;
      }
      noResults.classList.toggle("hidden", anyMatch);
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritdoc */
    async _render(force, options) {
      await loadTemplates([
        "templates/setup/parts/package-tags.hbs",
        ...Object.values(SetupPackages.VIEW_MODES).map(m => m.template)
      ]);
      await super._render(force, options);
      const progressBars = document.getElementById("progress");
      progressBars.append(...this.progress.values());
      document.querySelector(".tab.active > header").insertAdjacentElement("afterend", progressBars);
    }

    /* -------------------------------------------- */

    /** @override */
    async getData(options={}) {
      this.#initializePackageFavorites();
      return {
        worlds: {
          packages: this.#prepareWorlds(),
          count: game.worlds.size,
          viewMode: this.#viewModes.worlds,
          template: SetupPackages.VIEW_MODES[this.#viewModes.worlds].template,
          icon: World.icon,
          updatingAll: this.#updatingAll === "world"
        },
        systems: {
          packages: this.#prepareSystems(),
          count: game.systems.size,
          viewMode: this.#viewModes.systems,
          template: SetupPackages.VIEW_MODES[this.#viewModes.systems].template,
          icon: System.icon,
          updatingAll: this.#updatingAll === "system"
        },
        modules: {
          packages: this.#prepareModules(),
          count: game.modules.size,
          viewMode: this.#viewModes.modules,
          template: SetupPackages.VIEW_MODES[this.#viewModes.modules].template,
          icon: Module.icon,
          updatingAll: this.#updatingAll === "module"
        },
        viewModes: Object.values(SetupPackages.VIEW_MODES)
      };
    }

    /* -------------------------------------------- */

    /**
     * Prepare data for rendering the Worlds tab.
     * @returns {object[]}
     */
    #prepareWorlds() {
      const codes = CONST.PACKAGE_AVAILABILITY_CODES;
      const worlds = game.worlds.map(world => {
        const w = world.toObject();
        w.authors = this.#formatAuthors(w.authors);
        w.system = game.systems.get(w.system);
        w.thumb = this.#getCover(world) || this.#getCover(w.system) || "ui/anvil-bg.png";
        w.badge = world.getVersionBadge();
        w.systemBadge = world.getSystemBadge();
        w.available = (world.availability <= codes.REQUIRES_UPDATE) || (world.availability === codes.VERIFIED);
        w.lastPlayedDate = new Date(w.lastPlayed);
        w.lastPlayedLabel = this.#formatDate(w.lastPlayedDate);
        w.canPlay = !(world.locked || world.unavailable);
        w.favorite = world.favorite;
        w.locked = world.locked;
        w.shortDesc = TextEditor.previewHTML(w.description);
        return w;
      });
      worlds.sort(this.#sortWorlds);
      return worlds;
    }

    /* -------------------------------------------- */

    #prepareSystems() {
      const systems = game.systems.map(system => {
        const s = system.toObject();
        s.authors = this.#formatAuthors(s.authors);
        s.shortDesc = TextEditor.previewHTML(s.description);
        s.badge = system.getVersionBadge();
        s.favorite = system.favorite;
        s.locked = system.locked;
        s.thumb = this.#getCover(system) || "ui/anvil-bg.png";
        return s;
      });
      systems.sort(this.#sortPackages);
      return systems;
    }

    /* -------------------------------------------- */

    #prepareModules() {
      const modules = game.modules.map(module => {
        const m = module.toObject();
        m.authors = this.#formatAuthors(m.authors);
        m.shortDesc = TextEditor.previewHTML(m.description);
        m.badge = module.getVersionBadge();
        m.favorite = module.favorite;
        m.locked = module.locked;
        m.thumb = this.#getCover(module) || "ui/anvil-bg.png";
        return m;
      });
      modules.sort(this.#sortPackages);
      return modules;
    }

    /* -------------------------------------------- */

    /**
     * Obtain a cover image used to represent the package.
     * Prefer the "setup" media type, and prefer a thumbnail to the full image.
     * Otherwise, use a background image if the package has one.
     * @param {BasePackage} pkg     The package which requires a cover image
     * @returns {string}            A cover image URL or undefined
     */
    #getCover(pkg) {
      if ( !pkg ) return undefined;
      if ( pkg.media.size ) {
        const setup = pkg.media.find(m => m.type === "setup");
        if ( setup?.thumbnail ) return setup.thumbnail;
        else if ( setup?.url ) return setup.url;
      }
      if ( pkg.background ) return pkg.background;
    }

    /* -------------------------------------------- */

    #formatAuthors(authors=[]) {
      return authors.map(a => {
        if ( a.url ) return `<a href="${a.url}" target="_blank">${a.name}</a>`;
        return a.name;
      }).join(", ");
    }

    /* -------------------------------------------- */

    /**
     * Format dates displayed in the app.
     * @param {Date} date     The Date instance to format
     * @returns {string}      The formatted date string
     */
    #formatDate(date) {
      return date.isValid() ? date.toLocaleDateString(game.i18n.lang, {
        weekday: "long",
        month: "short",
        day: "numeric"
      }) : "";
    }

    /* -------------------------------------------- */

    /**
     * A sorting function used to order worlds.
     * @returns {number}
     */
    #sortWorlds(a, b) {

      // Favorites
      const fd = b.favorite - a.favorite;
      if ( fd !== 0 ) return fd;

      // Sort date
      const ad = a.lastPlayedDate.isValid() ? a.lastPlayedDate : 0;
      const bd = b.lastPlayedDate.isValid() ? b.lastPlayedDate : 0;
      if ( ad && !bd ) return -1;
      if ( bd && !ad ) return 1;
      if ( ad && bd ) return bd - ad;

      // Sort title
      return a.title.localeCompare(b.title);
    }

    /* -------------------------------------------- */

    /**
     * A sorting function used to order systems and modules.
     * @param {ClientPackage} a   A system or module
     * @param {ClientPackage} b   Another system or module
     * @returns {number}          The relative sort order between the two
     */
    #sortPackages(a, b) {
      return (b.favorite - a.favorite) || a.title.localeCompare(b.title);
    }

    /* -------------------------------------------- */
    /*  Interactivity                               */
    /* -------------------------------------------- */

    /** @inheritDoc */
    activateListeners(html) {
      super.activateListeners(html);
      html.on("click", "[data-action]", this.#onClickAction.bind(this));
      html.on("click", "[data-tour]", this.#onClickTour.bind(this));

      // Context Menu for package management
      new ContextMenu(html, ".package", [], {onOpen: this.#setContextMenuItems.bind(this)});

      // Intersection observer for world background images
      const observer = new IntersectionObserver(this.#onLazyLoadImages.bind(this), { root: html[0] });
      const systems = html.find("#systems-list")[0].children;
      for ( const li of html.find("#worlds-list")[0].children ) observer.observe(li);
      for ( const li of systems ) observer.observe(li);
      for ( const li of html.find("#modules-list")[0].children ) observer.observe(li);

      // If there are no systems, disable the world tab and swap to the systems tab
      if ( systems.length === 0 ) {
        const worldsTab = html.find("[data-tab=worlds]");
        worldsTab.addClass("disabled");
        worldsTab.removeClass("active");
        // Only activate systems if modules is not the active tab
        if ( this.activeTab !== "modules" ) {
          html.find("[data-tab=systems").addClass("active");
        }
      }
    }

    /* -------------------------------------------- */

    /**
     * Dynamically assign context menu options depending on the package that is interacted with.
     * @param {HTMLLIElement} li      The HTML <li> element to which the context menu is attached
     */
    #setContextMenuItems(li) {
      const packageType = li.closest("[data-package-type]").dataset.packageType;
      const typeLabel = game.i18n.localize(`PACKAGE.Type.${packageType}`);
      const collection = PACKAGE_TYPES[packageType].collection;
      const pkg = game[collection].get(li.dataset.packageId);
      const menuItems = [];

      // Launch World
      if ( (packageType === "world") && !pkg.locked && !pkg.unavailable ) menuItems.push({
        name: "SETUP.WorldLaunch",
        icon: '<i class="fas fa-circle-play"></i>',
        callback: () => this.#launchWorld(pkg),
        group: "primary"
      });

      // Edit World
      if ( (packageType === "world") && !pkg.locked ) menuItems.push({
        name: "SETUP.WorldEdit",
        icon: '<i class="fas fa-edit"></i>',
        callback: () => new WorldConfig(pkg).render(true),
        group: "primary"
      });

      // Edit Module
      if ( (packageType === "module") && !pkg.locked ) menuItems.push({
        name: "PACKAGE.ModuleEdit",
        icon: '<i class="fas fa-edit"></i>',
        callback: () => new ModuleConfigurationForm(pkg.toObject()).render(true),
        group: "primary"
      });

      // Mark or Unmark Favorite
      menuItems.push({
        name: game.i18n.format(pkg.favorite ? "PACKAGE.Unfavorite" : "PACKAGE.Favorite"),
        icon: `<i class="${pkg.favorite ? "fa-regular fa-star" : "fa-solid fa-star"}"></i>`,
        callback: () => this.#toggleFavorite(pkg),
        group: "primary"
      });

      // Lock or Unlock Package
      menuItems.push({
        name: game.i18n.format(pkg.locked ? "PACKAGE.Unlock" : "PACKAGE.Lock", {type: typeLabel}),
        icon: `<i class="fas fa-${pkg.locked ? "lock": "unlock"}"></i>`,
        callback: () => this.#toggleLock(pkg),
        group: "primary"
      });

      // Delete Package
      menuItems.push({
        name: packageType === "world" ? "SETUP.WorldDelete" : "SETUP.Uninstall",
        icon: '<i class="fas fa-trash"></i>',
        callback: () => Setup.uninstallPackage(pkg),
        group: "primary"
      });

      if ( !game.data.options.noBackups ) {
        // Taking backups
        menuItems.push({
          name: "SETUP.BACKUPS.TakeBackup",
          icon: '<i class="fas fa-floppy-disk"></i>',
          callback: () => Setup.createBackup(pkg, { dialog: true }),
          group: "backups"
        });

        if ( Setup.backups?.[pkg.type]?.[pkg.id]?.length ) {
          menuItems.push({
            name: "SETUP.BACKUPS.RestoreLatestBackup",
            icon: '<i class="fas fa-undo"></i>',
            callback: () => Setup.restoreLatestBackup(pkg, { dialog: true }),
            group: "backups"
          });
        }

        // Managing backups
        menuItems.push({
          name: "SETUP.BACKUPS.ManageBackups",
          icon: '<i class="fas fa-floppy-disks"></i>',
          callback: () => new BackupList(pkg).render(true),
          group: "backups"
        });
      }

      ui.context.menuItems = menuItems;
    }

    /* -------------------------------------------- */

    /**
     * Handle click events on an action button.
     * @param {PointerEvent} event      The initiating click event
     */
    async #onClickTour(event) {
      event.preventDefault();

      // Gather data
      const link = event.currentTarget;

      // Delegate tour
      switch ( link.dataset.tour ) {
        case "creatingAWorld":
          return game.tours.get("core.creatingAWorld").start();
        case "installingASystem":
          return game.tours.get("core.installingASystem").start();
      }
    }

    /* -------------------------------------------- */

    /**
     * Handle click events on an action button.
     * @param {PointerEvent} event      The initiating click event
     */
    async #onClickAction(event) {
      event.preventDefault();

      // Gather data
      const button = event.currentTarget;
      const packageType = button.closest("[data-package-type]").dataset.packageType;
      const packageId = button.closest(".package")?.dataset.packageId;
      const pkg = packageId ? game[PACKAGE_TYPES[packageType].collection].get(packageId) : undefined;

      // Delegate action
      switch ( button.dataset.action ) {
        case "installPackage":
          await Setup.browsePackages(packageType, {search: button.dataset.query});
          break;
        case "moduleCreate":
          new ModuleConfigurationForm().render(true);
          break;
        case "updateAll":
          await this.#updateAll(packageType);
          break;
        case "updatePackage":
          await this.#updatePackage(pkg);
          break;
        case "viewMode":
          this.#onChangeViewMode(button);
          break;
        case "worldCreate":
          this.#createWorld();
          break;
        case "worldInstall":
          await Setup.browsePackages(packageType);
          break;
        case "worldLaunch":
          await this.#launchWorld(pkg);
          break;
      }
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling the view mode for a certain package type.
     * @param {HTMLElement} button    The clicked button element
     */
    #onChangeViewMode(button) {
      const tab = button.closest(".tab").dataset.tab;
      this.#viewModes[tab] = button.dataset.viewMode;
      game.settings.set("core", "setupViewModes", this.#viewModes);
      this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle lazy loading for world background images to only load them once they become observed.
     * @param {IntersectionObserverEntry[]} entries   The entries which are now observed
     * @param {IntersectionObserver} observer         The intersection observer instance
     */
    #onLazyLoadImages(entries, observer) {
      for ( const e of entries ) {
        if ( !e.isIntersecting ) continue;
        const li = e.target;
        const img = li.querySelector(".thumbnail");
        if ( img?.dataset.src ) {
          img.src = img.dataset.src;
          delete img.dataset.src;
        }
        observer.unobserve(li);
      }
    }

    /* -------------------------------------------- */

    /**
     * Display a confirmation dialog which warns the user that launching the world will trigger irreversible migration.
     * @param {World} world                                       The World being launched
     * @returns {Promise<{confirm: boolean, [backup]: boolean}>}  Did the user agree to proceed?
     */
    async #displayWorldMigrationInfo(world) {
      if ( !world ) return { confirm: false };
      const system = game.systems.get(world.system);
      const needsCoreMigration = foundry.utils.isNewerVersion(game.release.version, world.coreVersion);
      const needsSystemMigration = world.systemVersion
        && foundry.utils.isNewerVersion(system.version, world.systemVersion);

      if ( !needsCoreMigration && !needsSystemMigration ) return { confirm: true };
      if ( !needsCoreMigration && needsSystemMigration && game.data.options.noBackups ) return { confirm: true };

      // Prompt that world migration will be required
      const title = game.i18n.localize("SETUP.WorldMigrationRequiredTitle");
      const disableModules = game.release.isGenerationalChange(world.compatibility.verified);

      let content = [
        needsCoreMigration ? game.i18n.format("SETUP.WorldCoreMigrationRequired", {
          world: world.title,
          oldVersion: world.coreVersion,
          newVersion: game.release
        }) : game.i18n.format("SETUP.WorldSystemMigrationRequired", {
          oldVersion: world.systemVersion,
          newVersion: system.version
        }),
        system.availability !== CONST.PACKAGE_AVAILABILITY_CODES.VERIFIED
          ? game.i18n.format("SETUP.WorldMigrationSystemUnavailable", {
            system: system.title,
            systemVersion: system.version
          })
          : "",
        disableModules ? game.i18n.localize("SETUP.WorldMigrationDisableModules") : "",
        game.i18n.localize("SETUP.WorldMigrationBackupPrompt")
      ].filterJoin("");

      if ( !game.data.options.noBackups ) {
        content += `
        <label class="checkbox" id="create-backup">
          ${game.i18n.localize("SETUP.WorldMigrationCreateBackup")}
          <input type="checkbox" checked>
        </label>
      `;
      }

      // Present the confirmation dialog
      return Dialog.wait({
        title, content, default: "no",
        buttons: {
          yes: {
            icon: '<i class="fa-solid fa-laptop-arrow-down"></i>',
            label: game.i18n.localize("SETUP.WorldMigrationBegin"),
            callback: html => ({ confirm: true, backup: html.querySelector("#create-backup input")?.checked })
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("Cancel"),
            callback: () => ({ confirm: false })
          }
        },
        close: () => ({ confirm: false })
      }, { jQuery: false });
    }

    /* -------------------------------------------- */

    /**
     * Toggle the locked state of the interface.
     * @param {boolean} locked            Is the interface locked?
     * @param {object} [options]
     * @param {string} [options.message]  The message to display.
     */
    toggleLock(locked, { message }={}) {
      const element = this.element[0];
      if ( !element ) return;
      element.querySelectorAll(".tabs .item").forEach(el => el.classList.toggle("disabled", locked));
      element.querySelectorAll(".package-list").forEach(el => el.classList.toggle("hidden", locked));
      element.querySelectorAll(".controls :is(input, button)").forEach(el => el.disabled = locked);
      const status = element.querySelector(".tab.active .locked");
      status.classList.toggle("hidden", !locked);
      if ( message ) status.querySelector("h3").innerText = game.i18n.localize(message);
    }

    /* -------------------------------------------- */
    /*  Package Management Operations               */
    /* -------------------------------------------- */

    /**
     * Create a new World.
     */
    #createWorld() {
      if ( !game.systems.size ) return ui.notifications.warn(game.i18n.localize("SETUP.YouMustInstallASystem"));
      const world = new World({name: "1", title: "1", system: "1", coreVersion: game.release.version});
      world.id = world.title = world.system = "";
      new WorldConfig(world, {create: true}).render(true);
    }

    /* -------------------------------------------- */

    /**
     * Request to launch a World.
     * @param {World} world           The requested World to launch
     * @returns {Promise<object>}     Returned response from the server which automatically redirects
     */
    async #launchWorld(world) {
      if ( world.locked ) return ui.notifications.error(game.i18n.format("PACKAGE.LaunchLocked", {id: world.id}));
      const { confirm, backup } = await this.#displayWorldMigrationInfo(world);
      if ( !confirm ) return;

      if ( backup ) await Setup.createBackup(world, { dialog: true });

      // Notify migration in progress.
      if ( foundry.utils.isNewerVersion(game.release.version, world.coreVersion) ) {
        const msg = game.i18n.format("SETUP.WorldMigrationInProcess", {version: game.release});
        ui.notifications.info(msg, {permanent: true});
      }

      // Show progress spinner and disable interaction with worlds.
      const worlds = document.getElementById("worlds-list");
      worlds.classList.add("disabled");
      const tile = worlds.querySelector(`.world[data-package-id="${world.id}"]`);
      tile.classList.add("loading");
      const icon = tile.querySelector(`.control.play > i`);
      icon.setAttribute("class", "fas fa-spinner fa-spin-pulse");

      // Fire world launch request.
      const error = ({ message, stack }) => {
        const err = new Error(message);
        err.stack = stack;
        console.error(err);
        ui.notifications.error(game.i18n.format("SETUP.WorldLaunchFailure", { message }), {
          console: false,
          permanent: true
        });
        Setup._removeProgressListener(progress);
        this.render();
      };

      const progress = data => {
        this.onProgress(data);
        if ( data.step === CONST.SETUP_PACKAGE_PROGRESS.STEPS.ERROR ) error(data);
        if ( data.step === CONST.SETUP_PACKAGE_PROGRESS.STEPS.COMPLETE ) location.href = foundry.utils.getRoute("/game");
      };

      Setup._addProgressListener(progress);
      return Setup.post({action: "launchWorld", world: world.id}, {timeoutMs: null});
    }

    /* -------------------------------------------- */

    /**
     * Toggle marking a package as a favorite.
     * @param {BasePackage} pkg       The requested Package to mark or unmark as a favorite
     */
    async #toggleFavorite(pkg) {
      const favorites = game.settings.get("core", Setup.FAVORITE_PACKAGES_SETTING);
      const collectionName = PACKAGE_TYPES[pkg.type].collection;
      if ( pkg.favorite ) favorites[collectionName].findSplice(f => f === pkg.id);
      else favorites[collectionName].push(pkg.id);
      game.settings.set("core", Setup.FAVORITE_PACKAGES_SETTING, favorites);
      pkg.favorite = !pkg.favorite;
      this.render();
    }

    /* -------------------------------------------- */

    /**
     * Toggle locking or unlocking a package.
     * @param {BasePackage} pkg       The requested Package to lock or unlock
     * @returns {Promise<object>}     Returned response from the server
     */
    async #toggleLock(pkg) {
      const shouldLock = !pkg.locked;
      await Setup.post({action: "lockPackage", type: pkg.type, id: pkg.id, shouldLock});
      pkg.locked = shouldLock;
      this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle update button press for a single Package.
     * @param {BasePackage} pkg       The requested Package to update
     * @param {object} [options]      Options which configure installation
     * @param {boolean} [options.notify=true]   Display a notification toast. Suppressed for "updateAll"
     * @returns {Promise<void>}
     */
    async #installPackageUpdate(pkg, {notify=true}={}) {
      return Setup.installPackage({type: pkg.type, id: pkg.id, manifest: pkg.manifest, notify});
    }

    /* -------------------------------------------- */

    /**
     * Update all package for a certain package type.
     * @param {string} packageType    The package type to update
     * @returns {Promise<void>}
     */
    async #updateAll(packageType) {
      if ( this.#updatingAll ) return ui.notifications.warn("PACKAGE.UpdateAllInProgress", {localize: true});
      this.#updatingAll = packageType;

      // Disable the "Update All" button
      let button = this.element[0].querySelector(`[data-package-type="${packageType}"] [data-action="updateAll"]`);
      button.disabled = true;
      button.firstElementChild.className = "fas fa-spinner fa-spin";

      // Create two queues
      const max = SetupPackages.MAX_PROGRESS_BARS;
      const pending = game[PACKAGE_TYPES[packageType].collection].filter(p => p.manifest && !p.locked);
      const active = new Set();
      const results = [];
      let requireReload = false;

      // Populate the package cache
      console.group(`${vtt} | Updating ${packageType.titleCase()}s`);
      await Setup.warmPackages({type: packageType});
      console.debug(`Warmed ${packageType} package cache`);

      // A semaphore which updates a certain number of packages concurrently
      let complete;
      const next = () => {
        while ( (active.size < max) && pending.length ) {
          const pkg = pending.shift();
          active.add(pkg);
          update(pkg);
        }
        if ( !pending.length && !active.size ) complete();
      };

      // Update function
      const update = async pkg => {
        console.debug(`Checking ${packageType} ${pkg.id} for updates`);
        const check = await this.#updateCheck(pkg);
        switch ( check.state ) {

          // Error
          case "error":
            results.push({
              package: pkg,
              action: game.i18n.localize("Error"),
              actionClass: "error",
              description: check.error
            });
            console.debug(`Checked ${packageType} ${pkg.id}: error`);
            break;

          // Warning
          case "warning":
            results.push({
              package: pkg,
              action: game.i18n.localize("Warning"),
              actionClass: "warning",
              description: check.warning
            });
            console.debug(`Checked ${packageType} ${pkg.id}: warning`);
            break;

          // Sidegrade
          case "sidegrade":
            requireReload = true;
            console.debug(`Checked ${packageType} ${pkg.id}: sidegrade`);
            break;

          // Track Change
          case "trackChange":
            const confirm = await this.#promptTrackChange(pkg, check.trackChange);
            if ( confirm ) {
              pkg.updateSource({manifest: check.trackChange.manifest});
              try {
                const trackChangeUpdate = await this.#installPackageUpdate(pkg, {notify: false});
                results.push({
                  package: trackChangeUpdate,
                  action: game.i18n.localize("Update"),
                  actionClass: "success",
                  description: `${pkg.version} ➞ ${trackChangeUpdate.version}`
                });
                console.debug(`${vtt} | Checked ${packageType} ${pkg.id}: track change success`);
              } catch(err) {
                results.push({
                  package: pkg,
                  action: game.i18n.localize("Error"),
                  actionClass: "error",
                  description: err.message
                });
                console.debug(`Checked ${packageType} ${pkg.id}: track change failed`);
              }
            }
            else console.debug(`Checked ${packageType} ${pkg.id}: track change declined`);
            break;

          // Standard Update
          case "update":
            try {
              const updated = await this.#installPackageUpdate(pkg, {notify: false});
              results.push({
                package: updated,
                action: game.i18n.localize("Update"),
                actionClass: "success",
                description: `${pkg.version} ➞ ${updated.version}`
              });
              console.debug(`Checked ${packageType} ${pkg.id}: update success`);
            } catch(err) {
              results.push({
                package: pkg,
                action: game.i18n.localize("Error"),
                actionClass: "error",
                description: err.message
              });
              console.debug(`Checked ${packageType} ${pkg.id}: update failed`);
            }
            break;

          case "current":
            console.debug(`Checked ${packageType} ${pkg.id}: current`);
            break;

          // Unknown
          default:
            console.warn(`Checked ${packageType} ${pkg.id}: unknown state`);
            break;
        }
        active.delete(pkg);
        next();
      };

      // Wait for completion
      await new Promise(resolve => {
        complete = resolve;
        next();
      });
      console.debug("Update check complete");

      // Display Update Log
      if ( results.length ) {
        let content = await renderTemplate("templates/setup/updated-packages.html", {changed: results});
        await Dialog.prompt({
          title: game.i18n.localize("SETUP.UpdatedPackages"),
          content: content,
          options: {width: 700},
          rejectClose: false
        });
      }

      // No results
      else ui.notifications.info(game.i18n.format("PACKAGE.AllUpdated", {
        type: game.i18n.localize(`PACKAGE.Type.${packageType}Pl`)
      }));
      console.groupEnd();

      // Reload package data
      if ( requireReload ) await Setup.reload();

      // Re-enable the "Update All" button
      button = this.element[0].querySelector(`[data-package-type="${packageType}"] [data-action="updateAll"]`);
      button.disabled = false;
      button.firstElementChild.className = "fas fa-cloud-download";

      this.#updatingAll = null;
    }

    /* -------------------------------------------- */

    /**
     * Check for an available update for a specific package
     * @param {Package} pkg     The package to check
     */
    async #updatePackage(pkg) {
      // Disable the "Update" button
      let button = this.element[0].querySelector(`[data-package-id="${pkg.id}"] [data-action="updatePackage"]`);
      button.disabled = true;
      button.firstElementChild.className = "fas fa-spinner fa-spin";

      const check = await this.#updateCheck(pkg);
      switch ( check.state ) {
        case "error":
          ui.notifications.error(check.error, {permanent: true});
          break;
        case "warning":
          ui.notifications.warn(check.warning);
          break;
        case "sidegrade":
          await Setup.reload();
          break;
        case "trackChange":
          const accepted = await this.#promptTrackChange(pkg, check.trackChange);
          if ( accepted ) {
            pkg.updateSource({manifest: check.trackChange.manifest});
            await this.#installPackageUpdate(pkg);
          }
          break;
        case "current":
          await ui.notifications.info(game.i18n.format("PACKAGE.AlreadyUpdated", {name: pkg.title}));
          break;
        case "update":
          await this.#installPackageUpdate(pkg);
          break;
      }

      // Re-enable the "Update" button
      button = this.element[0].querySelector(`[data-package-id="${pkg.id}"] [data-action="updatePackage"]`);
      button.disabled = false;
      button.firstElementChild.className = "fas fa-sync-alt";
    }

    /* -------------------------------------------- */

    /**
     * @typedef {object} PackageCheckResult
     * @property {BasePackage} package                                The checked package
     * @property {string} state                                       The State of the check, from [ "error", "sidegrade", "trackChange", "warning", "update", "current", "unknown" ]
     * @property {string} [error]                                     An error to display, if any
     * @property {string} [warning]                                   A warning to display, if any
     * @property {manifest: string, version: string} [trackChange]    The suggested track change, if any
     * @property {string} [manifest]                                  The manifest of the Update, if any
     */

    /**
     * Execute upon an update check for a single Package
     * @param {BasePackage} pkg                  The Package to check
     * @returns {Promise<PackageCheckResult>}    The status of the update check
     */
    async #updateCheck(pkg) {
      const checkData = {package: pkg, state: "unknown"};
      let responseData;
      let manifestData;

      // Check whether an update is available
      try {
        responseData = await Setup.checkPackage({type: pkg.type, id: pkg.id});
        manifestData = responseData.remote;
      } catch(err) {
        checkData.state = "error";
        checkData.error = err.toString();
        return checkData;
      }

      // Metadata sidegrade performed
      if ( responseData.hasSidegraded ) {
        checkData.state = "sidegrade";
        return checkData;
      }

      // Track change suggested
      if ( responseData.trackChange ) {
        checkData.state = "trackChange";
        checkData.trackChange = responseData.trackChange;
        checkData.manifest = responseData.trackChange.manifest;
        return checkData;
      }

      // Verify remote manifest compatibility with current software
      const availability = responseData.availability;
      const codes = CONST.PACKAGE_AVAILABILITY_CODES;

      // Unsupported updates
      const wrongCore = [
        codes.REQUIRES_CORE_UPGRADE_STABLE, codes.REQUIRES_CORE_UPGRADE_UNSTABLE, codes.REQUIRES_CORE_DOWNGRADE
      ];
      if ( responseData.isUpgrade && wrongCore.includes(availability) ) {
        checkData.state = "warning";
        const message = { 6: "Insufficient", 7: "UpdateNeeded", 8: "Unstable" }[availability];
        const rcur = availability === codes.REQUIRES_CORE_UPGRADE_UNSTABLE;
        checkData.warning = game.i18n.format(`SETUP.PackageUpdateCore${message}`, {
          id: manifestData.id,
          vmin: manifestData.compatibility.minimum,
          vmax: manifestData.compatibility.maximum,
          vcur: rcur ? game.version : undefined
        });
        return checkData;
      }

      // Available updates
      if ( responseData.isUpgrade && (availability <= codes.UNVERIFIED_GENERATION) ) {
        checkData.state = "update";
        checkData.manifest = manifestData.manifest;
        return checkData;
      }

      // Packages which are already current
      checkData.state = "current";
      return checkData;
    }

    /* -------------------------------------------- */

    /**
     * Prompt the user to use a new Package track it if they haven't previously declined.
     * @param {BasePackage} pkg                                     The Package being updated
     * @param {{manifest: string, version: string}} trackChange     A recommended track change provided by the server
     * @returns {Promise<boolean>}                                  Whether the recommended track change was accepted
     */
    async #promptTrackChange(pkg, trackChange) {

      // Verify that the user has not already declined a suggested track change
      const declinedManifestUpgrades = game.settings.get("core", "declinedManifestUpgrades");
      if ( declinedManifestUpgrades[pkg.id] === pkg.version ) return false;

      // Generate dialog HTML
      const content = await renderTemplate("templates/setup/manifest-update.html", {
        localManifest: pkg.manifest,
        localTitle: game.i18n.format("SETUP.PriorManifestUrl", {version: pkg.version}),
        remoteManifest: trackChange.manifest,
        remoteTitle: game.i18n.format("SETUP.UpdatedManifestUrl", {version: trackChange.version}),
        package: pkg.title
      });

      // Prompt for confirmation
      const accepted = await Dialog.confirm({
        title: `${pkg.title} ${game.i18n.localize("SETUP.ManifestUpdate")}`,
        content,
        yes: () => {
          delete declinedManifestUpgrades[pkg.id];
          return true;
        },
        no: () => {
          declinedManifestUpgrades[pkg.id] = pkg.version;
          return false;
        },
        defaultYes: true
      });
      await game.settings.set("core", "declinedManifestUpgrades", declinedManifestUpgrades);
      return accepted;
    }

    /* -------------------------------------------- */
    /*  Installation Progress Bar                   */
    /* -------------------------------------------- */

    /**
     * Update the UI progress bar in response to server progress ticks.
     * @param {ProgressReceiverPacket} [progress]  The incremental progress information.
     */
    onProgress({action, id, title, pct, step, message}={}) {
      const { STEPS } = CONST.SETUP_PACKAGE_PROGRESS;
      if ( !this.constructor.progressActions.has(action) ) return;
      if ( [STEPS.VEND, STEPS.COMPLETE].includes(step) ) return this.removeProgressBar(id);
      const bar = this.#getProgressBar(id);
      if ( bar && Number.isNumeric(pct) ) {
        const status = [message ? game.i18n.localize(message) : null, title ?? id, `${pct}%`].filterJoin(" ");
        bar.firstElementChild.style.maxWidth = `${pct}%`;
        bar.firstElementChild.firstElementChild.innerText = status;
      }
    }

    /* -------------------------------------------- */

    /**
     * Get the progress bar element used to track installation for a certain package ID.
     * @param {string} packageId        The package being installed
     * @returns {HTMLDivElement|null}   The progress bar element to use
     */
    #getProgressBar(packageId) {

      // Existing bar
      let bar = this.progress.get(packageId);
      if ( bar ) return bar;

      // Too many bars
      if ( this.progress.size >= SetupPackages.MAX_PROGRESS_BARS ) return null;

      // New Bar
      const d = document.createElement("div");
      d.innerHTML = `
    <div class="progress-bar">
        <div class="bar">
            <span class="pct"></span>
        </div>
    </div>`;
      bar = d.firstElementChild;
      this.progress.set(packageId, bar);

      // Add to DOM
      document.getElementById("progress").appendChild(bar);
      return bar;
    }

    /* -------------------------------------------- */

    /**
     * Remove a Progress Bar from the DOM and from the progress mapping.
     * @param {string} id  The operation ID that is no longer being tracked.
     */
    removeProgressBar(id) {
      const bar = this.progress.get(id);
      if ( bar ) {
        bar.remove();
        this.progress.delete(id);
      }
    }
  }

  /**
   * @typedef {Object} NewsItem
   * @property {string} title           The title of the featured item
   * @property {string} image           The background image URL
   * @property {string} url             The website URL where clicking on the link should lead
   * @property {string} [caption]       A caption used for featured content
   */

  /**
   * An application that renders the Setup sidebar containing News and Featured Content widgets
   */
  class SetupSidebar extends Application {

    /** @inheritdoc */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "setup-sidebar",
        template: "templates/setup/setup-sidebar.hbs",
        popOut: false
      });
    }

    /* -------------------------------------------- */

    /** @override */
    async getData(options) {
      return {
        featured: game.data.featuredContent,
        news: game.data.news
      };
    }
  }

  /**
   * An application which displays Foundry Virtual Tabletop release notes to the user during the update progress.
   */
  class UpdateNotes extends Application {
    constructor(target, options) {
      super(options);
      this.target = target;
      this.candidateReleaseData = new foundry.config.ReleaseData(this.target);
      ui.updateNotes = this;
    }

    /* ----------------------------------------- */

    /** @override */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "update-notes",
        template: "templates/setup/update-notes.hbs",
        width: 720
      });
    }

    /* ----------------------------------------- */

    /** @override */
    get title() {
      return `Update Notes - ${this.candidateReleaseData.display}`;
    }

    /* ----------------------------------------- */

    /** @override */
    async getData(options={}) {
      return {
        notes: this.target.notes,
        requiresManualInstall: this.candidateReleaseData.isGenerationalChange(game.release),
        version: this.candidateReleaseData.version
      }
    }

    /* ----------------------------------------- */

    /** @override */
    activateListeners(html) {
      super.activateListeners(html);
      html.find("[data-action]").on("click", this.#onAction.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Handle clicking an action button.
     * @param {PointerEvent} event  The triggering event.
     */
    async #onAction(event) {
      const action = event.currentTarget.dataset.action;
      switch ( action ) {
        case "createSnapshot":
          this.toggleLock(true);
          await ui.setupUpdate._onCreateSnapshot();
          this.toggleLock(false);
          break;

        case "update":
          event.preventDefault();
          this.toggleLock(true);
          document.getElementById("update-core").click();
          break;
      }
    }

    /* -------------------------------------------- */

    /**
     * Toggle the locked state of the interface.
     * @param {boolean} locked  Is the interface locked?
     */
    toggleLock(locked) {
      const element = this.element[0];
      if ( !element ) return;
      element.querySelectorAll("[data-action]").forEach(el => el.disabled = locked);
    }

    /* ----------------------------------------- */

    /**
     * Update the button at the footer of the Update Notes application to reflect the current status of the workflow.
     * @param {object} progressData       Data supplied by SetupConfig#_onCoreUpdate
     */
    static updateButton(progressData) {
      const notes = ui.updateNotes;
      if ( !notes?.rendered ) return;
      const button = notes.element.find('[data-action="update"]')[0];
      if ( !button ) return;
      const icon = button.querySelector("i");
      icon.className = progressData.pct < 100 ? "fas fa-spinner fa-pulse" : "fas fa-check";
      const label = button.querySelector("label");
      label.textContent = game.i18n.localize(progressData.step);
    }
  }

  /**
   * The software update application.
   */
  class SetupUpdate extends Application {

    /** @override */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "setup-update",
        template: "templates/setup/setup-update.hbs",
        popOut: false,
      });
    }

    /**
     * The current update step. Either "updateCheck" or "updateDownload"
     * @type {string}
     */
    #action = "updateCheck";

    /**
     * The currently bound update progress listener
     * @type {function}
     */
    #onProgress;

    /* -------------------------------------------- */

    /** @override */
    getData(options={}) {
      const canReachInternet = game.data.addresses.remote;
      const couldReachWebsite = game.data.coreUpdate.couldReachWebsite;
      return {
        coreVersion: game.version,
        release: game.release,
        coreVersionHint: game.i18n.format("SETUP.CoreVersionHint", {versionDisplay: game.release.display}),
        updateChannel: game.data.options.updateChannel,
        updateChannels: Object.entries(CONST.SOFTWARE_UPDATE_CHANNELS).reduce((obj, c) => {
          obj[c[0]] = game.i18n.localize(c[1]);
          return obj;
        }, {}),
        updateChannelHints: Object.entries(CONST.SOFTWARE_UPDATE_CHANNELS).reduce((obj, c) => {
          obj[c[0]] = game.i18n.localize(`${c[1]}Hint`);
          return obj;
        }, {}),
        coreUpdate: game.data.coreUpdate.hasUpdate ? game.i18n.format("SETUP.UpdateAvailable", game.data.coreUpdate) : false,
        canReachInternet: canReachInternet,
        couldReachWebsite: couldReachWebsite,
        slowResponse: game.data.coreUpdate.slowResponse,
        updateButtonEnabled: canReachInternet && couldReachWebsite
      };
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers                */
    /* -------------------------------------------- */

    /** @override */
    activateListeners(html) {
      super.activateListeners(html);
      html.find("select[name='updateChannel']").on("change", this.#onChangeChannel.bind(this));
      html.find("button[data-action]").on("click", this.#onClickButton.bind(this));
      html.submit(this.#onSubmit.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Handle update application button clicks.
     * @param {PointerEvent} event  The triggering click event.
     */
    #onClickButton(event) {
      event.preventDefault();
      const button = event.currentTarget;
      switch ( button.dataset.action ) {
        case "setup":
          window.location.href = foundry.utils.getRoute("setup");
          break;
      }
    }

    /* -------------------------------------------- */

    /**
     * When changing the software update channel, reset the state of the update button and "Force Update" checkbox.
     * Clear results from a prior check to ensure that users don't accidentally perform an update for some other channel.
     * @param {Event} event     The select change event
     */
    async #onChangeChannel(event) {
      this.#action = "updateCheck"; // reset the action
      const button = document.getElementById("update-core");
      button.children[1].textContent = game.i18n.localize("SETUP.UpdateCheckFor");
      const check = document.querySelector("input[name='forceUpdate']");
      check.checked = false;
    }

    /* -------------------------------------------- */

    /**
     * Handle button clicks to update the core VTT software
     * @param {Event} event
     */
    async #onSubmit(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector("#update-core");
      const label = button.querySelector("label");

      // Disable the form
      button.disabled = true;
      form.disabled = true;

      // Bind the progress listener
      if ( this.#action === "updateDownload" ) {
        this.#onProgress = this.#onUpdateProgress.bind(this);
        Setup._addProgressListener(this.#onProgress);
      }

      // Prepare request data
      const requestData = {
        action: this.#action,
        updateChannel: form.updateChannel.value,
        forceUpdate: form.forceUpdate.checked
      };

      // Submit request
      let response;
      try {
        response = await Setup.post(requestData);
      } catch(err) {
        button.disabled = false;
        form.disabled = false;
        throw err;
      }

      // Display response info
      if ( response.info || response.warn ) {
        button.disabled = false;
        form.disabled = false;
        return response.info
          ? ui.notifications.info(response.info, {localize: true})
          : ui.notifications.warn(response.warn, {localize: true});
      }

      // Proceed to download step
      if ( this.#action === "updateCheck" ) {

        // Construct the release data
        const releaseData = new foundry.config.ReleaseData(response);
        ui.notifications.info(game.i18n.format("SETUP.UpdateInfoAvailable", {display: releaseData.display}));

        // Update the button
        if ( releaseData.isGenerationalChange(game.version) ) {
          label.textContent = game.i18n.localize("SETUP.UpdateNewGeneration");
        } else {
          this.#action = "updateDownload";
          label.textContent = game.i18n.format("SETUP.UpdateButtonDownload", {display: releaseData.display});
          button.disabled = false;
        }

        // Render release notes
        if ( response.notes ) new UpdateNotes(response).render(true);

        // Warn about module disabling
        if ( response.willDisableModules ) {
          ui.notifications.warn(game.i18n.format("SETUP.UpdateWarningWillDisable", {
            nIncompatible: game.modules.filter(m => m.incompatible).length,
            nModules: game.modules.size
          }), {permanent: true});
        }
      }
    }

    /* -------------------------------------------- */

    /**
     * Handle creating a snapshot.
     * @internal
     */
    async _onCreateSnapshot() {
      const progress = this.#updateProgressBar.bind(this);
      Setup._addProgressListener(progress);
      this.toggleLock(true);
      await Setup.createSnapshot({ dialog: true }, { packageList: false });
      this.toggleLock(false);
      Setup._removeProgressListener(progress);
    }

    /* -------------------------------------------- */

    /**
     * Toggle the locked state of the update interface.
     * @param {boolean} locked  Is the interface locked?
     */
    toggleLock(locked) {
      const element = this.element[0];
      if ( !element ) return;
      element.querySelectorAll("button").forEach(el => el.disabled = locked);
    }

    /* -------------------------------------------- */
    /*  Socket Listeners and Handlers               */
    /* -------------------------------------------- */

    /**
     * The progress function registered with Setup._progressListeners
     * @param {{type: string, step: string, pct: number, message: string}} data    Progress data emitted by the server
     */
    #onUpdateProgress(data) {
      const steps = CONST.SETUP_PACKAGE_PROGRESS.STEPS;

      // Complete update
      if ( [steps.COMPLETE, steps.ERROR].includes(data.step) ) {
        Setup._removeProgressListener(this.#onProgress);
        this.#onProgress = undefined;

        // Re-enable the form
        const form = this.element[0];
        form.disabled = false;

        // Display a notification message
        const level = data.step === steps.COMPLETE ? "info" : "error";
        ui.notifications[level](data.message, {localize: true, permanent: true});
        ui.updateNotes.close();
      }

      // Update the release notes
      else {
        UpdateNotes.updateButton(data);
        ui.updateNotes.setPosition({height: "auto"});
      }

      // Update progress bar
      this.#updateProgressBar(data);
      this.#updateProgressButton(data);
    }

    /* -------------------------------------------- */

    /**
     * Update the display of an installation progress bar for a particular progress packet
     * @param {object} data   The progress update data
     */
    #updateProgressBar(data) {
      const progress = document.getElementById("update-progress");

      // Update Bar
      const bar = progress.firstElementChild;
      bar.style.maxWidth = `${data.pct}%`;

      // Update Label
      const label = bar.firstElementChild;
      label.innerText = [game.i18n.localize(data.message), data.title, `${data.pct}%`].filterJoin(" ");
      const steps = CONST.SETUP_PACKAGE_PROGRESS.STEPS;
      progress.style.display = [steps.COMPLETE, steps.ERROR].includes(data.step) ? "" : "initial";
    }

    /* -------------------------------------------- */

    /**
     * Update installation progress for a particular button which triggered the action
     * @param {object} data   The progress update data
     */
    #updateProgressButton(data) {
      const button = document.getElementById("update-core");
      button.disabled = data.pct < 100;

      // Update Icon
      const steps = CONST.SETUP_PACKAGE_PROGRESS.STEPS;
      const icon = button.firstElementChild;
      if ( data.step === steps.ERROR ) icon.className = "fas fa-times";
      else if ( data.step === steps.COMPLETE ) icon.className = "fas fa-check";
      else icon.className = "fas fa-spinner fa-pulse";

      // Update label
      const label = icon.nextElementSibling;
      label.textContent = game.i18n.localize(data.message);
    }
  }

  /**
   * The User Management setup application.
   * @param {Users} object                      The {@link Users} object being configured.
   * @param {FormApplicationOptions} [options]  Application configuration options.
   */
  class UserManagement extends FormApplication {

    /** @inheritdoc */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "manage-players",
        template: "templates/setup/user-management.hbs",
        popOut: false,
        closeOnSubmit: false,
        scrollY: ["#player-list"]
      });
    }

    /* -------------------------------------------- */

    /**
     * The template path used to render a single user entry in the configuration view
     * @type {string}
     */
    static USER_TEMPLATE = "templates/setup/manage-user.hbs";

    /* -------------------------------------------- */

    /** @inheritdoc */
    async _render(...args) {
      await getTemplate(this.constructor.USER_TEMPLATE);
      return super._render(...args);
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    getData(options={}) {
      return {
        user: game.user,
        users: this.object,
        roles: UserManagement.#getRoleLabels(),
        options: this.options,
        userTemplate: this.constructor.USER_TEMPLATE,
        passwordString: game.data.passwordString
      };
    }

    /* -------------------------------------------- */

    /**
     * Get a mapping of role IDs to labels that should be displayed
     */
    static #getRoleLabels() {
      return Object.entries(CONST.USER_ROLES).reduce((obj, e) => {
        obj[e[1]] = game.i18n.localize(`USER.Role${e[0].titleCase()}`);
        return obj;
      }, {});
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers                */
    /* -------------------------------------------- */

    /** @inheritdoc */
    activateListeners(html) {
      super.activateListeners(html);
      const password = html.find("input[type='password']");
      password.focus(UserManagement.#onPasswordFocus).keydown(UserManagement.#onPasswordKeydown);
      html.on("click", "[data-action]", UserManagement.#onAction);
      html.find("label.show").click(UserManagement.#onShowPassword);
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    async _updateObject(event, formData) {

      // Construct updates array
      const userData = foundry.utils.expandObject(formData).users;
      const updates = Object.entries(userData).reduce((arr, e) => {
        const [id, data] = e;

        // Identify changes
        const user = game.users.get(id);
        const diff = foundry.utils.diffObject(user.toObject(), data);
        if ( data.password === game.data.passwordString ) delete diff.password;
        else diff.password = data.password;

        // Register changes for update
        if ( !foundry.utils.isEmpty(diff) ) {
          diff._id = id;
          arr.push(diff);
        }
        return arr;
      }, []);

      // The World must have at least one Gamemaster
      if ( !Object.values(userData).some(u => u.role === CONST.USER_ROLES.GAMEMASTER) ) {
        return ui.notifications.error("USERS.NoGMError", {localize: true});
      }

      // Update all users and redirect
      try {
        await User.updateDocuments(updates, {diff: false});
        ui.notifications.info("USERS.UpdateSuccess", {localize: true});
        return setTimeout(() => window.location.href = foundry.utils.getRoute("game"), 1000);
      } catch(err) {
        this.render();
      }
    }

    /* -------------------------------------------- */

    /**
     * Handle focus in and out of the password field.
     * @param {PointerEvent} event     The initiating pointer event
     */
    static #onPasswordFocus(event) {
      event.currentTarget.select();
    }

    /* -------------------------------------------- */

    /**
     * Toggle visibility of the "Show Password" control.
     * @param {KeyboardEvent} event     The initiating keydown event
     */
    static #onPasswordKeydown(event) {
      if ( ["Shift", "Ctrl", "Alt", "Tab"].includes(event.key) ) return;
      const input = event.currentTarget;
      const show = input.parentElement.nextElementSibling;
      show.hidden = false;
    }

    /* -------------------------------------------- */

    /**
     * Handle new user creation event.
     * @param {PointerEvent} event      The originating click event
     */
    static async #onAction(event) {
      event.preventDefault();
      const button = event.currentTarget;
      button.disabled = true;
      switch ( button.dataset.action ) {
        case "create-user":
          await UserManagement.#onUserCreate();
          break;
        case "deleteUser":
          await UserManagement.#onUserDelete(button);
          break;
        case "configure-permissions":
          new PermissionConfig().render(true);
          break;
        case "showPassword":
          UserManagement.#onShowPassword(button);
          break;
      }
      button.disabled = false;
    }

    /* -------------------------------------------- */

    /**
     * Reveal the password that is being configured so the user can verify they have typed it correctly.
     * @param {HTMLAnchorElement} button      The clicked control button
     */
    static #onShowPassword(button) {
      const li = button.closest(".player");
      const label = li.querySelector(".password");
      const input = label.firstElementChild;
      input.type = input.type === "password" ? "text" : "password";
    }

    /* -------------------------------------------- */

    /**
     * Handle creating a new User record in the form.
     */
    static async #onUserCreate() {

      // Create the new User
      let newPlayerIndex = game.users.size + 1;
      while ( game.users.getName(`Player${newPlayerIndex}` )) { newPlayerIndex++; }
      const user = await User.create({
        name: `Player${newPlayerIndex}`,
        role: CONST.USER_ROLES.PLAYER
      });

      // Render the User's HTML
      const html = await renderTemplate(UserManagement.USER_TEMPLATE, {
        user,
        roles: UserManagement.#getRoleLabels()
      });

      // Append the player to the list and restore the button
      $("#player-list").append(html);
    }

    /* -------------------------------------------- */

    /**
     * Handle user deletion event.
     * @param {HTMLAnchorElement} button      The clicked control button
     */
    static #onUserDelete(button) {
      const li = button.closest(".player");
      const user = game.users.get(li.dataset.userId);

      // Craft a message
      let message = `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("USERS.DeleteWarning")}</p>`;
      if (user.isGM) message += `<p class="warning"><strong>${game.i18n.localize("USERS.DeleteGMWarning")}</strong></p>`;

      // Render a confirmation dialog
      new Dialog({
        title: `${game.i18n.localize("USERS.Delete")} ${user.name}?`,
        content: message,
        buttons: {
          yes: {
            icon: '<i class="fas fa-trash"></i>',
            label: game.i18n.localize("Delete"),
            callback: async () => {
              await user.delete();
              li.remove();
            }
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("Cancel")
          }
        },
        default: "yes"
      }).render(true);
    }
  }

  /**
   * An Application that manages the browsing and installation of Packages.
   */
  class InstallPackage extends CategoryFilterApplication {
    constructor({packageType, search}={}, options) {
      super({}, options);
      this.#packageType = packageType;
      this.#initialSearch = search;
      ui.installPackages = this;
    }

    /**
     * The list of installable packages
     * @type {ClientPackage[]}
     */
    packages;

    /**
     * The list of Tags available
     * @type {object}
     */
    tags;

    /**
     * The type of package being installed, a value in PACKAGE_TYPES
     * @type {string}
     */
    #packageType;

    /**
     * The current package visibility filter that is applied
     * @type {string}
     */
    #visibility = "all";

    /**
     * An initial provided search filter value.
     * @type {string}
     */
    #initialSearch;

    /* -------------------------------------------- */

    /** @inheritdoc */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "install-package",
        template: "templates/setup/install-package.hbs",
        inputs: ['[name="filter"]', '[name="manifestURL"]'],
        initialCategory: "all"
      });
    }

    /* -------------------------------------------- */

    /** @override */
    get title() {
      return game.i18n.localize(`SETUP.Install${this.#packageType.titleCase()}`);
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    async _render(force=false, options={}) {
      await super._render(force, options);
      const type = this.#packageType;
      if ( Setup.cache[type].state === Setup.CACHE_STATES.COLD ) {
        Setup.warmPackages({type}).then(() => this.render(false));
      }
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    getData(options={}) {
      const data = super.getData(options);
      const type = data.packageType = this.#packageType;

      // Loading Progress
      if ( Setup.cache[type].state < Setup.CACHE_STATES.WARMED ) {
        data.progress = {label: "SETUP.PackagesLoading", icon: "fas fa-spinner fa-spin"};
      }
      else if ( !this.packages.length && Setup.cache[type].state === Setup.CACHE_STATES.WARMED ) {
        data.progress = {label: "SETUP.CouldntLoadPackages", icon: "fas fa-exclamation-triangle"};
      }

      // Visibility filters
      data.visibility = [
        { id: "inst", css: this.#visibility === "inst" ? " active" : "", label: "SETUP.PackageVisInst" },
        { id: "unin", css: this.#visibility === "unin" ? " active" : "", label: "SETUP.PackageVisUnin" },
        { id: "all", css: this.#visibility === "all" ? " active" : "", label: "SETUP.PackageVisAll" }
      ];

      // Filter packages
      const installed = new Set(game.data[`${type}s`].map(s => s.id));
      data.entries = this.packages.filter(p => {
        p.installed = installed.has(p.id);
        if ( (this.#visibility === "unin") && p.installed ) return false;
        if ( (this.#visibility === "inst") && !p.installed ) return false;
        p.cssClass = [p.installed ? "installed" : null, p.installable ? null: "locked"].filterJoin(" ");
        if ( this.category === "all" ) return true;
        if ( this.category === "premium" ) return p.protected;
        if ( this.category === "exclusive" ) return p.exclusive;
        return p.tags.includes(this.category);
      });
      return data;
    }

    /* -------------------------------------------- */

    /** @override */
    activateListeners(html) {
      super.activateListeners(html);
      html[0].children[0].onsubmit = ev => ev.preventDefault();
      html.find(".entry-title a.website-link").click(this.#onClickPackageLink.bind(this));
      html.find("button.install").click(this.#onClickPackageInstall.bind(this));
      html.find("button[type='submit']").click(this.#onClickManifestInstall.bind(this));
      html.find(".visibilities .visibility").click(this.#onClickVisibilityFilter.bind(this));

      // Assign an initial search value
      const loading = Setup.cache[this.#packageType].state < Setup.CACHE_STATES.WARMED;
      if ( this.#initialSearch && !loading ) {
        this._inputs[0] = this.#initialSearch;
        this._searchFilters[0].filter(null, this.#initialSearch);
        this.#initialSearch = undefined;
      }
    }

    /* -------------------------------------------- */

    /**
     * Handle a left-click event on the package website link.
     * @param {PointerEvent} event    The originating click event
     */
    #onClickPackageLink(event) {
      event.preventDefault();
      const li = event.currentTarget.closest(".package");
      const href = `https://foundryvtt.com/packages/${li.dataset.packageId}/`;
      return window.open(href, "_blank");
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    _onClickEntryTitle(event) {
      event.preventDefault();
      const li = event.currentTarget.closest(".package");
      if ( li.classList.contains("installed") || li.classList.contains("locked") ) return;
      const manifestURL = li.querySelector("button.install").dataset.manifest;
      const input = this.element.find("input[name='manifestURL']")[0];
      input.value = manifestURL;
    }

    /* -------------------------------------------- */

    /**
     * Handle left-click events to filter to a certain visibility state.
     * @param {PointerEvent} event    The originating click event
     */
    #onClickVisibilityFilter(event) {
      event.preventDefault();
      this.#visibility = event.target.dataset.visibility || "all";
      this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle a left-click event on the package "Install" button.
     * @param {PointerEvent} event    The originating click event
     */
    async #onClickPackageInstall(event) {
      event.preventDefault();
      const button = event.currentTarget;
      button.disabled = true;
      let manifest = button.dataset.manifest;
      if ( !manifest ) return;
      await Setup.installPackage({type: this.#packageType, manifest});
      button.disabled = false;
    }

    /* -------------------------------------------- */

    /**
     * Handle a left-click event on the button to install by manifest URL.
     * @param {PointerEvent} event    The originating click event
     */
    async #onClickManifestInstall(event) {
      event.preventDefault();
      const button = event.currentTarget;
      button.disabled = true;
      const input = button.previousElementSibling;
      if ( !input.value ) {
        button.disabled = false;
        return;
      }
      // noinspection ES6MissingAwait
      Setup.installPackage({type: this.#packageType, manifest: input.value.trim()});
      input.value = "";
      button.disabled = false;
    }

    /* -------------------------------------------- */

    /** @override */
    _getSearchFields(entry) {
      return [
        entry.dataset.packageId ?? "",
        entry.querySelector(".entry-title h3")?.textContent ?? "",
        entry.querySelector(".tag.author")?.textContent ?? ""
      ];
    }

    /* -------------------------------------------- */

    /** @override */
    _prepareCategoryData() {
      if ( !this.packages?.length || !this.tags?.length ) {
        const {packages, tags} = InstallPackage.getTaggedPackages(this.#packageType);
        this.packages = packages;
        this.tags = tags;
      }

      const categories = Object.entries(this.tags).reduce((acc, [k, v]) => {
        v.id = k;
        v.active = this.category === k;
        v.css = v.active ? " active" : "";
        acc.push(v);
        return acc;
      }, []);

      return { categories, entries: this.packages ?? [] };
    }

    /* -------------------------------------------- */

    /**
     * Organize package data and cache it to the application
     * @param {string} type  The type of packages being retrieved
     * @returns {object}     The retrieved or cached packages
     */
    static getTaggedPackages(type) {

      // Identify package tags and counts
      const packages = [];
      const counts = {premium: 0, exclusive: 0};
      const unorderedTags = {};
      const codes = CONST.PACKAGE_AVAILABILITY_CODES;

      // Prepare package data
      for ( const pack of Setup.cache[type].packages.values() ) {
        const p = pack.toObject();
        const availability = pack.availability;

        // Skip packages which require downgrading or upgrading to an unstable version
        if ( [codes.REQUIRES_CORE_DOWNGRADE, codes.REQUIRES_CORE_UPGRADE_UNSTABLE].includes(availability) ) continue;

        // Create the array of package tags
        const tags = pack.tags.map(t => {
          const [k, v] = t;
          if ( !unorderedTags[k] ) unorderedTags[k] = {label: v, count: 0, [type]: true};
          unorderedTags[k].count++;
          return k;
        });

        // Structure package data
        foundry.utils.mergeObject(p, {
          cssClass: "",
          author: Array.from(pack.authors).map(a => a.name).join(", "),
          tags: tags,
          installable: availability !== codes.REQUIRES_CORE_UPGRADE_STABLE
        });
        if ( pack.protected ) {
          if ( !pack.owned ) p.installable = false;
          counts.premium++;
        }
        if ( pack.exclusive ) counts.exclusive++;
        packages.push(p);
      }

      // Organize category tags
      const orderedTags = Array.from(Object.keys(unorderedTags)).sort();
      const tags = orderedTags.reduce((obj, k) => {
        obj[k] = unorderedTags[k];
        return obj;
      }, {
        all: { label: game.i18n.localize("SETUP.PackageVisAll"), count: packages.length, [type]: true},
        premium: { label: game.i18n.localize("SETUP.PremiumContent"), count: counts.premium, [type]: true},
        exclusive: { label: game.i18n.localize("SETUP.ExclusiveContent"), count: counts.exclusive, [type]: true }
      });
      return { packages: packages, tags: tags };
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    _restoreInputs() {
      super._restoreInputs();
      if ( this.element.length ) {
        this.element[0].querySelector('[name="filter"]')?.focus();
      }
    }
  }

  /**
   * A class responsible for managing a server-side operation's progress lifecycle.
   */
  class ProgressReceiver {

    /**
     * @typedef {object} ProgressReceiverPacket
     * @property {string} action     The progress action.
     * @property {string} id         The operation identifier.
     * @property {number} pct        The progress percentage.
     * @property {string} step       The individual step in the action.
     * @property {string} [message]  A text status message.
     * @property {string} [title]    The title of the entry. If not provided, the ID is used instead.
     */

    /**
     * @typedef {object} ProgressReceiverOptions
     * @property {boolean} [notify=true]                  Spawn UI notifications during the lifecycle events.
     * @property {string} [title]                         A human-readable title for the operation.
     * @property {string} [successMessage]                A message to display on operation success.
     * @property {string} [failureMessage]                A message to display on operation failure.
     * @property {ProgressReceiverProgress} [onProgress]  A callback to invoke on every progress tick.
     */

    /**
     * @callback ProgressReceiverProgress
     * @param {ProgressReceiverPacket} data  The progress packet.
     */

    /**
     * @callback ProgressReceiverComplete
     * @param {ProgressReceiverPacket} data  Completion event data.
     * @returns {void}
     */

    /**
     * @param {string} operationId  A unique identifier for the operation.
     * @param {string} action       The operation action.
     * @param {object} [context]    Additional context to send with the request.
     * @param {ProgressReceiverOptions} [options]
     */
    constructor(operationId, action, context={}, options={}) {
      this.#operationId = operationId;
      this.#action = action;
      this.#context = context;
      this.#options = { notify: true, ...options };
    }

    /**
     * The operation action.
     * @type {string}
     */
    #action;

    /**
     * Additional context to send with the request.
     * @type {object}
     */
    #context;

    /**
     * Additional options to configure behavior.
     * @type {ProgressReceiverOptions}
     */
    #options;

    /**
     * A unique identifier for the operation.
     * @type {string}
     */
    #operationId;

    /**
     * The progress listener.
     * @type {function}
     */
    #progressListener = this._onProgress.bind(this);

    /**
     * A callback to invoke on operation success.
     * @type {function}
     */
    #resolve;

    /* -------------------------------------------- */

    /**
     * Handle operation completion.
     * @param {ProgressReceiverPacket} data  Completion event data.
     * @protected
     */
    _onComplete(data) {
      const { notify, successMessage } = this.#options;
      if ( notify && successMessage ) ui.notifications.info(successMessage);
      Setup._removeProgressListener(this.#progressListener);
      this.#resolve(data);
    }

    /* -------------------------------------------- */

    /**
     * Handle an error during the operation.
     * @param {object} data        Error event data.
     * @param {string} data.error  The error message.
     * @param {string} data.stack  The error stack.
     * @protected
     */
    _onError({ error, stack }) {
      const { notify, failureMessage } = this.#options;
      const err = new Error(error);
      err.stack = stack;
      if ( notify && failureMessage ) ui.notifications.error(failureMessage, { console: false, permanent: true });
      console.error(err);
      ui.setupPackages?.removeProgressBar(this.#operationId);
      Setup._removeProgressListener(this.#progressListener);
      this.#resolve(err);
    }

    /* -------------------------------------------- */

    /**
     * Handle progress ticks.
     * @param {ProgressReceiverPacket} data  Progress event data.
     * @protected
     */
    _onProgress(data) {
      const { STEPS } = CONST.SETUP_PACKAGE_PROGRESS;
      const { action, step } = data;
      if ( action !== this.#action ) return;
      const context = { ...data, id: this.#operationId };
      if ( (this.#options.title !== undefined) && !("title" in context) ) context.title = this.#options.title;
      ui.setupPackages?.onProgress(context);
      if ( this.#options.onProgress instanceof Function ) this.#options.onProgress(context);
      if ( step === STEPS.ERROR ) return this._onError(data);
      if ( step === STEPS.COMPLETE ) return this._onComplete(data);
    }

    /* -------------------------------------------- */

    /**
     * Handle a warning during the operation.
     * @param {object} data          Warning event data.
     * @param {string} data.warning  The warning message.
     * @protected
     */
    _onWarning({ warning }) {
      if ( this.#options.notify ) ui.notifications.warn(warning);
    }

    /* -------------------------------------------- */

    /**
     * Fire the request and begin listening for progress events.
     * @returns {Promise<void>}
     */
    listen() {
      return new Promise(async (resolve, reject) => {
        this.#resolve = resolve;
        Setup._addProgressListener(this.#progressListener);
        let response;
        try {
          response = await Setup.post({ ...this.#context, action: this.#action });
        } catch(err) {
          Setup._removeProgressListener(this.#progressListener);
          return reject(err);
        }
        if ( response.error ) this._onError(response);
        if ( response.warning ) this._onWarning(response);
      });
    }
  }

  /**
   * A class responsible for managing snapshot progress events that include a side-track for individual backup progress
   * events.
   */
  class SnapshotProgressReceiver extends ProgressReceiver {
    /**
     * @param {string} operationId   A unique identifier for the operation.
     * @param {string} action        The operation action.
     * @param {string} backupAction  The individual backup operation action.
     * @param {object} [context]     Additional context to send with the request.
     * @param {ProgressReceiverOptions} [options]
     */
    constructor(operationId, action, backupAction, context={}, options={}) {
      super(operationId, action, context, options);
      this.#backupAction = backupAction;
    }

    /**
     * The individual backup operation action to listen to.
     * @type {string}
     */
    #backupAction;

    /**
     * The passive backup progress listener.
     * @type {function}
     */
    #backupProgressListener = this.#onBackupProgress.bind(this);

    /* -------------------------------------------- */

    /**
     * Handle progress ticks on individual backup operations.
     * @param {ProgressReceiverPacket} data  Progress event data.
     */
    #onBackupProgress(data) {
      if ( data.action === this.#backupAction ) ui.setupPackages?.onProgress(data);
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onComplete(data) {
      Setup._removeProgressListener(this.#backupProgressListener);
      super._onComplete(data);
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    _onError(data) {
      for ( const id of ui.setupPackages?.progress.keys() ?? [] ) ui.setupPackages.removeProgressBar(id);
      Setup._removeProgressListener(this.#backupProgressListener);
      super._onError(data);
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    listen() {
      Setup._addProgressListener(this.#backupProgressListener);
      return super.listen();
    }
  }

  /**
   * @typedef {DialogOptions} SnapshotOperationDialogOptions
   * @property {boolean} [warning]            Whether the dialog contains a warning.
   * @property {boolean} [note]               Whether the dialog should prompt the user for a note.
   * @property {boolean} [confirmCode]        Whether the dialog should prompt the user for a confirmation code.
   * @property {boolean} [packageList]        Whether the dialog should include a list of currently-installed packages.
   * @property {SnapshotData} [snapshotData]  A snapshot associated with this operation.
   * @property {string} diskSpaceAction       The action value to send to /setup to request disk space information for
   *                                          this operation.
   * @property {string} message               The dialog message.
   * @property {string} [confirm]             An additional confirmation message.
   */

  /**
   * An application that prompts the user to confirm a snapshot operation.
   */
  class SnapshotOperationDialog extends Dialog {
    /**
     * @param {function} resolve  The function to invoke when the dialog is closed.
     * @param {DialogData} data
     * @param {SnapshotOperationDialogOptions} [options]
     */
    constructor(resolve, data, options={}) {
      const buttons = { confirm: { id: "confirm" }, cancel: { id: "cancel" } };
      super({ ...data, buttons, default: "confirm" }, options);
      this.#resolve = resolve;
      if ( options.confirmCode ) this.#confirmCode = (Math.random() + 1).toString(36).substring(7, 11);
    }

    /**
     * The code the user must enter to confirm the operation.
     * @type {string}
     */
    #confirmCode;

    /**
     * The disk space requirements for the operation.
     * @type {{required: string, available: string, enough: boolean}}
     */
    #diskSpace;

    /**
     * The function to invoke when the dialog is closed.
     * @type {function}
     */
    #resolve;

    /* -------------------------------------------- */

    /** @override */
    static wait(data={}, options={}, renderOptions={}) {
      return new Promise(resolve => new this(resolve, data, options).render(true, renderOptions));
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        classes: ["dialog", "snapshot-dialog"],
        width: 480,
        jQuery: false
      });
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _render(force=false, options={}) {
      let input;
      if ( this.element ) input = this.element.find("input").val();
      await super._render(force, options);
      if ( input ) this.element.find("input").val(input).focus();
      if ( !this.#diskSpace ) this.#checkDiskSpace().then(() => this.render());
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    getData(options={}) {
      const context = super.getData(options);
      context.content = this.#buildContent();
      context.buttons = this.#buildButtons();
      return context;
    }

    /* -------------------------------------------- */

    /**
     * Build the dialog button descriptors.
     * @returns {Record<string, Partial<DialogButton>>}
     */
    #buildButtons() {
      let yesLabel = "SETUP.BACKUPS.DiskSpaceChecking";
      if ( this.#diskSpace ) yesLabel = this.#diskSpace.enough ? "Yes" : "SETUP.BACKUPS.DiskSpaceInsufficient";
      return {
        confirm: {
          icon: '<i class="fas fa-check"></i>',
          label: game.i18n.localize(yesLabel),
          cssClass: "yes default bright",
          disabled: !this.#diskSpace?.enough
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("No"),
          cssClass: "no"
        }
      };
    }

    /* -------------------------------------------- */

    /**
     * Build the content for this dialog based on the passed options.
     * @returns {string}
     */
    #buildContent() {
      const unchanged = this.#getUnchangedPackageCount();
      return `
      <p ${this.options.warning ? 'class="notification warning"' : ""}>${game.i18n.localize(this.options.message)}</p>
      ${this.options.packageList ? `
        <p>${game.i18n.localize("SETUP.BACKUPS.CreateSnapshotPackageList")}</p>
        <ul>
          <li>${game.i18n.format("SETUP.BACKUPS.WorldCount", { count: game.worlds.size })}</li>
          <li>${game.i18n.format("SETUP.BACKUPS.ModuleCount", { count: game.modules.size })}</li>
          <li>${game.i18n.format("SETUP.BACKUPS.SystemCount", { count: game.systems.size })}</li>
        </ul>
      ` : ""}
      ${unchanged ? `
        <p>${game.i18n.format(`SETUP.BACKUPS.RestoreSnapshotUnchangedPackages${unchanged === 1 ? "" : "Pl"}`, {
          count: unchanged
        })}</p>
      ` : ""}
      <div class="disk-space">
        <em>${game.i18n.localize("SETUP.BACKUPS.DiskSpace")}:</em>
        <span>
          ${this.#diskSpace ? `
            ${game.i18n.format("SETUP.BACKUPS.DiskSpaceRequired", { required: this.#diskSpace.required })}
            &sol;
            ${game.i18n.format("SETUP.BACKUPS.DiskSpaceAvailable", { available: this.#diskSpace.available })}
          ` : '<i class="fas fa-spinner fa-spin"></i>'}
        </span>
      </div>
      ${this.options.note ? `
        <p>${game.i18n.localize("SETUP.BACKUPS.NoteHint")}</p>
        <input class="dark" type="text" autocomplete="off" name="note">
      ` : ""}
      ${this.#confirmCode ? `
        <p>${game.i18n.localize("SETUP.WorldDeleteConfirmCode")}</p>
        <p id="confirm-code"><span class="reference">${this.#confirmCode}</span></p>
        <input id="delete-confirm" name="code" class="dark" type="text" autocomplete="off" required autofocus
               placeholder="${this.#confirmCode}"
               aria-label="${game.i18n.format("SETUP.ConfirmCodeLabel", { code: this.#confirmCode })}">
      ` : ""}
      ${this.options.confirm ? `<p>${game.i18n.localize(this.options.confirm)}</p>` : ""}
    `;
    }

    /* -------------------------------------------- */

    /**
     * Determine the number of installed packages that are not included in the snapshot and will not be affected by the
     * snapshot restoration.
     * @returns {number}
     */
    #getUnchangedPackageCount() {
      if ( !this.options.snapshotData ) return 0;
      const packages = { world: new Set(), module: new Set(), system: new Set() };
      for ( const backupId of this.options.snapshotData.backups ) {
        const [type, id] = backupId.split(".");
        packages[type].add(id);
      }
      let count = 0;
      for ( const [type, cls] of Object.entries(PACKAGE_TYPES) ) {
        for ( const pkg of game[cls.collection] ) {
          if ( !packages[type].has(pkg.id) ) count++;
        }
      }
      return count;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async close(options = {}) {
      this.#resolve({ confirm: false });
      return super.close(options);
    }

    /* -------------------------------------------- */

    /**
     * Request disk space information for the given operation from the /setup endpoint.
     */
    async #checkDiskSpace() {
      const data = { action: this.options.diskSpaceAction };
      if ( this.options.snapshotData ) data.snapshotData = this.options.snapshotData;
      const { required, available } = await Setup.post(data, { timeoutMs: null });
      this.#diskSpace = {
        required: foundry.utils.formatFileSize(required, { decimalPlaces: 0 }),
        available: foundry.utils.formatFileSize(available, { decimalPlaces: 0 }),
        enough: available > required
      };
    }

    /* -------------------------------------------- */

    /** @override */
    submit(button, event) {
      const el = this.element[0].querySelector(`[data-button="${button.id}"]`);
      if ( el.disabled ) return;
      switch ( button.id ) {
        case "confirm":
          this.#onConfirm();
          break;

        case "cancel":
          this.close();
          break;
      }
    }

    /* -------------------------------------------- */

    /**
     * Handle confirming the action.
     */
    #onConfirm() {
      const element = this.element[0];
      if ( this.options.confirmCode ) {
        const code = element.querySelector('input[name="code"]').value;
        if ( code !== this.#confirmCode ) {
          ui.notifications.error("SETUP.PackageDeleteWorldConfirm", { localize: true });
          this.#resolve({ confirm: false });
          return this.close();
        }
      }
      if ( this.options.note ) this.#resolve({ note: element.querySelector('input[name="note"]').value, confirm: true });
      this.#resolve({ confirm: true });
      return this.close();
    }
  }

  /**
   * A library of package management commands which are used by various interfaces around the software.
   */
  let Setup$1 = class Setup extends Game {

    /**
     * An enum that indicates a state the Cache is in
     * @enum {number}
     */
    static CACHE_STATES = {
      COLD: 0,
      WARMING: 1,
      WARMED: 2
    };

    /**
     * The name of the setting used to persist package favorites.
     * @type {string}
     */
    static FAVORITE_PACKAGES_SETTING = "setupPackageFavorites";

    /**
     * A cached object of retrieved packages from the web server
     * @type {{
     *   world: {packages: Map<string,World>, state: Setup.CACHE_STATES},
     *   system: {packages: Map<string,System>, state: Setup.CACHE_STATES},
     *   module: {packages: Map<string,Module>, state: Setup.CACHE_STATES}
     * }}
     */
    static cache = {
      world: { packages: new Map(), state: Setup.CACHE_STATES.COLD },
      module: { packages: new Map(), state: Setup.CACHE_STATES.COLD },
      system: { packages: new Map(), state: Setup.CACHE_STATES.COLD }
    };

    /**
     * A cached list of the user's backups.
     * @type {BackupsListing|null}
     */
    static backups = null;

    /**
     * Store a reference to any in-flight request to list backups.
     * @type {Promise|null}
     */
    static #listingBackups = null;

    /**
     * A reference to the setup URL used under the current route prefix, if any
     * @type {string}
     */
    static get setupURL() {
      return foundry.utils.getRoute("setup");
    }

    /* -------------------------------------------- */

    /**
     * Register core game settings
     * @override
     */
    registerSettings() {
      super.registerSettings();
      game.settings.register("core", "declinedManifestUpgrades", {
        scope: "client",
        config: false,
        type: Object,
        default: {}
      });
      game.settings.register("core", Setup.FAVORITE_PACKAGES_SETTING, {
        scope: "client",
        config: false,
        type: Object,
        default: {worlds: [], systems: [], modules: []}
      });
      game.settings.register("core", "setupViewModes", {
        scope: "client",
        config: false,
        type: Object,
        default: {worlds: "GALLERY", systems: "GALLERY", modules: "TILES"}
      });
    }

    /* -------------------------------------------- */

    /** @override */
    setupPackages(data) {
      super.setupPackages(data);
      const Collection = foundry.utils.Collection;
      if ( data.worlds ) {
        this.worlds = new Collection(data.worlds.map(m => [m.id, new World(m)]));
      }
      if ( data.systems ) {
        this.systems = new Collection(data.systems.map(m => [m.id, new System(m)]));
      }
    }

    /* -------------------------------------------- */

    /** @override */
    static async getData(socket, view) {
      let req;
      switch (view) {
        case "auth": case "license": req = "getAuthData"; break;
        case "join": req = "getJoinData"; break;
        case "players": req = "getPlayersData"; break;
        case "setup": req = "getSetupData"; break;
        case "update": req = "getUpdateData"; break;
      }
      return new Promise(resolve => {
        socket.emit(req, resolve);
      });
    }

    /* -------------------------------------------- */
    /*  View Handlers                               */
    /* -------------------------------------------- */

    /** @override */
    async _initializeView() {
      switch (this.view) {
        case "auth":
          return this.#authView();
        case "license":
          return this.#licenseView();
        case "setup":
          return this.#setupView();
        case "players":
          return this.#playersView();
        case "join":
          return this.#joinView();
        case "update":
          return this.#updateView();
        default:
          throw new Error(`Unknown view URL ${this.view} provided`);
      }
    }

    /* -------------------------------------------- */

    /**
     * The application view which displays the End User License Agreement (EULA).
     */
    #licenseView() {
      ui.notifications = new Notifications().render(true);

      // Render EULA
      const form = document.getElementById("license-key");
      if ( !form ) {
        new EULA().render(true);
        return;
      }

      // Allow right-clicks specifically in the key field
      const input = document.getElementById("key");
      input?.addEventListener("contextmenu", ev => ev.stopPropagation());
    }

    /* -------------------------------------------- */

    /**
     * The application view which displays the admin authentication application.
     */
    #authView() {
      if ( !globalThis.SIGNED_EULA ) window.location.href = foundry.utils.getRoute("license");
      ui.notifications = new Notifications().render(true);
      new SetupAuthenticationForm().render(true);
    }

    /* -------------------------------------------- */

    /**
     * The application view which displays the application Setup and Configuration.
     */
    #setupView() {
      if ( !globalThis.SIGNED_EULA ) window.location.href = foundry.utils.getRoute("license");
      this.issueCount = Setup.#logPackageWarnings(this.data.packageWarnings, {notify: false});
      ui.notifications = (new Notifications()).render(true);
      ui.setupMenu = (new SetupMenu()).render(true);
      ui.setupPackages = (new SetupPackages()).render(true);
      ui.setupSidebar = (new SetupSidebar()).render(true);
      Setup._activateSocketListeners();
      SetupApplicationConfiguration.telemetryRequestDialog();
      ContextMenu.eventListeners();
      FontConfig._loadFonts();
      if ( !game.data.options.noBackups ) {
        const tour = game.tours.get("core.backupsOverview");
        if ( tour?.status === Tour.STATUS.UNSTARTED ) tour.start();
        Setup.listBackups();
      }
    }

    /* -------------------------------------------- */

    /**
     * Log server-provided package warnings so that they are discoverable on the client-side.
     * @param {object} packageWarnings         An object of package warnings and errors by package ID.
     * @param {object} [options]               Additional options to configure logging behaviour.
     * @param {boolean} [options.notify=true]  Whether to create UI notifications in addition to logging.
     * @returns {{error: number, warning: number, total: number}}  A count of the number of warnings and errors
     */
    static #logPackageWarnings(packageWarnings, {notify=true}={}) {
      const counts = {
        error: 0,
        warning: 0
      };
      for ( const pkg of Object.values(packageWarnings) ) {
        for ( const error of pkg.error ) {
          counts.error++;
          console.error(`[${pkg.id}] ${error}`);
        }
        for ( const warning of pkg.warning ) {
          counts.warning++;
          console.warn(`[${pkg.id}] ${warning}`);
        }
      }

      // Notify
      if ( notify && counts.errors ) {
        const err = game.i18n.format("PACKAGE.SetupErrors", {number: counts.errors});
        ui.notifications.error(err, {permanent: true, console: false});
      }
      if ( notify && counts.warnings ) {
        const warn = game.i18n.format("PACKAGE.SetupWarnings", {number: counts.warnings});
        ui.notifications.warn(warn, {permanent: true, console: false});
      }

      // Return total count
      counts.total = counts.error + counts.warning;
      return counts;
    }

    /* -------------------------------------------- */

    /**
     * The application view which displays the User Configuration.
     */
    #playersView() {
      if ( !globalThis.SIGNED_EULA ) window.location.href = foundry.utils.getRoute("license");
      this.users = new Users(this.data.users);
      this.collections.set("User", this.users);
      this.collections.set("Setting", this.settings.storage.get("world"));

      // Render applications
      ui.notifications = new Notifications().render(true);
      ui.players = new UserManagement(this.users);
      ui.players.render(true);

      // Game is ready for use
      this.ready = true;
    }

    /* -------------------------------------------- */

    /**
     * The application view which displays the Game join and authentication screen.
     */
    #joinView() {
      if ( !globalThis.SIGNED_EULA ) window.location.href = foundry.utils.getRoute("license");

      // Configure Join view data
      this.users = new Users(this.data.users);
      this.collections.set("User", this.users);

      // Activate Join view socket listeners
      Users._activateSocketListeners(this.socket);

      // Render Join view applications
      ui.notifications = new Notifications().render(true);
      ui.join = new JoinGameForm().render(true);
    }

    /* -------------------------------------------- */

    /**
     * The application update view which allows for updating the Foundry Virtual Tabletop software.
     */
    #updateView() {
      ui.notifications = new Notifications().render(true);
      ui.setupUpdate = new SetupUpdate().render(true);
      Setup._activateSocketListeners();
    }

    /* -------------------------------------------- */
    /*  Package Management                          */
    /* -------------------------------------------- */

    /**
     * Check with the server whether a package of a certain type may be installed or updated.
     * @param {object} options    Options which affect how the check is performed
     * @param {string} options.type       The package type to check
     * @param {string} options.id         The package id to check
     * @param {string} [options.manifest] The manifest URL to check
     * @param {number} [options.timeout]  A timeout in milliseconds after which the check will fail
     * @returns {Promise<PackageManifestData>} The resulting manifest if an update is available
     */
    static async checkPackage({type="module", id, manifest, timeout=20000}={}) {
      return this.post({action: "checkPackage", type, id, manifest}, timeout);
    }

    /* -------------------------------------------- */

    /**
     * Prepares the cache of available and owned packages
     * @param {object} options          Options which configure how the cache is warmed
     * @param {string} options.type     The type of package being cached
     * @returns {Promise<void>}
     */
    static async warmPackages({type="system"}={}) {
      if ( Setup.cache[type].state > Setup.CACHE_STATES.COLD ) return;
      Setup.cache[type].state = Setup.CACHE_STATES.WARMING;
      await this.getPackages({type});
      Setup.cache[type].state = Setup.CACHE_STATES.WARMED;
    }

    /* -------------------------------------------- */

    /**
     * Get a Map of available packages of a given type which may be installed
     * @param {string} type
     * @returns {Promise<Map<string, ClientPackage>>}
     */
    static async getPackages({type="system"}={}) {

      // Return from cache
      if ( this.cache[type].packages?.size > 0 ) return this.cache[type].packages;

      // Request from server
      const packages = new Map();
      let response;
      try {
        response = await this.post({action: "getPackages", type: type});
      }
      catch(err) {
        ui.notifications.error(err.message, {localize: true});
        return packages;
      }

      // Populate the cache
      response.packages.forEach(p => {
        const pkg = new PACKAGE_TYPES[type](p);
        packages.set(p.id, pkg);
      });
      this.cache[type].packages = packages;
      this.cache[type].owned = response.owned;
      return packages;
    }

    /* -------------------------------------------- */

    /**
     * List the user's current backups.
     * @returns {Promise<BackupsListing|null>}
     */
    static async listBackups() {
      let backups = null;
      try {
        if ( !Setup.#listingBackups ) Setup.#listingBackups = this.post({ action: "listBackups" });
        backups = await Setup.#listingBackups;
      } catch ( err ) {
        ui.notifications.error(err.message, { localize: true });
      }
      this.backups = backups;
      Setup.#listingBackups = null;
      return backups;
    }

    /* -------------------------------------------- */

    /**
     * Open the Package Browser application
     * @param {string} packageType        The type of package being installed, in ["module", "system", "world"]
     * @param {string} [search]           An optional search string to filter packages
     * @returns {Promise<void>}
     */
    static async browsePackages(packageType, options={}) {
      return new InstallPackage({packageType, ...options})._render(true);
    }

    /* -------------------------------------------- */

    /**
     * Install a Package
     * @param {object} options              Options which affect how the package is installed
     * @param {string} options.type           The type of package being installed, in ["module", "system", "world"]
     * @param {string} options.id             The package id
     * @param {string} options.manifest       The package manifest URL
     * @param {boolean} [options.notify=true] Display a notification toast?
     * @returns {Promise<foundry.packages.BasePackage>} A Promise which resolves to the installed package
     */
    static async installPackage({type="module", id, manifest, notify=true}={}) {
      return new Promise(async (resolve, reject) => {

        /**
         * Handles an Install error
         * @param {InstallPackageError} response
         */
        const error = response => {
          if ( response.packageWarnings ) {
            ui.notifications.error(game.i18n.localize(response.error));
            Setup.#logPackageWarnings(response.packageWarnings, {notify: false});
          } else {
            const err = new Error(response.error);
            err.stack = response.stack;
            if ( notify ) {       // Display a user-friendly UI notification
              const message = response.error.split("\n")[0];
              ui.notifications.error(game.i18n.format("SETUP.InstallFailure", {message}), {console: false});
            }
            console.error(err);   // Log the full error details to console
          }
          Setup._removeProgressListener(progress);
          resolve(response);
          ui.setupPackages?.render();
        };

        /**
         * Handles successful Package installation
         * @param {InstallPackageSuccess} data
         * @returns {Promise<void>}
         */
        const done = async data => {
          const pkg = new PACKAGE_TYPES[type](data.pkg);
          if ( notify ) {
            ui.notifications.info(game.i18n.format("SETUP.InstallSuccess", {type: type.titleCase(), id: pkg.id}));
          }

          // Trigger dependency installation (asynchronously)
          if ( pkg.relationships ) {
            // noinspection ES6MissingAwait
            this.installDependencies(pkg, {notify});
          }

          // Add the created package to game data
          pkg.install();

          // Update application views
          Setup._removeProgressListener(progress);
          await this.reload();
          resolve(pkg);
        };

        const progress = data => {
          if ( !((data.action === CONST.SETUP_PACKAGE_PROGRESS.ACTIONS.INSTALL_PKG) && (data.manifest === manifest)) ) return;
          ui.setupPackages.onProgress(data);
          if ( data.step === CONST.SETUP_PACKAGE_PROGRESS.STEPS.ERROR ) return error(data);
          if ( data.step === CONST.SETUP_PACKAGE_PROGRESS.STEPS.VEND ) return done(data);
        };
        Setup._addProgressListener(progress);

        // Submit the POST request
        let response;
        try {
          response = await this.post({action: CONST.SETUP_PACKAGE_PROGRESS.ACTIONS.INSTALL_PKG, type, id, manifest});
        } catch(err) {
          return reject(err);
        }

        // Handle errors and warnings
        if ( response.error ) error(response);
        if ( response.warning && notify ) ui.notifications.warn(response.warning);
      });
    }

    /* -------------------------------------------- */

    /**
     * Install a set of dependency modules which are required by an installed package
     * @param {ClientPackage} pkg   The package which was installed that requested dependencies
     * @param {object} options      Options which modify dependency installation, forwarded to installPackage
     * @returns {Promise<void>}
     */
    static async installDependencies(pkg, options={}) {
      const dependencyChecks = new Map();

      // Check required Relationships
      for ( let d of pkg.relationships?.requires ?? [] ) {
        await this.#checkDependency(d, dependencyChecks);
      }
      // Check recommended Relationships
      for ( let d of pkg.relationships?.recommends ?? [] ) {
        await this.#checkDependency(d, dependencyChecks, false);
      }

      const uninstalled = Array.from(dependencyChecks.values()).filter(d => d.installNeeded);
      if ( !uninstalled.length ) return;

      // Prepare data for rendering
      const categories = uninstalled.reduce((obj, dep) => {
        if ( dep.canInstall && dep.required ) obj.canInstallRequired.push(dep);
        if ( dep.canInstall && !dep.required ) obj.canInstallOptional.push(dep);
        if ( !dep.canInstall && dep.required ) obj.cantInstallRequired.push(dep);
        if ( !dep.canInstall && !dep.required ) obj.cantInstallOptional.push(dep);
        return obj;
      }, { canInstallRequired: [], canInstallOptional: [], cantInstallRequired: [], cantInstallOptional: [] });
      const { canInstallRequired, canInstallOptional, cantInstallRequired, cantInstallOptional } = categories;
      const data = {
        title: pkg.title,
        totalDependencies: uninstalled.length,
        canInstallRequired,
        canInstallOptional,
        cantInstallRequired,
        cantInstallOptional
      };

      // Handle pluralization
      const singleDependency = data.totalDependencies === 1;
      const canInstall = data.canInstallRequired.length + data.canInstallOptional.length;
      const cantInstall = data.cantInstallRequired.length + data.cantInstallOptional.length;
      data.hasDependenciesLabel = singleDependency
        ? game.i18n.format("SETUP.PackageHasDependenciesSingular", {title: pkg.title})
        : game.i18n.format("SETUP.PackageHasDependenciesPlural", {title: pkg.title, number: data.totalDependencies});
      data.autoInstallLabel = canInstall === 1
        ? game.i18n.localize("SETUP.PackageDependenciesCouldInstallSingular")
        : game.i18n.format("SETUP.PackageDependenciesCouldInstallPlural", {number: canInstall});
      data.manualInstallLabel = cantInstall === 1
        ? game.i18n.localize("SETUP.PackageDependenciesCouldNotInstallSingular")
        : game.i18n.format("SETUP.PackageDependenciesCouldNotInstallPlural", {number: cantInstall});
      // Prompt the user to confirm installation of dependency packages
      const html = await renderTemplate("templates/setup/install-dependencies.html", data);
      new Dialog(
        {
          title: game.i18n.localize("SETUP.PackageDependenciesTitle"),
          content: html,
          buttons: {
            automatic: {
              icon: '<i class="fas fa-bolt-auto"></i>',
              label: canInstall === 1
                ? game.i18n.localize("SETUP.PackageDependenciesAutomaticSingular")
                : game.i18n.format("SETUP.PackageDependenciesAutomaticPlural"),
              disabled: canInstall === 0,
              callback: async (event) => {
                // Install selected dependency packages
                const inputs = Array.from(event[0].querySelectorAll("input"));
                let installed = 0;
                for ( let d of dependencyChecks.values() ) {
                  if ( !d.installNeeded ) continue;

                  // Only install the package if the input is checked
                  if ( !inputs.find(i => i.name === d.id)?.checked ) continue;
                  await this.installPackage({type: d.type, id: d.id, manifest: d.manifest, ...options});
                  installed++;
                }
                return ui.notifications.info(game.i18n.format("SETUP.PackageDependenciesSuccess", {
                  title: pkg.title,
                  number: installed
                }));
              }
            },
            manual: {
              icon: '<i class="fas fa-wrench"></i>',
              label: game.i18n.localize(`SETUP.PackageDependenciesManual${singleDependency ? "Singular" : "Plural"}`),
              callback: () => {
                return ui.notifications.warn(game.i18n.format("SETUP.PackageDependenciesDecline", {
                  title: pkg.title
                }));
              }
            }
          },
          default: "automatic"
        }, {
          id: "setup-install-dependencies",
          width: 600
        }).render(true);
    }


    /* -------------------------------------------- */

    /**
     * @typedef {Object} PackageDependencyCheck
     * @property {string} id                The package id
     * @property {string} type              The package type
     * @property {string} manifest          The package manifest URL
     * @property {boolean} installNeeded    Whether the package is already installed
     * @property {boolean} canInstall       Whether the package can be installed
     * @property {string} message           An error message to display to the user
     * @property {string} url               The URL to the package
     * @property {string} version           The package version
     */

    /**
     * Checks a dependency to see if it needs to be installed
     * @param {RelatedPackage} relatedPackage                                   The dependency
     * @param {Map<string, PackageDependencyCheck>} dependencyChecks            The current map of dependencies to install
     * @returns {Promise<void>}
     * @private
     */
    static async #checkDependency(relatedPackage, dependencyChecks, required = true) {
      if ( !relatedPackage.id || dependencyChecks.has(relatedPackage.id) ) return;
      relatedPackage.type = relatedPackage.type || "module";

      let dependencyCheck = {
        id: relatedPackage.id,
        type: relatedPackage.type,
        manifest: "",
        installNeeded: true,
        canInstall: false,
        message: "",
        url: "",
        version: "",
        required: required,
        note: required ? game.i18n.localize("SETUP.RequiredPackageNote") : game.i18n.localize("SETUP.RecommendedPackageNote"),
        reason: relatedPackage.reason
      };

      const installed = game.data[`${relatedPackage.type}s`].find(p => p.id === relatedPackage.id);
      if ( installed ) {
        const msg = `Dependency ${relatedPackage.type} ${relatedPackage.id} is already installed.`;
        console.debug(msg);
        dependencyCheck.installNeeded = false;
        dependencyCheck.message = msg;
        dependencyChecks.set(dependencyCheck.id, dependencyCheck);
        return;
      }

      // Manifest URL provided
      let dependency;
      if ( relatedPackage.manifest ) {
        dependencyCheck.manifest = relatedPackage.manifest;
        dependencyCheck.url = relatedPackage.manifest;
        dependency = await PACKAGE_TYPES[relatedPackage.type].fromRemoteManifest(relatedPackage.manifest);
        if ( !dependency ) {
          const msg = `Requested dependency "${relatedPackage.id}" not found at ${relatedPackage.manifest}.`;
          console.warn(msg);
          dependencyCheck.message = msg;
          dependencyChecks.set(dependencyCheck.id, dependencyCheck);
          return;
        }
      }
      else {
        // Discover from package listing
        const packages = await Setup.getPackages({type: relatedPackage.type});
        dependency = packages.get(relatedPackage.id);
        if ( !dependency ) {
          const msg = `Requested dependency "${relatedPackage.id}" not found in ${relatedPackage.type} directory.`;
          console.warn(msg);
          dependencyCheck.message = msg;
          dependencyChecks.set(dependencyCheck.id, dependencyCheck);
          return;
        }

        // Prefer linking to Readme over Project URL over Manifest
        if ( dependency.readme ) dependencyCheck.url = dependency.readme;
        else if ( dependency.url ) dependencyCheck.url = dependency.url;
        else dependencyCheck.url = dependency.manifest;
        dependencyCheck.manifest = dependency.manifest;
      }
      dependencyCheck.version = dependency.version;

      /**
       * Test whether a package dependency version matches the defined compatibility criteria of its dependant package.
       * @param {string} dependencyVersion                 The version string of the dependency package
       * @param {PackageCompatibility} compatibility       Compatibility criteria defined by the dependant package
       * @param {string} [compatibility.minimum]           A minimum version of the dependency which is required
       * @param {string} [compatibility.maximum]           A maximum version of the dependency which is allowed
       * @returns {boolean}
       */
      function isDependencyCompatible(dependencyVersion, {minimum, maximum}={}) {
        if ( minimum && foundry.utils.isNewerVersion(minimum, dependencyVersion) ) return false;
        return !( maximum && foundry.utils.isNewerVersion(dependencyVersion, maximum) );
      }

      // Validate that the dependency is compatible
      if ( !isDependencyCompatible(dependency.version, relatedPackage.compatibility) ) {
        const range = [
          relatedPackage.compatibility?.minimum ? `>= ${relatedPackage.compatibility.minimum}` : "",
          relatedPackage.compatibility?.maximum && relatedPackage.compatibility?.maximum ? " and " : "",
          relatedPackage.compatibility?.maximum ? `<= ${relatedPackage.compatibility.maximum}` : ""
        ].join("");
        const msg = `No version of dependency "${relatedPackage.id}" found matching required range of ${range}.`;
        console.warn(msg);
        dependencyCheck.message = msg;
        dependencyChecks.set(dependencyCheck.id, dependencyCheck);
        return;
      }
      dependencyCheck.canInstall = true;
      dependencyChecks.set(dependencyCheck.id, dependencyCheck);

      // If the dependency has dependencies itself, take a fun trip down recursion lane
      for ( let d of dependency.relationships?.requires ?? [] ) {
        await this.#checkDependency(d, dependencyChecks);
      }
      for ( let d of dependency.relationships?.recommends ?? [] ) {
        await this.#checkDependency(d, dependencyChecks, false);
      }
    }

    /* -------------------------------------------- */

    /**
     * Handle requests to uninstall a package.
     * @param {BasePackage} pkg       The package to uninstall
     * @returns {Promise<void>}
     */
    static async uninstallPackage(pkg) {
      const typeLabel = game.i18n.localize(`PACKAGE.Type.${pkg.type}`);
      if ( pkg.locked ) {
        return ui.notifications.error(game.i18n.format("PACKAGE.UninstallLocked", {type: typeLabel, id: pkg.id}));
      }

      // Provide a deletion confirmation warning
      // For worlds, require the user to provide a deletion code
      const title = game.i18n.format("SETUP.PackageDeleteTitle", {type: typeLabel, title: pkg.title ?? pkg.id});
      let content = `
      <p>${game.i18n.format("SETUP.PackageDeleteConfirm", {type: typeLabel, title: pkg.title ?? pkg.id})}</p>
    `;
      let confirm;
      if ( pkg.type === "world" ) {
        content += `<p class="notification warning">${game.i18n.localize("SETUP.WorldDeleteConfirmWarning")}</p>`;
        confirm = await this.confirmCodeDialog({ title, content });
      } else {
        if ( pkg.hasStorage ) content += `<p>${game.i18n.localize("SETUP.PackageDeletePersistent")}</p>`;
        content += `<p class="notification warning">${game.i18n.localize("SETUP.PackageDeleteNoUndo")}</p>`;
        confirm = await Dialog.confirm({ title, content, options: { focus: false, width: 480 } });
      }
      if ( !confirm ) return;
      // Submit the server request
      try {
        await this.post({action: "uninstallPackage", type: pkg.type, id: pkg.id});
      } catch(err) {
        ui.notifications.error(`${game.i18n.localize("SETUP.UninstallFailure")}: ${err.message}`);
        throw err;
      }

      // Finalize the uninstallation
      PACKAGE_TYPES[pkg.type].uninstall(pkg.id);
      ui.notifications.info(`${typeLabel} ${pkg.id} ${game.i18n.localize("SETUP.UninstallSuccess")}.`);
      return this.reload();
    }

    /* -------------------------------------------- */
    /*  Backup Management                           */
    /* -------------------------------------------- */

    /**
     * Create a backup of a given package.
     * @param {BasePackage} pkg           The package.
     * @param {object} [options]
     * @param {string} [options.note]     An optional note for the backup. Ignored if dialog is true.
     * @param {boolean} [options.dialog]  Spawn a dialog to prompt the user for a note.
     * @returns {Promise<void>}
     */
    static async createBackup({ type, id, title }, { note, dialog=false }={}) {
      if ( dialog ) {
        const result = await Setup.#createBackupDialog(title);
        if ( !result.confirm ) return;
        note = result.note;
      }

      const { ACTIONS, STEPS } = CONST.SETUP_PACKAGE_PROGRESS;
      const backups = [{ type, packageId: id, note }];
      this.toggleLock(true, { message: "SETUP.BACKUPS.BackingUp" });
      let packet;
      setTimeout(() => {
        if ( (packet?.step === STEPS.ARCHIVE) && (packet?.pct === 0) ) {
          ui.notifications.info("SETUP.BACKUPS.LargePackageWarning", { localize: true, permanent: true });
        }
      }, 15000);
      const response = await new ProgressReceiver(id, ACTIONS.CREATE_BACKUP, { backups }, {
        successMessage: game.i18n.format("SETUP.BACKUPS.CreateBackupComplete", { title }),
        failureMessage: game.i18n.format("SETUP.BACKUPS.CreateBackupFailure", { title }),
        onProgress: data => packet = data
      }).listen();
      if ( Setup.backups && !(response instanceof Error) ) {
        Setup.backups[type] ??= {};
        Setup.backups[type][id] ??= [];
        Setup.backups[type][id].unshift(response.backupData);
      }
      this.toggleLock(false);
    }

    /* -------------------------------------------- */

    /**
     * Create a snapshot of the current installation state.
     * @param {object} [options]
     * @param {string} [options.note]     An optional note for the snapshot. Ignored if dialog is true.
     * @param {boolean} [options.dialog]  Spawn a dialog to prompt the user to confirm, and to supply a note.
     * @param {Partial<SnapshotOperationDialogOptions>} [dialogOptions]  Options to forward to the dialog.
     * @returns {Promise<void>}
     */
    static async createSnapshot({ note, dialog=false }={}, dialogOptions={}) {
      const { CREATE_SNAPSHOT, CREATE_BACKUP } = CONST.SETUP_PACKAGE_PROGRESS.ACTIONS;
      if ( dialog ) {
        const result = await SnapshotOperationDialog.wait({
          title: game.i18n.localize("SETUP.BACKUPS.CreateSnapshot")
        }, {
          message: "SETUP.BACKUPS.CreateSnapshotHint",
          confirm: "SETUP.BACKUPS.CreateSnapshotConfirm",
          packageList: true,
          note: true,
          diskSpaceAction: "checkCreateSnapshotDiskSpace",
          ...dialogOptions
        });
        if ( !result.confirm ) return;
        note = result.note;
      }

      this.toggleLock(true, { message: "SETUP.BACKUPS.BackingUp" });
      const operationId = foundry.utils.randomID();
      await new SnapshotProgressReceiver(operationId, CREATE_SNAPSHOT, CREATE_BACKUP, { note }, {
        title: "",
        successMessage: game.i18n.localize("SETUP.BACKUPS.CreateSnapshotComplete"),
        failureMessage: game.i18n.localize("SETUP.BACKUPS.CreateSnapshotFailure")
      }).listen();
      Setup.backups = null;
      this.toggleLock(false);
    }

    /* -------------------------------------------- */

    /**
     * Delete backups.
     * @param {BasePackage} pkg           The package whose backups are being deleted.
     * @param {string[]} backupIds        The IDs of the backups to delete.
     * @param {object} [options]
     * @param {boolean} [options.dialog]  Spawn a warning dialog and ask the user to confirm the action.
     * @returns {Promise<void>}
     */
    static async deleteBackups({ type, id, title }, backupIds, { dialog=false }={}) {
      const count = backupIds.length;
      if ( !count ) return;
      if ( dialog ) {
        const confirm = await this.confirmCodeDialog({
          title: game.i18n.format("SETUP.BACKUPS.DeleteBackupTitle", { title }),
          content: `<p>${game.i18n.format(`SETUP.BACKUPS.DeleteBackupWarning${count === 1 ? "" : "Pl"}`, { count })}</p>`
        });
        if ( !confirm ) return;
      }

      const ids = new Set(backupIds);
      const backups = Setup.backups[type][id].filter(backupData => ids.has(backupData.id));
      this.toggleLock(true, { message: "SETUP.BACKUPS.DeletingBackup" });
      await new ProgressReceiver(id, CONST.SETUP_PACKAGE_PROGRESS.ACTIONS.DELETE_BACKUP, { backups }, {
        failureMessage: game.i18n.format("SETUP.BACKUPS.DeleteBackupFailure", { title }),
        successMessage: game.i18n.format(`SETUP.BACKUPS.DeleteBackupComplete${count === 1 ? "" : "Pl"}`, { title, count })
      }).listen();
      if ( Setup.backups ) {
        Setup.backups[type][id] = Setup.backups[type][id].filter(backupData => !ids.has(backupData.id));
      }
      this.toggleLock(false);
    }

    /* -------------------------------------------- */

    /**
     * Delete snapshots.
     * @param {string[]} snapshotIds      The IDs of the snapshots to delete.
     * @param {object} [options]
     * @param {boolean} [options.dialog]  Spawn a warning dialog and ask the user to confirm the action.
     * @returns {Promise<void>}
     */
    static async deleteSnapshots(snapshotIds, { dialog=false }={}) {
      const count = snapshotIds.length;
      if ( !count ) return;
      if ( dialog ) {
        const confirm = await this.confirmCodeDialog({
          title: game.i18n.localize("SETUP.BACKUPS.DeleteSnapshotTitle"),
          content: `
          <p>${game.i18n.format(`SETUP.BACKUPS.DeleteSnapshotWarning${count === 1 ? "" : "Pl"}`, { count })}</p>
        `
        });
        if ( !confirm ) return;
      }

      const { DELETE_SNAPSHOT, DELETE_BACKUP } = CONST.SETUP_PACKAGE_PROGRESS.ACTIONS;
      const snapshots = snapshotIds.map(id => Setup.backups.snapshots[id]);
      this.toggleLock(true, { message: "SETUP.BACKUPS.DeletingSnapshot" });
      await new SnapshotProgressReceiver(foundry.utils.randomID(), DELETE_SNAPSHOT, DELETE_BACKUP, { snapshots }, {
        failureMessage: game.i18n.localize("SETUP.BACKUPS.DeleteSnapshotFailure"),
        successMessage: game.i18n.format(`SETUP.BACKUPS.DeleteSnapshotComplete${count === 1 ? "" : "Pl"}`, { count })
      }).listen();
      Setup.backups = null;
      this.toggleLock(false);
    }

    /* -------------------------------------------- */

    /**
     * Restore a backup.
     * @param {BackupData} backupData     The backup to restore.
     * @param {object} [options]
     * @param {boolean} [options.dialog]  Spawn a warning dialog and ask the user to confirm the action.
     * @returns {Promise<void>}
     */
    static async restoreBackup(backupData, { dialog=false }={}) {
      const { title, id } = backupData;
      if ( dialog ) {
        const confirm = await this.confirmCodeDialog({
          title: game.i18n.format("SETUP.BACKUPS.RestoreBackupTitle", { title }),
          content: `<p class="notification warning">${game.i18n.localize("SETUP.BACKUPS.RestoreBackupWarning")}</p>`
        });
        if ( !confirm ) return;
      }

      const backups = [backupData];
      const dateFormatter = new Intl.DateTimeFormat(game.i18n.lang, { dateStyle: "full", timeStyle: "short" });
      this.toggleLock(true, { message: "SETUP.BACKUPS.Restoring" });
      await new ProgressReceiver(id, CONST.SETUP_PACKAGE_PROGRESS.ACTIONS.RESTORE_BACKUP, { backups }, {
        failureMessage: game.i18n.format("SETUP.BACKUPS.RestoreBackupFailure", { title }),
        successMessage: game.i18n.format("SETUP.BACKUPS.RestoreBackupComplete", {
          title,
          date: dateFormatter.format(backupData.createdAt)
        })
      }).listen();
      await Setup.reload();
      this.toggleLock(false);
    }

    /* -------------------------------------------- */

    /**
     * Restore a snapshot.
     * @param {SnapshotData} snapshotData  The snapshot to restore.
     * @param {object} [options]
     * @param {boolean} [options.dialog]   Spawn a warning dialog and ask the user to confirm the action.
     * @returns {Promise<void>}
     */
    static async restoreSnapshot(snapshotData, { dialog=false }={}) {
      if ( dialog ) {
        const { confirm } = await SnapshotOperationDialog.wait({
          title: game.i18n.localize("SETUP.BACKUPS.RestoreSnapshotTitle")
        }, {
          snapshotData,
          message: "SETUP.BACKUPS.RestoreSnapshotWarning",
          warning: true,
          confirmCode: true,
          diskSpaceAction: "checkRestoreSnapshotDiskSpace"
        });
        if ( !confirm ) return;
      }

      const { id, createdAt } = snapshotData;
      const { ACTIONS } = CONST.SETUP_PACKAGE_PROGRESS;
      const dateFormatter = new Intl.DateTimeFormat(game.i18n.lang, { dateStyle: "full", timeStyle: "short" });

      this.toggleLock(true, { message: "SETUP.BACKUPS.Restoring" });
      await new SnapshotProgressReceiver(id, ACTIONS.RESTORE_SNAPSHOT, ACTIONS.RESTORE_BACKUP, { snapshotData }, {
        title: "",
        failureMessage: game.i18n.localize("SETUP.BACKUPS.RestoreSnapshotFailure"),
        successMessage: game.i18n.format("SETUP.BACKUPS.RestoreSnapshotComplete", {
          date: dateFormatter.format(createdAt)
        })
      }).listen();
      await Setup.reload();
      this.toggleLock(false);
    }

    /* -------------------------------------------- */

    /**
     * Restore the latest backup for a given package.
     * @param {BasePackage} pkg           The package.
     * @param {object} [options]
     * @param {boolean} [options.dialog]  Spawn a warning dialog and ask the user to confirm the action.
     * @returns {Promise<void>}
     */
    static async restoreLatestBackup({ id, type }, options={}) {
      if ( !this.backups ) await this.listBackups();
      const [backupData] = this.backups?.[type]?.[id] ?? [];
      if ( backupData ) return this.restoreBackup(backupData, options);
    }

    /* -------------------------------------------- */
    /*  Socket Listeners and Handlers               */
    /* -------------------------------------------- */

    /**
     * Activate socket listeners related to the Setup view.
     */
    static _activateSocketListeners() {
      game.socket.on("progress", Setup._onProgress);
    }

    /* --------------------------------------------- */

    /**
     * A list of functions to call on progress events.
     * @type {Function[]}
     */
    static _progressListeners = [];

    /* --------------------------------------------- */

    /**
     * Handle a progress event from the server.
     * @param {object} data  The progress update data.
     * @private
     */
    static _onProgress(data) {
      Setup._progressListeners.forEach(l => l(data));
    }

    /* --------------------------------------------- */

    /**
     * Add a function to be called on a progress event.
     * @param {Function} listener
     * @internal
     */
    static _addProgressListener(listener) {
      Setup._progressListeners.push(listener);
    }

    /* --------------------------------------------- */

    /**
     * Stop sending progress events to a given function.
     * @param {Function} listener
     * @internal
     */
    static _removeProgressListener(listener) {
      Setup._progressListeners = Setup._progressListeners.filter(l => l !== listener);
    }

    /* --------------------------------------------- */

    /**
     * Reload package data from the server and update its display
     * @returns {Promise<Object>}
     */
    static async reload() {
      return this.getData(game.socket, game.view).then(setupData => {
        foundry.utils.mergeObject(game.data, setupData);
        game.setupPackages(setupData);
        ui.setupPackages.render();
        ui.installPackages?.render();
      });
    }

    /* -------------------------------------------- */
    /*  Helper Functions                            */
    /* -------------------------------------------- */

    /**
     * Post to the Setup endpoint.
     * @param {object} requestData    An object of data which should be included with the POST request
     * @param {object} [options]      An object of options passed to the fetchWithTimeout method
     * @param {boolean} [requestOptions.notify]  Whether to spawn notification dialogs when errors are encountered.
     * @returns {Promise<object>}     A Promise resolving to the returned response data
     * @throws                        An error if the request was not successful
     */
    static async post(requestData, { notify=true, ...requestOptions }={}) {
      if ( game.ready ) {
        throw new Error("You may not submit POST requests to the setup page while a game world is currently active.");
      }

      // Post the request and handle redirects
      const url = foundry.utils.getRoute(game.view);
      let responseData;
      try {
        const response = await foundry.utils.fetchWithTimeout(url, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(requestData)
        }, requestOptions);

        // Handle redirect
        if ( response.redirected ) return window.location.href = response.url;

        // Process response
        responseData = await response.json();
      } catch(err) {
        if ( notify ) ui.notifications.error(err, {permanent: true});
        throw err;
      }

      // Handle server-side errors
      if ( responseData.error ) {
        const { error, ...data } = responseData;
        const err = new Error(game.i18n.localize(error));
        Object.assign(err, data);
        if ( notify ) ui.notifications.error(err, {permanent: true});
        throw err;
      }
      return responseData;
    }

    /* -------------------------------------------- */

    /**
     * Create a confirmation dialog that prompts the user to enter a code to proceed.
     * Base on https://stackoverflow.com/a/8084248
     * @param {object} [options]
     * @param {string} [options.title]    The dialog title.
     * @param {string} [options.content]  Additional dialog content.
     * @returns {Promise<boolean|null>}   Returns true if the user chose to proceed and the code was correct. Returns
     *                                    false if the code was incorrect or the user chose to not proceed. Returns null
     *                                    if the user dismissed the dialog.
     */
    static confirmCodeDialog({ title, content }={}) {
      const code = (Math.random() + 1).toString(36).substring(7, 11);
      content = `
      ${content ?? ""}
      <p>${game.i18n.localize("SETUP.WorldDeleteConfirmCode")}</p>
      <p id="confirm-code"><span class="reference">${code}</span></p>
      <input id="delete-confirm" class="dark" type="text" autocomplete="off" placeholder="${code}"
             aria-label="${game.i18n.format("SETUP.ConfirmCodeLabel", { code })}" required autofocus>
    `;
      return Dialog.confirm({
        title, content,
        options: {
          jQuery: false,
          focus: false,
          width: 480
        },
        yes: html => {
          const confirm = html.querySelector("#delete-confirm")?.value;
          if ( confirm === code ) return true;
          ui.notifications.error("SETUP.PackageDeleteWorldConfirm", { localize: true });
          return false;
        }
      });
    }

    /* -------------------------------------------- */

    /**
     * @typedef {object} BackupNoteConfirmation
     * @property {string} [note]    The user-supplied backup note.
     * @property {boolean} confirm  Whether the user wishes to proceed.
     */

    /**
     * Spawn the backup creation confirmation dialog.
     * @param {string} title  The package title.
     * @returns {Promise<BackupNoteConfirmation>}
     */
    static async #createBackupDialog(title) {
      const result = await Dialog.prompt({
        title: game.i18n.format("SETUP.BACKUPS.CreateBackup", { title }),
        content: `
        <p>${game.i18n.localize("SETUP.BACKUPS.NoteHint")}</p>
        <input class="dark" type="text" autocomplete="off">
      `,
        label: game.i18n.localize("SETUP.BACKUPS.Backup"),
        rejectClose: false,
        callback: html => html.querySelector("input").value,
        options: {
          width: 480,
          jQuery: false
        }
      });
      if ( result === null ) return { confirm: false };
      return { note: result, confirm: true };
    }

    /* -------------------------------------------- */

    /**
     * Toggle the locked state of the interface.
     * @param {boolean} locked  Is the interface locked?
     * @param {object} [options]
     */
    static toggleLock(locked, options={}) {
      ui.setupMenu?.toggleLock(locked, options);
      ui.setupPackages?.toggleLock(locked, options);
      Object.values(ui.windows).forEach(app => app.toggleLock?.(locked, options));
    }
  };

  var applications = /*#__PURE__*/Object.freeze({
    __proto__: null,
    EULA: EULA,
    JoinGameForm: JoinGameForm,
    SetupAuthenticationForm: SetupAuthenticationForm,
    SetupMenu: SetupMenu,
    SetupPackages: SetupPackages,
    UserManagement: UserManagement
  });

  // Add Global Exports
  globalThis.Setup = Setup$1;
  Setup$1.applications = applications;

})();
