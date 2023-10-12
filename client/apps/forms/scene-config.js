/**
 * The Application responsible for configuring a single Scene document.
 * @extends {DocumentSheet}
 * @param {Scene} object                    The Scene Document which is being configured
 * @param {DocumentSheetOptions} [options]  Application configuration options.
 */
class SceneConfig extends DocumentSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "scene-config",
      classes: ["sheet", "scene-sheet"],
      template: "templates/scene/config.html",
      width: 560,
      height: "auto",
      tabs: [{navSelector: ".tabs", contentSelector: "form", initial: "basic"}]
    });
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return `${game.i18n.localize("SCENES.ConfigTitle")}: ${this.object.name}`;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options={}) {
    this._resetScenePreview();
    return super.close(options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  render(force, options={}) {
    if ( options.renderContext && (options.renderContext !== "updateScene" ) ) return this;
    return super.render(force, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const context = super.getData(options);

    // Selectable types
    context.gridTypes = this.constructor._getGridTypes();
    context.weatherTypes = this._getWeatherTypes();

    // Referenced documents
    context.playlists = this._getDocuments(game.playlists);
    context.sounds = this._getDocuments(this.object.playlist?.sounds ?? []);
    context.journals = this._getDocuments(game.journal);
    context.pages = this.object.journal?.pages.contents.sort((a, b) => a.sort - b.sort) ?? [];

    // Global illumination threshold
    context.hasGlobalThreshold = context.data.globalLightThreshold !== null;
    context.data.globalLightThreshold = context.data.globalLightThreshold ?? 0;
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Get an enumeration of the available grid types which can be applied to this Scene
   * @returns {object}
   * @internal
   */
  static _getGridTypes() {
    const labels = {
      GRIDLESS: "SCENES.GridGridless",
      SQUARE: "SCENES.GridSquare",
      HEXODDR: "SCENES.GridHexOddR",
      HEXEVENR: "SCENES.GridHexEvenR",
      HEXODDQ: "SCENES.GridHexOddQ",
      HEXEVENQ: "SCENES.GridHexEvenQ"
    };
    return Object.keys(CONST.GRID_TYPES).reduce((obj, t) => {
      obj[CONST.GRID_TYPES[t]] = labels[t];
      return obj;
    }, {});
  }

  /* -------------------------------------------- */

  /**
   * Get the available weather effect types which can be applied to this Scene
   * @returns {object}
   * @private
   */
  _getWeatherTypes() {
    const types = {};
    for ( let [k, v] of Object.entries(CONFIG.weatherEffects) ) {
      types[k] = game.i18n.localize(v.label);
    }
    return types;
  }

  /* -------------------------------------------- */

  /**
   * Get the alphabetized Documents which can be chosen as a configuration for the Scene
   * @param {WorldCollection} collection
   * @returns {object[]}
   * @private
   */
  _getDocuments(collection) {
    const documents = collection.map(doc => {
      return {id: doc.id, name: doc.name};
    });
    documents.sort((a, b) => a.name.localeCompare(b.name));
    return documents;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.find("button.capture-position").click(this._onCapturePosition.bind(this));
    html.find("button.grid-config").click(this._onGridConfig.bind(this));
    html.find("select[name='playlist']").change(this._onChangePlaylist.bind(this));
    html.find('select[name="journal"]').change(this._onChangeJournal.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Capture the current Scene position and zoom level as the initial view in the Scene config
   * @param {Event} event   The originating click event
   * @private
   */
  _onCapturePosition(event) {
    event.preventDefault();
    if ( !canvas.ready ) return;
    const btn = event.currentTarget;
    const form = btn.form;
    form["initial.x"].value = parseInt(canvas.stage.pivot.x);
    form["initial.y"].value = parseInt(canvas.stage.pivot.y);
    form["initial.scale"].value = canvas.stage.scale.x;
    ui.notifications.info("Captured canvas position as initial view in the Scene configuration form.");
  }

  /* -------------------------------------------- */

  /** @override */
  async _onChangeInput(event) {
    this._previewScene(event.target.name);
    return super._onChangeInput(event);
  }

  /* -------------------------------------------- */

  /** @override */
  _onChangeColorPicker(event) {
    super._onChangeColorPicker(event);
    this._previewScene(event.target.dataset.edit);
  }

  /* -------------------------------------------- */

  /** @override */
  _onChangeRange(event) {
    super._onChangeRange(event);
    this._previewScene(event.target.name);
  }

  /* -------------------------------------------- */

  /**
   * Live update the scene as certain properties are changed.
   * @param {string} changed  The changed property.
   * @private
   */
  _previewScene(changed) {
    if ( !this.object.isView || !canvas.ready ) return;
    if ( ["grid.color", "grid.alpha"].includes(changed) ) canvas.grid.grid.draw({
      color: this.form["grid.color"].value.replace("#", "0x"),
      alpha: Number(this.form["grid.alpha"].value)
    });
    if ( ["darkness", "backgroundColor", "fogExploredColor", "fogUnexploredColor"].includes(changed) ) {
      canvas.colorManager.initialize({
        backgroundColor: this.form.backgroundColor.value,
        darknessLevel: Number(this.form.darkness.value),
        fogExploredColor: this.form.fogExploredColor.value,
        fogUnexploredColor: this.form.fogUnexploredColor.value
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Reset the previewed darkness level, background color, grid alpha, and grid color back to their true values.
   * @private
   */
  _resetScenePreview() {
    if ( !this.object.isView || !canvas.ready ) return;
    const scene = canvas.scene;
    let gridChanged = (this.form["grid.color"].value !== scene.grid.color)
      || (this.form["grid.alpha"].value !== scene.grid.alpha);
    scene.reset();
    canvas.colorManager.initialize();
    if ( gridChanged ) canvas.grid.grid.draw();
  }

  /* -------------------------------------------- */

  /**
   * Handle updating the select menu of PlaylistSound options when the Playlist is changed
   * @param {Event} event   The initiating select change event
   * @private
   */
  _onChangePlaylist(event) {
    event.preventDefault();
    const playlist = game.playlists.get(event.target.value);
    const sounds = this._getDocuments(playlist?.sounds || []);
    const options = ['<option value=""></option>'].concat(sounds.map(s => {
      return `<option value="${s.id}">${s.name}</option>`;
    }));
    const select = this.form.querySelector("select[name=\"playlistSound\"]");
    select.innerHTML = options.join("");
  }

  /* -------------------------------------------- */

  /**
   * Handle updating the select menu of JournalEntryPage options when the JournalEntry is changed.
   * @param {Event} event  The initiating select change event.
   * @protected
   */
  _onChangeJournal(event) {
    event.preventDefault();
    const entry = game.journal.get(event.currentTarget.value);
    const pages = entry?.pages.contents.sort((a, b) => a.sort - b.sort) ?? [];
    const options = pages.map(page => {
      const selected = (entry.id === this.object.journal?.id) && (page.id === this.object.journalEntryPage);
      return `<option value="${page.id}"${selected ? " selected" : ""}>${page.name}</option>`;
    });
    this.form.elements.journalEntryPage.innerHTML = `<option></option>${options}`;
  }

  /* -------------------------------------------- */

  /**
   * Handle click events to open the grid configuration application
   * @param {Event} event   The originating click event
   * @private
   */
  async _onGridConfig(event) {
    event.preventDefault();
    if ( !this.object.isView ) await this.object.view();
    new GridConfig(this.object, this).render(true);
    return this.minimize();
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    const scene = this.document;

    // Toggle global illumination threshold
    if ( formData.hasGlobalThreshold === false ) formData.globalLightThreshold = null;
    delete formData.hasGlobalThreshold;
    // SceneData.texture.src is nullable in the schema, causing an empty string to be initialised to null. We need to
    // match that logic here to ensure that comparisons to the existing scene image are accurate.
    if ( formData["background.src"] === "" ) formData["background.src"] = null;
    if ( formData.foreground === "" ) formData.foreground = null;
    if ( formData.fogOverlay === "" ) formData.fogOverlay = null;

    // The same for fog colors
    if ( formData.fogUnexploredColor === "" ) formData.fogUnexploredColor = null;
    if ( formData.fogExploredColor === "" ) formData.fogExploredColor = null;

    // Determine what type of change has occurred
    const hasDefaultDims = (scene.background.src === null) && (scene.width === 4000) && (scene.height === 3000);
    const hasImage = formData["background.src"] || scene.background.src;
    const changedBackground =
      (formData["background.src"] !== undefined) && (formData["background.src"] !== scene.background.src);
    const clearedDims = (formData.width === null) || (formData.height === null);
    const needsThumb = changedBackground || !scene.thumb;
    const needsDims = formData["background.src"] && (clearedDims || hasDefaultDims);
    const createThumbnail = hasImage && (needsThumb || needsDims);

    // Update thumbnail and image dimensions
    if ( createThumbnail && game.settings.get("core", "noCanvas") ) {
      ui.notifications.warn("SCENES.GenerateThumbNoCanvas", {localize: true});
      formData.thumb = null;
    } else if ( createThumbnail ) {
      let td = {};
      try {
        td = await scene.createThumbnail({img: formData["background.src"] ?? scene.background.src});
      } catch(err) {
        Hooks.onError("SceneConfig#_updateObject", err, {
          msg: "Thumbnail generation for Scene failed",
          notify: "error",
          log: "error",
          scene: scene.id
        });
      }
      if ( needsThumb ) formData.thumb = td.thumb || null;
      if ( needsDims ) {
        formData.width = td.width;
        formData.height = td.height;
      }
    }

    // Warn the user if Scene dimensions are changing
    const delta = foundry.utils.diffObject(scene._source, foundry.utils.expandObject(formData));
    const changes = foundry.utils.flattenObject(delta);
    const textureChange = ["offsetX", "offsetY", "scaleX", "scaleY", "rotation"].map(k => `background.${k}`);
    if ( ["width", "height", "padding", "grid.size", ...textureChange].some(k => k in changes) ) {
      const confirm = await Dialog.confirm({
        title: game.i18n.localize("SCENES.DimensionChangeTitle"),
        content: `<p>${game.i18n.localize("SCENES.DimensionChangeWarning")}</p>`
      });
      if ( !confirm ) return;
    }

    // Perform the update
    return scene.update(formData);
  }
}
