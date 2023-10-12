/**
 * A special class of Dialog which allows for the installation of Packages.
 */
class InstallPackage extends Application {
  constructor(data, options) {
    super(options);
    this.data = data;

    /**
     * The instance of the setup form to which this is linked
     * @type {SetupConfigurationForm}
     */
    this.setup = data.setup;

    /**
     * The category being filtered for
     * @type {string}
     */
    this._category = "all";

    /**
     * The visibility being filtered for
     * @type {string}
     */
    this._visibility = "all";

    /**
     * The list of installable packages
     * @type {ClientPackage[]}
     */
    this.packages = undefined;

    /**
     * The list of Tags available
     * @type {Array<object>}
     */
    this.tags = undefined;

    /**
     * Have we initialized the filter to a special value?
     * @type {boolean}
     * @private
     */
    this._initializedFilter = !this.data.filterValue;
  }

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "install-package",
      template: "templates/setup/install-package.html",
      classes: ["dialog"],
      width: 720,
      height: 620,
      scrollY: [".categories", ".package-list"],
      filters: [{inputSelector: 'input[name="filter"]', contentSelector: ".package-list"}]
    });
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.localize(`SETUP.Install${this.data.packageType.titleCase()}`);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  render(...args) {
    // Lazily load packages
    const type = this.data.packageType;
    if ( Setup.cache[type].state === Setup.CACHE_STATES.COLD ) {
      Setup.warmPackages({type}).then(() => this.render(false));
    }
    return super.render(...args);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async getData(options={}) {
    const data = super.getData(options);
    const type = data.packageType = this.data.packageType;
    if ( !this.packages?.length || !this.tags?.length ) {
      const {packages, tags} = await InstallPackage.getTaggedPackages(type);
      this.packages = packages;
      this.tags = tags;
    }
    data.loading = Setup.cache[type].state < Setup.CACHE_STATES.WARMED;
    data.couldntLoad = !this.packages.length && Setup.cache[type].state === Setup.CACHE_STATES.WARMED;

    // Category filters
    data.tags = Object.entries(this.tags).reduce((tags, t) => {
      let [k, v] = t;
      v.active = this._category === t[0];
      v.css = t[1].active ? " active" : "";
      tags[k] = v;
      return tags;
    }, {});

    // Visibility filters
    data.visibility = [
      { id: "inst", css: this._visibility === "inst" ? " active" : "", label: "SETUP.PackageVisInst" },
      { id: "unin", css: this._visibility === "unin" ? " active" : "", label: "SETUP.PackageVisUnin" },
      { id: "all", css: this._visibility === "all" ? " active" : "", label: "SETUP.PackageVisAll" }
    ];

    // Filter packages
    const installed = new Set(game.data[`${type}s`].map(s => s.id));
    data.packages = this.packages.filter(p => {
      p.installed = installed.has(p.id);
      if ( (this._visibility === "unin") && p.installed ) return false;
      if ( (this._visibility === "inst") && !p.installed ) return false;
      p.cssClass = [p.installed ? "installed" : null, p.installable ? null: "locked"].filterJoin(" ");
      if ( this._category === "all" ) return true;
      if ( this._category === "premium" ) return p.protected;
      if ( this._category === "exclusive" ) return p.exclusive;
      return p.tags.includes(this._category);
    });
    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html[0].children[0].onsubmit = ev => ev.preventDefault();
    html.find(".package-title a").click(this._onClickPackageTitle.bind(this));
    html.find("button.install").click(this._onClickPackageInstall.bind(this));
    html.find(".category .filter").click(this._onClickCategoryFilter.bind(this));
    html.find(".visibilities .visibility").click(this._onClickVisibilityFilter.bind(this));
    html.find("input[name=filter]").focus();

    const loading = Setup.cache[this.data.packageType].state < Setup.CACHE_STATES.WARMED;
    if ( !this._initializedFilter && !loading ) {
      html.find('input[name="filter"]').val(this.data.filterValue);
      this._searchFilters[0].filter(null, this.data.filterValue);
      this._initializedFilter = true;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle left-click events to filter to a certain module category
   * @param {MouseEvent} event
   * @private
   */
  _onClickCategoryFilter(event) {
    event.preventDefault();
    this._category = event.target.dataset.category || "all";
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle left-click events to filter to a certain visibility state
   * @param {MouseEvent} event
   * @private
   */
  _onClickVisibilityFilter(event) {
    event.preventDefault();
    this._visibility = event.target.dataset.visibility || "all";
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle a left-click event on the package title
   * @param {MouseEvent} event
   * @private
   */
  _onClickPackageTitle(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".package");
    if ( li.classList.contains("installed") ) return;
    if ( li.classList.contains("locked") ) {
      const href = `https://foundryvtt.com/packages/${li.dataset.packageId}/`;
      return window.open(href, "_blank");
    }
    const form = li.closest("form");
    form.manifestURL.value = li.querySelector("button.install").dataset.manifest;
  }

  /* -------------------------------------------- */

  /**
   * Handle a left-click event on the package "Install" button
   * @param {MouseEvent} event
   * @private
   */
  async _onClickPackageInstall(event) {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;
    const type = this.data.packageType;
    let manifest = button.dataset.manifest;

    // Install from manifest field
    if (button.dataset.action === "install-url") {
      manifest = button.form.manifestURL.value.trim();
    }

    // Install from package listing
    else {
      const li = button.closest(".package");
      if ( li.classList.contains("locked") ) {
        const href = `https://foundryvtt.com/packages/${li.dataset.packageId}/`;
        return window.open(href, "_blank");
      }
    }

    // Execute the installation
    await Setup.installPackage({type, manifest}, data => {
      this.setup.updateProgressBar(data);
      this.setup.updateProgressButton(data);
    });
    button.disabled = false;
  }

  /* -------------------------------------------- */

  /** @override */
  _onSearchFilter(event, query, rgx, html) {
    for ( let li of html.children ) {
      if ( !query ) {
        li.classList.remove("hidden");
        continue;
      }
      const id = li.dataset.packageId;
      const title = li.querySelector(".package-title a")?.textContent;
      const author = li.querySelector(".tag.author").textContent;
      const match = rgx.test(SearchFilter.cleanQuery(id))
        || rgx.test(SearchFilter.cleanQuery(title))
        || rgx.test(SearchFilter.cleanQuery(author));
      li.classList.toggle("hidden", !match);
    }
  }

  /* -------------------------------------------- */

  /**
   * Organize package data and cache it to the application
   * @param {string} type   The type of packages being retrieved
   * @returns {object[]}     The retrieved or cached packages
   */
  static async getTaggedPackages(type) {

    // Identify package tags and counts
    const packages = [];
    const counts = {premium: 0, exclusive: 0};
    const unordered_tags = {};
    const codes = CONST.PACKAGE_AVAILABILITY_CODES;

    // Prepare package data
    for ( let pack of Setup.cache[type].packages.values() ) {
      const p = pack.toObject();
      const availability = pack.availability;

      // Skip packages which require downgrading or upgrading to an unstable version
      if ( [codes.REQUIRES_CORE_DOWNGRADE, codes.REQUIRES_CORE_UPGRADE_UNSTABLE].includes(availability) ) continue;

      // Create the array of package tags
      const tags = pack.tags.map(t => {
        const [k, v] = t;
        if ( !unordered_tags[k] ) unordered_tags[k] = {label: v, count: 0, [type]: true};
        unordered_tags[k].count++;
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
    const sorted_tags = Array.from(Object.keys(unordered_tags));
    sorted_tags.sort();
    const tags = sorted_tags.reduce((obj, k) => {
      obj[k] = unordered_tags[k];
      return obj;
    }, {
      all: { label: "All Packages", count: packages.length, [type]: true},
      premium: { label: "Premium Content", count: counts.premium, [type]: true},
      exclusive: { label: "Exclusive Content", count: counts.exclusive, [type]: true }
    });
    return { packages: packages, tags: tags };
  }
}
