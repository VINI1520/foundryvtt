/**
 * A SpriteMesh which visualizes a Token object in the PrimaryCanvasGroup.
 */
class TokenMesh extends OccludableObjectMixin(SpriteMesh) {

  /**
   * Sorting values to deal with ties.
   * @type {number}
   */
  static PRIMARY_SORT_ORDER = 750;

  /**
   * The dimensions of this token mesh grid bounds.
   * @type {PIXI.Rectangle}
   */
  #tokenGridDimensions;

  /* -------------------------------------------- */

  /**
   * @typedef {Object} TokenMeshData
   * @property {boolean} lockRotation       Is this TokenMesh rotation locked?
   */
  static get defaultData() {
    return foundry.utils.mergeObject(super.defaultData, {
      lockRotation: false
    });
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  refresh() {
    if ( this._destroyed || (this.texture === PIXI.Texture.EMPTY) ) return;
    const display = this.getDisplayAttributes();

    // Size the texture
    const rect = this.#tokenGridDimensions = canvas.grid.grid.getRect(display.width, display.height);
    const aspectRatio = this.texture.width / this.texture.height;

    // Ensure that square tokens are scaled consistently on hex grids.
    if ( (aspectRatio === 1) && canvas.grid.isHex ) {
      const minSide = Math.min(rect.width, rect.height);
      display.scaleX = (display.scaleX * minSide) / this.texture.width;
      display.scaleY = (display.scaleY * minSide) / this.texture.height;
    }
    else if ( aspectRatio >= 1 ) {
      display.scaleX *= (rect.width / this.texture.width);
      display.scaleY *= (rect.width / (this.texture.height * aspectRatio));
    } else {
      display.scaleY *= (rect.height / this.texture.height);
      display.scaleX *= ((rect.height * aspectRatio) / this.texture.width);
    }

    // Assign scale and attributes
    this.scale.set(display.scaleX, display.scaleY);
    this.alpha = display.alpha;
    this.tint = display.tint;

    // Compute x/y by taking into account scale and mesh anchor
    const px = display.x + ((rect.width - this.width) * this.anchor.x) + (this.anchor.x * this.width);
    const py = display.y + ((rect.height - this.height) * this.anchor.y) + (this.anchor.y * this.height);
    this.setPosition(px, py);

    // Update the texture data for occlusion
    this.updateTextureData();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  setPosition(x, y) {
    const {z, rotation, lockRotation} = this.data;
    this.position.set(x ?? this.data.x, y ?? this.data.y);
    this.angle = lockRotation ? 0 : rotation;
    this.zIndex = z;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  updateBounds() {
    if ( this.parent !== canvas.primary ) return;
    const {x, y, rotation, lockRotation} = this.data;
    const aw = Math.abs(this.width);
    const ah = Math.abs(this.height);
    const r = Math.toRadians(lockRotation ? 0 : rotation);
    const bounds = PIXI.Rectangle.fromRotation(x, y, aw, ah, r);
    canvas.primary.quadtree.update({r: bounds, t: this});
  }

  /* -------------------------------------------- */

  /** @override */
  _getTextureCoordinate(testX, testY) {
    const {x, y, texture} = this.data;
    const rWidth = this.#tokenGridDimensions.width;
    const rHeight = this.#tokenGridDimensions.height;
    const rotation = this.rotation;

    // Save scale properties
    const sscX = Math.sign(texture.scaleX);
    const sscY = Math.sign(texture.scaleY);
    const ascX = Math.abs(texture.scaleX);
    const ascY = Math.abs(texture.scaleY);

    // Adjusting point by taking scale into account
    testX -= (x - ((rWidth / 2) * sscX * (ascX - 1)));
    testY -= (y - ((rHeight / 2) * sscY * (ascY - 1)));

    // Mirroring the point on the x or y-axis if scale is negative
    if ( sscX < 0 ) testX = (rWidth - testX);
    if ( sscY < 0 ) testY = (rHeight - testY);

    // Account for tile rotation and scale
    if ( rotation !== 0 ) {
      // Anchor is recomputed with scale and document dimensions
      const anchor = {
        x: this.anchor.x * rWidth * ascX,
        y: this.anchor.y * rHeight * ascY
      };
      let r = new Ray(anchor, {x: testX, y: testY});
      r = r.shiftAngle(-rotation * sscX * sscY); // Reverse rotation if scale is negative for just one axis
      testX = r.B.x;
      testY = r.B.y;
    }

    // Convert to texture data coordinates
    testX *= (this._textureData.aw / this.width);
    testY *= (this._textureData.ah / this.height);
    return {x: testX, y: testY};
  }

  /* -------------------------------------------- */

  /**
   * @typedef {object} TokenMeshDisplayAttributes
   * @property {number} x
   * @property {number} y
   * @property {number} width
   * @property {number} height
   * @property {number} alpha
   * @property {number} rotation
   * @property {number} scaleX
   * @property {number} scaleY
   * @property {Color} tint
   */

  /**
   * Get the attributes for this TokenMesh which configure the display of this TokenMesh and are compatible
   * with CanvasAnimation.
   * @returns {TokenMeshDisplayAttributes}
   */
  getDisplayAttributes() {
    const {x, y, width, height, alpha, rotation, texture} = this.data;
    const {scaleX, scaleY} = texture;
    return {x, y, width, height, alpha, rotation, scaleX, scaleY, tint: texture.tint ?? 0xFFFFFF};
  }
}
