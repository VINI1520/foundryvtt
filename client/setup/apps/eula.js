/**
 * The End User License Agreement
 * Display the license agreement and prompt the user to agree before moving forwards
 * @type {Application}
 */
class EULA extends Application {
  /** @inheritdoc */
	static get defaultOptions() {
	  const options = super.defaultOptions;
	  options.id = "eula";
	  options.template = "templates/setup/eula.html";
	  options.title = "End User License Agreement";
	  options.width = 720;
	  options.popOut = true;
	  return options;
  }

  /* -------------------------------------------- */

  /**
   * A reference to the setup URL used under the current route prefix, if any
   * @return {string}
   */
  get licenseURL() {
    return getRoute("license");
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
      let html = await fetchWithTimeout("license.html").then(r => r.text());
	  return {
        html: html
	  }
  }

  /* -------------------------------------------- */

  /** @override */
	async _renderOuter() {
	  const id = this.id;
	  const classes = Array.from(this.options.classes).join(" ");

	  // Override the normal window app wrapper so it cannot be closed or minimized
	  const parsed = $.parseHTML(`<div id="${id}" class="app window-app ${classes}" data-appid="${this.appId}">
      <header class="window-header flexrow">
          <h4 class="window-title">${this.title}</h4>
      </header>
      <section class="window-content"></section>
    </div>`);
	  const html = $(parsed[0]);

    // Make the outer window draggable
    const header = html.find('header')[0];
    new Draggable(this, html, header, this.options.resizable);

    // Set the outer frame z-index
    if ( Object.keys(ui.windows).length === 0 ) _maxZ = 100;
    html.css({zIndex: Math.min(++_maxZ, 9999)});
    return html;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    const form = html[0].children[1];
    html.find("#decline").click(this._onDecline.bind(this));
    form.onsubmit = this._onSubmit.bind(this);
  }

  /* -------------------------------------------- */

  /**
   * Handle refusal of the EULA by checking the decline button
   * @param {MouseEvent} event    The originating click event
   */
  _onDecline(event) {
    const button = event.currentTarget;
    ui.notifications.error(`You have declined the End User License Agreement and cannot use the software.`);
    button.form.dataset.clicked = "decline";
  }

  /* -------------------------------------------- */

  /**
   * Validate form submission before sending it onwards to the server
   * @param {Event} event       The originating form submission event
   */
  _onSubmit(event) {
    const form = event.target;
    if ( form.dataset.clicked === "decline" ) {
      return setTimeout(() => window.location.href = CONST.WEBSITE_URL, 1000);
    }
    if ( !form.agree.checked ) {
      event.preventDefault();
      ui.notifications.error(`You must agree to the ${this.options.title} before proceeding.`);
    }
  }
}
