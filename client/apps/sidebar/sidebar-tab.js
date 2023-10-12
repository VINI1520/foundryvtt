/**
 * An abstract pattern followed by the different tabs of the sidebar
 * @abstract
 * @interface
 */
class SidebarTab extends Application {
  constructor(...args) {
    super(...args);

    /**
     * A reference to the pop-out variant of this SidebarTab, if one exists
     * @type {SidebarTab}
     * @protected
     */
    this._popout = null;

    /**
     * Denote whether this is the original version of the sidebar tab, or a pop-out variant
     * @type {SidebarTab}
     */
    this._original = null;

    // Adjust options
    if ( this.options.popOut ) this.options.classes.push("sidebar-popout");
    this.options.classes.push(`${this.tabName}-sidebar`);

    // Register the tab as the sidebar singleton
    if ( !this.popOut && ui.sidebar ) ui.sidebar.tabs[this.tabName] = this;
  }

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: null,
      popOut: false,
      width: 300,
      height: "auto",
      classes: ["tab", "sidebar-tab"],
      baseApplication: "SidebarTab"
    });
  }

  /* -------------------------------------------- */

  /** @override */
  get id() {
    return `${this.options.id}${this._original ? "-popout" : ""}`;
  }

  /* -------------------------------------------- */

  /**
   * The base name of this sidebar tab
   * @type {string}
   */
  get tabName() {
    return this.constructor.defaultOptions.id ?? this.id;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    return {
      cssId: this.id,
      cssClass: this.options.classes.join(" "),
      tabName: this.tabName,
      user: game.user
    };
  }

  /* -------------------------------------------- */

  /** @override */
  async _render(force=false, options={}) {
    await super._render(force, options);
    if ( this._popout ) await this._popout._render(force, options);
  }

  /* -------------------------------------------- */

  /** @override */
  async _renderInner(data) {
    let html = await super._renderInner(data);
    if ( ui.sidebar?.activeTab === this.id ) html.addClass("active");
    if ( this.popOut ) html.removeClass("tab");
    return html;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Activate this SidebarTab, switching focus to it
   */
  activate() {
    ui.sidebar.activateTab(this.tabName);
  }

  /* -------------------------------------------- */

  /** @override */
  async close(options) {
    if ( this.popOut ) {
      const base = this._original;
      if ( base ) base._popout = null;
      return super.close(options);
    }
  }

  /* -------------------------------------------- */

  /**
   * Create a second instance of this SidebarTab class which represents a singleton popped-out container
   * @returns {SidebarTab}   The popped out sidebar tab instance
   */
  createPopout() {
    if ( this._popout ) return this._popout;
    const pop = new this.constructor({popOut: true});
    this._popout = pop;
    pop._original = this;
    return pop;
  }

  /* -------------------------------------------- */

  /**
   * Render the SidebarTab as a pop-out container
   */
  renderPopout() {
    const pop = this.createPopout();
    pop.render(true);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /**
   * Handle lazy loading for sidebar images to only load them once they become observed
   * @param {HTMLElement[]} entries               The entries which are now observed
   * @param {IntersectionObserver} observer       The intersection observer instance
   */
  _onLazyLoadImage(entries, observer) {
    for ( let e of entries ) {
      if ( !e.isIntersecting ) continue;
      const li = e.target;

      // Background Image
      if ( li.dataset.backgroundImage ) {
        li.style["background-image"] = `url("${li.dataset.backgroundImage}")`;
        delete li.dataset.backgroundImage;
      }

      // Avatar image
      const img = li.querySelector("img");
      if ( img && img.dataset.src ) {
        img.src = img.dataset.src;
        delete img.dataset.src;
      }

      // No longer observe the target
      observer.unobserve(e.target);
    }
  }
}
