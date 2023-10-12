/**
 * @typedef {Object} SceneControlTool
 * @property {string} name
 * @property {string} title
 * @property {string} icon
 * @property {boolean} visible
 * @property {boolean} toggle
 * @property {boolean} active
 * @property {boolean} button
 * @property {Function} onClick
 */

/**
 * @typedef {Object} SceneControl
 * @property {string} name
 * @property {string} title
 * @property {string} layer
 * @property {string} icon
 * @property {boolean} visible
 * @property {SceneControlTool[]} tools
 * @property {string} activeTool
 */

/**
 * Scene controls navigation menu
 * @extends {Application}
 */
class SceneControls extends Application {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 100,
      id: "controls",
      template: "templates/hud/controls.html",
      popOut: false
    });
  }

  /* -------------------------------------------- */

  /**
   * The Array of Scene Control buttons which are currently rendered
   * @type {SceneControl[]}
   */
  controls = this._getControlButtons();

  /* -------------------------------------------- */

  /**
   * The currently active control set
   * @type {string}
   */
  get activeControl() {
    return this.#control;
  }

  #control = "token";

  /* -------------------------------------------- */

  /**
   * The currently active tool in the control palette
   * @type {string}
   */
  get activeTool() {
    return this.#tools[this.#control];
  }

  /**
   * Track which tool is active within each control set
   * @type {Object<string, string>}
   */
  #tools = {};

  /* -------------------------------------------- */

  /**
   * Return the active control set
   * @type {SceneControl|null}
   */
  get control() {
    if ( !this.controls ) return null;
    return this.controls.find(c => c.name === this.#control) || null;
  }

  /* -------------------------------------------- */

  /**
   * Return the actively controlled tool
   * @type {SceneControlTool|null}
   */
  get tool() {
    const control = this.control;
    if ( !control ) return null;
    return this.#tools[control.name] || null;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Initialize the Scene Controls by obtaining the set of control buttons and rendering the HTML
   * @param {object} options      Options which modify how the controls UI is initialized
   * @param {string} [options.control]      An optional control set to set as active
   * @param {string} [options.layer]        An optional layer name to target as the active control
   * @param {string} [options.tool]         A specific named tool to set as active for the palette
   */
  initialize({control, layer, tool} = {}) {

    // Determine the control set to activate
    let controlSet = control ? this.controls.find(c => c.name === control) : null;
    if ( !controlSet && layer ) controlSet = this.controls.find(c => c.layer === layer);
    if ( !controlSet ) controlSet = this.control;

    // Determine the tool to activate
    tool ||= this.#tools[controlSet.name] || controlSet.activeTool;

    // Activate the new control scheme
    this.#control = controlSet?.name || null;
    this.#tools[this.#control] = tool || null;
    this.controls = this._getControlButtons();

    // Render the UI
    this.render(true);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const canvasActive = !!canvas.scene;
    const controls = this.controls.filter(s => s.visible !== false).map(control => {

      // Control data
      control = foundry.utils.deepClone(control);
      control.isActive = canvasActive && (this.#control === control.name);
      control.css = control.isActive ? "active" : "";

      // Tool data
      control.tools = control.tools.filter(t => t.visible !== false).map(tool => {
        tool = foundry.utils.deepClone(tool);
        tool.isActive = canvasActive && ((this.#tools[control.name] === tool.name) || (tool.toggle && tool.active));
        tool.css = [
          tool.toggle ? "toggle" : null,
          tool.isActive ? "active" : null
        ].filter(t => !!t).join(" ");
        return tool;
      });
      return control;
    });

    // Return data for rendering
    return {
      active: canvasActive,
      cssClass: canvasActive ? "" : "disabled",
      controls: controls.filter(s => s.tools.length)
    };
  }


  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    html.find(".scene-control").click(this._onClickLayer.bind(this));
    html.find(".control-tool").click(this._onClickTool.bind(this));
    canvas.notes?.hintMapNotes();
  }

  /* -------------------------------------------- */

  /**
   * Handle click events on a Control set
   * @param {Event} event   A click event on a tool control
   * @private
   */
  _onClickLayer(event) {
    event.preventDefault();
    if ( !canvas.ready ) return;
    const li = event.currentTarget;
    const controlName = li.dataset.control;
    if ( this.#control === controlName ) return;
    this.#control = controlName;
    const control = this.controls.find(c => c.name === controlName);
    if ( control ) canvas[control.layer].activate();
  }

  /* -------------------------------------------- */

  /**
   * Handle click events on Tool controls
   * @param {Event} event   A click event on a tool control
   * @private
   */
  _onClickTool(event) {
    event.preventDefault();
    if ( !canvas.ready ) return;
    const li = event.currentTarget;
    const control = this.control;
    const toolName = li.dataset.tool;
    const tool = control.tools.find(t => t.name === toolName);

    // Handle Toggles
    if ( tool.toggle ) {
      tool.active = !tool.active;
      if ( tool.onClick instanceof Function ) tool.onClick(tool.active);
    }

    // Handle Buttons
    else if ( tool.button ) {
      if ( tool.onClick instanceof Function ) tool.onClick();
    }

    // Handle Tools
    else {
      this.#tools[control.name] = toolName;
      if ( tool.onClick instanceof Function ) tool.onClick();
    }

    // Render the controls
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Get the set of Control sets and tools that are rendered as the Scene Controls.
   * These controls may be extended using the "getSceneControlButtons" Hook.
   * @returns {SceneControl[]}
   * @private
   */
  _getControlButtons() {
    const controls = [];
    const isGM = game.user.isGM;

    // Token Controls
    controls.push({
      name: "token",
      title: "CONTROLS.GroupToken",
      layer: "tokens",
      icon: "fas fa-user-alt",
      tools: [
        {
          name: "select",
          title: "CONTROLS.BasicSelect",
          icon: "fas fa-expand"
        },
        {
          name: "target",
          title: "CONTROLS.TargetSelect",
          icon: "fas fa-bullseye"
        },
        {
          name: "ruler",
          title: "CONTROLS.BasicMeasure",
          icon: "fas fa-ruler"
        }
      ],
      activeTool: "select"
    });

    // Measurement Layer Tools
    controls.push({
      name: "measure",
      title: "CONTROLS.GroupMeasure",
      layer: "templates",
      icon: "fas fa-ruler-combined",
      visible: game.user.can("TEMPLATE_CREATE"),
      tools: [
        {
          name: "circle",
          title: "CONTROLS.MeasureCircle",
          icon: "fa-regular fa-circle"
        },
        {
          name: "cone",
          title: "CONTROLS.MeasureCone",
          icon: "fa-solid fa-angle-left"
        },
        {
          name: "rect",
          title: "CONTROLS.MeasureRect",
          icon: "fa-regular fa-square"
        },
        {
          name: "ray",
          title: "CONTROLS.MeasureRay",
          icon: "fa-solid fa-arrows-alt-v"
        },
        {
          name: "clear",
          title: "CONTROLS.MeasureClear",
          icon: "fa-solid fa-trash",
          visible: isGM,
          onClick: () => canvas.templates.deleteAll(),
          button: true
        }
      ],
      activeTool: "circle"
    });

    // Tiles Layer
    controls.push({
      name: "tiles",
      title: "CONTROLS.GroupTile",
      layer: "tiles",
      icon: "fa-solid fa-cubes",
      visible: isGM,
      tools: [
        {
          name: "select",
          title: "CONTROLS.TileSelect",
          icon: "fa-solid fa-expand"
        },
        {
          name: "tile",
          title: "CONTROLS.TilePlace",
          icon: "fa-solid fa-cube"
        },
        {
          name: "browse",
          title: "CONTROLS.TileBrowser",
          icon: "fa-solid fa-folder",
          button: true,
          onClick: () => {
            new FilePicker({
              type: "imagevideo",
              displayMode: "tiles",
              tileSize: true
            }).render(true);
          }
        },
        {
          name: "foreground",
          title: "CONTROLS.TileForeground",
          icon: "fa-solid fa-home",
          toggle: true,
          active: false,
          onClick: active => {
            this.control.foreground = active;
            canvas.tiles._activateSubLayer(active);
            canvas.perception.update({refreshLighting: true, refreshTiles: true}, true);
          }
        }
      ],
      activeTool: "select"
    });

    // Drawing Tools
    controls.push({
      name: "drawings",
      title: "CONTROLS.GroupDrawing",
      layer: "drawings",
      icon: "fa-solid fa-pencil-alt",
      visible: game.user.can("DRAWING_CREATE"),
      tools: [
        {
          name: "select",
          title: "CONTROLS.DrawingSelect",
          icon: "fa-solid fa-expand"
        },
        {
          name: "rect",
          title: "CONTROLS.DrawingRect",
          icon: "fa-solid fa-square"
        },
        {
          name: "ellipse",
          title: "CONTROLS.DrawingEllipse",
          icon: "fa-solid fa-circle"
        },
        {
          name: "polygon",
          title: "CONTROLS.DrawingPoly",
          icon: "fa-solid fa-draw-polygon"
        },
        {
          name: "freehand",
          title: "CONTROLS.DrawingFree",
          icon: "fa-solid fa-signature"
        },
        {
          name: "text",
          title: "CONTROLS.DrawingText",
          icon: "fa-solid fa-font"
        },
        {
          name: "configure",
          title: "CONTROLS.DrawingConfig",
          icon: "fa-solid fa-cog",
          onClick: () => canvas.drawings.configureDefault(),
          button: true
        },
        {
          name: "clear",
          title: "CONTROLS.DrawingClear",
          icon: "fa-solid fa-trash",
          visible: isGM,
          onClick: () => canvas.drawings.deleteAll(),
          button: true
        }
      ],
      activeTool: "select"
    });

    // Walls Layer Tools
    controls.push({
      name: "walls",
      title: "CONTROLS.GroupWall",
      layer: "walls",
      icon: "fa-solid fa-university",
      visible: isGM,
      tools: [
        {
          name: "select",
          title: "CONTROLS.WallSelect",
          icon: "fa-solid fa-expand"
        },
        {
          name: "walls",
          title: "CONTROLS.WallDraw",
          icon: "fa-solid fa-bars"
        },
        {
          name: "terrain",
          title: "CONTROLS.WallTerrain",
          icon: "fa-solid fa-mountain"
        },
        {
          name: "invisible",
          title: "CONTROLS.WallInvisible",
          icon: "fa-solid fa-eye-slash"
        },
        {
          name: "ethereal",
          title: "CONTROLS.WallEthereal",
          icon: "fa-solid fa-mask"
        },
        {
          name: "doors",
          title: "CONTROLS.WallDoors",
          icon: "fa-solid fa-door-open"
        },
        {
          name: "secret",
          title: "CONTROLS.WallSecret",
          icon: "fa-solid fa-user-secret"
        },
        {
          name: "clone",
          title: "CONTROLS.WallClone",
          icon: "fa-regular fa-clone"
        },
        {
          name: "snap",
          title: "CONTROLS.WallSnap",
          icon: "fa-solid fa-plus",
          toggle: true,
          active: canvas.walls?._forceSnap || false,
          onClick: toggled => canvas.walls._forceSnap = toggled
        },
        {
          name: "clear",
          title: "CONTROLS.WallClear",
          icon: "fa-solid fa-trash",
          onClick: () => canvas.walls.deleteAll(),
          button: true
        }
      ],
      activeTool: "walls"
    });

    // Lighting Layer Tools
    controls.push({
      name: "lighting",
      title: "CONTROLS.GroupLighting",
      layer: "lighting",
      icon: "fa-regular fa-lightbulb",
      visible: isGM,
      tools: [
        {
          name: "light",
          title: "CONTROLS.LightDraw",
          icon: "fa-solid fa-lightbulb"
        },
        {
          name: "day",
          title: "CONTROLS.LightDay",
          icon: "fa-solid fa-sun",
          onClick: () => canvas.scene.update({darkness: 0.0}, {animateDarkness: 10000}),
          button: true
        },
        {
          name: "night",
          title: "CONTROLS.LightNight",
          icon: "fa-solid fa-moon",
          onClick: () => canvas.scene.update({darkness: 1.0}, {animateDarkness: 10000}),
          button: true
        },
        {
          name: "reset",
          title: "CONTROLS.LightReset",
          icon: "fa-solid fa-cloud",
          onClick: () => {
            new Dialog({
              title: game.i18n.localize("CONTROLS.FOWResetTitle"),
              content: `<p>${game.i18n.localize("CONTROLS.FOWResetDesc")}</p>`,
              buttons: {
                yes: {
                  icon: '<i class="fa-solid fa-check"></i>',
                  label: "Yes",
                  callback: () => canvas.fog.reset()
                },
                no: {
                  icon: '<i class="fa-solid fa-times"></i>',
                  label: "No"
                }
              }
            }).render(true);
          },
          button: true
        },
        {
          name: "clear",
          title: "CONTROLS.LightClear",
          icon: "fa-solid fa-trash",
          onClick: () => canvas.lighting.deleteAll(),
          button: true
        }
      ],
      activeTool: "light"
    });

    // Sounds Layer Tools
    controls.push({
      name: "sounds",
      title: "CONTROLS.GroupSound",
      layer: "sounds",
      icon: "fa-solid fa-music",
      visible: isGM,
      tools: [
        {
          name: "sound",
          title: "CONTROLS.SoundDraw",
          icon: "fa-solid fa-volume-up"
        },
        {
          name: "preview",
          title: "CONTROLS.SoundPreview",
          icon: "fa-solid fa-headphones",
          toggle: true,
          active: canvas.sounds?.livePreview ?? false,
          onClick: toggled => {
            canvas.sounds.livePreview = toggled;
            canvas.sounds.refresh();
          }
        },
        {
          name: "clear",
          title: "CONTROLS.SoundClear",
          icon: "fa-solid fa-trash",
          onClick: () => canvas.sounds.deleteAll(),
          button: true
        }
      ],
      activeTool: "sound"
    });

    // Notes Layer Tools
    controls.push({
      name: "notes",
      title: "CONTROLS.GroupNotes",
      layer: "notes",
      icon: "fa-solid fa-bookmark",
      tools: [
        {
          name: "select",
          title: "CONTROLS.NoteSelect",
          icon: "fa-solid fa-expand"
        },
        {
          name: "journal",
          title: "NOTE.Create",
          visible: game.user.hasPermission("NOTE_CREATE"),
          icon: CONFIG.JournalEntry.sidebarIcon
        },
        {
          name: "toggle",
          title: "CONTROLS.NoteToggle",
          icon: "fa-solid fa-map-pin",
          toggle: true,
          active: game.settings.get("core", NotesLayer.TOGGLE_SETTING),
          onClick: toggled => game.settings.set("core", NotesLayer.TOGGLE_SETTING, toggled)
        },
        {
          name: "clear",
          title: "CONTROLS.NoteClear",
          icon: "fa-solid fa-trash",
          visible: isGM,
          onClick: () => canvas.notes.deleteAll(),
          button: true
        }
      ],
      activeTool: "select"
    });

    // Pass the Scene Controls to a hook function to allow overrides or changes
    /**
     * A hook event that fires when the Scene controls are initialized.
     * @function getSceneControlButtons
     * @memberof hookEvents
     * @param {SceneControl[]} controls The SceneControl configurations
     */
    Hooks.callAll("getSceneControlButtons", controls);
    return controls;
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  get isRuler() {
    return this.activeTool === "ruler";
  }
}
