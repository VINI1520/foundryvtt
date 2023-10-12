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
 * @property {ToolclipConfiguration} toolclip  Configuration for rendering the tool's toolclip.
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
 * @typedef {object} ToolclipConfiguration
 * @property {string} src                         The filename of the toolclip video.
 * @property {string} heading                     The heading string.
 * @property {ToolclipConfigurationItem[]} items  The items in the toolclip body.
 */

/**
 * @typedef {object} ToolclipConfigurationItem
 * @property {string} [paragraph]  A plain paragraph of content for this item.
 * @property {string} [heading]    A heading for the item.
 * @property {string} [content]    Content for the item.
 * @property {string} [reference]  If the item is a single key reference, use this instead of content.
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
  async getData(options={}) {
    const showToolclips = game.settings.get("core", "showToolclips");
    const canvasActive = !!canvas.scene;
    const controls = [];
    for ( const c of this.controls ) {
      if ( c.visible === false ) continue;
      const control = foundry.utils.deepClone(c);
      control.isActive = canvasActive && (this.#control === control.name);
      control.css = control.isActive ? "active" : "";
      control.tools = [];

      for ( const t of c.tools ) {
        if ( t.visible === false ) continue;
        const tool = foundry.utils.deepClone(t);
        tool.isActive = canvasActive && ((this.#tools[control.name] === tool.name) || (tool.toggle && tool.active));
        tool.css = [
          tool.toggle ? "toggle" : null,
          tool.isActive ? "active" : null
        ].filterJoin(" ");
        tool.tooltip = showToolclips && tool.toolclip
          ? await renderTemplate("templates/hud/toolclip.html", tool.toolclip)
          : tool.title;
        control.tools.push(tool);
      }

      if ( control.tools.length ) controls.push(control);
    }

    // Return data for rendering
    return {
      controls,
      active: canvasActive,
      cssClass: canvasActive ? "" : "disabled"
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
    const clip = game.settings.get("core", "showToolclips") ? "Clip" : "";
    const commonControls = {
      create: { heading: "CONTROLS.CommonCreate", reference: "CONTROLS.ClickDrag" },
      move: { heading: "CONTROLS.CommonMove", reference: "CONTROLS.Drag" },
      edit: { heading: "CONTROLS.CommonEdit", reference: "CONTROLS.DoubleClick" },
      editAlt: { heading: "CONTROLS.CommonEdit", reference: "CONTROLS.DoubleRightClick" },
      sheet: { heading: "CONTROLS.CommonOpenSheet", reference: "CONTROLS.DoubleClick" },
      hide: { heading: "CONTROLS.CommonHide", reference: "CONTROLS.RightClick" },
      delete: { heading: "CONTROLS.CommonDelete", reference: "CONTROLS.Delete" },
      rotate: { heading: "CONTROLS.CommonRotate", content: "CONTROLS.ShiftOrCtrlScroll" },
      select: { heading: "CONTROLS.CommonSelect", reference: "CONTROLS.Click" },
      selectAlt: { heading: "CONTROLS.CommonSelect", content: "CONTROLS.ClickOrClickDrag" },
      selectMultiple: { heading: "CONTROLS.CommonSelectMultiple", reference: "CONTROLS.ShiftClick" },
      hud: { heading: "CONTROLS.CommonToggleHUD", reference: "CONTROLS.RightClick" },
      draw: { heading: "CONTROLS.CommonDraw", reference: "CONTROLS.ClickDrag" },
      place: { heading: "CONTROLS.CommonPlace", reference: "CONTROLS.ClickDrag" },
      chain: { heading: "CONTROLS.CommonChain", content: "CONTROLS.ChainCtrlClick" },
      movePoint: { heading: "CONTROLS.CommonMovePoint", reference: "CONTROLS.ClickDrag" },
      openClose: { heading: "CONTROLS.CommonOpenClose", reference: "CONTROLS.Click" },
      openCloseSilently: { heading: "CONTROLS.CommonOpenCloseSilently", reference: "CONTROLS.AltClick" },
      lock: { heading: "CONTROLS.CommonLock", reference: "CONTROLS.RightClick" },
      lockSilently: { heading: "CONTROLS.CommonLockSilently", reference: "CONTROLS.AltRightClick" },
      onOff: { heading: "CONTROLS.CommonOnOff", reference: "CONTROLS.RightClick" }
    };

    const buildItems = (...items) => items.map(item => commonControls[item]);

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
          icon: "fas fa-expand",
          toolclip: {
            src: "toolclips/tools/token-select.webm",
            heading: "CONTROLS.BasicSelect",
            items: [
              { paragraph: "CONTROLS.BasicSelectP" },
              ...buildItems("selectAlt", "selectMultiple", "move", "rotate", "hud", "sheet"),
              ...(game.user.isGM ? buildItems("editAlt", "delete") : []),
              { heading: "CONTROLS.BasicMeasureStart", reference: "CONTROLS.CtrlClickDrag" },
              { heading: "CONTROLS.BasicMeasureWaypoints", reference: "CONTROLS.CtrlClick" },
              { heading: "CONTROLS.BasicMeasureFollow", reference: "CONTROLS.Spacebar" }
            ]
          }
        },
        {
          name: "target",
          title: "CONTROLS.TargetSelect",
          icon: "fas fa-bullseye",
          toolclip: {
            src: "toolclips/tools/token-target.webm",
            heading: "CONTROLS.TargetSelect",
            items: [
              { paragraph: "CONTROLS.TargetSelectP" },
              ...buildItems("selectAlt", "selectMultiple")
            ]
          }
        },
        {
          name: "ruler",
          title: "CONTROLS.BasicMeasure",
          icon: "fas fa-ruler",
          toolclip: {
            src: "toolclips/tools/token-measure.webm",
            heading: "CONTROLS.BasicMeasure",
            items: [
              { heading: "CONTROLS.BasicMeasureStart", reference: "CONTROLS.ClickDrag" },
              { heading: "CONTROLS.BasicMeasureWaypoints", reference: "CONTROLS.CtrlClick" },
              { heading: "CONTROLS.BasicMeasureFollow", reference: "CONTROLS.Spacebar" }
            ]
          }
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
          icon: "fa-regular fa-circle",
          toolclip: {
            src: "toolclips/tools/measure-circle.webm",
            heading: "CONTROLS.MeasureCircle",
            items: buildItems("create", "move", "edit", "hide", "delete")
          }
        },
        {
          name: "cone",
          title: "CONTROLS.MeasureCone",
          icon: "fa-solid fa-angle-left",
          toolclip: {
            src: "toolclips/tools/measure-cone.webm",
            heading: "CONTROLS.MeasureCone",
            items: buildItems("create", "move", "edit", "hide", "delete", "rotate")
          }
        },
        {
          name: "rect",
          title: "CONTROLS.MeasureRect",
          icon: "fa-regular fa-square",
          toolclip: {
            src: "toolclips/tools/measure-rect.webm",
            heading: "CONTROLS.MeasureRect",
            items: buildItems("create", "move", "edit", "hide", "delete", "rotate")
          }
        },
        {
          name: "ray",
          title: "CONTROLS.MeasureRay",
          icon: "fa-solid fa-arrows-alt-v",
          toolclip: {
            src: "toolclips/tools/measure-ray.webm",
            heading: "CONTROLS.MeasureRay",
            items: buildItems("create", "move", "edit", "hide", "delete", "rotate")
          }
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
          icon: "fa-solid fa-expand",
          toolclip: {
            src: "toolclips/tools/tile-select.webm",
            heading: "CONTROLS.TileSelect",
            items: buildItems("selectAlt", "selectMultiple", "move", "rotate", "hud", "edit", "delete")
          }
        },
        {
          name: "tile",
          title: "CONTROLS.TilePlace",
          icon: "fa-solid fa-cube",
          toolclip: {
            src: "toolclips/tools/tile-place.webm",
            heading: "CONTROLS.TilePlace",
            items: buildItems("create", "move", "rotate", "hud", "edit", "delete")
          }
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
          },
          toolclip: {
            src: "toolclips/tools/tile-browser.webm",
            heading: "CONTROLS.TileBrowser",
            items: buildItems("place", "move", "rotate", "hud", "edit", "delete")
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
            canvas.perception.update({refreshLighting: true, refreshTiles: true});
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
          icon: "fa-solid fa-expand",
          toolclip: {
            src: "toolclips/tools/drawing-select.webm",
            heading: "CONTROLS.DrawingSelect",
            items: buildItems("selectAlt", "selectMultiple", "move", "hud", "edit", "delete", "rotate")
          }
        },
        {
          name: "rect",
          title: "CONTROLS.DrawingRect",
          icon: "fa-solid fa-square",
          toolclip: {
            src: "toolclips/tools/drawing-rect.webm",
            heading: "CONTROLS.DrawingRect",
            items: buildItems("draw", "move", "hud", "edit", "delete", "rotate")
          }
        },
        {
          name: "ellipse",
          title: "CONTROLS.DrawingEllipse",
          icon: "fa-solid fa-circle",
          toolclip: {
            src: "toolclips/tools/drawing-ellipse.webm",
            heading: "CONTROLS.DrawingEllipse",
            items: buildItems("draw", "move", "hud", "edit", "delete", "rotate")
          }
        },
        {
          name: "polygon",
          title: "CONTROLS.DrawingPoly",
          icon: "fa-solid fa-draw-polygon",
          toolclip: {
            src: "toolclips/tools/drawing-polygon.webm",
            heading: "CONTROLS.DrawingPoly",
            items: [
              { heading: "CONTROLS.CommonDraw", content: "CONTROLS.DrawingPolyP" },
              ...buildItems("move", "hud", "edit", "delete", "rotate")
            ]
          }
        },
        {
          name: "freehand",
          title: "CONTROLS.DrawingFree",
          icon: "fa-solid fa-signature",
          toolclip: {
            src: "toolclips/tools/drawing-free.webm",
            heading: "CONTROLS.DrawingFree",
            items: buildItems("draw", "move", "hud", "edit", "delete", "rotate")
          }
        },
        {
          name: "text",
          title: "CONTROLS.DrawingText",
          icon: "fa-solid fa-font",
          onClick: () => {
            const controlled = canvas.drawings.controlled;
            if ( controlled.length === 1 ) controlled[0].enableTextEditing();
          },
          toolclip: {
            src: "toolclips/tools/drawing-text.webm",
            heading: "CONTROLS.DrawingText",
            items: buildItems("draw", "move", "hud", "edit", "delete", "rotate")
          }
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
      icon: "fa-solid fa-block-brick",
      visible: isGM,
      tools: [
        {
          name: "select",
          title: "CONTROLS.WallSelect",
          icon: "fa-solid fa-expand",
          toolclip: {
            src: "toolclips/tools/wall-select.webm",
            heading: "CONTROLS.WallSelect",
            items: [
              ...buildItems("selectAlt", "selectMultiple", "move"),
              { heading: "CONTROLS.CommonMoveWithoutSnapping", reference: "CONTROLS.ShiftDrag" },
              { heading: "CONTROLS.CommonEdit", content: "CONTROLS.WallSelectEdit" },
              ...buildItems("delete")
            ]
          }
        },
        {
          name: "walls",
          title: "CONTROLS.WallDraw",
          icon: "fa-solid fa-bars",
          toolclip: {
            src: "toolclips/tools/wall-basic.webm",
            heading: "CONTROLS.WallBasic",
            items: [
              { heading: "CONTROLS.CommonBlocks", content: "CONTROLS.WallBasicBlocks" },
              ...buildItems("place", "chain", "movePoint", "edit", "delete")
            ]
          }
        },
        {
          name: "terrain",
          title: "CONTROLS.WallTerrain",
          icon: "fa-solid fa-mountain",
          toolclip: {
            src: "toolclips/tools/wall-terrain.webm",
            heading: "CONTROLS.WallTerrain",
            items: [
              { heading: "CONTROLS.CommonBlocks", content: "CONTROLS.WallTerrainBlocks" },
              ...buildItems("place", "chain", "movePoint", "edit", "delete")
            ]
          }
        },
        {
          name: "invisible",
          title: "CONTROLS.WallInvisible",
          icon: "fa-solid fa-eye-slash",
          toolclip: {
            src: "toolclips/tools/wall-invisible.webm",
            heading: "CONTROLS.WallInvisible",
            items: [
              { heading: "CONTROLS.CommonBlocks", content: "CONTROLS.WallInvisibleBlocks" },
              ...buildItems("place", "chain", "movePoint", "edit", "delete")
            ]
          }
        },
        {
          name: "ethereal",
          title: "CONTROLS.WallEthereal",
          icon: "fa-solid fa-mask",
          toolclip: {
            src: "toolclips/tools/wall-ethereal.webm",
            heading: "CONTROLS.WallEthereal",
            items: [
              { heading: "CONTROLS.CommonBlocks", content: "CONTROLS.WallEtherealBlocks" },
              ...buildItems("place", "chain", "movePoint", "edit", "delete")
            ]
          }
        },
        {
          name: "doors",
          title: "CONTROLS.WallDoors",
          icon: "fa-solid fa-door-open",
          toolclip: {
            src: "toolclips/tools/wall-door.webm",
            heading: "CONTROLS.WallDoors",
            items: [
              { heading: "CONTROLS.CommonBlocks", content: "CONTROLS.DoorBlocks" },
              ...buildItems("openClose", "openCloseSilently", "lock", "lockSilently", "place", "chain", "movePoint", "edit")
            ]
          }
        },
        {
          name: "secret",
          title: "CONTROLS.WallSecret",
          icon: "fa-solid fa-user-secret",
          toolclip: {
            src: "toolclips/tools/wall-secret-door.webm",
            heading: "CONTROLS.WallSecret",
            items: [
              { heading: "CONTROLS.WallSecretHidden", content: "CONTROLS.WallSecretHiddenP" },
              { heading: "CONTROLS.CommonBlocks", content: "CONTROLS.DoorBlocks" },
              ...buildItems("openClose", "openCloseSilently", "lock", "lockSilently", "place", "chain", "movePoint", "edit")
            ]
          }
        },
        {
          name: "window",
          title: "CONTROLS.WallWindow",
          icon: "fa-solid fa-window-frame",
          toolclip: {
            src: "toolclips/tools/wall-window.webm",
            heading: "CONTROLS.WallWindow",
            items: [
              { heading: "CONTROLS.CommonBlocks", content: "CONTROLS.WallWindowBlocks" },
              ...buildItems("place", "chain", "movePoint", "edit", "delete")
            ]
          }
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
          onClick: toggled => canvas.walls._forceSnap = toggled,
          toolclip: {
            src: "toolclips/tools/wall-snap.webm",
            heading: "CONTROLS.WallSnap",
            items: [{ heading: "CONTROLS.WallSnapH", content: "CONTROLS.WallSnapP" }]
          }
        },
        {
          name: "close-doors",
          title: "CONTROLS.WallCloseDoors",
          icon: "fa-regular fa-door-closed",
          onClick: () => {
            let updates = canvas.walls.placeables.reduce((arr, w) => {
              if ( w.isDoor && (w.document.ds === CONST.WALL_DOOR_STATES.OPEN) ) {
                arr.push({_id: w.id, ds: CONST.WALL_DOOR_STATES.CLOSED});
              }
              return arr;
            }, []);
            if ( !updates.length ) return;
            canvas.scene.updateEmbeddedDocuments("Wall", updates, {sound: false});
            ui.notifications.info(game.i18n.format("CONTROLS.WallDoorsClosed", {number: updates.length}));
          }
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
          icon: "fa-solid fa-lightbulb",
          toolclip: {
            src: "toolclips/tools/light-draw.webm",
            heading: "CONTROLS.LightDraw",
            items: buildItems("create", "edit", "rotate", "onOff")
          }
        },
        {
          name: "day",
          title: "CONTROLS.LightDay",
          icon: "fa-solid fa-sun",
          onClick: () => canvas.scene.update({darkness: 0.0}, {animateDarkness: 10000}),
          button: true,
          toolclip: {
            src: "toolclips/tools/light-day.webm",
            heading: "CONTROLS.LightDay",
            items: [
              { heading: "CONTROLS.MakeDayH", content: "CONTROLS.MakeDayP" },
              { heading: "CONTROLS.AutoLightToggleH", content: "CONTROLS.AutoLightToggleP" }
            ]
          }
        },
        {
          name: "night",
          title: "CONTROLS.LightNight",
          icon: "fa-solid fa-moon",
          onClick: () => canvas.scene.update({darkness: 1.0}, {animateDarkness: 10000}),
          button: true,
          toolclip: {
            src: "toolclips/tools/light-night.webm",
            heading: "CONTROLS.LightNight",
            items: [
              { heading: "CONTROLS.MakeNightH", content: "CONTROLS.MakeNightP" },
              { heading: "CONTROLS.AutoLightToggleH", content: "CONTROLS.AutoLightToggleP" }
            ]
          }
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
          button: true,
          toolclip: {
            src: "toolclips/tools/light-reset.webm",
            heading: "CONTROLS.LightReset",
            items: [{ paragraph: "CONTROLS.LightResetP" }]
          }
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
          icon: "fa-solid fa-volume-up",
          toolclip: {
            src: "toolclips/tools/sound-draw.webm",
            heading: "CONTROLS.SoundDraw",
            items: buildItems("create", "edit", "rotate", "onOff")
          }
        },
        {
          name: "preview",
          title: `CONTROLS.SoundPreview${clip}`,
          icon: "fa-solid fa-headphones",
          toggle: true,
          active: canvas.sounds?.livePreview ?? false,
          onClick: toggled => {
            canvas.sounds.livePreview = toggled;
            canvas.sounds.refresh();
          },
          toolclip: {
            src: "toolclips/tools/sound-preview.webm",
            heading: "CONTROLS.SoundPreview",
            items: [{ paragraph: "CONTROLS.SoundPreviewP" }]
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
