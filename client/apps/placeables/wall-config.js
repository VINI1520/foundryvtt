/**
 * The Application responsible for configuring a single Wall document within a parent Scene.
 * @param {Wall} object                       The Wall object for which settings are being configured
 * @param {FormApplicationOptions} [options]  Additional options which configure the rendering of the configuration
 *                                            sheet.
 */
class WallConfig extends DocumentSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.template = "templates/scene/wall-config.html";
    options.width = 400;
    return options;
  }

  /**
   * An array of Wall ids that should all be edited when changes to this config form are submitted
   * @type {string[]}
   */
  editTargets = [];

  /* -------------------------------------------- */

  /** @inheritdoc */
  get title() {
    if ( this.editTargets.length > 1 ) return game.i18n.localize("WALLS.TitleMany");
    return super.title;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  render(force, options) {
    if ( options.walls instanceof Array ) {
      this.editTargets = options.walls.map(w => w.id);
    }
    return super.render(force, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const data = super.getData(options);
    data.object = data.data;
    data.moveTypes = Object.keys(CONST.WALL_MOVEMENT_TYPES).reduce((obj, key) => {
      let k = CONST.WALL_MOVEMENT_TYPES[key];
      obj[k] = key.titleCase();
      return obj;
    }, {});
    data.senseTypes = Object.keys(CONST.WALL_SENSE_TYPES).reduce((obj, key) => {
      let k = CONST.WALL_SENSE_TYPES[key];
      obj[k] = key.titleCase();
      return obj;
    }, {});
    data.dirTypes = Object.keys(CONST.WALL_DIRECTIONS).reduce((obj, key) => {
      let k = CONST.WALL_DIRECTIONS[key];
      obj[k] = key.titleCase();
      return obj;
    }, {});
    data.doorTypes = Object.keys(CONST.WALL_DOOR_TYPES).reduce((obj, key) => {
      let k = CONST.WALL_DOOR_TYPES[key];
      obj[k] = key.titleCase();
      return obj;
    }, {});
    data.doorStates = Object.keys(CONST.WALL_DOOR_STATES).reduce((obj, key) => {
      let k = CONST.WALL_DOOR_STATES[key];
      obj[k] = key.titleCase();
      return obj;
    }, {});
    return data;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  activateListeners(html) {
    this.#enableDoorStateSelect(this.document.door > CONST.WALL_DOOR_TYPES.NONE);
    return super.activateListeners(html);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onChangeInput(event) {
    if ( event.currentTarget.name === "door" ) {
      this.#enableDoorStateSelect(Number(event.currentTarget.value) > CONST.WALL_DOOR_TYPES.NONE);
    }
    return super._onChangeInput(event);
  }

  /* -------------------------------------------- */

  /**
   * Toggle the disabled attribute of the door state select.
   * @param {boolean} isDoor
   */
  #enableDoorStateSelect(isDoor) {
    const ds = this.form.querySelector("select[name='ds']");
    ds.disabled = !isDoor;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {

    // Update multiple walls
    if ( this.editTargets.length ) {
      const updateData = canvas.scene.walls.reduce((arr, w) => {
        if ( this.editTargets.includes(w.id) ) {
          arr.push(foundry.utils.mergeObject(w.toJSON(), formData));
        }
        return arr;
      }, []);
      return canvas.scene.updateEmbeddedDocuments("Wall", updateData);
    }

    // Update single wall
    return super._updateObject(event, formData);
  }
}
