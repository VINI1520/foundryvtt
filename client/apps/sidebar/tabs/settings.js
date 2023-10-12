/**
 * The sidebar tab which displays various game settings, help messages, and configuration options.
 * The Settings sidebar is the furthest-to-right using a triple-cogs icon.
 * @extends {SidebarTab}
 */
class Settings extends SidebarTab {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "settings",
      template: "templates/sidebar/settings.html",
      title: "Settings"
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    const context = await super.getData(options);

    // Check for core update
    let coreUpdate;
    if ( game.user.isGM && game.data.coreUpdate.hasUpdate ) {
      coreUpdate = game.i18n.format("SETUP.UpdateAvailable", {
        type: game.i18n.localize("Software"),
        channel: game.data.coreUpdate.channel,
        version: game.data.coreUpdate.version
      });
    }

    // Check for system update
    let systemUpdate;
    if ( game.user.isGM && game.data.systemUpdate.hasUpdate ) {
      systemUpdate = game.i18n.format("SETUP.UpdateAvailable", {
        type: game.i18n.localize("System"),
        channel: game.data.system.title,
        version: game.data.systemUpdate.version
      });
    }

    const issues = CONST.DOCUMENT_TYPES.reduce((count, documentName) => {
      const collection = CONFIG[documentName].collection.instance;
      return count + collection.invalidDocumentIds.size;
    }, 0) + Object.values(game.issues.packageCompatibilityIssues).reduce((count, {error}) => {
      return count + error.length;
    }, 0) + Object.keys(game.issues.usabilityIssues).length;

    // Return rendering context
    const isDemo = game.data.demoMode;
    return foundry.utils.mergeObject(context, {
      system: game.system,
      release: game.data.release,
      versionDisplay: game.release.display,
      canConfigure: game.user.can("SETTINGS_MODIFY") && !isDemo,
      canEditWorld: game.user.hasRole("GAMEMASTER") && !isDemo,
      canManagePlayers: game.user.isGM && !isDemo,
      canReturnSetup: game.user.hasRole("GAMEMASTER") && !isDemo,
      modules: game.modules.reduce((n, m) => n + (m.active ? 1 : 0), 0),
      issues,
      isDemo,
      coreUpdate,
      systemUpdate
    });
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    html.find("button[data-action]").click(this._onSettingsButton.bind(this));
    html.find(".notification-pip.update").click(this._onUpdateNotificationClick.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Delegate different actions for different settings buttons
   * @param {MouseEvent} event    The originating click event
   * @private
   */
  _onSettingsButton(event) {
    event.preventDefault();
    const button = event.currentTarget;
    switch (button.dataset.action) {
      case "configure":
        game.settings.sheet.render(true);
        break;
      case "modules":
        new ModuleManagement().render(true);
        break;
      case "world":
        new WorldConfig(game.world).render(true);
        break;
      case "players":
        return ui.menu.items.players.onClick();
      case "setup":
        return game.shutDown();
      case "support":
        new SupportDetails().render(true);
        break;
      case "controls":
        new KeybindingsConfig().render(true);
        break;
      case "tours":
        new ToursManagement().render(true);
        break;
      case "docs":
        new FrameViewer("https://foundryvtt.com/kb", {
          title: "SIDEBAR.Documentation"
        }).render(true);
        break;
      case "wiki":
        new FrameViewer("https://foundryvtt.wiki/", {
          title: "SIDEBAR.Wiki"
        }).render(true);
        break;
      case "invitations":
        new InvitationLinks().render(true);
        break;
      case "logout":
        return ui.menu.items.logout.onClick();
    }
  }

  /* -------------------------------------------- */

  /**
   * Executes with the update notification pip is clicked
   * @param {MouseEvent} event    The originating click event
   * @private
   */
  _onUpdateNotificationClick(event) {
    event.preventDefault();
    const key = event.target.dataset.action === "core-update" ? "CoreUpdateInstructions" : "SystemUpdateInstructions";
    ui.notifications.notify(game.i18n.localize(`SETUP.${key}`));
  }
}

/* -------------------------------------------- */

/**
 * A simple window application which shows the built documentation pages within an iframe
 * @type {Application}
 */
class FrameViewer extends Application {
  constructor(url, options) {
    super(options);
    this.url = url;
  }

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    const options = super.defaultOptions;
    const h = window.innerHeight * 0.9;
    const w = Math.min(window.innerWidth * 0.9, 1200);
    options.height = h;
    options.width = w;
    options.top = (window.innerHeight - h) / 2;
    options.left = (window.innerWidth - w) / 2;
    options.id = "documentation";
    options.template = "templates/apps/documentation.html";
    return options;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    return {
      src: this.url
    };
  }

  /* -------------------------------------------- */

  /** @override */
  async close(options) {
    this.element.find("#docs").remove();
    return super.close(options);
  }
}
