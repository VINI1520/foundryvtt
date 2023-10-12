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
      classes: ["dark"],
      template: "templates/setup/user-management.html",
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
  static USER_TEMPLATE = "templates/setup/player-create.html";

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
      roles: UserManagement._getRoleLabels(),
      options: this.options,
      userTemplate: this.constructor.USER_TEMPLATE,
      passwordString: game.data.passwordString
    };
  }

  /* -------------------------------------------- */

  /**
   * Get a mapping of role IDs to labels that should be displayed
   * @private
   */
  static _getRoleLabels() {
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
    html.find("button[data-action]").click(UserManagement._onAction);
    html.find("input.password").keydown(UserManagement._onPasswordKeydown);
    html.find("label.show").click(UserManagement._onShowPassword);
    html.on("click", ".user-delete", UserManagement._onUserDelete);
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
   * Handle new user creation event
   * @param {PointerEvent} event      The originating click event
   * @private
   */
  static async _onAction(event) {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;
    switch ( button.dataset.action ) {
      case "create-user":
        await UserManagement._onUserCreate();
        break;
      case "configure-permissions":
        new PermissionConfig().render(true);
        break;
    }
    button.disabled = false;
  }

  /* -------------------------------------------- */

  /**
   * When the user enters some characters into a password field, present them with the "show" label that allows them
   * to see the text they have entered.
   * @param {KeyboardEvent} event     The initiating keydown event
   * @private
   */
  static _onPasswordKeydown(event) {
    if ( ["Shift", "Ctrl", "Alt", "Tab"].includes(event.key) ) return;
    const input = event.currentTarget;
    const show = input.nextElementSibling;
    show.classList.add("visible");
  }

  /* -------------------------------------------- */

  /**
   * Reveal the password that is being configured so the user can verify they have typed it correctly.
   * @param {PointerEvent} event        The initiating mouse click event
   * @private
   */
  static _onShowPassword(event) {
    const label = event.currentTarget;
    const group = label.closest(".form-group");
    const input = group.firstElementChild;
    input.type = input.type === "password" ? "text" : "password";
    label.classList.remove("active");
    if ( input.type === "text" ) label.classList.add("active");
  }

  /* -------------------------------------------- */

  /**
   * Handle creating a new User record in the form
   * @private
   */
  static async _onUserCreate() {

    // Create the new User
    let newPlayerIndex = game.users.size + 1;
    while ( game.users.getName(`Player${newPlayerIndex}` )) { newPlayerIndex++; }
    const user = await User.create({
      name: `Player${newPlayerIndex}`,
      role: CONST.USER_ROLES.PLAYER
    });

    // Render the User's HTML
    const html = await renderTemplate(UserManagement.USER_TEMPLATE, {
      user: user.data,
      roles: this._getRoleLabels()
    });

    // Append the player to the list and restore the button
    $("#player-list").append(html);
  }

  /* -------------------------------------------- */

  /**
   * Handle user deletion event
   * @param {PointerEvent} event      The originating click event
   * @private
   */
  static _onUserDelete(event) {
    event.preventDefault();
    let button = $(event.currentTarget);
    const li = button.parents(".player");
    const user = game.users.get(li.attr("data-user-id"));

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
          callback: () => {
            user.delete();
            li.slideUp(200, () => li.remove());
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
