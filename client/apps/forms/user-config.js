/**
 * The Application responsible for configuring a single User document.
 * @extends {DocumentSheet}
 *
 * @param {User} user                       The User document being configured.
 * @param {DocumentSheetOptions} [options]  Additional rendering options which modify the behavior of the form.
 */
class UserConfig extends DocumentSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sheet", "user-config"],
      template: "templates/user/user-config.html",
      width: 400,
      height: "auto"
    })
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get title() {
    return `${game.i18n.localize("PLAYERS.ConfigTitle")}: ${this.object.name}`;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const controlled = game.users.reduce((arr, u) => {
      if ( u.character ) arr.push(u.character);
      return arr;
    }, []);
    const actors = game.actors.filter(a => a.testUserPermission(this.object, "OBSERVER") && !controlled.includes(a.id));
    return {
      user: this.object,
      actors: actors,
      options: this.options
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);

    // When a character is clicked, record it's ID in the hidden input
    let input = html.find('[name="character"]');
    html.find('.actor').click(ev => {

      // Record the selected actor
      let li = ev.currentTarget;
      let actorId = li.getAttribute("data-actor-id");
      input.val(actorId);

      // Add context to the selection
      for ( let a of html[0].getElementsByClassName("actor") ) {
        a.classList.remove("context");
      }
      li.classList.add("context");
    });

    // Release the currently selected character
    html.find('button[name="release"]').click(ev => {
      canvas.tokens?.releaseAll();
      this.object.update({character: null}).then(() => this.render(false));
    });

    // Support Image updates
    html.find('img[data-edit="avatar"]').click(ev => this._onEditAvatar(ev));
  }

  /* -------------------------------------------- */

  /**
   * Handle changing the user avatar image by opening a FilePicker
   * @private
   */
  _onEditAvatar(event) {
    event.preventDefault();
    const fp = new FilePicker({
      type: "image",
      current: this.object.avatar,
      callback: path => {
        event.currentTarget.src = path;
        return this._onSubmit(event, {preventClose: true});
      },
      top: this.position.top + 40,
      left: this.position.left + 10
    });
    return fp.browse();
  }
}
