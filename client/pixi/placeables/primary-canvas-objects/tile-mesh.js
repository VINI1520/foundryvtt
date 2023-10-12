/**
 * A SpriteMesh which visualizes a Tile object in the PrimaryCanvasGroup.
 */
class TileMesh extends OccludableObjectMixin(SpriteMesh) {

  /** @inheritDoc */
  refresh() {
    if ( this._destroyed || (this.texture === PIXI.Texture.EMPTY) ) return;
    const {x, y, width, height, alpha, occlusion, hidden} = this.data;
    const {scaleX, scaleY, tint} = this.data.texture;

    // Use the document width explicitly
    this.width = width;
    this.height = height;

    // Apply scale on each axis (a negative scaleX/scaleY is flipping the image on its axis)
    this.scale.x = (width / this.texture.width) * scaleX;
    this.scale.y = (height / this.texture.height) * scaleY;

    // Set opacity and tint
    const normalAlpha = hidden ? Math.min(0.5, alpha) : alpha;
    this.alpha = this.occluded ? Math.min(occlusion.alpha, normalAlpha) : normalAlpha;
    this.tint = Color.from(tint ?? 0xFFFFFF);

    // Compute x/y by taking into account scale and mesh anchor
    const px = x + ((width - this.width) * this.anchor.x) + (this.anchor.x * this.width);
    const py = y + ((height - this.height) * this.anchor.y) + (this.anchor.y * this.height);
    this.setPosition(px, py);

    // Update the texture data for occlusion
    this.updateTextureData();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  setPosition(x, y) {
    const {z, rotation} = this.data;
    this.position.set(x ?? this.data.x, y ?? this.data.y);
    this.angle = rotation;
    this.zIndex = z;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  updateBounds() {
    if ( this.parent !== canvas.primary ) return;

    // Computing the bounds of this PCO and adding it to the primary group quadtree
    const {x, y, rotation} = this.data;
    const aw = Math.abs(this.width);
    const ah = Math.abs(this.height);
    const r = Math.toRadians(rotation);
    const bounds = ((aw === ah) ? new PIXI.Rectangle(x, y, aw, ah) : PIXI.Rectangle.fromRotation(x, y, aw, ah, r));
    canvas.primary.quadtree.update({r: bounds, t: this});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getCanvasDocumentData(data) {
    const dt = super._getCanvasDocumentData(data);
    // Searching for explicit overhead=false, if found, we are considering this PCO as not occludable
    // TODO: to remove when the overhead property will be migrated
    if ( data.overhead === false ) dt.occlusion.mode = CONST.OCCLUSION_MODES.NONE;
    return dt;
  }
}

/* -------------------------------------------- */

/**
 * A special case subclass of PIXI.TilingSprite which is used in cases where the tile texture needs to repeat.
 * This should eventually be refactored in favor of a more generalized TilingMesh.
 * FIXME: Workaround until we have our custom TilingMesh class.
 */
class TileSprite extends OccludableObjectMixin(PIXI.TilingSprite) {
  constructor(...args) {
    super(...args);
    // This is a workaround currently needed for TilingSprite textures due to a presumed upstream PIXI bug
    this.texture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
    this.texture.baseTexture.update();
  }

  // TODO: Temporary, just to avoid error with TilingSprite
  /** @override */
  setShaderClass() {}

  /** @override */
  renderDepthData() {}

  /** @override */
  get isOccludable() { return false; }

  /** @override */
  get shouldRenderDepth() { return false; }

  /** @override */
  set shader(value) {}

  /** @override */
  get shader() {
    return {};
  }
}
Object.defineProperty(TileSprite.prototype, "refresh", Object.getOwnPropertyDescriptor(TileMesh.prototype, "refresh"));
Object.defineProperty(TileSprite.prototype, "setPosition", Object.getOwnPropertyDescriptor(TileMesh.prototype, "setPosition"));
