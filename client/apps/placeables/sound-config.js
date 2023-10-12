/**
 * The Application responsible for configuring a single AmbientSound document within a parent Scene.
 * @extends {DocumentSheet}
 *
 * @param {AmbientSound} sound              The sound object being configured
 * @param {DocumentSheetOptions} [options]  Additional application rendering options
 */
class AmbientSoundConfig extends DocumentSheet {

  /** @inheritdoc */
	static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "SOUND.ConfigTitle",
      template: "templates/scene/sound-config.html",
      width: 480
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get title() {
    if ( this.object.id ) return super.title;
    else return game.i18n.localize("SOUND.Create");
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const data = super.getData(options);
    data.submitText = game.i18n.localize(this.object.id ? "SOUND.Update" : "SOUND.Create");
    data.gridUnits = canvas.scene.grid.units;
    return data;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {
    if ( this.object.id ) return this.object.update(formData);
    return this.object.constructor.create(formData, {parent: canvas.scene});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options) {
    if ( !this.object.id ) canvas.sounds.clearPreviewContainer();
    await super.close(options);
  }
}
