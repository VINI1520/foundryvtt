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

  /**
   * Roof types
   * @enum {number}
   */
  static ROOF_TYPES = {
    OCCLUSION: 0,
    BACKGROUND: 1,
    ILLUMINATION: 2,
    COLORATION: 3
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
   * Contains :
   * - the bounds of the tile data
   * - the cached mapping of non-transparent pixels (if roof)
   * - the filtered render texture (if roof)
   * @type {{minX: number, minY: number, maxX: number, maxY: number, pixels: Uint8Array, texture: PIXI.RenderTexture}}
   * @private
   */
  _textureData;

  /**
   * A map of all linked sprite(s) to this tile
   * @type {Map<number,PIXI.Sprite>}
   * @private
   */
  _linkedSprites = new Map();

  /**
   * A flag which tracks whether the overhead tile is currently in an occluded state
   * @type {boolean}
   */
  occluded = false;

  /**
   * A flag which tracks occluded state change for roof
   * @type {boolean}
   */
  _prevOccludedState = false;

  /**
   * A flag which tracks if the Tile is currently playing
   * @type {boolean}
   */
  playing = this.document.video.autoplay;

  /**
   * A flag to capture whether this Tile has an unlinked video texture
   * @type {boolean}
   */
  #unlinkedVideo = false;

  /**
   * Debounce assignment of the Tile occluded state to avoid cases like animated token movement which can rapidly
   * change Tile appearance.
   * Uses a 100ms debounce threshold.
   * @type {function(occluded: boolean): void}
   */
  debounceSetOcclusion = foundry.utils.debounce(occluded => {
    this.occluded = occluded;
    this.#refreshOcclusion();
    // This hook is called here redundantly as a special case to allow modules to react when rendered occlusion changes
    Hooks.callAll("refreshTile", this);
  }, 50);

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
  async _draw() {
    let texture = null;

    // Copy tile texture from its original
    if ( this.isPreview ) texture = this._original.texture?.clone();

    // Load tile texture
    else if ( this.document.texture.src ) {
      texture = await loadTexture(this.document.texture.src, {fallback: "icons/svg/hazard.svg"});

      // Manage video playback
      let video = game.video.getVideoSource(texture);
      this.#unlinkedVideo = video && !this._original;
      if ( video ) {
        const playOptions = foundry.utils.deepClone(this.document.video);
        playOptions.playing = this.playing;
        if ( this.#unlinkedVideo ) {  // Unlink video playback
          texture = await game.video.cloneTexture(video);
          video = game.video.getVideoSource(texture);
          if ( playOptions.autoplay ) playOptions.offset = Math.random() * video.duration;
        }
        game.video.play(video, playOptions);
      }
    }
    this.texture = texture;

    // Draw the Token mesh
    if ( this.texture ) {
      this.mesh = canvas.primary.addTile(this);
      this.mesh.setShaderClass(InverseOcclusionSamplerShader);
      this.mesh.shader.enabled = false;
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

    // Refresh perception
    this._refreshPerception();

    // The following options do not apply to preview tiles
    if ( this.id && this.parent ) {
      // Special preparation for overhead tiles
      if ( this.document.overhead && this.mesh ) {
        this._createTextureData();
        this.mesh.shader.enabled = true;
      }
      // Special preparation for background tiles
      else if ( this.mesh ) {
        this.mesh.shader.enabled = false;
      }
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _destroy(options) {
    canvas.primary.removeTile(this);
    // Handling disposal of an hypothetical texture
    if ( !this.texture ) return;
    this.texture.destroy(this.#unlinkedVideo); // Base texture destroyed for non preview video
    this.texture = undefined;
    this.#unlinkedVideo = false;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the appearance of the occlusion state for tiles which are affected by a Token beneath them.
   * @private
   */
  #refreshOcclusion() {
    if ( !this.mesh ) return;
    const {alpha, elevation, hidden, occlusion, overhead} = this.document;
    this.mesh.shader.enabled = true;
    const alphaOverhead = canvas.tiles.displayRoofs ? alpha : 0.5;
    const alphaNormal = hidden ? 0.25 : (overhead ? alphaOverhead : alpha);
    const alphaOccluded = this.occluded ? occlusion.alpha : 1.0;

    // Tracking if roof has an occlusion state change to initialize vision
    if ( this._prevOccludedState !== this.occluded ) {
      canvas.perception.update({initializeVision: true}, true);
      this._prevOccludedState = this.occluded;
    }

    // Other modes
    const mode = occlusion.mode;
    const modes = CONST.TILE_OCCLUSION_MODES;
    switch ( mode ) {

      // Tile Always Visible
      case modes.NONE:
        this.mesh.shader.enabled = false;
        this.mesh.alpha = alphaNormal;
        break;

      // Fade Entire Tile
      case modes.FADE:
        this.mesh.shader.enabled = false;
        this.mesh.alpha = Math.min(alphaNormal, alphaOccluded);
        break;

      // Radial Occlusion
      case modes.RADIAL:
        this.mesh.shader.enabled = this.occluded && !hidden;
        this.mesh.shader.uniforms.alpha = alphaNormal;
        this.mesh.shader.uniforms.alphaOcclusion = alphaOccluded;
        this.mesh.shader.uniforms.depthElevation = canvas.primary.mapElevationAlpha(elevation);
        this.mesh.alpha = this.occluded ? 1.0 : alphaNormal;
        break;

      // Vision-Based Occlusion
      case modes.VISION:
        const visionEnabled = !hidden && (canvas.effects.visionSources.size > 0);
        this.mesh.shader.enabled = visionEnabled;
        this.mesh.shader.uniforms.alpha = alphaNormal;
        this.mesh.shader.uniforms.alphaOcclusion = occlusion.alpha;
        this.mesh.shader.uniforms.depthElevation = canvas.primary.mapElevationAlpha(elevation);
        this.mesh.alpha = this.occluded ? (visionEnabled ? 1.0 : alphaOccluded) : alphaNormal;
        break;
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _refresh(options) {
    const aw = Math.abs(this.document.width);
    const ah = Math.abs(this.document.height);
    const r = Math.toRadians(this.document.rotation);

    // Update tile appearance
    this.position.set(this.document.x, this.document.y);

    // Refresh the Tile mesh
    if ( this.mesh ) this.mesh.refresh();

    // Refresh temporary background
    else if ( this.bg ) this.bg.clear().beginFill(0xFFFFFF, 0.5).drawRect(0, 0, aw, ah).endFill();

    // Refresh occlusion appearance
    if ( this.mesh ) {
      this.#refreshOcclusion();
    }

    // Define bounds and update the border frame
    let bounds = (aw === ah) ? new PIXI.Rectangle(0, 0, aw, ah) // Square tiles
      : PIXI.Rectangle.fromRotation(0, 0, aw, ah, r);           // Non-square tiles
    bounds.normalize();
    this.hitArea = this.controlled ? bounds.clone().pad(20) : bounds;
    if ( this.frame ) {
      const {scaleX, scaleY} = this.document.texture;
      this._refreshBorder(bounds);
      this._refreshHandle(bounds, {scaleX, scaleY});
    }

    // Set visibility
    this.visible = !this.document.hidden || game.user.isGM;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of the Tile border
   * @param {PIXI.Rectangle} b      The bounds.
   * @private
   */
  _refreshBorder(b) {
    const border = this.frame.border;

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
    border.visible = this.hover || this.controlled;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Refresh the display of the Tile resizing handle.
   * @param {PIXI.Rectangle} b         The bounds.
   * @param {object} [options]
   * @param {number} [options.scaleX]
   * @param {number} [options.scaleY]
   * @protected
   */
  _refreshHandle(b, {scaleX=1, scaleY=1}={}) {
    if ( this._dragHandle ) {
      // When resizing
      if ( Math.sign(scaleX) === Math.sign(this._dragScaleX) ) b.width = b.x;
      if ( Math.sign(scaleY) === Math.sign(this._dragScaleY) ) b.height = b.y;
    }
    this.frame.handle.refresh(b);
    this.frame.handle.visible = this.controlled && !this.document.locked;
  }

  /* -------------------------------------------- */

  /**
   * Test whether a specific Token occludes this overhead tile.
   * Occlusion is tested against 9 points, the center, the four corners-, and the four cardinal directions
   * @param {Token} token       The Token to test
   * @param {object} [options]  Additional options that affect testing
   * @param {boolean} [options.corners=true]  Test corners of the hit-box in addition to the token center?
   * @returns {boolean}         Is the Token occluded by the Tile?
   */
  testOcclusion(token, {corners=true}={}) {
    const {elevation, occlusion} = this.document;
    if ( occlusion.mode === CONST.TILE_OCCLUSION_MODES.NONE ) return false;
    if ( token.document.elevation >= elevation ) return false;
    const {x, y, w, h} = token;
    let testPoints = [[w / 2, h / 2]];
    if ( corners ) {
      const pad = 2;
      const cornerPoints = [
        [pad, pad],
        [w / 2, pad],
        [w - pad, pad],
        [w - pad, h / 2],
        [w - pad, h - pad],
        [w / 2, h - pad],
        [pad, h - pad],
        [pad, h / 2]
      ];
      testPoints = testPoints.concat(cornerPoints);
    }
    for ( const [tx, ty] of testPoints ) {
      if ( this.containsPixel(x + tx, y + ty) ) return true;
    }
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Test whether the Tile pixel data contains a specific point in canvas space
   * @param {number} x
   * @param {number} y
   * @param {number} alphaThreshold     Value from which the pixel is taken into account, in the range [0, 1].
   * @returns {boolean}
   */
  containsPixel(x, y, alphaThreshold = 0.75) {
    return this.getPixelAlpha(x, y) > (alphaThreshold * 255);
  }

  /* -------------------------------------------- */

  /**
   * Get alpha value at specific canvas coordinate.
   * @param {number} x
   * @param {number} y
   * @returns {number|null}    The alpha value (-1 if outside of the bounds) or null if no mesh or texture is present.
   */
  getPixelAlpha(x, y) {
    if ( !this._textureData?.pixels || !this.mesh ) return null;
    const textureCoord = this.#getTextureCoordinate(x, y);
    return this.#getPixelAlpha(textureCoord.x, textureCoord.y);
  }

  /* -------------------------------------------- */

  /**
   * Get tile alpha map texture coordinate with canvas coordinate
   * @param {number} testX               Canvas x coordinate.
   * @param {number} testY               Canvas y coordinate.
   * @returns {object}          The texture {x, y} coordinates, or null if not able to do the conversion.
   */
  #getTextureCoordinate(testX, testY) {
    const {x, y, width, height, rotation, texture} = this.document;
    const mesh = this.mesh;

    // Save scale properties
    const sscX = Math.sign(texture.scaleX);
    const sscY = Math.sign(texture.scaleY);
    const ascX = Math.abs(texture.scaleX);
    const ascY = Math.abs(texture.scaleY);

    // Adjusting point by taking scale into account
    testX -= (x - ((width / 2) * sscX * (ascX - 1)));
    testY -= (y - ((height / 2) * sscY * (ascY - 1)));

    // Mirroring the point on x/y axis if scale is negative
    if ( sscX < 0 ) testX = (width - testX);
    if ( sscY < 0 ) testY = (height - testY);

    // Account for tile rotation and scale
    if ( rotation !== 0 ) {
      // Anchor is recomputed with scale and document dimensions
      const anchor = {
        x: mesh.anchor.x * width * ascX,
        y: mesh.anchor.y * height * ascY
      };
      let r = new Ray(anchor, {x: testX, y: testY});
      r = r.shiftAngle(-mesh.rotation * sscX * sscY); // Reverse rotation if scale is negative for just one axis
      testX = r.B.x;
      testY = r.B.y;
    }

    // Convert to texture data coordinates
    testX *= (this._textureData.aw / mesh.width);
    testY *= (this._textureData.ah / mesh.height);

    return {x: testX, y: testY};
  }

  /* -------------------------------------------- */

  /**
   * Get alpha value at specific texture coordinate.
   * @param {number} x
   * @param {number} y
   * @returns {number}   The alpha value (or -1 if outside of the bounds).
   */
  #getPixelAlpha(x, y) {
    // First test against the bounding box
    if ( (x < this._textureData.minX) || (x >= this._textureData.maxX) ) return -1;
    if ( (y < this._textureData.minY) || (y >= this._textureData.maxY) ) return -1;

    // Next test a specific pixel
    const px = (Math.floor(y) * Math.roundFast(Math.abs(this._textureData.aw))) + Math.floor(x);
    return this._textureData.pixels[px];
  }

  /* -------------------------------------------- */

  /**
   * Process the tile texture :
   * Use the texture to create a cached mapping of pixel alpha for this Tile with real base texture size.
   * Cache the bounding box of non-transparent pixels for the un-rotated shape.
   * @returns {{minX: number, minY: number, maxX: number, maxY: number, pixels: Uint8Array|undefined}}
   * @private
   */
  _createTextureData() {
    const aw = Math.abs(this.document.width);
    const ah = Math.abs(this.document.height);

    // If no tile texture is present or if non overhead tile.
    if ( !this.texture || this.document.overhead === false ) {
      return this._textureData = {minX: 0, minY: 0, maxX: aw, maxY: ah};
    }

    // If texture date exists for this texture, we return it
    this._textureData = canvas.tiles.textureDataMap.get(this.document.texture.src);
    if ( this._textureData ) return this._textureData;
    else this._textureData = {
      pixels: undefined,
      minX: undefined,
      maxX: undefined,
      minY: undefined,
      maxY: undefined
    };
    // Else, we are preparing the texture data creation
    const map = this._textureData;

    // Create a temporary Sprite using the Tile texture
    const sprite = new PIXI.Sprite(this.texture);
    sprite.width = map.aw = this.texture.baseTexture.realWidth / 4;
    sprite.height = map.ah = this.texture.baseTexture.realHeight / 4;
    sprite.anchor.set(0.5, 0.5);
    sprite.position.set(map.aw / 2, map.ah / 2);

    // Create or update the alphaMap render texture
    const tex = PIXI.RenderTexture.create({width: map.aw, height: map.ah});

    // Render the sprite to the texture and extract its pixels
    // Destroy sprite and texture when they are no longer needed
    canvas.app.renderer.render(sprite, tex);
    sprite.destroy(false);
    const pixels = map.pixels = canvas.app.renderer.extract.pixels(tex);
    tex.destroy(true);

    // Map the alpha pixels
    for ( let i = 0; i < pixels.length; i += 4 ) {
      const n = i / 4;
      const a = map.pixels[n] = pixels[i + 3];
      if ( a > 0 ) {
        const x = n % map.aw;
        const y = Math.floor(n / map.aw);
        if ( (map.minX === undefined) || (x < map.minX) ) map.minX = x;
        else if ( (map.maxX === undefined) || (x + 1 > map.maxX) ) map.maxX = x + 1;
        if ( (map.minY === undefined) || (y < map.minY) ) map.minY = y;
        else if ( (map.maxY === undefined) || (y + 1 > map.maxY) ) map.maxY = y + 1;
      }
    }

    // Saving the texture data
    canvas.tiles.textureDataMap.set(this.document.texture.src, map);
    return this._textureData;
  }

  /* -------------------------------------------- */

  /**
   * Compute the alpha-based bounding box for the tile, including an angle of rotation.
   * @returns {PIXI.Rectangle}
   * @private
   */
  _getAlphaBounds() {
    const m = this._textureData;
    const r = Math.toRadians(this.document.rotation);
    return PIXI.Rectangle.fromRotation(m.minX, m.minY, m.maxX - m.minX, m.maxY - m.minY, r).normalize();
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data, options={}, userId) {
    const keys = Object.keys(foundry.utils.flattenObject(data));
    const changed = new Set(keys);

    // Re-draw the image
    if ( changed.has("texture.src") ) return this.draw();

    // Prepare texture if change in overhead data
    const overheadChange = changed.has("overhead");
    if ( overheadChange ) this._createTextureData();

    // Update quadtree position
    const positionChange = ["x", "y", "rotation"].some(k => changed.has(k));
    const shapeChange = ["width", "height"].some(k => changed.has(k));
    if ( shapeChange || positionChange ) this.layer.quadtree.update({r: this.bounds, t: this});

    // Refresh the tile display
    this.refresh();

    // Elevation and sorting changes
    if ( overheadChange || changed.has("z") ) {
      this.parent.sortDirty = canvas.primary.sortDirty = true;
    }

    // Refresh tile occlusion
    const occlusionChange = ["overhead", "occlusion.mode"].some(k => changed.has(k));
    const textureChange = overheadChange || changed.has("hidden") || shapeChange || occlusionChange;
    if ( textureChange || (this.isRoof && positionChange) ) this._refreshPerception();

    // Start or Stop Video
    if ( ("video" in data) || ("playVideo" in options) ) {
      const video = game.video.getVideoSource(this.texture);
      if ( video ) {
        const playOptions = this.document.video;
        this.playing = playOptions.playing = options.playVideo ?? playOptions.autoplay;
        playOptions.offset = this.playing ? options.offset : null;
        game.video.play(video, playOptions);
      }
      if ( this.layer.hud.object === this ) this.layer.hud.render();
    }
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /**
   * Update wall states and refresh lighting and vision when a tile becomes a roof, or when an existing roof tile's
   * state changes.
   * @private
   */
  _refreshPerception() {
    canvas.walls.identifyInteriorWalls();
    canvas.perception.update({
      initializeLighting: true,
      initializeVision: true,
      forceUpdateFog: true,
      refreshTiles: true
    }, true);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners() {
    super.activateListeners();
    this.frame.handle.off("mouseover").off("mouseout").off("mousedown")
      .on("mouseover", this._onHandleHoverIn.bind(this))
      .on("mouseout", this._onHandleHoverOut.bind(this))
      .on("mousedown", this._onHandleMouseDown.bind(this));
    this.frame.handle.interactive = true;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _canConfigure(user, event) {
    if ( this.document.locked && !this.controlled ) return false;
    return super._canConfigure(user);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onHoverOut(event) {
    // Force resize handle to normal size
    if ( event.data.handle ) this._onHandleHoverOut(event);
    return super._onHoverOut(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickLeft(event) {
    if ( this._dragHandle ) return;
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
    const {clones, destination, origin} = event.data;
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
  _onDragLeftDrop(event) {
    if ( this._dragHandle ) return this._onHandleDragDrop(event);
    return super._onDragLeftDrop(event);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragStart() {
    super._onDragStart();
    const o = this._original;
    if ( o.mesh ) o.mesh.alpha = o.alpha;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragEnd() {
    super._onDragEnd();
    this._original?.mesh?.refresh();
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
   * @param {PIXI.InteractionEvent} event   The mouseover event
   * @protected
   */
  _onHandleHoverIn(event) {
    const handle = event.target;
    handle.scale.set(1.5, 1.5);
    event.data.handle = event.target;
  }

  /* -------------------------------------------- */

  /**
   * Handle mouse-out event on a control handle
   * @param {PIXI.InteractionEvent} event   The mouseout event
   * @protected
   */
  _onHandleHoverOut(event) {
    const {handle} = event.data;
    handle.scale.set(1.0, 1.0);
  }

  /* -------------------------------------------- */

  /**
   * When we start a drag event - create a preview copy of the Tile for re-positioning
   * @param {PIXI.InteractionEvent} event   The mousedown event
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
   * Handle the beginning of a drag event on a resize handle
   * @param {PIXI.InteractionEvent} event   The mousedown event
   * @protected
   */
  _onHandleDragStart(event) {
    const {handle} = event.data;
    const aw = this.document.width;
    const ah = this.document.height;
    const x0 = this.document.x + (handle.offset[0] * aw);
    const y0 = this.document.y + (handle.offset[1] * ah);
    event.data.origin = {x: x0, y: y0, width: aw, height: ah};
  }

  /* -------------------------------------------- */

  /**
   * Handle mousemove while dragging a tile scale handler
   * @param {PIXI.InteractionEvent} event   The mousemove event
   * @protected
   */
  _onHandleDragMove(event) {
    const {destination, origin, originalEvent} = event.data;

    canvas._onDragCanvasPan(originalEvent);
    const d = this._getResizedDimensions(originalEvent, origin, destination);
    this.document.x = d.x;
    this.document.y = d.y;
    this.document.width = d.width;
    this.document.height = d.height;
    this.document.rotation = 0;

    // Mirror horizontally or vertically
    this.document.texture.scaleX = d.sx;
    this.document.texture.scaleY = d.sy;
    this.refresh();
  }

  /* -------------------------------------------- */

  /**
   * Handle mouseup after dragging a tile scale handler
   * @param {PIXI.InteractionEvent} event   The mouseup event
   * @protected
   */
  _onHandleDragDrop(event) {
    let {destination, origin, originalEvent} = event.data;
    if ( !originalEvent.shiftKey ) {
      destination = canvas.grid.getSnappedPosition(destination.x, destination.y, this.layer.gridPrecision);
    }

    const d = this._getResizedDimensions(originalEvent, origin, destination);
    return this.document.update({
      x: d.x, y: d.y, width: d.width, height: d.height, "texture.scaleX": d.sx, "texture.scaleY": d.sy
    });
  }

  /* -------------------------------------------- */

  /**
   * Get resized Tile dimensions
   * @returns {Rectangle}
   * @private
   */
  _getResizedDimensions(event, origin, destination) {
    const o = this.document._source;

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
   * @protected
   */
  _onHandleDragCancel() {
    this.document.reset();
    this._dragHandle = false;
    this.refresh();
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  get tile() {
    foundry.utils.logCompatibilityWarning("Tile#tile has been renamed to Tile#mesh.", {since: 10, until: 12});
    return this.mesh;
  }
}
