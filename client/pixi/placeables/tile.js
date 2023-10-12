/**
 * A Tile is an implementation of PlaceableObject which represents a static piece of artwork or prop within the Scene.
 * Tiles are drawn inside the {@link TilesLayer} container.
 * @category - Canvas
 *
 * @see {@link TileDocument}
 * @see {@link TilesLayer}
 */
class Tile extends PlaceableObject {

  /* -------------------------------------------- */
  /*  Attributes                                  */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static embeddedName = "Tile";

  /** @override */
  static RENDER_FLAGS = {
    redraw: {propagate: ["refresh"]},
    refresh: {propagate: ["refreshState", "refreshShape", "refreshElevation", "refreshVideo"],
      alias: true},
    refreshState: {propagate: ["refreshFrame"]},
    refreshShape: {propagate: ["refreshMesh", "refreshPerception", "refreshFrame"]},
    refreshMesh: {},
    refreshFrame: {},
    refreshElevation: {propagate: ["refreshMesh"]},
    refreshPerception: {},
    refreshVideo: {},
  };

  /**
   * The Tile border frame
   * @extends {PIXI.Container}
   * @property {PIXI.Graphics} border
   * @property {ResizeHandle} handle
   */
  frame;

  /**
   * The primary tile image texture
   * @type {PIXI.Texture}
   */
  texture;

  /**
   * The Tile image sprite
   * @type {PIXI.Sprite}
   */
  tile;

  /**
   * A Tile background which is displayed if no valid image texture is present
   * @type {PIXI.Graphics}
   */
  bg;

  /**
   * A flag which tracks if the Tile is currently playing
   * @type {boolean}
   */
  playing = false;

  /**
   * The true computed bounds of the Tile.
   * These true bounds are padded when the Tile is controlled to assist with interaction.
   * @type {PIXI.Rectangle}
   */
  #bounds;

  /**
   * A flag to capture whether this Tile has an unlinked video texture
   * @type {boolean}
   */
  #unlinkedVideo = false;

  /**
   * Video options passed by the HUD
   * @type {object}
   */
  #hudVideoOptions = {
    playVideo: undefined,
    offset: undefined
  };

  /**
   * Keep track the roof state so that we know when it has changed.
   * @type {boolean}
   */
  #wasRoof = this.isRoof;

  /* -------------------------------------------- */

  /**
   * Get the native aspect ratio of the base texture for the Tile sprite
   * @type {number}
   */
  get aspectRatio() {
    if ( !this.texture ) return 1;
    let tex = this.texture.baseTexture;
    return (tex.width / tex.height);
  }

  /* -------------------------------------------- */

  /** @override */
  get bounds() {
    let {x, y, width, height, texture, rotation} = this.document;

    // Adjust top left coordinate and dimensions according to scale
    if ( texture.scaleX !== 1 ) {
      const w0 = width;
      width *= Math.abs(texture.scaleX);
      x += (w0 - width) / 2;
    }
    if ( texture.scaleY !== 1 ) {
      const h0 = height;
      height *= Math.abs(texture.scaleY);
      y += (h0 - height) / 2;
    }

    // If the tile is rotated, return recomputed bounds according to rotation
    if ( rotation !== 0 ) return PIXI.Rectangle.fromRotation(x, y, width, height, Math.toRadians(rotation)).normalize();

    // Normal case
    return new PIXI.Rectangle(x, y, width, height).normalize();
  }

  /* -------------------------------------------- */

  /**
   * The HTML source element for the primary Tile texture
   * @type {HTMLImageElement|HTMLVideoElement}
   */
  get sourceElement() {
    return this.texture?.baseTexture.resource.source;
  }

  /* -------------------------------------------- */

  /**
   * Does this Tile depict an animated video texture?
   * @type {boolean}
   */
  get isVideo() {
    const source = this.sourceElement;
    return source?.tagName === "VIDEO";
  }

  /* -------------------------------------------- */

  /**
   * Is this tile a roof?
   * @returns {boolean}
   */
  get isRoof() {
    return this.document.overhead && this.document.roof;
  }

  /* -------------------------------------------- */

  /**
   * Is this tile occluded?
   * @returns {boolean}
   */
  get occluded() {
    return this.mesh?.occluded ?? false;
  }

  /* -------------------------------------------- */

  /**
   * The effective volume at which this Tile should be playing, including the global ambient volume modifier
   * @type {number}
   */
  get volume() {
    return this.data.video.volume * game.settings.get("core", "globalAmbientVolume");
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * Debounce assignment of the Tile occluded state to avoid cases like animated token movement which can rapidly
   */
  debounceSetOcclusion = occluded => this.mesh?.debounceOcclusion(occluded);

  /* -------------------------------------------- */

  /**
   * Create a preview tile with a background texture instead of an image
   * @param {object} data     Initial data with which to create the preview Tile
   * @returns {PlaceableObject}
   */
  static createPreview(data) {
    data.width = data.height = 1;
    data.overhead = data.overhead ?? ui.controls.control.foreground ?? false;

    // Create a pending TileDocument
    const cls = getDocumentClass("Tile");
    const doc = new cls(data, {parent: canvas.scene});

    // Render the preview Tile object
    const tile = doc.object;
    tile.control({releaseOthers: false});
    tile.draw().then(() => {  // Swap the z-order of the tile and the frame
      tile.removeChild(tile.frame);
      tile.addChild(tile.frame);
    });
    return tile;
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw(options={}) {

    // Load Tile texture
    let texture;
    if ( this._original ) texture = this._original.texture?.clone();
    else if ( this.document.texture.src ) {
      texture = await loadTexture(this.document.texture.src, {fallback: "icons/svg/hazard.svg"});
    }

    // Manage video playback and clone texture for unlinked video
    let video = game.video.getVideoSource(texture);
    this.#unlinkedVideo = !!video && !this._original;
    if ( this.#unlinkedVideo ) {
      texture = await game.video.cloneTexture(video);
      video = game.video.getVideoSource(texture);
      if ( (this.document.getFlag("core", "randomizeVideo") !== false) && Number.isFinite(video.duration) ) {
        video.currentTime = Math.random() * video.duration;
      }
    }
    if ( !video ) this.#hudVideoOptions.playVideo = undefined;
    this.#hudVideoOptions.offset = undefined;
    this.texture = texture;

    // Draw the Token mesh
    if ( this.texture ) {
      this.mesh = canvas.primary.addTile(this);
      this.bg = undefined;
    }

    // Draw a placeholder background
    else {
      canvas.primary.removeTile(this);
      this.texture = this.mesh = null;
      this.bg = this.addChild(new PIXI.Graphics());
    }

    // Create the outer frame for the border and interaction handles
    this.frame = this.addChild(new PIXI.Container());
    this.frame.border = this.frame.addChild(new PIXI.Graphics());
    this.frame.handle = this.frame.addChild(new ResizeHandle([1, 1]));

    // Interactivity
    this.cursor = "pointer";
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  clear(options) {
    if ( this.#unlinkedVideo ) this.texture?.baseTexture?.destroy(); // Base texture destroyed for non preview video
    this.#unlinkedVideo = false;
    super.clear(options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _destroy(options) {
    canvas.primary.removeTile(this);
    if ( this.texture ) {
      if ( this.#unlinkedVideo ) this.texture?.baseTexture?.destroy(); // Base texture destroyed for non preview video
      this.texture = undefined;
      this.#unlinkedVideo = false;
    }
    canvas.perception.update({
      refreshTiles: true,
      identifyInteriorWalls: (this.isRoof || this.#wasRoof) && !this.isPreview
    });
  }

  /* -------------------------------------------- */
  /*  Incremental Refresh                         */
  /* -------------------------------------------- */

  /** @override */
  _applyRenderFlags(flags) {
    if ( flags.refreshShape ) this.#refreshShape();
    if ( flags.refreshFrame ) this.#refreshFrame();
    if ( flags.refreshElevation ) this.#refreshElevation();
    if ( flags.refreshVideo ) this.#refreshVideo();
    if ( flags.refreshState ) this.#refreshState();
    if ( flags.refreshMesh ) this.#refreshMesh();
    if ( flags.refreshPerception ) this.#refreshPerception();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the Primary Canvas Object associated with this tile.
   */
  #refreshMesh() {
    if ( !this.mesh ) return;
    this.mesh.initialize(this.document);
    this.mesh.alpha = Math.min(this.mesh.alpha, this.alpha);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the displayed state of the Tile.
   * Updated when the tile interaction state changes, when it is hidden, or when it changes overhead state.
   */
  #refreshState() {
    const {hidden, locked} = this.document;
    this.visible = !hidden || game.user.isGM;
    this.alpha = this._getTargetAlpha();
    this.frame.border.visible = this.controlled || this.hover || this.layer.highlightObjects;
    this.frame.handle.visible = this.controlled && !locked;
    this.mesh?.initialize({hidden});
  }

  /* -------------------------------------------- */

  /**
   * Refresh the displayed shape and bounds of the Tile.
   * Called when the tile location, size, rotation, or other visible attributes are modified.
   */
  #refreshShape() {
    const {x, y, width, height, rotation} = this.document;

    // Compute true bounds
    const aw = Math.abs(width);
    const ah = Math.abs(height);
    const r = Math.toRadians(rotation);
    this.#bounds = (aw === ah)
      ? new PIXI.Rectangle(0, 0, aw, ah)                // Square tiles
      : PIXI.Rectangle.fromRotation(0, 0, aw, ah, r);   // Non-square tiles
    this.#bounds.normalize();

    // TODO: Temporary FIX for the quadtree (The HitArea need a local bound => w and h, while the quadtree need global bounds)
    // TODO: We need an easy way to get local and global bounds for every placeable object
    const globalBounds = new PIXI.Rectangle(x, y, aw + x, ah + y);

    // Set position
    this.position.set(x, y);

    // Refresh hit area
    this.hitArea = this.#bounds.clone().pad(20);

    // Refresh temporary background
    if ( !this.mesh && this.bg ) this.bg.clear().beginFill(0xFFFFFF, 0.5).drawRect(0, 0, aw, ah).endFill();
  }

  /* -------------------------------------------- */

  /**
   * Update sorting of this Tile relative to other PrimaryCanvasGroup siblings.
   * Called when the elevation or sort order for the Tile changes.
   */
  #refreshElevation() {
    this.zIndex = this.document.sort;
    this.parent.sortDirty = true;
  }

  /* -------------------------------------------- */

  /**
   * Update interior wall states.
   * Refresh lighting and vision to reflect changes in overhead tiles.
   */
  #refreshPerception() {
    const wasRoof = this.#wasRoof;
    const isRoof = this.#wasRoof = this.isRoof;
    canvas.perception.update({
      refreshTiles: true,
      identifyInteriorWalls: (isRoof || wasRoof) && !this.isPreview
    });
  }

  /* -------------------------------------------- */

  /**
   * Refresh the border frame that encloses the Tile.
   */
  #refreshFrame() {
    const border = this.frame.border;
    const b = this.#bounds;

    // Determine border color
    const colors = CONFIG.Canvas.dispositionColors;
    let bc = colors.INACTIVE;
    if ( this.controlled ) {
      bc = this.document.locked ? colors.HOSTILE : colors.CONTROLLED;
    }

    // Draw the tile border
    const t = CONFIG.Canvas.objectBorderThickness;
    const h = Math.round(t / 2);
    const o = Math.round(h / 2);
    border.clear()
      .lineStyle(t, 0x000000, 1.0).drawRoundedRect(b.x - o, b.y - o, b.width + h, b.height + h, 3)
      .lineStyle(h, bc, 1.0).drawRoundedRect(b.x - o, b.y - o, b.width + h, b.height + h, 3);

    // Refresh drag handle
    this._refreshHandle();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of the Tile resizing handle.
   * Shift the position of the drag handle from the bottom-right (default) depending on which way we are dragging.
   * @protected
   */
  _refreshHandle() {
    let b = this.#bounds.clone();
    if ( this._dragHandle ) {
      const {scaleX, scaleY} = this.document.texture;
      if ( Math.sign(scaleX) === Math.sign(this._dragScaleX) ) b.width = b.x;
      if ( Math.sign(scaleY) === Math.sign(this._dragScaleY) ) b.height = b.y;
    }
    this.frame.handle.refresh(b);
  }

  /* -------------------------------------------- */

  /**
   * Refresh changes to the video playback state.
   */
  #refreshVideo() {
    if ( !this.texture || !this.#unlinkedVideo ) return;
    const video = game.video.getVideoSource(this.texture);
    if ( !video ) return;
    const playOptions = {...this.document.video};
    playOptions.playing = this.playing = (this.#hudVideoOptions.playVideo ?? playOptions.autoplay);
    playOptions.offset = this.#hudVideoOptions.offset;
    this.#hudVideoOptions.offset = undefined;
    game.video.play(video, playOptions);

    // Refresh HUD if necessary
    if ( this.layer.hud.object === this ) this.layer.hud.render();
  }

  /* -------------------------------------------- */
  /*  Document Event Handlers                     */
  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data, options, userId) {
    super._onUpdate(data, options, userId);

    if ( this.layer.hud.object === this ) this.layer.hud.render();

    // Video options from the HUD
    this.#hudVideoOptions.playVideo = options.playVideo;
    this.#hudVideoOptions.offset = options.offset;

    const keys = Object.keys(foundry.utils.flattenObject(data));
    const changed = new Set(keys);

    // Full re-draw
    if ( changed.has("texture.src") ) return this.renderFlags.set({redraw: true});

    // Incremental Refresh
    const shapeChange = ["width", "height", "texture.scaleX", "texture.scaleY"].some(k => changed.has(k));
    const positionChange = ["x", "y", "rotation"].some(k => changed.has(k));
    const overheadChange = ["overhead", "roof", "z"].some(k => changed.has(k));
    this.renderFlags.set({
      refreshState: ["hidden", "locked"].some(k => changed.has(k)),
      refreshShape: positionChange || shapeChange,
      refreshMesh: ("texture" in data) || ("alpha" in data) || overheadChange || ("occlusion" in data),
      refreshElevation: overheadChange,
      refreshPerception: overheadChange || changed.has("occlusion.mode") || changed.has("hidden"),
      refreshVideo: ("video" in data) || ("playVideo" in options) || ("offset" in options)
    });
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners() {
    super.activateListeners();
    this.frame.handle.off("pointerover").off("pointerout").off("pointerdown")
      .on("pointerover", this._onHandleHoverIn.bind(this))
      .on("pointerout", this._onHandleHoverOut.bind(this))
      .on("pointerdown", this._onHandleMouseDown.bind(this));
    this.frame.handle.eventMode = "static";
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _canConfigure(user, event) {
    if ( this.document.locked && !this.controlled ) return false;
    return super._canConfigure(user);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickLeft(event) {
    if ( this._dragHandle ) return event.stopPropagation();
    return super._onClickLeft(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickLeft2(event) {
    this._dragHandle = false;
    return super._onClickLeft2(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftStart(event) {
    if ( this._dragHandle ) return this._onHandleDragStart(event);
    return super._onDragLeftStart(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftMove(event) {
    if ( this._dragHandle ) return this._onHandleDragMove(event);
    if ( this._dragPassthrough ) return canvas._onDragLeftMove(event);
    const {clones, destination, origin} = event.interactionData;
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    for ( let c of clones || [] ) {
      c.document.x = c._original.document.x + dx;
      c.document.y = c._original.document.y + dy;
      c.mesh?.setPosition();
    }
    return super._onDragLeftMove(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onDragLeftDrop(event) {
    if ( this._dragHandle ) return await this._onHandleDragDrop(event);
    return await super._onDragLeftDrop(event);
  }

  /* -------------------------------------------- */
  /*  Resize Handling                             */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftCancel(event) {
    if ( this._dragHandle ) return this._onHandleDragCancel(event);
    return super._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-over event on a control handle
   * @param {PIXI.FederatedEvent} event   The mouseover event
   * @protected
   */
  _onHandleHoverIn(event) {
    const handle = event.target;
    handle?.scale.set(1.5, 1.5);
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-out event on a control handle
   * @param {PIXI.FederatedEvent} event   The mouseout event
   * @protected
   */
  _onHandleHoverOut(event) {
    const handle = event.target;
    handle?.scale.set(1.0, 1.0);
  }

  /* -------------------------------------------- */

  /**
   * When clicking the resize handle, initialize the handle properties.
   * @param {PIXI.FederatedEvent} event   The mousedown event
   * @protected
   */
  _onHandleMouseDown(event) {
    if ( !this.document.locked ) {
      this._dragHandle = true;
      this._dragScaleX = this.document.texture.scaleX * -1;
      this._dragScaleY = this.document.texture.scaleY * -1;
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle the beginning of a drag event on a resize handle.
   * @param {PIXI.FederatedEvent} event   The mousedown event
   * @protected
   */
  _onHandleDragStart(event) {
    const handle = this.frame.handle;
    const aw = this.document.width;
    const ah = this.document.height;
    const x0 = this.document.x + (handle.offset[0] * aw);
    const y0 = this.document.y + (handle.offset[1] * ah);
    event.interactionData.origin = {x: x0, y: y0, width: aw, height: ah};
  }

  /* -------------------------------------------- */

  /**
   * Handle mousemove while dragging a tile scale handler
   * @param {PIXI.FederatedEvent} event   The mousemove event
   * @protected
   */
  _onHandleDragMove(event) {
    canvas._onDragCanvasPan(event);
    const d = this.#getResizedDimensions(event);
    this.document.x = d.x;
    this.document.y = d.y;
    this.document.width = d.width;
    this.document.height = d.height;
    this.document.rotation = 0;

    // Mirror horizontally or vertically
    this.document.texture.scaleX = d.sx;
    this.document.texture.scaleY = d.sy;
    this.renderFlags.set({refreshShape: true});
  }

  /* -------------------------------------------- */

  /**
   * Handle mouseup after dragging a tile scale handler
   * @param {PIXI.FederatedEvent} event   The mouseup event
   * @protected
   */
  _onHandleDragDrop(event) {
    event.interactionData.resetDocument = false;
    if ( !event.shiftKey ) {
      const destination = event.interactionData.destination;
      event.interactionData.destination =
        canvas.grid.getSnappedPosition(destination.x, destination.y, this.layer.gridPrecision);
    }
    const d = this.#getResizedDimensions(event);
    return this.document.update({
      x: d.x, y: d.y, width: d.width, height: d.height, "texture.scaleX": d.sx, "texture.scaleY": d.sy
    });
  }

  /* -------------------------------------------- */

  /**
   * Get resized Tile dimensions
   * @param {PIXI.FederatedEvent} event
   * @returns {Rectangle}
   */
  #getResizedDimensions(event) {
    const o = this.document._source;
    const {origin, destination} = event.interactionData;

    // Identify the new width and height as positive dimensions
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    let w = Math.abs(o.width) + dx;
    let h = Math.abs(o.height) + dy;

    // Constrain the aspect ratio using the ALT key
    if ( event.altKey && this.texture?.valid ) {
      const ar = this.texture.width / this.texture.height;
      if ( Math.abs(w) > Math.abs(h) ) h = w / ar;
      else w = h * ar;
    }
    const nr = new PIXI.Rectangle(o.x, o.y, w, h).normalize();

    // Comparing destination coord and source coord to apply mirroring and append to nr
    nr.sx = (Math.sign(destination.x - o.x) || 1) * o.texture.scaleX;
    nr.sy = (Math.sign(destination.y - o.y) || 1) * o.texture.scaleY;
    return nr;
  }

  /* -------------------------------------------- */

  /**
   * Handle cancellation of a drag event for one of the resizing handles
   * @param {PIXI.FederatedEvent} event   The mouseup event
   * @protected
   */
  _onHandleDragCancel(event) {
    this._dragHandle = false;
    if ( event.interactionData.resetDocument !== false ) {
      this.document.reset();
      this.renderFlags.set({refreshShape: true});
    }
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  // eslint-disable-next-line no-dupe-class-members
  get tile() {
    foundry.utils.logCompatibilityWarning("Tile#tile has been renamed to Tile#mesh.", {since: 10, until: 12});
    return this.mesh;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  testOcclusion(...args) {
    const msg = "Tile#testOcclusion has been deprecated in favor of PrimaryCanvasObject#testOcclusion"
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
    return this.mesh?.testOcclusion(...args) ?? false;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  containsPixel(...args) {
    const msg = "Tile#containsPixel has been deprecated in favor of PrimaryCanvasObject#containsPixel"
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
    return this.mesh?.containsPixel(...args) ?? false;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  getPixelAlpha(...args) {
    const msg = "Tile#getPixelAlpha has been deprecated in favor of PrimaryCanvasObject#getPixelAlpha"
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
    return this.mesh?.getPixelAlpha(...args) ?? null;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  _getAlphaBounds() {
    const msg = "Tile#_getAlphaBounds has been deprecated in favor of PrimaryCanvasObject#_getAlphaBounds"
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
    return this.mesh?._getAlphaBounds();
  }
}
