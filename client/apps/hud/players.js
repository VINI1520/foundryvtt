
/**
 * The UI element which displays the list of Users who are currently playing within the active World.
 * @extends {Application}
 */
class PlayerList extends Application {
  constructor(options) {
    super(options);
    game.users.apps.push(this);

    /**
     * An internal toggle for whether to show offline players or hide them
     * @type {boolean}
     * @private
     */
    this._showOffline = false;
  }

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "players",
      template: "templates/user/players.html",
      popOut: false
    });
  }

  /* -------------------------------------------- */
  /*  Application Rendering
  /* -------------------------------------------- */

  /** @override */
  render(force, context={}) {
    let { renderContext, renderData} = context;
    if ( renderContext ) {
      const events = ["createUser", "updateUser", "deleteUser"];
      if ( !events.includes(renderContext) ) return this;
      const updateKeys = ["name", "ownership", "ownership.default", "active", "navigation"];
      if ( renderContext === "updateUser" && !updateKeys.some(k => renderData.hasOwnProperty(k)) ) return this;
    }
    return super.render(force, context);
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options={}) {

    // Process user data by adding extra characteristics
    const users = game.users.filter(u => this._showOffline || u.active).map(user => {
      const u = user.toObject(false);
      u.active = user.active;
      u.isGM = user.isGM;
      u.isSelf = user.isSelf;
      u.charname = user.character?.name.split(" ")[0] || "";
      u.color = u.active ? u.color : "#333333";
      u.border = u.active ? user.border : "#000000";
      return u;
    }).sort((a, b) => {
      if ( (b.role >= CONST.USER_ROLES.ASSISTANT) && (b.role > a.role) ) return 1;
      return a.name.localeCompare(b.name);
    });

    // Determine whether to hide the players list when using AV conferencing
    let hide = false;
    if ( game.webrtc && (game.webrtc.settings.world.mode >= AVSettings.AV_MODES.VIDEO) ) {
      hide = game.webrtc.settings.client.hidePlayerList;
    }

    // Return the data for rendering
    return {
      users, hide,
      showOffline: this._showOffline
    };
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {

    // Toggle online/offline
    html.find("h3").click(this._onToggleOfflinePlayers.bind(this));

    // Context menu
    const contextOptions = this._getUserContextOptions();
    /**
     * A hook event that fires when the context menu for a PlayersList
     * entry is constructed.
     * @function getUserContextOptions
     * @memberof hookEvents
     * @param {jQuery} html                     The HTML element to which the context options are attached
     * @param {ContextMenuEntry[]} entryOptions The context menu entries
     */
    Hooks.call("getUserContextOptions", html, contextOptions);
    new ContextMenu(html, ".player", contextOptions);
  }

  /* -------------------------------------------- */

  /**
   * Return the default context options available for the Players application
   * @returns {object[]}
   * @private
   */
  _getUserContextOptions() {
    return [
      {
        name: game.i18n.localize("PLAYERS.ConfigTitle"),
        icon: '<i class="fas fa-male"></i>',
        condition: li => game.user.isGM || (li[0].dataset.userId === game.user.id),
        callback: li => {
          const user = game.users.get(li[0].dataset.userId);
          user?.sheet.render(true);
        }
      },
      {
        name: game.i18n.localize("PLAYERS.ViewAvatar"),
        icon: '<i class="fas fa-image"></i>',
        condition: li => {
          const user = game.users.get(li[0].dataset.userId);
          return user.avatar !== CONST.DEFAULT_TOKEN;
        },
        callback: li => {
          let user = game.users.get(li.data("user-id"));
          new ImagePopout(user.avatar, {
            title: user.name,
            uuid: user.uuid
          }).render(true);
        }
      },
      {
        name: game.i18n.localize("PLAYERS.PullToScene"),
        icon: '<i class="fas fa-directions"></i>',
        condition: li => game.user.isGM && (li[0].dataset.userId !== game.user.id),
        callback: li => game.socket.emit("pullToScene", canvas.scene.id, li.data("user-id"))
      },
      {
        name: game.i18n.localize("PLAYERS.Kick"),
        icon: '<i class="fas fa-door-open"></i>',
        condition: li => {
          const user = game.users.get(li[0].dataset.userId);
          return game.user.isGM && user.active && !user.isSelf;
        },
        callback: async li => {
          const user = game.users.get(li[0].dataset.userId);
          const role = user.role;
          await user.update({role: CONST.USER_ROLES.NONE});
          await user.update({role}, {diff: false});
          ui.notifications.info(`${user.name} has been kicked from the world.`);
        }
      },
      {
        name: game.i18n.localize("PLAYERS.Ban"),
        icon: '<i class="fas fa-ban"></i>',
        condition: li => {
          const user = game.users.get(li[0].dataset.userId);
          return game.user.isGM && !user.isSelf && (user.role !== CONST.USER_ROLES.NONE);
        },
        callback: li => {
          const user = game.users.get(li[0].dataset.userId);
          user.update({role: CONST.USER_ROLES.NONE});
          ui.notifications.info(`${user.name} has been <strong>banned</strong> from the world.`);
        }
      },
      {
        name: game.i18n.localize("PLAYERS.UnBan"),
        icon: '<i class="fas fa-ban"></i>',
        condition: li => {
          const user = game.users.get(li[0].dataset.userId);
          return game.user.isGM && !user.isSelf && (user.role === CONST.USER_ROLES.NONE);
        },
        callback: li => {
          const user = game.users.get(li[0].dataset.userId);
          user.update({role: CONST.USER_ROLES.PLAYER});
          ui.notifications.info(`${user.name} has been restored to a Player role in the World.`);
        }
      },
      {
        name: game.i18n.localize("WEBRTC.TooltipShowUser"),
        icon: '<i class="fas fa-eye"></i>',
        condition: li => {
          const userId = li.data("userId");
          return game.webrtc.settings.client.users[userId]?.blocked;
        },
        callback: async li => {
          const userId = li.data("userId");
          await game.webrtc.settings.set("client", `users.${userId}.blocked`, false);
          ui.webrtc.render();
        }
      }
    ];
  }

  /* -------------------------------------------- */

  /**
   * Toggle display of the Players hud setting for whether or not to display offline players
   * @param {Event} event   The originating click event
   * @private
   */
  _onToggleOfflinePlayers(event) {
    event.preventDefault();
    this._showOffline = !this._showOffline;
    this.render();
  }
}
