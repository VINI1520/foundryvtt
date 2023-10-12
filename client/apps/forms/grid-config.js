/**
 * A tool for fine-tuning the grid in a Scene
 * @param {Scene} scene                       The scene whose grid is being configured.
 * @param {SceneConfig} sheet                 The Scene Configuration sheet that spawned this dialog.
 * @param {FormApplicationOptions} [options]  Application configuration options.
 */
class GridConfig extends FormApplication {
  constructor(scene, sheet, ...args) {
    super(scene, ...args);

    /**
     * Track the Scene Configuration sheet reference
     * @type {SceneConfig}
     */
    this.sheet = sheet;
  }

  /**
   * The counter-factual dimensions being evaluated
   * @type {Object}
   */
  #dimensions = {};

  /**
   * A copy of the Scene source which can be restored when the configuration is closed.
   * @type {object}
   */
  #original;

  /**
   * A reference to the bound key handler function
   * @type {Function}
   * @private
   */
  #keyHandler;

  /**
   * A reference to the bound mousewheel handler function
   * @type {Function}
   * @private
   */
  #wheelHandler;

  /**
   * Saved visibility for some layers
   * @type {object}
   */
  #layersOriginalVisibility;

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "grid-config",
      template: "templates/scene/grid-config.html",
      title: game.i18n.localize("SCENES.GridConfigTool"),
      width: 480,
      height: "auto",
      closeOnSubmit: true
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async _render(force, options) {
    if ( !this.rendered ) this.#original = this.object.toObject();
    await super._render(force, options);
    if ( !this.object.background.src ) {
      ui.notifications.warn("WARNING.GridConfigNoBG", {localize: true});
    }
    this.#layersOriginalVisibility = {};
    for ( const layer of canvas.layers ) {
      this.#layersOriginalVisibility[layer.name] = layer.visible;
      layer.visible = ["GridLayer", "TilesLayer"].includes(layer.name);
    }
    this._refresh({
      background: true,
      grid: {color: 0xFF0000, alpha: 1.0}
    });
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options={}) {
    const tex = canvas.primary.background.texture;
    return {
      gridTypes: SceneConfig._getGridTypes(),
      scale: tex ? this.object.width / tex.width : 1,
      scene: this.object
    };
  }

  /* -------------------------------------------- */

  /** @override */
  _getSubmitData(updateData = {}) {
    const formData = super._getSubmitData(updateData);
    const bg = canvas.primary.background;
    const tex = bg ? bg.texture : {width: this.object.width, height: this.object.height};
    formData.width = tex.width * formData.scale;
    formData.height = tex.height * formData.scale;
    return formData;
  }

  /* -------------------------------------------- */

  /** @override */
  async close(options={}) {
    document.removeEventListener("keydown", this.#keyHandler);
    document.removeEventListener("wheel", this.#wheelHandler);
    this.#keyHandler = this.#wheelHandler = undefined;
    await this.sheet.maximize();

    // Restore layers original visibility
    for ( const layer of canvas.layers ) {
      layer.visible = this.#layersOriginalVisibility[layer.name];
    }

    if ( !options.force ) this._reset();
    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    this.#keyHandler ||= this._onKeyDown.bind(this);
    document.addEventListener("keydown", this.#keyHandler);
    this.#wheelHandler ||= this._onWheel.bind(this);
    document.addEventListener("wheel", this.#wheelHandler, {passive: false});
    html.find('button[name="reset"]').click(this._reset.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle keyboard events.
   * @param {KeyboardEvent} event    The original keydown event
   * @private
   */
  _onKeyDown(event) {
    const key = event.code;
    const up = ["KeyW", "ArrowUp"];
    const down = ["KeyS", "ArrowDown"];
    const left = ["KeyA", "ArrowLeft"];
    const right = ["KeyD", "ArrowRight"];
    const moveKeys = up.concat(down).concat(left).concat(right);
    if ( !moveKeys.includes(key) ) return;

    // Increase the Scene scale on shift + up or down
    if ( event.shiftKey ) {
      event.preventDefault();
      event.stopPropagation();
      let delta = up.includes(key) ? 1 : (down.includes(key) ? -1 : 0);
      this._scaleBackgroundSize(delta);
    }

    // Resize grid size on ALT
    else if ( event.altKey ) {
      event.preventDefault();
      event.stopPropagation();
      let delta = up.includes(key) ? 1 : (down.includes(key) ? -1 : 0);
      this._scaleGridSize(delta);
    }

    // Shift grid position
    else if ( !game.keyboard.hasFocus ) {
      event.preventDefault();
      event.stopPropagation();
      if ( up.includes(key) ) this._shiftBackground({deltaY: -1});
      else if ( down.includes(key) ) this._shiftBackground({deltaY: 1});
      else if ( left.includes(key) ) this._shiftBackground({deltaX: -1});
      else if ( right.includes(key) ) this._shiftBackground({deltaX: 1});
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle mousewheel events.
   * @param {WheelEvent} event    The original wheel event
   * @private
   */
  _onWheel(event) {
    if ( event.deltaY === 0 ) return;

    // Increase the Scene scale on shift
    if ( event.shiftKey ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this._scaleBackgroundSize(-Math.sign(event.deltaY));
    }

    // Increase the Grid scale on alt
    if ( event.altKey ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this._scaleGridSize(-Math.sign(event.deltaY));
    }
  }

  /* -------------------------------------------- */

  /** @override */
  async _onChangeInput(event) {
    event.preventDefault();
    this.object.updateSource(this._getSubmitData());
    this._refresh({
      background: true,
      grid: {color: 0xFF0000, alpha: 1.0}
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    this.object.updateSource(this.#original);
    formData.width = Math.round(this.#dimensions.sceneWidth);
    formData.height = Math.round(this.#dimensions.sceneHeight);

    const delta = foundry.utils.diffObject(foundry.utils.flattenObject(this.object), formData);
    if ( ["width", "height", "padding", "background.offsetX", "background.offsetY", "grid.size"].some(k => k in delta) ) {
      const confirm = await Dialog.confirm({
        title: game.i18n.localize("SCENES.DimensionChangeTitle"),
        content: `<p>${game.i18n.localize("SCENES.DimensionChangeWarning")}</p>`
      });
      // Update only if the dialog is confirmed
      if ( confirm ) return this.object.update(formData, {fromSheet: true});
    }

    // We need to reset if the dialog was not confirmed OR if we don't need to update
    return this._reset();
  }

  /* -------------------------------------------- */
  /*  Previewing and Updating Functions           */
  /* -------------------------------------------- */

  /**
   * Temporarily refresh the display of the BackgroundLayer and GridLayer for the new pending dimensions
   * @param {object} options          Options which define how the refresh is performed
   * @param {boolean} [options.background]      Refresh the background display?
   * @param {object} [options.grid]             Refresh the grid display?
   * @private
   */
  _refresh({background=false, grid}) {
    const bg = canvas.primary.background;
    const fg = canvas.primary.foreground;
    const d = this.#dimensions = this.object.getDimensions();

    // Update the background and foreground sizing
    if ( background && bg ) {
      bg.position.set(d.sceneX, d.sceneY);
      bg.width = d.sceneWidth;
      bg.height = d.sceneHeight;
      grid ||= {};
    }
    if ( background && fg ) {
      fg.position.set(d.sceneX, d.sceneY);
      fg.width = d.sceneWidth;
      fg.height = d.sceneHeight;
    }

    // Update the grid layer
    if ( grid ) {
      const {type, color, alpha} = {...this.object.grid, ...grid};
      canvas.grid.grid.draw({dimensions: d, type, color: Color.from(color).valueOf(), alpha});
      canvas.stage.hitArea = d.rect;
    }
  }

  /* -------------------------------------------- */

  /**
   * Reset the scene back to its original settings
   * @private
   */
  _reset() {
    this.object.updateSource(this.#original);
    return this._refresh({background: true, grid: this.object.grid});
  }

  /* -------------------------------------------- */

  /**
   * Scale the background size relative to the grid size
   * @param {number} delta          The directional change in background size
   * @private
   */
  _scaleBackgroundSize(delta) {
    const scale = Math.round((parseFloat(this.form.scale.value) + (0.05 * delta)) * 100) / 100;
    this.form.scale.value = Math.clamped(scale, 0.25, 10.0);
    this.form.scale.dispatchEvent(new Event("change", {bubbles: true}));
  }

  /* -------------------------------------------- */

  /**
   * Scale the grid size relative to the background image.
   * When scaling the grid size in this way, constrain the allowed values between 50px and 300px.
   * @param {number} delta          The grid size in pixels
   * @private
   */
  _scaleGridSize(delta) {
    const gridSize = this.form.elements["grid.size"];
    gridSize.value = Math.clamped(gridSize.valueAsNumber + delta, 50, 300);
    gridSize.dispatchEvent(new Event("change", {bubbles: true}));
  }

  /* -------------------------------------------- */

  /**
   * Shift the background image relative to the grid layer
   * @param {object} position       The position configuration to preview
   * @param {number} position.deltaX    The number of pixels to shift in the x-direction
   * @param {number} position.deltaY    The number of pixels to shift in the y-direction
   * @private
   */
  _shiftBackground({deltaX=0, deltaY=0}={}) {
    const ox = this.form["background.offsetX"];
    ox.value = parseInt(this.form["background.offsetX"].value) + deltaX;
    this.form["background.offsetY"].value = parseInt(this.form["background.offsetY"].value) + deltaY;
    ox.dispatchEvent(new Event("change", {bubbles: true}));
  }
}
