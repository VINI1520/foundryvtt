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
    options.classes.push("wall-config");
    options.template = "templates/scene/wall-config.html";
    options.width = 400;
    options.height = "auto";
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
    if ( options?.walls instanceof Array ) {
      this.editTargets = options.walls.map(w => w.id);
    }
    return super.render(force, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const context = super.getData(options);
    context.source = this.document.toObject();
    context.p0 = {x: this.object.c[0], y: this.object.c[1]};
    context.p1 = {x: this.object.c[2], y: this.object.c[3]};
    context.gridUnits = canvas.scene.grid.units || game.i18n.localize("GridUnits");
    context.moveTypes = Object.keys(CONST.WALL_MOVEMENT_TYPES).reduce((obj, key) => {
      let k = CONST.WALL_MOVEMENT_TYPES[key];
      obj[k] = game.i18n.localize(`WALLS.SenseTypes.${key}`);
      return obj;
    }, {});
    context.senseTypes = Object.keys(CONST.WALL_SENSE_TYPES).reduce((obj, key) => {
      let k = CONST.WALL_SENSE_TYPES[key];
      obj[k] = game.i18n.localize(`WALLS.SenseTypes.${key}`);
      return obj;
    }, {});
    context.dirTypes = Object.keys(CONST.WALL_DIRECTIONS).reduce((obj, key) => {
      let k = CONST.WALL_DIRECTIONS[key];
      obj[k] = game.i18n.localize(`WALLS.Directions.${key}`);
      return obj;
    }, {});
    context.doorTypes = Object.keys(CONST.WALL_DOOR_TYPES).reduce((obj, key) => {
      let k = CONST.WALL_DOOR_TYPES[key];
      obj[k] = game.i18n.localize(`WALLS.DoorTypes.${key}`);
      return obj;
    }, {});
    context.doorStates = Object.keys(CONST.WALL_DOOR_STATES).reduce((obj, key) => {
      let k = CONST.WALL_DOOR_STATES[key];
      obj[k] = game.i18n.localize(`WALLS.DoorStates.${key}`);
      return obj;
    }, {});
    context.doorSounds = CONFIG.Wall.doorSounds;
    context.isDoor = this.object.isDoor;
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  activateListeners(html) {
    html.find(".audio-preview").click(this.#onAudioPreview.bind(this));
    this.#enableDoorOptions(this.document.door > CONST.WALL_DOOR_TYPES.NONE);
    this.#toggleThresholdInputVisibility();
    return super.activateListeners(html);
  }

  /* -------------------------------------------- */

  #audioPreviewState = 0;

  /**
   * Handle previewing a sound file for a Wall setting
   * @param {Event} event   The initial button click event
   */
  #onAudioPreview(event) {
    const doorSoundName = this.form.doorSound.value;
    const doorSound = CONFIG.Wall.doorSounds[doorSoundName];
    if ( !doorSound ) return;
    const interactions = CONST.WALL_DOOR_INTERACTIONS;
    const interaction = interactions[this.#audioPreviewState++ % interactions.length];
    let sounds = doorSound[interaction];
    if ( !sounds ) return;
    if ( !Array.isArray(sounds) ) sounds = [sounds];
    const src = sounds[Math.floor(Math.random() * sounds.length)];
    const volume = game.settings.get("core", "globalInterfaceVolume");
    game.audio.play(src, {volume});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onChangeInput(event) {
    if ( event.currentTarget.name === "door" ) {
      this.#enableDoorOptions(Number(event.currentTarget.value) > CONST.WALL_DOOR_TYPES.NONE);
    }
    else if ( event.currentTarget.name === "doorSound" ) {
      this.#audioPreviewState = 0;
    }
    else if ( ["light", "sight", "sound"].includes(event.currentTarget.name) ) {
      this.#toggleThresholdInputVisibility();
    }
    return super._onChangeInput(event);
  }

  /* -------------------------------------------- */

  /**
   * Toggle the disabled attribute of the door state select.
   * @param {boolean} isDoor
   */
  #enableDoorOptions(isDoor) {
    const doorOptions = this.form.querySelector(".door-options");
    doorOptions.disabled = !isDoor;
    doorOptions.classList.toggle("hidden", !isDoor);
    this.setPosition({height: "auto"});
  }

  /* -------------------------------------------- */

  /**
   * Toggle visibility of proximity input fields.
   */
  #toggleThresholdInputVisibility() {
    const form = this.form;
    const showTypes = [CONST.WALL_SENSE_TYPES.PROXIMITY, CONST.WALL_SENSE_TYPES.DISTANCE];
    for ( const sense of ["light", "sight", "sound"] ) {
      const select = form[sense];
      const input = select.parentElement.querySelector(".proximity");
      input.classList.toggle("hidden", !showTypes.includes(Number(select.value)));
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getSubmitData(updateData={}) {
    const thresholdTypes = [CONST.WALL_SENSE_TYPES.PROXIMITY, CONST.WALL_SENSE_TYPES.DISTANCE];
    const formData = super._getSubmitData(updateData);
    for ( const sense of ["light", "sight", "sound"] ) {
      if ( !thresholdTypes.includes(formData[sense]) ) formData[`threshold.${sense}`] = null;
    }
    return formData;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {

    // Update multiple walls
    if ( this.editTargets.length > 1 ) {
      const updateData = canvas.scene.walls.reduce((arr, w) => {
        if ( this.editTargets.includes(w.id) ) {
          arr.push(foundry.utils.mergeObject(w.toJSON(), formData));
        }
        return arr;
      }, []);
      return canvas.scene.updateEmbeddedDocuments("Wall", updateData, {sound: false});
    }

    // Update single wall
    if ( !this.object.id ) return;
    return this.object.update(formData, {sound: false});
  }
}
