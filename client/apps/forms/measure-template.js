/**
 * The Application responsible for configuring a single MeasuredTemplate document within a parent Scene.
 * @param {MeasuredTemplate} object         The {@link MeasuredTemplate} being configured.
 * @param {DocumentSheetOptions} [options]  Application configuration options.
 */
class MeasuredTemplateConfig extends DocumentSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "template-config",
      classes: ["sheet", "template-sheet"],
      title: "TEMPLATE.MeasuredConfig",
      template: "templates/scene/template-config.html",
      width: 400
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData() {
    return foundry.utils.mergeObject(super.getData(), {
      templateTypes: CONFIG.MeasuredTemplate.types,
      gridUnits: canvas.scene.grid.units || game.i18n.localize("GridUnits"),
      submitText: `TEMPLATE.Submit${this.options.preview ? "Create" : "Update"}`
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    if ( this.object.id ) {
      formData.id = this.object.id;
      return this.object.update(formData);
    }
    return this.object.constructor.create(formData);
  }
}
