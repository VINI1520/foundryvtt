/**
 * The Module Management Application.
 * This application provides a view of which modules are available to be used and allows for configuration of the
 * set of modules which are active within the World.
 */
class ModuleManagement extends FormApplication {
  constructor(...args) {
    super(...args);
    this._filter = this.isEditable ? "all" : "active";
    this._expanded = true;
  }

  /**
   * The named game setting which persists module configuration.
   * @type {string}
   */
  static CONFIG_SETTING = "moduleConfiguration";

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: game.i18n.localize("MODMANAGE.Title"),
      id: "module-management",
      template: "templates/sidebar/apps/module-management.html",
      popOut: true,
      width: 680,
      height: "auto",
      scrollY: [".package-list"],
      closeOnSubmit: false,
      filters: [{inputSelector: 'input[name="search"]', contentSelector: ".package-list"}]
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get isEditable() {
    return game.user.can("SETTINGS_MODIFY");
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const settings = game.settings.get("core", this.constructor.CONFIG_SETTING);
    const editable = this.isEditable;
    const counts = {all: game.modules.size, active: 0, inactive: 0};

    // Prepare modules
    const modules = game.modules.reduce((arr, module) => {
      const isActive = settings[module.id] === true;
      if ( isActive ) counts.active++;
      else if ( !editable ) return arr;
      else counts.inactive++;

      const mod = module.toObject();
      mod.active = isActive;
      mod.css = isActive ? " active" : "";
      mod.hasPacks = mod.packs.length > 0;
      mod.hasScripts = mod.scripts.length > 0;
      mod.hasStyles = mod.styles.length > 0;
      mod.systemOnly = mod.relationships?.systems.find(s => s.id === game.system.id);
      mod.systemTag = game.system.id;
      mod.authors = mod.authors.map(a => {
        if ( a.url ) return `<a href="${a.url}" target="_blank">${a.name}</a>`;
        return a.name;
      }).join(", ");
      mod.tooltip = null; // No tooltip by default
      const requiredModules = Array.from(game.world.relationships.requires)
        .concat(Array.from(game.system.relationships.requires));
      mod.required = !!requiredModules.find(r => r.id === mod.id);
      if ( mod.required ) mod.tooltip = game.i18n.localize("MODMANAGE.RequiredModule");

      // String formatting labels
      const authorsLabel = game.i18n.localize(`Author${module.authors.size > 1 ? "Pl" : ""}`);
      mod.labels = {authors: authorsLabel, ...module.getAvailabilityLabels()};

      // If the current System is not one of the supported ones, don't return
      if ( mod.relationships?.systems.size > 0 && !mod.systemOnly ) return arr;

      this._evaluateCompatibility(mod);
      mod.disabled = mod.required || !mod.enableable;
      return arr.concat([mod]);
    }, []).sort((a, b) => a.title.localeCompare(b.title));

    // Filters
    const filters = editable ? ["all", "active", "inactive"].map(f => ({
      id: f,
      label: game.i18n.localize(`MODMANAGE.Filter${f.titleCase()}`),
      count: counts[f] || 0
    })) : [];

    // Return data for rendering
    return { editable, filters, modules, expanded: this._expanded };
  }

  /* -------------------------------------------- */

  /**
   * Given a module, determines if it meets minimum and maximum compatibility requirements.
   * If not, it is marked as being unable to be activated.
   * If the package does not meet verified requirements, it is marked with a warning instead.
   * @param {object} module
   * @private
   */
  _evaluateCompatibility(module) {
    module.enableable = true;
    for ( const required of module.relationships.requires ) {
      if ( required.type !== "module" ) continue;

      // Verify the required package is installed
      const pkg = game.modules.get(required.id);
      if ( !pkg ) {
        module.enableable = false;
        required.class = "error";
        required.message = game.i18n.localize("SETUP.DependencyNotInstalled");
        continue;
      }

      // Test required package compatibility
      const c = required.compatibility;
      if ( !c ) continue;
      const dependencyVersion = pkg.version;
      if ( c.minimum && foundry.utils.isNewerVersion(c.minimum, dependencyVersion) ) {
        module.enableable = false;
        required.class = "error";
        required.message = game.i18n.format("SETUP.CompatibilityRequireUpdate",
          { version: required.compatibility.minimum});
        continue;
      }
      if ( c.maximum && foundry.utils.isNewerVersion(dependencyVersion, c.maximum) ) {
        module.enableable = false;
        required.class = "error";
        required.message = game.i18n.format("SETUP.CompatibilityRequireDowngrade",
          { version: required.compatibility.maximum});
        continue;
      }
      if ( c.verified && !foundry.utils.isNewerVersion(dependencyVersion, c.verified) ) {
        required.class = "warning";
        required.message = game.i18n.format("SETUP.CompatibilityRiskWithVersion",
          {version: required.compatibility.verified});
      }
    }

    // Record that a module may not be able to be enabled
    if ( !module.enableable ) module.tooltip = game.i18n.localize("MODMANAGE.DependencyIssues");
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.find('button[name="deactivate"]').click(this._onDeactivateAll.bind(this));
    html.find(".filter").click(this._onFilterList.bind(this));
    html.find("button.expand").click(this._onExpandCollapse.bind(this));
    html.find('input[type="checkbox"]').change(this._onChangeCheckbox.bind(this));

    // Allow users to filter modules even if they don't have permission to edit them.
    html.find('input[name="search"]').attr("disabled", false);
    html.find("button.expand").attr("disabled", false);

    // Activate the appropriate filter.
    html.find(`a[data-filter="${this._filter}"]`).addClass("active");

    // Initialize
    this._onExpandCollapse();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _renderInner(...args) {
    await loadTemplates(["templates/setup/parts/package-tags.html"]);
    return super._renderInner(...args);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getSubmitData(updateData={}) {
    const formData = super._getSubmitData(updateData);
    delete formData.search;
    return formData;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {
    const settings = game.settings.get("core", this.constructor.CONFIG_SETTING);
    const requiresReload = !foundry.utils.isEmpty(foundry.utils.diffObject(settings, formData));
    const setting = foundry.utils.mergeObject(settings, formData);

    // Ensure all relationships are satisfied
    for ( let [k, v] of Object.entries(setting) ) {
      if ( v === false ) continue;
      const mod = game.modules.get(k);
      if ( !mod ) {
        delete setting[k];
        continue;
      }
      if ( !mod.relationships?.requires?.length ) continue;
      const missing = mod.relationships.requires.reduce((arr, d) => {
        if ( d.type && (d.type !== "module") ) return arr;
        if ( !setting[d.id] ) arr.push(d.id);
        return arr;
      }, []);
      if ( missing.length ) {
        const warning = game.i18n.format("MODMANAGE.DepMissing", {module: k, missing: missing.join(", ")});
        this.options.closeOnSubmit = false;
        return ui.notifications.warn(warning);
      }
    }

    // Apply the setting
    if ( requiresReload ) SettingsConfig.reloadConfirm({world: true});
    return game.settings.set("core", this.constructor.CONFIG_SETTING, setting);
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to a module checkbox to prompt for whether or not to enable dependencies
   * @private
   */
  async _onChangeCheckbox(event) {
    const input = event.target;
    const module = game.modules.get(input.name);
    if ( !module.relationships ) return;
    const allPackages = Array.from(game.modules).concat([game.system, game.world]);

    const dependencies = module.relationships.requires.filter(x => {
      if ( x.type === "system" ) return false;
      const pack = game.modules.get(x.id);
      if ( !pack ) {
        ui.notifications.error(game.i18n.format("MODMANAGE.DepNotInstalled", {missing: x.id}));
        return false;
      }
      if ( pack.active === input.checked ) return false;
      if ( !input.checked ) {
        // Check if other modules depend on this dependency, and if so, remove it from the to-disable list.
        return !allPackages.find(a => {
          if ( (a.type === "module") && !a.active ) return false;
          if ( a.id === input.name ) return false;
          return a.relationships?.requires?.find(d => d.id === x.id);
        });
      }
      return true;
    });

    if ( !dependencies.size ) return;

    const html = await renderTemplate("templates/setup/impacted-dependencies.html", {
      enabling: input.checked,
      dependencies
    });

    return Dialog.confirm({
      title: game.i18n.localize("MODMANAGE.Dependencies"),
      content: html,
      yes: () => {
        for ( let d of module.relationships.requires ) {
          const dep = input.form[d.id];
          if ( dep ) dep.checked = input.checked;
        }
      },
      no: () => input.checked = false
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle a button-click to deactivate all modules
   * @private
   */
  _onDeactivateAll(event) {
    event.preventDefault();
    for ( let input of this.element[0].querySelectorAll('input[type="checkbox"]') ) {
      if ( !input.disabled ) input.checked = false;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle expanding or collapsing the display of descriptive elements
   * @private
   */
  _onExpandCollapse(event) {
    event?.preventDefault();
    this._expanded = !this._expanded;
    this.form.querySelectorAll(".package-description").forEach(pack =>
      pack.classList.toggle("hidden", !this._expanded)
    );
    const icon = this.form.querySelector("i.fa");
    icon.classList.toggle("fa-angle-double-down", this._expanded);
    icon.classList.toggle("fa-angle-double-up", !this._expanded);
    icon.parentElement.title = this._expanded ?
      game.i18n.localize("Collapse") : game.i18n.localize("Expand");
  }

  /* -------------------------------------------- */

  /**
   * Handle switching the module list filter.
   * @private
   */
  _onFilterList(event) {
    event.preventDefault();
    this._filter = event.target.dataset.filter;

    // Toggle the activity state of all filters.
    this.form.querySelectorAll("a[data-filter]").forEach(a =>
      a.classList.toggle("active", a.dataset.filter === this._filter));

    // Iterate over modules and toggle their hidden states based on the chosen filter.
    const settings = game.settings.get("core", this.constructor.CONFIG_SETTING);
    const list = this.form.querySelector("#module-list");
    for ( const li of list.children ) {
      const name = li.dataset.moduleId;
      const isActive = settings[name] === true;
      const hidden = ((this._filter === "active") && !isActive) || ((this._filter === "inactive") && isActive);
      li.classList.toggle("hidden", hidden);
    }

    // Re-apply any search filter query.
    const searchFilter = this._searchFilters[0];
    searchFilter.filter(null, searchFilter._input.value);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onSearchFilter(event, query, rgx, html) {
    const settings = game.settings.get("core", this.constructor.CONFIG_SETTING);
    for ( let li of html.children ) {
      const name = li.dataset.moduleId;
      const isActive = settings[name] === true;
      if ( (this._filter === "active") && !isActive ) continue;
      if ( (this._filter === "inactive") && isActive ) continue;
      if ( !query ) {
        li.classList.remove("hidden");
        continue;
      }
      const title = (li.querySelector(".package-title")?.textContent || "").trim();
      const author = (li.querySelector(".author")?.textContent || "").trim();
      const match = rgx.test(SearchFilter.cleanQuery(name)) ||
        rgx.test(SearchFilter.cleanQuery(title)) ||
        rgx.test(SearchFilter.cleanQuery(author));
      li.classList.toggle("hidden", !match);
    }
  }
}
