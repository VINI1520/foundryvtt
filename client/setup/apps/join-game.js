/**
 * The Join Game setup application
 * @extends {FormApplication}
 */
class JoinGameForm extends FormApplication {
  constructor(object, options) {
    super(object, options);
    game.users.apps.push(this);
  }

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "join-game",
      template: "templates/setup/join-game.html",
      popOut: false,
      closeOnSubmit: false,
      scrollY: ["#world-description"]
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const data = {
      isAdmin: game.data.isAdmin,
      users: game.users,
      world: game.world,
      passwordString: game.data.passwordString,
      usersCurrent: game.users.filter(u => u.active).length,
      usersMax: game.users.contents.length
    };

    // Next session time
    const nextDate = new Date(game.world.nextSession || undefined);
    if ( nextDate.isValid() ) {
      data.nextDate = nextDate.toDateInputString();
      data.nextTime = nextDate.toTimeInputString();
      const fmt = new Intl.DateTimeFormat(undefined, {timeZoneName: "short"});
      const tz = fmt.formatToParts().find(p => p.type === "timeZoneName");
      data.nextTZ = tz ? ` (${tz.value})` : "";
    }
    return data;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    this.form.userid.addEventListener("focus", ev => this._setMode("join"));
    this.form.password.addEventListener("focus", ev => this._setMode("join"));
    this.form.adminPassword?.addEventListener("focus", ev => this._setMode("shutdown"));
    this.form.shutdown.addEventListener("click", this._onShutdown.bind(this));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, options) {
    if ( !this.form ) return super._render(force, options);
    // Preserve form state across re-renders.
    const data = this._getSubmitData();
    const focus = this.form.querySelector(":focus");
    await super._render(force, options);
    Object.entries(data).forEach(([k, v]) => this.form.elements[k].value = v);
    if ( focus?.name ) this.form.elements[focus.name].focus();
    if ( this.form.userid.selectedOptions[0]?.disabled ) this.form.userid.value = "";
  }

  /* -------------------------------------------- */

  /**
   * Toggle the submission mode of the form to alter what pressing the "ENTER" key will do
   * @param {string} mode
   * @private
   */
  _setMode(mode) {
    switch (mode) {
      case "join":
        this.form.shutdown.type = "button";
        this.form.join.type = "submit";
        break;
      case "shutdown":
        this.form.join.type = "button";
        this.form.shutdown.type = "submit";
        break;
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onSubmit(event, options) {
    event.preventDefault();
    const form = event.target;
    form.submit.disabled = true;
    const data = this._getSubmitData();
    data.action = "join";
    return this._post(data, form.submit);
  }

  /* -------------------------------------------- */

  /**
   * Handle requests to shut down the currently active world
   * @param {MouseEvent} event    The originating click event
   * @returns {Promise<void>}
   * @private
   */
  async _onShutdown(event) {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;
    const data = this._getSubmitData();
    data.action = "shutdown";
    return this._post(data, button);
  }

  /* -------------------------------------------- */

  /**
   * Submit join view POST requests to the server for handling.
   * @param {object} formData                         The processed form data
   * @param {EventTarget|HTMLButtonElement} button    The triggering button element
   * @returns {Promise<void>}
   * @private
   */
  async _post(formData, button) {
    const joinURL = foundry.utils.getRoute("join");
    button.disabled = true;

    // Look up some data
    const user = game.users.get(formData.userid)?.name || formData.userid;

    let response;
    try {
      response = await fetchJsonWithTimeout(joinURL, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(formData)
      });
    }
    catch(e) {
      if (e instanceof HttpError) {
        const error = game.i18n.format(e.displayMessage, {user});
        ui.notifications.error(error);
      }
      else {
        ui.notifications.error(e);
      }
      button.disabled = false;
      return;
    }

    // Redirect on success
    ui.notifications.info(game.i18n.format(response.message, {user}));
    setTimeout(() => window.location.href = response.redirect, 500 );
  }
}
