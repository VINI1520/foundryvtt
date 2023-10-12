/**
 * An application for configuring data across all installed and active packages.
 */
class PackageConfiguration extends FormApplication {

  static get categoryOrder() {
    return ["all", "core", "system", "module", "unmapped"];
  }

  /**
   * The name of the currently active tab.
   * @type {string}
   */
  get activeCategory() {
    return this._tabs[0].active;
  }

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["package-configuration"],
      template: "templates/sidebar/apps/package-configuration.html",
      categoryTemplate: undefined,
      width: 780,
      height: 680,
      resizable: true,
      scrollY: [".filters", ".categories"],
      tabs: [{navSelector: ".tabs", contentSelector: "form .scrollable", initial: "all"}],
      filters: [{inputSelector: 'input[name="filter"]', contentSelector: ".categories"}],
      submitButton: false
    });
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options={}) {
    const data = this._prepareCategoryData();
    data.categoryTemplate = this.options.categoryTemplate;
    data.submitButton = this.options.submitButton;
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Prepare the structure of category data which is rendered in this configuration form.
   * @abstract
   * @protected
   */
  _prepareCategoryData() {
    return {categories: [], total: 0};
  }

  /* -------------------------------------------- */

  /**
   * Classify what Category an Action belongs to
   * @param {string} namespace                The entry to classify
   * @returns {{id: string, title: string}}   The category the entry belongs to
   * @protected
   */
  _categorizeEntry(namespace) {
    if ( namespace === "core" ) return {
      id: "core",
      title: game.i18n.localize("PACKAGECONFIG.Core")
    };
    else if ( namespace === game.system.id ) return {
      id: "system",
      title: game.system.title
    };
    else {
      const module = game.modules.get(namespace);
      if ( module ) return {
        id: module.id,
        title: module.title
      };
      return {
        id: "unmapped",
        title: game.i18n.localize("PACKAGECONFIG.Unmapped")
      };
    }
  }

  /* -------------------------------------------- */

  /**
   * Reusable logic for how categories are sorted in relation to each other.
   * @param {object} a
   * @param {object} b
   * @protected
   */
  _sortCategories(a, b) {
    const categories = this.constructor.categoryOrder;
    let ia = categories.indexOf(a.id);
    if ( ia === -1 ) ia = categories.length - 2; // Modules second from last
    let ib = this.constructor.categoryOrder.indexOf(b.id);
    if ( ib === -1 ) ib = categories.length - 2; // Modules second from last
    return (ia - ib) || a.title.localeCompare(b.title);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _render(force, {activeCategory, ...options}={}) {
    await loadTemplates([this.options.categoryTemplate]);
    await super._render(force, options);
    if ( activeCategory ) this._tabs[0].activate(activeCategory);
    const activeTab = this._tabs[0]?.active;
    if ( activeTab ) this.element[0].querySelector(`.tabs [data-tab="${activeTab}"]`)?.scrollIntoView();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  activateListeners(html) {
    super.activateListeners(html);
    if ( this.activeCategory === "all" ) {
      this._tabs[0]._content.querySelectorAll(".tab").forEach(tab => tab.classList.add("active"));
    }
    html.find("button.reset-all").click(this._onResetDefaults.bind(this));
    html.find("input[name=filter]").focus();
  }

  /* -------------------------------------------- */

  /** @override */
  _onChangeTab(event, tabs, active) {
    if ( active === "all" ) {
      tabs._content.querySelectorAll(".tab").forEach(tab => tab.classList.add("active"));
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _onSearchFilter(event, query, rgx, html) {
    const visibleCategories = new Set();

    // Hide entries
    for ( const entry of html.querySelectorAll(".form-group") ) {
      if ( !query ) {
        entry.classList.remove("hidden");
        continue;
      }
      const label = entry.querySelector("label")?.textContent;
      const notes = entry.querySelector(".notes")?.textContent;
      const match = (label && rgx.test(SearchFilter.cleanQuery(label)))
        || (notes && rgx.test(SearchFilter.cleanQuery(notes)));
      entry.classList.toggle("hidden", !match);
      if ( match ) visibleCategories.add(entry.parentElement.dataset.category);
    }

    // Hide categories which have no visible children
    for ( const category of html.querySelectorAll(".category") ) {
      category.classList.toggle("hidden", query && !visibleCategories.has(category.dataset.category));
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle button click to reset default settings
   * @param {Event} event   The initial button click event
   * @abstract
   * @protected
   */
  _onResetDefaults(event) {}
}
