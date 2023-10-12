/**
 * An application for configuring the permissions which are available to each User role.
 */
class PermissionConfig extends FormApplication {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: game.i18n.localize("PERMISSION.Title"),
      id: "permissions-config",
      template: "templates/sidebar/apps/permission-config.html",
      width: 660,
      height: "auto",
      scrollY: [".permissions-list"],
      closeOnSubmit: true
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    const current = await game.settings.get("core", "permissions");
    return {
      roles: Object.keys(CONST.USER_ROLES).reduce((obj, r) => {
        if ( r === "NONE" ) return obj;
        obj[r] = `USER.Role${r.titleCase()}`;
        return obj;
      }, {}),
      permissions: this._getPermissions(current)
    };
  }

  /* -------------------------------------------- */

  /**
   * Prepare the permissions object used to render the configuration template
   * @param {object} current      The current permission configuration
   * @returns {object[]}          Permission data for sheet rendering
   * @private
   */
  _getPermissions(current) {
    const r = CONST.USER_ROLES;
    const rgm = r.GAMEMASTER;

    // Get permissions
    const perms = Object.entries(CONST.USER_PERMISSIONS).reduce((arr, e) => {
      const perm = foundry.utils.deepClone(e[1]);
      perm.id = e[0];
      perm.label = game.i18n.localize(perm.label);
      perm.hint = game.i18n.localize(perm.hint);
      arr.push(perm);
      return arr;
    }, []);
    perms.sort((a, b) => a.label.localeCompare(b.label));

    // Configure permission roles
    for ( let p of perms ) {
      const roles = current[p.id] || Array.fromRange(rgm + 1).slice(p.defaultRole);
      p.roles = Object.values(r).reduce((arr, role) => {
        if ( role === r.NONE ) return arr;
        arr.push({
          name: `${p.id}.${role}`,
          value: roles.includes(role),
          disabled: (role === rgm) && (!p.disableGM)
        });
        return arr;
      }, []);
    }
    return perms;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find("button[name='reset']").click(this._onResetDefaults.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle button click to reset default settings
   * @param {Event} event   The initial button click event
   * @private
   */
  async _onResetDefaults(event) {
    event.preventDefault();
    // Collect default permissions.
    const defaults = Object.entries(CONST.USER_PERMISSIONS).reduce((obj, [id, perm]) => {
      obj[id] = Array.fromRange(CONST.USER_ROLES.GAMEMASTER + 1).slice(perm.defaultRole);
      return obj;
    }, {});
    await game.settings.set("core", "permissions", defaults);
    ui.notifications.info("SETTINGS.PermissionReset", {localize: true});
    return this.render();
  }

  /* -------------------------------------------- */

  /** @override */
  async _onSubmit(event, options) {
    event.target.querySelectorAll("input[disabled]").forEach(i => i.disabled = false);
    return super._onSubmit(event, options);
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    const permissions = foundry.utils.expandObject(formData);
    for ( let [k, v] of Object.entries(permissions) ) {
      if ( !(k in CONST.USER_PERMISSIONS ) ) {
        delete permissions[k];
        continue;
      }
      permissions[k] = Object.entries(v).reduce((arr, r) => {
        if ( r[1] === true ) arr.push(parseInt(r[0]));
        return arr;
      }, []);
    }
    await game.settings.set("core", "permissions", permissions);
    ui.notifications.info("SETTINGS.PermissionUpdate", {localize: true});
  }
}
