/**
 * Render the Sidebar container, and after rendering insert Sidebar tabs.
 */
class Sidebar extends Application {

  /**
   * Singleton application instances for each sidebar tab
   * @type {Object<SidebarTab>}
   */
  tabs = {};

  /**
   * Track whether the sidebar container is currently collapsed
   * @type {boolean}
   */
  _collapsed = false;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "sidebar",
      template: "templates/sidebar/sidebar.html",
      popOut: false,
      width: 300,
      tabs: [{navSelector: ".tabs", contentSelector: "#sidebar", initial: "chat"}]
    });
  }

  /* -------------------------------------------- */

  /**
   * Return the name of the active Sidebar tab
   * @type {string}
   */
  get activeTab() {
    return this._tabs[0].active;
  }


  /* -------------------------------------------- */

  /**
   * Singleton application instances for each popout tab
   * @type {Object<SidebarTab>}
   */
  get popouts() {
    const popouts = {};
    for ( let [name, app] of Object.entries(this.tabs) ) {
      if ( app._popout ) popouts[name] = app._popout;
    }
    return popouts;
  }

  /* -------------------------------------------- */
  /*  Rendering
  /* -------------------------------------------- */

  /** @override */
  getData(options={}) {
    const isGM = game.user.isGM;

    // Configure tabs
    const tabs = {
      chat: {
        tooltip: ChatMessage.metadata.labelPlural,
        icon: CONFIG.ChatMessage.sidebarIcon,
        notification: "<i id=\"chat-notification\" class=\"notification-pip fas fa-exclamation-circle\"></i>"
      },
      combat: {
        tooltip: Combat.metadata.labelPlural,
        icon: CONFIG.Combat.sidebarIcon
      },
      scenes: {
        tooltip: Scene.metadata.labelPlural,
        icon: CONFIG.Scene.sidebarIcon
      },
      actors: {
        tooltip: Actor.metadata.labelPlural,
        icon: CONFIG.Actor.sidebarIcon
      },
      items: {
        tooltip: Item.metadata.labelPlural,
        icon: CONFIG.Item.sidebarIcon
      },
      journal: {
        tooltip: "SIDEBAR.TabJournal",
        icon: CONFIG.JournalEntry.sidebarIcon
      },
      tables: {
        tooltip: RollTable.metadata.labelPlural,
        icon: CONFIG.RollTable.sidebarIcon
      },
      cards: {
        tooltip: Cards.metadata.labelPlural,
        icon: CONFIG.Cards.sidebarIcon
      },
      playlists: {
        tooltip: Playlist.metadata.labelPlural,
        icon: CONFIG.Playlist.sidebarIcon
      },
      compendium: {
        tooltip: "SIDEBAR.TabCompendium",
        icon: "fas fa-atlas"
      },
      settings: {
        tooltip: "SIDEBAR.TabSettings",
        icon: "fas fa-cogs"
      }
    };
    if ( !isGM ) delete tabs.scenes;

    // Display core or system update notification?
    if ( isGM && (game.data.coreUpdate.hasUpdate || game.data.systemUpdate.hasUpdate) ) {
      tabs.settings.notification = `<i class="notification-pip fas fa-exclamation-circle"></i>`;
    }
    return {tabs};
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, options) {

    // Render the Sidebar container only once
    if ( !this.rendered ) await super._render(force, options);

    // Render sidebar Applications
    const renders = [];
    for ( let [name, app] of Object.entries(this.tabs) ) {
      renders.push(app._render(true).catch(err => {
        Hooks.onError("Sidebar#_render", err, {
          msg: `Failed to render Sidebar tab ${name}`,
          log: "error",
          name
        });
      }));
    }

    Promise.all(renders).then(() => this.activateTab(this.activeTab));
  }

  /* -------------------------------------------- */
  /*  Methods
  /* -------------------------------------------- */

  /**
   * Expand the Sidebar container from a collapsed state.
   * Take no action if the sidebar is already expanded.
   */
  expand() {
    if ( !this._collapsed ) return;
    const sidebar = this.element;
    const tab = sidebar.find(".sidebar-tab.active");
    const tabs = sidebar.find("#sidebar-tabs");
    const icon = tabs.find("a.collapse i");

    // Animate the sidebar expansion
    tab.hide();
    sidebar.animate({width: this.options.width, height: this.position.height}, 150, () => {
      sidebar.css({width: "", height: ""}); // Revert to default styling
      sidebar.removeClass("collapsed");
      tabs[0].dataset.tooltipDirection = TooltipManager.TOOLTIP_DIRECTIONS.DOWN;
      tab.fadeIn(250, () => {
        tab.css({
          display: "",
          height: ""
        });
      });
      icon.removeClass("fa-caret-left").addClass("fa-caret-right");
      this._collapsed = false;
      Hooks.callAll("collapseSidebar", this, this._collapsed);
    });
  }

  /* -------------------------------------------- */

  /**
   * Collapse the sidebar to a minimized state.
   * Take no action if the sidebar is already collapsed.
   */
  collapse() {
    if ( this._collapsed ) return;
    const sidebar = this.element;
    const tab = sidebar.find(".sidebar-tab.active");
    const tabs = sidebar.find("#sidebar-tabs");
    const icon = tabs.find("a.collapse i");

    // Animate the sidebar collapse
    tab.fadeOut(250, () => {
      sidebar.animate({width: 32, height: (32 + 4) * (Object.values(this.tabs).length + 1)}, 150, () => {
        sidebar.css("height", ""); // Revert to default styling
        sidebar.addClass("collapsed");
        tabs[0].dataset.tooltipDirection = TooltipManager.TOOLTIP_DIRECTIONS.LEFT;
        tab.css("display", "");
        icon.removeClass("fa-caret-right").addClass("fa-caret-left");
        this._collapsed = true;
        Hooks.callAll("collapseSidebar", this, this._collapsed);
      });
    });
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers
  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);

    // Right click pop-out
    const nav = this._tabs[0]._nav;
    nav.addEventListener("contextmenu", this._onRightClickTab.bind(this));

    // Toggle Collapse
    const collapse = nav.querySelector(".collapse");
    collapse.addEventListener("click", this._onToggleCollapse.bind(this));

    // Left click a tab
    const tabs = nav.querySelectorAll(".item");
    tabs.forEach(tab => tab.addEventListener("click", this._onLeftClickTab.bind(this)));
  }

  /* -------------------------------------------- */

  /** @override */
  _onChangeTab(event, tabs, active) {
    const app = ui[active];
    if ( (active === "chat") && app ) app.scrollBottom();
    Hooks.callAll("changeSidebarTab", app);
  }

  /* -------------------------------------------- */

  /**
   * Handle the special case of left-clicking a tab when the sidebar is collapsed.
   * @param {MouseEvent} event  The originating click event
   * @private
   */
  _onLeftClickTab(event) {
    const app = ui[event.currentTarget.dataset.tab];
    if ( app && this._collapsed ) app.renderPopout(app);
  }

  /* -------------------------------------------- */

  /**
   * Handle right-click events on tab controls to trigger pop-out containers for each tab
   * @param {Event} event     The originating contextmenu event
   * @private
   */
  _onRightClickTab(event) {
    const li = event.target.closest(".item");
    if ( !li ) return;
    event.preventDefault();
    const tabApp = ui[li.dataset.tab];
    tabApp.renderPopout(tabApp);
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling of the Sidebar container's collapsed or expanded state
   * @param {Event} event
   * @private
   */
  _onToggleCollapse(event) {
    event.preventDefault();
    if ( this._collapsed ) this.expand();
    else this.collapse();
  }
}
