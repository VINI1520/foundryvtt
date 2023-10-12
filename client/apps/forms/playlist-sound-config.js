/**
 * The Application responsible for configuring a single PlaylistSound document within a parent Playlist.
 * @extends {DocumentSheet}
 *
 * @param {PlaylistSound} sound             The PlaylistSound document being configured
 * @param {DocumentSheetOptions} [options]  Additional application rendering options
 */
class PlaylistSoundConfig extends DocumentSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "track-config",
      template: "templates/playlist/sound-config.html",
      width: 360
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get title() {
    if ( !this.object.id ) return `${game.i18n.localize("PLAYLIST.SoundCreate")}: ${this.object.parent.name}`;
    return `${game.i18n.localize("PLAYLIST.SoundEdit")}: ${this.object.name}`;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const context = super.getData(options);
    if ( !this.document.id ) context.data.name = "";
    context.lvolume = AudioHelper.volumeToInput(this.document.volume);
    return context;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers
  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.find('input[name="path"]').change(this._onSourceChange.bind(this));
    return html;
  }

  /* -------------------------------------------- */

  /**
   * Auto-populate the track name using the provided filename, if a name is not already set
   * @param {Event} event
   * @private
   */
  _onSourceChange(event) {
    event.preventDefault();
    const field = event.target;
    const form = field.form;
    if ( !form.name.value ) {
      form.name.value = AudioHelper.getDefaultSoundName(field.value);
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {
    formData["volume"] = AudioHelper.inputToVolume(formData["lvolume"]);
    if (this.object.id)  return this.object.update(formData);
    return this.object.constructor.create(formData, {parent: this.object.parent});
  }
}
