/**
 * Extension of a PIXI.Mesh, with the capabilities to provide a snapshot of the framebuffer.
 * @extends PIXI.Mesh
 */
class PointSourceMesh extends PIXI.Mesh {
  /**
   * To store the previous blend mode of the last renderer PointSourceMesh.
   * @type {PIXI.BLEND_MODES}
   * @protected
   */
  static _priorBlendMode;

  /**
   * The current texture used by the mesh.
   * @type {PIXI.Texture}
   * @protected
   */
  static _currentTexture;

  /**
   * The transform world ID of the bounds.
   * @type {number}
   */
  _worldID = -1;

  /**
   * The geometry update ID of the bounds.
   * @type {number}
   */
  _updateID = -1;

  /* -------------------------------------------- */
  /*  PointSourceMesh Properties                  */
  /* -------------------------------------------- */

  /** @override */
  get geometry() {
    return super.geometry;
  }

  /** @override */
  set geometry(value) {
    if ( this._geometry !== value ) this._updateID = -1;
    super.geometry = value;
  }

  /* -------------------------------------------- */
  /*  PointSourceMesh Methods                     */
  /* -------------------------------------------- */

  /** @override */
  addChild() {
    throw new Error("You can't add children to a PointSourceMesh.");
  }

  /* ---------------------------------------- */

  /** @override */
  addChildAt() {
    throw new Error("You can't add children to a PointSourceMesh.");
  }

  /* ---------------------------------------- */

  /** @override */
  addChildren() {
    throw new Error("You can't add children to a PointSourceMesh.");
  }

  /* ---------------------------------------- */

  /** @override */
  _render(renderer) {
    if ( this.uniforms.framebufferTexture !== undefined ) {
      if ( canvas.blur.enabled ) {
        // We need to use the snapshot only if blend mode is changing
        const requireUpdate = (this.state.blendMode !== PointSourceMesh._priorBlendMode)
          && (PointSourceMesh._priorBlendMode !== undefined);
        if ( requireUpdate ) PointSourceMesh._currentTexture = canvas.snapshot.getFramebufferTexture(renderer);
        PointSourceMesh._priorBlendMode = this.state.blendMode;
      }
      this.uniforms.framebufferTexture = PointSourceMesh._currentTexture;
    }
    super._render(renderer);
  }

  /* ---------------------------------------- */

  /** @override */
  calculateBounds() {
    const {transform, geometry} = this;

    // Checking bounds id to update only when it is necessary
    if ( this._worldID !== transform._worldID
      || this._updateID !== geometry.buffers[0]._updateID ) {

      this._worldID = transform._worldID;
      this._updateID = geometry.buffers[0]._updateID;

      const {x, y, width, height} = this.geometry.bounds;
      this._bounds.clear();
      this._bounds.addFrame(transform, x, y, x + width, y + height);
    }

    this._bounds.updateID = this._boundsID;
  }

  /* ---------------------------------------- */

  /** @override */
  _calculateBounds() {
    this.calculateBounds();
  }

  /* ---------------------------------------- */

  /**
   * The local bounds need to be drawn from the underlying geometry.
   * @override
   */
  getLocalBounds(rect) {
    rect ??= this._localBoundsRect ??= new PIXI.Rectangle();
    return this.geometry.bounds.copyTo(rect);
  }
}
