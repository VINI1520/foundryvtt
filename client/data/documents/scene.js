/**
 * The client-side Scene document which extends the common BaseScene model.
 * @extends documents.BaseItem
 * @mixes ClientDocumentMixin
 *
 * @see {@link Scenes}            The world-level collection of Scene documents
 * @see {@link SceneConfig}       The Scene configuration application
 */
class Scene extends ClientDocumentMixin(foundry.documents.BaseScene) {

  /**
   * Track the viewed position of each scene (while in memory only, not persisted)
   * When switching back to a previously viewed scene, we can automatically pan to the previous position.
   * @type {CanvasViewPosition}
   */
  _viewPosition = {};

  /**
   * Track whether the scene is the active view
   * @type {boolean}
   */
  _view = this.active;

  /**
   * Determine the canvas dimensions this Scene would occupy, if rendered
   * @type {object}
   */
  dimensions = this.dimensions; // Workaround for subclass property instantiation issue.

  /* -------------------------------------------- */
  /*  Scene Properties                            */
  /* -------------------------------------------- */

  /**
   * Provide a thumbnail image path used to represent this document.
   * @type {string}
   */
  get thumbnail() {
    return this.thumb;
  }

  /* -------------------------------------------- */

  /**
   * A convenience accessor for whether the Scene is currently viewed
   * @type {boolean}
   */
  get isView() {
    return this._view;
  }

  /* -------------------------------------------- */
  /*  Scene Methods                               */
  /* -------------------------------------------- */

  /**
   * Set this scene as currently active
   * @returns {Promise<Scene>}  A Promise which resolves to the current scene once it has been successfully activated
   */
  async activate() {
    if ( this.active ) return this;
    return this.update({active: true});
  }

  /* -------------------------------------------- */

  /**
   * Set this scene as the current view
   * @returns {Promise<Scene>}
   */
  async view() {

    // Do not switch if the loader is still running
    if ( canvas.loading ) {
      return ui.notifications.warn("You cannot switch Scenes until resources finish loading for your current view.");
    }

    // Switch the viewed scene
    for ( let scene of game.scenes ) {
      scene._view = scene.id === this.id;
    }

    // Notify the user in no-canvas mode
    if ( game.settings.get("core", "noCanvas") ) {
      ui.notifications.info(game.i18n.format("INFO.SceneViewCanvasDisabled", {
        name: this.navName ? this.navName : this.name
      }));
    }

    // Re-draw the canvas if the view is different
    if ( canvas.initialized && (canvas.id !== this.id) ) {
      console.log(`Foundry VTT | Viewing Scene ${this.name}`);
      await canvas.draw(this);
    }

    // Render apps for the collection
    this.collection.render();
    ui.combat.initialize();
    return this;
  }

  /* -------------------------------------------- */

  /** @override */
  clone(createData={}, options={}) {
    createData.active = false;
    createData.navigation = false;
    if ( !foundry.data.validators.isBase64Data(createData.thumb) ) delete createData.thumb;
    if ( !options.save ) return super.clone(createData, options);
    return this.createThumbnail().then(data => {
      createData.thumb = data.thumb;
      return super.clone(createData, options);
    });
  }

  /* -------------------------------------------- */

  /** @override */
  reset() {
    this._initialize({sceneReset: true});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  prepareBaseData() {
    this.dimensions = this.getDimensions();
    this.playlistSound = this.playlist ? this.playlist.sounds.get(this._source.playlistSound) : null;
    // A temporary assumption until a more robust long-term solution when we implement Scene Levels.
    this.foregroundElevation = this.foregroundElevation || (this.grid.distance * 4);
  }

  /* -------------------------------------------- */

  /**
   * @typedef {object} SceneDimensions
   * @property {number} width        The width of the canvas.
   * @property {number} height       The height of the canvas.
   * @property {number} size         The grid size.
   * @property {Rectangle} rect      The canvas rectangle.
   * @property {number} sceneX       The X coordinate of the scene rectangle within the larger canvas.
   * @property {number} sceneY       The Y coordinate of the scene rectangle within the larger canvas.
   * @property {number} sceneWidth   The width of the scene.
   * @property {number} sceneHeight  The height of the scene.
   * @property {Rectangle} sceneRect The scene rectangle.
   * @property {number} distance     The number of distance units in a single grid space.
   * @property {number} ratio        The aspect ratio of the scene rectangle.
   * @property {number} maxR               The length of the longest line that can be drawn on the canvas.
   */

  /**
   * Get the Canvas dimensions which would be used to display this Scene.
   * Apply padding to enlarge the playable space and round to the nearest 2x grid size to ensure symmetry.
   * The rounding accomplishes that the padding buffer around the map always contains whole grid spaces.
   * @returns {SceneDimensions}
   */
  getDimensions() {

    // Get Scene data
    const grid = this.grid;
    const size = grid.size || 100;
    const sceneWidth = this.width || (size * 30);
    const sceneHeight = this.height || (size * 20);

    // Compute the correct grid sizing
    const gridType = grid.type ?? CONST.GRID_TYPES.SQUARE;
    const gridCls = BaseGrid.implementationFor(gridType);
    const gridPadding = gridCls.calculatePadding(gridType, sceneWidth, sceneHeight, grid.size, this.padding, {
      legacy: this.flags.core?.legacyHex
    });
    const {width, height} = gridPadding;
    const sceneX = gridPadding.x - this.background.offsetX;
    const sceneY = gridPadding.y - this.background.offsetY;

    // Define Scene dimensions
    return {
      width, height, size,
      rect: new PIXI.Rectangle(0, 0, width, height),
      sceneX, sceneY, sceneWidth, sceneHeight,
      sceneRect: new PIXI.Rectangle(sceneX, sceneY, sceneWidth, sceneHeight),
      distance: this.grid.distance,
      distancePixels: size / this.grid.distance,
      ratio: sceneWidth / sceneHeight,
      maxR: Math.hypot(width, height)
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickDocumentLink(event) {
    if ( this.journal ) return this.journal._onClickDocumentLink(event);
    return super._onClickDocumentLink(event);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @override */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    // Set a Scene as active if none currently are
    if ( !("active" in data) && !game.scenes.active ) this.updateSource({active: true});

    // Create a base64 thumbnail for the scene
    if ( !("thumb" in data) && canvas.ready && this.background.src ) {
      const t = await this.createThumbnail({img: this.background.src});
      this.updateSource({thumb: t.thumb});
    }

    // Trigger Playlist Updates
    if ( this.active ) return game.playlists._onChangeScene(this, data);

    /**
     * If this was a purely programmatic creation of a Scene, i.e. not via compendium import, then tag the version to
     * avoid potentially marking it as a legacy hex Scene.
     * @deprecated since v10
     */
    if ( !this.getFlag("core", "sourceId") ) this.updateSource({"_stats.coreVersion": game.release.version});
  }

  /* -------------------------------------------- */

  /** @override */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if ( data.active === true ) this._onActivate(true);
  }

  /* -------------------------------------------- */

  /** @override */
  async _preUpdate(data, options, user) {
    await super._preUpdate(data, options, user);
    if ( "thumb" in data ) {
      options.thumb ??= [];
      options.thumb.push(this.id);
    }

    // If the canvas size has changed, translate the placeable objects
    if ( options.autoReposition ) {
      try {
        data = this._repositionObjects(data);
      }
      catch (err) {
        delete data.width;
        delete data.height;
        delete data.padding;
        delete data.background;
        return ui.notifications.error(err.message);
      }
    }

    const audioChange = ("active" in data) || (this.active && ["playlist", "playlistSound"].some(k => k in data));
    if ( audioChange ) return game.playlists._onChangeScene(this, data);
  }

  /* -------------------------------------------- */

  /**
   * Handle repositioning of placed objects when the Scene dimensions change
   * @private
   */
  _repositionObjects(sceneUpdateData) {
    const translationScaleX = "width" in sceneUpdateData ? (sceneUpdateData.width / this.width) : 1;
    const translationScaleY = "height" in sceneUpdateData ? (sceneUpdateData.height / this.height) : 1;
    const averageTranslationScale = (translationScaleX + translationScaleY) / 2;

    // If the padding is larger than before, we need to add to it. If it's smaller, we need to subtract from it.
    const originalDimensions = this.getDimensions();
    const updatedScene = this.clone();
    updatedScene.updateSource(sceneUpdateData);
    const newDimensions = updatedScene.getDimensions();
    const paddingOffsetX = "padding" in sceneUpdateData ? ((newDimensions.width - originalDimensions.width) / 2) : 0;
    const paddingOffsetY = "padding" in sceneUpdateData ? ((newDimensions.height - originalDimensions.height) / 2) : 0;

    // Adjust for the background offset
    const backgroundOffsetX = sceneUpdateData.background?.offsetX !== undefined ? (this.background.offsetX - sceneUpdateData.background.offsetX) : 0;
    const backgroundOffsetY = sceneUpdateData.background?.offsetY !== undefined ? (this.background.offsetY - sceneUpdateData.background.offsetY) : 0;

    // If not gridless and grid size is not already being updated, adjust the grid size, ensuring the minimum
    if ( (this.grid.type !== CONST.GRID_TYPES.GRIDLESS) && (!sceneUpdateData["grid.size"]) ) {
      sceneUpdateData["grid.size"] = Math.round(this.grid.size * averageTranslationScale);
      if ( sceneUpdateData["grid.size"] < 50 ) {
        throw new Error(game.i18n.localize("SCENES.GridSizeError"));
      }
    }

    function adjustPoint(x, y, applyOffset = true) {
      return {
        x: Math.round(x * translationScaleX + (applyOffset ? paddingOffsetX + backgroundOffsetX: 0) ),
        y: Math.round(y * translationScaleY + (applyOffset ? paddingOffsetY + backgroundOffsetY: 0) )
      }
    }

    // Placeables that have just a Position
    for ( let collection of ["tokens", "lights", "sounds", "templates"] ) {
      sceneUpdateData[collection] = this[collection].map(p => {
        const {x, y} = adjustPoint(p.x, p.y);
        return {_id: p.id, x, y};
      });
    }

    // Placeables that have a Position and a Size
    for ( let collection of ["tiles"] ) {
      sceneUpdateData[collection] = this[collection].map(p => {
        const {x, y} = adjustPoint(p.x, p.y);
        const width = Math.round(p.width * translationScaleX);
        const height = Math.round(p.height * translationScaleY);
        return {_id: p.id, x, y, width, height};
      });
    }

    // Notes have both a position and an icon size
    sceneUpdateData["notes"] = this.notes.map(p => {
      const {x, y} = adjustPoint(p.x, p.y);
      const iconSize = Math.max(32, Math.round(p.iconSize * averageTranslationScale));
      return {_id: p.id, x, y, iconSize};
    });

    // Drawings possibly have relative shape points
    sceneUpdateData["drawings"] = this.drawings.map(p => {
      const {x, y} = adjustPoint(p.x, p.y);
      const width = Math.round(p.shape.width * translationScaleX);
      const height = Math.round(p.shape.height * translationScaleY);
      let points = [];
      if ( p.shape.points ) {
        for ( let i = 0; i < p.shape.points.length; i += 2 ) {
          const {x, y} = adjustPoint(p.shape.points[i], p.shape.points[i+1], false);
          points.push(x);
          points.push(y);
        }
      }
      return {_id: p.id, x, y, "shape.width": width, "shape.height": height, "shape.points": points};
    });

    // Walls are two points
    sceneUpdateData["walls"] = this.walls.map(w => {
      const c = w.c;
      const p1 = adjustPoint(c[0], c[1]);
      const p2 = adjustPoint(c[2], c[3]);
      return {_id: w.id, c: [p1.x, p1.y, p2.x, p2.y]};
    });

    return sceneUpdateData;
  }

  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data, options, userId) {
    if ( !("thumb" in data) && (options.thumb ?? []).includes(this.id) ) data.thumb = this.thumb;
    super._onUpdate(data, options, userId);
    const changed = new Set(Object.keys(foundry.utils.flattenObject(data)).filter(k => k !== "_id"));

    // If the Scene became active, go through the full activation procedure
    if ( changed.has("active") ) this._onActivate(data.active);

    // If the Thumbnail was updated, bust the image cache
    if ( changed.has("thumb") && this.thumb ) {
      this.thumb = `${this.thumb.split("?")[0]}?${Date.now()}`;
    }

    // If the scene is already active, maybe re-draw the canvas
    if ( canvas.scene === this ) {
      const redraw = [
        "foreground", "fogOverlay", "width", "height", "padding",                 // Scene Dimensions
        "grid.type", "grid.size", "grid.distance", "grid.units",                  // Grid Configuration
        "drawings", "lights", "sounds", "templates", "tiles", "tokens", "walls",  // Placeable Objects
        "weather"                                                                 // Ambience
      ];
      if ( redraw.some(k => changed.has(k)) || ("background" in data) ) return canvas.draw();
      if ( ["grid.color", "grid.alpha"].some(k => changed.has(k)) ) canvas.grid.grid.draw();

      // Modify vision conditions
      const perceptionAttrs = ["globalLight", "globalLightThreshold", "tokenVision", "fogExploration"];
      if ( perceptionAttrs.some(k => changed.has(k)) ) canvas.perception.initialize();

      // Progress darkness level
      if ( changed.has("darkness") && options.animateDarkness ) {
        return canvas.effects.animateDarkness(data.darkness, {
          duration: typeof options.animateDarkness === "number" ? options.animateDarkness : undefined
        });
      }

      // Initialize the color manager with the new darkness level and/or scene background color
      if ( ["darkness", "backgroundColor", "fogUnexploredColor", "fogExploredColor"].some(k => changed.has(k)) ) {
        canvas.colorManager.initialize();
      }

      // New initial view position
      if ( ["initial.x", "initial.y", "initial.scale", "width", "height"].some(k => changed.has(k)) ) {
        this._viewPosition = {};
        canvas.initializeCanvasPosition();
      }
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _preDelete(options, user) {
    await super._preDelete(options, user);
    if ( this.active ) game.playlists._onChangeScene(this, {active: false});
  }

  /* -------------------------------------------- */

  /** @override */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( canvas.scene?.id === this.id ) canvas.draw(null);
    for ( const token of this.tokens ) {
      token.baseActor?._unregisterDependentScene(this);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle Scene activation workflow if the active state is changed to true
   * @param {boolean} active    Is the scene now active?
   * @protected
   */
  _onActivate(active) {

    // Deactivate other scenes
    for ( let s of game.scenes ) {
      if ( s.active && (s !== this) ) {
        s.updateSource({active: false});
        s._initialize();
      }
    }

    // Update the Canvas display
    if ( canvas.initialized && !active ) return canvas.draw(null);
    return this.view();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _preCreateDescendantDocuments(parent, collection, data, options, userId) {
    super._preCreateDescendantDocuments(parent, collection, data, options, userId);

    // Record layer history for child embedded documents
    if ( (userId === game.userId) && this.isView && (parent === this) && !options.isUndo ) {
      const layer = canvas.getCollectionLayer(collection);
      layer?.storeHistory("create", data);
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _preUpdateDescendantDocuments(parent, collection, changes, options, userId) {
    super._preUpdateDescendantDocuments(parent, collection, changes, options, userId);

    // Record layer history for child embedded documents
    if ( (userId === game.userId) && this.isView && (parent === this) && !options.isUndo ) {
      const documentCollection = this.getEmbeddedCollection(collection);
      const updatedIds = new Set(changes.map(r => r._id));
      const originals = documentCollection.reduce((arr, d) => {
        if ( updatedIds.has(d.id) ) arr.push(d.toJSON());
        return arr;
      }, []);
      const layer = canvas.getCollectionLayer(collection);
      layer?.storeHistory("update", originals);
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _preDeleteDescendantDocuments(parent, collection, ids, options, userId) {
    super._preDeleteDescendantDocuments(parent, collection, ids, options, userId);

    // Record layer history for child embedded documents
    if ( (userId === game.userId) && this.isView && (parent === this) && !options.isUndo ) {
      const documentCollection = this.getEmbeddedCollection(collection);
      const originals = documentCollection.reduce((arr, d) => {
        if ( ids.includes(d.id) ) arr.push(d.toJSON());
        return arr;
      }, []);
      const layer = canvas.getCollectionLayer(collection);
      layer?.storeHistory("delete", originals);
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if ( (parent === this) && documents.some(doc => doc.object?.hasActiveHUD) ) {
      canvas.getCollectionLayer(collection).hud.render();
    }
  }

  /* -------------------------------------------- */
  /*  Importing and Exporting                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  toCompendium(pack, options={}) {
    const data = super.toCompendium(pack, options);
    if ( options.clearState ) delete data.fogReset;
    if ( options.clearSort ) {
      delete data.navigation;
      delete data.navOrder;
    }
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Create a 300px by 100px thumbnail image for this scene background
   * @param {object} [options]      Options which modify thumbnail creation
   * @param {string|null} [options.img]  A background image to use for thumbnail creation, otherwise the current scene
   *                          background is used.
   * @param {number} [options.width]        The desired thumbnail width. Default is 300px
   * @param {number} [options.height]       The desired thumbnail height. Default is 100px;
   * @param {string} [options.format]       Which image format should be used? image/png, image/jpg, or image/webp
   * @param {number} [options.quality]      What compression quality should be used for jpeg or webp, between 0 and 1
   * @returns {Promise<object>}      The created thumbnail data.
   */
  async createThumbnail({img, width=300, height=100, format="image/webp", quality=0.8}={}) {
    if ( game.settings.get("core", "noCanvas") ) throw new Error(game.i18n.localize("SCENES.GenerateThumbNoCanvas"));

    // Create counter-factual scene data
    const newImage = img !== undefined;
    img = img ?? this.background.src;
    const scene = this.clone({"background.src": img});

    // Load required textures to create the thumbnail
    const tiles = this.tiles.filter(t => t.texture.src && !t.hidden).sort((a, b) => a.z - b.z);
    const toLoad = tiles.map(t => t.texture.src);
    if ( img ) toLoad.push(img);
    if ( this.foreground ) toLoad.push(this.foreground);
    await TextureLoader.loader.load(toLoad);

    // Update the cloned image with new background image dimensions
    const backgroundTexture = img ? getTexture(img) : null;
    if ( newImage && backgroundTexture ) {
      scene.updateSource({width: backgroundTexture.width, height: backgroundTexture.height});
    }
    const d = scene.getDimensions();

    // Create a container and add a transparent graphic to enforce the size
    const baseContainer = new PIXI.Container();
    const sceneRectangle = new PIXI.Rectangle(0, 0, d.sceneWidth, d.sceneHeight);
    const baseGraphics = baseContainer.addChild(new PIXI.LegacyGraphics());
    baseGraphics.beginFill(0xFFFFFF, 1.0).drawShape(sceneRectangle).endFill();
    baseGraphics.zIndex = -1;
    baseContainer.mask = baseGraphics;
    baseContainer.sortableChildren = true;

    // Simulate the way a TileMesh is drawn
    const drawTile = async tile => {
      const tex = getTexture(tile.texture.src);
      if ( !tex ) return;
      const s = new PIXI.Sprite(tex);
      const {x, y, rotation, width, height} = tile;
      const {scaleX, scaleY, tint} = tile.texture;
      s.anchor.set(0.5, 0.5);
      s.width = Math.abs(width);
      s.height = Math.abs(height);
      s.scale.x *= scaleX;
      s.scale.y *= scaleY;
      s.tint = Color.from(tint ?? 0xFFFFFF);
      s.position.set(x + (width/2) - d.sceneRect.x, y + (height/2) - d.sceneRect.y);
      s.angle = rotation;
      s.zIndex = tile.elevation;
      return s;
    };

    // Background container
    if ( backgroundTexture ) {
      const bg = new PIXI.Sprite(backgroundTexture);
      bg.width = d.sceneWidth;
      bg.height = d.sceneHeight;
      bg.zIndex = 0;
      baseContainer.addChild(bg);
    }

    // Foreground container
    if ( this.foreground ) {
      const fgTex = getTexture(this.foreground);
      const fg = new PIXI.Sprite(fgTex);
      fg.width = d.sceneWidth;
      fg.height = d.sceneHeight;
      fg.zIndex = scene.foregroundElevation;
      baseContainer.addChild(fg);
    }

    // Tiles
    for ( let t of tiles ) {
      const sprite = await drawTile(t);
      if ( sprite ) baseContainer.addChild(sprite);
    }

    // Render the container to a thumbnail
    const stage = new PIXI.Container();
    stage.addChild(baseContainer);
    return ImageHelper.createThumbnail(stage, {width, height, format, quality});
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  static getDimensions(data) {
    throw new Error("The Scene.getDimensions static method is deprecated in favor of the Scene#getDimensions "
      + "instance method");
  }
}
