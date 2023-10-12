/**
 * The Application responsible for configuring a single Tile document within a parent Scene.
 * @param {Tile} tile                    The Tile object being configured
 * @param {DocumentSheetOptions} [options]  Additional application rendering options
 */
class TileConfig extends DocumentSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "tile-config",
      title: game.i18n.localize("TILE.ConfigTitle"),
      template: "templates/scene/tile-config.html",
      width: 420,
      height: "auto",
      submitOnChange: true,
      tabs: [{navSelector: ".tabs", contentSelector: "form", initial: "basic"}]
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options={}) {

    // If the config was closed without saving, reset the initial display of the Tile
    if ( !options.force ) {
      this.document.reset();
      if ( this.document.object?.destroyed === false ) {
        this.document.object.refresh();
      }
    }

    // Remove the preview tile and close
    const layer = this.object.layer;
    layer.clearPreviewContainer();
    return super.close(options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const data = super.getData(options);
    data.submitText = game.i18n.localize(this.object.id ? "TILE.SubmitUpdate" : "TILE.SubmitCreate");
    data.occlusionModes = Object.entries(CONST.OCCLUSION_MODES).reduce((obj, e) => {
      obj[e[1]] = game.i18n.localize(`TILE.OcclusionMode${e[0].titleCase()}`);
      return obj;
    }, {});
    return data;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onChangeInput(event) {

    // Handle form element updates
    const el = event.target;
    if ( (el.type === "color") && el.dataset.edit ) this._onChangeColorPicker(event);
    else if ( el.type === "range" ) this._onChangeRange(event);

    // Update preview object
    const fdo = new FormDataExtended(this.form).object;

    // To allow a preview without glitches
    fdo.width = Math.abs(fdo.width);
    fdo.height = Math.abs(fdo.height);

    // Handle tint exception
    let tint = fdo["texture.tint"];
    if ( !foundry.data.validators.isColorString(tint) ) fdo["texture.tint"] = null;

    // Update preview object
    foundry.utils.mergeObject(this.document, foundry.utils.expandObject(fdo));
    this.document.object.refresh();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {
    if ( this.document.id ) return this.document.update(formData);
    else return this.document.constructor.create(formData, {
      parent: this.document.parent,
      pack: this.document.pack
    });
  }
}
