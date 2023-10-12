
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
  /*  Application Rendering                       */
  /* -------------------------------------------- */

  /**
   * Whether the players list is in a configuration where it is hidden.
   * @returns {boolean}
   */
  get isHidden() {
    if ( game.webrtc.mode === AVSettings.AV_MODES.DISABLED ) return false;
    const { client, verticalDock } = game.webrtc.settings;
    return verticalDock && client.hidePlayerList && !client.hideDock && !ui.webrtc.hidden;
  }

  /* -------------------------------------------- */

  /** @override */
  render(force, context={}) {
    this._positionInDOM();
    const { renderContext, renderData } = context;
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
      u.displayName = this._getDisplayName(u);
      return u;
    }).sort((a, b) => {
      if ( (b.role >= CONST.USER_ROLES.ASSISTANT) && (b.role > a.role) ) return 1;
      return a.name.localeCompare(b.name);
    });

    // Return the data for rendering
    return {
      users,
      hide: this.isHidden,
      showOffline: this._showOffline
    };
  }

  /* -------------------------------------------- */

  /**
   * Prepare a displayed name string for the User which includes their name, pronouns, character, or GM tag.
   * @returns {string}
   * @protected
   */
  _getDisplayName(user) {
    const displayNamePart = [user.name];
    if ( user.pronouns ) displayNamePart.push(`(${user.pronouns})`);
    if ( user.isGM ) displayNamePart.push(`[${game.i18n.localize("USER.GM")}]`);
    else if ( user.charname ) displayNamePart.push(`[${user.charname}]`);
    return displayNamePart.join(" ");
  }

  /* -------------------------------------------- */

  /**
   * Position this Application in the main DOM appropriately.
   * @protected
   */
  _positionInDOM() {
    document.body.classList.toggle("players-hidden", this.isHidden);
    if ( (game.webrtc.mode === AVSettings.AV_MODES.DISABLED) || this.isHidden || !this.element.length ) return;
    const element = this.element[0];
    const cameraViews = ui.webrtc.element[0];
    const uiTop = document.getElementById("ui-top");
    const uiLeft = document.getElementById("ui-left");
    const { client, verticalDock } = game.webrtc.settings;
    const inDock = verticalDock && !client.hideDock && !ui.webrtc.hidden;

    if ( inDock && !cameraViews?.contains(element) ) {
      cameraViews.appendChild(element);
      uiTop.classList.remove("offset");
    } else if ( !inDock && !uiLeft.contains(element) ) {
      uiLeft.appendChild(element);
      uiTop.classList.add("offset");
    }
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
        callback: li => {
          const user = game.users.get(li[0].dataset.userId);
          return this.#kickUser(user);
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
          return this.#banUser(user);
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
          return this.#unbanUser(user);
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
   * Toggle display of the Players hud setting for whether to display offline players
   * @param {Event} event   The originating click event
   * @private
   */
  _onToggleOfflinePlayers(event) {
    event.preventDefault();
    this._showOffline = !this._showOffline;
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Temporarily remove a User from the World by banning and then un-banning them.
   * @param {User} user     The User to kick
   * @returns {Promise<void>}
   */
  async #kickUser(user) {
    const role = user.role;
    await user.update({role: CONST.USER_ROLES.NONE});
    await user.update({role}, {diff: false});
    ui.notifications.info(`${user.name} has been <strong>kicked</strong> from the World.`);
  }

  /* -------------------------------------------- */

  /**
   * Ban a User by changing their role to "NONE".
   * @param {User} user     The User to ban
   * @returns {Promise<void>}
   */
  async #banUser(user) {
    if ( user.role === CONST.USER_ROLES.NONE ) return;
    await user.update({role: CONST.USER_ROLES.NONE});
    ui.notifications.info(`${user.name} has been <strong>banned</strong> from the World.`);
  }

  /* -------------------------------------------- */

  /**
   * Unban a User by changing their role to "PLAYER".
   * @param {User} user     The User to unban
   * @returns {Promise<void>}
   */
  async #unbanUser(user) {
    if ( user.role !== CONST.USER_ROLES.NONE ) return;
    await user.update({role: CONST.USER_ROLES.PLAYER});
    ui.notifications.info(`${user.name} has been <strong>unbanned</strong> from the World.`);
  }
}
